const nodemailer = require('nodemailer');

const escapeHtml = (value) =>
    String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');

const formatDateTime = (value) => {
    const date = value ? new Date(value) : null;
    if (!date || Number.isNaN(date.getTime())) return '';
    return date.toLocaleString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
    });
};

const resolveBaseUrl = (value) => {
    const raw = String(value || process.env.FRONTEND_URL || 'http://localhost:4200').trim();
    return raw.replace(/\/+$/, '');
};

const buildFineEmailHtml = ({
    person_name,
    amount,
    reason,
    fineId,
    issued_by_name,
    issued_at,
    baseUrl,
}) => {
    const safeName = escapeHtml(person_name || 'Citizen');
    const safeReason = escapeHtml(reason || 'N/A');
    const safeIssuer = escapeHtml(issued_by_name || 'Inspector');
    const issuedAtText = formatDateTime(issued_at);
    const payUrl = `${resolveBaseUrl(baseUrl)}/citizen/fine/${fineId}`;

    return `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;line-height:1.5;">
        <h2 style="margin:0 0 12px;color:#222;">Fine Issued</h2>
        <p style="margin:0 0 12px;color:#444;">Hello ${safeName},</p>
        <p style="margin:0 0 12px;color:#444;">
          You have received a fine of <strong>Rs. ${escapeHtml(amount)}</strong> for:
          <strong>${safeReason}</strong>.
        </p>
        <p style="margin:0 0 12px;color:#444;">Issued by ${safeIssuer}${issuedAtText ? ` on ${escapeHtml(issuedAtText)}` : ''}.</p>
        <p style="margin:0 0 16px;color:#444;">Please pay the fine on our website:</p>
        <a href="${payUrl}" style="display:inline-block;background:#2f5dff;color:#fff;text-decoration:none;padding:10px 16px;border-radius:6px;font-weight:600;">
          Pay Fine
        </a>
        <p style="margin:16px 0 0;color:#666;font-size:13px;">If the button does not work, copy this link:</p>
        <p style="margin:6px 0 0;color:#2f5dff;font-size:13px;">${payUrl}</p>
      </div>
    `;
};

async function sendFineEmail({ email, ...payload }) {
    if (!process.env.EMAIL || !process.env.PASS) {
        return { status: 'skipped', reason: 'EMAIL/PASS not configured' };
    }

    const targetEmail = String(email || '').trim().toLowerCase();
    if (!targetEmail) {
        throw new Error('Recipient email is required to send fine email');
    }

    const transporter = nodemailer.createTransport({
        service: 'gmail',
        auth: {
            user: process.env.EMAIL,
            pass: process.env.PASS,
        },
    });

    await transporter.sendMail({
        from: `Police Case Management <${process.env.EMAIL}>`,
        to: targetEmail,
        subject: 'Fine Issued - Payment Required',
        html: buildFineEmailHtml(payload),
    });

    return { status: 'sent' };
}

module.exports = { sendFineEmail };
