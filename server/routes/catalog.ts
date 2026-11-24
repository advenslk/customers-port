import { Router } from 'express';
import { db } from '../db';

const router = Router();

router.get('/catalog', (_req, res) => {
  const categories = db.prepare('SELECT * FROM categories ORDER BY sort_order ASC, id ASC').all();
  const products = db.prepare('SELECT * FROM products WHERE is_active = 1 ORDER BY featured DESC, id ASC').all() as any[];
  const packages = db.prepare('SELECT * FROM packages WHERE is_active = 1 ORDER BY price_cents ASC').all() as any[];

  const mappedProducts = products.map((p) => ({
    ...p,
    features: JSON.parse(p.features_json || '[]'),
    packages: packages
      .filter((pkg) => pkg.product_id === p.id)
      .map((pkg) => ({
        ...pkg,
        features: JSON.parse(pkg.features_json || '[]'),
      })),
  }));

  const publicSettingsKeys = [
    'company_name',
    'company_email',
    'company_phone',
    'company_address',
    'company_website',
    'tax_rate_bps',
    'currency',
    'bank_name',
    'bank_account_name',
    'bank_account_number',
    'bank_routing_swift',
    'payment_instructions',
    'maintenance_banner',
  ];

  const rows = db
    .prepare(`SELECT key, value FROM settings WHERE key IN (${publicSettingsKeys.map(() => '?').join(',')})`)
    .all(...publicSettingsKeys) as Array<{ key: string; value: string }>;

  const settings: Record<string, string> = {};
  for (const r of rows) settings[r.key] = r.value;
  settings.stripe_enabled = process.env.STRIPE_SECRET_KEY ? 'true' : 'false';

  res.json({ categories, products: mappedProducts, settings });
});

router.post('/coupons/validate', (req, res) => {
  const code = String(req.body?.code || '').trim().toUpperCase();
  const subtotalCents = Number(req.body?.subtotal_cents || 0);

  if (!code) {
    res.status(400).json({ error: 'Promo code is required.' });
    return;
  }

  const coupon = db.prepare('SELECT * FROM coupons WHERE upper(code) = ? AND is_active = 1').get(code) as any;
  if (!coupon) {
    res.status(404).json({ error: 'Promo code not found or inactive.' });
    return;
  }

  if (coupon.expires_at && new Date(coupon.expires_at).getTime() < Date.now()) {
    res.status(400).json({ error: 'This promo code has expired.' });
    return;
  }

  if (coupon.max_uses !== null && coupon.used_count >= coupon.max_uses) {
    res.status(400).json({ error: 'This promo code has reached its maximum usage limit.' });
    return;
  }

  if (subtotalCents < coupon.min_purchase_cents) {
    res.status(400).json({
      error: `Minimum purchase of $${(coupon.min_purchase_cents / 100).toFixed(2)} required for ${coupon.code}.`,
    });
    return;
  }

  let discountCents = 0;
  if (coupon.discount_type === 'percentage') {
    discountCents = Math.round((subtotalCents * coupon.discount_value) / 100);
  } else {
    discountCents = Math.min(subtotalCents, coupon.discount_value);
  }

  res.json({
    valid: true,
    code: coupon.code,
    discount_type: coupon.discount_type,
    discount_value: coupon.discount_value,
    discount_cents: discountCents,
  });
});

export default router;
