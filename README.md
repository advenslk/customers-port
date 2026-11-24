# HelzerX Customer Portal (`customers.helzerx.cyou`)

Enterprise-grade Customer Portal, Order Management, Automated PDF Invoicing, Payment Verification, Support Ticketing, and CRM platform for **HelzerX Technologies**.

## Architecture
- **Frontend**: React 19, TypeScript, Vite, Tailwind CSS v4 (`Outfit`, `Plus Jakarta Sans`, `JetBrains Mono`)
- **Backend**: Express.js (`server.ts`), Zod input validation, Helmet HTTP security headers, Express Rate Limit, Multer file upload validation
- **Database**: SQLite (`better-sqlite3`, WAL mode, strict foreign keys, atomic sequence generators) with versioned migrations in `server/db/schema.ts`
- **PDF Engine**: Programmatic obsidian black PDF generation (`pdfkit` in `server/services/pdfInvoice.ts`)
- **Integrations**: Resend transactional HTML emails, Discord Webhook alerts, Stripe Checkout + signed webhook verification, RFC 6238 TOTP Two-Factor Authentication

## Environment Variables (`.env`)
Copy `.env.example` to `.env` and configure:
- `APP_URL`: Public URL (e.g. `https://customers.helzerx.cyou`)
- `JWT_SECRET`: 64-char random cryptographic string for HTTP-only session cookies
- `DATABASE_PATH`: Path to SQLite database file (default `./data/helzerx.db`)
- `RESEND_API_KEY`: Optional Resend API key for live email delivery (falls back to `email_logs` table when unset)
- `EMAIL_FROM`: Sender identity (`HelzerX Billing <billing@helzerx.cyou>`)
- `DISCORD_WEBHOOK_URL`: Backend-only Discord channel webhook URL
- `STRIPE_SECRET_KEY` & `STRIPE_WEBHOOK_SECRET`: Optional Stripe server keys
- `ADMIN_BOOTSTRAP_EMAIL` & `ADMIN_BOOTSTRAP_PASSWORD`: Initial administrator login

## API Overview
- **Auth**: `POST /api/auth/register`, `POST /api/auth/login`, `POST /api/auth/logout`, `GET /api/auth/me`, `POST /api/auth/verify-email`, `POST /api/auth/forgot-password`, `POST /api/auth/reset-password`, `POST /api/auth/2fa/*`, `GET /api/auth/sessions`
- **Catalog & Checkout**: `GET /api/catalog`, `POST /api/coupons/validate`, `POST /api/checkout`
- **Customer Portal**: `GET /api/customer/overview`, `GET /api/orders`, `GET /api/invoices`, `GET /api/invoices/:id/pdf`, `POST /api/payments/manual`, `POST /api/payments/stripe-session`, `GET /api/services`, `POST /api/services/:id/renew`, `GET/POST /api/tickets`, `GET/PATCH /api/profile`
- **Admin Console** (`admin` / `super_admin` RBAC): `GET /api/admin/overview`, `GET /api/admin/search`, `GET/PATCH /api/admin/customers`, `GET/PATCH /api/admin/orders`, `GET/POST/PATCH /api/admin/invoices`, `POST /api/admin/payments/:id/review`, `POST /api/admin/refunds/:id/process`, `GET/POST/PATCH/DELETE /api/admin/products|packages|coupons`, `GET/POST/PATCH /api/admin/tickets`, `GET/PATCH /api/admin/settings`, `GET /api/admin/export/:type`

## Setup & Deployment
```bash
npm install
npm run build
NODE_ENV=production npm start
```
For local development:
```bash
npm run dev
```
