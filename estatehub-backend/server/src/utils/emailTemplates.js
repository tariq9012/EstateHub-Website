// src/utils/emailTemplates.js
// Plain, dependency-free HTML string templates — no templating engine needed for one email.

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

/**
 * @param {{firstName: string, resetUrl: string, expiresInMinutes: number}} params
 * @returns {{subject: string, html: string, text: string}}
 */
function buildPasswordResetEmail({ firstName, resetUrl, expiresInMinutes }) {
  const safeName = escapeHtml(firstName || 'there');
  const subject = 'Reset your EstateHub password';

  const html = `
<!DOCTYPE html>
<html>
  <body style="margin:0;padding:0;background-color:#f5f3f0;font-family:Arial,Helvetica,sans-serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f5f3f0;padding:32px 0;">
      <tr>
        <td align="center">
          <table role="presentation" width="480" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;">
            <tr>
              <td style="padding:32px 32px 16px 32px;">
                <div style="font-size:22px;font-weight:800;color:#8b5e34;">EstateHub</div>
              </td>
            </tr>
            <tr>
              <td style="padding:0 32px 24px 32px;color:#2b2621;">
                <h1 style="font-size:20px;margin:0 0 16px 0;">Reset your password</h1>
                <p style="font-size:14px;line-height:1.6;margin:0 0 16px 0;">Hi ${safeName},</p>
                <p style="font-size:14px;line-height:1.6;margin:0 0 24px 0;">
                  We received a request to reset the password on your EstateHub account. Click the
                  button below to choose a new password.
                </p>
                <p style="text-align:center;margin:0 0 24px 0;">
                  <a href="${resetUrl}" style="background:#8b5e34;color:#ffffff;text-decoration:none;
                     padding:12px 28px;border-radius:8px;font-size:14px;font-weight:600;display:inline-block;">
                    Reset Password
                  </a>
                </p>
                <p style="font-size:13px;line-height:1.6;color:#6b6258;margin:0 0 16px 0;">
                  This link expires in ${expiresInMinutes} minutes and can only be used once. If the
                  button doesn't work, copy and paste this URL into your browser:
                  <br /><a href="${resetUrl}" style="color:#8b5e34;word-break:break-all;">${resetUrl}</a>
                </p>
                <p style="font-size:13px;line-height:1.6;color:#6b6258;margin:0;">
                  If you didn't request this, you can safely ignore this email — your password will
                  not be changed, and no further action is needed.
                </p>
              </td>
            </tr>
            <tr>
              <td style="padding:20px 32px;background:#f5f3f0;font-size:12px;color:#9a9086;">
                EstateHub · This is an automated message, please don't reply directly to it.
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`.trim();

  const text = `Hi ${firstName || 'there'},

We received a request to reset the password on your EstateHub account.

Reset your password here (expires in ${expiresInMinutes} minutes, single use):
${resetUrl}

If you didn't request this, you can safely ignore this email — your password will not be changed.

— EstateHub`;

  return { subject, html, text };
}

module.exports = { buildPasswordResetEmail };
