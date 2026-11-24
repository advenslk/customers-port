import { Router } from 'express';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import fs from 'fs';
import path from 'path';
import multer from 'multer';
import Stripe from 'stripe';
import { z } from 'zod';
import {
  db,
  generateCustomerCode,
  generateInvoiceNumber,
  generateOrderNumber,
  generatePaymentNumber,
  generateTicketNumber,
  generateTransactionCode,
} from '../db';
import jwt from 'jsonwebtoken';
import {
  AuthenticatedRequest,
  JWT_SECRET,
  computeSessionFingerprint,
  escapeHtml,
  getClientIp,
  issueCsrfToken,
  logActivity,
  requireAuth,
  sanitizeUser,
  setSessionCookie,
  sha256,
  signSessionToken,
  validateStrongPassword,
  validateUploadedFileMagicBytes,
  verifyAuthChallenge,
} from '../services/security';
import { createInAppNotification, notifyAllAdmins, sendDiscordWebhook, sendTransactionalEmail } from '../services/notifications';
import { formatMoney, generateInvoicePdfBuffer } from '../services/pdfInvoice';

const router = Router();

const uploadsDir = path.resolve(process.cwd(), 'uploads');
const receiptsDir = path.join(uploadsDir, 'receipts');
const ticketsDir = path.join(uploadsDir, 'tickets');
for (const dir of [uploadsDir, receiptsDir, ticketsDir]) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

const allowedMimeTypes = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/pdf',
  'text/plain',
]);

function makeUploader(dest: string) {
  return multer({
    storage: multer.diskStorage({
      destination: (_req, _file, cb) => cb(null, dest),
      filename: (_req, file, cb) => {
        const ext = path.extname(file.originalname).toLowerCase().replace(/[^a-z0-9.]/g, '') || '.bin';
        cb(null, `${Date.now()}-${crypto.randomUUID()}${ext}`);
      },
    }),
    limits: { fileSize: 5 * 1024 * 1024 },
    fileFilter: (_req, file, cb) => {
      if (!allowedMimeTypes.has(file.mimetype)) {
        cb(new Error('Unsupported file type. Allowed: JPG, PNG, WEBP, PDF, TXT (max 5MB).'));
        return;
      }
      cb(null, true);
    },
  });
}

const uploadReceipt = makeUploader(receiptsDir);
const uploadTicketAttachment = makeUploader(ticketsDir);

const stripeClient = process.env.STRIPE_SECRET_KEY ? new Stripe(process.env.STRIPE_SECRET_KEY) : null;

// Checkout & Order Submission (works both logged-in or registering during checkout)
const checkoutSchema = z.object({
  // Personal info
  full_name: z.string().trim().min(2, 'Full name is required').max(120),
  email: z.string().trim().email('Valid email address is required').max(180),
  password: z.string().min(12, 'Password must be at least 12 characters').max(128).optional(),
  challenge_token: z.string().optional(),
  mobile: z.string().trim().min(5, 'Mobile number is required').max(40),
  country: z.string().trim().min(2, 'Country is required').max(80),
  city: z.string().trim().min(2, 'City is required').max(80),
  billing_address: z.string().trim().min(4, 'Billing address is required').max(250),
  postal_code: z.string().trim().min(2, 'Postal code is required').max(30),
  company_name: z.string().trim().max(120).optional().default(''),
  discord_username: z.string().trim().max(80).optional().default(''),
  // Order info
  product_id: z.number().int().positive(),
  package_id: z.number().int().positive(),
  subscription_duration: z.string().trim().min(2).max(60),
  quantity: z.number().int().min(1).max(100),
  requirements: z.string().trim().max(2000).optional().default(''),
  special_instructions: z.string().trim().max(2000).optional().default(''),
  promo_code: z.string().trim().max(40).optional().default(''),
  payment_method: z.enum(['Bank Transfer', 'Stripe', 'Manual Payment', 'Cryptocurrency']).default('Bank Transfer'),
  // Legal acceptances
  accept_terms: z.literal(true, { message: 'You must accept the Terms & Conditions.' }),
  accept_privacy: z.literal(true, { message: 'You must accept the Privacy Policy.' }),
  accept_refund: z.literal(true, { message: 'You must accept the Refund Policy.' }),
});

router.post('/checkout', async (req: AuthenticatedRequest, res) => {
  const parsed = checkoutSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid checkout fields.' });
    return;
  }

  const data = parsed.data;
  const normalizedEmail = data.email.toLowerCase();

  // Check if user is logged in via cookie manually (optional auth for checkout)
  let currentUserId = req.user?.id || null;
  if (!currentUserId && req.cookies?.hx_session) {
    try {
      const decoded = jwt.verify(req.cookies.hx_session, JWT_SECRET, { algorithms: ['HS256'] }) as unknown as {
        sub: number;
        jti: string;
      };
      const sess = db
        .prepare("SELECT id, session_fingerprint FROM sessions WHERE token_jti = ? AND revoked_at IS NULL AND expires_at > datetime('now')")
        .get(decoded.jti) as any;
      const currentFp = computeSessionFingerprint(req);
      if (sess && (!sess.session_fingerprint || sess.session_fingerprint === currentFp)) {
        currentUserId = decoded.sub;
      }
    } catch {
      currentUserId = null;
    }
  }

  if (!currentUserId) {
    if (!verifyAuthChallenge(data.challenge_token)) {
      res.status(400).json({ error: 'Security verification challenge expired. Please refresh and try again.' });
      return;
    }
    if (!data.password) {
      res.status(400).json({ error: 'Please provide a strong password (12+ characters) to create your customer account.' });
      return;
    }
    const pwErr = validateStrongPassword(data.password, { email: normalizedEmail, fullName: data.full_name });
    if (pwErr) {
      res.status(400).json({ error: pwErr });
      return;
    }
  }

  const product = db.prepare('SELECT * FROM products WHERE id = ? AND is_active = 1').get(data.product_id) as any;
  const pkg = db.prepare('SELECT * FROM packages WHERE id = ? AND product_id = ? AND is_active = 1').get(data.package_id, data.product_id) as any;

  if (!product || !pkg) {
    res.status(404).json({ error: 'Selected product or package is no longer available.' });
    return;
  }

  const taxSetting = db.prepare("SELECT value FROM settings WHERE key = 'tax_rate_bps'").get() as { value: string } | undefined;
  const taxRateBps = Number(taxSetting?.value ?? 850);

  let createdNewAccount = false;
  let newSessionToken: string | null = null;
  const ip = getClientIp(req);
  const ua = req.headers['user-agent'] || '';
  const fp = computeSessionFingerprint(req);

  try {
    const result = db.transaction(() => {
      let userId = currentUserId;
      let customerCode = '';

      if (!userId) {
        const existingUser = db.prepare('SELECT id, customer_code, status FROM users WHERE lower(email) = ?').get(normalizedEmail) as any;
        if (existingUser) {
          throw new Error('ACCOUNT_EXISTS');
        }
        if (!data.password || data.password.length < 12) {
          throw new Error('PASSWORD_REQUIRED');
        }

        customerCode = generateCustomerCode();
        const pwHash = bcrypt.hashSync(data.password, 12);
        const rawVerToken = crypto.randomBytes(16).toString('hex').toUpperCase();
        const verHash = sha256(rawVerToken);
        const verExpires = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

        const uRes = db.prepare(`
          INSERT INTO users (
            customer_code, email, password_hash, role, full_name, mobile, country, city,
            billing_address, postal_code, company_name, discord_username, email_verified,
            verification_token, verification_expires_at, last_login_ip, last_login_at
          ) VALUES (?, ?, ?, 'customer', ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, datetime('now'))
        `).run(
          customerCode,
          normalizedEmail,
          pwHash,
          data.full_name,
          data.mobile,
          data.country,
          data.city,
          data.billing_address,
          data.postal_code,
          data.company_name,
          data.discord_username,
          verHash,
          verExpires,
          ip
        );
        userId = Number(uRes.lastInsertRowid);
        createdNewAccount = true;

        db.prepare(`
          INSERT INTO billing_addresses (user_id, label, full_name, company_name, address_line, city, postal_code, country, is_default)
          VALUES (?, 'Primary Address', ?, ?, ?, ?, ?, ?, 1)
        `).run(userId, data.full_name, data.company_name, data.billing_address, data.city, data.postal_code, data.country);
      } else {
        const uRow = db.prepare('SELECT customer_code FROM users WHERE id = ?').get(userId) as any;
        customerCode = uRow.customer_code;
        db.prepare(`
          UPDATE users SET full_name = ?, mobile = ?, country = ?, city = ?, billing_address = ?, postal_code = ?,
          company_name = ?, discord_username = ?, updated_at = datetime('now') WHERE id = ?
        `).run(
          data.full_name,
          data.mobile,
          data.country,
          data.city,
          data.billing_address,
          data.postal_code,
          data.company_name,
          data.discord_username,
          userId
        );
      }

      const unitPriceCents = pkg.price_cents;
      const subtotalCents = unitPriceCents * data.quantity;
      let discountCents = 0;
      let appliedPromo: string | null = null;

      if (data.promo_code) {
        const codeUpper = data.promo_code.toUpperCase();
        const coupon = db.prepare('SELECT * FROM coupons WHERE upper(code) = ? AND is_active = 1').get(codeUpper) as any;
        if (!coupon) throw new Error('INVALID_COUPON');
        if (coupon.expires_at && new Date(coupon.expires_at).getTime() < Date.now()) throw new Error('EXPIRED_COUPON');
        if (coupon.max_uses !== null && coupon.used_count >= coupon.max_uses) throw new Error('COUPON_LIMIT');
        if (subtotalCents < coupon.min_purchase_cents) throw new Error('COUPON_MIN');

        discountCents =
          coupon.discount_type === 'percentage'
            ? Math.round((subtotalCents * coupon.discount_value) / 100)
            : Math.min(subtotalCents, coupon.discount_value);
        appliedPromo = coupon.code;
        db.prepare('UPDATE coupons SET used_count = used_count + 1 WHERE id = ?').run(coupon.id);
      }

      const taxableCents = Math.max(0, subtotalCents - discountCents);
      const taxCents = Math.round((taxableCents * taxRateBps) / 10000);
      const totalCents = taxableCents + taxCents;

      const billingSnapshot = JSON.stringify({
        customer_code: customerCode,
        full_name: data.full_name,
        email: normalizedEmail,
        mobile: data.mobile,
        country: data.country,
        city: data.city,
        billing_address: data.billing_address,
        postal_code: data.postal_code,
        company_name: data.company_name,
        discord_username: data.discord_username,
      });

      const nowIso = new Date().toISOString();
      const dueIso = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
      const orderNumber = generateOrderNumber();
      const invoiceNumber = generateInvoiceNumber();

      const ordRes = db.prepare(`
        INSERT INTO orders (
          order_number, user_id, status, subtotal_cents, discount_cents, tax_cents, total_cents, currency,
          promo_code, billing_snapshot_json, requirements, special_instructions,
          accepted_terms_at, accepted_privacy_at, accepted_refund_at
        ) VALUES (?, ?, 'Awaiting Payment', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        orderNumber,
        userId,
        subtotalCents,
        discountCents,
        taxCents,
        totalCents,
        pkg.currency,
        appliedPromo,
        billingSnapshot,
        data.requirements,
        data.special_instructions,
        nowIso,
        nowIso,
        nowIso
      );
      const orderId = Number(ordRes.lastInsertRowid);

      db.prepare(`
        INSERT INTO order_items (
          order_id, product_id, package_id, product_name, package_name,
          subscription_duration, quantity, unit_price_cents, line_total_cents
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        orderId,
        product.id,
        pkg.id,
        product.name,
        pkg.name,
        data.subscription_duration,
        data.quantity,
        unitPriceCents,
        subtotalCents
      );

      db.prepare(`
        INSERT INTO order_status_history (order_id, from_status, to_status, note, actor_user_id)
        VALUES (?, NULL, 'Order Submitted', 'Order submitted by customer during checkout', ?)
      `).run(orderId, userId);

      db.prepare(`
        INSERT INTO order_status_history (order_id, from_status, to_status, note, actor_user_id)
        VALUES (?, 'Order Submitted', 'Awaiting Payment', ?, ?)
      `).run(orderId, `Invoice ${invoiceNumber} automatically generated`, userId);

      // Automatically generate unique Unpaid invoice (NEVER marked Paid automatically)
      const invRes = db.prepare(`
        INSERT INTO invoices (
          invoice_number, order_id, user_id, status, issue_date, due_date,
          subtotal_cents, discount_cents, tax_rate_bps, tax_cents, total_cents, currency,
          payment_method, billing_snapshot_json, notes
        ) VALUES (?, ?, ?, 'Unpaid', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        invoiceNumber,
        orderId,
        userId,
        nowIso,
        dueIso,
        subtotalCents,
        discountCents,
        taxRateBps,
        taxCents,
        totalCents,
        pkg.currency,
        data.payment_method,
        billingSnapshot,
        data.special_instructions
          ? `Thank you for your business! Customer note: ${data.special_instructions}`
          : 'Thank you for your business! Please complete payment using the instructions below.'
      );
      const invoiceId = Number(invRes.lastInsertRowid);

      db.prepare(`
        INSERT INTO invoice_items (invoice_id, description, quantity, unit_price_cents, amount_cents)
        VALUES (?, ?, ?, ?, ?)
      `).run(
        invoiceId,
        `${product.name} — ${pkg.name} (${data.subscription_duration})`,
        data.quantity,
        unitPriceCents,
        subtotalCents
      );

      return {
        userId,
        customerCode,
        orderId,
        orderNumber,
        invoiceId,
        invoiceNumber,
        totalCents,
        currency: pkg.currency,
      };
    })();

    if (createdNewAccount) {
      const jti = crypto.randomUUID();
      const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
      db.prepare('INSERT INTO sessions (user_id, token_jti, ip_address, user_agent, session_fingerprint, expires_at) VALUES (?, ?, ?, ?, ?, ?)').run(
        result.userId,
        jti,
        ip,
        ua,
        fp,
        expiresAt
      );
      newSessionToken = signSessionToken(
        {
          id: result.userId,
          customer_code: result.customerCode,
          email: normalizedEmail,
          role: 'customer',
          full_name: data.full_name,
          status: 'active',
        },
        jti
      );
      setSessionCookie(res, newSessionToken);
      issueCsrfToken(res);
    }

    logActivity({
      userId: result.userId,
      actorUserId: result.userId,
      action: 'order_and_invoice_created',
      entityType: 'order',
      entityId: result.orderNumber,
      details: { invoice_number: result.invoiceNumber, total_cents: result.totalCents },
      ipAddress: ip,
    });

    createInAppNotification({
      userId: result.userId,
      title: `Order ${result.orderNumber} Confirmed`,
      message: `Invoice ${result.invoiceNumber} (${formatMoney(result.totalCents, result.currency)}) has been generated and is ready for payment.`,
      category: 'billing',
      linkTarget: 'invoices',
    });

    notifyAllAdmins({
      title: `New Order ${result.orderNumber}`,
      message: `${data.full_name} placed an order for ${product.name} (${formatMoney(result.totalCents, result.currency)}).`,
      category: 'orders',
      linkTarget: 'admin-orders',
    });

    const baseUrl = process.env.APP_URL || `${req.protocol}://${req.get('host')}`;
    await sendTransactionalEmail({
      to: normalizedEmail,
      subject: `Order ${result.orderNumber} & Invoice ${result.invoiceNumber} — HelzerX`,
      templateName: 'order_invoice_generated',
      heading: `Invoice ${result.invoiceNumber} Generated`,
      preheader: `Order ${result.orderNumber} received. Payment due: ${formatMoney(result.totalCents, result.currency)}.`,
      bodyHtml: `
        <p>Hello ${escapeHtml(data.full_name)},</p>
        <p>Your order <strong>${escapeHtml(result.orderNumber)}</strong> for <strong>${escapeHtml(product.name)} (${escapeHtml(pkg.name)})</strong> has been received and invoice <strong>${escapeHtml(result.invoiceNumber)}</strong> has been generated.</p>
        <p><strong>Amount Due:</strong> ${escapeHtml(formatMoney(result.totalCents, result.currency))}<br/>
        <strong>Invoice Status:</strong> Unpaid<br/>
        <strong>Payment Method:</strong> ${escapeHtml(data.payment_method)}</p>
        <p>You can download your PDF invoice and submit your payment receipt directly in the customer portal.</p>
      `,
      ctaLabel: 'View Invoice & Pay',
      ctaUrl: baseUrl,
    });

    await sendDiscordWebhook({
      event: 'order.created',
      title: `New Order & Invoice Generated`,
      description: `Order **${result.orderNumber}** submitted with invoice **${result.invoiceNumber}**.`,
      fields: [
        { name: 'Customer', value: result.customerCode, inline: true },
        { name: 'Package', value: `${product.name} — ${pkg.name}`, inline: true },
        { name: 'Total', value: formatMoney(result.totalCents, result.currency), inline: true },
      ],
    });

    const userRow = db.prepare('SELECT * FROM users WHERE id = ?').get(result.userId);
    res.status(201).json({
      order_id: result.orderId,
      order_number: result.orderNumber,
      invoice_id: result.invoiceId,
      invoice_number: result.invoiceNumber,
      total_cents: result.totalCents,
      currency: result.currency,
      user: sanitizeUser(userRow),
    });
  } catch (err: any) {
    const msgMap: Record<string, { status: number; msg: string }> = {
      ACCOUNT_EXISTS: { status: 409, msg: 'An account with this email already exists. Please sign in first before placing an order.' },
      PASSWORD_REQUIRED: { status: 400, msg: 'Please provide a strong password (min 12 characters) to create your customer account.' },
      INVALID_COUPON: { status: 400, msg: 'Promo code is invalid or inactive.' },
      EXPIRED_COUPON: { status: 400, msg: 'Promo code has expired.' },
      COUPON_LIMIT: { status: 400, msg: 'Promo code usage limit reached.' },
      COUPON_MIN: { status: 400, msg: 'Order subtotal does not meet promo code minimum purchase requirement.' },
    };
    const mapped = msgMap[err.message];
    if (mapped) {
      res.status(mapped.status).json({ error: mapped.msg });
      return;
    }
    console.error('Checkout error:', err);
    res.status(500).json({ error: 'Unable to complete checkout at this time.' });
  }
});

// All routes below require authenticated customer/user session
router.use(requireAuth);

router.get('/customer/overview', (req: AuthenticatedRequest, res) => {
  const uid = req.user!.id;
  const totalOrders = (db.prepare('SELECT COUNT(*) as cnt FROM orders WHERE user_id = ?').get(uid) as { cnt: number }).cnt;
  const activeServices = (
    db.prepare("SELECT COUNT(*) as cnt FROM services WHERE user_id = ? AND status IN ('Active', 'Expiring Soon')").get(uid) as { cnt: number }
  ).cnt;
  const pendingPayments = (
    db
      .prepare("SELECT COALESCE(SUM(total_cents), 0) as sum FROM invoices WHERE user_id = ? AND status IN ('Unpaid', 'Pending Verification', 'Overdue')")
      .get(uid) as { sum: number }
  ).sum;
  const totalSpending = (
    db.prepare("SELECT COALESCE(SUM(total_cents), 0) as sum FROM invoices WHERE user_id = ? AND status = 'Paid'").get(uid) as { sum: number }
  ).sum;

  const recentActivities = db
    .prepare('SELECT * FROM activity_logs WHERE user_id = ? ORDER BY created_at DESC LIMIT 12')
    .all(uid);

  const recentOrders = db
    .prepare(`
      SELECT o.*, oi.product_name, oi.package_name, i.id as invoice_id, i.invoice_number, i.status as invoice_status
      FROM orders o
      LEFT JOIN order_items oi ON oi.order_id = o.id
      LEFT JOIN invoices i ON i.order_id = o.id
      WHERE o.user_id = ?
      ORDER BY o.created_at DESC
      LIMIT 5
    `)
    .all(uid);

  res.json({
    stats: {
      total_orders: totalOrders,
      active_services: activeServices,
      pending_payments_cents: pendingPayments,
      total_spending_cents: totalSpending,
    },
    recent_activities: recentActivities,
    recent_orders: recentOrders,
  });
});

// Orders
router.get('/orders', (req: AuthenticatedRequest, res) => {
  const uid = req.user!.id;
  const orders = db
    .prepare(`
      SELECT o.*, i.id as invoice_id, i.invoice_number, i.status as invoice_status
      FROM orders o
      LEFT JOIN invoices i ON i.order_id = o.id
      WHERE o.user_id = ?
      ORDER BY o.created_at DESC
    `)
    .all(uid) as any[];

  const getItems = db.prepare('SELECT * FROM order_items WHERE order_id = ?');
  const getHistory = db.prepare('SELECT * FROM order_status_history WHERE order_id = ? ORDER BY created_at ASC, id ASC');

  res.json({
    orders: orders.map((o) => ({
      ...o,
      billing_snapshot: JSON.parse(o.billing_snapshot_json || '{}'),
      items: getItems.all(o.id),
      history: getHistory.all(o.id),
    })),
  });
});

router.get('/orders/:id', (req: AuthenticatedRequest, res) => {
  const uid = req.user!.id;
  const order = db
    .prepare(`
      SELECT o.*, i.id as invoice_id, i.invoice_number, i.status as invoice_status
      FROM orders o
      LEFT JOIN invoices i ON i.order_id = o.id
      WHERE o.id = ? AND o.user_id = ?
    `)
    .get(Number(req.params.id), uid) as any;

  if (!order) {
    res.status(404).json({ error: 'Order not found.' });
    return;
  }

  const items = db.prepare('SELECT * FROM order_items WHERE order_id = ?').all(order.id);
  const history = db.prepare('SELECT * FROM order_status_history WHERE order_id = ? ORDER BY created_at ASC, id ASC').all(order.id);
  res.json({
    order: {
      ...order,
      billing_snapshot: JSON.parse(order.billing_snapshot_json || '{}'),
      items,
      history,
    },
  });
});

router.post('/orders/:id/cancel', (req: AuthenticatedRequest, res) => {
  const uid = req.user!.id;
  const orderId = Number(req.params.id);
  const reason = String(req.body?.reason || 'Cancelled by customer').trim();

  const order = db.prepare('SELECT * FROM orders WHERE id = ? AND user_id = ?').get(orderId, uid) as any;
  if (!order) {
    res.status(404).json({ error: 'Order not found.' });
    return;
  }
  if (!['Order Submitted', 'Awaiting Payment'].includes(order.status)) {
    res.status(400).json({ error: 'Only unpaid orders before processing can be cancelled directly. Please submit a refund or support request.' });
    return;
  }

  db.transaction(() => {
    db.prepare("UPDATE orders SET status = 'Cancelled', updated_at = datetime('now') WHERE id = ?").run(orderId);
    db.prepare("UPDATE invoices SET status = 'Cancelled', updated_at = datetime('now') WHERE order_id = ? AND status = 'Unpaid'").run(orderId);
    db.prepare(
      'INSERT INTO order_status_history (order_id, from_status, to_status, note, actor_user_id) VALUES (?, ?, ?, ?, ?)'
    ).run(orderId, order.status, 'Cancelled', reason, uid);
  })();

  logActivity({ userId: uid, actorUserId: uid, action: 'order_cancelled', entityType: 'order', entityId: order.order_number });
  res.json({ ok: true });
});

router.post('/orders/:id/refund-request', async (req: AuthenticatedRequest, res) => {
  const uid = req.user!.id;
  const orderId = Number(req.params.id);
  const reason = String(req.body?.reason || '').trim();
  if (reason.length < 5) {
    res.status(400).json({ error: 'Please explain the reason for your refund request (min 5 characters).' });
    return;
  }

  const order = db.prepare('SELECT * FROM orders WHERE id = ? AND user_id = ?').get(orderId, uid) as any;
  if (!order) {
    res.status(404).json({ error: 'Order not found.' });
    return;
  }

  const invoice = db.prepare('SELECT id FROM invoices WHERE order_id = ?').get(orderId) as any;
  db.prepare('INSERT INTO refund_requests (order_id, invoice_id, user_id, reason, amount_cents) VALUES (?, ?, ?, ?, ?)').run(
    orderId,
    invoice?.id ?? null,
    uid,
    reason,
    order.total_cents
  );

  notifyAllAdmins({
    title: `Refund Requested: ${order.order_number}`,
    message: `Customer ${req.user!.customer_code} requested a refund of ${formatMoney(order.total_cents, order.currency)}.`,
    category: 'billing',
    linkTarget: 'admin-orders',
  });

  await sendDiscordWebhook({
    event: 'refund.requested',
    title: 'Refund Request Submitted',
    description: `Refund requested for order **${order.order_number}**.`,
    fields: [
      { name: 'Customer', value: req.user!.customer_code, inline: true },
      { name: 'Amount', value: formatMoney(order.total_cents, order.currency), inline: true },
    ],
    color: 0xd97706,
  });

  res.status(201).json({ ok: true });
});

router.post('/orders/:id/feedback', (req: AuthenticatedRequest, res) => {
  const uid = req.user!.id;
  const orderId = Number(req.params.id);
  const rating = Number(req.body?.rating);
  const comment = String(req.body?.comment || '').trim();

  if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
    res.status(400).json({ error: 'Rating must be between 1 and 5.' });
    return;
  }

  const order = db.prepare('SELECT id FROM orders WHERE id = ? AND user_id = ?').get(orderId, uid);
  if (!order) {
    res.status(404).json({ error: 'Order not found.' });
    return;
  }

  db.prepare('INSERT INTO feedback (user_id, order_id, rating, comment) VALUES (?, ?, ?, ?)').run(uid, orderId, rating, comment);
  res.status(201).json({ ok: true });
});

// Invoices & PDF Downloads
router.get('/invoices', (req: AuthenticatedRequest, res) => {
  const uid = req.user!.id;
  const invoices = db
    .prepare(`
      SELECT i.*, o.order_number
      FROM invoices i
      LEFT JOIN orders o ON o.id = i.order_id
      WHERE i.user_id = ?
      ORDER BY i.created_at DESC
    `)
    .all(uid) as any[];

  const getItems = db.prepare('SELECT * FROM invoice_items WHERE invoice_id = ?');
  res.json({
    invoices: invoices.map((inv) => ({
      ...inv,
      billing_snapshot: JSON.parse(inv.billing_snapshot_json || '{}'),
      items: getItems.all(inv.id),
    })),
  });
});

router.get('/invoices/:id', (req: AuthenticatedRequest, res) => {
  const uid = req.user!.id;
  const isAdmin = req.user!.role === 'admin' || req.user!.role === 'super_admin';
  const inv = db
    .prepare(`
      SELECT i.*, o.order_number
      FROM invoices i
      LEFT JOIN orders o ON o.id = i.order_id
      WHERE i.id = ? ${isAdmin ? '' : 'AND i.user_id = ?'}
    `)
    .get(...(isAdmin ? [Number(req.params.id)] : [Number(req.params.id), uid])) as any;

  if (!inv) {
    res.status(404).json({ error: 'Invoice not found.' });
    return;
  }

  const items = db.prepare('SELECT * FROM invoice_items WHERE invoice_id = ?').all(inv.id);
  res.json({
    invoice: {
      ...inv,
      billing_snapshot: JSON.parse(inv.billing_snapshot_json || '{}'),
      items,
    },
  });
});

router.get('/invoices/:id/pdf', async (req: AuthenticatedRequest, res) => {
  const uid = req.user!.id;
  const isAdmin = req.user!.role === 'admin' || req.user!.role === 'super_admin';
  const invoiceId = Number(req.params.id);

  const inv = db
    .prepare(`SELECT id, user_id FROM invoices WHERE id = ? ${isAdmin ? '' : 'AND user_id = ?'}`)
    .get(...(isAdmin ? [invoiceId] : [invoiceId, uid]));

  if (!inv) {
    res.status(404).json({ error: 'Invoice not found.' });
    return;
  }

  try {
    const pdf = await generateInvoicePdfBuffer(invoiceId);
    if (!pdf) {
      res.status(404).json({ error: 'Invoice PDF unavailable.' });
      return;
    }
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${pdf.invoiceNumber}.pdf"`);
    res.send(pdf.buffer);
  } catch (err) {
    console.error('PDF generation failed:', err);
    res.status(500).json({ error: 'Failed to generate invoice PDF.' });
  }
});

// Payments & Receipt Upload
router.get('/payments', (req: AuthenticatedRequest, res) => {
  const uid = req.user!.id;
  const payments = db
    .prepare(`
      SELECT p.*, i.invoice_number, o.order_number,
             r.id as receipt_id, r.original_filename as receipt_filename
      FROM payments p
      LEFT JOIN invoices i ON i.id = p.invoice_id
      LEFT JOIN orders o ON o.id = p.order_id
      LEFT JOIN payment_receipts r ON r.payment_id = p.id
      WHERE p.user_id = ?
      ORDER BY p.created_at DESC
    `)
    .all(uid);
  res.json({ payments });
});

router.post('/payments/manual', uploadReceipt.single('receipt'), async (req: AuthenticatedRequest, res) => {
  const uid = req.user!.id;
  const invoiceId = Number(req.body?.invoice_id);
  const method = String(req.body?.method || 'Bank Transfer');
  const transactionRef = String(req.body?.transaction_ref || '').trim();

  if (!['Bank Transfer', 'Manual Payment', 'Cryptocurrency'].includes(method)) {
    if (req.file) fs.unlinkSync(req.file.path);
    res.status(400).json({ error: 'Invalid manual payment method.' });
    return;
  }
  if (!transactionRef || transactionRef.length < 3) {
    if (req.file) fs.unlinkSync(req.file.path);
    res.status(400).json({ error: 'Transaction reference or wire ID is required.' });
    return;
  }
  if (!req.file) {
    res.status(400).json({ error: 'Payment receipt file (JPG, PNG, WEBP, or PDF) is required.' });
    return;
  }
  if (!validateUploadedFileMagicBytes(req.file.path, req.file.mimetype)) {
    fs.unlinkSync(req.file.path);
    res.status(400).json({ error: 'Uploaded file signature failed security verification.' });
    return;
  }

  const invoice = db.prepare('SELECT * FROM invoices WHERE id = ? AND user_id = ?').get(invoiceId, uid) as any;
  if (!invoice) {
    fs.unlinkSync(req.file.path);
    res.status(404).json({ error: 'Invoice not found.' });
    return;
  }
  if (!['Unpaid', 'Overdue'].includes(invoice.status)) {
    fs.unlinkSync(req.file.path);
    res.status(400).json({ error: `Cannot submit manual receipt for invoice with status "${invoice.status}".` });
    return;
  }

  const paymentNumber = generatePaymentNumber();

  const payId = db.transaction(() => {
    const pRes = db.prepare(`
      INSERT INTO payments (payment_number, invoice_id, order_id, user_id, method, amount_cents, currency, status, transaction_ref)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'Under Review', ?)
    `).run(paymentNumber, invoice.id, invoice.order_id, uid, method, invoice.total_cents, invoice.currency, transactionRef);
    const id = Number(pRes.lastInsertRowid);

    db.prepare(`
      INSERT INTO payment_receipts (payment_id, original_filename, stored_filename, mime_type, file_size)
      VALUES (?, ?, ?, ?, ?)
    `).run(id, req.file!.originalname, req.file!.filename, req.file!.mimetype, req.file!.size);

    db.prepare("UPDATE invoices SET status = 'Pending Verification', payment_method = ?, updated_at = datetime('now') WHERE id = ?").run(
      method,
      invoice.id
    );

    if (invoice.order_id) {
      const ord = db.prepare('SELECT status FROM orders WHERE id = ?').get(invoice.order_id) as any;
      if (ord) {
        db.prepare("UPDATE orders SET status = 'Payment Under Review', updated_at = datetime('now') WHERE id = ?").run(invoice.order_id);
        db.prepare(
          'INSERT INTO order_status_history (order_id, from_status, to_status, note, actor_user_id) VALUES (?, ?, ?, ?, ?)'
        ).run(invoice.order_id, ord.status, 'Payment Under Review', `Manual payment receipt ${paymentNumber} uploaded (Ref: ${transactionRef})`, uid);
      }
    }

    return id;
  })();

  logActivity({
    userId: uid,
    actorUserId: uid,
    action: 'manual_payment_submitted',
    entityType: 'payment',
    entityId: paymentNumber,
    details: { invoice_number: invoice.invoice_number, ref: transactionRef },
  });

  notifyAllAdmins({
    title: `Payment Receipt Uploaded: ${invoice.invoice_number}`,
    message: `${req.user!.customer_code} submitted ${method} receipt (${transactionRef}) for ${formatMoney(invoice.total_cents, invoice.currency)}.`,
    category: 'payments',
    linkTarget: 'admin-payments',
  });

  await sendDiscordWebhook({
    event: 'payment.submitted',
    title: 'Manual Payment Receipt Submitted',
    description: `Receipt uploaded for **${invoice.invoice_number}** awaiting administrator verification.`,
    fields: [
      { name: 'Customer', value: req.user!.customer_code, inline: true },
      { name: 'Method', value: method, inline: true },
      { name: 'Amount', value: formatMoney(invoice.total_cents, invoice.currency), inline: true },
    ],
  });

  res.status(201).json({ payment_id: payId, payment_number: paymentNumber, status: 'Under Review' });
});

router.post('/payments/stripe-session', async (req: AuthenticatedRequest, res) => {
  const uid = req.user!.id;
  const invoiceId = Number(req.body?.invoice_id);
  const invoice = db.prepare('SELECT * FROM invoices WHERE id = ? AND user_id = ?').get(invoiceId, uid) as any;

  if (!invoice) {
    res.status(404).json({ error: 'Invoice not found.' });
    return;
  }
  if (invoice.status === 'Paid') {
    res.status(400).json({ error: 'Invoice is already paid.' });
    return;
  }
  if (!stripeClient) {
    res.status(503).json({
      error: 'Stripe gateway credentials (STRIPE_SECRET_KEY) are not configured on this server. Please submit a Bank Transfer / Manual Payment receipt for verification.',
    });
    return;
  }

  try {
    const origin = process.env.APP_URL || `${req.protocol}://${req.get('host')}`;
    const session = await stripeClient.checkout.sessions.create({
      mode: 'payment',
      customer_email: req.user!.email,
      line_items: [
        {
          price_data: {
            currency: invoice.currency.toLowerCase(),
            product_data: {
              name: `HelzerX Invoice ${invoice.invoice_number}`,
              description: `Customer ${req.user!.customer_code}`,
            },
            unit_amount: invoice.total_cents,
          },
          quantity: 1,
        },
      ],
      metadata: {
        invoice_id: String(invoice.id),
        invoice_number: invoice.invoice_number,
        user_id: String(uid),
      },
      success_url: `${origin}/?stripe_status=success&invoice=${invoice.invoice_number}`,
      cancel_url: `${origin}/?stripe_status=cancelled&invoice=${invoice.invoice_number}`,
    });

    const paymentNumber = generatePaymentNumber();
    db.prepare(`
      INSERT INTO payments (payment_number, invoice_id, order_id, user_id, method, amount_cents, currency, status, gateway_session_id)
      VALUES (?, ?, ?, ?, 'Stripe', ?, ?, 'Pending', ?)
    `).run(paymentNumber, invoice.id, invoice.order_id, uid, invoice.total_cents, invoice.currency, session.id);

    res.json({ checkout_url: session.url, session_id: session.id });
  } catch (err: any) {
    console.error('Stripe checkout error:', err);
    res.status(500).json({ error: err?.message || 'Unable to initialize Stripe checkout.' });
  }
});

// Services
router.get('/services', (req: AuthenticatedRequest, res) => {
  const uid = req.user!.id;
  const services = db
    .prepare(`
      SELECT s.*, o.order_number
      FROM services s
      LEFT JOIN orders o ON o.id = s.order_id
      WHERE s.user_id = ?
      ORDER BY s.created_at DESC
    `)
    .all(uid);
  res.json({ services });
});

router.patch('/services/:id', (req: AuthenticatedRequest, res) => {
  const uid = req.user!.id;
  const serviceId = Number(req.params.id);
  const autoRenew = req.body?.auto_renew ? 1 : 0;
  const svc = db.prepare('SELECT id FROM services WHERE id = ? AND user_id = ?').get(serviceId, uid);
  if (!svc) {
    res.status(404).json({ error: 'Service not found.' });
    return;
  }
  db.prepare("UPDATE services SET auto_renew = ?, updated_at = datetime('now') WHERE id = ?").run(autoRenew, serviceId);
  res.json({ ok: true, auto_renew: Boolean(autoRenew) });
});

router.post('/services/:id/renew', async (req: AuthenticatedRequest, res) => {
  const uid = req.user!.id;
  const serviceId = Number(req.params.id);
  const svc = db.prepare('SELECT * FROM services WHERE id = ? AND user_id = ?').get(serviceId, uid) as any;
  if (!svc || !svc.package_id) {
    res.status(404).json({ error: 'Renewable service package not found.' });
    return;
  }
  const pkg = db.prepare('SELECT * FROM packages WHERE id = ?').get(svc.package_id) as any;
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(uid) as any;
  if (!pkg || !user) {
    res.status(404).json({ error: 'Package or user record missing.' });
    return;
  }

  const taxSetting = db.prepare("SELECT value FROM settings WHERE key = 'tax_rate_bps'").get() as { value: string } | undefined;
  const taxRateBps = Number(taxSetting?.value ?? 850);
  const subtotalCents = pkg.price_cents;
  const taxCents = Math.round((subtotalCents * taxRateBps) / 10000);
  const totalCents = subtotalCents + taxCents;
  const nowIso = new Date().toISOString();
  const dueIso = new Date(Date.now() + 7 * 86400 * 1000).toISOString();
  const billingSnapshot = JSON.stringify({
    customer_code: user.customer_code,
    full_name: user.full_name,
    email: user.email,
    mobile: user.mobile,
    country: user.country,
    city: user.city,
    billing_address: user.billing_address,
    postal_code: user.postal_code,
    company_name: user.company_name,
  });

  const created = db.transaction(() => {
    const orderNumber = generateOrderNumber();
    const invoiceNumber = generateInvoiceNumber();

    const ordRes = db.prepare(`
      INSERT INTO orders (
        order_number, user_id, status, subtotal_cents, discount_cents, tax_cents, total_cents, currency,
        billing_snapshot_json, requirements, special_instructions, accepted_terms_at, accepted_privacy_at, accepted_refund_at
      ) VALUES (?, ?, 'Awaiting Payment', ?, 0, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      orderNumber,
      uid,
      subtotalCents,
      taxCents,
      totalCents,
      pkg.currency,
      billingSnapshot,
      `Renewal for ${svc.service_code}`,
      'Automated service renewal order',
      nowIso,
      nowIso,
      nowIso
    );
    const orderId = Number(ordRes.lastInsertRowid);

    db.prepare(`
      INSERT INTO order_items (order_id, product_id, package_id, product_name, package_name, subscription_duration, quantity, unit_price_cents, line_total_cents)
      VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)
    `).run(orderId, svc.product_id, svc.package_id, svc.product_name, `${svc.package_name} (Renewal)`, `${pkg.duration_days} Days`, subtotalCents, subtotalCents);

    db.prepare('INSERT INTO order_status_history (order_id, from_status, to_status, note, actor_user_id) VALUES (?, NULL, ?, ?, ?)').run(
      orderId,
      'Awaiting Payment',
      `Service renewal initiated for ${svc.service_code}`,
      uid
    );

    const invRes = db.prepare(`
      INSERT INTO invoices (
        invoice_number, order_id, user_id, status, issue_date, due_date, subtotal_cents, discount_cents,
        tax_rate_bps, tax_cents, total_cents, currency, payment_method, billing_snapshot_json, notes
      ) VALUES (?, ?, ?, 'Unpaid', ?, ?, ?, 0, ?, ?, ?, ?, 'Bank Transfer', ?, ?)
    `).run(
      invoiceNumber,
      orderId,
      uid,
      nowIso,
      dueIso,
      subtotalCents,
      taxRateBps,
      taxCents,
      totalCents,
      pkg.currency,
      billingSnapshot,
      `Renewal invoice for active service ${svc.service_code}.`
    );
    const invoiceId = Number(invRes.lastInsertRowid);

    db.prepare('INSERT INTO invoice_items (invoice_id, description, quantity, unit_price_cents, amount_cents) VALUES (?, ?, 1, ?, ?)').run(
      invoiceId,
      `Renewal: ${svc.product_name} — ${svc.package_name}`,
      subtotalCents,
      subtotalCents
    );

    return { orderId, orderNumber, invoiceId, invoiceNumber };
  })();

  res.status(201).json(created);
});

// Support Tickets
router.get('/tickets', (req: AuthenticatedRequest, res) => {
  const uid = req.user!.id;
  const tickets = db
    .prepare(`
      SELECT t.*, o.order_number,
        (SELECT COUNT(*) FROM ticket_messages m WHERE m.ticket_id = t.id) as message_count
      FROM support_tickets t
      LEFT JOIN orders o ON o.id = t.order_id
      WHERE t.user_id = ?
      ORDER BY t.updated_at DESC
    `)
    .all(uid);
  res.json({ tickets });
});

router.post('/tickets', uploadTicketAttachment.single('attachment'), async (req: AuthenticatedRequest, res) => {
  const uid = req.user!.id;
  const subject = String(req.body?.subject || '').trim();
  const category = String(req.body?.category || 'General Inquiry').trim();
  const priority = String(req.body?.priority || 'Normal');
  const message = String(req.body?.message || '').trim();
  const orderId = req.body?.order_id ? Number(req.body.order_id) : null;

  if (subject.length < 4 || message.length < 5) {
    if (req.file) fs.unlinkSync(req.file.path);
    res.status(400).json({ error: 'Subject and detailed message are required.' });
    return;
  }
  if (!['Low', 'Normal', 'High', 'Urgent'].includes(priority)) {
    if (req.file) fs.unlinkSync(req.file.path);
    res.status(400).json({ error: 'Invalid priority.' });
    return;
  }
  if (req.file && !validateUploadedFileMagicBytes(req.file.path, req.file.mimetype)) {
    fs.unlinkSync(req.file.path);
    res.status(400).json({ error: 'Uploaded attachment failed security signature verification.' });
    return;
  }

  const ticketNumber = generateTicketNumber();
  const ticketId = db.transaction(() => {
    const tRes = db.prepare(`
      INSERT INTO support_tickets (ticket_number, user_id, order_id, subject, category, priority, status)
      VALUES (?, ?, ?, ?, ?, ?, 'Open')
    `).run(ticketNumber, uid, orderId, subject, category, priority);
    const id = Number(tRes.lastInsertRowid);

    db.prepare(`
      INSERT INTO ticket_messages (ticket_id, sender_user_id, sender_role, message, attachment_filename, attachment_original_name)
      VALUES (?, ?, 'customer', ?, ?, ?)
    `).run(id, uid, message, req.file?.filename ?? null, req.file?.originalname ?? null);

    return id;
  })();

  notifyAllAdmins({
    title: `New Support Ticket ${ticketNumber}`,
    message: `[${priority}] ${subject} from ${req.user!.customer_code}`,
    category: 'support',
    linkTarget: 'admin-tickets',
  });

  await sendTransactionalEmail({
    to: req.user!.email,
    subject: `Support Ticket Created: ${ticketNumber} — ${subject}`,
    templateName: 'ticket_created',
    heading: `Ticket ${ticketNumber} Opened`,
    preheader: `Our engineering support desk received your request.`,
    bodyHtml: `<p>Your support ticket <strong>${escapeHtml(ticketNumber)}</strong> (${escapeHtml(priority)} Priority) has been created.</p>
      <p><strong>Subject:</strong> ${escapeHtml(subject)}<br/><strong>Category:</strong> ${escapeHtml(category)}</p>`,
  });

  await sendDiscordWebhook({
    event: 'ticket.created',
    title: `New Support Ticket: ${ticketNumber}`,
    description: subject,
    fields: [
      { name: 'Customer', value: req.user!.customer_code, inline: true },
      { name: 'Priority', value: priority, inline: true },
      { name: 'Category', value: category, inline: true },
    ],
  });

  res.status(201).json({ id: ticketId, ticket_number: ticketNumber });
});

router.get('/tickets/:id', (req: AuthenticatedRequest, res) => {
  const uid = req.user!.id;
  const ticket = db
    .prepare('SELECT t.*, o.order_number FROM support_tickets t LEFT JOIN orders o ON o.id = t.order_id WHERE t.id = ? AND t.user_id = ?')
    .get(Number(req.params.id), uid) as any;
  if (!ticket) {
    res.status(404).json({ error: 'Support ticket not found.' });
    return;
  }
  const messages = db
    .prepare(`
      SELECT m.*, u.full_name as sender_name
      FROM ticket_messages m
      JOIN users u ON u.id = m.sender_user_id
      WHERE m.ticket_id = ?
      ORDER BY m.created_at ASC, m.id ASC
    `)
    .all(ticket.id);
  res.json({ ticket, messages });
});

router.post('/tickets/:id/reply', uploadTicketAttachment.single('attachment'), (req: AuthenticatedRequest, res) => {
  const uid = req.user!.id;
  const ticketId = Number(req.params.id);
  const message = String(req.body?.message || '').trim();
  if (!message && !req.file) {
    res.status(400).json({ error: 'Reply message or attachment is required.' });
    return;
  }
  if (req.file && !validateUploadedFileMagicBytes(req.file.path, req.file.mimetype)) {
    fs.unlinkSync(req.file.path);
    res.status(400).json({ error: 'Uploaded attachment failed security signature verification.' });
    return;
  }

  const ticket = db.prepare('SELECT * FROM support_tickets WHERE id = ? AND user_id = ?').get(ticketId, uid) as any;
  if (!ticket) {
    if (req.file) fs.unlinkSync(req.file.path);
    res.status(404).json({ error: 'Support ticket not found.' });
    return;
  }

  db.transaction(() => {
    db.prepare(`
      INSERT INTO ticket_messages (ticket_id, sender_user_id, sender_role, message, attachment_filename, attachment_original_name)
      VALUES (?, ?, 'customer', ?, ?, ?)
    `).run(ticketId, uid, message || '(Attachment uploaded)', req.file?.filename ?? null, req.file?.originalname ?? null);

    db.prepare("UPDATE support_tickets SET status = 'In Progress', updated_at = datetime('now') WHERE id = ?").run(ticketId);
  })();

  notifyAllAdmins({
    title: `Customer Reply on ${ticket.ticket_number}`,
    message: `${req.user!.customer_code} replied to "${ticket.subject}".`,
    category: 'support',
    linkTarget: 'admin-tickets',
  });

  res.status(201).json({ ok: true });
});

// Protected File Downloads (Receipt & Ticket Attachments)
router.get('/files/receipts/:paymentId', (req: AuthenticatedRequest, res) => {
  const paymentId = Number(req.params.paymentId);
  const isAdmin = req.user!.role === 'admin' || req.user!.role === 'super_admin';
  const row = db
    .prepare(`
      SELECT r.*, p.user_id
      FROM payment_receipts r
      JOIN payments p ON p.id = r.payment_id
      WHERE r.payment_id = ?
    `)
    .get(paymentId) as any;

  if (!row) {
    res.status(404).json({ error: 'Receipt not found.' });
    return;
  }
  if (!isAdmin && row.user_id !== req.user!.id) {
    res.status(403).json({ error: 'Access denied.' });
    return;
  }
  const fullPath = path.join(receiptsDir, path.basename(row.stored_filename));
  if (!fs.existsSync(fullPath)) {
    res.status(404).json({ error: 'Receipt file missing on disk.' });
    return;
  }
  res.setHeader('Content-Type', row.mime_type);
  res.setHeader('Content-Disposition', `inline; filename="${row.original_filename.replace(/"/g, '')}"`);
  res.sendFile(fullPath);
});

router.get('/files/tickets/:messageId', (req: AuthenticatedRequest, res) => {
  const messageId = Number(req.params.messageId);
  const isAdmin = req.user!.role === 'admin' || req.user!.role === 'super_admin';
  const row = db
    .prepare(`
      SELECT m.attachment_filename, m.attachment_original_name, t.user_id
      FROM ticket_messages m
      JOIN support_tickets t ON t.id = m.ticket_id
      WHERE m.id = ?
    `)
    .get(messageId) as any;

  if (!row || !row.attachment_filename) {
    res.status(404).json({ error: 'Attachment not found.' });
    return;
  }
  if (!isAdmin && row.user_id !== req.user!.id) {
    res.status(403).json({ error: 'Access denied.' });
    return;
  }
  const fullPath = path.join(ticketsDir, path.basename(row.attachment_filename));
  if (!fs.existsSync(fullPath)) {
    res.status(404).json({ error: 'Attachment file missing.' });
    return;
  }
  res.download(fullPath, row.attachment_original_name || 'attachment');
});

// Notifications
router.get('/notifications', (req: AuthenticatedRequest, res) => {
  const notifications = db
    .prepare('SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 40')
    .all(req.user!.id);
  res.json({ notifications });
});

router.post('/notifications/read', (req: AuthenticatedRequest, res) => {
  const id = req.body?.id ? Number(req.body.id) : null;
  if (id) {
    db.prepare('UPDATE notifications SET is_read = 1 WHERE id = ? AND user_id = ?').run(id, req.user!.id);
  } else {
    db.prepare('UPDATE notifications SET is_read = 1 WHERE user_id = ?').run(req.user!.id);
  }
  res.json({ ok: true });
});

// Profile & Account Settings
router.get('/profile', (req: AuthenticatedRequest, res) => {
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user!.id);
  const addresses = db.prepare('SELECT * FROM billing_addresses WHERE user_id = ? ORDER BY is_default DESC, id DESC').all(req.user!.id);
  res.json({ user: sanitizeUser(user), addresses });
});

router.patch('/profile', (req: AuthenticatedRequest, res) => {
  const schema = z.object({
    full_name: z.string().trim().min(2).max(120),
    mobile: z.string().trim().min(4).max(40),
    country: z.string().trim().min(2).max(80),
    city: z.string().trim().min(2).max(80),
    billing_address: z.string().trim().min(4).max(250),
    postal_code: z.string().trim().min(2).max(30),
    company_name: z.string().trim().max(120).optional().default(''),
    discord_username: z.string().trim().max(80).optional().default(''),
    notify_email: z.boolean().optional(),
    notify_discord: z.boolean().optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid profile data.' });
    return;
  }
  const d = parsed.data;
  db.prepare(`
    UPDATE users SET
      full_name = ?, mobile = ?, country = ?, city = ?, billing_address = ?, postal_code = ?,
      company_name = ?, discord_username = ?,
      notify_email = COALESCE(?, notify_email),
      notify_discord = COALESCE(?, notify_discord),
      updated_at = datetime('now')
    WHERE id = ?
  `).run(
    d.full_name,
    d.mobile,
    d.country,
    d.city,
    d.billing_address,
    d.postal_code,
    d.company_name,
    d.discord_username,
    d.notify_email === undefined ? null : d.notify_email ? 1 : 0,
    d.notify_discord === undefined ? null : d.notify_discord ? 1 : 0,
    req.user!.id
  );
  logActivity({ userId: req.user!.id, actorUserId: req.user!.id, action: 'profile_updated', entityType: 'user', entityId: req.user!.id });
  const updated = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user!.id);
  res.json({ user: sanitizeUser(updated) });
});

router.post('/profile/password', (req: AuthenticatedRequest, res) => {
  const schema = z.object({
    current_password: z.string().min(1),
    new_password: z.string().min(12).max(128),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Current password and strong 12+ character new password required.' });
    return;
  }
  const pwErr = validateStrongPassword(parsed.data.new_password, {
    email: req.user!.email,
    fullName: req.user!.full_name,
  });
  if (pwErr) {
    res.status(400).json({ error: pwErr });
    return;
  }
  const user = db.prepare('SELECT password_hash FROM users WHERE id = ?').get(req.user!.id) as any;
  if (!user || !bcrypt.compareSync(parsed.data.current_password, user.password_hash)) {
    res.status(401).json({ error: 'Current password is incorrect.' });
    return;
  }
  const newHash = bcrypt.hashSync(parsed.data.new_password, 12);
  db.transaction(() => {
    db.prepare("UPDATE users SET password_hash = ?, updated_at = datetime('now') WHERE id = ?").run(newHash, req.user!.id);
    if (req.sessionJti) {
      db.prepare("UPDATE sessions SET revoked_at = datetime('now') WHERE user_id = ? AND token_jti != ?").run(
        req.user!.id,
        req.sessionJti
      );
    }
  })();
  logActivity({
    userId: req.user!.id,
    actorUserId: req.user!.id,
    action: 'password_changed',
    entityType: 'user',
    entityId: req.user!.id,
    ipAddress: getClientIp(req),
  });
  res.json({ ok: true });
});

router.post('/profile/addresses', (req: AuthenticatedRequest, res) => {
  const schema = z.object({
    label: z.string().trim().min(2).max(60),
    full_name: z.string().trim().min(2).max(120),
    company_name: z.string().trim().max(120).optional().default(''),
    address_line: z.string().trim().min(4).max(250),
    city: z.string().trim().min(2).max(80),
    postal_code: z.string().trim().min(2).max(30),
    country: z.string().trim().min(2).max(80),
    is_default: z.boolean().optional().default(false),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Complete address details are required.' });
    return;
  }
  const d = parsed.data;
  db.transaction(() => {
    if (d.is_default) {
      db.prepare('UPDATE billing_addresses SET is_default = 0 WHERE user_id = ?').run(req.user!.id);
    }
    db.prepare(`
      INSERT INTO billing_addresses (user_id, label, full_name, company_name, address_line, city, postal_code, country, is_default)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(req.user!.id, d.label, d.full_name, d.company_name, d.address_line, d.city, d.postal_code, d.country, d.is_default ? 1 : 0);
  })();
  const addresses = db.prepare('SELECT * FROM billing_addresses WHERE user_id = ? ORDER BY is_default DESC, id DESC').all(req.user!.id);
  res.status(201).json({ addresses });
});

router.delete('/profile/addresses/:id', (req: AuthenticatedRequest, res) => {
  db.prepare('DELETE FROM billing_addresses WHERE id = ? AND user_id = ?').run(Number(req.params.id), req.user!.id);
  res.json({ ok: true });
});

router.post('/profile/request-deletion', (req: AuthenticatedRequest, res) => {
  db.prepare("UPDATE users SET status = 'deletion_requested', updated_at = datetime('now') WHERE id = ?").run(req.user!.id);
  notifyAllAdmins({
    title: `Account Deletion Requested`,
    message: `${req.user!.customer_code} (${req.user!.email}) requested account deletion.`,
    category: 'account',
    linkTarget: 'admin-customers',
  });
  res.json({ ok: true });
});

export default router;
