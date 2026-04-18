const fs = require('fs');
const path = require('path');
const multer = require('multer');
const express = require('express');
const router = express.Router();
const Case = require('../models/Case');
const UpdateCase = require('../models/UpdateCase');
const { authRequired, requireRole, requireCommissioner } = require('../middleware/auth');
const {
    normalizeCasePeoplePayload,
    serializeCaseForClient,
    serializeCasesForClient,
    buildPeopleSearchOr,
    buildCaseForAllSearchOr,
} = require('../utils/people');
const { validateCaseDateNotFuture } = require('../utils/caseDate');
const { parsePagination, setPaginationHeaders } = require('../utils/pagination');
const caseListProjection = '-evidence -__v';
const CITIZEN_REVIEW_STATUS = {
    INSPECTOR_REVIEW: 'INSPECTOR_REVIEW',
    INSPECTOR_ACCEPTED: 'INSPECTOR_ACCEPTED',
    FAKE: 'FAKE',
    COMMISSIONER_REVIEW: 'COMMISSIONER_REVIEW',
    COMMISSIONER_APPROVED: 'COMMISSIONER_APPROVED',
    COMMISSIONER_REJECTED: 'COMMISSIONER_REJECTED',
};
const COMMISSIONER_VISIBLE_CITIZEN_STATUSES = new Set([
    CITIZEN_REVIEW_STATUS.COMMISSIONER_REVIEW,
    CITIZEN_REVIEW_STATUS.COMMISSIONER_APPROVED,
    CITIZEN_REVIEW_STATUS.COMMISSIONER_REJECTED,
]);

const isCitizenCaseVisibleToCommissioner = (caseItem) => {
    if (!caseItem || String(caseItem.submitted_by_role || '').trim().toLowerCase() !== 'citizen') {
        return true;
    }

    const reviewStatus = String(caseItem.citizen_review_status || '')
        .trim()
        .toUpperCase();
    if (COMMISSIONER_VISIBLE_CITIZEN_STATUSES.has(reviewStatus)) {
        return true;
    }

    return !reviewStatus && (Boolean(caseItem.isApproved) || Boolean(caseItem.is_removed));
};

const evidenceDir = path.join(__dirname, '..', 'uploads', 'evidence');
fs.mkdirSync(evidenceDir, { recursive: true });

const uploadEvidence = multer({
    storage: multer.diskStorage({
        destination: (_req, _file, cb) => cb(null, evidenceDir),
        filename: (_req, file, cb) => {
            const ext = path.extname(file.originalname || '').toLowerCase();
            const safeExt = ext || '.bin';
            cb(null, `${Date.now()}-${Math.round(Math.random() * 1e9)}${safeExt}`);
        },
    }),
    fileFilter: (_req, file, cb) => {
        const type = String(file.mimetype || '').toLowerCase();
        if (type.startsWith('image/') || type.startsWith('video/')) {
            return cb(null, true);
        }
        return cb(new Error('Only image or video files are allowed for evidence uploads.'));
    },
    limits: { fileSize: Number(process.env.EVIDENCE_MAX_FILE_BYTES || 15 * 1024 * 1024) },
});

const normalizeChangesDone = (value) => {
    if (Array.isArray(value)) {
        return value.map((item) => String(item ?? '').trim()).filter(Boolean);
    }
    if (typeof value === 'string') {
        const trimmed = value.trim();
        return trimmed ? [trimmed] : [];
    }
    return [];
};

const normalizeListText = (text) =>
    String(text || '')
        .split(',')
        .map((entry) => entry.trim())
        .filter(Boolean);

const normalizeText = (value) => String(value || '').trim();

const toPeopleFromText = (text) => normalizeListText(text).map((name) => ({ name, age: null }));

const parseJsonArrayField = (rawValue, fieldLabel) => {
    if (rawValue === undefined || rawValue === null) return null;
    if (Array.isArray(rawValue)) return rawValue;

    const rawText = String(rawValue).trim();
    if (!rawText) return null;

    let parsed;
    try {
        parsed = JSON.parse(rawText);
    } catch {
        throw new Error(`${fieldLabel} payload is invalid.`);
    }

    if (!Array.isArray(parsed)) {
        throw new Error(`${fieldLabel} payload must be an array.`);
    }

    return parsed;
};

const toPeopleFromJsonField = (rawValue, fieldLabel) => {
    const parsed = parseJsonArrayField(rawValue, fieldLabel);
    if (parsed === null) return null;

    const people = [];
    for (const entry of parsed) {
        if (!entry || typeof entry !== 'object') continue;
        const name = String(entry.name || '').trim();
        if (!name) continue;

        const ageRaw = entry.age;
        if (ageRaw === null || ageRaw === undefined || ageRaw === '') {
            people.push({ name, age: null });
            continue;
        }

        const ageNum = Number(ageRaw);
        if (!Number.isFinite(ageNum) || ageNum < 0 || ageNum > 120) {
            throw new Error(`Each ${fieldLabel} age must be between 0 and 120.`);
        }

        people.push({ name, age: Math.trunc(ageNum) });
    }

    return people;
};

const parseChangesDoneJsonField = (rawValue) => {
    const parsed = parseJsonArrayField(rawValue, 'changes_done');
    if (parsed === null) return null;
    return parsed.map((item) => normalizeText(item)).filter(Boolean);
};

const normalizeCaseBodyFromRequest = (req) => {
    const body = { ...(req.body || {}) };

    const suspectsFromJson = toPeopleFromJsonField(body.suspects_json, 'suspects');
    const victimsFromJson = toPeopleFromJsonField(body.victim_json, 'victim');
    const guiltyFromJson = toPeopleFromJsonField(body.guilty_name_json, 'guilty_name');
    const changesDoneFromJson = parseChangesDoneJsonField(body.changes_done_json);

    if (suspectsFromJson !== null) body.suspects = suspectsFromJson;
    if (victimsFromJson !== null) body.victim = victimsFromJson;
    if (guiltyFromJson !== null) body.guilty_name = guiltyFromJson;
    if (changesDoneFromJson !== null) body.changes_done = changesDoneFromJson;

    return normalizeCasePeoplePayload(body);
};

const parseExistingEvidence = (rawValue) => {
    const parsed = parseJsonArrayField(rawValue, 'existing evidence');
    if (parsed === null) return [];

    return parsed
        .map((entry) => {
            if (!entry || typeof entry !== 'object') return null;

            const evidence_name = normalizeText(entry.evidence_name || entry.name);
            const evidence_file_url = normalizeText(entry.evidence_file_url || entry.url);
            const evidence_file_type = normalizeText(
                entry.evidence_file_type || entry.fileType || entry.mimetype || 'application/octet-stream'
            ).toLowerCase();

            if (!evidence_name || !evidence_file_url) return null;
            if (!/^\/uploads\/evidence\//i.test(evidence_file_url) && !/^https?:\/\//i.test(evidence_file_url)) {
                return null;
            }

            return { evidence_name, evidence_file_url, evidence_file_type };
        })
        .filter(Boolean);
};

const buildEvidencePayload = (req, options = {}) => {
    const existingEvidence = options.includeExisting ? parseExistingEvidence(req.body?.existing_evidence_json) : [];
    const namesRaw = req.body?.evidence_names;
    const evidenceNames = Array.isArray(namesRaw)
        ? namesRaw.map((item) => String(item || '').trim())
        : typeof namesRaw === 'string'
        ? [namesRaw.trim()]
        : [];
    const files = Array.isArray(req.files) ? req.files : [];
    const uploadedEvidence = files
        .map((file, index) => ({
            evidence_name: evidenceNames[index] || `Evidence ${index + 1}`,
            evidence_file_url: `/uploads/evidence/${file.filename}`,
            evidence_file_type: file.mimetype || 'application/octet-stream',
        }))
        .filter((evidence) => evidence.evidence_name);

    return [...existingEvidence, ...uploadedEvidence];
};

const citizenCanManageStatuses = new Set([
    CITIZEN_REVIEW_STATUS.INSPECTOR_REVIEW,
    CITIZEN_REVIEW_STATUS.COMMISSIONER_REVIEW,
]);

const isCitizenOwner = (caseItem, userId) =>
    String(caseItem?.submitted_by_role || '').trim().toLowerCase() === 'citizen' &&
    String(caseItem?.submitted_by_user || '') === String(userId || '');

const canCitizenSelfManageCase = (caseItem, userId) => {
    if (!caseItem || !isCitizenOwner(caseItem, userId)) return false;
    if (caseItem.withdrawn_by_citizen) return false;
    if (caseItem.is_removed && !caseItem.withdrawn_by_citizen) return false;

    const reviewStatus = String(caseItem.citizen_review_status || '')
        .trim()
        .toUpperCase();
    if (!reviewStatus) {
        return !caseItem.isApproved && !caseItem.is_removed;
    }

    return citizenCanManageStatuses.has(reviewStatus);
};

// List approved non-removed cases with optional search
router.get('/', async (req, res) => {
    const { field, query } = req.query;
    const searchFilter = { isApproved: true, is_removed: { $ne: true } };

    if (query && field) {
        if (field === 'for-all') {
            searchFilter.$or = buildCaseForAllSearchOr(query);
        } else if (field === 'status') {
            searchFilter.status = String(query).toUpperCase();
        } else if (field === 'case_date') {
            const searchDate = new Date(query);
            const nextDay = new Date(searchDate);
            nextDay.setDate(nextDay.getDate() + 1);
            searchFilter.case_date = {
                $gte: searchDate,
                $lt: nextDay,
            };
        } else if (['suspects', 'victim', 'guilty_name'].includes(String(field))) {
            searchFilter.$or = buildPeopleSearchOr(String(field), query);
        } else {
            searchFilter[String(field)] = { $regex: query, $options: 'i' };
        }
    }

    try {
        const pagination = parsePagination(req.query);
        const cases = await Case.find(searchFilter)
            .select(caseListProjection)
            .sort({ case_date: -1 })
            .skip(pagination.skip)
            .limit(pagination.limit)
            .lean();
        setPaginationHeaders(res, pagination);
        return res.json(serializeCasesForClient(cases));
    } catch (err) {
        return res.status(500).send('Server Error');
    }
});

// Citizen/public completed cases
router.get('/completed', async (req, res) => {
    try {
        const pagination = parsePagination(req.query);
        const cases = await Case.find({
            isApproved: true,
            status: 'CLOSE',
            is_removed: { $ne: true },
        })
            .select(caseListProjection)
            .sort({ case_date: -1 })
            .skip(pagination.skip)
            .limit(pagination.limit)
            .lean();
        setPaginationHeaders(res, pagination);
        return res.json(serializeCasesForClient(cases));
    } catch (err) {
        return res.status(500).send('Server Error');
    }
});

// Inspector/commissioner assigned cases
router.get('/me/assigned', authRequired, requireRole('inspector', 'commissioner'), async (req, res) => {
    try {
        const handler = req.user.fullname;
        const pagination = parsePagination(req.query);
        const cases = await Case.find({
            case_handler: handler,
            isApproved: true,
            is_removed: { $ne: true },
        })
            .select(caseListProjection)
            .sort({ case_date: -1 })
            .skip(pagination.skip)
            .limit(pagination.limit)
            .lean();
        setPaginationHeaders(res, pagination);
        return res.json(serializeCasesForClient(cases));
    } catch (err) {
        console.error(err.message);
        return res.status(500).send('Server Error');
    }
});

// Inspector queue: citizen-submitted cases assigned for initial screening
router.get(
    '/inspector/citizen-submissions',
    authRequired,
    requireRole('inspector'),
    async (req, res) => {
        try {
            const pagination = parsePagination(req.query);
            const cases = await Case.find({
                submitted_by_role: 'citizen',
                is_removed: { $ne: true },
                $or: [
                    { citizen_review_status: CITIZEN_REVIEW_STATUS.INSPECTOR_REVIEW },
                    { citizen_review_status: { $exists: false } },
                    { citizen_review_status: null },
                    { citizen_review_status: '' },
                ],
            })
                .populate('submitted_by_user', 'fullname email role')
                .select(caseListProjection)
                .sort({ createdAt: -1 })
                .skip(pagination.skip)
                .limit(pagination.limit)
                .lean();
            setPaginationHeaders(res, pagination);
            return res.json(serializeCasesForClient(cases));
        } catch (err) {
            console.error(err.message);
            return res.status(500).send('Server Error');
        }
    }
);

const updateInspectorCitizenSubmission = (nextStatus, successMsg) => async (req, res) => {
    try {
        const inspectorId = req.user?.id || null;
        const inspectorName = String(req.user?.fullname || '').trim();
        const caseItem = await Case.findOneAndUpdate(
            {
                _id: req.params.id,
                submitted_by_role: 'citizen',
                citizen_review_status: CITIZEN_REVIEW_STATUS.INSPECTOR_REVIEW,
                is_removed: { $ne: true },
            },
            {
                $set: {
                    citizen_review_status: nextStatus,
                    citizen_review_by_inspector_id: inspectorId,
                    citizen_review_by_inspector_name: inspectorName,
                    case_handler: inspectorName || 'INSPECTOR REVIEW POOL',
                    updated_on: new Date(),
                },
            },
            { new: true }
        );

        if (!caseItem) {
            return res.status(404).json({ msg: 'Case not found in inspector review queue.' });
        }

        return res.json({ msg: successMsg, case: serializeCaseForClient(caseItem) });
    } catch (err) {
        console.error(err.message);
        return res.status(500).send('Server Error');
    }
};

router.put(
    '/inspector/citizen-submissions/:id/mark-fake',
    authRequired,
    requireRole('inspector'),
    updateInspectorCitizenSubmission(CITIZEN_REVIEW_STATUS.FAKE, 'Citizen case marked as fake.')
);

router.put(
    '/inspector/citizen-submissions/:id/send-commissioner-review',
    authRequired,
    requireRole('inspector'),
    updateInspectorCitizenSubmission(
        CITIZEN_REVIEW_STATUS.COMMISSIONER_REVIEW,
        'Citizen case forwarded to commissioner for review.'
    )
);

router.put(
    '/inspector/citizen-submissions/:id/add-as-case',
    authRequired,
    requireRole('inspector'),
    uploadEvidence.array('evidence_files', 10),
    async (req, res) => {
        try {
            const inspectorId = req.user?.id || null;
            const inspectorName = String(req.user?.fullname || '').trim();
            const hasPayload =
                (req.body && Object.keys(req.body).length > 0) || (Array.isArray(req.files) && req.files.length > 0);
            let normalizedBody = {};
            if (hasPayload) {
                normalizedBody = normalizeCaseBodyFromRequest(req);
                const caseDateError = validateCaseDateNotFuture(normalizedBody.case_date);
                if (caseDateError) {
                    return res.status(400).json({ msg: caseDateError });
                }
            }

            const updateFields = {
                citizen_review_status: CITIZEN_REVIEW_STATUS.INSPECTOR_ACCEPTED,
                citizen_review_by_inspector_id: inspectorId,
                citizen_review_by_inspector_name: inspectorName,
                case_handler: inspectorName || 'INSPECTOR REVIEW POOL',
                assigned_inspector_id: inspectorId,
                isApproved: true,
                updated_on: new Date(),
            };

            if (hasPayload) {
                if (normalizedBody.case_title !== undefined) updateFields.case_title = normalizedBody.case_title;
                if (normalizedBody.case_type !== undefined) updateFields.case_type = normalizedBody.case_type;
                if (normalizedBody.case_description !== undefined)
                    updateFields.case_description = normalizedBody.case_description;
                if (normalizedBody.case_date !== undefined) updateFields.case_date = normalizedBody.case_date;
                if (normalizedBody.status !== undefined) updateFields.status = normalizedBody.status;
                if (normalizedBody.case_handler !== undefined)
                    updateFields.case_handler = normalizedBody.case_handler || updateFields.case_handler;
                if (Object.prototype.hasOwnProperty.call(normalizedBody, 'suspects'))
                    updateFields.suspects = normalizedBody.suspects;
                if (Object.prototype.hasOwnProperty.call(normalizedBody, 'victim'))
                    updateFields.victim = normalizedBody.victim;
                if (Object.prototype.hasOwnProperty.call(normalizedBody, 'guilty_name'))
                    updateFields.guilty_name = normalizedBody.guilty_name;

                const evidencePayload = buildEvidencePayload(req, { includeExisting: true });
                if (evidencePayload.length || req.body?.existing_evidence_json || (req.files || []).length) {
                    updateFields.evidence = evidencePayload;
                }
            }

            const caseItem = await Case.findOneAndUpdate(
                {
                    _id: req.params.id,
                    submitted_by_role: 'citizen',
                    citizen_review_status: CITIZEN_REVIEW_STATUS.INSPECTOR_REVIEW,
                    is_removed: { $ne: true },
                },
                { $set: updateFields },
                { new: true }
            );

            if (!caseItem) {
                return res.status(404).json({ msg: 'Case not found in inspector review queue.' });
            }

            return res.json({
                msg: 'Citizen case added as an active case.',
                case: serializeCaseForClient(caseItem),
            });
        } catch (err) {
            console.error(err.message);
            return res.status(500).send('Server Error');
        }
    }
);

// Citizen status page: only own submissions
router.get('/citizen/status', authRequired, requireRole('citizen'), async (req, res) => {
    try {
        const pagination = parsePagination(req.query);
        const cases = await Case.find({
            submitted_by_user: req.user.id,
            submitted_by_role: 'citizen',
        })
            .select(caseListProjection)
            .sort({ createdAt: -1 })
            .skip(pagination.skip)
            .limit(pagination.limit)
            .lean();
        setPaginationHeaders(res, pagination);
        return res.json(serializeCasesForClient(cases));
    } catch (err) {
        console.error(err.message);
        return res.status(500).send('Server Error');
    }
});

// Citizen case submission with evidence uploads
router.post(
    '/citizen-submit',
    authRequired,
    requireRole('citizen'),
    uploadEvidence.array('evidence_files', 10),
    async (req, res) => {
        try {
            const caseType = normalizeText(req.body?.case_type);
            const caseDescription = normalizeText(req.body?.case_description);
            const caseDate = normalizeText(req.body?.case_date);
            const suspectText = normalizeText(req.body?.suspect);
            const victimText = normalizeText(req.body?.victim);
            const normalizedBody = normalizeCaseBodyFromRequest(req);

            if (!caseType) {
                return res.status(400).json({ msg: 'Case type is required.' });
            }
            if (!caseDescription || caseDescription.length < 20) {
                return res.status(400).json({ msg: 'Case description must be at least 20 characters.' });
            }
            if (!caseDate) {
                return res.status(400).json({ msg: 'Case date is required.' });
            }
            const caseDateError = validateCaseDateNotFuture(caseDate);
            if (caseDateError) {
                return res.status(400).json({ msg: caseDateError });
            }

            const evidence = buildEvidencePayload(req);

            const newCase = new Case({
                case_title: `${caseType} - Citizen Submission`,
                case_type: caseType,
                case_description: caseDescription,
                case_date: new Date(caseDate),
                status: 'ACTIVE',
                case_handler: 'INSPECTOR REVIEW POOL',
                suspects: normalizedBody.suspects || toPeopleFromText(suspectText),
                victim: normalizedBody.victim || toPeopleFromText(victimText),
                guilty_name: [],
                evidence,
                submitted_by_user: req.user.id,
                submitted_by_role: 'citizen',
                citizen_review_status: CITIZEN_REVIEW_STATUS.INSPECTOR_REVIEW,
                citizen_review_by_inspector_id: null,
                citizen_review_by_inspector_name: '',
                isApproved: false,
            });

            await newCase.save();
            return res.status(201).json({
                msg: 'Citizen case submitted successfully.',
                case: serializeCaseForClient(newCase),
            });
        } catch (err) {
            console.error('Error submitting citizen case:', err.message);
            return res.status(500).json({ msg: err.message || 'Server Error' });
        }
    }
);

router.get('/citizen/:id', authRequired, requireRole('citizen'), async (req, res) => {
    try {
        const caseItem = await Case.findOne({
            _id: req.params.id,
            submitted_by_user: req.user.id,
            submitted_by_role: 'citizen',
        }).lean();

        if (!caseItem) {
            return res.status(404).json({ msg: 'Case not found.' });
        }

        return res.json(serializeCaseForClient(caseItem));
    } catch (err) {
        console.error(err.message);
        return res.status(500).json({ msg: err.message || 'Server Error' });
    }
});

router.put(
    '/citizen/:id',
    authRequired,
    requireRole('citizen'),
    uploadEvidence.array('evidence_files', 10),
    async (req, res) => {
        try {
            const caseItem = await Case.findOne({
                _id: req.params.id,
                submitted_by_user: req.user.id,
                submitted_by_role: 'citizen',
            });

            if (!caseItem) {
                return res.status(404).json({ msg: 'Case not found.' });
            }
            if (!canCitizenSelfManageCase(caseItem, req.user.id)) {
                return res.status(409).json({ msg: 'This case can no longer be edited.' });
            }

            const normalizedBody = normalizeCaseBodyFromRequest(req);
            const caseType = normalizeText(normalizedBody.case_type);
            const caseDescription = normalizeText(normalizedBody.case_description);
            const caseDate = normalizeText(normalizedBody.case_date);

            if (!caseType) {
                return res.status(400).json({ msg: 'Case type is required.' });
            }
            if (!caseDescription || caseDescription.length < 20) {
                return res.status(400).json({ msg: 'Case description must be at least 20 characters.' });
            }
            if (!caseDate) {
                return res.status(400).json({ msg: 'Case date is required.' });
            }

            const caseDateError = validateCaseDateNotFuture(caseDate);
            if (caseDateError) {
                return res.status(400).json({ msg: caseDateError });
            }

            const currentReviewStatus = String(caseItem.citizen_review_status || '')
                .trim()
                .toUpperCase();
            const nextReviewStatus =
                currentReviewStatus === CITIZEN_REVIEW_STATUS.COMMISSIONER_REVIEW
                    ? CITIZEN_REVIEW_STATUS.INSPECTOR_REVIEW
                    : currentReviewStatus || CITIZEN_REVIEW_STATUS.INSPECTOR_REVIEW;

            caseItem.case_title = `${caseType} - Citizen Submission`;
            caseItem.case_type = caseType;
            caseItem.case_description = caseDescription;
            caseItem.case_date = new Date(caseDate);
            caseItem.status = 'ACTIVE';
            caseItem.case_handler =
                nextReviewStatus === CITIZEN_REVIEW_STATUS.INSPECTOR_REVIEW
                    ? 'INSPECTOR REVIEW POOL'
                    : caseItem.case_handler || 'INSPECTOR REVIEW POOL';
            caseItem.suspects = normalizedBody.suspects || [];
            caseItem.victim = normalizedBody.victim || [];
            caseItem.evidence = buildEvidencePayload(req, { includeExisting: true });
            caseItem.is_removed = false;
            caseItem.withdrawn_by_citizen = false;
            caseItem.withdrawn_at = null;
            caseItem.updated_on = new Date();
            caseItem.citizen_review_status = nextReviewStatus;
            if (nextReviewStatus === CITIZEN_REVIEW_STATUS.INSPECTOR_REVIEW) {
                caseItem.citizen_review_by_inspector_id = null;
                caseItem.citizen_review_by_inspector_name = '';
            }

            await caseItem.save();
            return res.json({
                msg: 'Citizen case updated successfully.',
                case: serializeCaseForClient(caseItem),
            });
        } catch (err) {
            console.error(err.message);
            return res.status(500).json({ msg: err.message || 'Server Error' });
        }
    }
);

router.delete('/citizen/:id', authRequired, requireRole('citizen'), async (req, res) => {
    try {
        const caseItem = await Case.findOne({
            _id: req.params.id,
            submitted_by_user: req.user.id,
            submitted_by_role: 'citizen',
        });

        if (!caseItem) {
            return res.status(404).json({ msg: 'Case not found.' });
        }
        if (!canCitizenSelfManageCase(caseItem, req.user.id)) {
            return res.status(409).json({ msg: 'This case can no longer be withdrawn.' });
        }

        caseItem.is_removed = true;
        caseItem.withdrawn_by_citizen = true;
        caseItem.withdrawn_at = new Date();
        caseItem.updated_on = new Date();
        await caseItem.save();

        return res.json({ msg: 'Case withdrawn successfully.' });
    } catch (err) {
        console.error(err.message);
        return res.status(500).json({ msg: err.message || 'Server Error' });
    }
});

// Get a single case by id
router.get('/:id', authRequired, async (req, res) => {
    try {
        const caseItem = await Case.findById(req.params.id)
            .populate('submitted_by_user', 'fullname email role')
            .lean();
        if (!caseItem) return res.status(404).json({ msg: 'Case not found' });
        if (caseItem.is_removed && !isCitizenOwner(caseItem, req.user?.id) && !req.user?.isAdmin) {
            return res.status(404).json({ msg: 'Case not found' });
        }
        if ((req.user?.role === 'commissioner' || req.user?.isAdmin) && !isCitizenCaseVisibleToCommissioner(caseItem)) {
            return res.status(404).json({ msg: 'Case not found' });
        }
        return res.json(serializeCaseForClient(caseItem));
    } catch (err) {
        return res.status(500).send('Server Error');
    }
});

// Create case (inspector/commissioner)
router.post(
    '/',
    authRequired,
    requireRole('inspector', 'commissioner'),
    uploadEvidence.array('evidence_files', 10),
    async (req, res) => {
    try {
        const normalizedBody = normalizeCaseBodyFromRequest(req);
        const caseDateError = validateCaseDateNotFuture(normalizedBody.case_date);
        if (caseDateError) {
            return res.status(400).json({ msg: caseDateError });
        }

        const role = req.user.role || 'inspector';
        const newCase = new Case({
            ...normalizedBody,
            case_handler:
                role === 'inspector'
                    ? req.user.fullname || normalizedBody.case_handler
                    : normalizedBody.case_handler,
            submitted_by_user: req.user.id,
            submitted_by_role: role,
            isApproved: role === 'commissioner',
            evidence: buildEvidencePayload(req, { includeExisting: true }),
        });
        await newCase.save();
        return res.status(201).json(serializeCaseForClient(newCase));
    } catch (err) {
        console.error('Error creating case:', err.message);
        return res.status(500).json({ msg: 'Server Error', error: err.message });
    }
});

// Submit case update request (inspector/commissioner)
router.post(
    '/request-update',
    authRequired,
    requireRole('inspector', 'commissioner'),
    uploadEvidence.array('evidence_files', 10),
    async (req, res) => {
    try {
        const normalizedBody = normalizeCaseBodyFromRequest(req);
        const caseDateError = validateCaseDateNotFuture(normalizedBody.case_date);
        if (caseDateError) {
            return res.status(400).json({ msg: caseDateError });
        }
        const changesDone = normalizeChangesDone(normalizedBody.changes_done);
        if (!changesDone.length) {
            return res
                .status(400)
                .json({ msg: 'Add at least one change, and do not leave any change entry blank.' });
        }

        const updateRequest = new UpdateCase({
            ...normalizedBody,
            changes_done: changesDone,
            evidence: buildEvidencePayload(req, { includeExisting: true }),
            requestedAt: new Date(),
        });
        await updateRequest.save();
        return res
            .status(201)
            .json({ msg: 'Update request submitted successfully. It will be reviewed by commissioner.' });
    } catch (err) {
        console.error('Error submitting update request:', err.message);
        return res.status(500).json({ msg: 'Server Error', error: err.message });
    }
});

// Commissioner updates case directly
router.put('/:id', authRequired, requireCommissioner, uploadEvidence.array('evidence_files', 10), async (req, res) => {
    try {
        const normalizedBody = normalizeCaseBodyFromRequest(req);
        const caseDateError = validateCaseDateNotFuture(normalizedBody.case_date);
        if (caseDateError) {
            return res.status(400).json({ msg: caseDateError });
        }
        const changesDone = normalizeChangesDone(normalizedBody.changes_done);
        if (!changesDone.length) {
            return res
                .status(400)
                .json({ msg: 'Add at least one change, and do not leave any change entry blank.' });
        }
        const caseItem = await Case.findOneAndUpdate(
            { _id: req.params.id, is_removed: { $ne: true } },
            {
                $set: {
                    ...normalizedBody,
                    changes_done: changesDone,
                    evidence: buildEvidencePayload(req, { includeExisting: true }),
                    updated_on: new Date(),
                },
            },
            { new: true }
        );
        if (!caseItem) return res.status(404).json({ msg: 'Case not found' });
        return res.json(serializeCaseForClient(caseItem));
    } catch (err) {
        console.error(err.message);
        return res.status(500).send('Server Error');
    }
});

// Commissioner soft-delete
router.delete('/:id', authRequired, requireCommissioner, async (req, res) => {
    try {
        const result = await Case.findByIdAndUpdate(
            req.params.id,
            { $set: { is_removed: true } },
            { new: true, strict: false }
        );
        if (!result) return res.status(404).json({ msg: 'Case not found' });
        return res.json({ msg: 'Case marked as removed successfully' });
    } catch (err) {
        console.error(err.message);
        return res.status(500).send('Server Error');
    }
});

// Commissioner restore
router.put('/:id/restore', authRequired, requireCommissioner, async (req, res) => {
    try {
        const result = await Case.findByIdAndUpdate(
            req.params.id,
            { $set: { is_removed: false } },
            { new: true, strict: false }
        );
        if (!result) return res.status(404).json({ msg: 'Case not found' });
        return res.json({ msg: 'Case restored successfully' });
    } catch (err) {
        console.error(err.message);
        return res.status(500).send('Server Error');
    }
});

module.exports = router;
