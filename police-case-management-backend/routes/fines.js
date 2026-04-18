const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const multer = require('multer');
const express = require('express');
const Razorpay = require('razorpay');
const router = express.Router();
const Fine = require('../models/Fine');
const User = require('../models/User');
const { authRequired, requireRole } = require('../middleware/auth');
const { sendFineEmail } = require('../utils/sendFineEmail');

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

const normalizeText = (value) => String(value || '').trim();

const isValidEmail = (value) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || '').trim());

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

const getRazorpayConfig = () => {
    const keyId = String(process.env.RAZORPAY_KEY_ID || process.env.RAZORPAY_ID_KEY || '').trim();
    const keySecret = String(process.env.RAZORPAY_KEY_SECRET || process.env.RAZORPAY_SECRET_KEY || '').trim();
    if (!keyId || !keySecret) return null;
    return { keyId, keySecret };
};

const ensureFineOwner = async (req, fine) => {
    const citizen = await User.findById(req.user.id).lean();
    if (!citizen) {
        return { error: { status: 404, msg: 'Citizen not found.' } };
    }
    const aadhar_number = normalizeText(citizen.aadhar_number);
    if (!aadhar_number) {
        return { error: { status: 403, msg: 'Aadhar number missing from your profile.' } };
    }
    const isOwner =
        (fine.citizen_id && String(fine.citizen_id) === String(citizen._id)) ||
        normalizeText(fine.aadhar_number) === aadhar_number;
    if (!isOwner) {
        return { error: { status: 403, msg: 'You are not allowed to pay this fine.' } };
    }
    return { citizen, aadhar_number };
};

router.post(
    '/',
    authRequired,
    requireRole('inspector', 'commissioner'),
    uploadEvidence.array('evidence_files', 10),
    async (req, res) => {
    try {
        const person_name = normalizeText(req.body?.person_name);
        const person_age = Number(req.body?.person_age);
        const mobile_number = normalizeText(req.body?.mobile_number);
        const aadhar_number = normalizeText(req.body?.aadhar_number);
        const email = normalizeText(req.body?.email).toLowerCase();
        const amount = Number(req.body?.amount);
        const reason = normalizeText(req.body?.reason);

        if (!person_name || person_name.length < 3) {
            return res.status(400).json({ msg: 'Name must be at least 3 characters.' });
        }
        if (!Number.isFinite(person_age) || person_age < 18 || person_age > 110) {
            return res.status(400).json({ msg: 'Age must be between 18 and 110.' });
        }
        if (!/^\d{10}$/.test(mobile_number)) {
            return res.status(400).json({ msg: 'Mobile number must be exactly 10 digits.' });
        }
        if (!/^\d{12}$/.test(aadhar_number)) {
            return res.status(400).json({ msg: 'Aadhar number must be exactly 12 digits.' });
        }
        if (!email || !isValidEmail(email)) {
            return res.status(400).json({ msg: 'Valid email is required.' });
        }
        if (!Number.isFinite(amount) || amount < 100 || amount > 25000) {
            return res.status(400).json({ msg: 'Amount must be between 100 and 25000.' });
        }
        if (!reason || reason.length < 5) {
            return res.status(400).json({ msg: 'Reason must be at least 5 characters.' });
        }

        let evidence = [];
        try {
            evidence = buildEvidencePayload(req);
        } catch (err) {
            return res.status(400).json({ msg: err.message });
        }

        const issuer = await User.findById(req.user.id).lean();
        if (!issuer) {
            return res.status(404).json({ msg: 'Issuer not found.' });
        }

        const matchedCitizen = await User.findOne({
            role: 'citizen',
            aadhar_number,
        }).lean();

        const fine = new Fine({
            person_name,
            person_age,
            mobile_number,
            aadhar_number,
            email,
            amount,
            reason,
            issued_by: issuer._id,
            issued_by_name: issuer.fullname || (req.user?.role === 'commissioner' ? 'Commissioner' : 'Inspector'),
            citizen_id: matchedCitizen?._id || null,
            status: 'UNPAID',
            evidence,
        });

        await fine.save();
        let email_status = 'skipped';
        try {
            const emailResult = await sendFineEmail({
                email,
                person_name,
                amount,
                reason,
                fineId: fine._id,
                issued_by_name: fine.issued_by_name,
                issued_at: fine.createdAt,
            });
            email_status = emailResult?.status || 'sent';
        } catch (emailError) {
            console.error('Fine email failed:', emailError.message || emailError);
            email_status = 'failed';
        }

        return res.status(201).json({ msg: 'Fine issued successfully.', fine, email_status });
    } catch (err) {
        console.error(err.message);
        return res.status(500).send('Server Error');
    }
});

router.get('/my', authRequired, requireRole('citizen'), async (req, res) => {
    try {
        const citizen = await User.findById(req.user.id).lean();
        if (!citizen) {
            return res.status(404).json({ msg: 'Citizen not found.' });
        }
        const aadhar_number = normalizeText(citizen.aadhar_number);
        if (!aadhar_number) {
            return res.json([]);
        }

        const fines = await Fine.find({
            $or: [{ citizen_id: citizen._id }, { aadhar_number }],
        })
            .sort({ createdAt: -1 })
            .lean();

        return res.json(fines);
    } catch (err) {
        console.error(err.message);
        return res.status(500).send('Server Error');
    }
});

router.post('/:fineId/razorpay-order', authRequired, requireRole('citizen'), async (req, res) => {
    try {
        const fine = await Fine.findById(req.params.fineId);
        if (!fine) {
            return res.status(404).json({ msg: 'Fine not found.' });
        }
        if (String(fine.status).toUpperCase() === 'PAID') {
            return res.status(400).json({ msg: 'Fine is already paid.' });
        }

        const owner = await ensureFineOwner(req, fine);
        if (owner.error) {
            return res.status(owner.error.status).json({ msg: owner.error.msg });
        }

        const razorpayConfig = getRazorpayConfig();
        if (!razorpayConfig) {
            return res.status(503).json({ msg: 'Payment gateway is not configured.' });
        }

        const amountInPaise = Math.round(Number(fine.amount) * 100);
        if (!Number.isFinite(amountInPaise) || amountInPaise <= 0) {
            return res.status(400).json({ msg: 'Invalid fine amount.' });
        }

        const razorpay = new Razorpay({
            key_id: razorpayConfig.keyId,
            key_secret: razorpayConfig.keySecret,
        });

        let order;
        try {
            const receiptId = `fine_${String(fine._id).slice(-6)}_${Date.now().toString(36)}`.slice(0, 40);
            order = await razorpay.orders.create({
                amount: amountInPaise,
                currency: 'INR',
                receipt: receiptId,
                notes: {
                    fine_id: String(fine._id),
                    aadhar_number: normalizeText(fine.aadhar_number),
                },
            });
        } catch (gatewayError) {
            const statusCode = Number(gatewayError?.statusCode) || 502;
            const message =
                gatewayError?.error?.description ||
                gatewayError?.error?.reason ||
                gatewayError?.message ||
                'Payment gateway error.';
            console.error('Razorpay order error:', gatewayError?.error || gatewayError?.message || gatewayError);
            return res.status(statusCode).json({ msg: message });
        }

        fine.razorpay_order_id = order.id;
        fine.payment_gateway = 'razorpay';
        await fine.save();

        return res.json({
            keyId: razorpayConfig.keyId,
            orderId: order.id,
            amount: order.amount,
            currency: order.currency,
        });
    } catch (err) {
        console.error(err.message || err);
        return res.status(500).send('Server Error');
    }
});

router.post('/:fineId/razorpay-verify', authRequired, requireRole('citizen'), async (req, res) => {
    try {
        const fine = await Fine.findById(req.params.fineId);
        if (!fine) {
            return res.status(404).json({ msg: 'Fine not found.' });
        }
        if (String(fine.status).toUpperCase() === 'PAID') {
            return res.status(400).json({ msg: 'Fine is already paid.' });
        }

        const owner = await ensureFineOwner(req, fine);
        if (owner.error) {
            return res.status(owner.error.status).json({ msg: owner.error.msg });
        }

        const razorpayConfig = getRazorpayConfig();
        if (!razorpayConfig) {
            return res.status(503).json({ msg: 'Payment gateway is not configured.' });
        }

        const razorpay_order_id = normalizeText(req.body?.razorpay_order_id);
        const razorpay_payment_id = normalizeText(req.body?.razorpay_payment_id);
        const razorpay_signature = normalizeText(req.body?.razorpay_signature);

        if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
            return res.status(400).json({ msg: 'Missing Razorpay payment details.' });
        }

        if (fine.razorpay_order_id && fine.razorpay_order_id !== razorpay_order_id) {
            return res.status(400).json({ msg: 'Payment order mismatch.' });
        }

        const expectedSignature = crypto
            .createHmac('sha256', razorpayConfig.keySecret)
            .update(`${razorpay_order_id}|${razorpay_payment_id}`)
            .digest('hex');

        if (expectedSignature !== razorpay_signature) {
            return res.status(400).json({ msg: 'Payment signature verification failed.' });
        }

        fine.status = 'PAID';
        fine.paid_at = new Date();
        fine.payment_gateway = 'razorpay';
        fine.razorpay_order_id = razorpay_order_id;
        fine.razorpay_payment_id = razorpay_payment_id;
        fine.razorpay_signature = razorpay_signature;
        await fine.save();

        return res.json({ msg: 'Fine paid successfully.', fine });
    } catch (err) {
        console.error(err.message || err);
        return res.status(500).send('Server Error');
    }
});

router.post('/:fineId/pay', authRequired, requireRole('citizen'), async (req, res) => {
    try {
        const fine = await Fine.findById(req.params.fineId);
        if (!fine) {
            return res.status(404).json({ msg: 'Fine not found.' });
        }
        if (String(fine.status).toUpperCase() === 'PAID') {
            return res.status(400).json({ msg: 'Fine is already paid.' });
        }

        const owner = await ensureFineOwner(req, fine);
        if (owner.error) {
            return res.status(owner.error.status).json({ msg: owner.error.msg });
        }

        fine.status = 'PAID';
        fine.paid_at = new Date();
        await fine.save();

        return res.json({ msg: 'Fine paid successfully.', fine });
    } catch (err) {
        console.error(err.message);
        return res.status(500).send('Server Error');
    }
});

router.get('/public/:fineId', async (req, res) => {
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

module.exports = router;
