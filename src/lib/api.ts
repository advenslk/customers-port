export async function apiFetch<T = any>(url: string, options: RequestInit = {}): Promise<T> {
  const isFormData = options.body instanceof FormData;
  const headers: Record<string, string> = {
    'X-Requested-With': 'HelzerX-Portal',
    ...(options.headers as Record<string, string> | undefined),
  };
  if (!isFormData && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/json';
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
