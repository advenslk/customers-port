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

