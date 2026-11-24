export type Role = 'customer' | 'admin' | 'super_admin';

export interface UserProfile {
  id: number;
  customer_code: string;
  email: string;
  role: Role;
  full_name: string;
  mobile: string;
  country: string;
  city: string;
  billing_address: string;
  postal_code: string;
  company_name: string;
  discord_username: string;
  email_verified: boolean;
  two_factor_enabled: boolean;
  status: 'active' | 'suspended' | 'deletion_requested';
  notify_email: boolean;
  notify_discord: boolean;
  internal_notes?: string;
  created_at: string;
}

export interface ProductPackage {
  id: number;
  product_id: number;
  name: string;
  billing_cycle: 'monthly' | 'quarterly' | 'annual' | 'one_time';
  duration_days: number;
  price_cents: number;
  currency: string;
  features: string[];
  is_active: number;
}

export interface Product {
  id: number;
  category_id: number;
  name: string;
  slug: string;
  tagline: string;
  description: string;
  features: string[];
  is_active: number;
  featured: number;
  packages: ProductPackage[];
}

export interface Category {
  id: number;
  name: string;
  slug: string;
  description: string;
}

export interface InvoiceItem {
  id: number;
  description: string;
  quantity: number;
  unit_price_cents: number;
  amount_cents: number;
}

export interface Invoice {
  id: number;
  invoice_number: string;
  order_id: number | null;
  order_number?: string | null;
  user_id: number;
  customer_code?: string;
  customer_name?: string;
  customer_email?: string;
  status: 'Draft' | 'Unpaid' | 'Pending Verification' | 'Paid' | 'Overdue' | 'Cancelled' | 'Refunded';
  issue_date: string;
  due_date: string;
  subtotal_cents: number;
  discount_cents: number;
  tax_rate_bps: number;
  tax_cents: number;
  total_cents: number;
  currency: string;
  payment_method: string;
  billing_snapshot: Record<string, string>;
  notes: string;
  paid_at: string | null;
  items: InvoiceItem[];
}

export interface Order {
  id: number;
  order_number: string;
  user_id: number;
  customer_code?: string;
  customer_name?: string;
  customer_email?: string;
  status:
    | 'Order Submitted'
    | 'Awaiting Payment'
    | 'Payment Under Review'
    | 'Payment Confirmed'
    | 'Processing'
    | 'In Progress'
    | 'Completed'
    | 'Cancelled'
    | 'Refunded';
  subtotal_cents: number;
  discount_cents: number;
  tax_cents: number;
  total_cents: number;
  currency: string;
  promo_code: string | null;
  requirements: string;
  special_instructions: string;
  internal_notes?: string;
  invoice_id?: number;
  invoice_number?: string;
  invoice_status?: string;
  assigned_admin_name?: string;
  created_at: string;
  items: Array<{
    id: number;
    product_name: string;
    package_name: string;
    subscription_duration: string;
    quantity: number;
    unit_price_cents: number;
    line_total_cents: number;
  }>;
  history: Array<{
    id: number;
    from_status: string | null;
    to_status: string;
    note: string;
    created_at: string;
  }>;
}
