import React, { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  Activity,
  Bell,
  CreditCard,
  Download,
  ExternalLink,
  FileText,
  KeyRound,
  LayoutDashboard,
  LifeBuoy,
  LogOut,
  MapPin,
  Package,
  Plus,
  RefreshCw,
  Search,
  Send,
  Server,
  Settings,
  Shield,
  ShoppingBag,
  Star,
  Trash2,
  Upload,
} from 'lucide-react';
import { Invoice, Order, UserProfile } from '../types';
import {
  apiFetch,
  downloadInvoicePdf,
  evaluatePasswordStrength,
  formatAuditAction,
  formatAuditEntity,
  formatCurrency,
  formatDate,
  formatDateTime,
  formatFailureReason,
  statusColorClass,
} from '../lib/api';
import { PasswordStrengthField } from './PasswordStrengthField';
import { Tilt3DCard } from './Tilt3DCard';

type CustomerTab = 'overview' | 'orders' | 'invoices' | 'services' | 'payments' | 'support' | 'settings';

const ORDER_STEPS = [
  'Order Submitted',
  'Awaiting Payment',
  'Payment Under Review',
  'Payment Confirmed',
  'Processing',
  'In Progress',
  'Completed',
];

interface CustomerDashboardProps {
  user: UserProfile;
  settings: Record<string, string>;
  onUserUpdated: (user: UserProfile) => void;
  onOpenInvoice: (invoice: Invoice) => void;
  onNavigateToOrder: () => void;
  onLogout: () => void;
  onNotify: (type: 'success' | 'error', msg: string) => void;
}

export function CustomerDashboard({
  user,
  onUserUpdated,
  onOpenInvoice,
  onNavigateToOrder,
  onLogout,
  onNotify,
}: CustomerDashboardProps) {
  const [tab, setTab] = useState<CustomerTab>('overview');
  const [loading, setLoading] = useState(true);

  const [overview, setOverview] = useState<any>(null);
  const [orders, setOrders] = useState<Order[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [services, setServices] = useState<any[]>([]);
  const [payments, setPayments] = useState<any[]>([]);
  const [tickets, setTickets] = useState<any[]>([]);
  const [notifications, setNotifications] = useState<any[]>([]);
  const [addresses, setAddresses] = useState<any[]>([]);
  const [sessions, setSessions] = useState<any[]>([]);
  const [loginHistory, setLoginHistory] = useState<any[]>([]);

  const [orderSearch, setOrderSearch] = useState('');
  const [orderFilter, setOrderFilter] = useState('ALL');
  const [invoiceFilter, setInvoiceFilter] = useState('ALL');
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);

  const [refundOrder, setRefundOrder] = useState<Order | null>(null);
  const [refundReason, setRefundReason] = useState('');
  const [feedbackOrder, setFeedbackOrder] = useState<Order | null>(null);
  const [rating, setRating] = useState(5);
  const [feedbackComment, setFeedbackComment] = useState('');

  const [showNewTicket, setShowNewTicket] = useState(false);
  const [tSubject, setTSubject] = useState('');
  const [tCategory, setTCategory] = useState('Technical Support');
  const [tPriority, setTPriority] = useState('Normal');
  const [tOrderId, setTOrderId] = useState('');
  const [tMessage, setTMessage] = useState('');
  const [tAttachment, setTAttachment] = useState<File | null>(null);
  const [activeTicket, setActiveTicket] = useState<{ ticket: any; messages: any[] } | null>(null);
  const [replyText, setReplyText] = useState('');
  const [replyFile, setReplyFile] = useState<File | null>(null);

  const [profileForm, setProfileForm] = useState({
    full_name: user.full_name,
    mobile: user.mobile,
    country: user.country,
    city: user.city,
    billing_address: user.billing_address,
    postal_code: user.postal_code,
    company_name: user.company_name,
    discord_username: user.discord_username,
    notify_email: user.notify_email,
    notify_discord: user.notify_discord,
  });
  const [verifyCode, setVerifyCode] = useState('');
  const [pwForm, setPwForm] = useState({ current_password: '', new_password: '' });
  const [totpSetup, setTotpSetup] = useState<{ secret: string; otpauth_url: string } | null>(null);
  const [totpVerifyCode, setTotpVerifyCode] = useState('');
  const [recoveryCodes, setRecoveryCodes] = useState<string[] | null>(null);
  const [regen2faPw, setRegen2faPw] = useState('');
  const [disable2faPw, setDisable2faPw] = useState('');
  const [newAddress, setNewAddress] = useState({
    label: '',
    full_name: user.full_name,
    company_name: '',
    address_line: '',
    city: '',
    postal_code: '',
    country: '',
  });

  const loadAll = async () => {
    setLoading(true);
    try {
      const [ov, ord, inv, svc, pay, tkt, notif] = await Promise.all([
        apiFetch('/api/customer/overview'),
        apiFetch('/api/orders'),
        apiFetch('/api/invoices'),
        apiFetch('/api/services'),
        apiFetch('/api/payments'),
        apiFetch('/api/tickets'),
        apiFetch('/api/notifications'),
      ]);
      setOverview(ov);
      setOrders(ord.orders || []);
      setInvoices(inv.invoices || []);
      setServices(svc.services || []);
      setPayments(pay.payments || []);
      setTickets(tkt.tickets || []);
      setNotifications(notif.notifications || []);
    } catch (err: any) {
      onNotify('error', err.message);
    } finally {
      setLoading(false);
    }
  };

  const loadSettingsData = async () => {
    try {
      const [prof, sess, hist] = await Promise.all([
        apiFetch('/api/profile'),
        apiFetch('/api/auth/sessions'),
        apiFetch('/api/auth/login-history'),
      ]);
      if (prof.user) onUserUpdated(prof.user);
      setAddresses(prof.addresses || []);
      setSessions(sess.sessions || []);
      setLoginHistory(hist.history || []);
    } catch (err: any) {
      onNotify('error', err.message);
    }
  };

  useEffect(() => {
    loadAll();
  }, []);

  useEffect(() => {
    if (tab === 'settings') loadSettingsData();
  }, [tab]);

  const handleOpenTicket = async (ticketId: number) => {
    try {
      const data = await apiFetch(`/api/tickets/${ticketId}`);
      setActiveTicket(data);
    } catch (err: any) {
      onNotify('error', err.message);
    }
  };

  const handleCreateTicket = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const fd = new FormData();
      fd.append('subject', tSubject);
      fd.append('category', tCategory);
      fd.append('priority', tPriority);
      fd.append('message', tMessage);
      if (tOrderId) fd.append('order_id', tOrderId);
      if (tAttachment) fd.append('attachment', tAttachment);
      await apiFetch('/api/tickets', { method: 'POST', body: fd });
      onNotify('success', 'Support ticket opened.');
      setShowNewTicket(false);
      setTSubject('');
      setTMessage('');
      setTAttachment(null);
      await loadAll();
    } catch (err: any) {
      onNotify('error', err.message);
    }
  };

  const handleReplyTicket = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeTicket) return;
    try {
      const fd = new FormData();
      fd.append('message', replyText);
      if (replyFile) fd.append('attachment', replyFile);
      await apiFetch(`/api/tickets/${activeTicket.ticket.id}/reply`, { method: 'POST', body: fd });
      setReplyText('');
      setReplyFile(null);
      await handleOpenTicket(activeTicket.ticket.id);
      await loadAll();
    } catch (err: any) {
      onNotify('error', err.message);
    }
  };

  const handleCancelOrder = async (orderId: number) => {
    try {
      await apiFetch(`/api/orders/${orderId}/cancel`, { method: 'POST', body: JSON.stringify({ reason: 'Cancelled by customer' }) });
      onNotify('success', 'Order cancelled.');
      setSelectedOrder(null);
      await loadAll();
    } catch (err: any) {
      onNotify('error', err.message);
    }
  };

  const handleRenewService = async (serviceId: number) => {
    try {
      const res = await apiFetch<{ invoice_id: number; invoice_number: string }>(`/api/services/${serviceId}/renew`, { method: 'POST' });
      onNotify('success', `Renewal invoice ${res.invoice_number} created.`);
      await loadAll();
      const invData = await apiFetch<{ invoice: Invoice }>(`/api/invoices/${res.invoice_id}`);
      onOpenInvoice(invData.invoice);
    } catch (err: any) {
      onNotify('error', err.message);
    }
  };

  const handleToggleAutoRenew = async (serviceId: number, current: boolean) => {
    try {
      await apiFetch(`/api/services/${serviceId}`, { method: 'PATCH', body: JSON.stringify({ auto_renew: !current }) });
      await loadAll();
    } catch (err: any) {
      onNotify('error', err.message);
    }
  };

  const filteredOrders = orders.filter((o) => {
    const matchesFilter = orderFilter === 'ALL' || o.status === orderFilter;
    const matchesSearch =
      !orderSearch.trim() ||
      o.order_number.toLowerCase().includes(orderSearch.toLowerCase()) ||
      o.items.some((i) => i.product_name.toLowerCase().includes(orderSearch.toLowerCase()));
    return matchesFilter && matchesSearch;
  });

  const filteredInvoices = invoices.filter((inv) => {
    if (invoiceFilter === 'ALL') return true;
    return inv.status === invoiceFilter;
  });

  const navItems: Array<{ id: CustomerTab; label: string; icon: React.ComponentType<any> }> = [
    { id: 'overview', label: 'Overview', icon: LayoutDashboard },
    { id: 'orders', label: 'My Orders', icon: ShoppingBag },
    { id: 'invoices', label: 'My Invoices', icon: FileText },
    { id: 'services', label: 'My Services', icon: Server },
    { id: 'payments', label: 'Payment History', icon: CreditCard },
    { id: 'support', label: 'Support', icon: LifeBuoy },
    { id: 'settings', label: 'Account Settings', icon: Settings },
  ];

  const unreadNotifs = notifications.filter((n) => !n.is_read).length;

  return (
    <div className="max-w-7xl mx-auto px-4 md:px-6 py-8">
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        <aside className="lg:col-span-3 bg-[#0D0D11] border border-white/10 rounded-2xl p-4 space-y-4 lg:sticky lg:top-24">
          <div className="px-3 py-3 border-b border-white/10">
            <div className="font-mono text-xs text-orange-400">{user.customer_code}</div>
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

          <div className="pt-3 border-t border-white/10 space-y-2">
            <button
              onClick={onNavigateToOrder}
              className="w-full flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl border border-orange-500/40 bg-orange-500/10 hover:bg-orange-500/20 text-orange-300 text-xs font-semibold transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
              New Service Order
            </button>
            <button
              onClick={onLogout}
              className="w-full flex items-center justify-center gap-2 py-2 px-3 rounded-xl text-xs text-zinc-400 hover:text-white hover:bg-white/5 transition-colors"
            >
              <LogOut className="w-3.5 h-3.5" />
              Sign Out
            </button>
          </div>
        </aside>

        <main className="lg:col-span-9 space-y-6 min-w-0">
          <AnimatePresence mode="wait">
          <motion.div
            key={tab}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.22 }}
            className="space-y-6"
          >
          {tab === 'overview' && (
            <div className="space-y-6">
              <div className="flex flex-wrap items-center justify-between gap-4 bg-[#0D0D11] border border-white/10 rounded-2xl p-6 hx-card-3d">
                <div>
                  <div className="text-xs text-zinc-400">
                    Customer Portal · <span className="font-mono text-orange-400">{user.customer_code}</span>
                  </div>
                  <h1 className="font-display text-2xl md:text-3xl font-bold text-white mt-1">
                    Welcome back, {user.full_name}
                  </h1>
                </div>
                <button
                  onClick={loadAll}
                  className="inline-flex items-center gap-2 px-3.5 py-2 text-xs font-medium rounded-lg border border-white/15 bg-white/5 hover:bg-white/10 text-zinc-200 whitespace-nowrap transition-colors"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
                  Refresh Data
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
                <Tilt3DCard maxTilt={7} className="bg-[#0D0D11] border border-white/10 rounded-xl p-5">
                  <div className="text-xs text-zinc-400">Total Orders</div>
                  <div className="font-display text-3xl font-bold text-white tabular-nums mt-2">
                    {overview?.stats?.total_orders ?? 0}
                  </div>
                </Tilt3DCard>
                <Tilt3DCard maxTilt={7} className="bg-[#0D0D11] border border-white/10 rounded-xl p-5">
                  <div className="text-xs text-zinc-400">Active Services</div>
                  <div className="font-display text-3xl font-bold text-emerald-400 tabular-nums mt-2">
                    {overview?.stats?.active_services ?? 0}
                  </div>
                </Tilt3DCard>
                <Tilt3DCard maxTilt={7} className="bg-[#0D0D11] border border-white/10 rounded-xl p-5">
                  <div className="text-xs text-zinc-400">Pending Payments</div>
                  <div className="font-display text-3xl font-bold text-orange-400 tabular-nums mt-2">
                    {formatCurrency(overview?.stats?.pending_payments_cents ?? 0)}
                  </div>
                </Tilt3DCard>
                <Tilt3DCard
                  maxTilt={7}
                  glowColor="rgba(255, 255, 255, 0.2)"
                  className="hx-featured-card rounded-xl p-5 text-white border border-orange-400/30"
                >
                  <div className="text-xs text-orange-100/85">Total Verified Spending</div>
                  <div className="font-display text-3xl font-bold tabular-nums mt-2">
                    {formatCurrency(overview?.stats?.total_spending_cents ?? 0)}
                  </div>
                </Tilt3DCard>
              </div>

              <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
                <div className="bg-[#0D0D11] border border-white/10 rounded-2xl p-6 space-y-4">
                  <div className="flex items-center justify-between pb-3 border-b border-white/10">
                    <div className="flex items-center gap-2 font-display font-semibold text-white">
                      <Bell className="w-4 h-4 text-orange-400" />
                      Notification Center ({unreadNotifs} unread)
                    </div>
                    {unreadNotifs > 0 && (
                      <button
                        onClick={async () => {
                          await apiFetch('/api/notifications/read', { method: 'POST', body: JSON.stringify({}) });
                          loadAll();
                        }}
                        className="text-xs text-orange-400 hover:text-orange-300"
                      >
                        Mark all read
                      </button>
                    )}
                  </div>
                  {notifications.length === 0 ? (
                    <p className="text-xs text-zinc-500 py-4">No notifications yet.</p>
                  ) : (
                    <div className="space-y-3 max-h-72 overflow-y-auto pr-1">
                      {notifications.slice(0, 8).map((n) => (
                        <div key={n.id} className={`p-3 rounded-xl border ${n.is_read ? 'border-white/5 bg-white/[0.02]' : 'border-orange-500/30 bg-orange-500/5'}`}>
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-xs font-semibold text-white">{n.title}</span>
                            <span className="text-[11px] font-mono text-zinc-500">{formatDate(n.created_at)}</span>
                          </div>
                          <p className="text-xs text-zinc-400 mt-1">{n.message}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="bg-[#0D0D11] border border-white/10 rounded-2xl p-6 space-y-4">
                  <div className="flex items-center gap-2 pb-3 border-b border-white/10 font-display font-semibold text-white">
                    <Activity className="w-4 h-4 text-orange-400" />
                    Recent Account Activity
                  </div>
                  <div className="space-y-3 max-h-72 overflow-y-auto pr-1">
                    {(overview?.recent_activities || []).length === 0 ? (
                      <p className="text-xs text-zinc-500 py-4">No recorded activities yet.</p>
                    ) : (
                      (overview?.recent_activities || []).map((act: any) => (
                        <div key={act.id} className="flex items-start justify-between gap-3 py-2 border-b border-white/5 last:border-0 text-xs">
                          <div>
                            <div className="text-zinc-200 font-medium">{formatAuditAction(act.action)}</div>
                            <div className="text-zinc-500 mt-0.5">{formatAuditEntity(act.entity_type, act.entity_id)}</div>
                          </div>
                          <div className="text-zinc-500 font-mono whitespace-nowrap">{formatDateTime(act.created_at)}</div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          {tab === 'orders' && (
            <div className="bg-[#0D0D11] border border-white/10 rounded-2xl p-6 space-y-6">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                  <h2 className="font-display text-xl font-bold text-white">My Orders &amp; Fulfillment Tracker</h2>
                  <p className="text-xs text-zinc-400 mt-0.5">Track real-time order status updates, invoices, and refunds.</p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <div className="relative">
                    <Search className="w-3.5 h-3.5 text-zinc-500 absolute left-3 top-2.5" />
                    <input
                      value={orderSearch}
                      onChange={(e) => setOrderSearch(e.target.value)}
                      placeholder="Search order ID or service..."
                      className="pl-8 pr-3 py-1.5 text-xs bg-[#070709] border border-white/15 rounded-lg text-white focus:outline-none focus:border-orange-500"
                    />
                  </div>
                  <select
                    value={orderFilter}
                    onChange={(e) => setOrderFilter(e.target.value)}
                    className="px-3 py-1.5 text-xs bg-[#070709] border border-white/15 rounded-lg text-white"
                  >
                    <option value="ALL">All Statuses</option>
                    {ORDER_STEPS.concat(['Cancelled', 'Refunded']).map((st) => (
                      <option key={st} value={st}>{st}</option>
                    ))}
                  </select>
                </div>
              </div>

              {filteredOrders.length === 0 ? (
                <div className="py-12 text-center space-y-3 border border-dashed border-white/10 rounded-xl">
                  <Package className="w-8 h-8 text-zinc-600 mx-auto" />
                  <p className="text-sm text-zinc-400">No orders found matching your filter.</p>
                  <button onClick={onNavigateToOrder} className="px-4 py-2 text-xs font-semibold bg-orange-600 hover:bg-orange-500 text-white rounded-lg">
                    Place New Order
                  </button>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse text-sm">
                    <thead>
                      <tr className="border-b border-white/10 text-[11px] text-zinc-500 uppercase tracking-wider">
                        <th className="py-3 pr-4">Order ID</th>
                        <th className="py-3 px-3">Service</th>
                        <th className="py-3 px-3">Status</th>
                        <th className="py-3 px-3">Date</th>
                        <th className="py-3 px-3 text-right">Amount</th>
                        <th className="py-3 pl-3 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5">
                      {filteredOrders.map((ord) => (
                        <tr key={ord.id} className="hover:bg-white/[0.02]">
                          <td className="py-3.5 pr-4 font-mono text-xs text-white whitespace-nowrap">{ord.order_number}</td>
                          <td className="py-3.5 px-3 text-zinc-300">
                            <div>{ord.items[0]?.product_name || 'Order Item'}</div>
                            <div className="text-xs text-zinc-500">{ord.items[0]?.package_name}</div>
                          </td>
                          <td className={`py-3.5 px-3 text-xs font-medium whitespace-nowrap ${statusColorClass(ord.status)}`}>{ord.status}</td>
                          <td className="py-3.5 px-3 text-xs text-zinc-400 font-mono whitespace-nowrap">{formatDate(ord.created_at)}</td>
                          <td className="py-3.5 px-3 text-right font-mono tabular-nums text-white whitespace-nowrap">
                            {formatCurrency(ord.total_cents, ord.currency)}
                          </td>
                          <td className="py-3.5 pl-3 text-right whitespace-nowrap space-x-2">
                            <button
                              onClick={() => setSelectedOrder(selectedOrder?.id === ord.id ? null : ord)}
                              className="px-2.5 py-1 text-xs rounded-md border border-white/15 hover:bg-white/10 text-zinc-200"
                            >
                              {selectedOrder?.id === ord.id ? 'Hide Tracker' : 'Track'}
                            </button>
                            {ord.invoice_id && (
                              <button
                                onClick={() => downloadInvoicePdf(ord.invoice_id!, ord.invoice_number || ord.order_number)}
                                className="px-2.5 py-1 text-xs rounded-md bg-orange-600/20 border border-orange-500/30 text-orange-300 hover:bg-orange-600/30"
                              >
                                PDF
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {selectedOrder && (
                <div className="p-6 rounded-xl bg-[#070709] border border-orange-500/30 space-y-6">
                  <div className="flex flex-wrap items-center justify-between gap-4">
                    <div>
                      <div className="font-mono text-xs text-orange-400">{selectedOrder.order_number}</div>
                      <h3 className="font-display text-lg font-bold text-white mt-0.5">Order Progress &amp; History</h3>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {selectedOrder.invoice_id && (
                        <button
                          onClick={async () => {
                            const data = await apiFetch<{ invoice: Invoice }>(`/api/invoices/${selectedOrder.invoice_id}`);
                            onOpenInvoice(data.invoice);
                          }}
                          className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-white/10 hover:bg-white/15 text-white"
                        >
                          View Invoice ({selectedOrder.invoice_number})
                        </button>
                      )}
                      {['Order Submitted', 'Awaiting Payment'].includes(selectedOrder.status) && (
                        <button
                          onClick={() => handleCancelOrder(selectedOrder.id)}
                          className="px-3 py-1.5 text-xs font-semibold rounded-lg border border-rose-500/30 text-rose-300 hover:bg-rose-500/10"
                        >
                          Cancel Order
                        </button>
                      )}
                      {selectedOrder.status === 'Completed' && (
                        <>
                          <button
                            onClick={() => setFeedbackOrder(selectedOrder)}
                            className="px-3 py-1.5 text-xs font-semibold rounded-lg border border-orange-500/30 text-orange-300 hover:bg-orange-500/10"
                          >
                            Rate Experience
                          </button>
                          <button
                            onClick={() => setRefundOrder(selectedOrder)}
                            className="px-3 py-1.5 text-xs font-semibold rounded-lg border border-white/15 text-zinc-300 hover:bg-white/10"
                          >
                            Request Refund
                          </button>
                        </>
                      )}
                    </div>
                  </div>

                  {!['Cancelled', 'Refunded'].includes(selectedOrder.status) && (
                    <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2">
                      {ORDER_STEPS.map((step, idx) => {
                        const currentIdx = ORDER_STEPS.indexOf(selectedOrder.status);
                        const done = idx <= currentIdx;
                        return (
                          <div
                            key={step}
                            className={`p-2.5 rounded-lg border text-xs ${
                              done
                                ? 'border-orange-500/40 bg-orange-500/10 text-white'
                                : 'border-white/10 bg-[#0D0D11] text-zinc-500'
                            }`}
                          >
                            <div className="font-mono text-[10px] mb-1">0{idx + 1}</div>
                            <div className="font-medium leading-tight">{step}</div>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  <div className="space-y-2 pt-3 border-t border-white/10">
                    <div className="text-xs font-semibold text-zinc-400">Order Activity Timeline</div>
                    {selectedOrder.history.map((h) => (
                      <div key={h.id} className="flex flex-wrap justify-between gap-2 text-xs py-1.5 border-b border-white/5 last:border-0">
                        <div>
                          <span className="font-semibold text-white">{h.to_status}</span>
                          {h.note && <span className="text-zinc-400"> — {h.note}</span>}
                        </div>
                        <span className="font-mono text-zinc-500">{formatDateTime(h.created_at)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {tab === 'invoices' && (
            <div className="bg-[#0D0D11] border border-white/10 rounded-2xl p-6 space-y-5">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                  <h2 className="font-display text-xl font-bold text-white">My Invoices</h2>
                  <p className="text-xs text-zinc-400 mt-0.5">View online invoices, download PDFs, or submit bank transfer receipts.</p>
                </div>
                <div className="flex flex-wrap gap-1 p-1 bg-[#070709] border border-white/10 rounded-lg">
                  {['ALL', 'Paid', 'Unpaid', 'Pending Verification', 'Overdue'].map((st) => (
                    <button
                      key={st}
                      onClick={() => setInvoiceFilter(st)}
                      className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                        invoiceFilter === st ? 'bg-orange-600 text-white' : 'text-zinc-400 hover:text-white'
                      }`}
                    >
                      {st === 'ALL' ? 'All' : st}
                    </button>
                  ))}
                </div>
              </div>

              {filteredInvoices.length === 0 ? (
                <p className="text-sm text-zinc-500 py-8 text-center">No invoices match this filter.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse text-sm">
                    <thead>
                      <tr className="border-b border-white/10 text-[11px] text-zinc-500 uppercase tracking-wider">
                        <th className="py-3 pr-4">Invoice #</th>
                        <th className="py-3 px-3">Order #</th>
                        <th className="py-3 px-3">Issued / Due</th>
                        <th className="py-3 px-3">Status</th>
                        <th className="py-3 px-3 text-right">Total</th>
                        <th className="py-3 pl-3 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5">
                      {filteredInvoices.map((inv) => (
                        <tr key={inv.id} className="hover:bg-white/[0.02]">
                          <td className="py-3.5 pr-4 font-mono text-xs text-white whitespace-nowrap">{inv.invoice_number}</td>
                          <td className="py-3.5 px-3 font-mono text-xs text-zinc-400 whitespace-nowrap">{inv.order_number || 'Manual'}</td>
                          <td className="py-3.5 px-3 text-xs text-zinc-400 font-mono whitespace-nowrap">
                            {formatDate(inv.issue_date)} · {formatDate(inv.due_date)}
                          </td>
                          <td className={`py-3.5 px-3 text-xs font-semibold whitespace-nowrap ${statusColorClass(inv.status)}`}>{inv.status}</td>
                          <td className="py-3.5 px-3 text-right font-mono tabular-nums text-white whitespace-nowrap">
                            {formatCurrency(inv.total_cents, inv.currency)}
                          </td>
                          <td className="py-3.5 pl-3 text-right whitespace-nowrap space-x-2">
                            <button
                              onClick={() => onOpenInvoice(inv)}
                              className="inline-flex items-center gap-1 px-2.5 py-1 text-xs rounded-md bg-orange-600 hover:bg-orange-500 text-white"
                            >
                              {inv.status === 'Unpaid' || inv.status === 'Overdue' ? 'View & Pay' : 'View'}
                            </button>
                            <button
                              onClick={() => downloadInvoicePdf(inv.id, inv.invoice_number)}
                              className="inline-flex items-center gap-1 px-2.5 py-1 text-xs rounded-md border border-white/15 hover:bg-white/10 text-zinc-200"
                            >
                              <Download className="w-3 h-3" />
                              PDF
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {tab === 'services' && (
            <div className="bg-[#0D0D11] border border-white/10 rounded-2xl p-6 space-y-5">
              <div>
                <h2 className="font-display text-xl font-bold text-white">Active &amp; Provisioned Services</h2>
                <p className="text-xs text-zinc-400 mt-0.5">Manage active subscriptions, expiration dates, and instant service renewals.</p>
              </div>
              {services.length === 0 ? (
                <p className="text-sm text-zinc-500 py-8 text-center">Services activate automatically once payment is verified.</p>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {services.map((svc) => (
                    <Tilt3DCard key={svc.id} maxTilt={6} className="p-5 rounded-xl bg-[#070709] border border-white/10">
                      <div className="flex flex-col justify-between h-full space-y-3">
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <div className="text-xs font-medium text-orange-400">{svc.service_code}</div>
                            <h3 className="font-display text-base font-bold text-white mt-0.5">{svc.product_name}</h3>
                            <div className="text-xs text-zinc-400">{svc.package_name}</div>
                          </div>
                          <span className={`text-xs font-semibold ${statusColorClass(svc.status)}`}>{svc.status}</span>
                        </div>
                        <div className="text-xs text-zinc-400 space-y-1.5 pt-2 border-t border-white/5">
                          <div className="flex justify-between gap-2">
                            <span>Provisioning Status</span>
                            <span className="text-zinc-200 font-medium">{svc.endpoint_info || 'Active Allocation'}</span>
                          </div>
                          <div className="flex justify-between gap-2">
                            <span>Started On</span>
                            <span className="text-zinc-300 tabular-nums">{formatDate(svc.started_at)}</span>
                          </div>
                          <div className="flex justify-between gap-2">
                            <span>Renewal Date</span>
                            <span className="text-zinc-200 tabular-nums">{formatDate(svc.expires_at)}</span>
                          </div>
                        </div>
                        <div className="flex items-center justify-between pt-3 border-t border-white/5">
                          <label className="flex items-center gap-2 text-xs text-zinc-300 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={Boolean(svc.auto_renew)}
                              onChange={() => handleToggleAutoRenew(svc.id, Boolean(svc.auto_renew))}
                              className="accent-orange-500"
                            />
                            Auto-Renew Reminder
                          </label>
                          <button
                            onClick={() => handleRenewService(svc.id)}
                            className="px-3.5 py-1.5 text-xs font-semibold rounded-lg bg-orange-600 hover:bg-orange-500 text-white transition-colors"
                          >
                            Renew Service
                          </button>
                        </div>
                      </div>
                    </Tilt3DCard>
                  ))}
                </div>
              )}
            </div>
          )}

          {tab === 'payments' && (
            <div className="bg-[#0D0D11] border border-white/10 rounded-2xl p-6 space-y-5">
              <div>
                <h2 className="font-display text-xl font-bold text-white">Payment &amp; Transaction History</h2>
                <p className="text-xs text-zinc-400 mt-0.5">Complete ledger of submitted receipts, Stripe charges, and verification statuses.</p>
              </div>
              {payments.length === 0 ? (
                <p className="text-sm text-zinc-500 py-8 text-center">No payments recorded yet.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse text-sm">
                    <thead>
                      <tr className="border-b border-white/10 text-[11px] text-zinc-500 uppercase tracking-wider">
                        <th className="py-3 pr-4">Payment ID</th>
                        <th className="py-3 px-3">Invoice</th>
                        <th className="py-3 px-3">Method</th>
                        <th className="py-3 px-3">Reference</th>
                        <th className="py-3 px-3">Status</th>
                        <th className="py-3 px-3 text-right">Amount</th>
                        <th className="py-3 pl-3 text-right">Receipt</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5">
                      {payments.map((pay) => (
                        <tr key={pay.id}>
                          <td className="py-3.5 pr-4 font-mono text-xs text-white">{pay.payment_number}</td>
                          <td className="py-3.5 px-3 font-mono text-xs text-zinc-300">{pay.invoice_number}</td>
                          <td className="py-3.5 px-3 text-xs text-zinc-300">{pay.method}</td>
                          <td className="py-3.5 px-3 font-mono text-xs text-zinc-400">{pay.transaction_ref || '—'}</td>
                          <td className={`py-3.5 px-3 text-xs font-semibold ${statusColorClass(pay.status)}`}>{pay.status}</td>
                          <td className="py-3.5 px-3 text-right font-mono tabular-nums text-white">
                            {formatCurrency(pay.amount_cents, pay.currency)}
                          </td>
                          <td className="py-3.5 pl-3 text-right">
                            {pay.receipt_id ? (
                              <a
                                href={`/api/files/receipts/${pay.id}`}
                                target="_blank"
                                rel="noreferrer"
                                className="inline-flex items-center gap-1 text-xs text-orange-400 hover:text-orange-300"
                              >
                                View <ExternalLink className="w-3 h-3" />
                              </a>
                            ) : (
                              <span className="text-xs text-zinc-600">—</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {tab === 'support' && (
            <div className="bg-[#0D0D11] border border-white/10 rounded-2xl p-6 space-y-6">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                  <h2 className="font-display text-xl font-bold text-white">Engineering &amp; Billing Support</h2>
                  <p className="text-xs text-zinc-400 mt-0.5">Open support tickets, attach logs/screenshots, and track specialist replies.</p>
                </div>
                <button
                  onClick={() => setShowNewTicket((s) => !s)}
                  className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded-lg bg-orange-600 hover:bg-orange-500 text-white"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Create Ticket
                </button>
              </div>

              {showNewTicket && (
                <form onSubmit={handleCreateTicket} className="p-5 rounded-xl bg-[#070709] border border-orange-500/30 space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="md:col-span-2">
                      <label className="block text-xs text-zinc-400 mb-1">Subject *</label>
                      <input required value={tSubject} onChange={(e) => setTSubject(e.target.value)} placeholder="Brief summary of your request" className="w-full px-3 py-2 text-sm bg-[#0D0D11] border border-white/15 rounded-lg text-white" />
                    </div>
                    <div>
                      <label className="block text-xs text-zinc-400 mb-1">Category</label>
                      <select value={tCategory} onChange={(e) => setTCategory(e.target.value)} className="w-full px-3 py-2 text-sm bg-[#0D0D11] border border-white/15 rounded-lg text-white">
                        <option>Technical Support</option>
                        <option>Billing &amp; Invoices</option>
                        <option>Infrastructure &amp; Networking</option>
                        <option>Account &amp; Security</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs text-zinc-400 mb-1">Priority</label>
                      <select value={tPriority} onChange={(e) => setTPriority(e.target.value)} className="w-full px-3 py-2 text-sm bg-[#0D0D11] border border-white/15 rounded-lg text-white">
                        <option value="Low">Low</option>
                        <option value="Normal">Normal</option>
                        <option value="High">High</option>
                        <option value="Urgent">Urgent</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs text-zinc-400 mb-1">Related Order (Optional)</label>
                      <select value={tOrderId} onChange={(e) => setTOrderId(e.target.value)} className="w-full px-3 py-2 text-sm bg-[#0D0D11] border border-white/15 rounded-lg text-white">
                        <option value="">None</option>
                        {orders.map((o) => (
                          <option key={o.id} value={o.id}>{o.order_number}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs text-zinc-400 mb-1">Attachment (Optional, max 5MB)</label>
                      <input type="file" onChange={(e) => setTAttachment(e.target.files?.[0] || null)} className="w-full text-xs text-zinc-300" />
                    </div>
                    <div className="md:col-span-2">
                      <label className="block text-xs text-zinc-400 mb-1">Message *</label>
                      <textarea required rows={3} value={tMessage} onChange={(e) => setTMessage(e.target.value)} className="w-full px-3 py-2 text-sm bg-[#0D0D11] border border-white/15 rounded-lg text-white" />
                    </div>
                  </div>
                  <div className="flex justify-end gap-2">
                    <button type="button" onClick={() => setShowNewTicket(false)} className="px-4 py-2 text-xs text-zinc-400 hover:text-white">Cancel</button>
                    <button type="submit" className="px-4 py-2 text-xs font-semibold bg-orange-600 hover:bg-orange-500 text-white rounded-lg">Submit Ticket</button>
                  </div>
                </form>
              )}

              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                <div className="lg:col-span-5 space-y-2">
                  {tickets.length === 0 ? (
                    <p className="text-xs text-zinc-500 py-4">No support tickets opened yet.</p>
                  ) : (
                    tickets.map((t) => (
                      <button
                        key={t.id}
                        onClick={() => handleOpenTicket(t.id)}
                        className={`w-full text-left p-4 rounded-xl border transition-colors ${
                          activeTicket?.ticket.id === t.id
                            ? 'border-orange-500/50 bg-orange-500/10'
                            : 'border-white/10 bg-[#070709] hover:border-white/20'
                        }`}
                      >
                        <div className="flex items-center justify-between text-xs mb-1">
                          <span className="font-mono text-orange-400">{t.ticket_number}</span>
                          <span className={statusColorClass(t.status)}>{t.status}</span>
                        </div>
                        <div className="text-sm font-semibold text-white truncate">{t.subject}</div>
                        <div className="text-[11px] text-zinc-500 mt-1">
                          {t.category} · {t.priority} Priority
                        </div>
                      </button>
                    ))
                  )}
                </div>

                <div className="lg:col-span-7">
                  {activeTicket ? (
                    <div className="p-5 rounded-xl bg-[#070709] border border-white/10 space-y-4">
                      <div className="pb-3 border-b border-white/10 flex items-start justify-between gap-3">
                        <div>
                          <div className="font-mono text-xs text-orange-400">{activeTicket.ticket.ticket_number}</div>
                          <h3 className="font-display text-base font-bold text-white">{activeTicket.ticket.subject}</h3>
                        </div>
                        <span className={`text-xs font-semibold ${statusColorClass(activeTicket.ticket.status)}`}>
                          {activeTicket.ticket.status}
                        </span>
                      </div>

                      <div className="space-y-3 max-h-80 overflow-y-auto pr-1">
                        {activeTicket.messages.map((m) => (
                          <div
                            key={m.id}
                            className={`p-3.5 rounded-xl text-sm ${
                              m.sender_role === 'customer'
                                ? 'bg-[#121217] border border-white/10'
                                : 'bg-orange-950/30 border border-orange-500/30'
                            }`}
                          >
                            <div className="flex items-center justify-between text-xs mb-1.5">
                              <span className="font-semibold text-white">
                                {m.sender_name} ({m.sender_role === 'customer' ? 'You' : 'HelzerX Support'})
                              </span>
                              <span className="font-mono text-zinc-500">{formatDateTime(m.created_at)}</span>
                            </div>
                            <p className="text-zinc-300 text-xs leading-relaxed whitespace-pre-wrap">{m.message}</p>
                            {m.attachment_filename && (
                              <a
                                href={`/api/files/tickets/${m.id}`}
                                className="inline-flex items-center gap-1 mt-2 text-xs text-orange-400 hover:underline"
                              >
                                <Upload className="w-3 h-3" /> {m.attachment_original_name}
                              </a>
                            )}
                          </div>
                        ))}
                      </div>

                      <form onSubmit={handleReplyTicket} className="space-y-3 pt-3 border-t border-white/10">
                        <textarea
                          rows={2}
                          value={replyText}
                          onChange={(e) => setReplyText(e.target.value)}
                          placeholder="Write your reply..."
                          className="w-full px-3 py-2 text-sm bg-[#0D0D11] border border-white/15 rounded-lg text-white"
                        />
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <input type="file" onChange={(e) => setReplyFile(e.target.files?.[0] || null)} className="text-xs text-zinc-400" />
                          <button type="submit" className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold bg-orange-600 hover:bg-orange-500 text-white rounded-lg">
                            <Send className="w-3.5 h-3.5" />
                            Send Reply
                          </button>
                        </div>
                      </form>
                    </div>
                  ) : (
                    <div className="h-full min-h-[240px] flex items-center justify-center rounded-xl border border-dashed border-white/10 text-xs text-zinc-500">
                      Select a ticket on the left to view conversation thread.
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {tab === 'settings' && (
            <div className="space-y-6">
              <form
                onSubmit={async (e) => {
                  e.preventDefault();
                  try {
                    const res = await apiFetch<{ user: UserProfile }>('/api/profile', {
                      method: 'PATCH',
                      body: JSON.stringify(profileForm),
                    });
                    onUserUpdated(res.user);
                    onNotify('success', 'Profile & notification preferences saved.');
                  } catch (err: any) {
                    onNotify('error', err.message);
                  }
                }}
                className="bg-[#0D0D11] border border-white/10 rounded-2xl p-6 space-y-4"
              >
                <h2 className="font-display text-lg font-bold text-white pb-3 border-b border-white/10">Profile &amp; Notification Preferences</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                  <div>
                    <label className="block text-xs text-zinc-400 mb-1">Full Name</label>
                    <input value={profileForm.full_name} onChange={(e) => setProfileForm({ ...profileForm, full_name: e.target.value })} className="w-full px-3 py-2 bg-[#070709] border border-white/15 rounded-lg text-white" />
                  </div>
                  <div>
                    <label className="block text-xs text-zinc-400 mb-1">Mobile Number</label>
                    <input value={profileForm.mobile} onChange={(e) => setProfileForm({ ...profileForm, mobile: e.target.value })} className="w-full px-3 py-2 bg-[#070709] border border-white/15 rounded-lg text-white" />
                  </div>
                  <div>
                    <label className="block text-xs text-zinc-400 mb-1">Country</label>
                    <input value={profileForm.country} onChange={(e) => setProfileForm({ ...profileForm, country: e.target.value })} className="w-full px-3 py-2 bg-[#070709] border border-white/15 rounded-lg text-white" />
                  </div>
                  <div>
                    <label className="block text-xs text-zinc-400 mb-1">City</label>
                    <input value={profileForm.city} onChange={(e) => setProfileForm({ ...profileForm, city: e.target.value })} className="w-full px-3 py-2 bg-[#070709] border border-white/15 rounded-lg text-white" />
                  </div>
                  <div>
                    <label className="block text-xs text-zinc-400 mb-1">Billing Address</label>
                    <input value={profileForm.billing_address} onChange={(e) => setProfileForm({ ...profileForm, billing_address: e.target.value })} className="w-full px-3 py-2 bg-[#070709] border border-white/15 rounded-lg text-white" />
                  </div>
                  <div>
                    <label className="block text-xs text-zinc-400 mb-1">Postal Code</label>
                    <input value={profileForm.postal_code} onChange={(e) => setProfileForm({ ...profileForm, postal_code: e.target.value })} className="w-full px-3 py-2 bg-[#070709] border border-white/15 rounded-lg text-white" />
                  </div>
                  <div>
                    <label className="block text-xs text-zinc-400 mb-1">Company Name</label>
                    <input value={profileForm.company_name} onChange={(e) => setProfileForm({ ...profileForm, company_name: e.target.value })} className="w-full px-3 py-2 bg-[#070709] border border-white/15 rounded-lg text-white" />
                  </div>
                  <div>
                    <label className="block text-xs text-zinc-400 mb-1">Discord Username</label>
                    <input value={profileForm.discord_username} onChange={(e) => setProfileForm({ ...profileForm, discord_username: e.target.value })} className="w-full px-3 py-2 bg-[#070709] border border-white/15 rounded-lg text-white" />
                  </div>
                </div>
                <div className="flex flex-wrap gap-6 pt-2 text-xs text-zinc-300">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" checked={profileForm.notify_email} onChange={(e) => setProfileForm({ ...profileForm, notify_email: e.target.checked })} className="accent-orange-500" />
                    Email Billing &amp; Order Alerts
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" checked={profileForm.notify_discord} onChange={(e) => setProfileForm({ ...profileForm, notify_discord: e.target.checked })} className="accent-orange-500" />
                    Discord Mention Alerts
                  </label>
                </div>
                <button type="submit" className="px-4 py-2 text-xs font-semibold bg-orange-600 hover:bg-orange-500 text-white rounded-lg">
                  Save Changes
                </button>
              </form>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="bg-[#0D0D11] border border-white/10 rounded-2xl p-6 space-y-4">
                  <div className="flex items-center gap-2 font-display font-bold text-white">
                    <KeyRound className="w-4 h-4 text-orange-400" />
                    Change Password &amp; Email Verification
                  </div>
                  <div className="p-3 rounded-lg bg-[#070709] border border-white/10 text-xs">
                    <div className="flex items-center justify-between">
                      <span className="text-zinc-400">Email Verification</span>
                      <span className={user.email_verified ? 'text-emerald-400 font-semibold' : 'text-orange-400 font-semibold'}>
                        {user.email_verified ? 'Verified' : 'Unverified'}
                      </span>
                    </div>
                    {!user.email_verified && (
                      <div className="mt-2 space-y-2">
                        <div className="flex gap-2">
                          <input value={verifyCode} onChange={(e) => setVerifyCode(e.target.value)} placeholder="Verification code" className="flex-1 px-2.5 py-1.5 bg-[#0D0D11] border border-white/15 rounded text-white font-mono" />
                          <button
                            type="button"
                            onClick={async () => {
                              try {
                                await apiFetch('/api/auth/verify-email', { method: 'POST', body: JSON.stringify({ token: verifyCode }) });
                                onNotify('success', 'Email verified.');
                                loadSettingsData();
                              } catch (err: any) {
                                onNotify('error', err.message);
                              }
                            }}
                            className="px-3 py-1.5 bg-orange-600 text-white rounded font-semibold"
                          >
                            Verify
                          </button>
                        </div>
                        <button
                          type="button"
                          onClick={async () => {
                            try {
                              await apiFetch<any>('/api/auth/resend-verification', { method: 'POST' });
                              onNotify('success', 'Verification code dispatched to your registered email inbox.');
                            } catch (err: any) {
                              onNotify('error', err.message);
                            }
                          }}
                          className="text-orange-400 hover:underline"
                        >
                          Send new verification code
                        </button>
                      </div>
                    )}
                  </div>

                  <form
                    onSubmit={async (e) => {
                      e.preventDefault();
                      if (!evaluatePasswordStrength(pwForm.new_password).isValid) {
                        onNotify('error', 'New password must meet all 12+ character security requirements.');
                        return;
                      }
                      try {
                        await apiFetch('/api/profile/password', { method: 'POST', body: JSON.stringify(pwForm) });
                        setPwForm({ current_password: '', new_password: '' });
                        onNotify('success', 'Password updated and other active sessions revoked.');
                        loadSettingsData();
                      } catch (err: any) {
                        onNotify('error', err.message);
                      }
                    }}
                    className="space-y-3 pt-2 border-t border-white/10"
                  >
                    <input
                      type="password"
                      required
                      placeholder="Current password"
                      value={pwForm.current_password}
                      onChange={(e) => setPwForm({ ...pwForm, current_password: e.target.value })}
                      className="w-full px-3 py-2 text-xs bg-[#070709] border border-white/15 rounded-lg text-white"
                    />
                    <PasswordStrengthField
                      value={pwForm.new_password}
                      onChange={(val) => setPwForm({ ...pwForm, new_password: val })}
                      placeholder="Choose a new strong password"
                      compact
                    />
                    <button type="submit" className="px-4 py-2 text-xs font-semibold border border-white/15 bg-white/5 hover:bg-white/10 text-white rounded-lg">
                      Update Password
                    </button>
                  </form>
                </div>

                <div className="bg-[#0D0D11] border border-white/10 rounded-2xl p-6 space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 font-display font-bold text-white">
                      <Shield className="w-4 h-4 text-orange-400" />
                      Two-Factor Authentication
                    </div>
                    <span className={`text-xs font-semibold ${user.two_factor_enabled ? 'text-emerald-400' : 'text-zinc-400'}`}>
                      {user.two_factor_enabled ? 'Enabled' : 'Disabled'}
                    </span>
                  </div>
                  <p className="text-xs text-zinc-400 leading-relaxed">
                    Protect your billing account with authenticator app verification and single-use backup recovery codes.
                  </p>

                  {recoveryCodes && (
                    <div className="p-3.5 rounded-xl bg-orange-950/30 border border-orange-500/40 space-y-2 text-xs">
                      <div className="font-semibold text-orange-300">Save Your Single-Use Backup Recovery Codes</div>
                      <p className="text-zinc-400">
                        Store these codes offline. Each code works once if you lose access to your authenticator device.
                      </p>
                      <div className="grid grid-cols-2 gap-1.5 font-mono text-white pt-1">
                        {recoveryCodes.map((c) => (
                          <div key={c} className="px-2 py-1 rounded bg-[#070709] border border-white/10 select-all text-center">
                            {c}
                          </div>
                        ))}
                      </div>
                      <button
                        type="button"
                        onClick={() => setRecoveryCodes(null)}
                        className="text-[11px] text-zinc-400 hover:text-white underline pt-1"
                      >
                        Dismiss saved codes
                      </button>
                    </div>
                  )}

                  {!user.two_factor_enabled ? (
                    !totpSetup ? (
                      <button
                        type="button"
                        onClick={async () => {
                          const data = await apiFetch<{ secret: string; otpauth_url: string }>('/api/auth/2fa/setup', { method: 'POST' });
                          setTotpSetup(data);
                        }}
                        className="px-4 py-2 text-xs font-semibold bg-orange-600 hover:bg-orange-500 text-white rounded-lg"
                      >
                        Configure 2FA Authenticator
                      </button>
                    ) : (
                      <div className="space-y-3 p-3 rounded-xl bg-[#070709] border border-orange-500/30">
                        <div className="text-xs text-zinc-400">Authenticator Secret Key:</div>
                        <div className="font-mono text-xs text-orange-300 break-all select-all">{totpSetup.secret}</div>
                        <div className="flex gap-2">
                          <input
                            value={totpVerifyCode}
                            onChange={(e) => setTotpVerifyCode(e.target.value)}
                            placeholder="6-digit code"
                            maxLength={6}
                            className="flex-1 px-3 py-1.5 text-xs font-mono bg-[#0D0D11] border border-white/15 rounded-lg text-white"
                          />
                          <button
                            type="button"
                            onClick={async () => {
                              try {
                                const res = await apiFetch<{ enabled: boolean; recovery_codes: string[] }>('/api/auth/2fa/enable', {
                                  method: 'POST',
                                  body: JSON.stringify({ code: totpVerifyCode }),
                                });
                                setTotpSetup(null);
                                setTotpVerifyCode('');
                                if (res.recovery_codes?.length) {
                                  setRecoveryCodes(res.recovery_codes);
                                }
                                onNotify('success', 'Two-Factor Authentication enabled. Save your recovery codes.');
                                loadSettingsData();
                              } catch (err: any) {
                                onNotify('error', err.message);
                              }
                            }}
                            className="px-3 py-1.5 text-xs font-semibold bg-emerald-600 text-white rounded-lg"
                          >
                            Enable 2FA
                          </button>
                        </div>
                      </div>
                    )
                  ) : (
                    <div className="space-y-3">
                      <div className="space-y-2 p-3 rounded-xl bg-[#070709] border border-white/10">
                        <div className="text-xs font-medium text-zinc-300">Regenerate Backup Recovery Codes</div>
                        <div className="flex gap-2">
                          <input
                            type="password"
                            value={regen2faPw}
                            onChange={(e) => setRegen2faPw(e.target.value)}
                            placeholder="Confirm password"
                            className="flex-1 px-3 py-1.5 text-xs bg-[#0D0D11] border border-white/15 rounded-lg text-white"
                          />
                          <button
                            type="button"
                            onClick={async () => {
                              try {
                                const res = await apiFetch<{ recovery_codes: string[] }>('/api/auth/2fa/regenerate-recovery', {
                                  method: 'POST',
                                  body: JSON.stringify({ password: regen2faPw }),
                                });
                                setRegen2faPw('');
                                setRecoveryCodes(res.recovery_codes || []);
                                onNotify('success', 'New backup recovery codes generated. Prior codes invalidated.');
                              } catch (err: any) {
                                onNotify('error', err.message);
                              }
                            }}
                            className="px-3 py-1.5 text-xs font-semibold bg-white/10 hover:bg-white/15 text-white rounded-lg whitespace-nowrap"
                          >
                            Regenerate
                          </button>
                        </div>
                      </div>

                      <div className="space-y-2">
                        <input
                          type="password"
                          value={disable2faPw}
                          onChange={(e) => setDisable2faPw(e.target.value)}
                          placeholder="Enter password to disable 2FA"
                          className="w-full px-3 py-2 text-xs bg-[#070709] border border-white/15 rounded-lg text-white"
                        />
                        <button
                          type="button"
                          onClick={async () => {
                            try {
                              await apiFetch('/api/auth/2fa/disable', { method: 'POST', body: JSON.stringify({ password: disable2faPw }) });
                              setDisable2faPw('');
                              setRecoveryCodes(null);
                              onNotify('success', '2FA disabled.');
                              loadSettingsData();
                            } catch (err: any) {
                              onNotify('error', err.message);
                            }
                          }}
                          className="px-3 py-1.5 text-xs font-semibold border border-rose-500/30 text-rose-300 rounded-lg"
                        >
                          Disable 2FA
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              <div className="bg-[#0D0D11] border border-white/10 rounded-2xl p-6 space-y-4">
                <div className="flex items-center gap-2 font-display font-bold text-white">
                  <MapPin className="w-4 h-4 text-orange-400" />
                  Billing Addresses
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {addresses.map((addr) => (
                    <div key={addr.id} className="p-4 rounded-xl bg-[#070709] border border-white/10 flex justify-between gap-3 text-xs">
                      <div className="space-y-1">
                        <div className="font-semibold text-white">
                          {addr.label} {addr.is_default ? <span className="text-orange-400">· Default</span> : ''}
                        </div>
                        <div className="text-zinc-400">{addr.full_name} {addr.company_name ? `(${addr.company_name})` : ''}</div>
                        <div className="text-zinc-400">{addr.address_line}, {addr.city} {addr.postal_code}, {addr.country}</div>
                      </div>
                      <button
                        onClick={async () => {
                          await apiFetch(`/api/profile/addresses/${addr.id}`, { method: 'DELETE' });
                          loadSettingsData();
                        }}
                        className="text-zinc-500 hover:text-rose-400 self-start"
                        aria-label="Delete billing address"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>

                <form
                  onSubmit={async (e) => {
                    e.preventDefault();
                    try {
                      await apiFetch('/api/profile/addresses', { method: 'POST', body: JSON.stringify(newAddress) });
                      setNewAddress({ label: '', full_name: user.full_name, company_name: '', address_line: '', city: '', postal_code: '', country: '' });
                      loadSettingsData();
                    } catch (err: any) {
                      onNotify('error', err.message);
                    }
                  }}
                  className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-3 border-t border-white/10 text-xs"
                >
                  <input required placeholder="Label (e.g. EU Branch)" value={newAddress.label} onChange={(e) => setNewAddress({ ...newAddress, label: e.target.value })} className="px-3 py-2 bg-[#070709] border border-white/15 rounded-lg text-white" />
                  <input required placeholder="Recipient Full Name" value={newAddress.full_name} onChange={(e) => setNewAddress({ ...newAddress, full_name: e.target.value })} className="px-3 py-2 bg-[#070709] border border-white/15 rounded-lg text-white" />
                  <input placeholder="Company (optional)" value={newAddress.company_name} onChange={(e) => setNewAddress({ ...newAddress, company_name: e.target.value })} className="px-3 py-2 bg-[#070709] border border-white/15 rounded-lg text-white" />
                  <input required placeholder="Street Address" value={newAddress.address_line} onChange={(e) => setNewAddress({ ...newAddress, address_line: e.target.value })} className="px-3 py-2 bg-[#070709] border border-white/15 rounded-lg text-white" />
                  <input required placeholder="City" value={newAddress.city} onChange={(e) => setNewAddress({ ...newAddress, city: e.target.value })} className="px-3 py-2 bg-[#070709] border border-white/15 rounded-lg text-white" />
                  <div className="flex gap-2">
                    <input required placeholder="Postal" value={newAddress.postal_code} onChange={(e) => setNewAddress({ ...newAddress, postal_code: e.target.value })} className="w-24 px-2 py-2 bg-[#070709] border border-white/15 rounded-lg text-white" />
                    <input required placeholder="Country" value={newAddress.country} onChange={(e) => setNewAddress({ ...newAddress, country: e.target.value })} className="flex-1 px-2 py-2 bg-[#070709] border border-white/15 rounded-lg text-white" />
                    <button type="submit" className="px-3 py-2 bg-orange-600 text-white rounded-lg font-semibold">Add</button>
                  </div>
                </form>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="bg-[#0D0D11] border border-white/10 rounded-2xl p-6 space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="font-display font-bold text-white text-sm">Active Sessions</h3>
                    <button
                      type="button"
                      onClick={async () => {
                        try {
                          await apiFetch('/api/auth/logout-all', { method: 'POST' });
                          onNotify('success', 'All device sessions revoked.');
                          onLogout();
                        } catch (err: any) {
                          onNotify('error', err.message);
                        }
                      }}
                      className="text-xs text-rose-400 hover:underline whitespace-nowrap"
                    >
                      Sign Out All Devices
                    </button>
                  </div>
                  {sessions.map((s) => (
                    <div key={s.id} className="flex items-center justify-between gap-2 text-xs py-2 border-b border-white/5">
                      <div className="min-w-0">
                        <div className="text-zinc-200 font-mono truncate">{s.ip_address} {s.is_current ? '· Current Session' : ''}</div>
                        <div className="text-zinc-500 truncate">{s.user_agent}</div>
                      </div>
                      {!s.is_current && (
                        <button
                          onClick={async () => {
                            await apiFetch(`/api/auth/sessions/${s.id}`, { method: 'DELETE' });
                            loadSettingsData();
                          }}
                          className="text-rose-400 hover:underline shrink-0"
                        >
                          Revoke
                        </button>
                      )}
                    </div>
                  ))}
                </div>

                <div className="bg-[#0D0D11] border border-white/10 rounded-2xl p-6 space-y-3">
                  <h3 className="font-display font-bold text-white text-sm">Login History</h3>
                  <div className="max-h-56 overflow-y-auto space-y-2">
                    {loginHistory.map((h) => (
                      <div key={h.id} className="flex items-center justify-between text-xs py-1.5 border-b border-white/5">
                        <div>
                          <span className={h.success ? 'text-emerald-400' : 'text-rose-400'}>
                            {h.success ? 'Successful Sign In' : formatFailureReason(h.failure_reason)}
                          </span>
                          <div className="text-zinc-500 font-mono">{h.ip_address}</div>
                        </div>
                        <span className="font-mono text-zinc-500">{formatDateTime(h.created_at)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <div className="flex justify-end">
                <button
                  onClick={async () => {
                    await apiFetch('/api/profile/request-deletion', { method: 'POST' });
                    onNotify('success', 'Account deletion request submitted for compliance review.');
                  }}
                  className="px-4 py-2 text-xs border border-rose-500/30 text-rose-400 hover:bg-rose-500/10 rounded-lg"
                >
                  Request Account Deletion
                </button>
              </div>
            </div>
          )}
          </motion.div>
          </AnimatePresence>
        </main>
      </div>

      {refundOrder && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-[#0D0D11] border border-white/15 rounded-2xl p-6 space-y-4">
            <h3 className="font-display text-lg font-bold text-white">Request Refund — {refundOrder.order_number}</h3>
            <textarea
              rows={3}
              value={refundReason}
              onChange={(e) => setRefundReason(e.target.value)}
              placeholder="Explain why you are requesting a refund..."
              className="w-full px-3 py-2 text-sm bg-[#070709] border border-white/15 rounded-lg text-white"
            />
            <div className="flex justify-end gap-2">
              <button onClick={() => setRefundOrder(null)} className="px-3 py-1.5 text-xs text-zinc-400">Cancel</button>
              <button
                onClick={async () => {
                  try {
                    await apiFetch(`/api/orders/${refundOrder.id}/refund-request`, { method: 'POST', body: JSON.stringify({ reason: refundReason }) });
                    onNotify('success', 'Refund request submitted.');
                    setRefundOrder(null);
                    setRefundReason('');
                  } catch (err: any) {
                    onNotify('error', err.message);
                  }
                }}
                className="px-4 py-1.5 text-xs font-semibold bg-orange-600 text-white rounded-lg"
              >
                Submit Request
              </button>
            </div>
          </div>
        </div>
      )}

      {feedbackOrder && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-[#0D0D11] border border-white/15 rounded-2xl p-6 space-y-4">
            <h3 className="font-display text-lg font-bold text-white">Rate Order — {feedbackOrder.order_number}</h3>
            <div className="flex gap-2">
              {[1, 2, 3, 4, 5].map((n) => (
                <button key={n} type="button" onClick={() => setRating(n)} className={`p-2 rounded-lg border ${rating >= n ? 'border-orange-500 text-orange-400' : 'border-white/10 text-zinc-600'}`}>
                  <Star className="w-5 h-5 fill-current" />
                </button>
              ))}
            </div>
            <textarea
              rows={3}
              value={feedbackComment}
              onChange={(e) => setFeedbackComment(e.target.value)}
              placeholder="Share feedback on delivery speed and service quality..."
              className="w-full px-3 py-2 text-sm bg-[#070709] border border-white/15 rounded-lg text-white"
            />
            <div className="flex justify-end gap-2">
              <button onClick={() => setFeedbackOrder(null)} className="px-3 py-1.5 text-xs text-zinc-400">Cancel</button>
              <button
                onClick={async () => {
                  await apiFetch(`/api/orders/${feedbackOrder.id}/feedback`, { method: 'POST', body: JSON.stringify({ rating, comment: feedbackComment }) });
                  onNotify('success', 'Thank you for your feedback!');
                  setFeedbackOrder(null);
                  setFeedbackComment('');
                }}
                className="px-4 py-1.5 text-xs font-semibold bg-orange-600 text-white rounded-lg"
              >
                Submit Rating
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
