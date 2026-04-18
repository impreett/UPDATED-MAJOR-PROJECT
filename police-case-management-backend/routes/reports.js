const express = require('express');
const router = express.Router();
const Report = require('../models/Report');
const { authRequired, requireCommissioner } = require('../middleware/auth');
const { parsePagination, setPaginationHeaders } = require('../utils/pagination');

// Submit a public report (citizen/public)
router.post('/public', async (req, res) => {
    try {
        const email = String(req.body?.email || '').trim().toLowerCase();
        const reportText = String(req.body?.reportText || '').trim();
        if (!email || !reportText || reportText.length < 50) {
            return res.status(400).json({ msg: 'Please fill out all fields correctly.' });
        }
        const newReport = new Report({ email, reportText });
        await newReport.save();
        return res.status(201).json({ msg: 'Report submitted successfully.' });
    } catch (err) {
        console.error(err.message);
        return res.status(500).send('Server Error');
    }
});

// Submit a report (logged-in inspector/citizen/commissioner)
router.post('/', authRequired, async (req, res) => {
    try {
        const emailFromToken = String(req.user?.email || '').trim().toLowerCase();
        const reportText = String(req.body?.reportText || '').trim();
        if (!emailFromToken || !reportText || reportText.length < 50) {
            return res.status(400).json({ msg: 'Please fill out all fields correctly.' });
        }
        const newReport = new Report({ email: emailFromToken, reportText });
        await newReport.save();
        return res.status(201).json({ msg: 'Report submitted successfully.' });
    } catch (err) {
        console.error(err.message);
        return res.status(500).send('Server Error');
    }
});

// Commissioner: list all reports
router.get('/', authRequired, requireCommissioner, async (req, res) => {
    try {
        const pagination = parsePagination(req.query);
        const reports = await Report.find()
            .sort({ date: -1 })
            .skip(pagination.skip)
            .limit(pagination.limit)
            .lean();
        setPaginationHeaders(res, pagination);
        return res.json(reports);
    } catch (err) {
        return res.status(500).send('Server Error');
    }
});

// Commissioner: delete report by id (mark as read)
router.delete('/:id', authRequired, requireCommissioner, async (req, res) => {
    try {
        await Report.findByIdAndDelete(req.params.id);
        return res.json({ msg: 'Report marked as read.' });
    } catch (err) {
        return res.status(500).send('Server Error');
    }
});

module.exports = router;
