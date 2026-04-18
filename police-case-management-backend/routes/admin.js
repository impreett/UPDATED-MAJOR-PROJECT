const fs = require('fs');
const path = require('path');
const multer = require('multer');
const express = require('express');
const router = express.Router();
const User = require('../models/User');
const Case = require('../models/Case');
const Fine = require('../models/Fine');
const UpdateCase = require('../models/UpdateCase');
const InspectorComplaint = require('../models/InspectorComplaint');
const { authRequired, requireCommissioner } = require('../middleware/auth');
const {
    normalizeCasePeoplePayload,
    serializeCaseForClient,
    serializeCasesForClient,
    formatPeopleField,
    buildPeopleSearchOr,
    buildCaseForAllSearchOr,
} = require('../utils/people');
const { validateCaseDateNotFuture } = require('../utils/caseDate');
const { parsePagination, setPaginationHeaders } = require('../utils/pagination');
const { sendCaseAssignmentEmail } = require('../utils/sendCaseAssignmentEmail');
const { sendFineEmail } = require('../utils/sendFineEmail');

const commissionerAuth = [authRequired, requireCommissioner];
const inspectorRoleFilter = { $or: [{ role: 'inspector' }, { role: { $exists: false }, isAdmin: false }] };
const activeInspectorFilter = {
    ...inspectorRoleFilter,
    isEmailVerified: true,
    isSuspended: { $ne: true },
};
const inspectorListProjection = 'fullname email contact city police_id role isEmailVerified isSuspended createdAt';
const caseListProjection = '-evidence -__v';
const CITIZEN_REVIEW_STATUS = {
    INSPECTOR_REVIEW: 'INSPECTOR_REVIEW',
    INSPECTOR_ACCEPTED: 'INSPECTOR_ACCEPTED',
    FAKE: 'FAKE',
    COMMISSIONER_REVIEW: 'COMMISSIONER_REVIEW',
    COMMISSIONER_APPROVED: 'COMMISSIONER_APPROVED',
    COMMISSIONER_REJECTED: 'COMMISSIONER_REJECTED',
};
const COMMISSIONER_VISIBLE_CITIZEN_STATUSES = [
    CITIZEN_REVIEW_STATUS.COMMISSIONER_REVIEW,
    CITIZEN_REVIEW_STATUS.COMMISSIONER_APPROVED,
    CITIZEN_REVIEW_STATUS.COMMISSIONER_REJECTED,
];
const commissionerVisibleCaseScope = {
    $or: [
        { submitted_by_role: { $ne: 'citizen' } },
        { citizen_review_status: { $in: COMMISSIONER_VISIBLE_CITIZEN_STATUSES } },
        { submitted_by_role: 'citizen', citizen_review_status: { $exists: false }, isApproved: true },
        { submitted_by_role: 'citizen', citizen_review_status: { $exists: false }, is_removed: true },
    ],
};

const buildCommissionerCaseFilter = (...filters) => ({
    $and: [...filters.filter(Boolean), commissionerVisibleCaseScope],
});

const commissionerCitizenDecisionError = (caseItem) => {
    if (!caseItem || caseItem.submitted_by_role !== 'citizen') {
        return '';
    }

    const reviewStatus = String(caseItem.citizen_review_status || '')
        .trim()
        .toUpperCase();

    if (reviewStatus === CITIZEN_REVIEW_STATUS.COMMISSIONER_REVIEW) {
        return '';
    }
    if (reviewStatus === CITIZEN_REVIEW_STATUS.INSPECTOR_REVIEW || !reviewStatus) {
        return 'Citizen case is still in inspector review.';
    }
    if (reviewStatus === CITIZEN_REVIEW_STATUS.INSPECTOR_ACCEPTED) {
        return 'Citizen case is already being handled by an inspector.';
    }
    if (reviewStatus === CITIZEN_REVIEW_STATUS.FAKE) {
        return 'Citizen case was marked as fake by inspector.';
    }
    if (reviewStatus === CITIZEN_REVIEW_STATUS.COMMISSIONER_APPROVED) {
        return 'Citizen case is already approved.';
    }
    if (reviewStatus === CITIZEN_REVIEW_STATUS.COMMISSIONER_REJECTED) {
        return 'Citizen case is already rejected.';
    }

    return 'Citizen case is not ready for commissioner review.';
};

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

const normalizeText = (value) => String(value || '').trim();

const isValidEmail = (value) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || '').trim());

const evidenceDir = path.join(__dirname, '..', 'uploads', 'evidence');
fs.mkdirSync(evidenceDir, { recursive: true });

const uploadEvidence = multer({
    storage: multer.diskStorage({
        destination: (_req, _file, cb) => cb(null, evidenceDir),
        filename: (_req, file, cb) => {
            const ext = path.extname(file.originalname || '').toLowerCase() || '.bin';
            cb(null, `${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`);
        },
    }),
    fileFilter: (_req, file, cb) => {
        const type = String(file.mimetype || '').toLowerCase();
        if (type.startsWith('image/') || type.startsWith('video/')) {
            return cb(null, true);
        }
        return cb(new Error('Only image or video files are allowed as evidence.'));
    },
    limits: { fileSize: Number(process.env.EVIDENCE_MAX_FILE_BYTES || 15 * 1024 * 1024) },
});

const parseEvidenceNames = (rawValue) => {
    if (rawValue === undefined || rawValue === null) return [];
    if (Array.isArray(rawValue)) return rawValue.map(normalizeText);
    const text = String(rawValue).trim();
    return text ? [text] : [];
};

const buildEvidencePayload = (req) => {
    const evidenceNames = parseEvidenceNames(req.body?.evidence_names);
    const files = Array.isArray(req.files) ? req.files : [];

    if (!evidenceNames.length && !files.length) {
        return [];
    }

    if (files.length && (!evidenceNames.length || evidenceNames.slice(0, files.length).some((name) => !name))) {
        throw new Error('Evidence name is required.');
    }

    if (!files.length && evidenceNames.length) {
        throw new Error('Evidence file is required.');
    }

    return files.map((file, index) => ({
        evidence_name: evidenceNames[index] || `Evidence ${index + 1}`,
        evidence_file_url: `/uploads/evidence/${file.filename}`,
        evidence_file_type: file.mimetype || 'application/octet-stream',
    }));
};

// Inspector management
router.get('/suspended-inspectors', ...commissionerAuth, async (_req, res) => {
    try {
        const pagination = parsePagination(_req.query);
        const users = await User.find({
            ...inspectorRoleFilter,
            isEmailVerified: true,
            isSuspended: true,
        }, inspectorListProjection)
            .sort({ fullname: 'asc' })
            .skip(pagination.skip)
            .limit(pagination.limit)
            .lean();
        setPaginationHeaders(res, pagination);
        return res.json(users);
    } catch (err) {
        return res.status(500).send('Server Error');
    }
});

// Backward-compatible alias
router.get('/pending-users', ...commissionerAuth, async (_req, res) => {
    try {
        const pagination = parsePagination(_req.query);
        const users = await User.find({
            ...inspectorRoleFilter,
            isEmailVerified: true,
            isSuspended: true,
        }, inspectorListProjection)
            .sort({ fullname: 'asc' })
            .skip(pagination.skip)
            .limit(pagination.limit)
            .lean();
        setPaginationHeaders(res, pagination);
        return res.json(users);
    } catch (err) {
        return res.status(500).send('Server Error');
    }
});

router.get('/active-users', ...commissionerAuth, async (_req, res) => {
    try {
        const pagination = parsePagination(_req.query);
        const users = await User.find({
            ...inspectorRoleFilter,
            isEmailVerified: true,
            isSuspended: { $ne: true },
        }, inspectorListProjection)
            .sort({ fullname: 'asc' })
            .skip(pagination.skip)
            .limit(pagination.limit)
            .lean();
        if (!users.length) {
            setPaginationHeaders(res, pagination);
            return res.json(users);
        }

        const handlerNames = users
            .map((user) => String(user?.fullname || '').trim())
            .filter(Boolean);
        const countsByHandler = new Map();

        if (handlerNames.length) {
            const caseCounts = await Case.aggregate([
                {
                    $match: buildCommissionerCaseFilter({
                        case_handler: { $in: handlerNames },
                        isApproved: true,
                        is_removed: { $ne: true },
                        status: { $in: ['ACTIVE', 'CLOSE'] },
                    }),
                },
                {
                    $group: {
                        _id: { handler: '$case_handler', status: '$status' },
                        count: { $sum: 1 },
                    },
                },
            ]);

            caseCounts.forEach((row) => {
                const handler = String(row?._id?.handler || '').trim();
                if (!handler) return;
                const status = String(row?._id?.status || '').toUpperCase();
                const entry = countsByHandler.get(handler) || { working_cases: 0, completed_cases: 0 };
                if (status === 'ACTIVE') entry.working_cases = row.count;
                if (status === 'CLOSE') entry.completed_cases = row.count;
                countsByHandler.set(handler, entry);
            });
        }

        const enrichedUsers = users.map((user) => {
            const handler = String(user?.fullname || '').trim();
            const counts = countsByHandler.get(handler) || { working_cases: 0, completed_cases: 0 };
            return { ...user, ...counts };
        });
        setPaginationHeaders(res, pagination);
        return res.json(enrichedUsers);
    } catch (err) {
        return res.status(500).send('Server Error');
    }
});

router.put('/suspend-inspector/:id', ...commissionerAuth, async (req, res) => {
    try {
        await User.findOneAndUpdate({ _id: req.params.id, ...inspectorRoleFilter }, { isSuspended: true });
        return res.json({ msg: 'Inspector suspended successfully' });
    } catch (err) {
        return res.status(500).send('Server Error');
    }
});

router.put('/unsuspend-inspector/:id', ...commissionerAuth, async (req, res) => {
    try {
        await User.findOneAndUpdate({ _id: req.params.id, ...inspectorRoleFilter }, { isSuspended: false });
        return res.json({ msg: 'Inspector unsuspended successfully' });
    } catch (err) {
        return res.status(500).send('Server Error');
    }
});

// Backward-compatible aliases
router.put('/disable-user/:id', ...commissionerAuth, async (req, res) => {
    try {
        await User.findOneAndUpdate({ _id: req.params.id, ...inspectorRoleFilter }, { isSuspended: true });
        return res.json({ msg: 'Inspector suspended successfully' });
    } catch (err) {
        return res.status(500).send('Server Error');
    }
});

router.put('/approve-user/:id', ...commissionerAuth, async (req, res) => {
    try {
        await User.findOneAndUpdate({ _id: req.params.id, ...inspectorRoleFilter }, { isSuspended: false });
        return res.json({ msg: 'Inspector unsuspended successfully' });
    } catch (err) {
        return res.status(500).send('Server Error');
    }
});

router.delete('/deny-user/:id', ...commissionerAuth, async (req, res) => {
    try {
        await User.findOneAndDelete({ _id: req.params.id, ...inspectorRoleFilter });
        return res.json({ msg: 'Inspector removed successfully' });
    } catch (err) {
        return res.status(500).send('Server Error');
    }
});

// Case management
router.get('/all-cases', ...commissionerAuth, async (_req, res) => {
    try {
        const pagination = parsePagination(_req.query);
        const cases = await Case.find(buildCommissionerCaseFilter({ is_removed: { $ne: true } }))
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

router.get('/pending-cases', ...commissionerAuth, async (_req, res) => {
    try {
        const pagination = parsePagination(_req.query);
        const cases = await Case.find(
            buildCommissionerCaseFilter({
                isApproved: false,
                is_removed: { $ne: true },
                $or: [
                    { submitted_by_role: { $ne: 'citizen' } },
                    { citizen_review_status: CITIZEN_REVIEW_STATUS.COMMISSIONER_REVIEW },
                ],
            })
        )
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

// Citizen submissions forwarded for commissioner review
router.get('/citizen-submissions', ...commissionerAuth, async (req, res) => {
    try {
        const pagination = parsePagination(req.query);
        const cases = await Case.find({
            submitted_by_role: 'citizen',
            citizen_review_status: CITIZEN_REVIEW_STATUS.COMMISSIONER_REVIEW,
            is_removed: { $ne: true },
        })
            .populate('submitted_by_user', 'fullname email role')
            .select(caseListProjection)
            .sort({ updated_on: -1, createdAt: -1 })
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

router.put('/citizen-submissions/:id/assign-inspector', ...commissionerAuth, async (req, res) => {
    try {
        const inspectorId = normalizeText(req.body?.inspector_id);
        if (!inspectorId) {
            return res.status(400).json({ msg: 'Inspector is required.' });
        }

        const inspector = await User.findOne({ _id: inspectorId, ...activeInspectorFilter }).lean();
        if (!inspector) {
            return res.status(404).json({ msg: 'Inspector not found or inactive.' });
        }

        const caseItem = await Case.findOne({
            _id: req.params.id,
            submitted_by_role: 'citizen',
            citizen_review_status: CITIZEN_REVIEW_STATUS.COMMISSIONER_REVIEW,
            is_removed: { $ne: true },
        });
        if (!caseItem) {
            return res.status(404).json({ msg: 'Citizen case not found for commissioner review.' });
        }

        caseItem.citizen_review_status = CITIZEN_REVIEW_STATUS.COMMISSIONER_APPROVED;
        caseItem.case_handler = inspector.fullname || caseItem.case_handler;
        caseItem.assigned_inspector_id = inspector._id;
        caseItem.isApproved = true;
        caseItem.updated_on = new Date();
        await caseItem.save();

        let email_status = 'skipped';
        try {
            const commissioner = req.user?.id
                ? await User.findById(req.user.id).select('fullname email').lean()
                : null;
            const commissionerName =
                commissioner?.fullname || commissioner?.email || 'Commissioner';
            const emailResult = await sendCaseAssignmentEmail({
                email: inspector.email,
                inspector_name: inspector.fullname,
                case_title: caseItem.case_title,
                case_type: caseItem.case_type,
                case_id: caseItem._id,
                assigned_by_name: commissionerName,
                assigned_at: caseItem.updated_on,
                baseUrl: process.env.FRONTEND_URL,
            });
            email_status = emailResult?.status || 'sent';
        } catch (emailError) {
            console.error('Assignment email failed:', emailError.message || emailError);
            email_status = 'failed';
        }

        return res.json({
            msg: 'Citizen case assigned to inspector.',
            case: serializeCaseForClient(caseItem),
            email_status,
        });
    } catch (err) {
        console.error(err.message);
        return res.status(500).send('Server Error');
    }
});

router.put('/approve-case/:id', ...commissionerAuth, async (req, res) => {
    try {
        const caseItem = await Case.findById(req.params.id)
            .select('submitted_by_role citizen_review_status isApproved is_removed')
            .lean();
        if (!caseItem) {
            return res.status(404).json({ msg: 'Case not found' });
        }
        if (caseItem.is_removed) {
            return res.status(409).json({ msg: 'Case is already removed.' });
        }
        if (caseItem.isApproved) {
            return res.status(409).json({ msg: 'Case is already approved.' });
        }

        const citizenDecisionError = commissionerCitizenDecisionError(caseItem);
        if (citizenDecisionError) {
            return res.status(409).json({ msg: citizenDecisionError });
        }

        const updatePayload = { isApproved: true, updated_on: new Date() };
        if (caseItem.submitted_by_role === 'citizen') {
            updatePayload.citizen_review_status = CITIZEN_REVIEW_STATUS.COMMISSIONER_APPROVED;
        }

        await Case.findByIdAndUpdate(req.params.id, updatePayload);
        return res.json({ msg: 'Case approved successfully' });
    } catch (err) {
        return res.status(500).send('Server Error');
    }
});

router.delete('/deny-case/:id', ...commissionerAuth, async (req, res) => {
    try {
        const caseItem = await Case.findById(req.params.id)
            .select('submitted_by_role citizen_review_status isApproved is_removed')
            .lean();
        if (!caseItem) {
            return res.status(404).json({ msg: 'Case not found' });
        }
        if (caseItem.is_removed) {
            return res.status(409).json({ msg: 'Case is already removed.' });
        }
        if (caseItem.isApproved) {
            return res.status(409).json({ msg: 'Approved cases cannot be denied from pending review.' });
        }

        const citizenDecisionError = commissionerCitizenDecisionError(caseItem);
        if (citizenDecisionError) {
            return res.status(409).json({ msg: citizenDecisionError });
        }

        const updatePayload = { is_removed: true, updated_on: new Date() };
        if (caseItem.submitted_by_role === 'citizen') {
            updatePayload.citizen_review_status = CITIZEN_REVIEW_STATUS.COMMISSIONER_REJECTED;
        }

        await Case.findByIdAndUpdate(req.params.id, updatePayload);
        return res.json({ msg: 'Case denied and removed successfully' });
    } catch (err) {
        return res.status(500).send('Server Error');
    }
});

router.get('/removed-cases', ...commissionerAuth, async (_req, res) => {
    try {
        const pagination = parsePagination(_req.query);
        const cases = await Case.find(buildCommissionerCaseFilter({ is_removed: true }))
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

router.get('/case/:id', ...commissionerAuth, async (req, res) => {
    try {
        const caseItem = await Case.findOne(buildCommissionerCaseFilter({ _id: req.params.id }))
            .populate('submitted_by_user', 'fullname email role')
            .lean();
        if (!caseItem) return res.status(404).json({ msg: 'Case not found' });
        return res.json(serializeCaseForClient(caseItem));
    } catch (err) {
        return res.status(500).send('Server Error');
    }
});

// Update request management
router.get('/pending-updates', ...commissionerAuth, async (_req, res) => {
    try {
        const pagination = parsePagination(_req.query);
        const updates = await UpdateCase.find()
            .sort({ requestedAt: -1 })
            .skip(pagination.skip)
            .limit(pagination.limit)
            .lean();
        const normalizedUpdates = updates.map((obj) => {
            if (!obj.requestedAt && obj._id && typeof obj._id.getTimestamp === 'function') {
                obj.requestedAt = obj._id.getTimestamp();
            }
            obj.suspects = formatPeopleField(obj.suspects);
            obj.victim = formatPeopleField(obj.victim);
            obj.guilty_name = formatPeopleField(obj.guilty_name);
            return obj;
        });
        setPaginationHeaders(res, pagination);
        return res.json(normalizedUpdates);
    } catch (err) {
        return res.status(500).send('Server Error');
    }
});

router.put('/approve-update/:updateId', ...commissionerAuth, async (req, res) => {
    try {
        const updateRequest = await UpdateCase.findById(req.params.updateId);
        if (!updateRequest) {
            return res.status(404).json({ msg: 'Update request not found' });
        }
        const { _id, __v, originalCaseId, changes_done, ...updatedData } = updateRequest.toObject();
        const normalizedData = normalizeCasePeoplePayload(updatedData);
        const normalizedChangesDone = normalizeChangesDone(changes_done);
        const caseDateError = validateCaseDateNotFuture(normalizedData.case_date);
        if (caseDateError) {
            return res.status(400).json({ msg: caseDateError });
        }
        await Case.findByIdAndUpdate(originalCaseId, {
            $set: { ...normalizedData, changes_done: normalizedChangesDone, updated_on: new Date() },
        });
        await UpdateCase.findByIdAndDelete(req.params.updateId);
        return res.json({ msg: 'Update approved and applied successfully!' });
    } catch (err) {
        return res.status(500).send('Server Error');
    }
});

router.delete('/deny-update/:updateId', ...commissionerAuth, async (req, res) => {
    try {
        await UpdateCase.findByIdAndDelete(req.params.updateId);
        return res.json({ msg: 'Update request denied and removed.' });
    } catch (err) {
        return res.status(500).send('Server Error');
    }
});

router.get('/search-cases', ...commissionerAuth, async (req, res) => {
    try {
        const { field, query } = req.query;
        const searchFilter = { is_removed: { $ne: true } };
        if (query && field) {
            if (field === 'for-all') {
                searchFilter.$or = buildCaseForAllSearchOr(query);
            } else if (field === 'isApproved') {
                searchFilter.isApproved = query === '1';
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
        const pagination = parsePagination(req.query);
        const cases = await Case.find(buildCommissionerCaseFilter(searchFilter))
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

// Fine management
router.get('/fines', ...commissionerAuth, async (req, res) => {
    try {
        const pagination = parsePagination(req.query);
        const fines = await Fine.find({})
            .sort({ createdAt: -1 })
            .skip(pagination.skip)
            .limit(pagination.limit)
            .lean();
        setPaginationHeaders(res, pagination);
        return res.json(fines);
    } catch (err) {
        console.error(err.message);
        return res.status(500).send('Server Error');
    }
});

router.get('/fines/:fineId', ...commissionerAuth, async (req, res) => {
    try {
        const fine = await Fine.findById(req.params.fineId).lean();
        if (!fine) {
            return res.status(404).json({ msg: 'Fine not found.' });
        }
        return res.json(fine);
    } catch (err) {
        console.error(err.message);
        return res.status(500).send('Server Error');
    }
});

router.put('/fines/:fineId', ...commissionerAuth, uploadEvidence.array('evidence_files', 10), async (req, res) => {
    try {
        const updates = {};

        if (req.body?.person_name !== undefined) {
            const person_name = normalizeText(req.body.person_name);
            if (!person_name || person_name.length < 3) {
                return res.status(400).json({ msg: 'Name must be at least 3 characters.' });
            }
            updates.person_name = person_name;
        }

        if (req.body?.person_age !== undefined) {
            const person_age = Number(req.body.person_age);
            if (!Number.isFinite(person_age) || person_age < 18 || person_age > 110) {
                return res.status(400).json({ msg: 'Age must be between 18 and 110.' });
            }
            updates.person_age = person_age;
        }

        if (req.body?.mobile_number !== undefined) {
            const mobile_number = normalizeText(req.body.mobile_number);
            if (!/^\d{10}$/.test(mobile_number)) {
                return res.status(400).json({ msg: 'Mobile number must be exactly 10 digits.' });
            }
            updates.mobile_number = mobile_number;
        }

        if (req.body?.aadhar_number !== undefined) {
            const aadhar_number = normalizeText(req.body.aadhar_number);
            if (!/^\d{12}$/.test(aadhar_number)) {
                return res.status(400).json({ msg: 'Aadhar number must be exactly 12 digits.' });
            }
            updates.aadhar_number = aadhar_number;
        }

        if (req.body?.email !== undefined) {
            const email = normalizeText(req.body.email).toLowerCase();
            if (!email || !isValidEmail(email)) {
                return res.status(400).json({ msg: 'Valid email is required.' });
            }
            updates.email = email;
        }

        if (req.body?.amount !== undefined) {
            const amount = Number(req.body.amount);
            if (!Number.isFinite(amount) || amount < 100 || amount > 25000) {
                return res.status(400).json({ msg: 'Amount must be between 100 and 25000.' });
            }
            updates.amount = amount;
        }

        if (req.body?.reason !== undefined) {
            const reason = normalizeText(req.body.reason);
            if (!reason || reason.length < 5) {
                return res.status(400).json({ msg: 'Reason must be at least 5 characters.' });
            }
            updates.reason = reason;
        }

        if (req.body?.status !== undefined) {
            const status = normalizeText(req.body.status).toUpperCase();
            if (!['UNPAID', 'PAID'].includes(status)) {
                return res.status(400).json({ msg: 'Invalid status.' });
            }
            updates.status = status;
            if (status === 'PAID' && !updates.paid_at) {
                updates.paid_at = new Date();
            }
            if (status !== 'PAID') {
                updates.paid_at = null;
            }
        }

        let existingEvidence = null;
        if (req.body?.existing_evidence !== undefined || req.body?.existingEvidence !== undefined) {
            try {
                const rawValue = req.body?.existing_evidence ?? req.body?.existingEvidence;
                const parsed = typeof rawValue === 'string' ? JSON.parse(rawValue || '[]') : rawValue;
                if (!Array.isArray(parsed)) {
                    return res.status(400).json({ msg: 'Existing evidence must be an array.' });
                }
                existingEvidence = parsed
                    .map((entry) => {
                        if (!entry || typeof entry !== 'object') return null;
                        const evidence_name = normalizeText(entry.evidence_name);
                        const evidence_file_url = normalizeText(entry.evidence_file_url);
                        if (!evidence_name || !evidence_file_url) return null;
                        const evidence_file_type = normalizeText(entry.evidence_file_type).toLowerCase();
                        return {
                            evidence_name,
                            evidence_file_url,
                            evidence_file_type: evidence_file_type || 'application/octet-stream',
                        };
                    })
                    .filter(Boolean);
            } catch (err) {
                return res.status(400).json({ msg: 'Invalid existing evidence payload.' });
            }
        }

        let newEvidence = [];
        try {
            newEvidence = buildEvidencePayload(req);
        } catch (err) {
            return res.status(400).json({ msg: err.message });
        }

        if (existingEvidence !== null || newEvidence.length) {
            updates.evidence = [...(existingEvidence || []), ...newEvidence];
        }

        if (!Object.keys(updates).length) {
            return res.status(400).json({ msg: 'No changes provided.' });
        }

        const oldFine = await Fine.findById(req.params.fineId).lean();
        if (!oldFine) {
            return res.status(404).json({ msg: 'Fine not found.' });
        }

        const fine = await Fine.findByIdAndUpdate(req.params.fineId, { $set: updates }, { new: true });
        
        if (updates.email && updates.email.toLowerCase() !== String(oldFine.email || '').toLowerCase()) {
            sendFineEmail({
                email: fine.email,
                person_name: fine.person_name,
                amount: fine.amount,
                reason: fine.reason,
                fine_id: fine._id,
                issued_by_name: req.user?.fullname || 'Commissioner',
                issued_at: fine.createdAt || new Date(),
                baseUrl: process.env.FRONTEND_URL,
            }).catch(e => console.error('Fine email resend failed:', e.message || e));
        }

        return res.json({ msg: 'Fine updated successfully.', fine });
    } catch (err) {
        console.error(err.message);
        return res.status(500).send('Server Error');
    }
});

router.delete('/fines/:fineId', ...commissionerAuth, async (req, res) => {
    try {
        const fine = await Fine.findByIdAndDelete(req.params.fineId);
        if (!fine) {
            return res.status(404).json({ msg: 'Fine not found.' });
        }
        return res.json({ msg: 'Fine forgiven successfully.' });
    } catch (err) {
        console.error(err.message);
        return res.status(500).send('Server Error');
    }
});

// Inspector compliance workflow
router.get('/inspector-compliance', ...commissionerAuth, async (req, res) => {
    try {
        const tab = String(req.query?.tab || 'new').toLowerCase();
        const pagination = parsePagination(req.query);
        let statusFilter = {};
        if (tab === 'new') {
            statusFilter = { status: 'NEW' };
        } else if (tab === 'working') {
            statusFilter = { status: 'WORKING' };
        } else if (tab === 'done') {
            statusFilter = { status: { $in: ['DONE', 'FAKE', 'REJECTED'] } };
        }

        const complaints = await InspectorComplaint.find(statusFilter)
            .sort({ createdAt: -1 })
            .skip(pagination.skip)
            .limit(pagination.limit)
            .lean();
        setPaginationHeaders(res, pagination);
        return res.json(complaints);
    } catch (err) {
        console.error(err.message);
        return res.status(500).send('Server Error');
    }
});

router.get('/inspector-compliance/:complaintId', ...commissionerAuth, async (req, res) => {
    try {
        const complaint = await InspectorComplaint.findById(req.params.complaintId).lean();
        if (!complaint) {
            return res.status(404).json({ msg: 'Complaint not found' });
        }
        return res.json(complaint);
    } catch (err) {
        console.error(err.message);
        return res.status(500).send('Server Error');
    }
});

const updateComplianceStatus = (status) => async (req, res) => {
    try {
        const complaint = await InspectorComplaint.findByIdAndUpdate(
            req.params.complaintId,
            { $set: { status } },
            { new: true }
        );
        if (!complaint) {
            return res.status(404).json({ msg: 'Complaint not found' });
        }
        return res.json({ msg: `Complaint moved to ${status}.`, complaint });
    } catch (err) {
        console.error(err.message);
        return res.status(500).send('Server Error');
    }
};

router.put('/inspector-compliance/:complaintId/mark-working', ...commissionerAuth, updateComplianceStatus('WORKING'));
router.put('/inspector-compliance/:complaintId/reject', ...commissionerAuth, updateComplianceStatus('REJECTED'));
router.put('/inspector-compliance/:complaintId/mark-fake', ...commissionerAuth, updateComplianceStatus('FAKE'));

router.put('/inspector-compliance/:complaintId/complete', ...commissionerAuth, async (req, res) => {
    try {
        const note = String(req.body?.commissioner_note || '').trim();
        if (!note) {
            return res.status(400).json({ msg: 'Action taken is required.' });
        }
        const complaint = await InspectorComplaint.findByIdAndUpdate(
            req.params.complaintId,
            { $set: { status: 'DONE', commissioner_note: note } },
            { new: true }
        );
        if (!complaint) {
            return res.status(404).json({ msg: 'Complaint not found' });
        }
        return res.json({ msg: 'Complaint moved to DONE.', complaint });
    } catch (err) {
        console.error(err.message);
        return res.status(500).send('Server Error');
    }
});

module.exports = router;
