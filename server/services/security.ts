import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { Request, Response, NextFunction } from 'express';
import { db } from '../db';

const JWT_SECRET = process.env.JWT_SECRET || crypto.createHash('sha256').update('helzerx-dev-fallback-secret-change-in-prod').digest('hex');
export const SESSION_COOKIE_NAME = 'hx_session';

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
    { expiresIn: '7d' }
  );
}

export function setSessionCookie(res: Response, token: string): void {
  const isProd = process.env.NODE_ENV === 'production';
  res.cookie(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: isProd,
    maxAge: 7 * 24 * 60 * 60 * 1000,
    path: '/',
  });
}

export function clearSessionCookie(res: Response): void {
  res.clearCookie(SESSION_COOKIE_NAME, { path: '/' });
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
    verification_token: _vt,
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
    const decoded = jwt.verify(token, JWT_SECRET) as unknown as { sub: number; jti: string };
    const session = db
      .prepare("SELECT * FROM sessions WHERE token_jti = ? AND revoked_at IS NULL AND expires_at > datetime('now')")
      .get(decoded.jti) as any;

    if (!session) {
      clearSessionCookie(res);
      res.status(401).json({ error: 'Session expired or revoked' });
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
 * RFC 6238 TOTP Two-Factor Authentication helpers (Base32 + HMAC-SHA1)
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
