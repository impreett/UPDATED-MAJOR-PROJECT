const express = require('express');
const router = express.Router();
const Case = require('../models/Case');
const User = require('../models/User');
const CaseTransferRequest = require('../models/CaseTransferRequest');
const { authRequired, requireRole } = require('../middleware/auth');
const { parsePagination, setPaginationHeaders } = require('../utils/pagination');
const { sendTransferRejectionEmail } = require('../utils/sendTransferRejectionEmail');
const { sendCaseAssignedEmail } = require('../utils/sendCaseAssignedEmail');

const normalizeText = (value) => String(value || '').trim();

const inspectorRoleFilter = {
    $or: [{ role: 'inspector' }, { role: { $exists: false }, isAdmin: false }],
    isEmailVerified: true,
    isSuspended: { $ne: true },
};

router.post('/', authRequired, requireRole('inspector'), async (req, res) => {
    try {
        const caseId = normalizeText(req.body?.case_id);
        const reason = normalizeText(req.body?.reason);

        if (!caseId) {
            return res.status(400).json({ msg: 'Case is required.' });
        }
        if (!reason || reason.length < 5) {
            return res.status(400).json({ msg: 'Reason must be at least 5 characters.' });
        }

        const inspector = await User.findById(req.user.id).lean();
        if (!inspector) {
            return res.status(404).json({ msg: 'Inspector not found.' });
        }

        const caseItem = await Case.findById(caseId).lean();
        if (!caseItem || caseItem.is_removed) {
            return res.status(404).json({ msg: 'Case not found.' });
        }

        if (String(caseItem.status || '').toUpperCase() !== 'ACTIVE') {
            return res.status(400).json({ msg: 'Only active cases can be transferred.' });
        }

        if (!caseItem.isApproved) {
            return res.status(400).json({ msg: 'Only approved cases can be transferred.' });
        }

        const handlerName = normalizeText(caseItem.case_handler);
        const inspectorName = normalizeText(inspector.fullname);
        if (!handlerName || handlerName !== inspectorName) {
            return res.status(403).json({ msg: 'You are not the handler of this case.' });
        }

        const existing = await CaseTransferRequest.findOne({
            case_id: caseItem._id,
            status: 'PENDING',
        }).lean();
        if (existing) {
            return res.status(400).json({ msg: 'Transfer request already pending for this case.' });
        }

        const request = new CaseTransferRequest({
            case_id: caseItem._id,
            case_title: caseItem.case_title,
            case_type: caseItem.case_type || '',
            case_status: caseItem.status || '',
            case_date: caseItem.case_date || null,
            from_inspector_id: inspector._id,
            from_inspector_name: inspectorName || 'Inspector',
            reason,
            status: 'PENDING',
        });

        await request.save();
        return res.status(201).json({ msg: 'Transfer request submitted.', request });
    } catch (err) {
        console.error(err.message);
        return res.status(500).send('Server Error');
    }
});

router.get('/my', authRequired, requireRole('inspector'), async (req, res) => {
    try {
        const pagination = parsePagination(req.query);
        const requests = await CaseTransferRequest.find({
            from_inspector_id: req.user.id,
        })
            .sort({ createdAt: -1 })
            .skip(pagination.skip)
            .limit(pagination.limit)
            .lean();
        setPaginationHeaders(res, pagination);
        return res.json(requests);
    } catch (err) {
        console.error(err.message);
        return res.status(500).send('Server Error');
    }
});

router.get('/', authRequired, requireRole('commissioner'), async (req, res) => {
    try {
        const pagination = parsePagination(req.query);
        const requests = await CaseTransferRequest.find({})
            .sort({ createdAt: -1 })
            .skip(pagination.skip)
            .limit(pagination.limit)
            .lean();
        setPaginationHeaders(res, pagination);
        return res.json(requests);
    } catch (err) {
        console.error(err.message);
        return res.status(500).send('Server Error');
    }
});

router.post('/:requestId/assign', authRequired, requireRole('commissioner'), async (req, res) => {
    try {
        const request = await CaseTransferRequest.findById(req.params.requestId);
        if (!request) {
            return res.status(404).json({ msg: 'Transfer request not found.' });
        }
        if (String(request.status).toUpperCase() !== 'PENDING') {
            return res.status(400).json({ msg: 'Transfer request is already resolved.' });
        }

        const toInspectorId = normalizeText(req.body?.to_inspector_id);
        if (!toInspectorId) {
            return res.status(400).json({ msg: 'Target inspector is required.' });
        }

        if (String(request.from_inspector_id) === String(toInspectorId)) {
            return res.status(400).json({ msg: 'Case is already assigned to that inspector.' });
        }

        const targetInspector = await User.findOne({ _id: toInspectorId, ...inspectorRoleFilter }).lean();
        if (!targetInspector) {
            return res.status(404).json({ msg: 'Target inspector not found or inactive.' });
        }

        const caseItem = await Case.findById(request.case_id);
        if (!caseItem || caseItem.is_removed) {
            return res.status(404).json({ msg: 'Case not found.' });
        }

        caseItem.case_handler = targetInspector.fullname || caseItem.case_handler;
        caseItem.assigned_inspector_id = targetInspector._id;
        await caseItem.save();

        request.status = 'APPROVED';
        request.to_inspector_id = targetInspector._id;
        request.to_inspector_name = targetInspector.fullname || '';
        request.resolved_by_id = req.user.id;
        request.resolved_by_name = normalizeText(req.user.fullname) || 'Commissioner';
        request.resolved_at = new Date();
        await request.save();

        let email_status = 'skipped';
        try {
            const emailResult = await sendCaseAssignedEmail({
                email: targetInspector.email,
                inspector_name: targetInspector.fullname,
                case_title: request.case_title,
                case_type: request.case_type,
                case_id: request.case_id,
                transferred_by_name: request.resolved_by_name,
                baseUrl: process.env.FRONTEND_URL,
            });
            email_status = emailResult?.status || 'sent';
        } catch (emailError) {
            console.error('Case assigned email failed:', emailError.message || emailError);
            email_status = 'failed';
        }

        return res.json({ msg: 'Case transferred successfully.', request, case: caseItem, email_status });
    } catch (err) {
        console.error(err.message);
        return res.status(500).send('Server Error');
    }
});

router.post('/:requestId/reject', authRequired, requireRole('commissioner'), async (req, res) => {
    try {
        const request = await CaseTransferRequest.findById(req.params.requestId);
        if (!request) {
            return res.status(404).json({ msg: 'Transfer request not found.' });
        }
        if (String(request.status).toUpperCase() !== 'PENDING') {
            return res.status(400).json({ msg: 'Transfer request is already resolved.' });
        }

        const inspector = await User.findById(request.from_inspector_id).lean();
        if (!inspector) {
            return res.status(404).json({ msg: 'Requesting inspector not found.' });
        }

        request.status = 'REJECTED';
        request.resolved_by_id = req.user.id;
        request.resolved_by_name = normalizeText(req.user.fullname) || 'Commissioner';
        request.resolved_at = new Date();
        await request.save();

        let email_status = 'skipped';
        try {
            const emailResult = await sendTransferRejectionEmail({
                email: inspector.email,
                inspector_name: inspector.fullname,
                case_title: request.case_title,
                case_type: request.case_type,
                case_id: request.case_id,
                rejected_by_name: request.resolved_by_name,
                rejected_at: request.resolved_at,
                request_reason: request.reason,
                baseUrl: process.env.FRONTEND_URL,
            });
            email_status = emailResult?.status || 'sent';
        } catch (emailError) {
            console.error('Transfer rejection email failed:', emailError.message || emailError);
            email_status = 'failed';
        }

        return res.json({ msg: 'Transfer request rejected.', request, email_status });
    } catch (err) {
        console.error(err.message);
        return res.status(500).send('Server Error');
    }
});

module.exports = router;
