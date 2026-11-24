import { Router } from 'express';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { db, generateCustomerCode } from '../db';
import {
  AuthenticatedRequest,
  clearSessionCookie,
  computeSessionFingerprint,
  consumeRecoveryCode,
  createAuthChallenge,
  escapeHtml,
  generateBase32Secret,
  generateRecoveryCodes,
  getClientIp,
  issueCsrfToken,
  logActivity,
  requireAuth,
  sanitizeUser,
  setSessionCookie,
  sha256,
  signSessionToken,
  validateStrongPassword,
  verifyAuthChallenge,
  verifyTotpCode,
} from '../services/security';
import { createInAppNotification, sendDiscordWebhook, sendTransactionalEmail } from '../services/notifications';

const router = Router();

const BCRYPT_ROUNDS = 12;
const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_MINUTES = 15;

const registerSchema = z.object({
  full_name: z.string().trim().min(2, 'Full name is required').max(120),
  email: z.string().trim().email('Valid email is required').max(180),
  password: z.string().min(12, 'Password must be at least 12 characters').max(128),
  mobile: z.string().trim().min(5, 'Mobile number is required').max(40),
  country: z.string().trim().min(2, 'Country is required').max(80),
  city: z.string().trim().min(2, 'City is required').max(80),
  billing_address: z.string().trim().min(4, 'Billing address is required').max(250),
  postal_code: z.string().trim().min(2, 'Postal code is required').max(30),
  company_name: z.string().trim().max(120).optional().default(''),
  discord_username: z.string().trim().max(80).optional().default(''),
  challenge_token: z.string().min(10, 'Security verification challenge is required.'),
});

const loginSchema = z.object({
  email: z.string().trim().email(),
  password: z.string().min(1),
  totp_code: z.string().optional(),
  challenge_token: z.string().min(10, 'Security verification challenge is required.'),
});

router.get('/csrf', (_req, res) => {
  const token = issueCsrfToken(res);
  res.json({ csrf_token: token });
});

router.get('/challenge', (_req, res) => {
  res.json({ challenge_token: createAuthChallenge() });
});

router.get('/bootstrap-status', (_req, res) => {
  const adminCount = (
    db.prepare("SELECT COUNT(*) as cnt FROM users WHERE role IN ('admin', 'super_admin')").get() as { cnt: number }
  ).cnt;
  res.json({ needs_admin_setup: adminCount === 0 });
});

router.post('/bootstrap-admin', async (req, res) => {
  const adminCount = (
    db.prepare("SELECT COUNT(*) as cnt FROM users WHERE role IN ('admin', 'super_admin')").get() as { cnt: number }
  ).cnt;

  if (adminCount > 0) {
    res.status(403).json({ error: 'Administrator account already provisioned.' });
    return;
  }

  const schema = z.object({
    full_name: z.string().trim().min(2).max(120),
    email: z.string().trim().email().max(180),
    password: z.string().min(12).max(128),
    challenge_token: z.string().min(10),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid administrator details.' });
    return;
  }
  if (!verifyAuthChallenge(parsed.data.challenge_token)) {
    res.status(400).json({ error: 'Security challenge expired. Please retry.' });
    return;
  }

  const normalizedEmail = parsed.data.email.toLowerCase();
  const pwErr = validateStrongPassword(parsed.data.password, {
    email: normalizedEmail,
    fullName: parsed.data.full_name,
  });
  if (pwErr) {
    res.status(400).json({ error: pwErr });
    return;
  }

  const existingEmail = db.prepare('SELECT id FROM users WHERE lower(email) = ?').get(normalizedEmail);
  if (existingEmail) {
    res.status(409).json({ error: 'Email already registered.' });
    return;
  }

  const passwordHash = bcrypt.hashSync(parsed.data.password, BCRYPT_ROUNDS);
  const adminCode = generateCustomerCode();
  const ip = getClientIp(req);
  const ua = req.headers['user-agent'] || '';
  const fp = computeSessionFingerprint(req);

  const userId = db
    .prepare(`
      INSERT INTO users (
        customer_code, email, password_hash, role, full_name, mobile, country, city,
        billing_address, postal_code, company_name, discord_username, email_verified, status, last_login_ip, last_login_at
      ) VALUES (?, ?, ?, 'super_admin', ?, '', 'United States', 'San Francisco', 'HQ', '00000', 'HelzerX Technologies', '', 1, 'active', ?, datetime('now'))
    `)
    .run(adminCode, normalizedEmail, passwordHash, parsed.data.full_name, ip).lastInsertRowid as number;

  const jti = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
  db.prepare(
    'INSERT INTO sessions (user_id, token_jti, ip_address, user_agent, session_fingerprint, expires_at) VALUES (?, ?, ?, ?, ?, ?)'
  ).run(userId, jti, ip, ua, fp, expiresAt);

  setSessionCookie(
    res,
    signSessionToken(
      {
        id: userId,
        customer_code: adminCode,
        email: normalizedEmail,
        role: 'super_admin',
        full_name: parsed.data.full_name,
        status: 'active',
      },
      jti
    )
  );
  issueCsrfToken(res);

  logActivity({
    userId,
    actorUserId: userId,
    action: 'super_admin_bootstrapped',
    entityType: 'user',
    entityId: adminCode,
    ipAddress: ip,
  });

  const userRow = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
  res.status(201).json({ user: sanitizeUser(userRow) });
});

router.post('/register', async (req, res) => {
  const parsed = registerSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid registration data' });
    return;
  }

  const data = parsed.data;
  if (!verifyAuthChallenge(data.challenge_token)) {
    res.status(400).json({ error: 'Security verification challenge expired. Please refresh and try again.' });
    return;
  }

  const normalizedEmail = data.email.toLowerCase();
  const pwErr = validateStrongPassword(data.password, { email: normalizedEmail, fullName: data.full_name });
  if (pwErr) {
    res.status(400).json({ error: pwErr });
    return;
  }

  const existing = db.prepare('SELECT id FROM users WHERE lower(email) = ?').get(normalizedEmail);
  if (existing) {
    res.status(409).json({ error: 'Unable to register with this email address. Try signing in or resetting your password.' });
    return;
  }

  const passwordHash = bcrypt.hashSync(data.password, BCRYPT_ROUNDS);
  const customerCode = generateCustomerCode();
  const rawVerificationCode = crypto.randomBytes(16).toString('hex').toUpperCase();
  const verificationHash = sha256(rawVerificationCode);
  const verificationExpires = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
  const ip = getClientIp(req);
  const ua = req.headers['user-agent'] || '';
  const fp = computeSessionFingerprint(req);

  const userId = db.transaction(() => {
    const result = db
      .prepare(`
        INSERT INTO users (
          customer_code, email, password_hash, role, full_name, mobile, country, city,
          billing_address, postal_code, company_name, discord_username, email_verified,
          verification_token, verification_expires_at, last_login_ip, last_login_at
        ) VALUES (?, ?, ?, 'customer', ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, datetime('now'))
      `)
      .run(
        customerCode,
        normalizedEmail,
        passwordHash,
        data.full_name,
        data.mobile,
        data.country,
        data.city,
        data.billing_address,
        data.postal_code,
        data.company_name,
        data.discord_username,
        verificationHash,
        verificationExpires,
        ip
      );
    const id = Number(result.lastInsertRowid);

    db.prepare(`
      INSERT INTO billing_addresses (user_id, label, full_name, company_name, address_line, city, postal_code, country, is_default)
      VALUES (?, 'Primary Address', ?, ?, ?, ?, ?, ?, 1)
    `).run(id, data.full_name, data.company_name, data.billing_address, data.city, data.postal_code, data.country);

    return id;
  })();

  const jti = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

  db.prepare(
    'INSERT INTO sessions (user_id, token_jti, ip_address, user_agent, session_fingerprint, expires_at) VALUES (?, ?, ?, ?, ?, ?)'
  ).run(userId, jti, ip, ua, fp, expiresAt);

  db.prepare('INSERT INTO login_history (user_id, email, ip_address, user_agent, success) VALUES (?, ?, ?, ?, 1)').run(
    userId,
    normalizedEmail,
    ip,
    ua
  );

  setSessionCookie(
    res,
    signSessionToken(
      {
        id: userId,
        customer_code: customerCode,
        email: normalizedEmail,
        role: 'customer',
        full_name: data.full_name,
        status: 'active',
      },
      jti
    )
  );
  issueCsrfToken(res);

  logActivity({
    userId,
    actorUserId: userId,
    action: 'account_registered',
    entityType: 'user',
    entityId: customerCode,
    ipAddress: ip,
  });

  createInAppNotification({
    userId,
    title: 'Welcome to HelzerX Customer Portal',
    message: `Your customer ID ${customerCode} is active. Verify your email address and enable 2FA in Account Settings.`,
    category: 'account',
    linkTarget: 'settings',
  });

  const baseUrl = process.env.APP_URL || `${req.protocol}://${req.get('host')}`;
  await sendTransactionalEmail({
    to: normalizedEmail,
    subject: `Verify Your HelzerX Account (${customerCode})`,
    templateName: 'account_registration',
    heading: `Welcome, ${escapeHtml(data.full_name)}`,
    preheader: `Your HelzerX customer ID ${customerCode} requires email verification.`,
    bodyHtml: `
      <p>Thank you for registering with <strong>HelzerX Technologies</strong>.</p>
      <p><strong>Customer ID:</strong> ${escapeHtml(customerCode)}<br/>
      <strong>Email Verification Code:</strong> <code style="color:#FF6B2C;">${rawVerificationCode}</code></p>
      <p>This code expires in 24 hours. Enter it inside Account Settings to verify your email address.</p>
    `,
    ctaLabel: 'Open Customer Portal',
    ctaUrl: baseUrl,
  });

  await sendDiscordWebhook({
    event: 'customer.registered',
    title: 'New Customer Registered',
    description: `Customer **${customerCode}** (${data.country}) registered on HelzerX Portal.`,
    fields: [
      { name: 'Customer ID', value: customerCode, inline: true },
      { name: 'Company', value: data.company_name || 'Individual', inline: true },
    ],
  });

  const userRow = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
  res.status(201).json({ user: sanitizeUser(userRow) });
});

router.post('/login', async (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Valid email, password, and security challenge are required.' });
    return;
  }

  if (!verifyAuthChallenge(parsed.data.challenge_token)) {
    res.status(400).json({ error: 'Security verification challenge expired. Please retry.' });
    return;
  }

  const normalizedEmail = parsed.data.email.toLowerCase();
  const ip = getClientIp(req);
  const ua = req.headers['user-agent'] || '';
  const fp = computeSessionFingerprint(req);

  const user = db.prepare('SELECT * FROM users WHERE lower(email) = ?').get(normalizedEmail) as any;

  // Check active brute-force account lockout
  if (user?.locked_until && new Date(user.locked_until).getTime() > Date.now()) {
    const minsLeft = Math.ceil((new Date(user.locked_until).getTime() - Date.now()) / 60000);
    db.prepare(
      'INSERT INTO login_history (user_id, email, ip_address, user_agent, success, failure_reason) VALUES (?, ?, ?, ?, 0, ?)'
    ).run(user.id, normalizedEmail, ip, ua, 'Account temporarily locked');
    res.status(423).json({
      error: `Account temporarily locked due to repeated failed login attempts. Try again in ${minsLeft} minute(s).`,
    });
    return;
  }

  if (!user || !bcrypt.compareSync(parsed.data.password, user.password_hash)) {
    if (user) {
      const nextFails = (user.failed_login_attempts || 0) + 1;
      const shouldLock = nextFails >= MAX_FAILED_ATTEMPTS;
      const lockUntil = shouldLock ? new Date(Date.now() + LOCKOUT_MINUTES * 60 * 1000).toISOString() : null;

      db.prepare('UPDATE users SET failed_login_attempts = ?, locked_until = ? WHERE id = ?').run(
        nextFails,
        lockUntil,
        user.id
      );

      if (shouldLock) {
        logActivity({
          userId: user.id,
          actorUserId: user.id,
          action: 'security_account_locked',
          entityType: 'user',
          entityId: user.customer_code,
          details: { failed_attempts: nextFails },
          ipAddress: ip,
        });
        await sendTransactionalEmail({
          to: user.email,
          subject: 'Security Alert: Account Temporarily Locked — HelzerX',
          templateName: 'security_lockout',
          heading: 'Account Temporarily Locked',
          preheader: 'Multiple failed sign-in attempts detected.',
          bodyHtml: `<p>Hello ${escapeHtml(user.full_name)},</p>
            <p>Your account (${escapeHtml(user.customer_code)}) was temporarily locked for ${LOCKOUT_MINUTES} minutes after ${MAX_FAILED_ATTEMPTS} consecutive failed sign-in attempts from IP <code>${escapeHtml(ip)}</code>.</p>`,
        });
        await sendDiscordWebhook({
          event: 'security.lockout',
          title: 'Security Alert: Brute-Force Lockout Triggered',
          description: `Account **${user.customer_code}** locked for ${LOCKOUT_MINUTES}m after ${MAX_FAILED_ATTEMPTS} failed logins.`,
          color: 0xdc2626,
        });
      }
    }

    db.prepare(
      'INSERT INTO login_history (user_id, email, ip_address, user_agent, success, failure_reason) VALUES (?, ?, ?, ?, 0, ?)'
    ).run(user?.id ?? null, normalizedEmail, ip, ua, 'Invalid credentials');
    res.status(401).json({ error: 'Invalid credentials or verification failed.' });
    return;
  }

  if (user.status === 'suspended') {
    db.prepare(
      'INSERT INTO login_history (user_id, email, ip_address, user_agent, success, failure_reason) VALUES (?, ?, ?, ?, 0, ?)'
    ).run(user.id, normalizedEmail, ip, ua, 'Account suspended');
    res.status(403).json({ error: 'This account is currently suspended. Please contact support.' });
    return;
  }

  if (user.two_factor_enabled) {
    if (!parsed.data.totp_code) {
      res.status(200).json({ requires_2fa: true });
      return;
    }
    const submitted = parsed.data.totp_code.trim();
    const totpValid = Boolean(user.two_factor_secret && verifyTotpCode(user.two_factor_secret, submitted));
    const recoveryValid = !totpValid && consumeRecoveryCode(user.id, submitted);

    if (!totpValid && !recoveryValid) {
      db.prepare(
        'INSERT INTO login_history (user_id, email, ip_address, user_agent, success, failure_reason) VALUES (?, ?, ?, ?, 0, ?)'
      ).run(user.id, normalizedEmail, ip, ua, 'Invalid 2FA or recovery code');
      res.status(401).json({ error: 'Invalid two-factor authenticator or recovery code.' });
      return;
    }
  }

  // Reset lockout counters and record login IP/timestamp
  db.prepare(
    "UPDATE users SET failed_login_attempts = 0, locked_until = NULL, last_login_ip = ?, last_login_at = datetime('now') WHERE id = ?"
  ).run(ip, user.id);

  const jti = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
  db.prepare(
    'INSERT INTO sessions (user_id, token_jti, ip_address, user_agent, session_fingerprint, expires_at) VALUES (?, ?, ?, ?, ?, ?)'
  ).run(user.id, jti, ip, ua, fp, expiresAt);

  db.prepare('INSERT INTO login_history (user_id, email, ip_address, user_agent, success) VALUES (?, ?, ?, ?, 1)').run(
    user.id,
    normalizedEmail,
    ip,
    ua
  );

  setSessionCookie(
    res,
    signSessionToken(
      {
        id: user.id,
        customer_code: user.customer_code,
        email: user.email,
        role: user.role,
        full_name: user.full_name,
        status: user.status,
      },
      jti
    )
  );
  issueCsrfToken(res);

  logActivity({
    userId: user.id,
    actorUserId: user.id,
    action: 'user_login',
    entityType: 'session',
    entityId: jti,
    ipAddress: ip,
  });

  res.json({ user: sanitizeUser(user) });
});

router.post('/logout', requireAuth, (req: AuthenticatedRequest, res) => {
  if (req.sessionJti) {
    db.prepare("UPDATE sessions SET revoked_at = datetime('now') WHERE token_jti = ?").run(req.sessionJti);
  }
  clearSessionCookie(res);
  res.json({ ok: true });
});

router.post('/logout-all', requireAuth, (req: AuthenticatedRequest, res) => {
  db.prepare("UPDATE sessions SET revoked_at = datetime('now') WHERE user_id = ?").run(req.user!.id);
  clearSessionCookie(res);
  logActivity({
    userId: req.user!.id,
    actorUserId: req.user!.id,
    action: 'all_sessions_revoked',
    entityType: 'user',
    entityId: req.user!.customer_code,
    ipAddress: getClientIp(req),
  });
  res.json({ ok: true });
});

router.get('/me', requireAuth, (req: AuthenticatedRequest, res) => {
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user!.id);
  const unreadCount = (
    db.prepare('SELECT COUNT(*) as cnt FROM notifications WHERE user_id = ? AND is_read = 0').get(req.user!.id) as { cnt: number }
  ).cnt;
  issueCsrfToken(res);
  res.json({ user: sanitizeUser(user), unread_notifications: unreadCount });
});

router.post('/verify-email', requireAuth, (req: AuthenticatedRequest, res) => {
  const token = String(req.body?.token || '').trim().toUpperCase();
  const user = db
    .prepare('SELECT id, verification_token, verification_expires_at, email_verified FROM users WHERE id = ?')
    .get(req.user!.id) as any;

  if (!user) {
    res.status(404).json({ error: 'User not found' });
    return;
  }
  if (user.email_verified) {
    res.json({ verified: true });
    return;
  }
  if (!token || !user.verification_token || sha256(token) !== user.verification_token) {
    res.status(400).json({ error: 'Invalid verification code.' });
    return;
  }
  if (user.verification_expires_at && new Date(user.verification_expires_at).getTime() < Date.now()) {
    res.status(400).json({ error: 'Verification code expired. Please request a new code.' });
    return;
  }

  db.prepare(
    "UPDATE users SET email_verified = 1, verification_token = NULL, verification_expires_at = NULL, updated_at = datetime('now') WHERE id = ?"
  ).run(user.id);

  logActivity({ userId: user.id, actorUserId: user.id, action: 'email_verified', entityType: 'user', entityId: user.id });
  res.json({ verified: true });
});

router.post('/resend-verification', requireAuth, async (req: AuthenticatedRequest, res) => {
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user!.id) as any;
  const rawToken = crypto.randomBytes(16).toString('hex').toUpperCase();
  const tokenHash = sha256(rawToken);
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

  db.prepare("UPDATE users SET verification_token = ?, verification_expires_at = ?, updated_at = datetime('now') WHERE id = ?").run(
    tokenHash,
    expiresAt,
    user.id
  );

  await sendTransactionalEmail({
    to: user.email,
    subject: 'Verify Your HelzerX Portal Email Address',
    templateName: 'email_verification',
    heading: 'Email Verification Code',
    preheader: 'Use this code inside Account Settings to verify your email.',
    bodyHtml: `<p>Enter the verification code below inside Account Settings to verify your HelzerX account (expires in 24h):</p>
      <p style="font-size:16px;font-family:monospace;color:#FF6B2C;background:#141419;padding:12px 16px;border-radius:8px;">${rawToken}</p>`,
  });

  res.json({ sent: true });
});

router.post('/forgot-password', async (req, res) => {
  const email = String(req.body?.email || '').trim().toLowerCase();
  const challengeToken = req.body?.challenge_token;
  if (!verifyAuthChallenge(challengeToken)) {
    res.status(400).json({ error: 'Security verification challenge expired. Please retry.' });
    return;
  }
  if (!email) {
    res.status(400).json({ error: 'Email is required.' });
    return;
  }

  const user = db.prepare('SELECT id, email, full_name FROM users WHERE lower(email) = ?').get(email) as any;
  if (user) {
    const rawToken = crypto.randomBytes(24).toString('hex');
    const tokenHash = sha256(rawToken);
    const expiresAt = new Date(Date.now() + 30 * 60 * 1000).toISOString(); // 30-minute expiry
    db.prepare('INSERT INTO password_resets (user_id, token_hash, expires_at) VALUES (?, ?, ?)').run(
      user.id,
      tokenHash,
      expiresAt
    );

    await sendTransactionalEmail({
      to: user.email,
      subject: 'HelzerX Portal — Password Reset Instructions',
      templateName: 'password_reset',
      heading: 'Password Reset Request',
      preheader: 'Use this secure reset token within 30 minutes.',
      bodyHtml: `<p>Hello ${escapeHtml(user.full_name)},</p>
        <p>We received a request to reset your HelzerX Customer Portal password. Use the token below within 30 minutes:</p>
        <p style="font-family:monospace;color:#FF6B2C;background:#141419;padding:12px;border-radius:8px;">${rawToken}</p>`,
    });
  }

  res.json({
    message: 'If an account matches that email, password reset instructions have been sent to your inbox.',
  });
});

router.post('/reset-password', (req, res) => {
  const schema = z.object({
    token: z.string().min(10),
    new_password: z.string().min(12).max(128),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Valid reset token and strong 12+ character password required.' });
    return;
  }

  const tokenHash = sha256(parsed.data.token.trim());
  const row = db
    .prepare("SELECT pr.*, u.email, u.full_name FROM password_resets pr JOIN users u ON u.id = pr.user_id WHERE pr.token_hash = ? AND pr.used_at IS NULL AND pr.expires_at > datetime('now')")
    .get(tokenHash) as any;

  if (!row) {
    res.status(400).json({ error: 'Reset token is invalid or expired.' });
    return;
  }

  const pwErr = validateStrongPassword(parsed.data.new_password, { email: row.email, fullName: row.full_name });
  if (pwErr) {
    res.status(400).json({ error: pwErr });
    return;
  }

  const newHash = bcrypt.hashSync(parsed.data.new_password, BCRYPT_ROUNDS);
  db.transaction(() => {
    db.prepare(
      "UPDATE users SET password_hash = ?, failed_login_attempts = 0, locked_until = NULL, updated_at = datetime('now') WHERE id = ?"
    ).run(newHash, row.user_id);
    db.prepare("UPDATE password_resets SET used_at = datetime('now') WHERE id = ?").run(row.id);
    db.prepare("UPDATE sessions SET revoked_at = datetime('now') WHERE user_id = ?").run(row.user_id);
  })();

  logActivity({ userId: row.user_id, actorUserId: row.user_id, action: 'password_reset_completed', entityType: 'user', entityId: row.user_id });
  res.json({ ok: true });
});

router.post('/2fa/setup', requireAuth, (req: AuthenticatedRequest, res) => {
  const secret = generateBase32Secret(20);
  db.prepare('UPDATE users SET two_factor_secret = ? WHERE id = ?').run(secret, req.user!.id);
  const issuer = encodeURIComponent('HelzerX Portal');
  const acct = encodeURIComponent(req.user!.email);
  const otpauthUrl = `otpauth://totp/${issuer}:${acct}?secret=${secret}&issuer=${issuer}`;
  res.json({ secret, otpauth_url: otpauthUrl });
});

router.post('/2fa/enable', requireAuth, (req: AuthenticatedRequest, res) => {
  const code = String(req.body?.code || '');
  const user = db.prepare('SELECT two_factor_secret FROM users WHERE id = ?').get(req.user!.id) as any;
  if (!user?.two_factor_secret || !verifyTotpCode(user.two_factor_secret, code)) {
    res.status(400).json({ error: 'Invalid 6-digit authenticator code.' });
    return;
  }
  const { plainCodes, hashedCodes } = generateRecoveryCodes(8);
  db.prepare(
    "UPDATE users SET two_factor_enabled = 1, two_factor_recovery_codes_json = ?, updated_at = datetime('now') WHERE id = ?"
  ).run(JSON.stringify(hashedCodes), req.user!.id);

  logActivity({ userId: req.user!.id, actorUserId: req.user!.id, action: '2fa_enabled', entityType: 'user', entityId: req.user!.id });
  res.json({ enabled: true, recovery_codes: plainCodes });
});

router.post('/2fa/regenerate-recovery', requireAuth, (req: AuthenticatedRequest, res) => {
  const password = String(req.body?.password || '');
  const user = db.prepare('SELECT password_hash, two_factor_enabled FROM users WHERE id = ?').get(req.user!.id) as any;
  if (!user || !user.two_factor_enabled || !bcrypt.compareSync(password, user.password_hash)) {
    res.status(401).json({ error: 'Valid password and enabled 2FA required.' });
    return;
  }
  const { plainCodes, hashedCodes } = generateRecoveryCodes(8);
  db.prepare("UPDATE users SET two_factor_recovery_codes_json = ?, updated_at = datetime('now') WHERE id = ?").run(
    JSON.stringify(hashedCodes),
    req.user!.id
  );
  res.json({ recovery_codes: plainCodes });
});

router.post('/2fa/disable', requireAuth, (req: AuthenticatedRequest, res) => {
  const password = String(req.body?.password || '');
  const user = db.prepare('SELECT password_hash FROM users WHERE id = ?').get(req.user!.id) as any;
  if (!user || !bcrypt.compareSync(password, user.password_hash)) {
    res.status(401).json({ error: 'Current password is required to disable 2FA.' });
    return;
  }
  db.prepare(
    "UPDATE users SET two_factor_enabled = 0, two_factor_secret = NULL, two_factor_recovery_codes_json = '[]', updated_at = datetime('now') WHERE id = ?"
  ).run(req.user!.id);
  logActivity({ userId: req.user!.id, actorUserId: req.user!.id, action: '2fa_disabled', entityType: 'user', entityId: req.user!.id });
  res.json({ disabled: true });
});

router.get('/sessions', requireAuth, (req: AuthenticatedRequest, res) => {
  const sessions = db
    .prepare(
      "SELECT id, token_jti, ip_address, user_agent, expires_at, revoked_at, created_at FROM sessions WHERE user_id = ? AND revoked_at IS NULL AND expires_at > datetime('now') ORDER BY created_at DESC"
    )
    .all(req.user!.id)
    .map((s: any) => ({ ...s, is_current: s.token_jti === req.sessionJti }));
  res.json({ sessions });
});

router.delete('/sessions/:id', requireAuth, (req: AuthenticatedRequest, res) => {
  const id = Number(req.params.id);
  db.prepare("UPDATE sessions SET revoked_at = datetime('now') WHERE id = ? AND user_id = ?").run(id, req.user!.id);
  res.json({ ok: true });
});

router.get('/login-history', requireAuth, (req: AuthenticatedRequest, res) => {
  const history = db
    .prepare('SELECT id, ip_address, user_agent, success, failure_reason, created_at FROM login_history WHERE user_id = ? ORDER BY created_at DESC LIMIT 25')
    .all(req.user!.id);
  res.json({ history });
});

export default router;
