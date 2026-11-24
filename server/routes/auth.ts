import { Router } from 'express';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { db, generateCustomerCode } from '../db';
import {
  AuthenticatedRequest,
  clearSessionCookie,
  generateBase32Secret,
  getClientIp,
  logActivity,
  requireAuth,
  sanitizeUser,
  setSessionCookie,
  signSessionToken,
  verifyTotpCode,
} from '../services/security';
import { createInAppNotification, sendDiscordWebhook, sendTransactionalEmail } from '../services/notifications';

const router = Router();

const registerSchema = z.object({
  full_name: z.string().trim().min(2, 'Full name is required').max(120),
  email: z.string().trim().email('Valid email is required').max(180),
  password: z.string().min(8, 'Password must be at least 8 characters').max(128),
  mobile: z.string().trim().min(5, 'Mobile number is required').max(40),
  country: z.string().trim().min(2, 'Country is required').max(80),
  city: z.string().trim().min(2, 'City is required').max(80),
  billing_address: z.string().trim().min(4, 'Billing address is required').max(250),
  postal_code: z.string().trim().min(2, 'Postal code is required').max(30),
  company_name: z.string().trim().max(120).optional().default(''),
  discord_username: z.string().trim().max(80).optional().default(''),
});

const loginSchema = z.object({
  email: z.string().trim().email(),
  password: z.string().min(1),
  totp_code: z.string().optional(),
});

router.post('/register', async (req, res) => {
  const parsed = registerSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid registration data' });
    return;
  }

  const data = parsed.data;
  const normalizedEmail = data.email.toLowerCase();
  const existing = db.prepare('SELECT id FROM users WHERE lower(email) = ?').get(normalizedEmail);
  if (existing) {
    res.status(409).json({ error: 'An account with this email address already exists.' });
    return;
  }

  const passwordHash = bcrypt.hashSync(data.password, 10);
  const customerCode = generateCustomerCode();
  const verificationToken = crypto.randomBytes(24).toString('hex');

  const insertTx = db.transaction(() => {
    const result = db
      .prepare(`
        INSERT INTO users (
          customer_code, email, password_hash, role, full_name, mobile, country, city,
          billing_address, postal_code, company_name, discord_username, email_verified, verification_token
        ) VALUES (?, ?, ?, 'customer', ?, ?, ?, ?, ?, ?, ?, ?, 0, ?)
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
        verificationToken
      );
    const userId = Number(result.lastInsertRowid);

    db.prepare(`
      INSERT INTO billing_addresses (user_id, label, full_name, company_name, address_line, city, postal_code, country, is_default)
      VALUES (?, 'Primary Address', ?, ?, ?, ?, ?, ?, 1)
    `).run(userId, data.full_name, data.company_name, data.billing_address, data.city, data.postal_code, data.country);

    return userId;
  });

  const userId = insertTx();
  const jti = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
  const ip = getClientIp(req);
  const ua = req.headers['user-agent'] || '';

  db.prepare('INSERT INTO sessions (user_id, token_jti, ip_address, user_agent, expires_at) VALUES (?, ?, ?, ?, ?)').run(
    userId,
    jti,
    ip,
    ua,
    expiresAt
  );

  db.prepare('INSERT INTO login_history (user_id, email, ip_address, user_agent, success) VALUES (?, ?, ?, ?, 1)').run(
    userId,
    normalizedEmail,
    ip,
    ua
  );

  const authUser = {
    id: userId,
    customer_code: customerCode,
    email: normalizedEmail,
    role: 'customer' as const,
    full_name: data.full_name,
    status: 'active',
  };

  setSessionCookie(res, signSessionToken(authUser, jti));

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
    message: `Your customer ID ${customerCode} has been provisioned. Please verify your email address in Account Settings.`,
    category: 'account',
    linkTarget: 'settings',
  });

  const baseUrl = process.env.APP_URL || `${req.protocol}://${req.get('host')}`;
  await sendTransactionalEmail({
    to: normalizedEmail,
    subject: `Welcome to HelzerX Technologies — Account ${customerCode}`,
    templateName: 'account_registration',
    heading: `Welcome, ${data.full_name}`,
    preheader: `Your HelzerX customer ID ${customerCode} is active.`,
    bodyHtml: `
      <p>Thank you for registering with <strong>HelzerX Technologies</strong>.</p>
      <p><strong>Customer ID:</strong> ${customerCode}<br/>
      <strong>Verification Code:</strong> <code style="color:#FF6B2C;">${verificationToken}</code></p>
      <p>You can place service orders, download automated invoices, upload payment receipts, and open support tickets directly inside your portal.</p>
    `,
    ctaLabel: 'Open Customer Portal',
    ctaUrl: baseUrl,
  });

  await sendDiscordWebhook({
    event: 'customer.registered',
    title: 'New Customer Registered',
    description: `Customer **${customerCode}** (${data.country}) joined the HelzerX Portal.`,
    fields: [
      { name: 'Customer ID', value: customerCode, inline: true },
      { name: 'Company', value: data.company_name || 'Individual', inline: true },
    ],
  });

  const userRow = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
  res.status(201).json({ user: sanitizeUser(userRow), verification_token_preview: verificationToken });
});

router.post('/login', (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Valid email and password are required.' });
    return;
  }

  const normalizedEmail = parsed.data.email.toLowerCase();
  const ip = getClientIp(req);
  const ua = req.headers['user-agent'] || '';

  const user = db.prepare('SELECT * FROM users WHERE lower(email) = ?').get(normalizedEmail) as any;
  if (!user || !bcrypt.compareSync(parsed.data.password, user.password_hash)) {
    db.prepare(
      'INSERT INTO login_history (user_id, email, ip_address, user_agent, success, failure_reason) VALUES (?, ?, ?, ?, 0, ?)'
    ).run(user?.id ?? null, normalizedEmail, ip, ua, 'Invalid credentials');
    res.status(401).json({ error: 'Invalid email or password.' });
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
    if (!user.two_factor_secret || !verifyTotpCode(user.two_factor_secret, parsed.data.totp_code)) {
      db.prepare(
        'INSERT INTO login_history (user_id, email, ip_address, user_agent, success, failure_reason) VALUES (?, ?, ?, ?, 0, ?)'
      ).run(user.id, normalizedEmail, ip, ua, 'Invalid 2FA code');
      res.status(401).json({ error: 'Invalid two-factor authentication code.' });
      return;
    }
  }

  const jti = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
  db.prepare('INSERT INTO sessions (user_id, token_jti, ip_address, user_agent, expires_at) VALUES (?, ?, ?, ?, ?)').run(
    user.id,
    jti,
    ip,
    ua,
    expiresAt
  );
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

router.get('/me', requireAuth, (req: AuthenticatedRequest, res) => {
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user!.id);
  const unreadCount = (
    db.prepare('SELECT COUNT(*) as cnt FROM notifications WHERE user_id = ? AND is_read = 0').get(req.user!.id) as { cnt: number }
  ).cnt;
  res.json({ user: sanitizeUser(user), unread_notifications: unreadCount });
});

router.post('/verify-email', requireAuth, (req: AuthenticatedRequest, res) => {
  const token = String(req.body?.token || '').trim();
  const user = db.prepare('SELECT id, verification_token, email_verified FROM users WHERE id = ?').get(req.user!.id) as any;
  if (!user) {
    res.status(404).json({ error: 'User not found' });
    return;
  }
  if (user.email_verified) {
    res.json({ verified: true });
    return;
  }
  if (!token || token !== user.verification_token) {
    res.status(400).json({ error: 'Invalid verification code.' });
    return;
  }
  db.prepare("UPDATE users SET email_verified = 1, verification_token = NULL, updated_at = datetime('now') WHERE id = ?").run(user.id);
  logActivity({ userId: user.id, actorUserId: user.id, action: 'email_verified', entityType: 'user', entityId: user.id });
  res.json({ verified: true });
});

router.post('/resend-verification', requireAuth, async (req: AuthenticatedRequest, res) => {
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user!.id) as any;
  const newToken = crypto.randomBytes(24).toString('hex');
  db.prepare("UPDATE users SET verification_token = ?, updated_at = datetime('now') WHERE id = ?").run(newToken, user.id);

  await sendTransactionalEmail({
    to: user.email,
    subject: 'Verify Your HelzerX Portal Email Address',
    templateName: 'email_verification',
    heading: 'Email Verification Code',
    preheader: `Verification code: ${newToken}`,
    bodyHtml: `<p>Enter the verification code below inside Account Settings to verify your HelzerX account:</p>
      <p style="font-size:16px;font-family:monospace;color:#FF6B2C;background:#141419;padding:12px 16px;border-radius:8px;">${newToken}</p>`,
  });

  res.json({ sent: true, verification_token_preview: newToken });
});

router.post('/forgot-password', async (req, res) => {
  const email = String(req.body?.email || '').trim().toLowerCase();
  if (!email) {
    res.status(400).json({ error: 'Email is required.' });
    return;
  }
  const user = db.prepare('SELECT id, email, full_name FROM users WHERE lower(email) = ?').get(email) as any;
  let resetTokenPreview: string | undefined;

  if (user) {
    const rawToken = crypto.randomBytes(24).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();
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
      preheader: 'Use this secure reset token to update your password.',
      bodyHtml: `<p>Hello ${user.full_name},</p>
        <p>We received a request to reset your HelzerX Customer Portal password. Use the token below within 60 minutes:</p>
        <p style="font-family:monospace;color:#FF6B2C;background:#141419;padding:12px;border-radius:8px;">${rawToken}</p>`,
    });

    if (!process.env.RESEND_API_KEY) {
      resetTokenPreview = rawToken;
    }
  }

  res.json({
    message: 'If an account matches that email, password reset instructions have been dispatched.',
    reset_token_preview: resetTokenPreview,
  });
});

router.post('/reset-password', (req, res) => {
  const schema = z.object({
    token: z.string().min(10),
    new_password: z.string().min(8).max(128),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Valid reset token and minimum 8-character password required.' });
    return;
  }

  const tokenHash = crypto.createHash('sha256').update(parsed.data.token.trim()).digest('hex');
  const row = db
    .prepare("SELECT * FROM password_resets WHERE token_hash = ? AND used_at IS NULL AND expires_at > datetime('now')")
    .get(tokenHash) as any;

  if (!row) {
    res.status(400).json({ error: 'Reset token is invalid or expired.' });
    return;
  }

  const newHash = bcrypt.hashSync(parsed.data.new_password, 10);
  db.transaction(() => {
    db.prepare("UPDATE users SET password_hash = ?, updated_at = datetime('now') WHERE id = ?").run(newHash, row.user_id);
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
  db.prepare("UPDATE users SET two_factor_enabled = 1, updated_at = datetime('now') WHERE id = ?").run(req.user!.id);
  logActivity({ userId: req.user!.id, actorUserId: req.user!.id, action: '2fa_enabled', entityType: 'user', entityId: req.user!.id });
  res.json({ enabled: true });
});

router.post('/2fa/disable', requireAuth, (req: AuthenticatedRequest, res) => {
  const password = String(req.body?.password || '');
  const user = db.prepare('SELECT password_hash FROM users WHERE id = ?').get(req.user!.id) as any;
  if (!user || !bcrypt.compareSync(password, user.password_hash)) {
    res.status(401).json({ error: 'Current password is required to disable 2FA.' });
    return;
  }
  db.prepare("UPDATE users SET two_factor_enabled = 0, two_factor_secret = NULL, updated_at = datetime('now') WHERE id = ?").run(req.user!.id);
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
