const fs = require('fs');
const path = require('path');
const multer = require('multer');
const express = require('express');
const router = express.Router();
const User = require('../models/User');
const InspectorComplaint = require('../models/InspectorComplaint');
const { authRequired, requireRole } = require('../middleware/auth');
const { parsePagination, setPaginationHeaders } = require('../utils/pagination');

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

const inspectorRoleFilter = { $or: [{ role: 'inspector' }, { role: { $exists: false }, isAdmin: false }] };

const normalizeText = (value) => String(value || '').trim();

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

const parseExistingEvidence = (rawValue) => {
    const parsed = parseJsonArrayField(rawValue, 'Existing evidence');
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
        ? namesRaw.map((item) => normalizeText(item)).filter(Boolean)
        : typeof namesRaw === 'string'
        ? [normalizeText(namesRaw)].filter(Boolean)
        : [];
    const files = Array.isArray(req.files) ? req.files : [];

    if (files.length) {
        if (!evidenceNames.length || evidenceNames.length < files.length) {
            throw new Error('Evidence name is required.');
        }
        if (evidenceNames.slice(0, files.length).some((name) => !name)) {
            throw new Error('Evidence name is required.');
        }
    } else if (evidenceNames.length) {
        throw new Error('Evidence file is required.');
    }

    const uploadedEvidence = files
        .map((file, index) => ({
            evidence_name: evidenceNames[index] || `Evidence ${index + 1}`,
            evidence_file_url: `/uploads/evidence/${file.filename}`,
            evidence_file_type: file.mimetype || 'application/octet-stream',
        }))
        .filter((evidence) => evidence.evidence_name);

    return [...existingEvidence, ...uploadedEvidence];
};

router.get('/inspectors', authRequired, requireRole('citizen'), async (_req, res) => {
    try {
        const pagination = parsePagination(_req.query, { defaultLimit: 100 });
        const inspectors = await User.find(
            {
                ...inspectorRoleFilter,
                isEmailVerified: true,
                isSuspended: { $ne: true },
            },
            'fullname police_id city'
        )
            .sort({ fullname: 'asc' })
            .skip(pagination.skip)
            .limit(pagination.limit)
            .lean();
        setPaginationHeaders(res, pagination);
        return res.json(inspectors);
    } catch (err) {
        console.error(err.message);
        return res.status(500).send('Server Error');
    }
});

router.post(
    '/report-inspector',
    authRequired,
    requireRole('citizen'),
    uploadEvidence.array('evidence_files'),
    async (req, res) => {
        try {
            const inspectorId = String(req.body?.inspector_id || '').trim();
            const reason = String(req.body?.reason || '').trim();

            if (!inspectorId) {
                return res.status(400).json({ msg: 'Inspector is required.' });
            }
            if (!reason || reason.length < 10) {
                return res.status(400).json({ msg: 'Reason must be at least 10 characters.' });
            }

            let evidence = [];
            try {
                evidence = buildEvidencePayload(req);
            } catch (err) {
                return res.status(400).json({ msg: err.message });
            }

            const inspector = await User.findOne({
                _id: inspectorId,
                ...inspectorRoleFilter,
                isEmailVerified: true,
            });
            if (!inspector) {
                return res.status(404).json({ msg: 'Inspector not found.' });
            }

            const citizen = await User.findById(req.user.id);
            if (!citizen) {
                return res.status(404).json({ msg: 'Citizen not found.' });
            }

            const complaint = new InspectorComplaint({
                citizen_id: citizen._id,
                citizen_name: citizen.fullname,
                inspector_id: inspector._id,
                inspector_name: inspector.fullname,
                inspector_police_id: inspector.police_id || 'N/A',
                inspector_city: inspector.city || 'N/A',
                reason,
                evidence,
                evidence_name: evidence[0]?.evidence_name || '',
                evidence_file_url: evidence[0]?.evidence_file_url || '',
                evidence_file_type: evidence[0]?.evidence_file_type || '',
                status: 'NEW',
            });

            await complaint.save();
            return res.status(201).json({ msg: 'Inspector complaint submitted successfully.', complaint });
        } catch (err) {
            console.error(err.message);
            return res.status(500).send('Server Error');
        }
    }
);

router.get('/my', authRequired, requireRole('citizen'), async (req, res) => {
    try {
        const pagination = parsePagination(req.query);
        const complaints = await InspectorComplaint.find({ citizen_id: req.user.id })
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

router.put(
    '/:complaintId/evidence',
    authRequired,
    requireRole('citizen'),
    uploadEvidence.array('evidence_files'),
    async (req, res) => {
        try {
            const complaint = await InspectorComplaint.findOne({
                _id: req.params.complaintId,
                citizen_id: req.user.id,
            });
            if (!complaint) {
                return res.status(404).json({ msg: 'Complaint not found' });
            }
            const status = String(complaint.status || '').toUpperCase();
            if (!['NEW', 'WORKING'].includes(status)) {
                return res.status(400).json({ msg: 'Only NEW or WORKING complaints can be updated.' });
            }

            const reason = String(req.body?.reason || '').trim();
            if (!reason || reason.length < 10) {
                return res.status(400).json({ msg: 'Reason must be at least 10 characters.' });
            }

            const clearEvidence = ['1', 'true', 'yes'].includes(
                String(req.body?.clear_evidence || '').trim().toLowerCase()
            );

            let evidence = [];
            try {
                evidence = buildEvidencePayload(req, { includeExisting: true });
            } catch (err) {
                return res.status(400).json({ msg: err.message });
            }

            const update = { reason };
            if (clearEvidence && !evidence.length) {
                update.evidence = [];
                update.evidence_name = '';
                update.evidence_file_url = '';
                update.evidence_file_type = '';
            } else if (evidence.length) {
                update.evidence = evidence;
                update.evidence_name = evidence[0]?.evidence_name || '';
                update.evidence_file_url = evidence[0]?.evidence_file_url || '';
                update.evidence_file_type = evidence[0]?.evidence_file_type || '';
            }

            const updated = await InspectorComplaint.findByIdAndUpdate(
                complaint._id,
                { $set: update },
                { new: true }
            );
            return res.json({ msg: 'Complaint evidence updated.', complaint: updated });
        } catch (err) {
            console.error(err.message);
            return res.status(500).send('Server Error');
        }
    }
);

router.get('/:complaintId', authRequired, requireRole('citizen'), async (req, res) => {
    try {
        const complaint = await InspectorComplaint.findOne({
            _id: req.params.complaintId,
            citizen_id: req.user.id,
        }).lean();
        if (!complaint) {
            return res.status(404).json({ msg: 'Complaint not found' });
        }
        return res.json(complaint);
    } catch (err) {
        console.error(err.message);
        return res.status(500).send('Server Error');
    }
});

router.delete('/:complaintId', authRequired, requireRole('citizen'), async (req, res) => {
    try {
        const complaint = await InspectorComplaint.findOne({
            _id: req.params.complaintId,
            citizen_id: req.user.id,
        });
        if (!complaint) {
            return res.status(404).json({ msg: 'Complaint not found' });
        }
        if (!['NEW', 'WORKING'].includes(String(complaint.status || '').toUpperCase())) {
            return res.status(400).json({ msg: 'Only NEW or WORKING complaints can be withdrawn.' });
        }
        await complaint.deleteOne();
        return res.json({ msg: 'Complaint withdrawn.' });
    } catch (err) {
        console.error(err.message);
        return res.status(500).send('Server Error');
    }
});

module.exports = router;
