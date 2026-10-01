// src/utils/email.js
// Small provider-agnostic email abstraction. Supports, in this order of preference:
//   1. Gmail SMTP (GMAIL_USER + GMAIL_PASS — a 16-char Gmail "app password", NOT the real account
//      password) via nodemailer.
//   2. A dev-only console fallback if Gmail isn't configured.
//
// IMPORTANT — this integration's delivery has NOT been verified end-to-end in the environment
// this code was written in: no network access was available here, so the Gmail path has only been
// reviewed against nodemailer's documented API shape, never actually executed against Gmail's
// servers in this session. Test it for real (a live send) before relying on it in production.
//
// nodemailer is required lazily (inside sendViaGmail, not at the top of this file) specifically so
// that using the console fallback never breaks just because nodemailer isn't installed — it's only
// ever loaded if GMAIL_USER/GMAIL_PASS are actually set.
// Run `npm install nodemailer` before setting GMAIL_USER/GMAIL_PASS.

const env = require('../config/env');

let cachedTransporter = null;

function getGmailTransporter() {
  if (cachedTransporter) return cachedTransporter;
  // eslint-disable-next-line global-require
  const nodemailer = require('nodemailer');
  cachedTransporter = nodemailer.createTransport({
    service: 'gmail',
    auth: { user: env.email.gmailUser, pass: env.email.gmailPass },
  });
  return cachedTransporter;
}

async function sendViaGmail({ to, subject, html, text }) {
  try {
    const transporter = getGmailTransporter();
    await transporter.sendMail({ from: env.email.from, to, subject, html, text });
    return { delivered: true, provider: 'gmail' };
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[email] Gmail SMTP send failed:', err.message);
    return { delivered: false, provider: 'gmail' };
  }
}

/**
 * @param {{to: string, subject: string, html: string, text: string}} message
 * @returns {Promise<{delivered: boolean, provider: string}>} — never throws; a delivery failure
 *   should never surface to the caller in a way that reveals account existence (see
 *   auth.controller.js#forgotPassword, which always returns the same generic response).
 */
async function sendEmail(message) {
  if (env.email.gmailUser && env.email.gmailPass) {
    return sendViaGmail(message);
  }

  // No provider configured. In production, never print the email body (it may contain a
  // password-reset link) — just note that sending is unconfigured. In development, printing it
  // is what lets a developer actually test the flow without a real inbox.
  if (env.nodeEnv === 'production') {
    // eslint-disable-next-line no-console
    console.warn(`[email] No email provider configured — email to ${message.to} was not sent.`);
    return { delivered: false, provider: 'none' };
  }

  // eslint-disable-next-line no-console
  console.log(`\n[DEV EMAIL] To: ${message.to}\n[DEV EMAIL] Subject: ${message.subject}\n${message.text}\n`);
  return { delivered: true, provider: 'console' };
}

module.exports = { sendEmail };
