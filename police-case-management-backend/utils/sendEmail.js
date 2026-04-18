const nodemailer = require('nodemailer');

const PURPOSE_META = {
    registration: {
        subject: 'Registration OTP Verification',
        heading: 'Verify Your Registration',
        lead: 'Use this OTP to complete your account verification:',
    },
    reset_password: {
        subject: 'Password Reset OTP',
        heading: 'Reset Your Password',
        lead: 'Use this OTP to continue your password reset:',
    },
    generic: {
        subject: 'Your OTP Code',
        heading: 'OTP Verification',
        lead: 'Use this OTP:',
    },
};

function resolvePayload(input, maybeOtp, maybePurpose) {
    if (input && typeof input === 'object' && !Array.isArray(input)) {
        return {
            email: String(input.email || '').trim().toLowerCase(),
            otp: String(input.otp || '').trim(),
            purpose: String(input.purpose || 'generic').trim().toLowerCase(),
        };
    }

    return {
        email: String(input || '').trim().toLowerCase(),
        otp: String(maybeOtp || '').trim(),
        purpose: String(maybePurpose || 'generic').trim().toLowerCase(),
    };
}

async function sendEmail(input, maybeOtp, maybePurpose) {
    if (!process.env.EMAIL || !process.env.PASS) {
        throw new Error('EMAIL/PASS not configured for OTP email');
    }

    const { email, otp, purpose } = resolvePayload(input, maybeOtp, maybePurpose);
    if (!email || !otp) {
        throw new Error('Email and OTP are required to send OTP email');
    }

    const meta = PURPOSE_META[purpose] || PURPOSE_META.generic;

    const transporter = nodemailer.createTransport({
        service: 'gmail',
        auth: {
            user: process.env.EMAIL,
            pass: process.env.PASS,
        },
    });

    await transporter.sendMail({
        from: `Police Case Management <${process.env.EMAIL}>`,
        to: email,
        subject: meta.subject,
        html: `
      <div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto;padding:20px;">
        <h2 style="margin:0 0 12px;color:#222;">${meta.heading}</h2>
        <p style="margin:0 0 14px;color:#444;">${meta.lead}</p>
        <div style="display:inline-block;font-size:28px;font-weight:700;letter-spacing:6px;padding:12px 18px;background:#f2f4f7;border:1px solid #d7dbe2;border-radius:8px;color:#111;">
          ${otp}
        </div>
        <p style="margin:14px 0 6px;color:#666;">This OTP is valid for 5 minutes.</p>
        <p style="margin:0;color:#999;">Do not share this code with anyone.</p>
      </div>
    `,
    });
}

module.exports = sendEmail;
