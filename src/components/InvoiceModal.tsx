import React, { useState } from 'react';
import { Download, Printer, X, Upload, CreditCard, CheckCircle2, AlertCircle } from 'lucide-react';
import { Invoice } from '../types';
import { apiFetch, downloadInvoicePdf, formatCurrency, formatDate, statusColorClass } from '../lib/api';

interface InvoiceModalProps {
  invoice: Invoice;
  settings: Record<string, string>;
  onClose: () => void;
  onPaymentSubmitted?: () => void;
  isAdminView?: boolean;
}

export function InvoiceModal({ invoice, settings, onClose, onPaymentSubmitted, isAdminView = false }: InvoiceModalProps) {
  const [downloading, setDownloading] = useState(false);
  const [showReceiptForm, setShowReceiptForm] = useState(false);
  const [method, setMethod] = useState<'Bank Transfer' | 'Manual Payment' | 'Cryptocurrency'>('Bank Transfer');
  const [txRef, setTxRef] = useState('');
  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; msg: string } | null>(null);

  const canPay = !isAdminView && (invoice.status === 'Unpaid' || invoice.status === 'Overdue');
  const billing = invoice.billing_snapshot || {};
  const taxPct = ((invoice.tax_rate_bps || 0) / 100).toFixed(2).replace(/\.00$/, '');

  const handleDownloadPdf = async () => {
    setDownloading(true);
    try {
      await downloadInvoicePdf(invoice.id, invoice.invoice_number);
    } catch (err: any) {
      setFeedback({ type: 'error', msg: err.message });
    } finally {
      setDownloading(false);
    }
  };

  const handleManualSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!receiptFile || !txRef.trim()) {
      setFeedback({ type: 'error', msg: 'Please provide a transaction reference and attach your receipt file.' });
      return;
    }
    setSubmitting(true);
    setFeedback(null);
    try {
      const fd = new FormData();
      fd.append('invoice_id', String(invoice.id));
      fd.append('method', method);
      fd.append('transaction_ref', txRef.trim());
      fd.append('receipt', receiptFile);
      await apiFetch('/api/payments/manual', { method: 'POST', body: fd });
      setFeedback({ type: 'success', msg: 'Receipt uploaded. Invoice is now Pending Verification by HelzerX finance.' });
      setShowReceiptForm(false);
      onPaymentSubmitted?.();
    } catch (err: any) {
      setFeedback({ type: 'error', msg: err.message });
    } finally {
      setSubmitting(false);
    }
  };

  const handleStripeCheckout = async () => {
    setSubmitting(true);
    setFeedback(null);
    try {
      const data = await apiFetch<{ checkout_url: string }>('/api/payments/stripe-session', {
        method: 'POST',
        body: JSON.stringify({ invoice_id: invoice.id }),
      });
      if (data.checkout_url) {
        window.location.assign(data.checkout_url);
      }
    } catch (err: any) {
      setFeedback({ type: 'error', msg: err.message });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm overflow-y-auto p-4 md:p-8 flex items-start justify-center">
      <div className="w-full max-w-[860px] space-y-4">
        {/* Non-print Action Bar */}
        <div className="no-print flex flex-wrap items-center justify-between gap-3 bg-[#0E0E12] border border-white/10 rounded-xl px-4 py-3">
          <div className="flex items-center gap-3 text-sm">
            <span className="font-mono font-semibold text-white">{invoice.invoice_number}</span>
            <span aria-hidden="true" className="text-zinc-600">·</span>
            <span className={`font-medium ${statusColorClass(invoice.status)}`}>{invoice.status}</span>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {canPay && (
              <>
                <button
                  onClick={() => setShowReceiptForm((s) => !s)}
                  className="inline-flex items-center gap-2 px-3.5 py-2 text-xs font-semibold rounded-lg bg-orange-600 hover:bg-orange-500 text-white transition-colors whitespace-nowrap shrink-0"
                >
                  <Upload className="w-3.5 h-3.5" />
                  Submit Payment Receipt
                </button>
                {settings.stripe_enabled === 'true' && (
                  <button
                    onClick={handleStripeCheckout}
                    disabled={submitting}
                    className="inline-flex items-center gap-2 px-3.5 py-2 text-xs font-semibold rounded-lg bg-white text-black hover:bg-zinc-200 transition-colors whitespace-nowrap shrink-0"
                  >
                    <CreditCard className="w-3.5 h-3.5" />
                    Pay with Stripe
                  </button>
                )}
              </>
            )}
            <button
              onClick={handleDownloadPdf}
              disabled={downloading}
              className="inline-flex items-center gap-2 px-3.5 py-2 text-xs font-medium rounded-lg border border-white/15 bg-white/5 hover:bg-white/10 text-white transition-colors whitespace-nowrap shrink-0"
            >
              <Download className="w-3.5 h-3.5" />
              {downloading ? 'Preparing PDF...' : 'Download PDF'}
            </button>
            <button
              onClick={() => window.print()}
              className="inline-flex items-center gap-2 px-3.5 py-2 text-xs font-medium rounded-lg border border-white/15 bg-white/5 hover:bg-white/10 text-white transition-colors whitespace-nowrap shrink-0"
            >
              <Printer className="w-3.5 h-3.5" />
              Print
            </button>
            <button
              onClick={onClose}
              aria-label="Close invoice viewer"
              className="p-2 rounded-lg border border-white/10 hover:bg-white/10 text-zinc-400 hover:text-white transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {feedback && (
          <div
            className={`no-print flex items-center gap-2.5 px-4 py-3 rounded-xl border text-sm ${
              feedback.type === 'success'
                ? 'bg-emerald-950/50 border-emerald-500/30 text-emerald-300'
                : 'bg-rose-950/50 border-rose-500/30 text-rose-300'
            }`}
          >
            {feedback.type === 'success' ? <CheckCircle2 className="w-4 h-4 shrink-0" /> : <AlertCircle className="w-4 h-4 shrink-0" />}
            <span>{feedback.msg}</span>
          </div>
        )}

        {showReceiptForm && canPay && (
          <form onSubmit={handleManualSubmit} className="no-print bg-[#101015] border border-orange-500/30 rounded-xl p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-display text-base font-semibold text-white">Submit Manual Payment Proof</h3>
              <span className="font-mono text-xs text-zinc-400">Amount Due: {formatCurrency(invoice.total_cents, invoice.currency)}</span>
            </div>
            <p className="text-xs text-zinc-400 leading-relaxed">
              {settings.payment_instructions || 'Transfer the exact invoice amount and upload your wire or receipt confirmation below.'}
            </p>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs text-zinc-400 mb-1.5">Payment Method</label>
                <select
                  value={method}
                  onChange={(e) => setMethod(e.target.value as any)}
                  className="w-full px-3 py-2 text-sm bg-[#09090C] border border-white/15 rounded-lg text-white focus:outline-none focus:border-orange-500"
                >
                  <option value="Bank Transfer">Bank Transfer</option>
                  <option value="Manual Payment">Manual Payment</option>
                  <option value="Cryptocurrency">Cryptocurrency</option>
                </select>
              </div>
              <div>
                <label className="block text-xs text-zinc-400 mb-1.5">Transaction Reference / Wire ID</label>
                <input
                  type="text"
                  required
                  value={txRef}
                  onChange={(e) => setTxRef(e.target.value)}
                  placeholder="e.g. WIRE-8829104"
                  className="w-full px-3 py-2 text-sm bg-[#09090C] border border-white/15 rounded-lg text-white focus:outline-none focus:border-orange-500"
                />
              </div>
              <div>
                <label className="block text-xs text-zinc-400 mb-1.5">Upload Receipt (JPG, PNG, PDF max 5MB)</label>
                <input
                  type="file"
                  required
                  accept=".jpg,.jpeg,.png,.webp,.pdf"
                  onChange={(e) => setReceiptFile(e.target.files?.[0] || null)}
                  className="w-full text-xs text-zinc-300 file:mr-3 file:py-1.5 file:px-3 file:rounded-md file:border-0 file:text-xs file:font-semibold file:bg-orange-600 file:text-white hover:file:bg-orange-500"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowReceiptForm(false)}
                className="px-4 py-2 text-xs text-zinc-300 hover:text-white border border-white/10 rounded-lg"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="px-4 py-2 text-xs font-semibold bg-orange-600 hover:bg-orange-500 text-white rounded-lg disabled:opacity-50"
              >
                {submitting ? 'Uploading...' : 'Submit for Verification'}
              </button>
            </div>
          </form>
        )}

        {/* EXACT OBSIDIAN INVOICE SHEET MATCHING UPLOADED REFERENCE 2 */}
        <div className="print-only-sheet bg-black text-white border border-white/10 rounded-xl overflow-hidden shadow-2xl">
          {/* Top Iridescent Blue-to-Molten-Amber Ribbon Wave Banner */}
          <div className="relative w-full h-36 bg-black overflow-hidden">
            <svg viewBox="0 0 860 150" preserveAspectRatio="none" className="w-full h-full">
              <defs>
                <linearGradient id="inv-wave-blue" x1="0%" y1="40%" x2="55%" y2="50%">
                  <stop offset="0%" stopColor="#050C18" />
                  <stop offset="48%" stopColor="#1E528E" />
                  <stop offset="100%" stopColor="#04070D" />
                </linearGradient>
                <linearGradient id="inv-wave-amber" x1="25%" y1="65%" x2="100%" y2="25%">
                  <stop offset="0%" stopColor="#0A192F" />
                  <stop offset="30%" stopColor="#26100A" />
                  <stop offset="60%" stopColor="#B83514" />
                  <stop offset="86%" stopColor="#FF6B2C" />
                  <stop offset="100%" stopColor="#D9480F" />
                </linearGradient>
              </defs>
              <rect width="860" height="150" fill="#000000" />
              <path
                d="M0,58 C140,42 300,15 470,88 C330,136 160,132 0,115 Z"
                fill="url(#inv-wave-blue)"
              />
              <path
                d="M190,145 C295,12 490,4 670,62 C760,91 820,98 860,96 L860,26 C770,18 650,0 450,4 C280,8 175,68 125,148 Z"
                fill="url(#inv-wave-amber)"
              />
              <path
                d="M195,148 C300,38 475,26 625,84 C720,120 795,130 860,132 L860,150 L160,150 Z"
                fill="#000000"
                fillOpacity="0.82"
              />
            </svg>
          </div>

          <div className="px-8 md:px-12 pb-12 -mt-3">
            {/* Circular White Emblem + Monospace Invoice Number */}
            <div className="flex items-start justify-between gap-4 mb-6">
              <div className="w-10 h-10 rounded-full bg-white text-black flex items-center justify-center font-display font-extrabold text-sm tracking-tight">
                HX
              </div>
              <div className="text-right">
                <div className="font-mono text-sm font-semibold text-zinc-200 tracking-wide">{invoice.invoice_number}</div>
                <div className={`font-mono text-xs mt-0.5 uppercase tracking-wider ${statusColorClass(invoice.status)}`}>
                  {invoice.status}
                </div>
              </div>
            </div>

            {/* Giant Bold INVOICE Display Header */}
            <h2 className="font-display text-5xl md:text-6xl font-extrabold tracking-tight text-white mb-10">INVOICE</h2>

            {/* 3-Column Metadata: FROM | BILL TO | ISSUED & DUE */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-12 text-xs leading-relaxed">
              <div>
                <div className="text-[11px] font-semibold tracking-wider text-zinc-500 mb-2">FROM</div>
                <div className="text-sm font-semibold text-white mb-1">{settings.company_name || 'HelzerX Technologies'}</div>
                <div className="text-zinc-400 space-y-0.5 whitespace-pre-line">
                  <div>{settings.company_email || 'billing@helzerx.cyou'}</div>
                  <div>{settings.company_address || '548 Market Street, Suite 74200\nSan Francisco, CA 94104\nUnited States'}</div>
                  <div>{settings.company_phone || '+1 (415) 890-4420'}</div>
                  <div>{settings.company_website || 'customers.helzerx.cyou'}</div>
                </div>
              </div>

              <div>
                <div className="text-[11px] font-semibold tracking-wider text-zinc-500 mb-2">BILL TO</div>
                <div className="text-sm font-semibold text-white mb-1">{billing.full_name || invoice.customer_name || 'Customer'}</div>
                <div className="text-zinc-400 space-y-0.5">
                  {billing.company_name && <div className="text-zinc-300">{billing.company_name}</div>}
                  <div>{billing.email || invoice.customer_email}</div>
                  {billing.mobile && <div>{billing.mobile}</div>}
                  {billing.billing_address && <div>{billing.billing_address}</div>}
                  {(billing.city || billing.postal_code) && (
                    <div>{[billing.city, billing.postal_code].filter(Boolean).join(', ')}</div>
                  )}
                  {billing.country && <div>{billing.country}</div>}
                  {invoice.order_number && <div className="font-mono text-zinc-500 pt-1">Order: {invoice.order_number}</div>}
                </div>
              </div>

              <div className="md:text-right space-y-4">
                <div>
                  <div className="text-[11px] font-semibold tracking-wider text-zinc-500 mb-1">ISSUED</div>
                  <div className="text-sm text-zinc-200 tabular-nums">{formatDate(invoice.issue_date)}</div>
                </div>
                <div>
                  <div className="text-[11px] font-semibold tracking-wider text-zinc-500 mb-1">DUE</div>
                  <div className="text-sm text-zinc-200 tabular-nums">{formatDate(invoice.due_date)}</div>
                </div>
              </div>
            </div>

            {/* Clean Line Items Table */}
            <div className="overflow-x-auto mb-8">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-white/15 text-[11px] font-semibold tracking-wider text-zinc-500">
                    <th className="py-3 pr-4">DESCRIPTION</th>
                    <th className="py-3 px-4 text-right">QTY</th>
                    <th className="py-3 px-4 text-right">RATE</th>
                    <th className="py-3 pl-4 text-right">AMOUNT</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/10 text-sm">
                  {(invoice.items || []).map((item) => (
                    <tr key={item.id}>
                      <td className="py-4 pr-4 text-white">{item.description}</td>
                      <td className="py-4 px-4 text-right text-zinc-300 font-mono tabular-nums">{item.quantity}</td>
                      <td className="py-4 px-4 text-right text-zinc-300 font-mono tabular-nums">
                        {formatCurrency(item.unit_price_cents, invoice.currency)}
                      </td>
                      <td className="py-4 pl-4 text-right font-semibold text-white font-mono tabular-nums">
                        {formatCurrency(item.amount_cents, invoice.currency)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Right-aligned Totals */}
            <div className="flex justify-end mb-12">
              <div className="w-full max-w-xs space-y-2 text-sm">
                <div className="flex justify-between text-zinc-400">
                  <span>Subtotal</span>
                  <span className="font-mono tabular-nums text-zinc-200">{formatCurrency(invoice.subtotal_cents, invoice.currency)}</span>
                </div>
                {invoice.discount_cents > 0 && (
                  <div className="flex justify-between text-emerald-400">
                    <span>Discount</span>
                    <span className="font-mono tabular-nums">-{formatCurrency(invoice.discount_cents, invoice.currency)}</span>
                  </div>
                )}
                <div className="flex justify-between text-zinc-400">
                  <span>Tax ({taxPct}%)</span>
                  <span className="font-mono tabular-nums text-zinc-200">{formatCurrency(invoice.tax_cents, invoice.currency)}</span>
                </div>
                <div className="flex justify-between pt-3 border-t border-white/15 text-base font-bold text-white">
                  <span>Total ({invoice.currency})</span>
                  <span className="font-mono tabular-nums">{formatCurrency(invoice.total_cents, invoice.currency)}</span>
                </div>
              </div>
            </div>

            {/* Payment Details & Notes */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 pt-6 border-t border-white/10 text-xs leading-relaxed">
              <div>
                <div className="text-[11px] font-semibold tracking-wider text-zinc-500 mb-2">PAYMENT DETAILS</div>
                <div className="text-zinc-400 space-y-1">
                  <div>Payment Method: <span className="text-zinc-200">{invoice.payment_method}</span></div>
                  <div>Payment Status: <span className={statusColorClass(invoice.status)}>{invoice.status}</span></div>
                  <div>Bank: <span className="text-zinc-200">{settings.bank_name || 'Mercury Business Banking'}</span></div>
                  <div>Account: <span className="font-mono text-zinc-200">{settings.bank_account_number || '9800 4412 7820 1190'}</span></div>
                  <div>Routing/SWIFT: <span className="font-mono text-zinc-200">{settings.bank_routing_swift || 'ELVBUS33 / 021000021'}</span></div>
                </div>
              </div>
              <div>
                <div className="text-[11px] font-semibold tracking-wider text-zinc-500 mb-2">NOTES</div>
                <p className="text-zinc-400 whitespace-pre-line">{invoice.notes || 'Thank you for your business!'}</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
