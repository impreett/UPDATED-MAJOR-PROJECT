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

const buildRejectionEmailHtml = ({
    inspector_name,
    case_title,
    case_type,
    case_id,
    rejected_by_name,
    rejected_at,
    request_reason,
    baseUrl,
}) => {
    const safeInspector = escapeHtml(inspector_name || 'Inspector');
    const safeTitle = escapeHtml(case_title || 'case');
    const safeType = escapeHtml(case_type || 'N/A');
    const safeCaseId = escapeHtml(case_id || 'N/A');
    const safeRejectedBy = escapeHtml(rejected_by_name || 'Commissioner');
    const rejectedAtText = formatDateTime(rejected_at);
    const safeReason = escapeHtml(request_reason || '');
    const caseUrl = `${resolveBaseUrl(baseUrl)}/case/${encodeURIComponent(String(case_id || ''))}`;

    return `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;line-height:1.5;">
        <h2 style="margin:0 0 12px;color:#222;">Case Transfer Request Rejected</h2>
        <p style="margin:0 0 12px;color:#444;">Hello ${safeInspector},</p>
        <p style="margin:0 0 12px;color:#444;">
          Your transfer request for <strong>${safeTitle}</strong> has been rejected by ${safeRejectedBy}${rejectedAtText ? ` on ${escapeHtml(rejectedAtText)}` : ''}.
        </p>
        <p style="margin:0 0 8px;color:#444;"><strong>Case Type:</strong> ${safeType}</p>
        <p style="margin:0 0 12px;color:#444;"><strong>Case ID:</strong> ${safeCaseId}</p>
        ${safeReason ? `<p style="margin:0 0 16px;color:#444;"><strong>Your Request Reason:</strong> ${safeReason}</p>` : ''}
        <a href="${caseUrl}" style="display:inline-block;background:#2f5dff;color:#fff;text-decoration:none;padding:10px 16px;border-radius:6px;font-weight:600;">
          View Case
        </a>
        <p style="margin:16px 0 0;color:#666;font-size:13px;">If the button does not work, copy this link:</p>
        <p style="margin:6px 0 0;color:#2f5dff;font-size:13px;">${caseUrl}</p>
      </div>
    `;
};

async function sendTransferRejectionEmail({ email, ...payload }) {
    if (!process.env.EMAIL || !process.env.PASS) {
        return { status: 'skipped', reason: 'EMAIL/PASS not configured' };
    }

    const targetEmail = String(email || '').trim().toLowerCase();
    if (!targetEmail) {
        throw new Error('Recipient email is required to send transfer rejection email');
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
        subject: 'Case Transfer Request Rejected',
        html: buildRejectionEmailHtml(payload),
    });

    return { status: 'sent' };
}

module.exports = { sendTransferRejectionEmail };
