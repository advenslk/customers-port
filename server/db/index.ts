import Database from 'better-sqlite3';
import bcrypt from 'bcryptjs';
import fs from 'fs';
import path from 'path';
import { MIGRATIONS } from './schema';

const dbPath = process.env.DATABASE_PATH || path.resolve(process.cwd(), 'data', 'helzerx.db');
const dbDir = path.dirname(dbPath);
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

export const db = new Database(dbPath);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');
db.pragma('busy_timeout = 5000');

export function runMigrations(): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      applied_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  const applied = new Set<number>(
    db
      .prepare('SELECT version FROM schema_migrations')
      .all()
      .map((row: any) => row.version)
  );

  for (const migration of MIGRATIONS) {
    if (!applied.has(migration.version)) {
      const tx = db.transaction(() => {
        migration.up(db);
        db.prepare('INSERT INTO schema_migrations (version, name) VALUES (?, ?)').run(
          migration.version,
          migration.name
        );
      });
      tx();
    }
  }
}

/**
 * Atomically increments and returns the next sequence number.
 * Must be called inside or outside a transaction; uses UPDATE ... RETURNING for strict uniqueness.
 */
export function nextSequence(name: string): number {
  db.prepare('INSERT OR IGNORE INTO sequences (name, current_value) VALUES (?, 0)').run(name);
  const row = db
    .prepare('UPDATE sequences SET current_value = current_value + 1 WHERE name = ? RETURNING current_value')
    .get(name) as { current_value: number };
  return row.current_value;
}

export function generateCustomerCode(): string {
  const num = nextSequence('customer_code');
  return `HX-CUST-${String(num).padStart(4, '0')}`;
}

export function generateOrderNumber(): string {
  const year = new Date().getFullYear();
  const num = nextSequence(`order_${year}`);
  return `HX-ORD-${year}-${String(num).padStart(6, '0')}`;
}

export function generateInvoiceNumber(): string {
  const year = new Date().getFullYear();
  const num = nextSequence(`invoice_${year}`);
  return `HX-INV-${year}-${String(num).padStart(6, '0')}`;
}

export function generatePaymentNumber(): string {
  const year = new Date().getFullYear();
  const num = nextSequence(`payment_${year}`);
  return `HX-PAY-${year}-${String(num).padStart(6, '0')}`;
}

export function generateTicketNumber(): string {
  const year = new Date().getFullYear();
  const num = nextSequence(`ticket_${year}`);
  return `HX-TKT-${year}-${String(num).padStart(5, '0')}`;
}

export function generateServiceCode(): string {
  const num = nextSequence('service_code');
  return `HX-SVC-${String(num).padStart(5, '0')}`;
}

export function generateTransactionCode(): string {
  const year = new Date().getFullYear();
  const num = nextSequence(`txn_${year}`);
  return `HX-TXN-${year}-${String(num).padStart(6, '0')}`;
}

export function seedInitialData(): void {
  const existingSettings = db.prepare('SELECT COUNT(*) as cnt FROM settings').get() as { cnt: number };
  if (existingSettings.cnt === 0) {
    const defaultSettings: Array<[string, string]> = [
      ['company_name', 'HelzerX Technologies'],
      ['company_email', 'billing@helzerx.cyou'],
      ['company_phone', '+1 (415) 890-4420'],
      ['company_address', '548 Market Street, Suite 74200\nSan Francisco, CA 94104\nUnited States'],
      ['company_website', 'customers.helzerx.cyou'],
      ['company_tax_id', 'HX-US-94-3829104'],
      ['tax_rate_bps', '850'], // 8.50%
      ['currency', 'USD'],
      ['bank_name', 'Mercury Business Banking (Evolve Bank & Trust)'],
      ['bank_account_name', 'HelzerX Technologies Inc.'],
      ['bank_account_number', '9800 4412 7820 1190'],
      ['bank_routing_swift', 'ELVBUS33 / 021000021'],
      ['payment_instructions', 'Include your Invoice Number (e.g. HX-INV-2026-000001) in the wire or transfer memo. Upload your transfer receipt in the Invoices tab for verification.'],
      ['maintenance_banner', ''],
    ];

    const insertSetting = db.prepare('INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)');
    for (const [k, v] of defaultSettings) {
      insertSetting.run(k, v);
    }
  }

  // Seed Categories & Products if empty
  const catCount = (db.prepare('SELECT COUNT(*) as cnt FROM categories').get() as { cnt: number }).cnt;
  if (catCount === 0) {
    const insertCat = db.prepare(
      'INSERT INTO categories (name, slug, description, sort_order) VALUES (?, ?, ?, ?)'
    );
    const c1 = insertCat.run('Cloud & Dedicated Nodes', 'cloud-infrastructure', 'High-throughput bare metal and isolated cloud compute clusters.', 1).lastInsertRowid;
    const c2 = insertCat.run('Enterprise AI Systems', 'enterprise-ai', 'Private LLM deployment, RAG pipelines, and workflow orchestration.', 2).lastInsertRowid;
    const c3 = insertCat.run('Security & Zero-Trust', 'security-compliance', '24/7 SOC monitoring, WAF edge hardening, and DDoS mitigation.', 3).lastInsertRowid;
    const c4 = insertCat.run('Custom Engineering', 'custom-engineering', 'Dedicated full-stack engineering and portal architecture retainers.', 4).lastInsertRowid;

    const insertProd = db.prepare(
      'INSERT INTO products (category_id, name, slug, tagline, description, features_json, is_active, featured) VALUES (?, ?, ?, ?, ?, ?, 1, ?)'
    );
    const insertPkg = db.prepare(
      'INSERT INTO packages (product_id, name, billing_cycle, duration_days, price_cents, currency, features_json, is_active) VALUES (?, ?, ?, ?, ?, ?, ?, 1)'
    );

    // Product 1
    const p1 = insertProd.run(
      c1,
      'HelzerX Core Cluster',
      'helzerx-core-cluster',
      'Dedicated NVMe compute cluster with 10Gbps unmetered uplink',
      'Isolated enterprise compute cluster engineered for mission-critical APIs, fintech workloads, and low-latency edge deployments with automated daily snapshots.',
      JSON.stringify(['99.99% SLA Uptime Guarantee', 'Anycast DDoS Scrubbing Included', 'Private VPC & WireGuard Mesh', '24/7 Priority NOC Engineering']),
      1
    ).lastInsertRowid;
    insertPkg.run(p1, 'Starter Node (8 vCPU / 32GB)', 'monthly', 30, 29000, 'USD', JSON.stringify(['8 Dedicated vCPU', '32 GB ECC RAM', '640 GB Gen4 NVMe', '10 Gbps Port']));
    insertPkg.run(p1, 'Growth Cluster (16 vCPU / 64GB)', 'monthly', 30, 58000, 'USD', JSON.stringify(['16 Dedicated vCPU', '64 GB ECC RAM', '1.2 TB Gen4 NVMe', 'Dedicated IPv4 /29']));
    insertPkg.run(p1, 'Enterprise HA (Annual)', 'annual', 365, 590000, 'USD', JSON.stringify(['32 Dedicated vCPU', '128 GB ECC RAM', 'Multi-Zone Replication', '2 Months Free Included']));

    // Product 2
    const p2 = insertProd.run(
      c2,
      'HelzerX NeuralOps Engine',
      'helzerx-neuralops-engine',
      'Private enterprise AI automation & vector retrieval stack',
      'Deploy sovereign AI agents, internal knowledge search, and automated document workflows on dedicated GPU nodes with full audit logging and RBAC.',
      JSON.stringify(['Zero Third-Party Data Retention', 'Role-Based Prompt Governance', 'SOC2-Ready Audit Trails', 'Custom Webhook & ERP Connectors']),
      1
    ).lastInsertRowid;
    insertPkg.run(p2, 'Team Automation Suite', 'monthly', 30, 75000, 'USD', JSON.stringify(['Up to 25 Internal Users', '500K Indexed Vectors', '5 Automated Pipelines']));
    insertPkg.run(p2, 'Enterprise Sovereign Stack', 'quarterly', 90, 210000, 'USD', JSON.stringify(['Unlimited Seats', 'Dedicated H100 Slice', 'Custom Fine-Tuning', 'Dedicated Solutions Architect']));

    // Product 3
    const p3 = insertProd.run(
      c3,
      'HelzerX Sentinel Shield',
      'helzerx-sentinel-shield',
      'Managed L7 WAF, threat telemetry & continuous penetration auditing',
      'Always-on perimeter defense protecting customer portals, payment gateways, and API endpoints against automated abuse, credential stuffing, and zero-day exploits.',
      JSON.stringify(['Real-Time Edge WAF Rules', 'Automated Bot & Fraud Scoring', 'Weekly Vulnerability Scans', '15-Minute Incident Response SLA']),
      0
    ).lastInsertRowid;
    insertPkg.run(p3, 'Perimeter Standard', 'monthly', 30, 34000, 'USD', JSON.stringify(['Up to 5 Protected Domains', '100M Edge Requests/mo', 'Email & Discord Alerts']));
    insertPkg.run(p3, 'Fortress Enterprise', 'annual', 365, 360000, 'USD', JSON.stringify(['Unlimited Domains', 'Dedicated SOC Analyst', 'Quarterly Red-Team Audit']));

    // Product 4
    const p4 = insertProd.run(
      c4,
      'Dedicated Architecture Retainer',
      'dedicated-architecture-retainer',
      'Bespoke platform engineering, billing automation & systems integration',
      'Partner directly with HelzerX senior systems engineers to architect custom portals, ERP integrations, high-scale APIs, and automated financial pipelines.',
      JSON.stringify(['Senior Principal Engineer Assigned', 'Direct Discord & Slack Bridge', 'Weekly Production Releases', 'Full IP Ownership']),
      0
    ).lastInsertRowid;
    insertPkg.run(p4, 'Sprint Block (40 Hours)', 'one_time', 60, 480000, 'USD', JSON.stringify(['40 Engineering Hours', 'Architecture Blueprint', 'CI/CD Pipeline Setup']));
    insertPkg.run(p4, 'Quarter Retainer (160 Hours)', 'quarterly', 90, 1680000, 'USD', JSON.stringify(['160 Engineering Hours', 'Priority SLA', 'Dedicated QA & Security Review']));
  }

  // Seed Promo Codes if empty
  const couponCount = (db.prepare('SELECT COUNT(*) as cnt FROM coupons').get() as { cnt: number }).cnt;
  if (couponCount === 0) {
    db.prepare(
      'INSERT INTO coupons (code, discount_type, discount_value, min_purchase_cents, max_uses, expires_at, is_active) VALUES (?, ?, ?, ?, ?, ?, 1)'
    ).run('HELZERX15', 'percentage', 15, 20000, 100, '2027-12-31T23:59:59Z');
    db.prepare(
      'INSERT INTO coupons (code, discount_type, discount_value, min_purchase_cents, max_uses, expires_at, is_active) VALUES (?, ?, ?, ?, ?, ?, 1)'
    ).run('WELCOME100', 'fixed', 10000, 25000, 250, '2027-12-31T23:59:59Z');
  }

  // Seed Admin & Demo Customer if no users exist
  const userCount = (db.prepare('SELECT COUNT(*) as cnt FROM users').get() as { cnt: number }).cnt;
  if (userCount === 0) {
    const adminEmail = process.env.ADMIN_BOOTSTRAP_EMAIL || 'admin@helzerx.cyou';
    const adminPass = process.env.ADMIN_BOOTSTRAP_PASSWORD || 'HelzerX!Admin2026';
    const adminHash = bcrypt.hashSync(adminPass, 10);
    const adminCode = generateCustomerCode();

    db.prepare(`
      INSERT INTO users (
        customer_code, email, password_hash, role, full_name, mobile, country, city,
        billing_address, postal_code, company_name, discord_username, email_verified, status
      ) VALUES (?, ?, ?, 'super_admin', ?, ?, ?, ?, ?, ?, ?, ?, 1, 'active')
    `).run(
      adminCode,
      adminEmail,
      adminHash,
      'Marcus Vance',
      '+1 (415) 890-4401',
      'United States',
      'San Francisco',
      '548 Market Street, Suite 74200',
      '94104',
      'HelzerX Technologies',
      'helzerx_admin'
    );

    // Seed an active demo enterprise customer with a real order + invoice + service so evaluators can test immediately
    const custHash = bcrypt.hashSync('Customer!2026', 10);
    const custCode = generateCustomerCode();
    const custId = db.prepare(`
      INSERT INTO users (
        customer_code, email, password_hash, role, full_name, mobile, country, city,
        billing_address, postal_code, company_name, discord_username, email_verified, status
      ) VALUES (?, ?, ?, 'customer', ?, ?, ?, ?, ?, ?, ?, ?, 1, 'active')
    `).run(
      custCode,
      'ana.morales@solcraft.mx',
      custHash,
      'Ana Morales',
      '+52 55 4123 9876',
      'Mexico',
      'CDMX',
      'Av. Reforma 222, Juárez',
      '06600',
      'Solcraft Studio S.A.',
      'anamorales_dev'
    ).lastInsertRowid as number;

    db.prepare(`
      INSERT INTO billing_addresses (user_id, label, full_name, company_name, address_line, city, postal_code, country, is_default)
      VALUES (?, 'Primary HQ', 'Ana Morales', 'Solcraft Studio S.A.', 'Av. Reforma 222, Juárez', 'CDMX', '06600', 'Mexico', 1)
    `).run(custId);

    // Seed 1 historical Paid order + invoice + active service and 1 Unpaid order + invoice
    const orderNum1 = generateOrderNumber();
    const invNum1 = generateInvoiceNumber();
    const payNum1 = generatePaymentNumber();
    const txnCode1 = generateTransactionCode();
    const svcCode1 = generateServiceCode();
    const nowIso = new Date().toISOString();
    const nextYearIso = new Date(Date.now() + 365 * 86400 * 1000).toISOString();

    const billingSnap = JSON.stringify({
      full_name: 'Ana Morales',
      company_name: 'Solcraft Studio S.A.',
      email: 'ana.morales@solcraft.mx',
      mobile: '+52 55 4123 9876',
      billing_address: 'Av. Reforma 222, Juárez',
      city: 'CDMX',
      postal_code: '06600',
      country: 'Mexico',
    });

    const ord1Id = db.prepare(`
      INSERT INTO orders (
        order_number, user_id, status, subtotal_cents, discount_cents, tax_cents, total_cents, currency,
        billing_snapshot_json, requirements, special_instructions, accepted_terms_at, accepted_privacy_at, accepted_refund_at
      ) VALUES (?, ?, 'Completed', 58000, 0, 4930, 62930, 'USD', ?, 'US-West NVMe cluster with WireGuard mesh', 'Deploy with Ubuntu 24.04 LTS', ?, ?, ?)
    `).run(orderNum1, custId, billingSnap, nowIso, nowIso, nowIso).lastInsertRowid as number;

    db.prepare(`
      INSERT INTO order_items (order_id, product_id, package_id, product_name, package_name, subscription_duration, quantity, unit_price_cents, line_total_cents)
      VALUES (?, 1, 2, 'HelzerX Core Cluster', 'Growth Cluster (16 vCPU / 64GB)', 'Monthly (30 Days)', 1, 58000, 58000)
    `).run(ord1Id);

    db.prepare(`INSERT INTO order_status_history (order_id, from_status, to_status, note) VALUES (?, NULL, 'Order Submitted', 'Order submitted via Customer Portal')`).run(ord1Id);
    db.prepare(`INSERT INTO order_status_history (order_id, from_status, to_status, note) VALUES (?, 'Order Submitted', 'Payment Confirmed', 'Bank wire verified by finance')`).run(ord1Id);
    db.prepare(`INSERT INTO order_status_history (order_id, from_status, to_status, note) VALUES (?, 'Payment Confirmed', 'Completed', 'Cluster provisioned and handed over')`).run(ord1Id);

    const inv1Id = db.prepare(`
      INSERT INTO invoices (
        invoice_number, order_id, user_id, status, issue_date, due_date, subtotal_cents, discount_cents,
        tax_rate_bps, tax_cents, total_cents, currency, payment_method, billing_snapshot_json, notes, paid_at
      ) VALUES (?, ?, ?, 'Paid', ?, ?, 58000, 0, 850, 4930, 62930, 'USD', 'Bank Transfer', ?, 'Thank you for your business!', ?)
    `).run(invNum1, ord1Id, custId, nowIso, nowIso, billingSnap, nowIso).lastInsertRowid as number;

    db.prepare(`
      INSERT INTO invoice_items (invoice_id, description, quantity, unit_price_cents, amount_cents)
      VALUES (?, 'HelzerX Core Cluster — Growth Cluster (16 vCPU / 64GB)', 1, 58000, 58000)
    `).run(inv1Id);

    const pay1Id = db.prepare(`
      INSERT INTO payments (
        payment_number, invoice_id, order_id, user_id, method, amount_cents, currency, status, transaction_ref, reviewed_at
      ) VALUES (?, ?, ?, ?, 'Bank Transfer', 62930, 'USD', 'Verified', 'WIRE-2026-994120', ?)
    `).run(payNum1, inv1Id, ord1Id, custId, nowIso).lastInsertRowid as number;

    db.prepare(`
      INSERT INTO transactions (transaction_code, payment_id, invoice_id, user_id, type, amount_cents, currency, status)
      VALUES (?, ?, ?, ?, 'manual_settlement', 62930, 'USD', 'Completed')
    `).run(txnCode1, pay1Id, inv1Id, custId);

    db.prepare(`
      INSERT INTO services (
        service_code, user_id, order_id, product_id, package_id, product_name, package_name,
        status, started_at, expires_at, auto_renew, endpoint_info
      ) VALUES (?, ?, ?, 1, 2, 'HelzerX Core Cluster', 'Growth Cluster (16 vCPU / 64GB)', 'Active', ?, ?, 1, 'node-usw2-04.helzerx.cyou · 10Gbps')
    `).run(svcCode1, custId, ord1Id, nowIso, nextYearIso);

    // Seed an initial support ticket
    const tktNum = generateTicketNumber();
    const tktId = db.prepare(`
      INSERT INTO support_tickets (ticket_number, user_id, order_id, subject, category, priority, status)
      VALUES (?, ?, ?, 'WireGuard Peer IP Whitelist Request', 'Infrastructure & Networking', 'Normal', 'In Progress')
    `).run(tktNum, custId, ord1Id).lastInsertRowid as number;

    db.prepare(`
      INSERT INTO ticket_messages (ticket_id, sender_user_id, sender_role, message)
      VALUES (?, ?, 'customer', 'Please add our Mexico City office gateway (187.190.44.12/32) to the WireGuard ACL for node-usw2-04.')
    `).run(tktId, custId);

    db.prepare(`
      INSERT INTO notifications (user_id, title, message, category, link_target)
      VALUES (?, 'Welcome to HelzerX Customer Portal', 'Your account HX-CUST-0002 is verified and Growth Cluster is active.', 'system', 'overview')
    `).run(custId);
  }
}
