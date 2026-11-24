import { Router } from 'express';
import { z } from 'zod';
import {
  db,
  generateInvoiceNumber,
  generatePaymentNumber,
  generateServiceCode,
  generateTransactionCode,
} from '../db';
import {
  AuthenticatedRequest,
  escapeHtml,
  getClientIp,
  logActivity,
  requireAdmin,
  requireAuth,
  sanitizeUser,
} from '../services/security';
import { createInAppNotification, sendDiscordWebhook, sendTransactionalEmail } from '../services/notifications';
import { formatMoney } from '../services/pdfInvoice';

const router = Router();

router.use(requireAuth, requireAdmin);

const ALLOWED_ORDER_STATUSES = [
  'Order Submitted',
  'Awaiting Payment',
  'Payment Under Review',
  'Payment Confirmed',
  'Processing',
  'In Progress',
  'Completed',
  'Cancelled',
  'Refunded',
] as const;

const ALLOWED_INVOICE_STATUSES = [
  'Draft',
  'Unpaid',
  'Pending Verification',
  'Paid',
  'Overdue',
  'Cancelled',
  'Refunded',
] as const;

router.get('/overview', (_req, res) => {
  const totalCustomers = (db.prepare("SELECT COUNT(*) as cnt FROM users WHERE role = 'customer'").get() as { cnt: number }).cnt;
  const totalOrders = (db.prepare('SELECT COUNT(*) as cnt FROM orders').get() as { cnt: number }).cnt;
  const totalRevenueCents = (
    db.prepare("SELECT COALESCE(SUM(total_cents), 0) as sum FROM invoices WHERE status = 'Paid'").get() as { sum: number }
  ).sum;
  const monthlyRevenueCents = (
    db
      .prepare("SELECT COALESCE(SUM(total_cents), 0) as sum FROM invoices WHERE status = 'Paid' AND strftime('%Y-%m', COALESCE(paid_at, created_at)) = strftime('%Y-%m', 'now')")
      .get() as { sum: number }
  ).sum;
  const pendingPaymentsCount = (
    db.prepare("SELECT COUNT(*) as cnt FROM payments WHERE status IN ('Pending', 'Under Review')").get() as { cnt: number }
  ).cnt;
  const pendingOrdersCount = (
    db
      .prepare("SELECT COUNT(*) as cnt FROM orders WHERE status IN ('Order Submitted', 'Awaiting Payment', 'Payment Under Review', 'Processing', 'In Progress')")
      .get() as { cnt: number }
  ).cnt;
  const activeServicesCount = (
    db.prepare("SELECT COUNT(*) as cnt FROM services WHERE status IN ('Active', 'Expiring Soon')").get() as { cnt: number }
  ).cnt;
  const openTicketsCount = (
    db.prepare("SELECT COUNT(*) as cnt FROM support_tickets WHERE status IN ('Open', 'In Progress')").get() as { cnt: number }
  ).cnt;

  const recentTransactions = db
    .prepare(`
      SELECT t.*, u.customer_code, u.full_name, i.invoice_number
      FROM transactions t
      JOIN users u ON u.id = t.user_id
      JOIN invoices i ON i.id = t.invoice_id
      ORDER BY t.created_at DESC
      LIMIT 10
    `)
    .all();

  const monthlyAnalytics = db
    .prepare(`
      SELECT strftime('%Y-%m', COALESCE(paid_at, created_at)) as month,
             COALESCE(SUM(total_cents), 0) as revenue_cents,
             COUNT(*) as invoice_count
      FROM invoices
      WHERE status = 'Paid'
      GROUP BY month
      ORDER BY month DESC
      LIMIT 6
    `)
    .all()
    .reverse();

  res.json({
    stats: {
      total_customers: totalCustomers,
      total_orders: totalOrders,
      total_revenue_cents: totalRevenueCents,
      monthly_revenue_cents: monthlyRevenueCents,
      pending_payments: pendingPaymentsCount,
      pending_orders: pendingOrdersCount,
      active_services: activeServicesCount,
      open_tickets: openTicketsCount,
    },
    recent_transactions: recentTransactions,
    monthly_analytics: monthlyAnalytics,
  });
});

// Global Search across Customers, Orders, Invoices, Tickets
router.get('/search', (req, res) => {
  const q = String(req.query.q || '').trim();
  if (!q) {
    res.json({ customers: [], orders: [], invoices: [], tickets: [] });
    return;
  }
  const like = `%${q}%`;
  const customers = db
    .prepare("SELECT id, customer_code, full_name, email, company_name, status FROM users WHERE role = 'customer' AND (customer_code LIKE ? OR full_name LIKE ? OR email LIKE ? OR company_name LIKE ?) LIMIT 8")
    .all(like, like, like, like);
  const orders = db
    .prepare('SELECT id, order_number, status, total_cents, currency, created_at FROM orders WHERE order_number LIKE ? LIMIT 8')
    .all(like);
  const invoices = db
    .prepare('SELECT id, invoice_number, status, total_cents, currency, issue_date FROM invoices WHERE invoice_number LIKE ? LIMIT 8')
    .all(like);
  const tickets = db
    .prepare('SELECT id, ticket_number, subject, status, priority FROM support_tickets WHERE ticket_number LIKE ? OR subject LIKE ? LIMIT 8')
    .all(like, like);
  res.json({ customers, orders, invoices, tickets });
});

// Customer Management
router.get('/customers', (req, res) => {
  const search = String(req.query.search || '').trim();
  const status = String(req.query.status || '').trim();

  let sql = `
    SELECT u.*,
      (SELECT COUNT(*) FROM orders o WHERE o.user_id = u.id) as order_count,
      (SELECT COALESCE(SUM(i.total_cents), 0) FROM invoices i WHERE i.user_id = u.id AND i.status = 'Paid') as total_spent_cents
    FROM users u
    WHERE u.role = 'customer'
  `;
  const params: any[] = [];
  if (search) {
    sql += ' AND (u.customer_code LIKE ? OR u.full_name LIKE ? OR u.email LIKE ? OR u.company_name LIKE ?)';
    const l = `%${search}%`;
    params.push(l, l, l, l);
  }
  if (status) {
    sql += ' AND u.status = ?';
    params.push(status);
  }
  sql += ' ORDER BY u.created_at DESC';

  const customers = db.prepare(sql).all(...params).map(sanitizeUser);
  res.json({ customers });
});

router.get('/customers/:id', (req, res) => {
  const cid = Number(req.params.id);
  const customer = db.prepare('SELECT * FROM users WHERE id = ?').get(cid);
  if (!customer) {
    res.status(404).json({ error: 'Customer not found.' });
    return;
  }
  const orders = db.prepare('SELECT * FROM orders WHERE user_id = ? ORDER BY created_at DESC').all(cid);
  const invoices = db.prepare('SELECT * FROM invoices WHERE user_id = ? ORDER BY created_at DESC').all(cid);
  const payments = db.prepare('SELECT * FROM payments WHERE user_id = ? ORDER BY created_at DESC').all(cid);
  const services = db.prepare('SELECT * FROM services WHERE user_id = ? ORDER BY created_at DESC').all(cid);
  res.json({ customer: sanitizeUser(customer), orders, invoices, payments, services });
});

router.patch('/customers/:id', (req: AuthenticatedRequest, res) => {
  const cid = Number(req.params.id);
  const { status, internal_notes } = req.body || {};
  const existing = db.prepare('SELECT id, customer_code, status FROM users WHERE id = ?').get(cid) as any;
  if (!existing) {
    res.status(404).json({ error: 'Customer not found.' });
    return;
  }
  if (status && !['active', 'suspended', 'deletion_requested'].includes(status)) {
    res.status(400).json({ error: 'Invalid status.' });
    return;
  }
  db.prepare(`
    UPDATE users SET
      status = COALESCE(?, status),
      internal_notes = COALESCE(?, internal_notes),
      updated_at = datetime('now')
    WHERE id = ?
  `).run(status ?? null, internal_notes ?? null, cid);

  logActivity({
    userId: cid,
    actorUserId: req.user!.id,
    action: 'admin_customer_updated',
    entityType: 'user',
    entityId: existing.customer_code,
    details: { status },
  });
  res.json({ ok: true });
});

// Order Management
router.get('/orders', (req, res) => {
  const search = String(req.query.search || '').trim();
  const status = String(req.query.status || '').trim();
  let sql = `
    SELECT o.*, u.customer_code, u.full_name as customer_name, u.email as customer_email,
           i.id as invoice_id, i.invoice_number, i.status as invoice_status,
           a.full_name as assigned_admin_name
    FROM orders o
    JOIN users u ON u.id = o.user_id
    LEFT JOIN invoices i ON i.order_id = o.id
    LEFT JOIN users a ON a.id = o.assigned_admin_id
    WHERE 1=1
  `;
  const params: any[] = [];
  if (search) {
    sql += ' AND (o.order_number LIKE ? OR u.customer_code LIKE ? OR u.full_name LIKE ? OR u.email LIKE ?)';
    const l = `%${search}%`;
    params.push(l, l, l, l);
  }
  if (status) {
    sql += ' AND o.status = ?';
    params.push(status);
  }
  sql += ' ORDER BY o.created_at DESC';

  const orders = db.prepare(sql).all(...params) as any[];
  const getItems = db.prepare('SELECT * FROM order_items WHERE order_id = ?');
  const getHistory = db.prepare('SELECT * FROM order_status_history WHERE order_id = ? ORDER BY created_at ASC');
  res.json({
    orders: orders.map((o) => ({
      ...o,
      billing_snapshot: JSON.parse(o.billing_snapshot_json || '{}'),
      items: getItems.all(o.id),
      history: getHistory.all(o.id),
    })),
  });
});

router.patch('/orders/:id', async (req: AuthenticatedRequest, res) => {
  const orderId = Number(req.params.id);
  const { status, note, assigned_admin_id, internal_notes } = req.body || {};

  const order = db
    .prepare('SELECT o.*, u.email, u.full_name, u.customer_code FROM orders o JOIN users u ON u.id = o.user_id WHERE o.id = ?')
    .get(orderId) as any;
  if (!order) {
    res.status(404).json({ error: 'Order not found.' });
    return;
  }

  if (status && !ALLOWED_ORDER_STATUSES.includes(status)) {
    res.status(400).json({ error: 'Invalid order status.' });
    return;
  }

  db.transaction(() => {
    db.prepare(`
      UPDATE orders SET
        status = COALESCE(?, status),
        assigned_admin_id = COALESCE(?, assigned_admin_id),
        internal_notes = COALESCE(?, internal_notes),
        updated_at = datetime('now')
      WHERE id = ?
    `).run(status ?? null, assigned_admin_id ?? null, internal_notes ?? null, orderId);

    if (status && status !== order.status) {
      db.prepare(
        'INSERT INTO order_status_history (order_id, from_status, to_status, note, actor_user_id) VALUES (?, ?, ?, ?, ?)'
      ).run(orderId, order.status, status, note || `Status updated to ${status} by administrator`, req.user!.id);

      if (status === 'Cancelled') {
        db.prepare("UPDATE invoices SET status = 'Cancelled', updated_at = datetime('now') WHERE order_id = ? AND status IN ('Draft', 'Unpaid')").run(
          orderId
        );
      }
    }
  })();

  if (status && status !== order.status) {
    createInAppNotification({
      userId: order.user_id,
      title: `Order ${order.order_number}: ${status}`,
      message: note || `Your order status has progressed to ${status}.`,
      category: 'orders',
      linkTarget: 'orders',
    });

    await sendTransactionalEmail({
      to: order.email,
      subject: `Order ${order.order_number} Status Update: ${status}`,
      templateName: 'order_status_updated',
      heading: `Order Status: ${status}`,
      preheader: `Order ${order.order_number} has moved to ${status}.`,
      bodyHtml: `<p>Hello ${escapeHtml(order.full_name)},</p>
        <p>Your order <strong>${escapeHtml(order.order_number)}</strong> has been updated from <strong>${escapeHtml(order.status)}</strong> to <strong>${escapeHtml(status)}</strong>.</p>
        ${note ? `<p><strong>Engineer Note:</strong> ${escapeHtml(note)}</p>` : ''}`,
    });

    if (status === 'Completed') {
      await sendDiscordWebhook({
        event: 'order.completed',
        title: `Order Completed: ${order.order_number}`,
        description: `Order **${order.order_number}** for **${order.customer_code}** has been marked Completed.`,
        color: 0x16a34a,
      });
    }
  }

  logActivity({
    userId: order.user_id,
    actorUserId: req.user!.id,
    action: 'admin_order_updated',
    entityType: 'order',
    entityId: order.order_number,
    details: { status, note },
  });

  res.json({ ok: true });
});

// Invoice Management
router.get('/invoices', (_req, res) => {
  const invoices = db
    .prepare(`
      SELECT i.*, u.customer_code, u.full_name as customer_name, u.email as customer_email, o.order_number
      FROM invoices i
      JOIN users u ON u.id = i.user_id
      LEFT JOIN orders o ON o.id = i.order_id
      ORDER BY i.created_at DESC
    `)
    .all() as any[];

  const getItems = db.prepare('SELECT * FROM invoice_items WHERE invoice_id = ?');
  res.json({
    invoices: invoices.map((inv) => ({
      ...inv,
      billing_snapshot: JSON.parse(inv.billing_snapshot_json || '{}'),
      items: getItems.all(inv.id),
    })),
  });
});

router.post('/invoices', async (req: AuthenticatedRequest, res) => {
  const schema = z.object({
    user_id: z.number().int().positive(),
    status: z.enum(['Draft', 'Unpaid']).default('Unpaid'),
    due_days: z.number().int().min(1).max(90).default(14),
    payment_method: z.string().min(2).default('Bank Transfer'),
    discount_cents: z.number().int().min(0).default(0),
    notes: z.string().optional().default('Thank you for your business!'),
    items: z
      .array(
        z.object({
          description: z.string().min(2),
          quantity: z.number().int().min(1),
          unit_price_cents: z.number().int().min(0),
        })
      )
      .min(1),
  });

  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid manual invoice fields.' });
    return;
  }
  const d = parsed.data;
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(d.user_id) as any;
  if (!user) {
    res.status(404).json({ error: 'Customer not found.' });
    return;
  }

  const taxSetting = db.prepare("SELECT value FROM settings WHERE key = 'tax_rate_bps'").get() as { value: string } | undefined;
  const taxRateBps = Number(taxSetting?.value ?? 850);
  const subtotalCents = d.items.reduce((sum, item) => sum + item.quantity * item.unit_price_cents, 0);
  const discountCents = Math.min(subtotalCents, d.discount_cents);
  const taxable = Math.max(0, subtotalCents - discountCents);
  const taxCents = Math.round((taxable * taxRateBps) / 10000);
  const totalCents = taxable + taxCents;

  const nowIso = new Date().toISOString();
  const dueIso = new Date(Date.now() + d.due_days * 86400 * 1000).toISOString();
  const billingSnap = JSON.stringify({
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

  const invoiceNumber = generateInvoiceNumber();
  const invoiceId = db.transaction(() => {
    const invRes = db.prepare(`
      INSERT INTO invoices (
        invoice_number, user_id, status, issue_date, due_date, subtotal_cents, discount_cents,
        tax_rate_bps, tax_cents, total_cents, currency, payment_method, billing_snapshot_json, notes
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'USD', ?, ?, ?)
    `).run(invoiceNumber, user.id, d.status, nowIso, dueIso, subtotalCents, discountCents, taxRateBps, taxCents, totalCents, d.payment_method, billingSnap, d.notes);
    const id = Number(invRes.lastInsertRowid);

    const insItem = db.prepare('INSERT INTO invoice_items (invoice_id, description, quantity, unit_price_cents, amount_cents) VALUES (?, ?, ?, ?, ?)');
    for (const item of d.items) {
      insItem.run(id, item.description, item.quantity, item.unit_price_cents, item.quantity * item.unit_price_cents);
    }
    return id;
  })();

  if (d.status === 'Unpaid') {
    createInAppNotification({
      userId: user.id,
      title: `New Invoice ${invoiceNumber}`,
      message: `An invoice for ${formatMoney(totalCents, 'USD')} has been issued to your account.`,
      category: 'billing',
      linkTarget: 'invoices',
    });

    await sendTransactionalEmail({
      to: user.email,
      subject: `Invoice ${invoiceNumber} Issued — HelzerX Technologies`,
      templateName: 'manual_invoice_issued',
      heading: `Invoice ${invoiceNumber}`,
      preheader: `Amount due: ${formatMoney(totalCents, 'USD')}`,
      bodyHtml: `<p>Hello ${escapeHtml(user.full_name)},</p><p>Invoice <strong>${escapeHtml(invoiceNumber)}</strong> for <strong>${escapeHtml(formatMoney(totalCents, 'USD'))}</strong> is now available in your portal.</p>`,
    });
  }

  logActivity({ userId: user.id, actorUserId: req.user!.id, action: 'admin_invoice_created', entityType: 'invoice', entityId: invoiceNumber });
  res.status(201).json({ id: invoiceId, invoice_number: invoiceNumber });
});

router.patch('/invoices/:id', (req: AuthenticatedRequest, res) => {
  const invoiceId = Number(req.params.id);
  const { status, discount_cents, notes, payment_method } = req.body || {};
  const inv = db.prepare('SELECT * FROM invoices WHERE id = ?').get(invoiceId) as any;
  if (!inv) {
    res.status(404).json({ error: 'Invoice not found.' });
    return;
  }

  if (status && !ALLOWED_INVOICE_STATUSES.includes(status)) {
    res.status(400).json({ error: 'Invalid invoice status.' });
    return;
  }

  // Never allow blind marking as Paid without recording verification if Paid wasn't previously set
  const newDiscount = discount_cents !== undefined ? Math.min(inv.subtotal_cents, Math.max(0, Number(discount_cents))) : inv.discount_cents;
  const taxable = Math.max(0, inv.subtotal_cents - newDiscount);
  const newTax = Math.round((taxable * inv.tax_rate_bps) / 10000);
  const newTotal = taxable + newTax;

  db.transaction(() => {
    db.prepare(`
      UPDATE invoices SET
        status = COALESCE(?, status),
        discount_cents = ?,
        tax_cents = ?,
        total_cents = ?,
        notes = COALESCE(?, notes),
        payment_method = COALESCE(?, payment_method),
        paid_at = CASE WHEN ? = 'Paid' AND paid_at IS NULL THEN datetime('now') ELSE paid_at END,
        updated_at = datetime('now')
      WHERE id = ?
    `).run(status ?? null, newDiscount, newTax, newTotal, notes ?? null, payment_method ?? null, status ?? '', invoiceId);

    if (status === 'Paid' && inv.status !== 'Paid') {
      const payNum = generatePaymentNumber();
      const txnCode = generateTransactionCode();
      const pRes = db.prepare(`
        INSERT INTO payments (payment_number, invoice_id, order_id, user_id, method, amount_cents, currency, status, transaction_ref, reviewed_by, review_note, reviewed_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, 'Verified', 'ADMIN-VERIFIED', ?, 'Verified by administrator via Invoice Manager', datetime('now'))
      `).run(payNum, inv.id, inv.order_id, inv.user_id, payment_method || inv.payment_method, newTotal, inv.currency, req.user!.id);

      db.prepare(`
        INSERT INTO transactions (transaction_code, payment_id, invoice_id, user_id, type, amount_cents, currency, status)
        VALUES (?, ?, ?, ?, 'manual_settlement', ?, ?, 'Completed')
      `).run(txnCode, Number(pRes.lastInsertRowid), inv.id, inv.user_id, newTotal, inv.currency);

      if (inv.order_id) {
        const ord = db.prepare('SELECT status FROM orders WHERE id = ?').get(inv.order_id) as any;
        if (ord && ['Order Submitted', 'Awaiting Payment', 'Payment Under Review'].includes(ord.status)) {
          db.prepare("UPDATE orders SET status = 'Payment Confirmed', updated_at = datetime('now') WHERE id = ?").run(inv.order_id);
          db.prepare('INSERT INTO order_status_history (order_id, from_status, to_status, note, actor_user_id) VALUES (?, ?, ?, ?, ?)').run(
            inv.order_id,
            ord.status,
            'Payment Confirmed',
            `Invoice ${inv.invoice_number} verified as Paid by administrator`,
            req.user!.id
          );
        }
      }
    }
  })();

  logActivity({ userId: inv.user_id, actorUserId: req.user!.id, action: 'admin_invoice_updated', entityType: 'invoice', entityId: inv.invoice_number, details: { status } });
  res.json({ ok: true });
});

router.post('/invoices/:id/resend', async (req: AuthenticatedRequest, res) => {
  const inv = db
    .prepare('SELECT i.*, u.email, u.full_name FROM invoices i JOIN users u ON u.id = i.user_id WHERE i.id = ?')
    .get(Number(req.params.id)) as any;
  if (!inv) {
    res.status(404).json({ error: 'Invoice not found.' });
    return;
  }

  await sendTransactionalEmail({
    to: inv.email,
    subject: `Invoice Reminder: ${inv.invoice_number} — HelzerX Technologies`,
    templateName: 'invoice_resent',
    heading: `Invoice ${inv.invoice_number}`,
    preheader: `Status: ${inv.status} · Total: ${formatMoney(inv.total_cents, inv.currency)}`,
    bodyHtml: `<p>Hello ${escapeHtml(inv.full_name)},</p><p>Here is a copy reminder for invoice <strong>${escapeHtml(inv.invoice_number)}</strong> (${escapeHtml(inv.status)}) totaling <strong>${escapeHtml(formatMoney(inv.total_cents, inv.currency))}</strong>.</p>`,
  });
  res.json({ ok: true });
});

// Payment Verification Queue
router.get('/payments', (_req, res) => {
  const payments = db
    .prepare(`
      SELECT p.*, u.customer_code, u.full_name as customer_name, u.email as customer_email,
             i.invoice_number, i.status as invoice_status, o.order_number,
             r.id as receipt_id, r.original_filename as receipt_filename
      FROM payments p
      JOIN users u ON u.id = p.user_id
      JOIN invoices i ON i.id = p.invoice_id
      LEFT JOIN orders o ON o.id = p.order_id
      LEFT JOIN payment_receipts r ON r.payment_id = p.id
      ORDER BY p.created_at DESC
    `)
    .all();
  res.json({ payments });
});

router.post('/payments/:id/review', async (req: AuthenticatedRequest, res) => {
  const paymentId = Number(req.params.id);
  const { decision, note } = req.body || {};
  if (!['approve', 'reject'].includes(decision)) {
    res.status(400).json({ error: 'Decision must be "approve" or "reject".' });
    return;
  }

  const payment = db
    .prepare(`
      SELECT p.*, i.invoice_number, u.email, u.full_name, u.customer_code
      FROM payments p
      JOIN invoices i ON i.id = p.invoice_id
      JOIN users u ON u.id = p.user_id
      WHERE p.id = ?
    `)
    .get(paymentId) as any;

  if (!payment) {
    res.status(404).json({ error: 'Payment record not found.' });
    return;
  }

  db.transaction(() => {
    if (decision === 'approve') {
      db.prepare("UPDATE payments SET status = 'Verified', reviewed_by = ?, review_note = ?, reviewed_at = datetime('now'), updated_at = datetime('now') WHERE id = ?").run(
        req.user!.id,
        note || 'Payment receipt verified by finance administrator',
        paymentId
      );
      db.prepare("UPDATE invoices SET status = 'Paid', paid_at = datetime('now'), updated_at = datetime('now') WHERE id = ?").run(
        payment.invoice_id
      );

      const txnCode = generateTransactionCode();
      db.prepare(`
        INSERT INTO transactions (transaction_code, payment_id, invoice_id, user_id, type, amount_cents, currency, status)
        VALUES (?, ?, ?, ?, 'manual_settlement', ?, ?, 'Completed')
      `).run(txnCode, paymentId, payment.invoice_id, payment.user_id, payment.amount_cents, payment.currency);

      if (payment.order_id) {
        const ord = db.prepare('SELECT status FROM orders WHERE id = ?').get(payment.order_id) as any;
        if (ord) {
          db.prepare("UPDATE orders SET status = 'Payment Confirmed', updated_at = datetime('now') WHERE id = ?").run(payment.order_id);
          db.prepare('INSERT INTO order_status_history (order_id, from_status, to_status, note, actor_user_id) VALUES (?, ?, ?, ?, ?)').run(
            payment.order_id,
            ord.status,
            'Payment Confirmed',
            note || `Payment ${payment.payment_number} verified`,
            req.user!.id
          );
        }

        // Provision active service entries for each order item if not yet provisioned
        const existingSvc = db.prepare('SELECT id FROM services WHERE order_id = ?').get(payment.order_id);
        if (!existingSvc) {
          const items = db
            .prepare(`
              SELECT oi.*, pkg.duration_days
              FROM order_items oi
              LEFT JOIN packages pkg ON pkg.id = oi.package_id
              WHERE oi.order_id = ?
            `)
            .all(payment.order_id) as any[];
          const nowIso = new Date().toISOString();
          for (const item of items) {
            const days = item.duration_days || 30;
            const expIso = new Date(Date.now() + days * 86400 * 1000).toISOString();
            db.prepare(`
              INSERT INTO services (service_code, user_id, order_id, product_id, package_id, product_name, package_name, status, started_at, expires_at, endpoint_info)
              VALUES (?, ?, ?, ?, ?, ?, ?, 'Active', ?, ?, ?)
            `).run(
              generateServiceCode(),
              payment.user_id,
              payment.order_id,
              item.product_id,
              item.package_id,
              item.product_name,
              item.package_name,
              nowIso,
              expIso,
              'provisioned.helzerx.cyou'
            );
          }
        }
      }
    } else {
      db.prepare("UPDATE payments SET status = 'Rejected', reviewed_by = ?, review_note = ?, reviewed_at = datetime('now'), updated_at = datetime('now') WHERE id = ?").run(
        req.user!.id,
        note || 'Receipt rejected — please re-upload valid transfer proof',
        paymentId
      );
      db.prepare("UPDATE invoices SET status = 'Unpaid', updated_at = datetime('now') WHERE id = ?").run(payment.invoice_id);
      if (payment.order_id) {
        const ord = db.prepare('SELECT status FROM orders WHERE id = ?').get(payment.order_id) as any;
        if (ord) {
          db.prepare("UPDATE orders SET status = 'Awaiting Payment', updated_at = datetime('now') WHERE id = ?").run(payment.order_id);
          db.prepare('INSERT INTO order_status_history (order_id, from_status, to_status, note, actor_user_id) VALUES (?, ?, ?, ?, ?)').run(
            payment.order_id,
            ord.status,
            'Awaiting Payment',
            note || `Payment ${payment.payment_number} rejected`,
            req.user!.id
          );
        }
      }
    }
  })();

  const approved = decision === 'approve';
  createInAppNotification({
    userId: payment.user_id,
    title: approved ? `Payment Verified: ${payment.invoice_number}` : `Payment Rejected: ${payment.invoice_number}`,
    message: approved
      ? `Your payment of ${formatMoney(payment.amount_cents, payment.currency)} has been verified and services activated.`
      : note || 'Your payment receipt could not be verified. Please upload a clear receipt.',
    category: 'payments',
    linkTarget: 'invoices',
  });

  await sendTransactionalEmail({
    to: payment.email,
    subject: approved
      ? `Payment Verified — Invoice ${payment.invoice_number} Paid`
      : `Action Required: Payment Verification Rejected (${payment.invoice_number})`,
    templateName: approved ? 'payment_confirmed' : 'payment_rejected',
    heading: approved ? 'Payment Confirmed' : 'Payment Verification Rejected',
    preheader: `Invoice ${payment.invoice_number} — ${formatMoney(payment.amount_cents, payment.currency)}`,
    bodyHtml: approved
      ? `<p>Hello ${escapeHtml(payment.full_name)},</p><p>Your payment (${escapeHtml(payment.payment_number)}) for invoice <strong>${escapeHtml(payment.invoice_number)}</strong> totaling <strong>${escapeHtml(formatMoney(payment.amount_cents, payment.currency))}</strong> has been verified. Your invoice is now marked <strong>Paid</strong>.</p>`
      : `<p>Hello ${escapeHtml(payment.full_name)},</p><p>Your payment submission (${escapeHtml(payment.payment_number)}) for invoice <strong>${escapeHtml(payment.invoice_number)}</strong> could not be verified.</p><p><strong>Reason:</strong> ${escapeHtml(note || 'Invalid or unreadable proof of transfer.')}</p>`,
  });

  await sendDiscordWebhook({
    event: approved ? 'payment.verified' : 'payment.rejected',
    title: approved ? `Payment Verified: ${payment.invoice_number}` : `Payment Rejected: ${payment.invoice_number}`,
    description: `${payment.customer_code} · ${formatMoney(payment.amount_cents, payment.currency)}`,
    color: approved ? 0x16a34a : 0xdc2626,
  });

  logActivity({
    userId: payment.user_id,
    actorUserId: req.user!.id,
    action: approved ? 'payment_verified' : 'payment_rejected',
    entityType: 'payment',
    entityId: payment.payment_number,
  });

  res.json({ ok: true });
});

// Refunds
router.get('/refunds', (_req, res) => {
  const refunds = db
    .prepare(`
      SELECT r.*, o.order_number, i.invoice_number, u.customer_code, u.full_name as customer_name
      FROM refund_requests r
      JOIN orders o ON o.id = r.order_id
      LEFT JOIN invoices i ON i.id = r.invoice_id
      JOIN users u ON u.id = r.user_id
      ORDER BY r.created_at DESC
    `)
    .all();
  res.json({ refunds });
});

router.post('/refunds/:id/process', (req: AuthenticatedRequest, res) => {
  const refundId = Number(req.params.id);
  const { decision, admin_note } = req.body || {};
  const rf = db.prepare('SELECT * FROM refund_requests WHERE id = ?').get(refundId) as any;
  if (!rf) {
    res.status(404).json({ error: 'Refund request not found.' });
    return;
  }
  if (!['Processed', 'Rejected'].includes(decision)) {
    res.status(400).json({ error: 'Decision must be Processed or Rejected.' });
    return;
  }

  db.transaction(() => {
    db.prepare("UPDATE refund_requests SET status = ?, admin_note = ?, reviewed_by = ?, updated_at = datetime('now') WHERE id = ?").run(
      decision,
      admin_note || '',
      req.user!.id,
      refundId
    );
    if (decision === 'Processed') {
      db.prepare("UPDATE orders SET status = 'Refunded', updated_at = datetime('now') WHERE id = ?").run(rf.order_id);
      if (rf.invoice_id) {
        db.prepare("UPDATE invoices SET status = 'Refunded', updated_at = datetime('now') WHERE id = ?").run(rf.invoice_id);
        db.prepare(`
          INSERT INTO transactions (transaction_code, invoice_id, user_id, type, amount_cents, currency, status)
          VALUES (?, ?, ?, 'refund', ?, 'USD', 'Completed')
        `).run(generateTransactionCode(), rf.invoice_id, rf.user_id, rf.amount_cents);
      }
      db.prepare('INSERT INTO order_status_history (order_id, from_status, to_status, note, actor_user_id) VALUES (?, ?, ?, ?, ?)').run(
        rf.order_id,
        'Completed',
        'Refunded',
        admin_note || 'Refund processed by administrator',
        req.user!.id
      );
    }
  })();

  createInAppNotification({
    userId: rf.user_id,
    title: `Refund Request ${decision}`,
    message: admin_note || `Your refund request has been marked ${decision}.`,
    category: 'billing',
    linkTarget: 'orders',
  });
  res.json({ ok: true });
});

// Product, Package & Category Management
router.get('/catalog', (_req, res) => {
  const categories = db.prepare('SELECT * FROM categories ORDER BY sort_order ASC, id ASC').all();
  const products = db.prepare('SELECT * FROM products ORDER BY id DESC').all() as any[];
  const packages = db.prepare('SELECT * FROM packages ORDER BY price_cents ASC').all() as any[];
  res.json({
    categories,
    products: products.map((p) => ({
      ...p,
      features: JSON.parse(p.features_json || '[]'),
      packages: packages
        .filter((pkg) => pkg.product_id === p.id)
        .map((pkg) => ({ ...pkg, features: JSON.parse(pkg.features_json || '[]') })),
    })),
  });
});

router.post('/categories', (req, res) => {
  const name = String(req.body?.name || '').trim();
  const description = String(req.body?.description || '').trim();
  if (!name) {
    res.status(400).json({ error: 'Category name is required.' });
    return;
  }
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const r = db.prepare('INSERT INTO categories (name, slug, description) VALUES (?, ?, ?)').run(name, `${slug}-${Date.now()}`, description);
  res.status(201).json({ id: Number(r.lastInsertRowid) });
});

router.post('/products', (req, res) => {
  const schema = z.object({
    category_id: z.number().int().positive(),
    name: z.string().trim().min(2),
    tagline: z.string().trim().optional().default(''),
    description: z.string().trim().optional().default(''),
    features: z.array(z.string()).optional().default([]),
    is_active: z.boolean().optional().default(true),
    featured: z.boolean().optional().default(false),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid product data.' });
    return;
  }
  const d = parsed.data;
  const slug = `${d.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${Date.now()}`;
  const r = db.prepare(`
    INSERT INTO products (category_id, name, slug, tagline, description, features_json, is_active, featured)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(d.category_id, d.name, slug, d.tagline, d.description, JSON.stringify(d.features), d.is_active ? 1 : 0, d.featured ? 1 : 0);
  res.status(201).json({ id: Number(r.lastInsertRowid) });
});

router.patch('/products/:id', (req, res) => {
  const id = Number(req.params.id);
  const { name, tagline, description, is_active, featured, category_id, features } = req.body || {};
  db.prepare(`
    UPDATE products SET
      name = COALESCE(?, name),
      tagline = COALESCE(?, tagline),
      description = COALESCE(?, description),
      category_id = COALESCE(?, category_id),
      features_json = COALESCE(?, features_json),
      is_active = COALESCE(?, is_active),
      featured = COALESCE(?, featured),
      updated_at = datetime('now')
    WHERE id = ?
  `).run(
    name ?? null,
    tagline ?? null,
    description ?? null,
    category_id ?? null,
    features ? JSON.stringify(features) : null,
    is_active === undefined ? null : is_active ? 1 : 0,
    featured === undefined ? null : featured ? 1 : 0,
    id
  );
  res.json({ ok: true });
});

router.delete('/products/:id', (req, res) => {
  db.prepare('DELETE FROM products WHERE id = ?').run(Number(req.params.id));
  res.json({ ok: true });
});

router.post('/packages', (req, res) => {
  const schema = z.object({
    product_id: z.number().int().positive(),
    name: z.string().trim().min(2),
    billing_cycle: z.enum(['monthly', 'quarterly', 'annual', 'one_time']),
    duration_days: z.number().int().min(1),
    price_cents: z.number().int().min(0),
    features: z.array(z.string()).optional().default([]),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid package data.' });
    return;
  }
  const d = parsed.data;
  const r = db.prepare(`
    INSERT INTO packages (product_id, name, billing_cycle, duration_days, price_cents, currency, features_json, is_active)
    VALUES (?, ?, ?, ?, ?, 'USD', ?, 1)
  `).run(d.product_id, d.name, d.billing_cycle, d.duration_days, d.price_cents, JSON.stringify(d.features));
  res.status(201).json({ id: Number(r.lastInsertRowid) });
});

router.patch('/packages/:id', (req, res) => {
  const id = Number(req.params.id);
  const { name, price_cents, billing_cycle, duration_days, is_active } = req.body || {};
  db.prepare(`
    UPDATE packages SET
      name = COALESCE(?, name),
      price_cents = COALESCE(?, price_cents),
      billing_cycle = COALESCE(?, billing_cycle),
      duration_days = COALESCE(?, duration_days),
      is_active = COALESCE(?, is_active)
    WHERE id = ?
  `).run(name ?? null, price_cents ?? null, billing_cycle ?? null, duration_days ?? null, is_active === undefined ? null : is_active ? 1 : 0, id);
  res.json({ ok: true });
});

router.delete('/packages/:id', (req, res) => {
  db.prepare('DELETE FROM packages WHERE id = ?').run(Number(req.params.id));
  res.json({ ok: true });
});

// Coupons / Promo Codes
router.get('/coupons', (_req, res) => {
  res.json({ coupons: db.prepare('SELECT * FROM coupons ORDER BY created_at DESC').all() });
});

router.post('/coupons', (req, res) => {
  const schema = z.object({
    code: z.string().trim().min(3).max(32),
    discount_type: z.enum(['percentage', 'fixed']),
    discount_value: z.number().int().positive(),
    min_purchase_cents: z.number().int().min(0).default(0),
    max_uses: z.number().int().positive().nullable().optional(),
    expires_at: z.string().nullable().optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid coupon parameters.' });
    return;
  }
  const d = parsed.data;
  try {
    const r = db.prepare(`
      INSERT INTO coupons (code, discount_type, discount_value, min_purchase_cents, max_uses, expires_at, is_active)
      VALUES (?, ?, ?, ?, ?, ?, 1)
    `).run(d.code.toUpperCase(), d.discount_type, d.discount_value, d.min_purchase_cents, d.max_uses ?? null, d.expires_at ?? null);
    res.status(201).json({ id: Number(r.lastInsertRowid) });
  } catch {
    res.status(409).json({ error: 'Promo code already exists.' });
  }
});

router.patch('/coupons/:id', (req, res) => {
  const isActive = req.body?.is_active ? 1 : 0;
  db.prepare('UPDATE coupons SET is_active = ? WHERE id = ?').run(isActive, Number(req.params.id));
  res.json({ ok: true });
});

router.delete('/coupons/:id', (req, res) => {
  db.prepare('DELETE FROM coupons WHERE id = ?').run(Number(req.params.id));
  res.json({ ok: true });
});

// Admin Support Ticket Desk
router.get('/tickets', (_req, res) => {
  const tickets = db
    .prepare(`
      SELECT t.*, u.customer_code, u.full_name as customer_name, u.email as customer_email, o.order_number,
             (SELECT COUNT(*) FROM ticket_messages m WHERE m.ticket_id = t.id) as message_count
      FROM support_tickets t
      JOIN users u ON u.id = t.user_id
      LEFT JOIN orders o ON o.id = t.order_id
      ORDER BY t.updated_at DESC
    `)
    .all();
  res.json({ tickets });
});

router.get('/tickets/:id', (req, res) => {
  const ticket = db
    .prepare(`
      SELECT t.*, u.customer_code, u.full_name as customer_name, u.email as customer_email, o.order_number
      FROM support_tickets t
      JOIN users u ON u.id = t.user_id
      LEFT JOIN orders o ON o.id = t.order_id
      WHERE t.id = ?
    `)
    .get(Number(req.params.id));
  if (!ticket) {
    res.status(404).json({ error: 'Ticket not found.' });
    return;
  }
  const messages = db
    .prepare(`
      SELECT m.*, u.full_name as sender_name
      FROM ticket_messages m
      JOIN users u ON u.id = m.sender_user_id
      WHERE m.ticket_id = ?
      ORDER BY m.created_at ASC
    `)
    .all(Number(req.params.id));
  res.json({ ticket, messages });
});

router.post('/tickets/:id/reply', async (req: AuthenticatedRequest, res) => {
  const ticketId = Number(req.params.id);
  const message = String(req.body?.message || '').trim();
  const status = req.body?.status;

  const ticket = db
    .prepare('SELECT t.*, u.email, u.full_name FROM support_tickets t JOIN users u ON u.id = t.user_id WHERE t.id = ?')
    .get(ticketId) as any;
  if (!ticket) {
    res.status(404).json({ error: 'Ticket not found.' });
    return;
  }
  if (!message) {
    res.status(400).json({ error: 'Reply message is required.' });
    return;
  }

  db.transaction(() => {
    db.prepare(`
      INSERT INTO ticket_messages (ticket_id, sender_user_id, sender_role, message)
      VALUES (?, ?, 'admin', ?)
    `).run(ticketId, req.user!.id, message);

    const nextStatus = status || 'Waiting for Customer';
    db.prepare("UPDATE support_tickets SET status = ?, assigned_admin_id = ?, updated_at = datetime('now') WHERE id = ?").run(
      nextStatus,
      req.user!.id,
      ticketId
    );
  })();

  createInAppNotification({
    userId: ticket.user_id,
    title: `Support Reply: ${ticket.ticket_number}`,
    message: `HelzerX engineering responded to "${ticket.subject}".`,
    category: 'support',
    linkTarget: 'support',
  });

  await sendTransactionalEmail({
    to: ticket.email,
    subject: `New Reply on Ticket ${ticket.ticket_number}: ${ticket.subject}`,
    templateName: 'ticket_reply',
    heading: `Support Update — ${ticket.ticket_number}`,
    preheader: message.slice(0, 90),
    bodyHtml: `<p>Hello ${escapeHtml(ticket.full_name)},</p><p>A HelzerX specialist has replied to your ticket <strong>${escapeHtml(ticket.ticket_number)}</strong>:</p><blockquote style="border-left:2px solid #EA580C;padding-left:12px;color:#E4E4E7;">${escapeHtml(message)}</blockquote>`,
  });

  res.status(201).json({ ok: true });
});

router.patch('/tickets/:id', (req, res) => {
  const status = String(req.body?.status || '');
  if (!['Open', 'In Progress', 'Waiting for Customer', 'Resolved', 'Closed'].includes(status)) {
    res.status(400).json({ error: 'Invalid ticket status.' });
    return;
  }
  db.prepare("UPDATE support_tickets SET status = ?, updated_at = datetime('now') WHERE id = ?").run(status, Number(req.params.id));
  res.json({ ok: true });
});

// Settings, Audit Logs, Email Logs, CSV Export
router.get('/settings', (_req, res) => {
  const rows = db.prepare('SELECT key, value FROM settings').all() as Array<{ key: string; value: string }>;
  const settings: Record<string, string> = {};
  for (const r of rows) settings[r.key] = r.value;
  res.json({ settings });
});

router.patch('/settings', (req: AuthenticatedRequest, res) => {
  const entries = req.body?.settings;
  if (!entries || typeof entries !== 'object') {
    res.status(400).json({ error: 'Settings map required.' });
    return;
  }
  const upsert = db.prepare("INSERT INTO settings (key, value, updated_at) VALUES (?, ?, datetime('now')) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')");
  const tx = db.transaction(() => {
    for (const [k, v] of Object.entries(entries)) {
      if (typeof v === 'string' || typeof v === 'number') {
        upsert.run(k, String(v));
      }
    }
  });
  tx();
  logActivity({ actorUserId: req.user!.id, action: 'settings_updated', entityType: 'settings', entityId: 'global' });
  res.json({ ok: true });
});

router.get('/audit-logs', (_req, res) => {
  const logs = db
    .prepare(`
      SELECT a.*, u.email as actor_email, u.full_name as actor_name
      FROM activity_logs a
      LEFT JOIN users u ON u.id = a.actor_user_id
      ORDER BY a.created_at DESC
      LIMIT 100
    `)
    .all();
  res.json({ logs });
});

router.get('/email-logs', (_req, res) => {
  const emails = db.prepare('SELECT * FROM email_logs ORDER BY created_at DESC LIMIT 80').all();
  res.json({ emails });
});

// Security & Intrusion Monitoring
router.get('/security', (_req, res) => {
  const loginEvents = db
    .prepare(`
      SELECT l.*, u.customer_code, u.full_name
      FROM login_history l
      LEFT JOIN users u ON u.id = l.user_id
      ORDER BY l.created_at DESC
      LIMIT 60
    `)
    .all();

  const lockedAccounts = db
    .prepare(`
      SELECT id, customer_code, email, full_name, role, failed_login_attempts, locked_until, last_login_ip, last_login_at
      FROM users
      WHERE failed_login_attempts > 0 OR (locked_until IS NOT NULL AND locked_until > datetime('now'))
      ORDER BY locked_until DESC, failed_login_attempts DESC
    `)
    .all();

  res.json({ login_events: loginEvents, locked_accounts: lockedAccounts });
});

router.post('/customers/:id/unlock', (req: AuthenticatedRequest, res) => {
  const cid = Number(req.params.id);
  const existing = db.prepare('SELECT id, customer_code, email FROM users WHERE id = ?').get(cid) as any;
  if (!existing) {
    res.status(404).json({ error: 'Account not found.' });
    return;
  }

  db.prepare("UPDATE users SET failed_login_attempts = 0, locked_until = NULL, updated_at = datetime('now') WHERE id = ?").run(cid);
  logActivity({
    userId: cid,
    actorUserId: req.user!.id,
    action: 'admin_account_unlocked',
    entityType: 'user',
    entityId: existing.customer_code,
    ipAddress: getClientIp(req),
  });
  res.json({ ok: true });
});

function sanitizeCsvCell(value: unknown): string {
  let str = String(value ?? '');
  if (/^[=+\-@]/.test(str)) {
    str = `'${str}`;
  }
  return `"${str.replace(/"/g, '""')}"`;
}

router.get('/export/:type', (req, res) => {
  const type = req.params.type;
  let rows: any[] = [];
  let headers: string[] = [];

  if (type === 'orders') {
    rows = db.prepare('SELECT order_number, user_id, status, subtotal_cents, discount_cents, tax_cents, total_cents, currency, promo_code, created_at FROM orders ORDER BY created_at DESC').all();
    headers = ['order_number', 'user_id', 'status', 'subtotal_cents', 'discount_cents', 'tax_cents', 'total_cents', 'currency', 'promo_code', 'created_at'];
  } else if (type === 'invoices') {
    rows = db.prepare('SELECT invoice_number, order_id, user_id, status, issue_date, due_date, total_cents, currency, payment_method, paid_at FROM invoices ORDER BY created_at DESC').all();
    headers = ['invoice_number', 'order_id', 'user_id', 'status', 'issue_date', 'due_date', 'total_cents', 'currency', 'payment_method', 'paid_at'];
  } else if (type === 'customers') {
    rows = db.prepare("SELECT customer_code, full_name, email, mobile, country, city, company_name, status, created_at FROM users WHERE role = 'customer' ORDER BY created_at DESC").all();
    headers = ['customer_code', 'full_name', 'email', 'mobile', 'country', 'city', 'company_name', 'status', 'created_at'];
  } else if (type === 'payments') {
    rows = db.prepare('SELECT payment_number, invoice_id, user_id, method, amount_cents, currency, status, transaction_ref, created_at FROM payments ORDER BY created_at DESC').all();
    headers = ['payment_number', 'invoice_id', 'user_id', 'method', 'amount_cents', 'currency', 'status', 'transaction_ref', 'created_at'];
  } else {
    res.status(400).json({ error: 'Unsupported export type.' });
    return;
  }

  const lines = [headers.join(',')];
  for (const row of rows) {
    lines.push(headers.map((h) => sanitizeCsvCell(row[h])).join(','));
  }

  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="helzerx-${type}-${new Date().toISOString().slice(0, 10)}.csv"`);
  res.send(lines.join('\n'));
});

export default router;
