import React, { useEffect, useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  FileText,
  Lock,
  Menu,
  Server,
  ShieldCheck,
  X,
} from 'lucide-react';
import { Category, Invoice, Product, UserProfile } from './types';
import { apiFetch, formatCurrency } from './lib/api';
import { HelzerXLogoMark, HeroSculpturalPrism } from './components/HelzerXBrand';
import { AuthModal } from './components/AuthModal';
import { CheckoutSection } from './components/CheckoutSection';
import { CustomerDashboard } from './components/CustomerDashboard';
import { AdminDashboard } from './components/AdminDashboard';
import { InvoiceModal } from './components/InvoiceModal';

type AppView = 'storefront' | 'customer' | 'admin';

export default function App() {
  const [view, setView] = useState<AppView>('storefront');
  const [user, setUser] = useState<UserProfile | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [settings, setSettings] = useState<Record<string, string>>({});
  const [activeCategory, setActiveCategory] = useState<number | 'ALL'>('ALL');
  const [selectedProductId, setSelectedProductId] = useState<number | null>(null);
  const [selectedPackageId, setSelectedPackageId] = useState<number | null>(null);

  const [authModalMode, setAuthModalMode] = useState<'login' | 'register' | 'forgot' | null>(null);
  const [activeInvoice, setActiveInvoice] = useState<Invoice | null>(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [toast, setToast] = useState<{ type: 'success' | 'error'; msg: string } | null>(null);

  const showToast = (type: 'success' | 'error', msg: string) => {
    setToast({ type, msg });
    setTimeout(() => {
      setToast((prev) => (prev?.msg === msg ? null : prev));
    }, 5500);
  };

  const loadCatalog = async () => {
    try {
      const data = await apiFetch<{ categories: Category[]; products: Product[]; settings: Record<string, string> }>('/api/catalog');
      setCategories(data.categories || []);
      setProducts(data.products || []);
      setSettings(data.settings || {});
      if (data.products?.length && !selectedProductId) {
        setSelectedProductId(data.products[0].id);
        setSelectedPackageId(data.products[0].packages[0]?.id || null);
      }
    } catch (err: any) {
      showToast('error', err.message);
    }
  };

  const loadSession = async () => {
    try {
      const data = await apiFetch<{ user: UserProfile }>('/api/auth/me');
      setUser(data.user);
    } catch {
      setUser(null);
    }
  };

  useEffect(() => {
    loadCatalog();
    loadSession();

    const params = new URLSearchParams(window.location.search);
    const stripeStatus = params.get('stripe_status');
    const invNum = params.get('invoice');
    if (stripeStatus === 'success') {
      showToast('success', `Stripe checkout completed for ${invNum || 'your invoice'}. Verification updates momentarily.`);
      window.history.replaceState({}, '', '/');
    } else if (stripeStatus === 'cancelled') {
      showToast('error', `Stripe checkout cancelled for ${invNum || 'invoice'}.`);
      window.history.replaceState({}, '', '/');
    }
  }, []);

  const handleLogout = async () => {
    try {
      await apiFetch('/api/auth/logout', { method: 'POST' });
    } catch {
      // ignore
    }
    setUser(null);
    setView('storefront');
    showToast('success', 'Signed out cleanly.');
  };

  const handleSelectPackageAndScroll = (productId: number, packageId: number) => {
    setSelectedProductId(productId);
    setSelectedPackageId(packageId);
    setView('storefront');
    setTimeout(() => {
      document.getElementById('checkout')?.scrollIntoView({ behavior: 'smooth' });
    }, 80);
  };

  const handleOpenPortal = () => {
    if (!user) {
      setAuthModalMode('login');
      return;
    }
    if (user.role === 'admin' || user.role === 'super_admin') {
      setView('admin');
    } else {
      setView('customer');
    }
  };

  const filteredProducts = products.filter((p) => activeCategory === 'ALL' || p.category_id === activeCategory);
  const isAdmin = user?.role === 'admin' || user?.role === 'super_admin';

  return (
    <div className="min-h-screen bg-[#070709] text-[#F5F5F7] flex flex-col">
      {/* Maintenance Notification Banner (if configured by Admin) */}
      {settings.maintenance_banner && (
        <div className="no-print bg-orange-950/80 border-b border-orange-500/30 px-4 py-2 text-center text-xs text-orange-200 flex items-center justify-center gap-2">
          <AlertTriangle className="w-3.5 h-3.5 text-orange-400 shrink-0" />
          <span>{settings.maintenance_banner}</span>
        </div>
      )}

      {/* Top Bar Contract: 3 clean zones separated by gap-8 */}
      <header className="no-print sticky top-0 z-40 bg-[#070709]/90 backdrop-blur-md border-b border-white/10">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between gap-8">
          {/* Zone 1: Single-line Brand Wordmark */}
          <button
            onClick={() => setView('storefront')}
            className="flex items-center gap-2.5 text-left whitespace-nowrap shrink-0 focus:outline-none"
          >
            <HelzerXLogoMark className="w-7 h-7" />
            <span className="font-display text-lg font-bold tracking-tight text-white">HelzerX</span>
          </button>

          {/* Zone 2: 4 Single-line Navigation Links */}
          <nav className="hidden md:flex items-center gap-7 text-sm font-medium text-zinc-400">
            <button
              onClick={() => {
                setView('storefront');
                setTimeout(() => document.getElementById('catalog')?.scrollIntoView({ behavior: 'smooth' }), 50);
              }}
              className={`hover:text-white transition-colors whitespace-nowrap shrink-0 ${view === 'storefront' ? 'text-white' : ''}`}
            >
              Services
            </button>
            <button
              onClick={() => {
                setView('storefront');
                setTimeout(() => document.getElementById('checkout')?.scrollIntoView({ behavior: 'smooth' }), 50);
              }}
              className="hover:text-white transition-colors whitespace-nowrap shrink-0"
            >
              Checkout
            </button>
            <button
              onClick={() => {
                if (!user) setAuthModalMode('login');
                else setView('customer');
              }}
              className={`hover:text-white transition-colors whitespace-nowrap shrink-0 ${view === 'customer' ? 'text-orange-400' : ''}`}
            >
              Customer Portal
            </button>
            {isAdmin && (
              <button
                onClick={() => setView('admin')}
                className={`hover:text-white transition-colors whitespace-nowrap shrink-0 ${view === 'admin' ? 'text-orange-400' : ''}`}
              >
                Admin Console
              </button>
            )}
          </nav>

          {/* Zone 3: 1 Primary Action */}
          <div className="flex items-center gap-3 shrink-0">
            {user ? (
              <button
                onClick={handleOpenPortal}
                className="px-4 py-2 text-xs font-semibold rounded-lg bg-orange-600 hover:bg-orange-500 text-white transition-colors whitespace-nowrap shrink-0"
              >
                {view === 'storefront' ? (isAdmin ? 'Admin Console' : 'My Dashboard') : user.customer_code}
              </button>
            ) : (
              <button
                onClick={() => setAuthModalMode('login')}
                className="px-4 py-2 text-xs font-semibold rounded-lg bg-orange-600 hover:bg-orange-500 text-white transition-colors whitespace-nowrap shrink-0"
              >
                Sign In
              </button>
            )}
            <button
              onClick={() => setMobileMenuOpen((s) => !s)}
              className="md:hidden p-2 rounded-lg border border-white/10 text-zinc-300"
              aria-label="Toggle navigation menu"
            >
              {mobileMenuOpen ? <X className="w-4 h-4" /> : <Menu className="w-4 h-4" />}
            </button>
          </div>
        </div>

        {/* Mobile Drawer */}
        {mobileMenuOpen && (
          <div className="md:hidden border-t border-white/10 bg-[#0D0D11] px-6 py-4 space-y-2 text-sm">
            <button
              onClick={() => {
                setView('storefront');
                setMobileMenuOpen(false);
              }}
              className="block w-full text-left py-2 text-zinc-300"
            >
              Services &amp; Checkout
            </button>
            <button
              onClick={() => {
                setMobileMenuOpen(false);
                if (!user) setAuthModalMode('login');
                else setView('customer');
              }}
              className="block w-full text-left py-2 text-zinc-300"
            >
              Customer Portal
            </button>
            {isAdmin && (
              <button
                onClick={() => {
                  setMobileMenuOpen(false);
                  setView('admin');
                }}
                className="block w-full text-left py-2 text-orange-400"
              >
                Admin Console
              </button>
            )}
          </div>
        )}
      </header>

      {/* Toast Feedback */}
      {toast && (
        <div className="no-print fixed bottom-5 right-5 z-50 max-w-sm bg-[#121217] border border-white/15 rounded-xl px-4 py-3 shadow-2xl flex items-center gap-3 text-xs">
          {toast.type === 'success' ? (
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          ) : (
            <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
          )}
          <span className="text-zinc-200">{toast.msg}</span>
        </div>
      )}

      {/* MAIN CONTENT SWITCHER */}
      <div className="flex-1">
        {view === 'storefront' && (
          <div>
            {/* HERO SECTION — Obsidian Architectural Grid + Molten Copper Lighting + 3D Prism */}
            <section className="relative overflow-hidden hx-grid-bg border-b border-white/10">
              <div className="absolute inset-0 hx-molten-glow pointer-events-none" />
              <div className="relative max-w-7xl mx-auto px-6 py-20 md:py-28 grid grid-cols-1 lg:grid-cols-12 gap-10 items-center">
                <div className="lg:col-span-7 space-y-6">
                  <div className="text-xs font-medium text-orange-400 tracking-wide">
                    HelzerX Technologies · customers.helzerx.cyou
                  </div>
                  <h1
                    className="font-display text-4xl sm:text-5xl lg:text-6xl font-extrabold tracking-tight text-white leading-[1.06]"
                    style={{ textWrap: 'balance' }}
                  >
                    Enterprise Infrastructure, Orders &amp; Automated Billing
                  </h1>
                  <p className="text-base md:text-lg text-zinc-400 max-w-2xl leading-relaxed">
                    Provision dedicated compute clusters, sovereign AI systems, and zero-trust perimeter defense with instant PDF invoicing, verified settlement tracking, and 24/7 engineering support.
                  </p>
                  <div className="flex flex-wrap items-center gap-4 pt-2">
                    <button
                      onClick={() => document.getElementById('checkout')?.scrollIntoView({ behavior: 'smooth' })}
                      className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-orange-600 hover:bg-orange-500 text-white text-sm font-semibold transition-colors"
                    >
                      Configure &amp; Order
                      <ArrowRight className="w-4 h-4" />
                    </button>
                    <button
                      onClick={handleOpenPortal}
                      className="inline-flex items-center gap-2 px-6 py-3 rounded-xl border border-white/15 bg-white/5 hover:bg-white/10 text-white text-sm font-medium transition-colors"
                    >
                      {user ? 'Open My Dashboard' : 'Customer Sign In'}
                    </button>
                  </div>
                </div>

                <div className="lg:col-span-5">
                  <HeroSculpturalPrism />
                </div>
              </div>
            </section>

            {/* 4-CARD ARCHITECTURAL CAPABILITY STRIP (Matching dark + molten amber featured card reference) */}
            <section className="max-w-7xl mx-auto px-6 py-16">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="bg-[#0D0D11] border border-white/10 rounded-2xl p-6 space-y-3">
                  <Server className="w-6 h-6 text-orange-400" />
                  <h3 className="font-display text-base font-bold text-white">01. Dedicated Provisioning</h3>
                  <p className="text-xs text-zinc-400 leading-relaxed">
                    Every order tracks live from submission through payment verification to cluster activation.
                  </p>
                </div>
                <div className="bg-[#0D0D11] border border-white/10 rounded-2xl p-6 space-y-3">
                  <FileText className="w-6 h-6 text-orange-400" />
                  <h3 className="font-display text-base font-bold text-white">02. Instant PDF Invoices</h3>
                  <p className="text-xs text-zinc-400 leading-relaxed">
                    Unique sequential invoice numbers (`HX-INV-2026`) generated atomically with automatic PDF downloads.
                  </p>
                </div>
                <div className="bg-[#0D0D11] border border-white/10 rounded-2xl p-6 space-y-3">
                  <Lock className="w-6 h-6 text-orange-400" />
                  <h3 className="font-display text-base font-bold text-white">03. Verified Settlement</h3>
                  <p className="text-xs text-zinc-400 leading-relaxed">
                    Bank transfer receipts and Stripe webhooks verified securely server-side before marking Paid.
                  </p>
                </div>
                <div className="hx-featured-card rounded-2xl p-6 space-y-3 text-white">
                  <ShieldCheck className="w-6 h-6 text-white" />
                  <h3 className="font-display text-base font-bold">04. Zero-Trust Isolation</h3>
                  <p className="text-xs text-orange-100/90 leading-relaxed">
                    Role-based access control, RFC 6238 2FA, session revocation, and strict customer data privacy.
                  </p>
                </div>
              </div>
            </section>

            {/* SERVICE CATALOG & PACKAGES */}
            <section id="catalog" className="max-w-7xl mx-auto px-6 py-12 border-t border-white/10">
              <div className="flex flex-wrap items-end justify-between gap-6 mb-10">
                <div>
                  <div className="text-xs font-medium text-orange-400 mb-2">Service &amp; Infrastructure Catalog</div>
                  <h2 className="font-display text-3xl font-bold text-white tracking-tight">Select Your Enterprise Stack</h2>
                </div>
                <div className="flex flex-wrap gap-1 p-1 bg-[#0D0D11] border border-white/10 rounded-xl">
                  <button
                    onClick={() => setActiveCategory('ALL')}
                    className={`px-3.5 py-1.5 text-xs font-medium rounded-lg transition-colors whitespace-nowrap ${
                      activeCategory === 'ALL' ? 'bg-orange-600 text-white' : 'text-zinc-400 hover:text-white'
                    }`}
                  >
                    All Solutions
                  </button>
                  {categories.map((cat) => (
                    <button
                      key={cat.id}
                      onClick={() => setActiveCategory(cat.id)}
                      className={`px-3.5 py-1.5 text-xs font-medium rounded-lg transition-colors whitespace-nowrap ${
                        activeCategory === cat.id ? 'bg-orange-600 text-white' : 'text-zinc-400 hover:text-white'
                      }`}
                    >
                      {cat.name}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {filteredProducts.map((product) => (
                  <div
                    key={product.id}
                    className={`rounded-2xl p-6 md:p-8 border flex flex-col justify-between space-y-6 ${
                      product.featured
                        ? 'bg-gradient-to-b from-[#170C07] to-[#0D0D11] border-orange-500/35'
                        : 'bg-[#0D0D11] border-white/10'
                    }`}
                  >
                    <div className="space-y-4">
                      <div>
                        <div className="text-xs text-orange-400 font-medium">
                          {categories.find((c) => c.id === product.category_id)?.name || 'Enterprise Service'}
                        </div>
                        <h3 className="font-display text-2xl font-bold text-white mt-1">{product.name}</h3>
                        <p className="text-sm text-zinc-400 mt-1.5 leading-relaxed">{product.description}</p>
                      </div>
                      <ul className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs text-zinc-300 pt-2">
                        {product.features.map((feat, idx) => (
                          <li key={idx} className="flex items-center gap-2">
                            <span className="text-orange-400 font-mono">·</span>
                            <span>{feat}</span>
                          </li>
                        ))}
                      </ul>
                    </div>

                    <div className="space-y-2.5 pt-4 border-t border-white/10">
                      <div className="text-xs font-semibold text-zinc-500">AVAILABLE PACKAGES</div>
                      {product.packages.map((pkg) => {
                        const isSelected = selectedProductId === product.id && selectedPackageId === pkg.id;
                        return (
                          <div
                            key={pkg.id}
                            className={`flex flex-wrap items-center justify-between gap-3 p-3.5 rounded-xl border transition-colors ${
                              isSelected
                                ? 'border-orange-500 bg-orange-500/10'
                                : 'border-white/10 bg-[#070709] hover:border-white/20'
                            }`}
                          >
                            <div>
                              <div className="text-sm font-semibold text-white">{pkg.name}</div>
                              <div className="text-xs text-zinc-500 capitalize">
                                {pkg.billing_cycle.replace('_', ' ')} · {pkg.duration_days} days
                              </div>
                            </div>
                            <div className="flex items-center gap-3">
                              <span className="font-mono text-base font-bold text-white tabular-nums">
                                {formatCurrency(pkg.price_cents, pkg.currency)}
                              </span>
                              <button
                                onClick={() => handleSelectPackageAndScroll(product.id, pkg.id)}
                                className="px-3.5 py-1.5 text-xs font-semibold rounded-lg bg-orange-600 hover:bg-orange-500 text-white whitespace-nowrap"
                              >
                                Order Tier
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </section>

            {/* CHECKOUT & REGISTRATION */}
            <CheckoutSection
              products={products}
              user={user}
              settings={settings}
              selectedProductId={selectedProductId}
              selectedPackageId={selectedPackageId}
              onSelectProductPackage={(pid, pkgId) => {
                setSelectedProductId(pid);
                setSelectedPackageId(pkgId);
              }}
              onOrderCompleted={async (result) => {
                setUser(result.user);
                showToast('success', `Order ${result.order_number} submitted! Invoice ${result.invoice_number} PDF downloaded.`);
                try {
                  const invRes = await apiFetch<{ invoice: Invoice }>(`/api/invoices/${result.invoice_id}`);
                  setActiveInvoice(invRes.invoice);
                } catch {
                  // fallback
                }
                setView('customer');
              }}
              onNotify={showToast}
            />
          </div>
        )}

        {view === 'customer' && user && (
          <CustomerDashboard
            user={user}
            settings={settings}
            onUserUpdated={setUser}
            onOpenInvoice={setActiveInvoice}
            onNavigateToOrder={() => {
              setView('storefront');
              setTimeout(() => document.getElementById('checkout')?.scrollIntoView({ behavior: 'smooth' }), 60);
            }}
            onLogout={handleLogout}
            onNotify={showToast}
          />
        )}

        {view === 'admin' && isAdmin && user && (
          <AdminDashboard
            user={user}
            onOpenInvoice={setActiveInvoice}
            onCatalogChanged={loadCatalog}
            onLogout={handleLogout}
            onNotify={showToast}
          />
        )}
      </div>

      {/* Quiet Enterprise Footer */}
      <footer className="no-print border-t border-white/10 bg-[#070709] py-8 px-6">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-zinc-500">
          <div>HelzerX Technologies Inc. · customers.helzerx.cyou · Billing, Orders &amp; Support Portal</div>
          <div className="flex items-center gap-5">
            <button onClick={() => setView('storefront')} className="hover:text-zinc-300">Catalog</button>
            <button onClick={handleOpenPortal} className="hover:text-zinc-300">Customer Portal</button>
            <a href="mailto:billing@helzerx.cyou" className="hover:text-zinc-300">billing@helzerx.cyou</a>
          </div>
        </div>
      </footer>

      {/* Auth Modal */}
      {authModalMode && (
        <AuthModal
          initialMode={authModalMode}
          onClose={() => setAuthModalMode(null)}
          onSuccess={(loggedInUser, msg) => {
            setUser(loggedInUser);
            setAuthModalMode(null);
            showToast('success', msg);
            if (loggedInUser.role === 'admin' || loggedInUser.role === 'super_admin') {
              setView('admin');
            } else {
              setView('customer');
            }
          }}
        />
      )}

      {/* Online & Printable Invoice Viewer Modal */}
      {activeInvoice && (
        <InvoiceModal
          invoice={activeInvoice}
          settings={settings}
          isAdminView={view === 'admin'}
          onClose={() => setActiveInvoice(null)}
          onPaymentSubmitted={async () => {
            const refreshed = await apiFetch<{ invoice: Invoice }>(`/api/invoices/${activeInvoice.id}`);
            setActiveInvoice(refreshed.invoice);
          }}
        />
      )}
    </div>
  );
}
