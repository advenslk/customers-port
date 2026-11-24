import React, { useEffect, useState } from 'react';
import { Check, FileText, ShieldAlert, Tag, X } from 'lucide-react';
import { Product, UserProfile } from '../types';
import { apiFetch, downloadInvoicePdf, formatCurrency } from '../lib/api';

interface CheckoutSectionProps {
  products: Product[];
  user: UserProfile | null;
  settings: Record<string, string>;
  selectedProductId: number | null;
  selectedPackageId: number | null;
  onSelectProductPackage: (productId: number, packageId: number) => void;
  onOrderCompleted: (result: {
    order_id: number;
    order_number: string;
    invoice_id: number;
    invoice_number: string;
    user: UserProfile;
  }) => void;
  onNotify: (type: 'success' | 'error', msg: string) => void;
}

const POLICY_DOCS: Record<'terms' | 'privacy' | 'refund', { title: string; body: string }> = {
  terms: {
    title: 'Terms & Conditions — HelzerX Technologies',
    body: 'By submitting an order through customers.helzerx.cyou, you agree to provide accurate billing information and adhere to HelzerX acceptable use standards. Services are provisioned following payment verification. Automated invoices carry a 7-day settlement window unless otherwise specified.',
  },
  privacy: {
    title: 'Privacy Policy — HelzerX Technologies',
    body: 'HelzerX Technologies collects personal and billing metadata strictly for order fulfillment, tax invoicing, fraud prevention, and support communications. Payment card data is never stored on HelzerX servers. Customer records are isolated with role-based access control.',
  },
  refund: {
    title: 'Refund Policy — HelzerX Technologies',
    body: 'Unpaid invoices may be cancelled directly prior to fulfillment. Confirmed digital infrastructure and bespoke engineering retainers may be reviewed for pro-rated or full refunds within 7 calendar days via the Customer Portal Refund Request workflow.',
  },
};

export function CheckoutSection({
  products,
  user,
  settings,
  selectedProductId,
  selectedPackageId,
  onSelectProductPackage,
  onOrderCompleted,
  onNotify,
}: CheckoutSectionProps) {
  const activeProduct = products.find((p) => p.id === selectedProductId) || products[0] || null;
  const activePackage =
    activeProduct?.packages.find((pkg) => pkg.id === selectedPackageId) || activeProduct?.packages[0] || null;

  // Personal Information
  const [fullName, setFullName] = useState(user?.full_name || '');
  const [email, setEmail] = useState(user?.email || '');
  const [password, setPassword] = useState('');
  const [mobile, setMobile] = useState(user?.mobile || '');
  const [country, setCountry] = useState(user?.country || '');
  const [city, setCity] = useState(user?.city || '');
  const [billingAddress, setBillingAddress] = useState(user?.billing_address || '');
  const [postalCode, setPostalCode] = useState(user?.postal_code || '');
  const [companyName, setCompanyName] = useState(user?.company_name || '');
  const [discordUsername, setDiscordUsername] = useState(user?.discord_username || '');

  // Order Information
  const [subscriptionDuration, setSubscriptionDuration] = useState('Monthly (30 Days)');
  const [quantity, setQuantity] = useState(1);
  const [requirements, setRequirements] = useState('');
  const [specialInstructions, setSpecialInstructions] = useState('');
  const [promoCodeInput, setPromoCodeInput] = useState('');
  const [appliedPromo, setAppliedPromo] = useState<{ code: string; discount_cents: number } | null>(null);
  const [promoError, setPromoError] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<'Bank Transfer' | 'Manual Payment' | 'Stripe' | 'Cryptocurrency'>('Bank Transfer');

  // Legal Checkboxes
  const [acceptTerms, setAcceptTerms] = useState(false);
  const [acceptPrivacy, setAcceptPrivacy] = useState(false);
  const [acceptRefund, setAcceptRefund] = useState(false);
  const [policyModal, setPolicyModal] = useState<'terms' | 'privacy' | 'refund' | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (user) {
      setFullName(user.full_name || '');
      setEmail(user.email || '');
      setMobile(user.mobile || '');
      setCountry(user.country || '');
      setCity(user.city || '');
      setBillingAddress(user.billing_address || '');
      setPostalCode(user.postal_code || '');
      setCompanyName(user.company_name || '');
      setDiscordUsername(user.discord_username || '');
    }
  }, [user]);

  useEffect(() => {
    if (activePackage) {
      const cycleMap: Record<string, string> = {
        monthly: 'Monthly (30 Days)',
        quarterly: 'Quarterly (90 Days)',
        annual: 'Annual (365 Days)',
        one_time: 'One-Time License / Sprint',
      };
      setSubscriptionDuration(cycleMap[activePackage.billing_cycle] || `${activePackage.duration_days} Days`);
    }
  }, [activePackage?.id]);

  const subtotalCents = (activePackage?.price_cents || 0) * quantity;
  const discountCents = appliedPromo ? Math.min(subtotalCents, appliedPromo.discount_cents) : 0;
  const taxRateBps = Number(settings.tax_rate_bps ?? 850);
  const taxableCents = Math.max(0, subtotalCents - discountCents);
  const taxCents = Math.round((taxableCents * taxRateBps) / 10000);
  const totalCents = taxableCents + taxCents;

  const handleValidatePromo = async () => {
    if (!promoCodeInput.trim()) return;
    setPromoError('');
    try {
      const res = await apiFetch<{ valid: boolean; code: string; discount_cents: number }>('/api/coupons/validate', {
        method: 'POST',
        body: JSON.stringify({ code: promoCodeInput.trim(), subtotal_cents: subtotalCents }),
      });
      setAppliedPromo({ code: res.code, discount_cents: res.discount_cents });
      onNotify('success', `Promo code ${res.code} applied.`);
    } catch (err: any) {
      setAppliedPromo(null);
      setPromoError(err.message);
    }
  };

  const handleSubmitOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeProduct || !activePackage) {
      onNotify('error', 'Please select a product and package.');
      return;
    }
    if (!acceptTerms || !acceptPrivacy || !acceptRefund) {
      onNotify('error', 'Please accept Terms & Conditions, Privacy Policy, and Refund Policy.');
      return;
    }
    setSubmitting(true);
    try {
      const result = await apiFetch<any>('/api/checkout', {
        method: 'POST',
        body: JSON.stringify({
          full_name: fullName,
          email,
          password: user ? undefined : password,
          mobile,
          country,
          city,
          billing_address: billingAddress,
          postal_code: postalCode,
          company_name: companyName,
          discord_username: discordUsername,
          product_id: activeProduct.id,
          package_id: activePackage.id,
          subscription_duration: subscriptionDuration,
          quantity,
          requirements,
          special_instructions: specialInstructions,
          promo_code: appliedPromo?.code || '',
          payment_method: paymentMethod,
          accept_terms: true,
          accept_privacy: true,
          accept_refund: true,
        }),
      });

      // Automatically trigger PDF download as required!
      try {
        await downloadInvoicePdf(result.invoice_id, result.invoice_number);
      } catch {
        // user can also download manually from the viewer
      }

      onOrderCompleted(result);
    } catch (err: any) {
      onNotify('error', err.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section id="checkout" className="max-w-7xl mx-auto px-6 py-20 border-t border-white/10">
      <div className="mb-10 max-w-2xl">
        <div className="text-xs font-medium text-orange-400 mb-2">Enterprise Order Configuration</div>
        <h2 className="font-display text-3xl md:text-4xl font-bold text-white tracking-tight" style={{ textWrap: 'balance' }}>
          Customer Registration &amp; Automated Invoicing
        </h2>
        <p className="text-sm text-zinc-400 mt-3 leading-relaxed">
          Complete your service configuration and billing profile below. Submitting generates an instant order ID and a downloadable obsidian PDF invoice.
        </p>
      </div>

      <form onSubmit={handleSubmitOrder} className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Left 8 Columns: Customer + Order Forms */}
        <div className="lg:col-span-8 space-y-8">
          {/* Step 1: Personal & Billing Information */}
          <div className="bg-[#0D0D11] border border-white/10 rounded-2xl p-6 md:p-8">
            <div className="flex items-center justify-between mb-6 pb-4 border-b border-white/10">
              <div>
                <h3 className="font-display text-lg font-semibold text-white">01. Personal &amp; Billing Information</h3>
                <p className="text-xs text-zinc-400 mt-0.5">
                  {user ? `Signed in as ${user.customer_code} (${user.email})` : 'New customers are automatically registered with a unique Customer ID.'}
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-zinc-300 mb-1.5">Full Name *</label>
                <input required value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Ana Morales" className="w-full px-3.5 py-2.5 text-sm bg-[#070709] border border-white/15 rounded-lg text-white focus:outline-none focus:border-orange-500" />
              </div>
              <div>
                <label className="block text-xs font-medium text-zinc-300 mb-1.5">Email Address *</label>
                <input type="email" required disabled={Boolean(user)} value={email} onChange={(e) => setEmail(e.target.value)} placeholder="ana@company.com" className="w-full px-3.5 py-2.5 text-sm bg-[#070709] border border-white/15 rounded-lg text-white disabled:opacity-60 focus:outline-none focus:border-orange-500" />
              </div>
              {!user && (
                <div className="md:col-span-2">
                  <label className="block text-xs font-medium text-zinc-300 mb-1.5">Account Password (min 8 characters) *</label>
                  <input type="password" minLength={8} required value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Create a secure portal password" className="w-full px-3.5 py-2.5 text-sm bg-[#070709] border border-white/15 rounded-lg text-white focus:outline-none focus:border-orange-500" />
                </div>
              )}
              <div>
                <label className="block text-xs font-medium text-zinc-300 mb-1.5">Mobile Number *</label>
                <input required value={mobile} onChange={(e) => setMobile(e.target.value)} placeholder="+1 415 555 0199" className="w-full px-3.5 py-2.5 text-sm bg-[#070709] border border-white/15 rounded-lg text-white focus:outline-none focus:border-orange-500" />
              </div>
              <div>
                <label className="block text-xs font-medium text-zinc-300 mb-1.5">Country *</label>
                <input required value={country} onChange={(e) => setCountry(e.target.value)} placeholder="United States" className="w-full px-3.5 py-2.5 text-sm bg-[#070709] border border-white/15 rounded-lg text-white focus:outline-none focus:border-orange-500" />
              </div>
              <div>
                <label className="block text-xs font-medium text-zinc-300 mb-1.5">City *</label>
                <input required value={city} onChange={(e) => setCity(e.target.value)} placeholder="San Francisco" className="w-full px-3.5 py-2.5 text-sm bg-[#070709] border border-white/15 rounded-lg text-white focus:outline-none focus:border-orange-500" />
              </div>
              <div>
                <label className="block text-xs font-medium text-zinc-300 mb-1.5">Postal Code *</label>
                <input required value={postalCode} onChange={(e) => setPostalCode(e.target.value)} placeholder="94104" className="w-full px-3.5 py-2.5 text-sm bg-[#070709] border border-white/15 rounded-lg text-white focus:outline-none focus:border-orange-500" />
              </div>
              <div className="md:col-span-2">
                <label className="block text-xs font-medium text-zinc-300 mb-1.5">Billing Address *</label>
                <input required value={billingAddress} onChange={(e) => setBillingAddress(e.target.value)} placeholder="548 Market Street, Suite 400" className="w-full px-3.5 py-2.5 text-sm bg-[#070709] border border-white/15 rounded-lg text-white focus:outline-none focus:border-orange-500" />
              </div>
              <div>
                <label className="block text-xs font-medium text-zinc-300 mb-1.5">Company Name (Optional)</label>
                <input value={companyName} onChange={(e) => setCompanyName(e.target.value)} placeholder="Acme Cloud Corp" className="w-full px-3.5 py-2.5 text-sm bg-[#070709] border border-white/15 rounded-lg text-white focus:outline-none focus:border-orange-500" />
              </div>
              <div>
                <label className="block text-xs font-medium text-zinc-300 mb-1.5">Discord Username (Optional)</label>
                <input value={discordUsername} onChange={(e) => setDiscordUsername(e.target.value)} placeholder="@username" className="w-full px-3.5 py-2.5 text-sm bg-[#070709] border border-white/15 rounded-lg text-white focus:outline-none focus:border-orange-500" />
              </div>
            </div>
          </div>

          {/* Step 2: Order & Service Configuration */}
          <div className="bg-[#0D0D11] border border-white/10 rounded-2xl p-6 md:p-8">
            <div className="mb-6 pb-4 border-b border-white/10">
              <h3 className="font-display text-lg font-semibold text-white">02. Order &amp; Service Configuration</h3>
              <p className="text-xs text-zinc-400 mt-0.5">Select your product tier, subscription duration, and deployment specifications.</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-zinc-300 mb-1.5">Product / Service *</label>
                <select
                  value={activeProduct?.id || ''}
                  onChange={(e) => {
                    const nextProd = products.find((p) => p.id === Number(e.target.value));
                    if (nextProd && nextProd.packages[0]) {
                      onSelectProductPackage(nextProd.id, nextProd.packages[0].id);
                      setAppliedPromo(null);
                    }
                  }}
                  className="w-full px-3.5 py-2.5 text-sm bg-[#070709] border border-white/15 rounded-lg text-white focus:outline-none focus:border-orange-500"
                >
                  {products.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-zinc-300 mb-1.5">Selected Package *</label>
                <select
                  value={activePackage?.id || ''}
                  onChange={(e) => {
                    if (activeProduct) {
                      onSelectProductPackage(activeProduct.id, Number(e.target.value));
                      setAppliedPromo(null);
                    }
                  }}
                  className="w-full px-3.5 py-2.5 text-sm bg-[#070709] border border-white/15 rounded-lg text-white focus:outline-none focus:border-orange-500"
                >
                  {(activeProduct?.packages || []).map((pkg) => (
                    <option key={pkg.id} value={pkg.id}>
                      {pkg.name} — {formatCurrency(pkg.price_cents, pkg.currency)}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-zinc-300 mb-1.5">Subscription Duration *</label>
                <input
                  required
                  value={subscriptionDuration}
                  onChange={(e) => setSubscriptionDuration(e.target.value)}
                  className="w-full px-3.5 py-2.5 text-sm bg-[#070709] border border-white/15 rounded-lg text-white focus:outline-none focus:border-orange-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-zinc-300 mb-1.5">Quantity *</label>
                <input
                  type="number"
                  min={1}
                  max={100}
                  required
                  value={quantity}
                  onChange={(e) => {
                    setQuantity(Math.max(1, Number(e.target.value) || 1));
                    setAppliedPromo(null);
                  }}
                  className="w-full px-3.5 py-2.5 text-sm font-mono bg-[#070709] border border-white/15 rounded-lg text-white focus:outline-none focus:border-orange-500"
                />
              </div>
              <div className="md:col-span-2">
                <label className="block text-xs font-medium text-zinc-300 mb-1.5">Additional Requirements</label>
                <textarea
                  rows={2}
                  value={requirements}
                  onChange={(e) => setRequirements(e.target.value)}
                  placeholder="Preferred deployment region, OS image, domain bindings, or architecture constraints..."
                  className="w-full px-3.5 py-2.5 text-sm bg-[#070709] border border-white/15 rounded-lg text-white focus:outline-none focus:border-orange-500"
                />
              </div>
              <div className="md:col-span-2">
                <label className="block text-xs font-medium text-zinc-300 mb-1.5">Special Instructions (Appears on Invoice)</label>
                <textarea
                  rows={2}
                  value={specialInstructions}
                  onChange={(e) => setSpecialInstructions(e.target.value)}
                  placeholder="PO number, finance department notes, or tax VAT ID..."
                  className="w-full px-3.5 py-2.5 text-sm bg-[#070709] border border-white/15 rounded-lg text-white focus:outline-none focus:border-orange-500"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Right 4 Columns: Summary, Promo, Payment Method, Legal Consent */}
        <div className="lg:col-span-4 space-y-6 lg:sticky lg:top-24">
          <div className="bg-[#0D0D11] border border-white/15 rounded-2xl p-6 space-y-5">
            <div className="flex items-center justify-between pb-4 border-b border-white/10">
              <h3 className="font-display text-lg font-semibold text-white">Order Summary</h3>
              <FileText className="w-4 h-4 text-orange-400" />
            </div>

            {activeProduct && activePackage && (
              <div className="space-y-1 text-sm">
                <div className="font-semibold text-white">{activeProduct.name}</div>
                <div className="text-xs text-zinc-400">
                  {activePackage.name} · {subscriptionDuration} · Qty {quantity}
                </div>
              </div>
            )}

            {/* Promo Code */}
            <div>
              <label className="block text-xs text-zinc-400 mb-1.5">Promo Code (try HELZERX15)</label>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Tag className="w-3.5 h-3.5 text-zinc-500 absolute left-3 top-3" />
                  <input
                    value={promoCodeInput}
                    onChange={(e) => setPromoCodeInput(e.target.value.toUpperCase())}
                    placeholder="HELZERX15"
                    className="w-full pl-8 pr-3 py-2 text-xs font-mono uppercase bg-[#070709] border border-white/15 rounded-lg text-white focus:outline-none focus:border-orange-500"
                  />
                </div>
                <button
                  type="button"
                  onClick={handleValidatePromo}
                  className="px-3.5 py-2 text-xs font-semibold rounded-lg border border-white/15 bg-white/5 hover:bg-white/10 text-white whitespace-nowrap shrink-0"
                >
                  Apply
                </button>
              </div>
              {promoError && <p className="text-xs text-rose-400 mt-1">{promoError}</p>}
              {appliedPromo && (
                <p className="text-xs text-emerald-400 mt-1">
                  Code {appliedPromo.code} applied (-{formatCurrency(appliedPromo.discount_cents)})
                </p>
              )}
            </div>

            {/* Preferred Payment Method */}
            <div>
              <label className="block text-xs text-zinc-400 mb-1.5">Intended Payment Method</label>
              <select
                value={paymentMethod}
                onChange={(e) => setPaymentMethod(e.target.value as any)}
                className="w-full px-3 py-2 text-sm bg-[#070709] border border-white/15 rounded-lg text-white focus:outline-none focus:border-orange-500"
              >
                <option value="Bank Transfer">Bank Transfer / Wire</option>
                <option value="Manual Payment">Manual Payment Receipt</option>
                <option value="Stripe">Stripe Card Checkout</option>
                <option value="Cryptocurrency">Enterprise Crypto Settlement</option>
              </select>
            </div>

            {/* Pricing Breakdown */}
            <div className="space-y-2 pt-4 border-t border-white/10 text-sm">
              <div className="flex justify-between text-zinc-400">
                <span>Subtotal</span>
                <span className="font-mono tabular-nums text-zinc-200">{formatCurrency(subtotalCents)}</span>
              </div>
              {discountCents > 0 && (
                <div className="flex justify-between text-emerald-400">
                  <span>Promo Discount</span>
                  <span className="font-mono tabular-nums">-{formatCurrency(discountCents)}</span>
                </div>
              )}
              <div className="flex justify-between text-zinc-400">
                <span>Tax ({(taxRateBps / 100).toFixed(2).replace(/\.00$/, '')}%)</span>
                <span className="font-mono tabular-nums text-zinc-200">{formatCurrency(taxCents)}</span>
              </div>
              <div className="flex justify-between pt-3 border-t border-white/10 text-base font-bold text-white">
                <span>Invoice Total</span>
                <span className="font-mono tabular-nums text-orange-400">{formatCurrency(totalCents)}</span>
              </div>
            </div>

            {/* Mandatory Legal Policies */}
            <div className="space-y-2.5 pt-3 border-t border-white/10 text-xs text-zinc-300">
              <label className="flex items-start gap-2.5 cursor-pointer">
                <input type="checkbox" checked={acceptTerms} onChange={(e) => setAcceptTerms(e.target.checked)} className="mt-0.5 accent-orange-500" />
                <span>
                  I accept the{' '}
                  <button type="button" onClick={() => setPolicyModal('terms')} className="text-orange-400 underline hover:text-orange-300">
                    Terms &amp; Conditions
                  </button>
                </span>
              </label>
              <label className="flex items-start gap-2.5 cursor-pointer">
                <input type="checkbox" checked={acceptPrivacy} onChange={(e) => setAcceptPrivacy(e.target.checked)} className="mt-0.5 accent-orange-500" />
                <span>
                  I accept the{' '}
                  <button type="button" onClick={() => setPolicyModal('privacy')} className="text-orange-400 underline hover:text-orange-300">
                    Privacy Policy
                  </button>
                </span>
              </label>
              <label className="flex items-start gap-2.5 cursor-pointer">
                <input type="checkbox" checked={acceptRefund} onChange={(e) => setAcceptRefund(e.target.checked)} className="mt-0.5 accent-orange-500" />
                <span>
                  I accept the{' '}
                  <button type="button" onClick={() => setPolicyModal('refund')} className="text-orange-400 underline hover:text-orange-300">
                    Refund Policy
                  </button>
                </span>
              </label>
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="w-full flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-orange-600 hover:bg-orange-500 text-white text-sm font-semibold transition-colors disabled:opacity-50"
            >
              <Check className="w-4 h-4" />
              {submitting ? 'Generating Order & PDF Invoice...' : 'Submit Order & Generate Invoice'}
            </button>

            <div className="flex items-start gap-2 text-[11px] text-zinc-500 leading-relaxed">
              <ShieldAlert className="w-3.5 h-3.5 text-zinc-400 shrink-0 mt-0.5" />
              <span>Invoices are generated as Unpaid and only transition to Paid after verified payment settlement.</span>
            </div>
          </div>
        </div>
      </form>

      {policyModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-lg bg-[#0D0D11] border border-white/15 rounded-2xl p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h4 className="font-display text-lg font-bold text-white">{POLICY_DOCS[policyModal].title}</h4>
              <button onClick={() => setPolicyModal(null)} className="p-1.5 text-zinc-400 hover:text-white">
                <X className="w-4 h-4" />
              </button>
            </div>
            <p className="text-sm text-zinc-300 leading-relaxed">{POLICY_DOCS[policyModal].body}</p>
            <div className="flex justify-end">
              <button
                onClick={() => setPolicyModal(null)}
                className="px-4 py-2 text-xs font-semibold bg-orange-600 hover:bg-orange-500 text-white rounded-lg"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
