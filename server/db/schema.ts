import Database from 'better-sqlite3';

export interface Migration {
  version: number;
  name: string;
  up: (db: Database.Database) => void;
}

export const MIGRATIONS: Migration[] = [
  {
    version: 1,
    name: 'initial_helzerx_enterprise_schema',
    up: (db: Database.Database) => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS users (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          customer_code TEXT NOT NULL UNIQUE,
          email TEXT NOT NULL UNIQUE,
          password_hash TEXT NOT NULL,
          role TEXT NOT NULL DEFAULT 'customer' CHECK (role IN ('customer', 'admin', 'super_admin')),
          full_name TEXT NOT NULL,
          mobile TEXT NOT NULL DEFAULT '',
          country TEXT NOT NULL DEFAULT '',
          city TEXT NOT NULL DEFAULT '',
          billing_address TEXT NOT NULL DEFAULT '',
          postal_code TEXT NOT NULL DEFAULT '',
          company_name TEXT NOT NULL DEFAULT '',
          discord_username TEXT NOT NULL DEFAULT '',
          email_verified INTEGER NOT NULL DEFAULT 0,
          verification_token TEXT,
          two_factor_enabled INTEGER NOT NULL DEFAULT 0,
          two_factor_secret TEXT,
          status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended', 'deletion_requested')),
          notify_email INTEGER NOT NULL DEFAULT 1,
          notify_discord INTEGER NOT NULL DEFAULT 1,
          internal_notes TEXT NOT NULL DEFAULT '',
          created_at TEXT NOT NULL DEFAULT (datetime('now')),
          updated_at TEXT NOT NULL DEFAULT (datetime('now'))
        );

        CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
        CREATE INDEX IF NOT EXISTS idx_users_customer_code ON users(customer_code);
        CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);

        CREATE TABLE IF NOT EXISTS billing_addresses (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          label TEXT NOT NULL,
          full_name TEXT NOT NULL,
          company_name TEXT NOT NULL DEFAULT '',
          address_line TEXT NOT NULL,
          city TEXT NOT NULL,
          postal_code TEXT NOT NULL,
          country TEXT NOT NULL,
          is_default INTEGER NOT NULL DEFAULT 0,
          created_at TEXT NOT NULL DEFAULT (datetime('now'))
        );

        CREATE INDEX IF NOT EXISTS idx_billing_addresses_user ON billing_addresses(user_id);

        CREATE TABLE IF NOT EXISTS sessions (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          token_jti TEXT NOT NULL UNIQUE,
          ip_address TEXT NOT NULL DEFAULT '',
          user_agent TEXT NOT NULL DEFAULT '',
          expires_at TEXT NOT NULL,
          revoked_at TEXT,
          created_at TEXT NOT NULL DEFAULT (datetime('now'))
        );

        CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
        CREATE INDEX IF NOT EXISTS idx_sessions_jti ON sessions(token_jti);

        CREATE TABLE IF NOT EXISTS login_history (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
          email TEXT NOT NULL,
          ip_address TEXT NOT NULL DEFAULT '',
          user_agent TEXT NOT NULL DEFAULT '',
          success INTEGER NOT NULL,
          failure_reason TEXT NOT NULL DEFAULT '',
          created_at TEXT NOT NULL DEFAULT (datetime('now'))
        );

        CREATE INDEX IF NOT EXISTS idx_login_history_user ON login_history(user_id);

        CREATE TABLE IF NOT EXISTS password_resets (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          token_hash TEXT NOT NULL UNIQUE,
          expires_at TEXT NOT NULL,
          used_at TEXT,
          created_at TEXT NOT NULL DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS sequences (
          name TEXT PRIMARY KEY,
          current_value INTEGER NOT NULL DEFAULT 0
        );

        CREATE TABLE IF NOT EXISTS categories (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL UNIQUE,
          slug TEXT NOT NULL UNIQUE,
          description TEXT NOT NULL DEFAULT '',
          sort_order INTEGER NOT NULL DEFAULT 0,
          created_at TEXT NOT NULL DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS products (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          category_id INTEGER NOT NULL REFERENCES categories(id) ON DELETE RESTRICT,
          name TEXT NOT NULL,
          slug TEXT NOT NULL UNIQUE,
          tagline TEXT NOT NULL DEFAULT '',
          description TEXT NOT NULL DEFAULT '',
          features_json TEXT NOT NULL DEFAULT '[]',
          is_active INTEGER NOT NULL DEFAULT 1,
          featured INTEGER NOT NULL DEFAULT 0,
          created_at TEXT NOT NULL DEFAULT (datetime('now')),
          updated_at TEXT NOT NULL DEFAULT (datetime('now'))
        );

        CREATE INDEX IF NOT EXISTS idx_products_category ON products(category_id);

        CREATE TABLE IF NOT EXISTS packages (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
          name TEXT NOT NULL,
          billing_cycle TEXT NOT NULL CHECK (billing_cycle IN ('monthly', 'quarterly', 'annual', 'one_time')),
          duration_days INTEGER NOT NULL DEFAULT 30,
          price_cents INTEGER NOT NULL CHECK (price_cents >= 0),
          currency TEXT NOT NULL DEFAULT 'USD',
          features_json TEXT NOT NULL DEFAULT '[]',
          is_active INTEGER NOT NULL DEFAULT 1,
          created_at TEXT NOT NULL DEFAULT (datetime('now'))
        );

        CREATE INDEX IF NOT EXISTS idx_packages_product ON packages(product_id);

        CREATE TABLE IF NOT EXISTS coupons (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          code TEXT NOT NULL UNIQUE,
          discount_type TEXT NOT NULL CHECK (discount_type IN ('percentage', 'fixed')),
          discount_value INTEGER NOT NULL CHECK (discount_value > 0),
          min_purchase_cents INTEGER NOT NULL DEFAULT 0,
          max_uses INTEGER,
          used_count INTEGER NOT NULL DEFAULT 0,
          expires_at TEXT,
          is_active INTEGER NOT NULL DEFAULT 1,
          created_at TEXT NOT NULL DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS orders (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          order_number TEXT NOT NULL UNIQUE,
          user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
          status TEXT NOT NULL DEFAULT 'Order Submitted' CHECK (status IN (
            'Order Submitted',
            'Awaiting Payment',
            'Payment Under Review',
            'Payment Confirmed',
            'Processing',
            'In Progress',
            'Completed',
            'Cancelled',
            'Refunded'
          )),
          subtotal_cents INTEGER NOT NULL,
          discount_cents INTEGER NOT NULL DEFAULT 0,
          tax_cents INTEGER NOT NULL DEFAULT 0,
          total_cents INTEGER NOT NULL,
          currency TEXT NOT NULL DEFAULT 'USD',
          promo_code TEXT,
          billing_snapshot_json TEXT NOT NULL,
          requirements TEXT NOT NULL DEFAULT '',
          special_instructions TEXT NOT NULL DEFAULT '',
          assigned_admin_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
          internal_notes TEXT NOT NULL DEFAULT '',
          accepted_terms_at TEXT NOT NULL,
          accepted_privacy_at TEXT NOT NULL,
          accepted_refund_at TEXT NOT NULL,
          created_at TEXT NOT NULL DEFAULT (datetime('now')),
          updated_at TEXT NOT NULL DEFAULT (datetime('now'))
        );

        CREATE INDEX IF NOT EXISTS idx_orders_user ON orders(user_id);
        CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
        CREATE INDEX IF NOT EXISTS idx_orders_number ON orders(order_number);

        CREATE TABLE IF NOT EXISTS order_items (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
          product_id INTEGER REFERENCES products(id) ON DELETE SET NULL,
          package_id INTEGER REFERENCES packages(id) ON DELETE SET NULL,
          product_name TEXT NOT NULL,
          package_name TEXT NOT NULL,
          subscription_duration TEXT NOT NULL,
          quantity INTEGER NOT NULL CHECK (quantity > 0),
          unit_price_cents INTEGER NOT NULL,
          line_total_cents INTEGER NOT NULL
        );

        CREATE INDEX IF NOT EXISTS idx_order_items_order ON order_items(order_id);

        CREATE TABLE IF NOT EXISTS order_status_history (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
          from_status TEXT,
          to_status TEXT NOT NULL,
          note TEXT NOT NULL DEFAULT '',
          actor_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
          created_at TEXT NOT NULL DEFAULT (datetime('now'))
        );

        CREATE INDEX IF NOT EXISTS idx_order_history_order ON order_status_history(order_id);

        CREATE TABLE IF NOT EXISTS invoices (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          invoice_number TEXT NOT NULL UNIQUE,
          order_id INTEGER REFERENCES orders(id) ON DELETE SET NULL,
          user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
          status TEXT NOT NULL DEFAULT 'Unpaid' CHECK (status IN (
            'Draft',
            'Unpaid',
            'Pending Verification',
            'Paid',
            'Overdue',
            'Cancelled',
            'Refunded'
          )),
          issue_date TEXT NOT NULL,
          due_date TEXT NOT NULL,
          subtotal_cents INTEGER NOT NULL,
          discount_cents INTEGER NOT NULL DEFAULT 0,
          tax_rate_bps INTEGER NOT NULL DEFAULT 0,
          tax_cents INTEGER NOT NULL DEFAULT 0,
          total_cents INTEGER NOT NULL,
          currency TEXT NOT NULL DEFAULT 'USD',
          payment_method TEXT NOT NULL DEFAULT 'Bank Transfer',
          billing_snapshot_json TEXT NOT NULL,
          notes TEXT NOT NULL DEFAULT 'Thank you for choosing HelzerX Technologies.',
          paid_at TEXT,
          created_at TEXT NOT NULL DEFAULT (datetime('now')),
          updated_at TEXT NOT NULL DEFAULT (datetime('now'))
        );

        CREATE INDEX IF NOT EXISTS idx_invoices_user ON invoices(user_id);
        CREATE INDEX IF NOT EXISTS idx_invoices_order ON invoices(order_id);
        CREATE INDEX IF NOT EXISTS idx_invoices_number ON invoices(invoice_number);
        CREATE INDEX IF NOT EXISTS idx_invoices_status ON invoices(status);

        CREATE TABLE IF NOT EXISTS invoice_items (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          invoice_id INTEGER NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
          description TEXT NOT NULL,
          quantity INTEGER NOT NULL CHECK (quantity > 0),
          unit_price_cents INTEGER NOT NULL,
          amount_cents INTEGER NOT NULL
        );

        CREATE INDEX IF NOT EXISTS idx_invoice_items_invoice ON invoice_items(invoice_id);

        CREATE TABLE IF NOT EXISTS payments (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          payment_number TEXT NOT NULL UNIQUE,
          invoice_id INTEGER NOT NULL REFERENCES invoices(id) ON DELETE RESTRICT,
          order_id INTEGER REFERENCES orders(id) ON DELETE SET NULL,
          user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
          method TEXT NOT NULL CHECK (method IN ('Stripe', 'Bank Transfer', 'Manual Payment', 'Cryptocurrency')),
          amount_cents INTEGER NOT NULL CHECK (amount_cents > 0),
          currency TEXT NOT NULL DEFAULT 'USD',
          status TEXT NOT NULL DEFAULT 'Pending' CHECK (status IN ('Pending', 'Under Review', 'Verified', 'Rejected', 'Refunded')),
          transaction_ref TEXT NOT NULL DEFAULT '',
          gateway_session_id TEXT NOT NULL DEFAULT '',
          reviewed_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
          review_note TEXT NOT NULL DEFAULT '',
          reviewed_at TEXT,
          created_at TEXT NOT NULL DEFAULT (datetime('now')),
          updated_at TEXT NOT NULL DEFAULT (datetime('now'))
        );

        CREATE INDEX IF NOT EXISTS idx_payments_invoice ON payments(invoice_id);
        CREATE INDEX IF NOT EXISTS idx_payments_user ON payments(user_id);
        CREATE INDEX IF NOT EXISTS idx_payments_status ON payments(status);

        CREATE TABLE IF NOT EXISTS payment_receipts (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          payment_id INTEGER NOT NULL REFERENCES payments(id) ON DELETE CASCADE,
          original_filename TEXT NOT NULL,
          stored_filename TEXT NOT NULL,
          mime_type TEXT NOT NULL,
          file_size INTEGER NOT NULL,
          uploaded_at TEXT NOT NULL DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS transactions (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          transaction_code TEXT NOT NULL UNIQUE,
          payment_id INTEGER REFERENCES payments(id) ON DELETE SET NULL,
          invoice_id INTEGER NOT NULL REFERENCES invoices(id) ON DELETE RESTRICT,
          user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
          type TEXT NOT NULL CHECK (type IN ('charge', 'manual_settlement', 'refund')),
          amount_cents INTEGER NOT NULL,
          currency TEXT NOT NULL DEFAULT 'USD',
          status TEXT NOT NULL,
          created_at TEXT NOT NULL DEFAULT (datetime('now'))
        );

        CREATE INDEX IF NOT EXISTS idx_transactions_user ON transactions(user_id);

        CREATE TABLE IF NOT EXISTS services (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          service_code TEXT NOT NULL UNIQUE,
          user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
          order_id INTEGER REFERENCES orders(id) ON DELETE SET NULL,
          product_id INTEGER REFERENCES products(id) ON DELETE SET NULL,
          package_id INTEGER REFERENCES packages(id) ON DELETE SET NULL,
          product_name TEXT NOT NULL,
          package_name TEXT NOT NULL,
          status TEXT NOT NULL DEFAULT 'Provisioning' CHECK (status IN ('Provisioning', 'Active', 'Expiring Soon', 'Expired', 'Suspended', 'Cancelled')),
          started_at TEXT,
          expires_at TEXT,
          auto_renew INTEGER NOT NULL DEFAULT 0,
          endpoint_info TEXT NOT NULL DEFAULT '',
          created_at TEXT NOT NULL DEFAULT (datetime('now')),
          updated_at TEXT NOT NULL DEFAULT (datetime('now'))
        );

        CREATE INDEX IF NOT EXISTS idx_services_user ON services(user_id);

        CREATE TABLE IF NOT EXISTS support_tickets (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          ticket_number TEXT NOT NULL UNIQUE,
          user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          order_id INTEGER REFERENCES orders(id) ON DELETE SET NULL,
          subject TEXT NOT NULL,
          category TEXT NOT NULL,
          priority TEXT NOT NULL DEFAULT 'Normal' CHECK (priority IN ('Low', 'Normal', 'High', 'Urgent')),
          status TEXT NOT NULL DEFAULT 'Open' CHECK (status IN ('Open', 'In Progress', 'Waiting for Customer', 'Resolved', 'Closed')),
          assigned_admin_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
          created_at TEXT NOT NULL DEFAULT (datetime('now')),
          updated_at TEXT NOT NULL DEFAULT (datetime('now'))
        );

        CREATE INDEX IF NOT EXISTS idx_tickets_user ON support_tickets(user_id);
        CREATE INDEX IF NOT EXISTS idx_tickets_status ON support_tickets(status);

        CREATE TABLE IF NOT EXISTS ticket_messages (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          ticket_id INTEGER NOT NULL REFERENCES support_tickets(id) ON DELETE CASCADE,
          sender_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          sender_role TEXT NOT NULL,
          message TEXT NOT NULL,
          attachment_filename TEXT,
          attachment_original_name TEXT,
          created_at TEXT NOT NULL DEFAULT (datetime('now'))
        );

        CREATE INDEX IF NOT EXISTS idx_ticket_messages_ticket ON ticket_messages(ticket_id);

        CREATE TABLE IF NOT EXISTS refund_requests (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
          invoice_id INTEGER REFERENCES invoices(id) ON DELETE SET NULL,
          user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          reason TEXT NOT NULL,
          amount_cents INTEGER NOT NULL,
          status TEXT NOT NULL DEFAULT 'Requested' CHECK (status IN ('Requested', 'Approved', 'Rejected', 'Processed')),
          admin_note TEXT NOT NULL DEFAULT '',
          reviewed_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
          created_at TEXT NOT NULL DEFAULT (datetime('now')),
          updated_at TEXT NOT NULL DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS notifications (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          title TEXT NOT NULL,
          message TEXT NOT NULL,
          category TEXT NOT NULL DEFAULT 'system',
          link_target TEXT NOT NULL DEFAULT '',
          is_read INTEGER NOT NULL DEFAULT 0,
          created_at TEXT NOT NULL DEFAULT (datetime('now'))
        );

        CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id);

        CREATE TABLE IF NOT EXISTS activity_logs (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
          actor_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
          action TEXT NOT NULL,
          entity_type TEXT NOT NULL,
          entity_id TEXT NOT NULL DEFAULT '',
          details_json TEXT NOT NULL DEFAULT '{}',
          ip_address TEXT NOT NULL DEFAULT '',
          created_at TEXT NOT NULL DEFAULT (datetime('now'))
        );

        CREATE INDEX IF NOT EXISTS idx_activity_logs_user ON activity_logs(user_id);

        CREATE TABLE IF NOT EXISTS email_logs (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          recipient_email TEXT NOT NULL,
          subject TEXT NOT NULL,
          template_name TEXT NOT NULL,
          status TEXT NOT NULL,
          provider_id TEXT NOT NULL DEFAULT '',
          error_message TEXT NOT NULL DEFAULT '',
          created_at TEXT NOT NULL DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS feedback (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          order_id INTEGER REFERENCES orders(id) ON DELETE SET NULL,
          rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
          comment TEXT NOT NULL DEFAULT '',
          created_at TEXT NOT NULL DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS settings (
          key TEXT PRIMARY KEY,
          value TEXT NOT NULL,
          updated_at TEXT NOT NULL DEFAULT (datetime('now'))
        );
      `);
    },
  },
  {
    version: 2,
    name: 'high_security_hardening_and_demo_purge',
    up: (db: Database.Database) => {
      const cols = db.prepare('PRAGMA table_info(users)').all() as Array<{ name: string }>;
      const colSet = new Set(cols.map((c) => c.name));
      if (!colSet.has('failed_login_attempts')) {
        db.exec('ALTER TABLE users ADD COLUMN failed_login_attempts INTEGER NOT NULL DEFAULT 0');
      }
      if (!colSet.has('locked_until')) {
        db.exec('ALTER TABLE users ADD COLUMN locked_until TEXT');
      }
      if (!colSet.has('verification_expires_at')) {
        db.exec('ALTER TABLE users ADD COLUMN verification_expires_at TEXT');
      }
      if (!colSet.has('two_factor_recovery_codes_json')) {
        db.exec("ALTER TABLE users ADD COLUMN two_factor_recovery_codes_json TEXT NOT NULL DEFAULT '[]'");
      }
      if (!colSet.has('last_login_ip')) {
        db.exec("ALTER TABLE users ADD COLUMN last_login_ip TEXT NOT NULL DEFAULT ''");
      }
      if (!colSet.has('last_login_at')) {
        db.exec('ALTER TABLE users ADD COLUMN last_login_at TEXT');
      }

      const sessCols = db.prepare('PRAGMA table_info(sessions)').all() as Array<{ name: string }>;
      const sessSet = new Set(sessCols.map((c) => c.name));
      if (!sessSet.has('session_fingerprint')) {
        db.exec("ALTER TABLE sessions ADD COLUMN session_fingerprint TEXT NOT NULL DEFAULT ''");
      }

      // Remove any previously seeded demo customer/admin/test records & associated artifacts cleanly
      const targetUsers = db
        .prepare("SELECT id FROM users WHERE lower(email) IN ('ana.morales@solcraft.mx', 'admin@helzerx.cyou') OR lower(email) LIKE 'elena.%@rostova.io'")
        .all() as Array<{ id: number }>;

      for (const u of targetUsers) {
        db.prepare('UPDATE orders SET assigned_admin_id = NULL WHERE assigned_admin_id = ?').run(u.id);
        db.prepare('UPDATE payments SET reviewed_by = NULL WHERE reviewed_by = ?').run(u.id);
        db.prepare('UPDATE refund_requests SET reviewed_by = NULL WHERE reviewed_by = ?').run(u.id);
        db.prepare('UPDATE support_tickets SET assigned_admin_id = NULL WHERE assigned_admin_id = ?').run(u.id);
        db.prepare('UPDATE order_status_history SET actor_user_id = NULL WHERE actor_user_id = ?').run(u.id);
        db.prepare('UPDATE activity_logs SET actor_user_id = NULL WHERE actor_user_id = ?').run(u.id);
        db.prepare('UPDATE activity_logs SET user_id = NULL WHERE user_id = ?').run(u.id);

        db.prepare('DELETE FROM feedback WHERE user_id = ?').run(u.id);
        db.prepare('DELETE FROM refund_requests WHERE user_id = ?').run(u.id);
        db.prepare('DELETE FROM transactions WHERE user_id = ?').run(u.id);
        db.prepare('DELETE FROM payment_receipts WHERE payment_id IN (SELECT id FROM payments WHERE user_id = ?)').run(u.id);
        db.prepare('DELETE FROM payments WHERE user_id = ?').run(u.id);
        db.prepare('DELETE FROM services WHERE user_id = ?').run(u.id);
        db.prepare('DELETE FROM invoice_items WHERE invoice_id IN (SELECT id FROM invoices WHERE user_id = ?)').run(u.id);
        db.prepare('DELETE FROM invoices WHERE user_id = ?').run(u.id);
        db.prepare('DELETE FROM order_status_history WHERE order_id IN (SELECT id FROM orders WHERE user_id = ?)').run(u.id);
        db.prepare('DELETE FROM order_items WHERE order_id IN (SELECT id FROM orders WHERE user_id = ?)').run(u.id);
        db.prepare('DELETE FROM orders WHERE user_id = ?').run(u.id);
        db.prepare('DELETE FROM ticket_messages WHERE sender_user_id = ? OR ticket_id IN (SELECT id FROM support_tickets WHERE user_id = ?)').run(u.id, u.id);
        db.prepare('DELETE FROM support_tickets WHERE user_id = ?').run(u.id);
        db.prepare('DELETE FROM notifications WHERE user_id = ?').run(u.id);
        db.prepare('DELETE FROM billing_addresses WHERE user_id = ?').run(u.id);
        db.prepare('DELETE FROM sessions WHERE user_id = ?').run(u.id);
        db.prepare('DELETE FROM password_resets WHERE user_id = ?').run(u.id);
        db.prepare('DELETE FROM login_history WHERE user_id = ?').run(u.id);
        db.prepare('DELETE FROM users WHERE id = ?').run(u.id);
      }

      db.prepare("DELETE FROM coupons WHERE upper(code) IN ('HELZERX15', 'WELCOME50')").run();
    },
  },
  {
    version: 3,
    name: 'polish_catalog_card_copy',
    up: (db: Database.Database) => {
      db.prepare("UPDATE categories SET name = 'Dedicated Cloud Hosting', description = 'High-speed private cloud environments engineered for business reliability.' WHERE slug = 'cloud-infrastructure'").run();
      db.prepare("UPDATE categories SET name = 'Enterprise AI Solutions', description = 'Custom private intelligence assistants and automated business workflows.' WHERE slug = 'enterprise-ai'").run();
      db.prepare("UPDATE categories SET name = 'Security & Protection', description = 'Continuous threat defense, account protection, and round-the-clock monitoring.' WHERE slug = 'security-compliance'").run();
      db.prepare("UPDATE categories SET name = 'Custom Engineering', description = 'Dedicated senior engineering teams for bespoke digital platforms.' WHERE slug = 'custom-engineering'").run();

      db.prepare(`
        UPDATE products
        SET name = 'HelzerX Core Infrastructure',
            tagline = 'Private dedicated cloud environments built for speed and uptime',
            description = 'High-availability business hosting designed for mission-critical applications, global storefronts, and seamless daily backups.',
            features_json = ?
        WHERE slug = 'helzerx-core-cluster'
      `).run(JSON.stringify(['Guaranteed Uptime Protection', 'Always-On Traffic Protection', 'Private Encrypted Networking', 'Priority Engineering Support']));

      db.prepare(`
        UPDATE products
        SET name = 'HelzerX NeuralOps Suite',
            tagline = 'Private company intelligence and workflow automation',
            description = 'Deploy private intelligent assistants, instant company knowledge search, and automated document workflows tailored to your organization.',
            features_json = ?
        WHERE slug = 'helzerx-neuralops-engine'
      `).run(JSON.stringify(['Strict Private Data Ownership', 'Team Access Permissions', 'Complete Activity Records', 'Custom Business Integrations']));

      db.prepare(`
        UPDATE products
        SET name = 'HelzerX Sentinel Protection',
            tagline = 'Continuous perimeter defense and security oversight',
            description = 'Round-the-clock protection safeguarding your customer portals, payment checkouts, and online operations against unauthorized access.',
            features_json = ?
        WHERE slug = 'helzerx-sentinel-shield'
      `).run(JSON.stringify(['Real-Time Threat Blocking', 'Automated Fraud Prevention', 'Scheduled Security Reviews', 'Rapid Incident Response']));

      db.prepare(`
        UPDATE products
        SET name = 'Dedicated Engineering Partner',
            tagline = 'Bespoke platform design, billing systems & software delivery',
            description = 'Collaborate directly with senior HelzerX specialists to design custom portals, financial workflows, and scalable digital experiences.',
            features_json = ?
        WHERE slug = 'dedicated-architecture-retainer'
      `).run(JSON.stringify(['Senior Lead Assigned', 'Direct Team Communication', 'Weekly Progress Releases', 'Full Ownership Guaranteed']));

      const pkgUpdates: Array<[string, string]> = [
        ['Starter Node (8 vCPU / 32GB)', 'Essential Cloud Tier'],
        ['Growth Cluster (16 vCPU / 64GB)', 'Business Growth Tier'],
        ['Enterprise HA (Annual)', 'Enterprise Annual Plan'],
        ['Enterprise Sovereign Stack', 'Enterprise Private Suite'],
        ['Perimeter Standard', 'Standard Protection'],
        ['Sprint Block (40 Hours)', 'Focused Delivery Sprint'],
        ['Quarter Retainer (160 Hours)', 'Quarterly Advisory Retainer'],
      ];
      for (const [oldName, newName] of pkgUpdates) {
        db.prepare('UPDATE packages SET name = ? WHERE name = ?').run(newName, oldName);
      }
    },
  },
];

