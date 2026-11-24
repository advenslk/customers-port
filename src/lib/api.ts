export function getCookieValue(name: string): string | null {
  if (typeof document === 'undefined') return null;
  const prefix = `${name}=`;
  const parts = document.cookie.split(';');
  for (const part of parts) {
    const trimmed = part.trim();
    if (trimmed.startsWith(prefix)) {
      return decodeURIComponent(trimmed.slice(prefix.length));
    }
  }
  return null;
}

export async function ensureCsrfToken(): Promise<string> {
  const existing = getCookieValue('hx_csrf');
  if (existing && existing.length >= 32) return existing;
  const res = await fetch('/api/auth/csrf', { credentials: 'include' });
  const data = await res.json().catch(() => ({}));
  return data?.csrf_token || getCookieValue('hx_csrf') || '';
}

export async function fetchAuthChallenge(): Promise<string> {
  const res = await fetch('/api/auth/challenge', { credentials: 'include' });
  if (!res.ok) {
    throw new Error('Unable to acquire security verification challenge.');
  }
  const data = await res.json();
  return data.challenge_token;
}

export interface PasswordStrengthResult {
  score: number; // 0-5
  label: 'Weak' | 'Fair' | 'Strong' | 'Enterprise';
  isValid: boolean;
  checks: {
    length: boolean;
    upper: boolean;
    lower: boolean;
    digit: boolean;
    special: boolean;
  };
}

export function evaluatePasswordStrength(password: string): PasswordStrengthResult {
  const checks = {
    length: password.length >= 12,
    upper: /[A-Z]/.test(password),
    lower: /[a-z]/.test(password),
    digit: /[0-9]/.test(password),
    special: /[^A-Za-z0-9]/.test(password),
  };
  const score = Object.values(checks).filter(Boolean).length;
  const isValid = score === 5 && password.length <= 128;
  let label: PasswordStrengthResult['label'] = 'Weak';
  if (score === 5 && password.length >= 16) label = 'Enterprise';
  else if (score === 5) label = 'Strong';
  else if (score >= 3) label = 'Fair';
  return { score, label, isValid, checks };
}

export async function apiFetch<T = any>(url: string, options: RequestInit = {}): Promise<T> {
  const method = (options.method || 'GET').toUpperCase();
  const isFormData = options.body instanceof FormData;
  const headers: Record<string, string> = {
    'X-Requested-With': 'HelzerX-Portal',
    ...(options.headers as Record<string, string> | undefined),
  };
  if (!isFormData && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/json';
  }

  if (!['GET', 'HEAD', 'OPTIONS'].includes(method)) {
    const csrf = await ensureCsrfToken();
    if (csrf) {
      headers['X-CSRF-Token'] = csrf;
    }
  }

  const res = await fetch(url, {
    credentials: 'include',
    ...options,
    headers,
  });

  if (!res.ok) {
    let errMsg = `Request failed (${res.status})`;
    try {
      const data = await res.json();
      if (data?.error) errMsg = data.error;
    } catch {
      // ignore parse error
    }
    throw new Error(errMsg);
  }

  const contentType = res.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    return res.json();
  }
  return res as unknown as T;
}

export async function downloadInvoicePdf(invoiceId: number, invoiceNumber: string): Promise<void> {
  const res = await fetch(`/api/invoices/${invoiceId}/pdf`, {
    credentials: 'include',
  });
  if (!res.ok) {
    throw new Error('Unable to download invoice PDF.');
  }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${invoiceNumber}.pdf`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

export function formatCurrency(cents: number, currency = 'USD'): string {
  const value = (cents || 0) / 100;
  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value);
  } catch {
    return `$${value.toFixed(2)}`;
  }
}

export function formatDate(iso?: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export function formatDateTime(iso?: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function statusColorClass(status: string): string {
  const s = status.toLowerCase();
  if (s === 'paid' || s === 'completed' || s === 'verified' || s === 'active' || s === 'resolved' || s === 'payment confirmed') {
    return 'text-emerald-400';
  }
  if (
    s === 'pending verification' ||
    s === 'under review' ||
    s === 'payment under review' ||
    s === 'in progress' ||
    s === 'processing' ||
    s === 'waiting for customer' ||
    s === 'expiring soon'
  ) {
    return 'text-orange-400';
  }
  if (s === 'overdue' || s === 'rejected' || s === 'cancelled' || s === 'suspended' || s === 'expired' || s === 'urgent') {
    return 'text-rose-400';
  }
  return 'text-zinc-300';
}

export function formatAuditAction(action: string): string {
  const map: Record<string, string> = {
    order_and_invoice_created: 'Order & Invoice Created',
    order_created: 'Order Created',
    order_cancelled: 'Order Cancelled',
    order_status_updated: 'Order Status Updated',
    invoice_created: 'Invoice Issued',
    invoice_updated: 'Invoice Updated',
    payment_submitted: 'Payment Receipt Submitted',
    payment_verified: 'Payment Verified',
    payment_rejected: 'Payment Rejected',
    login_success: 'Account Signed In',
    logout: 'Account Signed Out',
    logout_all_devices: 'Signed Out All Devices',
    password_changed: 'Password Updated',
    password_reset: 'Password Reset Completed',
    '2fa_enabled': 'Two-Factor Authentication Enabled',
    '2fa_disabled': 'Two-Factor Authentication Disabled',
    '2fa_recovery_regenerated': 'Recovery Codes Regenerated',
    ticket_created: 'Support Ticket Opened',
    ticket_replied: 'Support Ticket Reply',
    refund_requested: 'Refund Requested',
    refund_processed: 'Refund Processed',
    admin_bootstrapped: 'Primary Administrator Provisioned',
    customer_unlocked: 'Account Lock Cleared',
    settings_updated: 'Workspace Settings Updated',
  };
  if (map[action]) return map[action];
  return String(action || 'Account Update')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export function formatAuditEntity(entityType?: string | null, entityId?: string | number | null): string {
  const typeLabel = String(entityType || 'Account')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
  if (entityId === null || entityId === undefined || entityId === '') {
    return typeLabel;
  }
  return `${typeLabel} #${entityId}`;
}

export function formatFailureReason(reason?: string | null): string {
  if (!reason) return 'Verification Failed';
  const map: Record<string, string> = {
    invalid_password: 'Incorrect password',
    account_locked: 'Temporarily locked after repeated attempts',
    account_suspended: 'Account suspended',
    invalid_2fa: 'Incorrect authenticator code',
    unknown_email: 'Unrecognized email address',
  };
  return map[reason] || String(reason).replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

