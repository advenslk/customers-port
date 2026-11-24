import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import jwt from 'jsonwebtoken';
import { Request, Response, NextFunction } from 'express';
import { db } from '../db';

function resolveJwtSecret(): string {
  if (process.env.JWT_SECRET && process.env.JWT_SECRET.length >= 32) {
    return process.env.JWT_SECRET;
  }
  const secretFile = path.resolve(process.cwd(), 'data', '.jwt_secret');
  const dir = path.dirname(secretFile);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  if (fs.existsSync(secretFile)) {
    const existing = fs.readFileSync(secretFile, 'utf8').trim();
    if (existing.length >= 64) return existing;
  }
  const generated = crypto.randomBytes(64).toString('hex');
  fs.writeFileSync(secretFile, generated, { mode: 0o600 });
  return generated;
}

export const JWT_SECRET = resolveJwtSecret();
export const SESSION_COOKIE_NAME = 'hx_session';
export const CSRF_COOKIE_NAME = 'hx_csrf';

export interface AuthUser {
  id: number;
  customer_code: string;
  email: string;
  role: 'customer' | 'admin' | 'super_admin';
  full_name: string;
  status: string;
}

export interface AuthenticatedRequest extends Request {
  user?: AuthUser;
  sessionJti?: string;
}

export function sha256(input: string): string {
  return crypto.createHash('sha256').update(input).digest('hex');
}

export function computeSessionFingerprint(req: Request): string {
  const ua = String(req.headers['user-agent'] || '');
  return sha256(ua);
}

export function escapeHtml(str: string): string {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function signSessionToken(user: AuthUser, jti: string): string {
  return jwt.sign(
    {
      sub: user.id,
      code: user.customer_code,
      email: user.email,
      role: user.role,
      jti,
    },
    JWT_SECRET,
    { expiresIn: '24h', algorithm: 'HS256' }
  );
}

export function setSessionCookie(res: Response, token: string): void {
  const isProd = process.env.NODE_ENV === 'production';
  res.cookie(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: isProd,
    maxAge: 24 * 60 * 60 * 1000,
    path: '/',
  });
}

export function clearSessionCookie(res: Response): void {
  res.clearCookie(SESSION_COOKIE_NAME, { path: '/' });
}

export function issueCsrfToken(res: Response): string {
  const token = crypto.randomBytes(32).toString('hex');
  const isProd = process.env.NODE_ENV === 'production';
  res.cookie(CSRF_COOKIE_NAME, token, {
    httpOnly: false, // readable by SPA to reflect in X-CSRF-Token header
    sameSite: 'lax',
    secure: isProd,
    maxAge: 24 * 60 * 60 * 1000,
    path: '/',
  });
  return token;
}

export function verifyCsrfMiddleware(req: Request, res: Response, next: NextFunction): void {
  const safeMethods = new Set(['GET', 'HEAD', 'OPTIONS']);
  if (safeMethods.has(req.method)) {
    next();
    return;
  }

  // Stripe webhooks authenticate via Stripe HMAC signature
  if (req.path === '/webhooks/stripe' || req.originalUrl === '/api/webhooks/stripe') {
    next();
    return;
  }

  const cookieToken = req.cookies?.[CSRF_COOKIE_NAME];
  const headerToken = req.headers['x-csrf-token'];

  if (typeof cookieToken !== 'string' || typeof headerToken !== 'string' || cookieToken.length < 32 || headerToken.length < 32) {
    res.status(403).json({ error: 'Security token missing or expired. Please refresh and try again.' });
    return;
  }

  const a = Buffer.from(cookieToken);
  const b = Buffer.from(headerToken);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    res.status(403).json({ error: 'CSRF validation failed.' });
    return;
  }

  next();
}

/**
 * Signed anti-automation challenge for login, registration, password reset, and checkout
 */
export function createAuthChallenge(): string {
  const nonce = crypto.randomBytes(16).toString('hex');
  const issuedAt = Date.now();
  const payload = `${nonce}.${issuedAt}`;
  const sig = crypto.createHmac('sha256', JWT_SECRET).update(payload).digest('hex');
  return `${payload}.${sig}`;
}

export function verifyAuthChallenge(token: unknown): boolean {
  if (typeof token !== 'string') return false;
  const parts = token.split('.');
  if (parts.length !== 3) return false;
  const [nonce, issuedAtStr, sig] = parts;
  if (!nonce || !issuedAtStr || !sig) return false;

  const issuedAt = Number(issuedAtStr);
  if (!Number.isFinite(issuedAt)) return false;

  const ageMs = Date.now() - issuedAt;
  // Valid for 15 minutes
  if (ageMs < 0 || ageMs > 15 * 60 * 1000) return false;

  const expectedSig = crypto.createHmac('sha256', JWT_SECRET).update(`${nonce}.${issuedAtStr}`).digest('hex');
  const a = Buffer.from(sig);
  const b = Buffer.from(expectedSig);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

const COMMON_WEAK_PASSWORDS = new Set([
  'password1234',
  'admin1234567',
  'qwerty123456',
  '123456789012',
  'helzerx12345',
  'welcome12345',
  'letmein12345',
]);

export function validateStrongPassword(password: string, context: { email?: string; fullName?: string } = {}): string | null {
  if (password.length < 12) {
    return 'Password must be at least 12 characters long.';
  }
  if (password.length > 128) {
    return 'Password must not exceed 128 characters.';
  }
  if (!/[A-Z]/.test(password)) {
    return 'Password must include at least one uppercase letter.';
  }
  if (!/[a-z]/.test(password)) {
    return 'Password must include at least one lowercase letter.';
  }
  if (!/[0-9]/.test(password)) {
    return 'Password must include at least one number.';
  }
  if (!/[^A-Za-z0-9]/.test(password)) {
    return 'Password must include at least one special character (e.g. !@#$%^&*).';
  }
  const lower = password.toLowerCase();
  if (COMMON_WEAK_PASSWORDS.has(lower)) {
    return 'Password is too common. Choose a unique passphrase.';
  }
  if (context.email) {
    const localPart = context.email.split('@')[0]?.toLowerCase();
    if (localPart && localPart.length >= 4 && lower.includes(localPart)) {
      return 'Password must not contain your email username.';
    }
  }
  if (context.fullName) {
    const tokens = context.fullName.toLowerCase().split(/\s+/).filter((t) => t.length >= 4);
    for (const tok of tokens) {
      if (lower.includes(tok)) {
        return 'Password must not contain your name.';
      }
    }
  }
  return null;
}

export function validateUploadedFileMagicBytes(filePath: string, mimeType: string): boolean {
  try {
    const fd = fs.openSync(filePath, 'r');
    const buf = Buffer.alloc(12);
    const bytesRead = fs.readSync(fd, buf, 0, 12, 0);
    fs.closeSync(fd);

    if (bytesRead < 4) return false;

    if (mimeType === 'image/jpeg') {
      return buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff;
    }
    if (mimeType === 'image/png') {
      return buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47;
    }
    if (mimeType === 'image/webp') {
      return buf.subarray(0, 4).toString('ascii') === 'RIFF' && buf.subarray(8, 12).toString('ascii') === 'WEBP';
    }
    if (mimeType === 'application/pdf') {
      return buf.subarray(0, 4).toString('ascii') === '%PDF';
    }
    if (mimeType === 'text/plain') {
      // Ensure no null bytes in plain text
      for (let i = 0; i < bytesRead; i++) {
        if (buf[i] === 0x00) return false;
      }
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

export function getClientIp(req: Request): string {
  const fwd = req.headers['x-forwarded-for'];
  if (typeof fwd === 'string' && fwd.length > 0) {
    return fwd.split(',')[0].trim();
  }
  return req.ip || req.socket.remoteAddress || 'unknown';
}

export function logActivity(params: {
  userId?: number | null;
  actorUserId?: number | null;
  action: string;
  entityType: string;
  entityId?: string | number;
  details?: Record<string, unknown>;
  ipAddress?: string;
}): void {
  try {
    db.prepare(`
      INSERT INTO activity_logs (user_id, actor_user_id, action, entity_type, entity_id, details_json, ip_address)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      params.userId ?? null,
      params.actorUserId ?? null,
      params.action,
      params.entityType,
      String(params.entityId ?? ''),
      JSON.stringify(params.details ?? {}),
      params.ipAddress ?? ''
    );
  } catch (err) {
    console.error('Activity log error:', err);
  }
}

export function sanitizeUser(row: any) {
  if (!row) return null;
  const {
    password_hash: _ph,
    two_factor_secret: _tfs,
    two_factor_recovery_codes_json: _rc,
    verification_token: _vt,
    verification_expires_at: _ve,
    failed_login_attempts: _fla,
    locked_until: _lu,
    ...safe
  } = row;
  return {
    ...safe,
    email_verified: Boolean(safe.email_verified),
    two_factor_enabled: Boolean(safe.two_factor_enabled),
    notify_email: Boolean(safe.notify_email),
    notify_discord: Boolean(safe.notify_discord),
  };
}

export function requireAuth(req: AuthenticatedRequest, res: Response, next: NextFunction): void {
  const token = req.cookies?.[SESSION_COOKIE_NAME] || extractBearer(req);
  if (!token) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET, { algorithms: ['HS256'] }) as unknown as { sub: number; jti: string };
    const session = db
      .prepare("SELECT * FROM sessions WHERE token_jti = ? AND revoked_at IS NULL AND expires_at > datetime('now')")
      .get(decoded.jti) as any;

    if (!session) {
      clearSessionCookie(res);
      res.status(401).json({ error: 'Session expired or revoked' });
      return;
    }

    // Bind session to User-Agent fingerprint to block hijacked cookie replay across devices
    const currentFp = computeSessionFingerprint(req);
    if (session.session_fingerprint && session.session_fingerprint !== currentFp) {
      db.prepare("UPDATE sessions SET revoked_at = datetime('now') WHERE id = ?").run(session.id);
      clearSessionCookie(res);
      res.status(401).json({ error: 'Session device mismatch. Please sign in again.' });
      return;
    }

    const user = db
      .prepare('SELECT id, customer_code, email, role, full_name, status FROM users WHERE id = ?')
      .get(decoded.sub) as AuthUser | undefined;

    if (!user) {
      res.status(401).json({ error: 'User account not found' });
      return;
    }

    if (user.status === 'suspended') {
      res.status(403).json({ error: 'Account suspended. Contact HelzerX support.' });
      return;
    }

    req.user = user;
    req.sessionJti = decoded.jti;
    next();
  } catch {
    clearSessionCookie(res);
    res.status(401).json({ error: 'Invalid authentication token' });
  }
}

export function requireAdmin(req: AuthenticatedRequest, res: Response, next: NextFunction): void {
  if (!req.user) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }
  if (req.user.role !== 'admin' && req.user.role !== 'super_admin') {
    res.status(403).json({ error: 'Administrator privileges required' });
    return;
  }
  next();
}

function extractBearer(req: Request): string | null {
  const auth = req.headers.authorization;
  if (auth && auth.startsWith('Bearer ')) {
    return auth.slice(7);
  }
  return null;
}

/**
 * RFC 6238 TOTP Two-Factor Authentication + Single-Use Recovery Codes
 */
const BASE32_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export function generateBase32Secret(length = 20): string {
  const bytes = crypto.randomBytes(length);
  let result = '';
  for (let i = 0; i < bytes.length; i++) {
    result += BASE32_CHARS[bytes[i] % 32];
  }
  return result;
}

function base32ToBuffer(base32: string): Buffer {
  const clean = base32.toUpperCase().replace(/[^A-Z2-7]/g, '');
  let bits = '';
  for (const char of clean) {
    const val = BASE32_CHARS.indexOf(char);
    if (val >= 0) bits += val.toString(2).padStart(5, '0');
  }
  const bytes: number[] = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) {
    bytes.push(parseInt(bits.slice(i, i + 8), 2));
  }
  return Buffer.from(bytes);
}

export function generateTotpCode(secret: string, timeStepOffset = 0): string {
  const counter = Math.floor(Date.now() / 1000 / 30) + timeStepOffset;
  const buf = Buffer.alloc(8);
  buf.writeUInt32BE(Math.floor(counter / 0x100000000), 0);
  buf.writeUInt32BE(counter >>> 0, 4);
  const key = base32ToBuffer(secret);
  const hmac = crypto.createHmac('sha1', key).update(buf).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const code =
    ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) |
    (hmac[offset + 3] & 0xff);
  return String(code % 1000000).padStart(6, '0');
}

export function verifyTotpCode(secret: string, token: string): boolean {
  const clean = token.trim();
  if (!/^\d{6}$/.test(clean)) return false;
  for (const offset of [-1, 0, 1]) {
    if (generateTotpCode(secret, offset) === clean) return true;
  }
  return false;
}

export function generateRecoveryCodes(count = 8): { plainCodes: string[]; hashedCodes: string[] } {
  const plainCodes: string[] = [];
  const hashedCodes: string[] = [];
  for (let i = 0; i < count; i++) {
    const part1 = crypto.randomBytes(2).toString('hex').toUpperCase();
    const part2 = crypto.randomBytes(2).toString('hex').toUpperCase();
    const code = `${part1}-${part2}`;
    plainCodes.push(code);
    hashedCodes.push(sha256(code));
  }
  return { plainCodes, hashedCodes };
}

export function consumeRecoveryCode(userId: number, submittedCode: string): boolean {
  const clean = submittedCode.trim().toUpperCase();
  if (!/^[A-F0-9]{4}-[A-F0-9]{4}$/.test(clean)) return false;
  const row = db.prepare('SELECT two_factor_recovery_codes_json FROM users WHERE id = ?').get(userId) as
    | { two_factor_recovery_codes_json: string }
    | undefined;
  if (!row) return false;
  let hashes: string[] = [];
  try {
    hashes = JSON.parse(row.two_factor_recovery_codes_json || '[]');
  } catch {
    return false;
  }
  const targetHash = sha256(clean);
  const idx = hashes.indexOf(targetHash);
  if (idx === -1) return false;
  hashes.splice(idx, 1);
  db.prepare('UPDATE users SET two_factor_recovery_codes_json = ? WHERE id = ?').run(JSON.stringify(hashes), userId);
  return true;
}
