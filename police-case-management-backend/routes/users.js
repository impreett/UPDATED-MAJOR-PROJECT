const express = require('express');
const router = express.Router();
const User = require('../models/User');
const { parsePagination, setPaginationHeaders } = require('../utils/pagination');

const buildInspectorFilter = (includeSuspended = false) => {
    const base = {
        $or: [{ role: 'inspector' }, { role: { $exists: false }, isAdmin: false }],
        isEmailVerified: true,
    };
    if (!includeSuspended) {
        base.isSuspended = { $ne: true };
    }
    return base;
};

// GET /api/users/inspectors - return active inspectors
router.get('/inspectors', async (req, res) => {
    try {
        const includeSuspended = String(req.query?.includeSuspended || '').toLowerCase() === 'true' || String(req.query?.includeSuspended || '') === '1';
        const pagination = parsePagination(req.query, { defaultLimit: 100 });
        const inspectors = await User.find(buildInspectorFilter(includeSuspended), 'fullname police_id city')
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

// Backward-compatible alias.
router.get('/officers', async (req, res) => {
    try {
        const includeSuspended = String(req.query?.includeSuspended || '').toLowerCase() === 'true' || String(req.query?.includeSuspended || '') === '1';
        const pagination = parsePagination(req.query, { defaultLimit: 100 });
        const inspectors = await User.find(buildInspectorFilter(includeSuspended), 'fullname police_id city')
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

module.exports = router;
