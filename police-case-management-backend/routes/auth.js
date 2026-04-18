const express = require('express');
const crypto = require('crypto');
const router = express.Router();
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const User = require('../models/User');
const sendEmail = require('../utils/sendEmail');
const { JWT_SECRET, authRequired } = require('../middleware/auth');

const BCRYPT_SALT_ROUNDS = Number(process.env.BCRYPT_SALT_ROUNDS || 10);
const BCRYPT_HASH_REGEX = /^\$2[aby]\$\d{2}\$/;
const OTP_TTL_MS = Number(process.env.OTP_TTL_MS || 5 * 60 * 1000);
const RESET_SESSION_TTL_MS = Number(process.env.RESET_SESSION_TTL_MS || 10 * 60 * 1000);

const registrationOtpStore = new Map();
const passwordResetOtpStore = new Map();
const passwordResetSessionStore = new Map();

const normalizeEmail = (email = '') => String(email).trim().toLowerCase();
const normalizeText = (value = '') => String(value).trim();
const normalizePhone = (value = '') => String(value).replace(/\D/g, '').trim();
const createOtp = () => String(Math.floor(100000 + Math.random() * 900000));
const isBcryptHash = (value) => typeof value === 'string' && BCRYPT_HASH_REGEX.test(value);

const homeRouteForRole = (role) => {
    if (role === 'commissioner') return '/commissioner/home';
    if (role === 'citizen') return '/citizen/case-status';
    return '/inspector/home';
};

const inferRole = (user) => {
    if (user?.role) return user.role;
    if (user?.isAdmin) return 'commissioner';
    return 'inspector';
};

const tokenPayloadForUser = (user) => {
    const role = inferRole(user);
    return {
        user: {
            id: user.id,
            fullname: user.fullname,
            role,
            isCommissioner: role === 'commissioner',
            isAdmin: role === 'commissioner',
            isCitizen: role === 'citizen',
            email: user.email,
        },
    };
};

const publicProfileForUser = (user) => {
    const role = inferRole(user);
    return {
        id: String(user._id || user.id || ''),
        role,
        fullname: user.fullname || '',
        first_name: user.first_name || '',
        last_name: user.last_name || '',
        email: user.email || '',
        contact: user.contact || '',
        city: user.city || '',
        age: user.age ?? null,
        police_id: user.police_id || '',
        isEmailVerified: !!user.isEmailVerified,
        isSuspended: !!user.isSuspended,
        createdAt: user.createdAt || null,
    };
};

const signToken = (payload) =>
    new Promise((resolve, reject) => {
        jwt.sign(payload, JWT_SECRET, { expiresIn: '7d' }, (err, token) => {
            if (err) return reject(err);
            return resolve(token);
        });
    });

const setOtpRecord = (store, email, otp, extra = {}) => {
    store.set(email, {
        otp,
        expiresAt: Date.now() + OTP_TTL_MS,
        ...extra,
    });
};

const deleteOtpRecord = (store, email) => {
    store.delete(email);
};

const issueRegistrationOtp = async (email, userId) => {
    const otp = createOtp();
    setOtpRecord(registrationOtpStore, email, otp, { userId: String(userId) });
    await sendEmail({ email, otp, purpose: 'registration' });
};

const issuePasswordResetOtp = async (email, userId) => {
    const otp = createOtp();
    setOtpRecord(passwordResetOtpStore, email, otp, { userId: String(userId) });
    await sendEmail({ email, otp, purpose: 'reset_password' });
};

const validateRegistrationInspector = (body) => {
    const errors = [];
    const fullname = normalizeText(body.fullname);
    const policeId = normalizeText(body.police_id);
    const contact = normalizePhone(body.contact);
    const email = normalizeEmail(body.email);
    const city = normalizeText(body.city);
    const password = String(body.password || '');

    if (!fullname) errors.push('Full name is required.');
    if (!/^[A-Za-z0-9]{8}$/.test(policeId)) errors.push('Police ID must be exactly 8 alphanumeric characters.');
    if (!/^\d{10}$/.test(contact)) errors.push('Mobile number must be exactly 10 digits.');
    if (!/^[^\s@]+@police\.gov\.in$/.test(email))
        errors.push('Inspector email must be a valid @police.gov.in address.');
    if (!city) errors.push('City is required.');
    if (password.length < 8) errors.push('Password must be at least 8 characters.');

    return {
        errors,
        payload: {
            fullname,
            police_id: policeId,
            contact,
            email,
            city,
            password,
        },
    };
};

const validateRegistrationCitizen = (body) => {
    const errors = [];
    const firstName = normalizeText(body.first_name);
    const lastName = normalizeText(body.last_name);
    const contact = normalizePhone(body.contact || body.mobile_number);
    const email = normalizeEmail(body.email);
    const city = normalizeText(body.city);
    const ageNum = Number(body.age);
    const aadharNumber = normalizeText(body.aadhar_number);
    const password = String(body.password || '');

    if (!firstName) errors.push('First name is required.');
    if (!lastName) errors.push('Last name is required.');
    if (!/^\d{10}$/.test(contact)) errors.push('Mobile number must be exactly 10 digits.');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errors.push('Valid email is required.');
    if (!city) errors.push('City is required.');
    if (!Number.isFinite(ageNum) || ageNum < 18 || ageNum > 110) errors.push('Age must be between 18 and 110.');
    if (!/^\d{12}$/.test(aadharNumber)) errors.push('Aadhar number must be exactly 12 digits.');
    if (password.length < 8) errors.push('Password must be at least 8 characters.');

    return {
        errors,
        payload: {
            first_name: firstName,
            last_name: lastName,
            fullname: `${firstName} ${lastName}`.trim(),
            contact,
            email,
            city,
            age: ageNum,
            aadhar_number: aadharNumber,
            password,
        },
    };
};

const ensureUniqueIdentityFields = async ({ email, contact, police_id, aadhar_number }) => {
    const existingEmail = email ? await User.findOne({ email }) : null;
    if (existingEmail) return 'User with this email already exists';

    const existingContact = contact ? await User.findOne({ contact }) : null;
    if (existingContact) return 'This mobile number is already registered';

    if (police_id) {
        const existingPoliceId = await User.findOne({ police_id });
        if (existingPoliceId) return 'This Police ID is already registered';
    }

    if (aadhar_number) {
        const existingAadhar = await User.findOne({ aadhar_number });
        if (existingAadhar) return 'This Aadhar number is already registered';
    }

    return '';
};

const registerUserWithRole = async (role, body) => {
    const parsed =
        role === 'citizen' ? validateRegistrationCitizen(body) : validateRegistrationInspector(body);

    if (parsed.errors.length) {
        return { status: 400, payload: { msg: parsed.errors[0] } };
    }

    const uniqueError = await ensureUniqueIdentityFields(parsed.payload);
    if (uniqueError) {
        return { status: 400, payload: { msg: uniqueError } };
    }

    const hashedPassword = await bcrypt.hash(parsed.payload.password, BCRYPT_SALT_ROUNDS);
    const user = new User({
        ...parsed.payload,
        role,
        password: hashedPassword,
        police_id: role === 'inspector' ? parsed.payload.police_id : undefined,
        aadhar_number: role === 'citizen' ? parsed.payload.aadhar_number : undefined,
        isEmailVerified: false,
        isSuspended: false,
        isApproved: true,
    });
    await user.save();
    await issueRegistrationOtp(user.email, user._id);

    return {
        status: 201,
        payload: {
            msg: 'OTP sent to email. Please verify your account.',
            email: user.email,
            role,
        },
    };
};

router.post('/register-inspector', async (req, res) => {
    try {
        const result = await registerUserWithRole('inspector', req.body || {});
        return res.status(result.status).json(result.payload);
    } catch (err) {
        console.error(err.message);
        return res.status(500).json({ msg: err.message || 'Server Error' });
    }
});

router.post('/register-citizen', async (req, res) => {
    try {
        const result = await registerUserWithRole('citizen', req.body || {});
        return res.status(result.status).json(result.payload);
    } catch (err) {
        console.error(err.message);
        return res.status(500).json({ msg: err.message || 'Server Error' });
    }
});

// Backward-compatible alias: /register defaults to inspector registration.
router.post('/register', async (req, res) => {
    try {
        const result = await registerUserWithRole('inspector', req.body || {});
        return res.status(result.status).json(result.payload);
    } catch (err) {
        console.error(err.message);
        return res.status(500).json({ msg: err.message || 'Server Error' });
    }
});

const verifyOtpAndActivateUser = async (email, otp) => {
    const otpRecord = registrationOtpStore.get(email);
    if (!otpRecord) {
        return { status: 400, payload: { msg: 'OTP not found. Please register again.' } };
    }
    if (Date.now() > otpRecord.expiresAt) {
        deleteOtpRecord(registrationOtpStore, email);
        return { status: 400, payload: { msg: 'OTP expired. Please request a new one.' } };
    }
    if (String(otpRecord.otp) !== String(otp)) {
        return { status: 400, payload: { msg: 'Invalid OTP.' } };
    }

    const user = await User.findOne({ email });
    if (!user) {
        deleteOtpRecord(registrationOtpStore, email);
        return { status: 404, payload: { msg: 'User not found for OTP verification.' } };
    }

    user.isEmailVerified = true;
    user.isApproved = true;
    await user.save();
    deleteOtpRecord(registrationOtpStore, email);

    const role = inferRole(user);
    const token = await signToken(tokenPayloadForUser(user));
    return {
        status: 200,
        payload: {
            msg: 'OTP verified successfully.',
            token,
            role,
            redirectTo: homeRouteForRole(role),
        },
    };
};

router.post('/verify-registration-otp', async (req, res) => {
    try {
        const email = normalizeEmail(req.body?.email);
        const otp = normalizeText(req.body?.otp);
        if (!email || !otp) {
            return res.status(400).json({ msg: 'Email and OTP are required.' });
        }
        const result = await verifyOtpAndActivateUser(email, otp);
        return res.status(result.status).json(result.payload);
    } catch (err) {
        console.error(err.message);
        return res.status(500).json({ msg: err.message || 'Server Error' });
    }
});

// Backward-compatible alias.
router.post('/verify-otp', async (req, res) => {
    try {
        const email = normalizeEmail(req.body?.email);
        const otp = normalizeText(req.body?.otp);
        if (!email || !otp) {
            return res.status(400).json({ msg: 'Email and OTP are required.' });
        }
        const result = await verifyOtpAndActivateUser(email, otp);
        return res.status(result.status).json(result.payload);
    } catch (err) {
        console.error(err.message);
        return res.status(500).json({ msg: err.message || 'Server Error' });
    }
});

const resendRegistrationOtp = async (email) => {
    const user = await User.findOne({ email });
    if (!user) {
        return { status: 400, payload: { msg: 'User not found. Please register first.' } };
    }
    if (user.isEmailVerified) {
        return { status: 400, payload: { msg: 'User is already verified.' } };
    }
    await issueRegistrationOtp(email, user._id);
    return { status: 200, payload: { msg: 'OTP resent to email. Please verify your account.' } };
};

router.post('/resend-registration-otp', async (req, res) => {
    try {
        const email = normalizeEmail(req.body?.email);
        if (!email) {
            return res.status(400).json({ msg: 'Email is required.' });
        }
        const result = await resendRegistrationOtp(email);
        return res.status(result.status).json(result.payload);
    } catch (err) {
        console.error(err.message);
        return res.status(500).json({ msg: err.message || 'Server Error' });
    }
});

// Backward-compatible alias.
router.post('/resend-otp', async (req, res) => {
    try {
        const email = normalizeEmail(req.body?.email);
        if (!email) {
            return res.status(400).json({ msg: 'Email is required.' });
        }
        const result = await resendRegistrationOtp(email);
        return res.status(result.status).json(result.payload);
    } catch (err) {
        console.error(err.message);
        return res.status(500).json({ msg: err.message || 'Server Error' });
    }
});

router.post('/login', async (req, res) => {
    const email = normalizeEmail(req.body?.email);
    const password = String(req.body?.password ?? '');

    try {
        const user = await User.findOne({ email });
        if (!user) {
            return res.status(400).json({ msg: 'Invalid credentials' });
        }

        let passwordMatched = false;
        if (isBcryptHash(user.password)) {
            passwordMatched = await bcrypt.compare(password, user.password);
        } else if (password === String(user.password ?? '')) {
            passwordMatched = true;
            user.password = await bcrypt.hash(password, BCRYPT_SALT_ROUNDS);
            await user.save();
        }

        if (!passwordMatched) {
            return res.status(400).json({ msg: 'Invalid credentials' });
        }

        if (!user.isEmailVerified) {
            return res.status(403).json({ msg: 'Please verify OTP before login.' });
        }

        if (user.isSuspended) {
            return res.status(403).json({
                msg: 'Your account is suspended by commissioner. Please contact support.',
            });
        }

        const role = inferRole(user);
        const token = await signToken(tokenPayloadForUser(user));
        return res.json({
            token,
            role,
            redirectTo: homeRouteForRole(role),
        });
    } catch (err) {
        console.error(err.message);
        return res.status(500).send('Server Error');
    }
});

router.get('/me', authRequired, async (req, res) => {
    try {
        const user = await User.findById(req.user.id).lean();
        if (!user) {
            return res.status(404).json({ msg: 'User not found.' });
        }
        return res.json({ user: publicProfileForUser(user) });
    } catch (err) {
        console.error(err.message);
        return res.status(500).json({ msg: err.message || 'Server Error' });
    }
});

router.patch('/me', authRequired, async (req, res) => {
    try {
        const user = await User.findById(req.user.id);
        if (!user) {
            return res.status(404).json({ msg: 'User not found.' });
        }

        const role = inferRole(user);
        const contact = normalizePhone(req.body?.contact ?? user.contact);
        const city = normalizeText(req.body?.city ?? user.city);

        if (!/^\d{10}$/.test(contact)) {
            return res.status(400).json({ msg: 'Mobile number must be exactly 10 digits.' });
        }
        if (!city) {
            return res.status(400).json({ msg: 'City is required.' });
        }

        if (contact !== String(user.contact || '').trim()) {
            const existingContact = await User.findOne({ contact, _id: { $ne: user._id } }).lean();
            if (existingContact) {
                return res.status(400).json({ msg: 'This mobile number is already registered.' });
            }
        }

        user.contact = contact;
        user.city = city;

        if (role === 'citizen') {
            const firstName = normalizeText(req.body?.first_name ?? user.first_name);
            const lastName = normalizeText(req.body?.last_name ?? user.last_name);
            const ageNum = Number(req.body?.age ?? user.age);

            if (!firstName) {
                return res.status(400).json({ msg: 'First name is required.' });
            }
            if (!lastName) {
                return res.status(400).json({ msg: 'Last name is required.' });
            }
            if (!Number.isFinite(ageNum) || ageNum < 18 || ageNum > 110) {
                return res.status(400).json({ msg: 'Age must be between 18 and 110.' });
            }

            user.first_name = firstName;
            user.last_name = lastName;
            user.fullname = `${firstName} ${lastName}`.trim();
            user.age = ageNum;
        } else {
            const fullname = normalizeText(req.body?.fullname ?? user.fullname);
            if (!fullname) {
                return res.status(400).json({ msg: 'Full name is required.' });
            }
            user.fullname = fullname;
        }

        await user.save();
        const token = await signToken(tokenPayloadForUser(user));
        return res.json({
            msg: 'Profile updated successfully.',
            token,
            user: publicProfileForUser(user),
        });
    } catch (err) {
        console.error(err.message);
        return res.status(500).json({ msg: err.message || 'Server Error' });
    }
});

router.post('/change-password', authRequired, async (req, res) => {
    const currentPassword = String(req.body?.currentPassword ?? '');
    const newPassword = String(req.body?.newPassword ?? '');

    if (!currentPassword || !newPassword) {
        return res.status(400).json({ msg: 'Current password and new password are required.' });
    }
    if (newPassword.length < 8) {
        return res.status(400).json({ msg: 'New password must be at least 8 characters.' });
    }

    try {
        const user = await User.findById(req.user.id);
        if (!user) {
            return res.status(404).json({ msg: 'User not found.' });
        }

        let passwordMatched = false;
        if (isBcryptHash(user.password)) {
            passwordMatched = await bcrypt.compare(currentPassword, user.password);
        } else if (currentPassword === String(user.password ?? '')) {
            passwordMatched = true;
        }

        if (!passwordMatched) {
            return res.status(400).json({ msg: 'Current password is incorrect.' });
        }
        if (currentPassword === newPassword) {
            return res.status(400).json({ msg: 'New password must be different from the current password.' });
        }

        user.password = await bcrypt.hash(newPassword, BCRYPT_SALT_ROUNDS);
        await user.save();
        return res.json({ msg: 'Password changed successfully.' });
    } catch (err) {
        console.error(err.message);
        return res.status(500).json({ msg: err.message || 'Server Error' });
    }
});

router.post('/forgot-password/request', async (req, res) => {
    const email = normalizeEmail(req.body?.email);
    if (!email) {
        return res.status(400).json({ msg: 'Email is required.' });
    }

    try {
        const user = await User.findOne({ email });
        if (!user) {
            return res.status(400).json({ msg: 'User not found with this email.' });
        }
        if (!user.isEmailVerified) {
            return res.status(400).json({ msg: 'Please verify your account first.' });
        }

        await issuePasswordResetOtp(email, user._id);
        return res.status(200).json({ msg: 'Password reset OTP sent to your email.' });
    } catch (err) {
        console.error(err.message);
        return res.status(500).json({ msg: err.message || 'Server Error' });
    }
});

router.post('/forgot-password/verify', async (req, res) => {
    const email = normalizeEmail(req.body?.email);
    const otp = normalizeText(req.body?.otp);
    if (!email || !otp) {
        return res.status(400).json({ msg: 'Email and OTP are required.' });
    }

    try {
        const otpRecord = passwordResetOtpStore.get(email);
        if (!otpRecord) {
            return res.status(400).json({ msg: 'OTP not found. Please request a new one.' });
        }
        if (Date.now() > otpRecord.expiresAt) {
            deleteOtpRecord(passwordResetOtpStore, email);
            return res.status(400).json({ msg: 'OTP expired. Please request a new one.' });
        }
        if (String(otpRecord.otp) !== otp) {
            return res.status(400).json({ msg: 'Invalid OTP.' });
        }

        deleteOtpRecord(passwordResetOtpStore, email);
        const resetToken = crypto.randomBytes(24).toString('hex');
        passwordResetSessionStore.set(`${email}:${resetToken}`, Date.now() + RESET_SESSION_TTL_MS);

        return res.status(200).json({
            msg: 'OTP verified successfully.',
            resetToken,
        });
    } catch (err) {
        console.error(err.message);
        return res.status(500).json({ msg: err.message || 'Server Error' });
    }
});

router.post('/forgot-password/reset', async (req, res) => {
    const email = normalizeEmail(req.body?.email);
    const resetToken = normalizeText(req.body?.resetToken);
    const newPassword = String(req.body?.newPassword ?? '');

    if (!email || !resetToken || !newPassword) {
        return res.status(400).json({ msg: 'Email, reset token and new password are required.' });
    }
    if (newPassword.length < 8) {
        return res.status(400).json({ msg: 'New password must be at least 8 characters.' });
    }

    try {
        const sessionKey = `${email}:${resetToken}`;
        const sessionExpiry = passwordResetSessionStore.get(sessionKey);
        if (!sessionExpiry) {
            return res.status(400).json({ msg: 'Reset session is invalid. Verify OTP again.' });
        }
        if (Date.now() > sessionExpiry) {
            passwordResetSessionStore.delete(sessionKey);
            return res.status(400).json({ msg: 'Reset session expired. Verify OTP again.' });
        }

        const user = await User.findOne({ email });
        if (!user) {
            passwordResetSessionStore.delete(sessionKey);
            return res.status(404).json({ msg: 'User not found.' });
        }

        user.password = await bcrypt.hash(newPassword, BCRYPT_SALT_ROUNDS);
        await user.save();
        passwordResetSessionStore.delete(sessionKey);

        return res.status(200).json({ msg: 'Password reset successful. Please log in.' });
    } catch (err) {
        console.error(err.message);
        return res.status(500).json({ msg: err.message || 'Server Error' });
    }
});

module.exports = router;
