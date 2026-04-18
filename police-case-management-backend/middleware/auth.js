const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'yourSecretKey';

const authRequired = (req, res, next) => {
    const token = req.header('x-auth-token');
    if (!token) {
        return res.status(401).json({ msg: 'No token, authorization denied' });
    }

    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        req.user = decoded?.user || null;
        if (!req.user?.id) {
            return res.status(401).json({ msg: 'Token payload is invalid' });
        }
        return next();
    } catch (err) {
        return res.status(401).json({ msg: 'Token is not valid' });
    }
};

const requireRole = (...roles) => (req, res, next) => {
    if (!req.user) {
        return res.status(401).json({ msg: 'Authentication required' });
    }

    if (!roles.includes(req.user.role)) {
        return res.status(403).json({ msg: 'Forbidden: insufficient role access' });
    }

    return next();
};

const requireCommissioner = requireRole('commissioner');

module.exports = {
    JWT_SECRET,
    authRequired,
    requireRole,
    requireCommissioner,
};
