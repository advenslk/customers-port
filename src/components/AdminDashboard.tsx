import React, { useEffect, useState } from 'react';
import {
  Activity,
  BarChart3,
  Check,
  CreditCard,
  Download,
  ExternalLink,
  FileText,
  Layers,
  LifeBuoy,
  LogOut,
  Mail,
  Plus,
  RefreshCw,
  Search,
  Send,
  Settings,
  ShoppingBag,
  Tag,
  Trash2,
  Users,
  X,
} from 'lucide-react';
import { Invoice, Order, UserProfile } from '../types';
import { apiFetch, downloadInvoicePdf, formatCurrency, formatDate, formatDateTime, statusColorClass } from '../lib/api';

type AdminTab =
  | 'overview'
  | 'customers'
  | 'orders'
  | 'invoices'
  | 'payments'
  | 'products'
  | 'coupons'
  | 'tickets'
  | 'system';

const ORDER_STATUSES = [
  'Order Submitted',
  'Awaiting Payment',
  'Payment Under Review',
  'Payment Confirmed',
  'Processing',
  'In Progress',
  'Completed',
  'Cancelled',
  'Refunded',
];

interface AdminDashboardProps {
  user: UserProfile;
  onOpenInvoice: (invoice: Invoice) => void;
  onCatalogChanged: () => void;
  onLogout: () => void;
  onNotify: (type: 'success' | 'error', msg: string) => void;
}

export function AdminDashboard({ user, onOpenInvoice, onCatalogChanged, onLogout, onNotify }: AdminDashboardProps) {
  const [tab, setTab] = useState<AdminTab>('overview');
  const [loading, setLoading] = useState(false);

  const [overview, setOverview] = useState<any>(null);
  const [globalQuery, setGlobalQuery] = useState('');
  const [searchResults, setSearchResults] = useState<any>(null);

  const [customers, setCustomers] = useState<any[]>([]);
  const [custSearch, setCustSearch] = useState('');
  const [selectedCustomer, setSelectedCustomer] = useState<any>(null);

  const [orders, setOrders] = useState<Order[]>([]);
  const [ordSearch, setOrdSearch] = useState('');
  const [ordFilter, setOrdFilter] = useState('');
  const [editingOrder, setEditingOrder] = useState<Order | null>(null);
  const [orderUpdate, setOrderUpdate] = useState({ status: '', note: '', internal_notes: '' });

  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [showManualInv, setShowManualInv] = useState(false);
  const [manualInv, setManualInv] = useState({
    user_id: '',
    status: 'Unpaid',
    due_days: 14,
    discount_cents: 0,
    notes: 'Thank you for your business!',
    description: 'Enterprise Consulting & Deployment',
    quantity: 1,
    unit_price_dollars: '1200',
  });

  const [payments, setPayments] = useState<any[]>([]);
  const [refunds, setRefunds] = useState<any[]>([]);
  const [reviewNote, setReviewNote] = useState<Record<number, string>>({});

  const [catalog, setCatalog] = useState<{ categories: any[]; products: any[] }>({ categories: [], products: [] });
  const [newProd, setNewProd] = useState({ category_id: '', name: '', tagline: '', description: '', features: '' });
  const [newPkg, setNewPkg] = useState({ product_id: '', name: '', billing_cycle: 'monthly', duration_days: 30, price_dollars: '299' });

  const [coupons, setCoupons] = useState<any[]>([]);
  const [newCoupon, setNewCoupon] = useState({
    code: '',
    discount_type: 'percentage',
    discount_value: 10,
    min_purchase_dollars: 0,
    max_uses: 100,
    expires_at: '2027-12-31',
  });

  const [tickets, setTickets] = useState<any[]>([]);
  const [activeTicket, setActiveTicket] = useState<{ ticket: any; messages: any[] } | null>(null);
  const [adminReply, setAdminReply] = useState('');
  const [adminReplyStatus, setAdminReplyStatus] = useState('Waiting for Customer');

  const [sysSettings, setSysSettings] = useState<Record<string, string>>({});
  const [auditLogs, setAuditLogs] = useState<any[]>([]);
  const [emailLogs, setEmailLogs] = useState<any[]>([]);

  const loadTabData = async (activeTab: AdminTab) => {
    setLoading(true);
    try {
      if (activeTab === 'overview') {
        setOverview(await apiFetch('/api/admin/overview'));
      } else if (activeTab === 'customers') {
        const res = await apiFetch(`/api/admin/customers?search=${encodeURIComponent(custSearch)}`);
        setCustomers(res.customers || []);
      } else if (activeTab === 'orders') {
        const [ordRes, refRes] = await Promise.all([
          apiFetch(`/api/admin/orders?search=${encodeURIComponent(ordSearch)}&status=${encodeURIComponent(ordFilter)}`),
          apiFetch('/api/admin/refunds'),
        ]);
        setOrders(ordRes.orders || []);
        setRefunds(refRes.refunds || []);
      } else if (activeTab === 'invoices') {
        const [invRes, custRes] = await Promise.all([apiFetch('/api/admin/invoices'), apiFetch('/api/admin/customers')]);
        setInvoices(invRes.invoices || []);
        setCustomers(custRes.customers || []);
      } else if (activeTab === 'payments') {
        const res = await apiFetch('/api/admin/payments');
        setPayments(res.payments || []);
      } else if (activeTab === 'products') {
        setCatalog(await apiFetch('/api/admin/catalog'));
      } else if (activeTab === 'coupons') {
        const res = await apiFetch('/api/admin/coupons');
        setCoupons(res.coupons || []);
      } else if (activeTab === 'tickets') {
        const res = await apiFetch('/api/admin/tickets');
        setTickets(res.tickets || []);
      } else if (activeTab === 'system') {
        const [sRes, aRes, eRes] = await Promise.all([
          apiFetch('/api/admin/settings'),
          apiFetch('/api/admin/audit-logs'),
          apiFetch('/api/admin/email-logs'),
        ]);
        setSysSettings(sRes.settings || {});
        setAuditLogs(aRes.logs || []);
        setEmailLogs(eRes.emails || []);
      }
    } catch (err: any) {
      onNotify('error', err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadTabData(tab);
  }, [tab]);

  useEffect(() => {
    if (!globalQuery.trim()) {
      setSearchResults(null);
      return;
    }
    const timer = setTimeout(async () => {
      try {
        setSearchResults(await apiFetch(`/api/admin/search?q=${encodeURIComponent(globalQuery.trim())}`));
      } catch {
        // ignore
      }
    }, 250);
    return () => clearTimeout(timer);
  }, [globalQuery]);

  const navItems: Array<{ id: AdminTab; label: string; icon: React.ComponentType<any> }> = [
    { id: 'overview', label: 'Admin Overview', icon: BarChart3 },
    { id: 'customers', label: 'Customers CRM', icon: Users },
    { id: 'orders', label: 'Orders & Refunds', icon: ShoppingBag },
    { id: 'invoices', label: 'Invoices', icon: FileText },
    { id: 'payments', label: 'Payment Queue', icon: CreditCard },
    { id: 'products', label: 'Catalog & Tiers', icon: Layers },
    { id: 'coupons', label: 'Promo Codes', icon: Tag },
    { id: 'tickets', label: 'Support Desk', icon: LifeBuoy },
    { id: 'system', label: 'Settings & Logs', icon: Settings },
  ];

  const maxMonthlyRev = Math.max(1, ...(overview?.monthly_analytics || []).map((m: any) => m.revenue_cents));

  return (
    <div className="max-w-7xl mx-auto px-4 md:px-6 py-8">
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Sidebar */}
        <aside className="lg:col-span-3 bg-[#0D0D11] border border-white/10 rounded-2xl p-4 space-y-4 lg:sticky lg:top-24">
          <div className="px-3 py-3 border-b border-white/10">
            <div className="font-mono text-xs text-orange-400">ADMINISTRATOR CONSOLE</div>
            <div className="font-display text-base font-bold text-white truncate mt-0.5">{user.full_name}</div>
            <div className="text-xs text-zinc-500 truncate">{user.email}</div>
          </div>

          <nav className="space-y-1">
            {navItems.map((item) => {
              const Icon = item.icon;
              const active = tab === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => setTab(item.id)}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors whitespace-nowrap ${
                    active ? 'bg-orange-600 text-white' : 'text-zinc-400 hover:text-white hover:bg-white/5'
                  }`}
                >
                  <Icon className="w-4 h-4 shrink-0" />
                  <span>{item.label}</span>
                </button>
              );
            })}
          </nav>

          <div className="pt-3 border-t border-white/10">
            <button
              onClick={onLogout}
              className="w-full flex items-center justify-center gap-2 py-2 px-3 rounded-xl text-xs text-zinc-400 hover:text-white hover:bg-white/5 transition-colors"
            >
              <LogOut className="w-3.5 h-3.5" />
              Sign Out
            </button>
          </div>
        </aside>

        {/* Main Panel */}
        <main className="lg:col-span-9 space-y-6 min-w-0">
          {/* Global Search Bar */}
          <div className="relative">
            <div className="flex items-center gap-3 bg-[#0D0D11] border border-white/10 rounded-xl px-4 py-2.5">
              <Search className="w-4 h-4 text-zinc-500 shrink-0" />
              <input
                value={globalQuery}
                onChange={(e) => setGlobalQuery(e.target.value)}
                placeholder="Global search across customers, orders, invoices, and support tickets..."
                className="w-full bg-transparent text-sm text-white focus:outline-none placeholder:text-zinc-500"
              />
              {globalQuery && (
                <button onClick={() => setGlobalQuery('')} className="text-zinc-500 hover:text-white">
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
            {searchResults && (
              <div className="absolute z-30 left-0 right-0 mt-2 bg-[#0E0E13] border border-white/15 rounded-xl p-4 shadow-2xl grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                <div>
                  <div className="text-zinc-500 font-semibold mb-1.5">CUSTOMERS ({searchResults.customers.length})</div>
                  {searchResults.customers.map((c: any) => (
                    <button
                      key={c.id}
                      onClick={() => {
                        setTab('customers');
                        setCustSearch(c.customer_code);
                        setGlobalQuery('');
                      }}
                      className="block w-full text-left py-1 text-zinc-200 hover:text-orange-400"
                    >
                      {c.customer_code} · {c.full_name} ({c.email})
                    </button>
                  ))}
                </div>
                <div>
                  <div className="text-zinc-500 font-semibold mb-1.5">ORDERS &amp; INVOICES ({searchResults.orders.length + searchResults.invoices.length})</div>
                  {searchResults.orders.map((o: any) => (
                    <button
                      key={`o-${o.id}`}
                      onClick={() => {
                        setTab('orders');
                        setOrdSearch(o.order_number);
                        setGlobalQuery('');
                      }}
                      className="block w-full text-left py-1 font-mono text-zinc-200 hover:text-orange-400"
                    >
                      {o.order_number} · {o.status}
                    </button>
                  ))}
                  {searchResults.invoices.map((i: any) => (
                    <button
                      key={`i-${i.id}`}
                      onClick={() => {
                        setTab('invoices');
                        setGlobalQuery('');
                      }}
                      className="block w-full text-left py-1 font-mono text-zinc-200 hover:text-orange-400"
                    >
                      {i.invoice_number} · {i.status}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* ADMIN OVERVIEW */}
          {tab === 'overview' && (
            <div className="space-y-6">
              <div className="flex flex-wrap items-center justify-between gap-4 bg-[#0D0D11] border border-white/10 rounded-2xl p-6">
                <div>
                  <h1 className="font-display text-2xl font-bold text-white">Enterprise Operations &amp; Revenue Overview</h1>
                  <p className="text-xs text-zinc-400 mt-1">Real-time ledger across customers, orders, verified payments, and support.</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <a href="/api/admin/export/orders" className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg border border-white/15 bg-white/5 hover:bg-white/10 text-zinc-200">
                    <Download className="w-3.5 h-3.5" /> Export Orders CSV
                  </a>
                  <button onClick={() => loadTabData('overview')} className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg bg-orange-600 text-white">
                    <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} /> Refresh
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="bg-[#0D0D11] border border-white/10 rounded-xl p-5">
                  <div className="text-xs text-zinc-400">Total Customers</div>
                  <div className="font-display text-3xl font-bold text-white tabular-nums mt-1.5">{overview?.stats?.total_customers ?? 0}</div>
                </div>
                <div className="bg-[#0D0D11] border border-white/10 rounded-xl p-5">
                  <div className="text-xs text-zinc-400">Total Orders</div>
                  <div className="font-display text-3xl font-bold text-white tabular-nums mt-1.5">{overview?.stats?.total_orders ?? 0}</div>
                </div>
                <div className="hx-featured-card rounded-xl p-5 text-white">
                  <div className="text-xs text-orange-100/80">Total Verified Revenue</div>
                  <div className="font-display text-2xl md:text-3xl font-bold font-mono tabular-nums mt-1.5">
                    {formatCurrency(overview?.stats?.total_revenue_cents ?? 0)}
                  </div>
                </div>
                <div className="bg-[#0D0D11] border border-white/10 rounded-xl p-5">
                  <div className="text-xs text-zinc-400">Monthly Revenue</div>
                  <div className="font-display text-2xl md:text-3xl font-bold text-emerald-400 font-mono tabular-nums mt-1.5">
                    {formatCurrency(overview?.stats?.monthly_revenue_cents ?? 0)}
                  </div>
                </div>
                <div className="bg-[#0D0D11] border border-white/10 rounded-xl p-5">
                  <div className="text-xs text-zinc-400">Pending Payments</div>
                  <div className="font-display text-2xl font-bold text-orange-400 tabular-nums mt-1">{overview?.stats?.pending_payments ?? 0}</div>
                </div>
                <div className="bg-[#0D0D11] border border-white/10 rounded-xl p-5">
                  <div className="text-xs text-zinc-400">Active / Pending Orders</div>
                  <div className="font-display text-2xl font-bold text-white tabular-nums mt-1">{overview?.stats?.pending_orders ?? 0}</div>
                </div>
                <div className="bg-[#0D0D11] border border-white/10 rounded-xl p-5">
                  <div className="text-xs text-zinc-400">Active Services</div>
                  <div className="font-display text-2xl font-bold text-emerald-400 tabular-nums mt-1">{overview?.stats?.active_services ?? 0}</div>
                </div>
                <div className="bg-[#0D0D11] border border-white/10 rounded-xl p-5">
                  <div className="text-xs text-zinc-400">Open Support Tickets</div>
                  <div className="font-display text-2xl font-bold text-white tabular-nums mt-1">{overview?.stats?.open_tickets ?? 0}</div>
                </div>
              </div>

              {/* Revenue Analytics & Recent Transactions */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="bg-[#0D0D11] border border-white/10 rounded-2xl p-6 space-y-4">
                  <h2 className="font-display text-base font-bold text-white">Monthly Revenue Analytics</h2>
                  {(overview?.monthly_analytics || []).length === 0 ? (
                    <p className="text-xs text-zinc-500 py-8">No paid invoices recorded yet.</p>
                  ) : (
                    <div className="flex items-end gap-4 h-44 pt-4">
                      {(overview?.monthly_analytics || []).map((m: any) => {
                        const pct = Math.max(12, Math.round((m.revenue_cents / maxMonthlyRev) * 100));
                        return (
                          <div key={m.month} className="flex-1 flex flex-col items-center gap-2 h-full justify-end">
                            <div className="text-[11px] font-mono text-zinc-300">{formatCurrency(m.revenue_cents)}</div>
                            <div
                              className="w-full rounded-t-lg"
                              style={{
                                height: `${pct}%`,
                                background: 'linear-gradient(180deg, #FF6B2C 0%, #9A3412 100%)',
                              }}
                            />
                            <div className="text-[11px] font-mono text-zinc-500">{m.month}</div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                <div className="bg-[#0D0D11] border border-white/10 rounded-2xl p-6 space-y-4">
                  <h2 className="font-display text-base font-bold text-white">Recent Verified Transactions</h2>
                  <div className="space-y-2.5 max-h-56 overflow-y-auto">
                    {(overview?.recent_transactions || []).map((t: any) => (
                      <div key={t.id} className="flex items-center justify-between gap-3 py-2 border-b border-white/5 text-xs">
                        <div>
                          <div className="font-mono text-white">{t.transaction_code} · {t.invoice_number}</div>
                          <div className="text-zinc-500">{t.customer_code} ({t.full_name})</div>
                        </div>
                        <div className="text-right">
                          <div className="font-mono font-semibold text-emerald-400">{formatCurrency(t.amount_cents, t.currency)}</div>
                          <div className="font-mono text-[11px] text-zinc-500">{formatDate(t.created_at)}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* CUSTOMERS CRM */}
          {tab === 'customers' && (
            <div className="bg-[#0D0D11] border border-white/10 rounded-2xl p-6 space-y-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 className="font-display text-xl font-bold text-white">Customer Relationship Management</h2>
                <div className="flex gap-2">
                  <input
                    value={custSearch}
                    onChange={(e) => setCustSearch(e.target.value)}
                    placeholder="Search name, email, code..."
                    className="px-3 py-1.5 text-xs bg-[#070709] border border-white/15 rounded-lg text-white"
                  />
                  <button onClick={() => loadTabData('customers')} className="px-3 py-1.5 text-xs bg-orange-600 text-white rounded-lg">Search</button>
                  <a href="/api/admin/export/customers" className="px-3 py-1.5 text-xs border border-white/15 rounded-lg text-zinc-200">CSV</a>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-sm">
                  <thead>
                    <tr className="border-b border-white/10 text-[11px] text-zinc-500 uppercase">
                      <th className="py-3 pr-3">Customer ID</th>
                      <th className="py-3 px-3">Customer</th>
                      <th className="py-3 px-3">Location</th>
                      <th className="py-3 px-3 text-right">Orders</th>
                      <th className="py-3 px-3 text-right">Total Spent</th>
                      <th className="py-3 px-3">Status</th>
                      <th className="py-3 pl-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5 text-xs">
                    {customers.map((c) => (
                      <tr key={c.id}>
                        <td className="py-3 pr-3 font-mono text-orange-400">{c.customer_code}</td>
                        <td className="py-3 px-3">
                          <div className="font-semibold text-white">{c.full_name}</div>
                          <div className="text-zinc-500">{c.email}</div>
                        </td>
                        <td className="py-3 px-3 text-zinc-400">{c.city}, {c.country}</td>
                        <td className="py-3 px-3 text-right font-mono">{c.order_count}</td>
                        <td className="py-3 px-3 text-right font-mono text-white">{formatCurrency(c.total_spent_cents)}</td>
                        <td className={`py-3 px-3 font-semibold ${statusColorClass(c.status)}`}>{c.status}</td>
                        <td className="py-3 pl-3 text-right space-x-2 whitespace-nowrap">
                          <button
                            onClick={async () => setSelectedCustomer(await apiFetch(`/api/admin/customers/${c.id}`))}
                            className="px-2.5 py-1 rounded border border-white/15 text-zinc-200 hover:bg-white/10"
                          >
                            Profile
                          </button>
                          <button
                            onClick={async () => {
                              const nextStatus = c.status === 'suspended' ? 'active' : 'suspended';
                              await apiFetch(`/api/admin/customers/${c.id}`, { method: 'PATCH', body: JSON.stringify({ status: nextStatus }) });
                              onNotify('success', `Customer ${c.customer_code} set to ${nextStatus}.`);
                              loadTabData('customers');
                            }}
                            className="px-2.5 py-1 rounded border border-orange-500/30 text-orange-300 hover:bg-orange-500/10"
                          >
                            {c.status === 'suspended' ? 'Restore' : 'Suspend'}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {selectedCustomer && (
                <div className="p-5 rounded-xl bg-[#070709] border border-orange-500/30 space-y-4 text-xs">
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="font-mono text-orange-400">{selectedCustomer.customer.customer_code}</span>
                      <h3 className="font-display text-lg font-bold text-white">{selectedCustomer.customer.full_name}</h3>
                      <div className="text-zinc-400">{selectedCustomer.customer.email} · {selectedCustomer.customer.mobile}</div>
                    </div>
                    <button onClick={() => setSelectedCustomer(null)} className="text-zinc-400 hover:text-white"><X className="w-4 h-4" /></button>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-3 border-t border-white/10">
                    <div>
                      <div className="text-zinc-500 font-semibold mb-1">Orders ({selectedCustomer.orders.length})</div>
                      {selectedCustomer.orders.map((o: any) => (
                        <div key={o.id} className="font-mono text-zinc-300">{o.order_number} · {o.status}</div>
                      ))}
                    </div>
                    <div>
                      <div className="text-zinc-500 font-semibold mb-1">Invoices ({selectedCustomer.invoices.length})</div>
                      {selectedCustomer.invoices.map((i: any) => (
                        <div key={i.id} className="font-mono text-zinc-300">{i.invoice_number} · {formatCurrency(i.total_cents)} ({i.status})</div>
                      ))}
                    </div>
                    <div>
                      <div className="text-zinc-500 font-semibold mb-1">Admin CRM Note</div>
                      <textarea
                        rows={2}
                        defaultValue={selectedCustomer.customer.internal_notes || ''}
                        onBlur={async (e) => {
                          await apiFetch(`/api/admin/customers/${selectedCustomer.customer.id}`, {
                            method: 'PATCH',
                            body: JSON.stringify({ internal_notes: e.target.value }),
                          });
                          onNotify('success', 'Customer CRM note saved.');
                        }}
                        placeholder="Internal CRM notes (auto-saves on blur)"
                        className="w-full p-2 bg-[#0D0D11] border border-white/15 rounded text-white"
                      />
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ORDERS & REFUNDS */}
          {tab === 'orders' && (
            <div className="space-y-6">
              <div className="bg-[#0D0D11] border border-white/10 rounded-2xl p-6 space-y-5">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <h2 className="font-display text-xl font-bold text-white">Order Fulfillment Management</h2>
                  <div className="flex flex-wrap gap-2">
                    <input value={ordSearch} onChange={(e) => setOrdSearch(e.target.value)} placeholder="Order #, customer..." className="px-3 py-1.5 text-xs bg-[#070709] border border-white/15 rounded-lg text-white" />
                    <select value={ordFilter} onChange={(e) => setOrdFilter(e.target.value)} className="px-3 py-1.5 text-xs bg-[#070709] border border-white/15 rounded-lg text-white">
                      <option value="">All Statuses</option>
                      {ORDER_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                    </select>
                    <button onClick={() => loadTabData('orders')} className="px-3 py-1.5 text-xs bg-orange-600 text-white rounded-lg">Filter</button>
                  </div>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="border-b border-white/10 text-zinc-500 uppercase">
                        <th className="py-3 pr-3">Order #</th>
                        <th className="py-3 px-3">Customer</th>
                        <th className="py-3 px-3">Product / Package</th>
                        <th className="py-3 px-3">Status</th>
                        <th className="py-3 px-3 text-right">Total</th>
                        <th className="py-3 pl-3 text-right">Manage</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5">
                      {orders.map((o) => (
                        <tr key={o.id}>
                          <td className="py-3 pr-3 font-mono text-white">{o.order_number}</td>
                          <td className="py-3 px-3">
                            <div className="text-zinc-200">{o.customer_name}</div>
                            <div className="font-mono text-zinc-500">{o.customer_code}</div>
                          </td>
                          <td className="py-3 px-3 text-zinc-300">{o.items[0]?.product_name} · {o.items[0]?.package_name}</td>
                          <td className={`py-3 px-3 font-semibold ${statusColorClass(o.status)}`}>{o.status}</td>
                          <td className="py-3 px-3 text-right font-mono text-white">{formatCurrency(o.total_cents, o.currency)}</td>
                          <td className="py-3 pl-3 text-right">
                            <button
                              onClick={() => {
                                setEditingOrder(o);
                                setOrderUpdate({ status: o.status, note: '', internal_notes: o.internal_notes || '' });
                              }}
                              className="px-2.5 py-1 rounded bg-orange-600/20 border border-orange-500/30 text-orange-300 hover:bg-orange-600/30"
                            >
                              Update
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {editingOrder && (
                  <div className="p-5 rounded-xl bg-[#070709] border border-orange-500/30 space-y-4 text-xs">
                    <div className="flex justify-between">
                      <h3 className="font-display text-base font-bold text-white">Update Order {editingOrder.order_number}</h3>
                      <button onClick={() => setEditingOrder(null)} className="text-zinc-400 hover:text-white"><X className="w-4 h-4" /></button>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                      <div>
                        <label className="block text-zinc-400 mb-1">Order Status</label>
                        <select value={orderUpdate.status} onChange={(e) => setOrderUpdate({ ...orderUpdate, status: e.target.value })} className="w-full px-3 py-2 bg-[#0D0D11] border border-white/15 rounded-lg text-white">
                          {ORDER_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                        </select>
                      </div>
                      <div className="md:col-span-2">
                        <label className="block text-zinc-400 mb-1">Customer Status Note (recorded in timeline &amp; email)</label>
                        <input value={orderUpdate.note} onChange={(e) => setOrderUpdate({ ...orderUpdate, note: e.target.value })} placeholder="e.g. Provisioned on node-usw2-05" className="w-full px-3 py-2 bg-[#0D0D11] border border-white/15 rounded-lg text-white" />
                      </div>
                      <div className="md:col-span-3">
                        <label className="block text-zinc-400 mb-1">Internal Admin Notes (hidden from customer)</label>
                        <input value={orderUpdate.internal_notes} onChange={(e) => setOrderUpdate({ ...orderUpdate, internal_notes: e.target.value })} className="w-full px-3 py-2 bg-[#0D0D11] border border-white/15 rounded-lg text-white" />
                      </div>
                    </div>
                    <div className="flex justify-end gap-2">
                      <button
                        onClick={async () => {
                          await apiFetch(`/api/admin/orders/${editingOrder.id}`, {
                            method: 'PATCH',
                            body: JSON.stringify(orderUpdate),
                          });
                          onNotify('success', `Order ${editingOrder.order_number} updated.`);
                          setEditingOrder(null);
                          loadTabData('orders');
                        }}
                        className="px-4 py-2 bg-orange-600 text-white rounded-lg font-semibold"
                      >
                        Save Order Update
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* Refund Requests */}
              <div className="bg-[#0D0D11] border border-white/10 rounded-2xl p-6 space-y-4">
                <h3 className="font-display text-lg font-bold text-white">Refund Requests</h3>
                {refunds.length === 0 ? (
                  <p className="text-xs text-zinc-500">No refund requests pending.</p>
                ) : (
                  <div className="space-y-3 text-xs">
                    {refunds.map((rf) => (
                      <div key={rf.id} className="p-4 rounded-xl bg-[#070709] border border-white/10 flex flex-wrap items-center justify-between gap-4">
                        <div>
                          <div className="font-mono text-white">{rf.order_number} · {rf.customer_code} ({rf.customer_name})</div>
                          <div className="text-zinc-400 mt-1">Reason: {rf.reason}</div>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="font-mono font-bold text-white">{formatCurrency(rf.amount_cents)}</span>
                          <span className={statusColorClass(rf.status)}>{rf.status}</span>
                          {rf.status === 'Requested' && (
                            <>
                              <button
                                onClick={async () => {
                                  await apiFetch(`/api/admin/refunds/${rf.id}/process`, { method: 'POST', body: JSON.stringify({ decision: 'Processed', admin_note: 'Refund approved & issued' }) });
                                  loadTabData('orders');
                                }}
                                className="px-3 py-1.5 bg-emerald-600 text-white rounded-lg font-semibold"
                              >
                                Approve Refund
                              </button>
                              <button
                                onClick={async () => {
                                  await apiFetch(`/api/admin/refunds/${rf.id}/process`, { method: 'POST', body: JSON.stringify({ decision: 'Rejected', admin_note: 'Outside refund policy window' }) });
                                  loadTabData('orders');
                                }}
                                className="px-3 py-1.5 border border-rose-500/30 text-rose-300 rounded-lg"
                              >
                                Reject
                              </button>
                            </>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* INVOICES MANAGEMENT */}
          {tab === 'invoices' && (
            <div className="bg-[#0D0D11] border border-white/10 rounded-2xl p-6 space-y-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 className="font-display text-xl font-bold text-white">Invoice Management &amp; Manual Creation</h2>
                <div className="flex gap-2">
                  <a href="/api/admin/export/invoices" className="px-3 py-1.5 text-xs border border-white/15 rounded-lg text-zinc-200">Export CSV</a>
                  <button onClick={() => setShowManualInv((s) => !s)} className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-orange-600 text-white rounded-lg">
                    <Plus className="w-3.5 h-3.5" /> Create Manual Invoice
                  </button>
                </div>
              </div>

              {showManualInv && (
                <form
                  onSubmit={async (e) => {
                    e.preventDefault();
                    try {
                      await apiFetch('/api/admin/invoices', {
                        method: 'POST',
                        body: JSON.stringify({
                          user_id: Number(manualInv.user_id),
                          status: manualInv.status,
                          due_days: Number(manualInv.due_days),
                          discount_cents: Number(manualInv.discount_cents) * 100,
                          notes: manualInv.notes,
                          items: [
                            {
                              description: manualInv.description,
                              quantity: Number(manualInv.quantity),
                              unit_price_cents: Math.round(Number(manualInv.unit_price_dollars) * 100),
                            },
                          ],
                        }),
                      });
                      onNotify('success', 'Manual invoice created.');
                      setShowManualInv(false);
                      loadTabData('invoices');
                    } catch (err: any) {
                      onNotify('error', err.message);
                    }
                  }}
                  className="p-5 rounded-xl bg-[#070709] border border-orange-500/30 grid grid-cols-1 md:grid-cols-3 gap-3 text-xs"
                >
                  <div>
                    <label className="block text-zinc-400 mb-1">Customer *</label>
                    <select required value={manualInv.user_id} onChange={(e) => setManualInv({ ...manualInv, user_id: e.target.value })} className="w-full px-3 py-2 bg-[#0D0D11] border border-white/15 rounded-lg text-white">
                      <option value="">Select customer...</option>
                      {customers.map((c) => <option key={c.id} value={c.id}>{c.customer_code} · {c.full_name}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-zinc-400 mb-1">Initial Status</label>
                    <select value={manualInv.status} onChange={(e) => setManualInv({ ...manualInv, status: e.target.value })} className="w-full px-3 py-2 bg-[#0D0D11] border border-white/15 rounded-lg text-white">
                      <option value="Unpaid">Unpaid (Issue Immediately)</option>
                      <option value="Draft">Draft</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-zinc-400 mb-1">Due Days</label>
                    <input type="number" min={1} value={manualInv.due_days} onChange={(e) => setManualInv({ ...manualInv, due_days: Number(e.target.value) })} className="w-full px-3 py-2 bg-[#0D0D11] border border-white/15 rounded-lg text-white" />
                  </div>
                  <div className="md:col-span-2">
                    <label className="block text-zinc-400 mb-1">Line Item Description *</label>
                    <input required value={manualInv.description} onChange={(e) => setManualInv({ ...manualInv, description: e.target.value })} className="w-full px-3 py-2 bg-[#0D0D11] border border-white/15 rounded-lg text-white" />
                  </div>
                  <div className="flex gap-2">
                    <div className="w-20">
                      <label className="block text-zinc-400 mb-1">Qty</label>
                      <input type="number" min={1} value={manualInv.quantity} onChange={(e) => setManualInv({ ...manualInv, quantity: Number(e.target.value) })} className="w-full px-2 py-2 bg-[#0D0D11] border border-white/15 rounded-lg text-white" />
                    </div>
                    <div className="flex-1">
                      <label className="block text-zinc-400 mb-1">Unit Price (USD)</label>
                      <input type="number" min={0} step="0.01" value={manualInv.unit_price_dollars} onChange={(e) => setManualInv({ ...manualInv, unit_price_dollars: e.target.value })} className="w-full px-2 py-2 bg-[#0D0D11] border border-white/15 rounded-lg text-white" />
                    </div>
                  </div>
                  <div className="md:col-span-3 flex justify-end gap-2">
                    <button type="button" onClick={() => setShowManualInv(false)} className="px-3 py-2 text-zinc-400">Cancel</button>
                    <button type="submit" className="px-4 py-2 bg-orange-600 text-white rounded-lg font-semibold">Generate Invoice</button>
                  </div>
                </form>
              )}

              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-white/10 text-zinc-500 uppercase">
                      <th className="py-3 pr-3">Invoice #</th>
                      <th className="py-3 px-3">Customer</th>
                      <th className="py-3 px-3">Status</th>
                      <th className="py-3 px-3 text-right">Total</th>
                      <th className="py-3 pl-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {invoices.map((inv) => (
                      <tr key={inv.id}>
                        <td className="py-3 pr-3 font-mono text-white">{inv.invoice_number}</td>
                        <td className="py-3 px-3 text-zinc-300">{inv.customer_code} · {inv.customer_name}</td>
                        <td className="py-3 px-3">
                          <select
                            value={inv.status}
                            onChange={async (e) => {
                              await apiFetch(`/api/admin/invoices/${inv.id}`, { method: 'PATCH', body: JSON.stringify({ status: e.target.value }) });
                              onNotify('success', `Invoice ${inv.invoice_number} status updated.`);
                              loadTabData('invoices');
                            }}
                            className={`px-2 py-1 rounded bg-[#070709] border border-white/15 font-semibold ${statusColorClass(inv.status)}`}
                          >
                            {['Draft', 'Unpaid', 'Pending Verification', 'Paid', 'Overdue', 'Cancelled', 'Refunded'].map((s) => (
                              <option key={s} value={s} className="text-white">{s}</option>
                            ))}
                          </select>
                        </td>
                        <td className="py-3 px-3 text-right font-mono text-white">{formatCurrency(inv.total_cents, inv.currency)}</td>
                        <td className="py-3 pl-3 text-right space-x-2 whitespace-nowrap">
                          <button onClick={() => onOpenInvoice(inv)} className="px-2.5 py-1 rounded border border-white/15 text-zinc-200 hover:bg-white/10">View</button>
                          <button onClick={() => downloadInvoicePdf(inv.id, inv.invoice_number)} className="px-2.5 py-1 rounded border border-white/15 text-zinc-200 hover:bg-white/10">PDF</button>
                          <button
                            onClick={async () => {
                              await apiFetch(`/api/admin/invoices/${inv.id}/resend`, { method: 'POST' });
                              onNotify('success', `Invoice reminder sent to ${inv.customer_email}.`);
                            }}
                            className="px-2.5 py-1 rounded bg-orange-600/20 text-orange-300 border border-orange-500/30"
                          >
                            Resend
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* PAYMENT VERIFICATION QUEUE */}
          {tab === 'payments' && (
            <div className="bg-[#0D0D11] border border-white/10 rounded-2xl p-6 space-y-5">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="font-display text-xl font-bold text-white">Payment Verification &amp; Receipts</h2>
                  <p className="text-xs text-zinc-400 mt-0.5">Verify customer bank transfer receipts before marking invoices Paid.</p>
                </div>
                <a href="/api/admin/export/payments" className="px-3 py-1.5 text-xs border border-white/15 rounded-lg text-zinc-200">Export CSV</a>
              </div>

              <div className="space-y-3">
                {payments.map((p) => (
                  <div key={p.id} className="p-4 rounded-xl bg-[#070709] border border-white/10 flex flex-col md:flex-row md:items-center justify-between gap-4 text-xs">
                    <div className="space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-mono font-bold text-white">{p.payment_number}</span>
                        <span className="text-zinc-600">·</span>
                        <span className="font-mono text-orange-400">{p.invoice_number}</span>
                        <span className="text-zinc-600">·</span>
                        <span className={`font-semibold ${statusColorClass(p.status)}`}>{p.status}</span>
                      </div>
                      <div className="text-zinc-400">
                        {p.customer_code} ({p.customer_name}) · {p.method} · Ref: <span className="font-mono text-zinc-200">{p.transaction_ref || '—'}</span>
                      </div>
                      {p.receipt_id && (
                        <a href={`/api/files/receipts/${p.id}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-orange-400 hover:underline pt-1">
                          Inspect Uploaded Receipt ({p.receipt_filename}) <ExternalLink className="w-3 h-3" />
                        </a>
                      )}
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-base font-bold text-white mr-2">{formatCurrency(p.amount_cents, p.currency)}</span>
                      {p.status === 'Under Review' && (
                        <>
                          <input
                            value={reviewNote[p.id] || ''}
                            onChange={(e) => setReviewNote({ ...reviewNote, [p.id]: e.target.value })}
                            placeholder="Optional verification note"
                            className="px-2.5 py-1.5 bg-[#0D0D11] border border-white/15 rounded-lg text-white"
                          />
                          <button
                            onClick={async () => {
                              await apiFetch(`/api/admin/payments/${p.id}/review`, {
                                method: 'POST',
                                body: JSON.stringify({ decision: 'approve', note: reviewNote[p.id] }),
                              });
                              onNotify('success', `Payment ${p.payment_number} verified and invoice marked Paid.`);
                              loadTabData('payments');
                            }}
                            className="inline-flex items-center gap-1 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg font-semibold"
                          >
                            <Check className="w-3.5 h-3.5" /> Approve
                          </button>
                          <button
                            onClick={async () => {
                              await apiFetch(`/api/admin/payments/${p.id}/review`, {
                                method: 'POST',
                                body: JSON.stringify({ decision: 'reject', note: reviewNote[p.id] || 'Receipt unreadable or unmatched' }),
                              });
                              onNotify('error', `Payment ${p.payment_number} rejected.`);
                              loadTabData('payments');
                            }}
                            className="px-3 py-1.5 border border-rose-500/40 text-rose-300 hover:bg-rose-500/10 rounded-lg font-semibold"
                          >
                            Reject
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* PRODUCT & PACKAGE MANAGEMENT */}
          {tab === 'products' && (
            <div className="space-y-6">
              <div className="bg-[#0D0D11] border border-white/10 rounded-2xl p-6 space-y-4">
                <h2 className="font-display text-lg font-bold text-white">Add Product / Service</h2>
                <form
                  onSubmit={async (e) => {
                    e.preventDefault();
                    await apiFetch('/api/admin/products', {
                      method: 'POST',
                      body: JSON.stringify({
                        category_id: Number(newProd.category_id || catalog.categories[0]?.id),
                        name: newProd.name,
                        tagline: newProd.tagline,
                        description: newProd.description,
                        features: newProd.features.split(',').map((s) => s.trim()).filter(Boolean),
                      }),
                    });
                    setNewProd({ category_id: '', name: '', tagline: '', description: '', features: '' });
                    onCatalogChanged();
                    loadTabData('products');
                    onNotify('success', 'Product created.');
                  }}
                  className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs"
                >
                  <select value={newProd.category_id || catalog.categories[0]?.id || ''} onChange={(e) => setNewProd({ ...newProd, category_id: e.target.value })} className="px-3 py-2 bg-[#070709] border border-white/15 rounded-lg text-white">
                    {catalog.categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                  <input required placeholder="Product Name" value={newProd.name} onChange={(e) => setNewProd({ ...newProd, name: e.target.value })} className="px-3 py-2 bg-[#070709] border border-white/15 rounded-lg text-white" />
                  <input placeholder="Tagline" value={newProd.tagline} onChange={(e) => setNewProd({ ...newProd, tagline: e.target.value })} className="px-3 py-2 bg-[#070709] border border-white/15 rounded-lg text-white" />
                  <input placeholder="Features (comma-separated)" value={newProd.features} onChange={(e) => setNewProd({ ...newProd, features: e.target.value })} className="px-3 py-2 bg-[#070709] border border-white/15 rounded-lg text-white" />
                  <input placeholder="Description" value={newProd.description} onChange={(e) => setNewProd({ ...newProd, description: e.target.value })} className="md:col-span-2 px-3 py-2 bg-[#070709] border border-white/15 rounded-lg text-white" />
                  <button type="submit" className="md:col-span-2 py-2 bg-orange-600 text-white rounded-lg font-semibold">Add Product</button>
                </form>

                <h3 className="font-display text-base font-bold text-white pt-4 border-t border-white/10">Add Pricing Package</h3>
                <form
                  onSubmit={async (e) => {
                    e.preventDefault();
                    await apiFetch('/api/admin/packages', {
                      method: 'POST',
                      body: JSON.stringify({
                        product_id: Number(newPkg.product_id || catalog.products[0]?.id),
                        name: newPkg.name,
                        billing_cycle: newPkg.billing_cycle,
                        duration_days: Number(newPkg.duration_days),
                        price_cents: Math.round(Number(newPkg.price_dollars) * 100),
                      }),
                    });
                    setNewPkg({ ...newPkg, name: '' });
                    onCatalogChanged();
                    loadTabData('products');
                    onNotify('success', 'Package added.');
                  }}
                  className="grid grid-cols-1 md:grid-cols-5 gap-2 text-xs"
                >
                  <select value={newPkg.product_id || catalog.products[0]?.id || ''} onChange={(e) => setNewPkg({ ...newPkg, product_id: e.target.value })} className="px-2 py-2 bg-[#070709] border border-white/15 rounded-lg text-white">
                    {catalog.products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                  <input required placeholder="Tier Name" value={newPkg.name} onChange={(e) => setNewPkg({ ...newPkg, name: e.target.value })} className="px-2 py-2 bg-[#070709] border border-white/15 rounded-lg text-white" />
                  <select value={newPkg.billing_cycle} onChange={(e) => setNewPkg({ ...newPkg, billing_cycle: e.target.value })} className="px-2 py-2 bg-[#070709] border border-white/15 rounded-lg text-white">
                    <option value="monthly">Monthly</option>
                    <option value="quarterly">Quarterly</option>
                    <option value="annual">Annual</option>
                    <option value="one_time">One-Time</option>
                  </select>
                  <input type="number" required placeholder="Price USD" value={newPkg.price_dollars} onChange={(e) => setNewPkg({ ...newPkg, price_dollars: e.target.value })} className="px-2 py-2 bg-[#070709] border border-white/15 rounded-lg text-white" />
                  <button type="submit" className="px-3 py-2 bg-white text-black font-semibold rounded-lg">Add Tier</button>
                </form>
              </div>

              <div className="space-y-3">
                {catalog.products.map((p) => (
                  <div key={p.id} className="bg-[#0D0D11] border border-white/10 rounded-xl p-5 space-y-3 text-xs">
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="font-display text-base font-bold text-white">{p.name}</div>
                        <div className="text-zinc-400">{p.tagline}</div>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={async () => {
                            await apiFetch(`/api/admin/products/${p.id}`, { method: 'PATCH', body: JSON.stringify({ is_active: !p.is_active }) });
                            onCatalogChanged();
                            loadTabData('products');
                          }}
                          className={`px-2.5 py-1 rounded border ${p.is_active ? 'border-emerald-500/30 text-emerald-400' : 'border-zinc-700 text-zinc-500'}`}
                        >
                          {p.is_active ? 'Active' : 'Hidden'}
                        </button>
                        <button
                          onClick={async () => {
                            await apiFetch(`/api/admin/products/${p.id}`, { method: 'DELETE' });
                            onCatalogChanged();
                            loadTabData('products');
                          }}
                          className="p-1.5 text-zinc-500 hover:text-rose-400"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-2 pt-2 border-t border-white/5">
                      {p.packages.map((pkg: any) => (
                        <div key={pkg.id} className="p-2.5 rounded-lg bg-[#070709] border border-white/10 flex justify-between items-center">
                          <div>
                            <div className="font-semibold text-zinc-200">{pkg.name}</div>
                            <div className="font-mono text-orange-400">{formatCurrency(pkg.price_cents)} / {pkg.billing_cycle}</div>
                          </div>
                          <button
                            onClick={async () => {
                              await apiFetch(`/api/admin/packages/${pkg.id}`, { method: 'DELETE' });
                              onCatalogChanged();
                              loadTabData('products');
                            }}
                            className="text-zinc-500 hover:text-rose-400"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* COUPONS */}
          {tab === 'coupons' && (
            <div className="bg-[#0D0D11] border border-white/10 rounded-2xl p-6 space-y-5">
              <h2 className="font-display text-xl font-bold text-white">Discount &amp; Promo Code Management</h2>
              <form
                onSubmit={async (e) => {
                  e.preventDefault();
                  try {
                    await apiFetch('/api/admin/coupons', {
                      method: 'POST',
                      body: JSON.stringify({
                        code: newCoupon.code,
                        discount_type: newCoupon.discount_type,
                        discount_value: newCoupon.discount_type === 'fixed' ? Number(newCoupon.discount_value) * 100 : Number(newCoupon.discount_value),
                        min_purchase_cents: Number(newCoupon.min_purchase_dollars) * 100,
                        max_uses: Number(newCoupon.max_uses),
                        expires_at: newCoupon.expires_at ? `${newCoupon.expires_at}T23:59:59Z` : null,
                      }),
                    });
                    setNewCoupon({ ...newCoupon, code: '' });
                    loadTabData('coupons');
                    onNotify('success', 'Promo code created.');
                  } catch (err: any) {
                    onNotify('error', err.message);
                  }
                }}
                className="grid grid-cols-2 md:grid-cols-6 gap-2 text-xs"
              >
                <input required placeholder="CODE20" value={newCoupon.code} onChange={(e) => setNewCoupon({ ...newCoupon, code: e.target.value.toUpperCase() })} className="px-3 py-2 font-mono bg-[#070709] border border-white/15 rounded-lg text-white" />
                <select value={newCoupon.discount_type} onChange={(e) => setNewCoupon({ ...newCoupon, discount_type: e.target.value })} className="px-2 py-2 bg-[#070709] border border-white/15 rounded-lg text-white">
                  <option value="percentage">% Percent</option>
                  <option value="fixed">$ Fixed USD</option>
                </select>
                <input type="number" required min={1} placeholder="Value" value={newCoupon.discount_value} onChange={(e) => setNewCoupon({ ...newCoupon, discount_value: Number(e.target.value) })} className="px-2 py-2 bg-[#070709] border border-white/15 rounded-lg text-white" />
                <input type="number" min={0} placeholder="Min $ USD" value={newCoupon.min_purchase_dollars} onChange={(e) => setNewCoupon({ ...newCoupon, min_purchase_dollars: Number(e.target.value) })} className="px-2 py-2 bg-[#070709] border border-white/15 rounded-lg text-white" />
                <input type="date" value={newCoupon.expires_at} onChange={(e) => setNewCoupon({ ...newCoupon, expires_at: e.target.value })} className="px-2 py-2 bg-[#070709] border border-white/15 rounded-lg text-white" />
                <button type="submit" className="px-3 py-2 bg-orange-600 text-white rounded-lg font-semibold">Create</button>
              </form>

              <div className="overflow-x-auto text-xs">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-white/10 text-zinc-500 uppercase">
                      <th className="py-2.5 pr-3">Code</th>
                      <th className="py-2.5 px-3">Discount</th>
                      <th className="py-2.5 px-3">Usage</th>
                      <th className="py-2.5 px-3">Expires</th>
                      <th className="py-2.5 pl-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {coupons.map((c) => (
                      <tr key={c.id}>
                        <td className="py-3 pr-3 font-mono font-bold text-orange-400">{c.code}</td>
                        <td className="py-3 px-3 text-white">{c.discount_type === 'percentage' ? `${c.discount_value}%` : formatCurrency(c.discount_value)}</td>
                        <td className="py-3 px-3 font-mono text-zinc-400">{c.used_count} / {c.max_uses ?? '∞'}</td>
                        <td className="py-3 px-3 font-mono text-zinc-400">{formatDate(c.expires_at)}</td>
                        <td className="py-3 pl-3 text-right space-x-2">
                          <button
                            onClick={async () => {
                              await apiFetch(`/api/admin/coupons/${c.id}`, { method: 'PATCH', body: JSON.stringify({ is_active: !c.is_active }) });
                              loadTabData('coupons');
                            }}
                            className={`px-2 py-1 rounded border ${c.is_active ? 'border-emerald-500/30 text-emerald-400' : 'border-zinc-700 text-zinc-500'}`}
                          >
                            {c.is_active ? 'Active' : 'Paused'}
                          </button>
                          <button
                            onClick={async () => {
                              await apiFetch(`/api/admin/coupons/${c.id}`, { method: 'DELETE' });
                              loadTabData('coupons');
                            }}
                            className="text-zinc-500 hover:text-rose-400"
                          >
                            Delete
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* SUPPORT DESK */}
          {tab === 'tickets' && (
            <div className="bg-[#0D0D11] border border-white/10 rounded-2xl p-6 space-y-5">
              <h2 className="font-display text-xl font-bold text-white">Customer Support Ticket Desk</h2>
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
                <div className="lg:col-span-5 space-y-2">
                  {tickets.map((t) => (
                    <button
                      key={t.id}
                      onClick={async () => setActiveTicket(await apiFetch(`/api/admin/tickets/${t.id}`))}
                      className={`w-full text-left p-3.5 rounded-xl border text-xs ${
                        activeTicket?.ticket.id === t.id ? 'border-orange-500/50 bg-orange-500/10' : 'border-white/10 bg-[#070709]'
                      }`}
                    >
                      <div className="flex justify-between mb-1">
                        <span className="font-mono text-orange-400">{t.ticket_number} · {t.customer_code}</span>
                        <span className={statusColorClass(t.status)}>{t.status}</span>
                      </div>
                      <div className="font-semibold text-white truncate">{t.subject}</div>
                      <div className="text-zinc-500 mt-0.5">{t.priority} Priority · {t.customer_name}</div>
                    </button>
                  ))}
                </div>

                <div className="lg:col-span-7">
                  {activeTicket ? (
                    <div className="p-5 rounded-xl bg-[#070709] border border-white/10 space-y-4">
                      <div className="flex justify-between items-start border-b border-white/10 pb-3">
                        <div>
                          <div className="font-mono text-xs text-orange-400">{activeTicket.ticket.ticket_number}</div>
                          <div className="font-display font-bold text-white">{activeTicket.ticket.subject}</div>
                        </div>
                        <select
                          value={activeTicket.ticket.status}
                          onChange={async (e) => {
                            await apiFetch(`/api/admin/tickets/${activeTicket.ticket.id}`, { method: 'PATCH', body: JSON.stringify({ status: e.target.value }) });
                            setActiveTicket(await apiFetch(`/api/admin/tickets/${activeTicket.ticket.id}`));
                            loadTabData('tickets');
                          }}
                          className="px-2 py-1 text-xs bg-[#0D0D11] border border-white/15 rounded text-white"
                        >
                          {['Open', 'In Progress', 'Waiting for Customer', 'Resolved', 'Closed'].map((s) => <option key={s} value={s}>{s}</option>)}
                        </select>
                      </div>

                      <div className="space-y-3 max-h-72 overflow-y-auto">
                        {activeTicket.messages.map((m) => (
                          <div key={m.id} className={`p-3 rounded-xl text-xs ${m.sender_role === 'customer' ? 'bg-[#121217] border border-white/10' : 'bg-orange-950/30 border border-orange-500/30'}`}>
                            <div className="flex justify-between mb-1">
                              <span className="font-semibold text-white">{m.sender_name} ({m.sender_role})</span>
                              <span className="font-mono text-zinc-500">{formatDateTime(m.created_at)}</span>
                            </div>
                            <p className="text-zinc-300 whitespace-pre-wrap">{m.message}</p>
                            {m.attachment_filename && (
                              <a href={`/api/files/tickets/${m.id}`} className="inline-block mt-1.5 text-orange-400 hover:underline">
                                Attachment: {m.attachment_original_name}
                              </a>
                            )}
                          </div>
                        ))}
                      </div>

                      <form
                        onSubmit={async (e) => {
                          e.preventDefault();
                          await apiFetch(`/api/admin/tickets/${activeTicket.ticket.id}/reply`, {
                            method: 'POST',
                            body: JSON.stringify({ message: adminReply, status: adminReplyStatus }),
                          });
                          setAdminReply('');
                          setActiveTicket(await apiFetch(`/api/admin/tickets/${activeTicket.ticket.id}`));
                          loadTabData('tickets');
                          onNotify('success', 'Admin reply sent & customer notified.');
                        }}
                        className="space-y-2 pt-3 border-t border-white/10"
                      >
                        <textarea required rows={3} value={adminReply} onChange={(e) => setAdminReply(e.target.value)} placeholder="Respond to customer..." className="w-full px-3 py-2 text-xs bg-[#0D0D11] border border-white/15 rounded-lg text-white" />
                        <div className="flex justify-between items-center">
                          <select value={adminReplyStatus} onChange={(e) => setAdminReplyStatus(e.target.value)} className="px-2 py-1.5 text-xs bg-[#0D0D11] border border-white/15 rounded text-white">
                            <option value="Waiting for Customer">Set: Waiting for Customer</option>
                            <option value="In Progress">Set: In Progress</option>
                            <option value="Resolved">Set: Resolved</option>
                          </select>
                          <button type="submit" className="inline-flex items-center gap-1.5 px-4 py-1.5 text-xs font-semibold bg-orange-600 text-white rounded-lg">
                            <Send className="w-3.5 h-3.5" /> Send Admin Reply
                          </button>
                        </div>
                      </form>
                    </div>
                  ) : (
                    <div className="h-60 flex items-center justify-center rounded-xl border border-dashed border-white/10 text-xs text-zinc-500">
                      Select a support ticket to view and respond.
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* SYSTEM SETTINGS, AUDIT LOGS, EMAIL OUTBOX */}
          {tab === 'system' && (
            <div className="space-y-6">
              <form
                onSubmit={async (e) => {
                  e.preventDefault();
                  await apiFetch('/api/admin/settings', { method: 'PATCH', body: JSON.stringify({ settings: sysSettings }) });
                  onCatalogChanged();
                  onNotify('success', 'System & billing settings saved.');
                }}
                className="bg-[#0D0D11] border border-white/10 rounded-2xl p-6 space-y-4 text-xs"
              >
                <h2 className="font-display text-lg font-bold text-white">Organization, Tax, Bank &amp; Maintenance Settings</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-zinc-400 mb-1">Organization Name</label>
                    <input value={sysSettings.company_name || ''} onChange={(e) => setSysSettings({ ...sysSettings, company_name: e.target.value })} className="w-full px-3 py-2 bg-[#070709] border border-white/15 rounded-lg text-white" />
                  </div>
                  <div>
                    <label className="block text-zinc-400 mb-1">Billing Email</label>
                    <input value={sysSettings.company_email || ''} onChange={(e) => setSysSettings({ ...sysSettings, company_email: e.target.value })} className="w-full px-3 py-2 bg-[#070709] border border-white/15 rounded-lg text-white" />
                  </div>
                  <div>
                    <label className="block text-zinc-400 mb-1">Tax Rate (basis points, e.g. 850 = 8.5%)</label>
                    <input value={sysSettings.tax_rate_bps || '850'} onChange={(e) => setSysSettings({ ...sysSettings, tax_rate_bps: e.target.value })} className="w-full px-3 py-2 font-mono bg-[#070709] border border-white/15 rounded-lg text-white" />
                  </div>
                  <div>
                    <label className="block text-zinc-400 mb-1">Bank Name</label>
                    <input value={sysSettings.bank_name || ''} onChange={(e) => setSysSettings({ ...sysSettings, bank_name: e.target.value })} className="w-full px-3 py-2 bg-[#070709] border border-white/15 rounded-lg text-white" />
                  </div>
                  <div>
                    <label className="block text-zinc-400 mb-1">Bank Account Number</label>
                    <input value={sysSettings.bank_account_number || ''} onChange={(e) => setSysSettings({ ...sysSettings, bank_account_number: e.target.value })} className="w-full px-3 py-2 font-mono bg-[#070709] border border-white/15 rounded-lg text-white" />
                  </div>
                  <div>
                    <label className="block text-zinc-400 mb-1">Routing / SWIFT</label>
                    <input value={sysSettings.bank_routing_swift || ''} onChange={(e) => setSysSettings({ ...sysSettings, bank_routing_swift: e.target.value })} className="w-full px-3 py-2 font-mono bg-[#070709] border border-white/15 rounded-lg text-white" />
                  </div>
                  <div className="md:col-span-2">
                    <label className="block text-zinc-400 mb-1">Maintenance Notification Banner (leave blank to hide)</label>
                    <input value={sysSettings.maintenance_banner || ''} onChange={(e) => setSysSettings({ ...sysSettings, maintenance_banner: e.target.value })} placeholder="e.g. Scheduled database maintenance Sunday 02:00 UTC" className="w-full px-3 py-2 bg-[#070709] border border-white/15 rounded-lg text-white" />
                  </div>
                </div>
                <button type="submit" className="px-4 py-2 bg-orange-600 text-white rounded-lg font-semibold">Save Settings</button>
              </form>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="bg-[#0D0D11] border border-white/10 rounded-2xl p-6 space-y-3">
                  <div className="flex items-center gap-2 font-display font-bold text-white text-sm">
                    <Activity className="w-4 h-4 text-orange-400" /> System Audit Logs
                  </div>
                  <div className="max-h-72 overflow-y-auto space-y-2 text-xs">
                    {auditLogs.map((l) => (
                      <div key={l.id} className="py-2 border-b border-white/5 flex justify-between gap-2">
                        <div>
                          <div className="text-zinc-200 font-medium">{l.action}</div>
                          <div className="font-mono text-zinc-500">{l.entity_type}:{l.entity_id} · {l.actor_email || 'system'}</div>
                        </div>
                        <span className="font-mono text-zinc-500 shrink-0">{formatDateTime(l.created_at)}</span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="bg-[#0D0D11] border border-white/10 rounded-2xl p-6 space-y-3">
                  <div className="flex items-center gap-2 font-display font-bold text-white text-sm">
                    <Mail className="w-4 h-4 text-orange-400" /> Email Outbox (Resend Delivery Log)
                  </div>
                  <div className="max-h-72 overflow-y-auto space-y-2 text-xs">
                    {emailLogs.map((e) => (
                      <div key={e.id} className="py-2 border-b border-white/5 flex justify-between gap-2">
                        <div className="min-w-0">
                          <div className="text-zinc-200 truncate">{e.subject}</div>
                          <div className="font-mono text-zinc-500 truncate">{e.recipient_email} · {e.template_name}</div>
                        </div>
                        <span className={`font-mono shrink-0 ${e.status === 'sent' ? 'text-emerald-400' : 'text-orange-400'}`}>{e.status}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
