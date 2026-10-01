// src/controllers/auth.controller.js

const { pool } = require('../config/db');
const userModel = require('../models/user.model');
const agentModel = require('../models/agent.model');
const adminUserModel = require('../models/adminUser.model');
const refreshTokenModel = require('../models/refreshToken.model');
const passwordResetTokenModel = require('../models/passwordResetToken.model');

const { hashPassword, comparePassword } = require('../utils/password');
const { signAccessToken, signRefreshToken, verifyRefreshToken, decodeToken } = require('../utils/jwt');
const { hashToken, generateSecureToken } = require('../utils/tokenHash');
const { sendEmail } = require('../utils/email');
const { buildPasswordResetEmail } = require('../utils/emailTemplates');
const asyncHandler = require('../utils/asyncHandler');
const { success, failure } = require('../utils/apiResponse');
const env = require('../config/env');

const REFRESH_COOKIE_NAME = 'refreshToken';
const REFRESH_COOKIE_PATH = '/api/auth';
const RESET_TOKEN_TTL_MINUTES = 30;
const RESET_GENERIC_MESSAGE = 'If an account exists for this email, password reset instructions have been sent.';

function refreshCookieOptions(maxAgeMs) {
  return {
    httpOnly: true,
    secure: env.cookie.secure,
    domain: env.cookie.domain,
    sameSite: 'lax',
    path: REFRESH_COOKIE_PATH,
    maxAge: maxAgeMs,
  };
}

/**
 * Signs a fresh access+refresh token pair for a user, persists the
 * refresh token (hashed) in the DB, and sets it as an httpOnly cookie.
 * Returns the access token to be sent in the JSON response body.
 */
async function issueTokens(res, user) {
  const payload = { userId: user.user_id, role: user.role };

  const accessToken = signAccessToken(payload);
  const refreshToken = signRefreshToken(payload);

  const decoded = decodeToken(refreshToken);
  const maxAgeMs = decoded.exp * 1000 - Date.now();

  await refreshTokenModel.insertToken(pool, {
    userId: user.user_id,
    tokenHash: hashToken(refreshToken),
    expiresAtUnixSeconds: decoded.exp,
  });

  res.cookie(REFRESH_COOKIE_NAME, refreshToken, refreshCookieOptions(maxAgeMs));

  return accessToken;
}

/**
 * POST /api/auth/register
 * Public roles only: buyer, agent. Admin accounts are never created here.
 */
const register = asyncHandler(async (req, res) => {
  const {
    email,
    password,
    firstName,
    lastName,
    phone,
    role = 'buyer',
    licenseNumber,
    agencyName,
    specialty,
    yearsExperience,
  } = req.body;

  const existing = await userModel.findByEmail(email);
  if (existing) {
    return failure(res, 'An account with this email already exists', 409);
  }

  if (role === 'agent') {
    const existingAgent = await agentModel.findByLicenseNumber(licenseNumber);
    if (existingAgent) {
      return failure(res, 'An agent account with this license number already exists', 409);
    }
  }

  const passwordHash = await hashPassword(password);
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    const userId = await userModel.createUser(connection, {
      email,
      passwordHash,
      role,
      firstName,
      lastName,
      phone,
    });

    if (role === 'agent') {
      await agentModel.createAgent(connection, {
        userId,
        licenseNumber,
        agencyName,
        specialty,
        yearsExperience,
      });
    }

    await connection.commit();

    const user = await userModel.findById(userId);
    const accessToken = await issueTokens(res, user);

    return success(res, { user: userModel.toSafeUser(user), accessToken }, 201);
  } catch (err) {
    await connection.rollback();
    if (err.code === 'ER_DUP_ENTRY') {
      return failure(res, 'Email or license number is already in use', 409);
    }
    throw err;
  } finally {
    connection.release();
  }
});

/**
 * POST /api/auth/login
 */
// A hash of a random, never-used password — compared against on the "no such user" path below
// purely to make that path's bcrypt cost resemble the "wrong password" path's, so response timing
// leaks as little as practical about whether an email is registered. It's a fixed constant (not
// generated fresh) specifically so it never matches any real password.
const DUMMY_PASSWORD_HASH = '$2b$12$CwTycUXWue0Thq9StjUM0uJ8i6ZFYU9d1G8jK5s7XxG9m8s7p8s7O';

const login = asyncHandler(async (req, res) => {
  const { email, password } = req.body;

  const user = await userModel.findByEmail(email);
  if (!user) {
    await comparePassword(password, DUMMY_PASSWORD_HASH); // see DUMMY_PASSWORD_HASH comment
    return failure(res, 'Invalid email or password', 401);
  }

  const passwordMatches = await comparePassword(password, user.password_hash);
  if (!passwordMatches) {
    return failure(res, 'Invalid email or password', 401);
  }

  if (user.status !== 'active') {
    return failure(res, `This account is ${user.status}. Please contact support.`, 403);
  }

  const accessToken = await issueTokens(res, user);

  return success(res, { user: userModel.toSafeUser(user), accessToken }, 200);
});

/**
 * POST /api/auth/refresh
 * Rotates the refresh token: the old one is revoked and a brand new
 * access+refresh pair is issued. Reading an already-revoked/expired/
 * missing token is always rejected.
 */
const refresh = asyncHandler(async (req, res) => {
  const token = req.cookies[REFRESH_COOKIE_NAME];
  if (!token) {
    return failure(res, 'No refresh token provided', 401);
  }

  let payload;
  try {
    payload = verifyRefreshToken(token);
  } catch (err) {
    res.clearCookie(REFRESH_COOKIE_NAME, { path: REFRESH_COOKIE_PATH });
    return failure(res, 'Invalid or expired refresh token', 401);
  }

  const tokenHash = hashToken(token);
  const storedToken = await refreshTokenModel.findValidByHash(tokenHash);
  if (!storedToken) {
    res.clearCookie(REFRESH_COOKIE_NAME, { path: REFRESH_COOKIE_PATH });
    return failure(res, 'Refresh token has been revoked or is invalid', 401);
  }

  const user = await userModel.findById(payload.userId);
  if (!user || user.status !== 'active') {
    res.clearCookie(REFRESH_COOKIE_NAME, { path: REFRESH_COOKIE_PATH });
    return failure(res, 'Account is no longer active', 401);
  }

  // Rotate: revoke the presented token, then issue a brand new pair.
  await refreshTokenModel.revokeByHash(tokenHash);
  const accessToken = await issueTokens(res, user);

  return success(res, { user: userModel.toSafeUser(user), accessToken }, 200);
});

/**
 * POST /api/auth/logout
 */
const logout = asyncHandler(async (req, res) => {
  const token = req.cookies[REFRESH_COOKIE_NAME];
  if (token) {
    await refreshTokenModel.revokeByHash(hashToken(token));
  }
  res.clearCookie(REFRESH_COOKIE_NAME, { path: REFRESH_COOKIE_PATH });
  return success(res, { message: 'Logged out successfully' }, 200);
});

/**
 * GET /api/auth/me
 * Protected route — requires `authenticate` middleware.
 */
const me = asyncHandler(async (req, res) => {
  const user = await userModel.findById(req.user.userId);
  if (!user) {
    return failure(res, 'User not found', 404);
  }

  const safeUser = userModel.toSafeUser(user);

  if (user.role === 'agent') {
    safeUser.agentProfile = await agentModel.findByUserId(user.user_id);
  } else if (user.role === 'admin') {
    safeUser.adminProfile = await adminUserModel.findByUserId(user.user_id);
  }

  return success(res, { user: safeUser }, 200);
});

/**
 * POST /api/auth/forgot-password
 * Body: { email }
 * ALWAYS returns the same generic success response, whether or not the email belongs to an
 * account — this is the whole point of the endpoint, so no early-return branch here may differ
 * in status code, body shape, or (as much as practical) timing profile. See the Auth Hardening
 * phase report for what "as much as practical" covers in this codebase.
 */
const forgotPassword = asyncHandler(async (req, res) => {
  const { email } = req.body;

  const user = await userModel.findByEmail(email);

  // A suspended/deactivated account can't log in anyway, so there is nothing useful to reset into —
  // but we still don't want to *reveal* that distinction, so this branch (like "no such user")
  // simply issues no token and sends no email, while returning the exact same response below.
  if (user && user.status === 'active') {
    // A new request supersedes any earlier unused link for this user.
    await passwordResetTokenModel.invalidateAllForUser(user.user_id);

    const rawToken = generateSecureToken();
    const tokenHash = hashToken(rawToken);

    await passwordResetTokenModel.insertToken({
      userId: user.user_id,
      tokenHash,
      expiresInMinutes: RESET_TOKEN_TTL_MINUTES,
    });

    const resetUrl = `${env.frontendUrl.replace(/\/+$/, '')}/reset-password?token=${rawToken}`;
    const { subject, html, text } = buildPasswordResetEmail({
      firstName: user.first_name,
      resetUrl,
      expiresInMinutes: RESET_TOKEN_TTL_MINUTES,
    });

    // Deliberately not awaited: the response below must not wait on (or vary in timing with) an
    // external email API call, and a delivery failure must never surface to the caller — see
    // utils/email.js, which never throws.
    sendEmail({ to: user.email, subject, html, text }).catch(() => {});
  }

  return success(res, { message: RESET_GENERIC_MESSAGE }, 200);
});

/**
 * POST /api/auth/reset-password
 * Body: { token, newPassword }
 */
const resetPassword = asyncHandler(async (req, res) => {
  const { token, newPassword } = req.body;

  const tokenHash = hashToken(token);
  const resetRow = await passwordResetTokenModel.findValidByHash(tokenHash);
  if (!resetRow) {
    return failure(res, 'This password reset link is invalid or has expired. Please request a new one.', 400);
  }

  // Compare-and-set: marks it used only if it's still valid at this exact moment. Closes the race
  // where the same (still-unexpired) link is submitted twice concurrently.
  const claimed = await passwordResetTokenModel.markUsedIfValid(resetRow.reset_token_id);
  if (!claimed) {
    return failure(res, 'This password reset link is invalid or has expired. Please request a new one.', 400);
  }

  const passwordHash = await hashPassword(newPassword);
  await userModel.updatePasswordHash(resetRow.user_id, passwordHash);

  // Belt-and-braces: close out any other still-open reset link for this user, and log every
  // existing session out — a password reset is exactly the moment an old (possibly compromised)
  // session should stop working.
  await passwordResetTokenModel.invalidateAllForUser(resetRow.user_id);
  await refreshTokenModel.revokeAllForUser(resetRow.user_id);

  return success(res, { message: 'Your password has been reset. You can now sign in with your new password.' }, 200);
});

module.exports = { register, login, refresh, logout, me, forgotPassword, resetPassword };