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
    const c1 = insertCat.run('Dedicated Cloud Hosting', 'cloud-infrastructure', 'High-speed private cloud environments engineered for business reliability.', 1).lastInsertRowid;
    const c2 = insertCat.run('Enterprise AI Solutions', 'enterprise-ai', 'Custom private intelligence assistants and automated business workflows.', 2).lastInsertRowid;
    const c3 = insertCat.run('Security & Protection', 'security-compliance', 'Continuous threat defense, account protection, and round-the-clock monitoring.', 3).lastInsertRowid;
    const c4 = insertCat.run('Custom Engineering', 'custom-engineering', 'Dedicated senior engineering teams for bespoke digital platforms.', 4).lastInsertRowid;

    const insertProd = db.prepare(
      'INSERT INTO products (category_id, name, slug, tagline, description, features_json, is_active, featured) VALUES (?, ?, ?, ?, ?, ?, 1, ?)'
    );
    const insertPkg = db.prepare(
      'INSERT INTO packages (product_id, name, billing_cycle, duration_days, price_cents, currency, features_json, is_active) VALUES (?, ?, ?, ?, ?, ?, ?, 1)'
    );

    // Product 1
    const p1 = insertProd.run(
      c1,
      'HelzerX Core Infrastructure',
      'helzerx-core-cluster',
      'Private dedicated cloud environments built for speed and uptime',
      'High-availability business hosting designed for mission-critical applications, global storefronts, and seamless daily backups.',
      JSON.stringify(['Guaranteed Uptime Protection', 'Always-On Traffic Protection', 'Private Encrypted Networking', 'Priority Engineering Support']),
      1
    ).lastInsertRowid;
    insertPkg.run(p1, 'Essential Cloud Tier', 'monthly', 30, 29000, 'USD', JSON.stringify(['Dedicated Capacity', 'Automated Daily Backups', 'Global Speed Routing', 'Priority Support']));
    insertPkg.run(p1, 'Business Growth Tier', 'monthly', 30, 58000, 'USD', JSON.stringify(['Expanded Team Capacity', 'Dedicated IP Included', 'Multi-Region Redundancy']));
    insertPkg.run(p1, 'Enterprise Annual Plan', 'annual', 365, 590000, 'USD', JSON.stringify(['Maximum Performance Tier', 'Dedicated Account Lead', 'Two Months Savings Included']));

    // Product 2
    const p2 = insertProd.run(
      c2,
      'HelzerX NeuralOps Suite',
      'helzerx-neuralops-engine',
      'Private company intelligence and workflow automation',
      'Deploy private intelligent assistants, instant company knowledge search, and automated document workflows tailored to your organization.',
      JSON.stringify(['Strict Private Data Ownership', 'Team Access Permissions', 'Complete Activity Records', 'Custom Business Integrations']),
      1
    ).lastInsertRowid;
    insertPkg.run(p2, 'Team Automation Suite', 'monthly', 30, 75000, 'USD', JSON.stringify(['Up to 25 Team Members', 'Private Knowledge Library', 'Five Automated Workflows']));
    insertPkg.run(p2, 'Enterprise Private Suite', 'quarterly', 90, 210000, 'USD', JSON.stringify(['Unlimited Team Seats', 'Dedicated Private Capacity', 'Tailored Company Setup', 'Solutions Specialist Assigned']));

    // Product 3
    const p3 = insertProd.run(
      c3,
      'HelzerX Sentinel Protection',
      'helzerx-sentinel-shield',
      'Continuous perimeter defense and security oversight',
      'Round-the-clock protection safeguarding your customer portals, payment checkouts, and online operations against unauthorized access.',
      JSON.stringify(['Real-Time Threat Blocking', 'Automated Fraud Prevention', 'Scheduled Security Reviews', 'Rapid Incident Response']),
      0
    ).lastInsertRowid;
    insertPkg.run(p3, 'Standard Protection', 'monthly', 30, 34000, 'USD', JSON.stringify(['Up to 5 Business Domains', 'Instant Security Alerts', 'Continuous Threat Shield']));
    insertPkg.run(p3, 'Fortress Enterprise', 'annual', 365, 360000, 'USD', JSON.stringify(['Unlimited Business Domains', 'Dedicated Security Analyst', 'Quarterly Deep Audits']));

    // Product 4
    const p4 = insertProd.run(
      c4,
      'Dedicated Engineering Partner',
      'dedicated-architecture-retainer',
      'Bespoke platform design, billing systems & software delivery',
      'Collaborate directly with senior HelzerX specialists to design custom portals, financial workflows, and scalable digital experiences.',
      JSON.stringify(['Senior Lead Assigned', 'Direct Team Communication', 'Weekly Progress Releases', 'Full Ownership Guaranteed']),
      0
    ).lastInsertRowid;
    insertPkg.run(p4, 'Focused Delivery Sprint', 'one_time', 60, 480000, 'USD', JSON.stringify(['40 Specialist Hours', 'Solution Blueprint', 'Launch & Handover']));
    insertPkg.run(p4, 'Quarterly Advisory Retainer', 'quarterly', 90, 1680000, 'USD', JSON.stringify(['160 Specialist Hours', 'Priority Scheduling', 'Quality & Security Assurance']));
  }

  // Bootstrap initial Super Admin strictly from environment variables if configured and no admin exists yet
  const adminCount = (db.prepare("SELECT COUNT(*) as cnt FROM users WHERE role IN ('admin', 'super_admin')").get() as { cnt: number }).cnt;
  const envAdminEmail = process.env.ADMIN_BOOTSTRAP_EMAIL?.trim().toLowerCase();
  const envAdminPass = process.env.ADMIN_BOOTSTRAP_PASSWORD;

  if (adminCount === 0 && envAdminEmail && envAdminPass && envAdminPass.length >= 12) {
    const adminHash = bcrypt.hashSync(envAdminPass, 12);
    const adminCode = generateCustomerCode();

    db.prepare(`
      INSERT INTO users (
        customer_code, email, password_hash, role, full_name, mobile, country, city,
        billing_address, postal_code, company_name, discord_username, email_verified, status
      ) VALUES (?, ?, ?, 'super_admin', ?, ?, ?, ?, ?, ?, ?, ?, 1, 'active')
    `).run(
      adminCode,
      envAdminEmail,
      adminHash,
      'HelzerX Super Admin',
      '',
      'United States',
      'San Francisco',
      '548 Market Street, Suite 74200',
      '94104',
      'HelzerX Technologies',
      ''
    );
  }
}

