import 'dotenv/config';
import express from 'express';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import path from 'path';
import fs from 'fs';
import Stripe from 'stripe';
import { createServer as createViteServer } from 'vite';
import { db, generatePaymentNumber, generateServiceCode, generateTransactionCode, runMigrations, seedInitialData } from './server/db';
import authRoutes from './server/routes/auth';
import catalogRoutes from './server/routes/catalog';
import customerRoutes from './server/routes/customer';
import adminRoutes from './server/routes/admin';
import { createInAppNotification, sendDiscordWebhook, sendTransactionalEmail } from './server/services/notifications';
import { formatMoney } from './server/services/pdfInvoice';
import { escapeHtml, verifyCsrfMiddleware } from './server/services/security';

runMigrations();
seedInitialData();

const app = express();
const PORT = Number(process.env.PORT || 3000);

app.set('trust proxy', 1);

app.use(
  helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false,
    frameguard: false,
    noSniff: true,
    referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
  })
);

// Stripe Webhook must receive raw body before express.json()
app.post('/api/webhooks/stripe', express.raw({ type: 'application/json' }), async (req, res) => {
  const sig = req.headers['stripe-signature'];
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  const stripeKey = process.env.STRIPE_SECRET_KEY;

  if (!stripeKey || !secret || !sig) {
    res.status(400).send('Stripe webhook not configured');
    return;
  }

  const stripe = new Stripe(stripeKey);
  try {
    const event = stripe.webhooks.constructEvent(req.body, sig, secret);
    if (event.type === 'checkout.session.completed') {
      const session = event.data.object as Stripe.Checkout.Session;
      const invoiceId = Number(session.metadata?.invoice_id);
      if (invoiceId) {
        const inv = db
          .prepare('SELECT i.*, u.email, u.full_name, u.customer_code FROM invoices i JOIN users u ON u.id = i.user_id WHERE i.id = ?')
          .get(invoiceId) as any;
        if (inv && inv.status !== 'Paid') {
          db.transaction(() => {
            db.prepare("UPDATE invoices SET status = 'Paid', payment_method = 'Stripe', paid_at = datetime('now'), updated_at = datetime('now') WHERE id = ?").run(
              inv.id
            );
            const existingPay = db.prepare('SELECT id FROM payments WHERE gateway_session_id = ?').get(session.id) as any;
            let payId: number;
            if (existingPay) {
              payId = existingPay.id;
              db.prepare("UPDATE payments SET status = 'Verified', transaction_ref = ?, reviewed_at = datetime('now') WHERE id = ?").run(
                String(session.payment_intent || session.id),
                payId
              );
            } else {
              const pRes = db.prepare(`
                INSERT INTO payments (payment_number, invoice_id, order_id, user_id, method, amount_cents, currency, status, transaction_ref, gateway_session_id, reviewed_at)
                VALUES (?, ?, ?, ?, 'Stripe', ?, ?, 'Verified', ?, ?, datetime('now'))
              `).run(generatePaymentNumber(), inv.id, inv.order_id, inv.user_id, inv.total_cents, inv.currency, String(session.payment_intent || session.id), session.id);
              payId = Number(pRes.lastInsertRowid);
            }

            db.prepare(`
              INSERT INTO transactions (transaction_code, payment_id, invoice_id, user_id, type, amount_cents, currency, status)
              VALUES (?, ?, ?, ?, 'charge', ?, ?, 'Completed')
            `).run(generateTransactionCode(), payId, inv.id, inv.user_id, inv.total_cents, inv.currency);

            if (inv.order_id) {
              const ord = db.prepare('SELECT status FROM orders WHERE id = ?').get(inv.order_id) as any;
              if (ord) {
                db.prepare("UPDATE orders SET status = 'Payment Confirmed', updated_at = datetime('now') WHERE id = ?").run(inv.order_id);
                db.prepare('INSERT INTO order_status_history (order_id, from_status, to_status, note) VALUES (?, ?, ?, ?)').run(
                  inv.order_id,
                  ord.status,
                  'Payment Confirmed',
                  `Stripe payment verified (${session.id})`
                );
              }
              const items = db.prepare('SELECT oi.*, pkg.duration_days FROM order_items oi LEFT JOIN packages pkg ON pkg.id = oi.package_id WHERE oi.order_id = ?').all(inv.order_id) as any[];
              for (const item of items) {
                const days = item.duration_days || 30;
                db.prepare(`
                  INSERT INTO services (service_code, user_id, order_id, product_id, package_id, product_name, package_name, status, started_at, expires_at, endpoint_info)
                  VALUES (?, ?, ?, ?, ?, ?, ?, 'Active', ?, ?, ?)
                `).run(
                  generateServiceCode(),
                  inv.user_id,
                  inv.order_id,
                  item.product_id,
                  item.package_id,
                  item.product_name,
                  item.package_name,
                  new Date().toISOString(),
                  new Date(Date.now() + days * 86400 * 1000).toISOString(),
                  'provisioned.helzerx.cyou'
                );
              }
            }
          })();

          createInAppNotification({
            userId: inv.user_id,
            title: `Stripe Payment Confirmed: ${inv.invoice_number}`,
            message: `${formatMoney(inv.total_cents, inv.currency)} paid via Stripe. Service provisioned.`,
            category: 'payments',
            linkTarget: 'services',
          });

          await sendTransactionalEmail({
            to: inv.email,
            subject: `Payment Confirmed — ${inv.invoice_number}`,
            templateName: 'stripe_payment_confirmed',
            heading: 'Stripe Payment Confirmed',
            preheader: `Invoice ${inv.invoice_number} is Paid.`,
            bodyHtml: `<p>Hello ${escapeHtml(inv.full_name)},</p><p>Your Stripe payment for invoice <strong>${escapeHtml(inv.invoice_number)}</strong> (${escapeHtml(formatMoney(inv.total_cents, inv.currency))}) is confirmed.</p>`,
          });

          await sendDiscordWebhook({
            event: 'payment.stripe_verified',
            title: `Stripe Payment Verified: ${inv.invoice_number}`,
            description: `${inv.customer_code} · ${formatMoney(inv.total_cents, inv.currency)}`,
            color: 0x16a34a,
          });
        }
      }
    }
    res.json({ received: true });
  } catch (err: any) {
    console.error('Stripe webhook error:', err.message);
    res.status(400).send(`Webhook Error: ${err.message}`);
  }
});

app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

const strictAuthLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many security attempts. Please wait 15 minutes before retrying.' },
});

const generalApiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Rate limit exceeded. Please slow down.' },
});

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', service: 'helzerx-customer-portal' });
});

app.use('/api', generalApiLimiter, verifyCsrfMiddleware);
app.use('/api/auth/login', strictAuthLimiter);
app.use('/api/auth/register', strictAuthLimiter);
app.use('/api/auth/forgot-password', strictAuthLimiter);
app.use('/api/auth/bootstrap-admin', strictAuthLimiter);
app.use('/api/auth', authRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api', catalogRoutes);
app.use('/api', customerRoutes);

// Multer & global error handling
app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  if (err && err.name === 'MulterError') {
    res.status(400).json({ error: `File upload error: ${err.message}` });
    return;
  }
  if (err) {
    res.status(400).json({ error: err.message || 'Request error' });
    return;
  }
});

async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    if (fs.existsSync(distDir)) {
      app.use(express.static(distDir));
      app.get('*', (_req, res) => {
        res.sendFile(path.join(distDir, 'index.html'));
      });
    }
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`HelzerX Customer Portal listening on http://0.0.0.0:${PORT}`);
  });
}

startServer();
