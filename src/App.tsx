import React, { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Lock,
  Menu,
  ShieldCheck,
  X,
} from 'lucide-react';
import { Category, Invoice, Product, UserProfile } from './types';
import { apiFetch, ensureCsrfToken, formatCurrency } from './lib/api';
import {
  HelzerXLogoMark,
  Sculptural3DArrow,
  Sculptural3DBust,
  Sculptural3DCheck,
  Sculptural3DGear,
} from './components/HelzerXBrand';
import { ThreePrismCanvas } from './components/ThreePrismCanvas';
import { Tilt3DCard } from './components/Tilt3DCard';
import { AuthMode, AuthPage } from './components/AuthPage';
import { CheckoutSection } from './components/CheckoutSection';
import { CustomerDashboard } from './components/CustomerDashboard';
import { AdminDashboard } from './components/AdminDashboard';
import { InvoiceModal } from './components/InvoiceModal';

type AppView = 'storefront' | 'auth' | 'customer' | 'admin';

function resolveRouteFromPath(pathname: string): { view: AppView; authMode: AuthMode } {
  const clean = pathname.toLowerCase().replace(/\/+$/, '') || '/';
  if (clean === '/login') return { view: 'auth', authMode: 'login' };
  if (clean === '/register') return { view: 'auth', authMode: 'register' };
  if (clean === '/forgot-password') return { view: 'auth', authMode: 'forgot' };
  if (clean === '/reset-password') return { view: 'auth', authMode: 'reset' };
  if (clean === '/setup') return { view: 'auth', authMode: 'bootstrap' };
  if (clean === '/portal') return { view: 'customer', authMode: 'login' };
  if (clean === '/admin') return { view: 'admin', authMode: 'login' };
  return { view: 'storefront', authMode: 'login' };
}

function routePathFor(view: AppView, authMode: AuthMode): string {
  if (view === 'auth') {
    if (authMode === 'register') return '/register';
    if (authMode === 'forgot') return '/forgot-password';
    if (authMode === 'reset') return '/reset-password';
    if (authMode === 'bootstrap') return '/setup';
    return '/login';
  }
  if (view === 'customer') return '/portal';
  if (view === 'admin') return '/admin';
  return '/';
}

export default function App() {
  const initialRoute = resolveRouteFromPath(window.location.pathname);
  const [view, setView] = useState<AppView>(initialRoute.view);
  const [authMode, setAuthMode] = useState<AuthMode>(initialRoute.authMode);
  const [user, setUser] = useState<UserProfile | null>(null);
  const [sessionChecked, setSessionChecked] = useState(false);

  const [categories, setCategories] = useState<Category[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [settings, setSettings] = useState<Record<string, string>>({});
  const [activeCategory, setActiveCategory] = useState<number | 'ALL'>('ALL');
  const [selectedProductId, setSelectedProductId] = useState<number | null>(null);
  const [selectedPackageId, setSelectedPackageId] = useState<number | null>(null);

  const [needsAdminSetup, setNeedsAdminSetup] = useState(false);
  const [activeInvoice, setActiveInvoice] = useState<Invoice | null>(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [toast, setToast] = useState<{ type: 'success' | 'error'; msg: string } | null>(null);

  // 30-minute idle inactivity auto-logout (2-minute warning modal)
  const [idleWarningSeconds, setIdleWarningSeconds] = useState<number | null>(null);
  const lastActivityRef = useRef<number>(Date.now());

  const navigate = (nextView: AppView, nextAuthMode: AuthMode = authMode, replace = false) => {
    setView(nextView);
    if (nextView === 'auth') {
      setAuthMode(nextAuthMode);
    }
    const targetPath = routePathFor(nextView, nextAuthMode);
    if (window.location.pathname !== targetPath) {
      if (replace) {
        window.history.replaceState({}, '', targetPath);
      } else {
        window.history.pushState({}, '', targetPath);
      }
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

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
    } finally {
      setSessionChecked(true);
    }
  };

  const loadBootstrapStatus = async () => {
    try {
      const status = await apiFetch<{ needs_admin_setup: boolean }>('/api/auth/bootstrap-status');
      setNeedsAdminSetup(Boolean(status.needs_admin_setup));
    } catch {
      setNeedsAdminSetup(false);
    }
  };

  useEffect(() => {
    ensureCsrfToken().catch(() => {});
    loadCatalog();
    loadSession();
    loadBootstrapStatus();

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

    const onPopState = () => {
      const resolved = resolveRouteFromPath(window.location.pathname);
      setView(resolved.view);
      setAuthMode(resolved.authMode);
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  // Guard protected routes when session check finishes
  useEffect(() => {
    if (!sessionChecked) return;
    if ((view === 'customer' || view === 'admin') && !user) {
      navigate('auth', 'login', true);
    } else if (view === 'admin' && user && user.role !== 'admin' && user.role !== 'super_admin') {
      navigate('customer', 'login', true);
    } else if (view === 'auth' && user && authMode !== 'forgot' && authMode !== 'reset') {
      const dest = user.role === 'admin' || user.role === 'super_admin' ? 'admin' : 'customer';
      navigate(dest, 'login', true);
    }
  }, [sessionChecked, user, view, authMode]);

  const handleLogout = async (reason?: string) => {
    try {
      await apiFetch('/api/auth/logout', { method: 'POST' });
    } catch {
      // ignore
    }
    setUser(null);
    setActiveInvoice(null);
    setIdleWarningSeconds(null);
    navigate('storefront', 'login', true);
    showToast('success', reason || 'Signed out cleanly.');
  };

  useEffect(() => {
    if (!user) {
      setIdleWarningSeconds(null);
      return;
    }

    lastActivityRef.current = Date.now();
    const recordActivity = () => {
      if (Date.now() - lastActivityRef.current < 28 * 60 * 1000) {
        lastActivityRef.current = Date.now();
      }
    };

    const events = ['mousemove', 'mousedown', 'keydown', 'scroll', 'touchstart'];
    events.forEach((ev) => window.addEventListener(ev, recordActivity, { passive: true }));

    const interval = window.setInterval(() => {
      const elapsedMs = Date.now() - lastActivityRef.current;
      const maxIdleMs = 30 * 60 * 1000;
      const warnStartMs = 28 * 60 * 1000;

      if (elapsedMs >= maxIdleMs) {
        handleLogout('Session automatically closed after 30 minutes of inactivity.');
      } else if (elapsedMs >= warnStartMs) {
        setIdleWarningSeconds(Math.max(1, Math.ceil((maxIdleMs - elapsedMs) / 1000)));
      } else {
        setIdleWarningSeconds(null);
      }
    }, 1000);

    return () => {
      events.forEach((ev) => window.removeEventListener(ev, recordActivity));
      window.clearInterval(interval);
    };
  }, [user?.id]);

  const scrollToSection = (sectionId: string) => {
    if (view !== 'storefront') {
      navigate('storefront');
      setTimeout(() => document.getElementById(sectionId)?.scrollIntoView({ behavior: 'smooth' }), 140);
    } else {
      document.getElementById(sectionId)?.scrollIntoView({ behavior: 'smooth' });
    }
  };

  const handleSelectPackageAndScroll = (productId: number, packageId: number) => {
    setSelectedProductId(productId);
    setSelectedPackageId(packageId);
    scrollToSection('checkout');
  };

  const handleOpenPortal = () => {
    if (!user) {
      navigate('auth', 'login');
      return;
    }
    if (user.role === 'admin' || user.role === 'super_admin') {
      navigate('admin');
    } else {
      navigate('customer');
    }
  };

  const filteredProducts = products.filter((p) => activeCategory === 'ALL' || p.category_id === activeCategory);
  const isAdmin = user?.role === 'admin' || user?.role === 'super_admin';

  return (
    <div className="min-h-screen bg-[#070709] text-[#F5F5F7] flex flex-col">
      {/* First-Time Administrator Setup Banner */}
      {needsAdminSetup && !user && (
        <div className="no-print bg-orange-950/80 border-b border-orange-500/35 px-4 py-2.5 text-center text-xs text-orange-100 flex flex-wrap items-center justify-center gap-3">
          <ShieldCheck className="w-4 h-4 text-orange-400 shrink-0" />
          <span>Welcome to HelzerX. Set up your primary administrator account to activate workspace controls.</span>
          <button
            type="button"
            onClick={() => navigate('auth', 'bootstrap')}
            className="px-3 py-1 rounded-md bg-orange-600 hover:bg-orange-500 text-white font-semibold whitespace-nowrap transition-colors"
          >
            Set Up Administrator
          </button>
        </div>
      )}

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
            onClick={() => navigate('storefront')}
            className="flex items-center gap-2.5 text-left whitespace-nowrap shrink-0 focus:outline-none"
          >
            <HelzerXLogoMark className="w-7 h-7" />
            <span className="font-display text-lg font-bold tracking-tight text-white">HelzerX</span>
          </button>

          {/* Zone 2: Clean Single-line Navigation Links */}
          <nav className="hidden md:flex items-center gap-7 text-sm font-medium text-zinc-400">
            <button
              onClick={() => scrollToSection('catalog')}
              className={`hover:text-white transition-colors whitespace-nowrap shrink-0 ${view === 'storefront' ? 'text-white' : ''}`}
            >
              Services
            </button>
            <button
              onClick={() => scrollToSection('checkout')}
              className="hover:text-white transition-colors whitespace-nowrap shrink-0"
            >
              Order
            </button>
            <button
              onClick={() => {
                if (!user) navigate('auth', 'login');
                else navigate('customer');
              }}
              className={`hover:text-white transition-colors whitespace-nowrap shrink-0 ${view === 'customer' ? 'text-orange-400' : ''}`}
            >
              Customer Portal
            </button>
            {!user && (
              <button
                onClick={() => navigate('auth', 'register')}
                className={`hover:text-white transition-colors whitespace-nowrap shrink-0 ${
                  view === 'auth' && authMode === 'register' ? 'text-orange-400' : ''
                }`}
              >
                Create Account
              </button>
            )}
            {isAdmin && (
              <button
                onClick={() => navigate('admin')}
                className={`hover:text-white transition-colors whitespace-nowrap shrink-0 ${view === 'admin' ? 'text-orange-400' : ''}`}
              >
                Admin Console
              </button>
            )}
          </nav>

          {/* Zone 3: Primary Action */}
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
                onClick={() => navigate('auth', 'login')}
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
        <AnimatePresence>
          {mobileMenuOpen && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="md:hidden overflow-hidden border-t border-white/10 bg-[#0D0D11] px-6 py-4 space-y-2 text-sm"
            >
              <button
                onClick={() => {
                  setMobileMenuOpen(false);
                  navigate('storefront');
                }}
                className="block w-full text-left py-2 text-zinc-300"
              >
                Services &amp; Order
              </button>
              {!user && (
                <>
                  <button
                    onClick={() => {
                      setMobileMenuOpen(false);
                      navigate('auth', 'login');
                    }}
                    className="block w-full text-left py-2 text-zinc-300"
                  >
                    Sign In
                  </button>
                  <button
                    onClick={() => {
                      setMobileMenuOpen(false);
                      navigate('auth', 'register');
                    }}
                    className="block w-full text-left py-2 text-orange-400 font-medium"
                  >
                    Create Account
                  </button>
                </>
              )}
              {user && (
                <button
                  onClick={() => {
                    setMobileMenuOpen(false);
                    navigate('customer');
                  }}
                  className="block w-full text-left py-2 text-zinc-300"
                >
                  Customer Portal
                </button>
              )}
              {isAdmin && (
                <button
                  onClick={() => {
                    setMobileMenuOpen(false);
                    navigate('admin');
                  }}
                  className="block w-full text-left py-2 text-orange-400"
                >
                  Admin Console
                </button>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </header>

      {/* Toast Feedback */}
      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: 18, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12, scale: 0.96 }}
            className="no-print fixed bottom-5 right-5 z-50 max-w-sm bg-[#121217] border border-white/15 rounded-xl px-4 py-3 shadow-2xl flex items-center gap-3 text-xs"
          >
            {toast.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            ) : (
              <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
            )}
            <span className="text-zinc-200">{toast.msg}</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* MAIN VIEW SWITCHER WITH SMOOTH TRANSITIONS */}
      <div className="flex-1">
        <AnimatePresence mode="wait">
          {view === 'storefront' && (
            <motion.div
              key="view-storefront"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.28 }}
            >
              {/* HERO SECTION — Obsidian Architectural Grid + Monumental Watermark + Interactive 3D Sculpture */}
              <section className="relative overflow-hidden hx-grid-bg border-b border-white/10">
                <div className="absolute inset-0 hx-molten-glow pointer-events-none" />

                <div className="relative max-w-7xl mx-auto px-6 py-16 md:py-24 grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-10 items-center">
                  <motion.div
                    initial={{ opacity: 0, y: 16 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.45, ease: 'easeOut' }}
                    className="lg:col-span-6 space-y-6 relative z-10"
                  >
                    <div className="text-xs font-medium text-orange-400 tracking-wide">
                      HelzerX Technologies · Enterprise Client Portal
                    </div>
                    <h1
                      className="font-display text-4xl sm:text-5xl lg:text-6xl font-extrabold tracking-tight text-white leading-[1.06]"
                      style={{ textWrap: 'balance' }}
                    >
                      Enterprise Infrastructure, Orders &amp; Automated Billing
                    </h1>
                    <p className="text-base md:text-lg text-zinc-400 max-w-xl leading-relaxed">
                      Provision dedicated compute clusters, private AI systems, and perimeter security with instant PDF invoicing, verified settlement tracking, and round-the-clock engineering support.
                    </p>
                    <div className="flex flex-wrap items-center gap-3.5 pt-2">
                      <button
                        onClick={() => scrollToSection('checkout')}
                        className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-orange-600 hover:bg-orange-500 text-white text-sm font-semibold transition-all duration-200 shadow-lg shadow-orange-950/40"
                      >
                        Configure &amp; Order
                        <ArrowRight className="w-4 h-4" />
                      </button>
                      {user ? (
                        <button
                          onClick={handleOpenPortal}
                          className="inline-flex items-center gap-2 px-6 py-3 rounded-xl border border-white/15 bg-white/5 hover:bg-white/10 text-white text-sm font-medium transition-colors"
                        >
                          Open My Dashboard
                        </button>
                      ) : (
                        <>
                          <button
                            onClick={() => navigate('auth', 'register')}
                            className="inline-flex items-center gap-2 px-5 py-3 rounded-xl border border-white/15 bg-white/5 hover:bg-white/10 text-white text-sm font-medium transition-colors"
                          >
                            Create Account
                          </button>
                          <button
                            onClick={() => navigate('auth', 'login')}
                            className="inline-flex items-center gap-2 px-4 py-3 text-sm font-medium text-zinc-300 hover:text-white transition-colors"
                          >
                            Sign In
                          </button>
                        </>
                      )}
                    </div>
                  </motion.div>

                  {/* Interactive 3D Metallic Sculpture Stage matching Reference 1 */}
                  <div className="lg:col-span-6 relative min-h-[360px] md:min-h-[430px] flex items-center justify-center">
                    <div
                      aria-hidden="true"
                      className="pointer-events-none select-none absolute inset-x-0 top-1/2 -translate-y-1/2 text-center font-display font-extrabold text-[5.25rem] sm:text-[7.5rem] lg:text-[8.25rem] leading-none tracking-tight hx-hero-wordmark"
                    >
                      HELZERX
                    </div>
                    <div className="relative z-10 w-full h-[360px] md:h-[430px]">
                      <ThreePrismCanvas interactive variant="hero" />
                    </div>
                  </div>
                </div>
              </section>

              {/* 4-CARD 3D ARCHITECTURAL CAPABILITY STRIP */}
              <section className="max-w-7xl mx-auto px-6 py-16">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
                  {[
                    {
                      icon: <Sculptural3DArrow className="w-16 h-16" />,
                      title: 'Dedicated Provisioning',
                      body: 'Follow every order smoothly from initial submission through payment verification to live service activation.',
                      featured: false,
                    },
                    {
                      icon: <Sculptural3DBust className="w-16 h-16" />,
                      title: 'Instant PDF Billing',
                      body: 'Unique numbered invoices are issued the moment you order, complete with automatic printable PDF downloads.',
                      featured: false,
                    },
                    {
                      icon: <Sculptural3DGear className="w-16 h-16" />,
                      title: 'Verified Payment Settlement',
                      body: 'Bank wire receipts and card payments are carefully verified before any invoice transitions to Paid.',
                      featured: false,
                    },
                    {
                      icon: <Sculptural3DCheck className="w-16 h-16" />,
                      title: 'Private Client Protection',
                      body: 'Role-isolated accounts, authenticator app verification, and strict privacy keep every client workspace protected.',
                      featured: true,
                    },
                  ].map((item, idx) => (
                    <motion.div
                      key={item.title}
                      initial={{ opacity: 0, y: 18 }}
                      whileInView={{ opacity: 1, y: 0 }}
                      viewport={{ once: true, amount: 0.2 }}
                      transition={{ duration: 0.35, delay: idx * 0.06 }}
                      className="h-full"
                    >
                      <Tilt3DCard
                        maxTilt={10}
                        glowColor={item.featured ? 'rgba(255, 255, 255, 0.24)' : 'rgba(255, 107, 44, 0.24)'}
                        className={
                          item.featured
                            ? 'hx-featured-card rounded-2xl p-6 text-white border border-orange-400/35'
                            : 'bg-[#0D0D11] border border-white/10 rounded-2xl p-6'
                        }
                      >
                        <div className="flex flex-col justify-between h-full space-y-5">
                          <div style={{ transform: 'translateZ(30px)' }} className="w-fit drop-shadow-[0_14px_20px_rgba(0,0,0,0.65)]">
                            {item.icon}
                          </div>
                          <div className="space-y-2" style={{ transform: 'translateZ(12px)' }}>
                            <h3 className="font-display text-base font-bold text-white">{item.title}</h3>
                            <p className={`text-xs leading-relaxed ${item.featured ? 'text-orange-100/90' : 'text-zinc-400'}`}>
                              {item.body}
                            </p>
                          </div>
                        </div>
                      </Tilt3DCard>
                    </motion.div>
                  ))}
                </div>
              </section>

              {/* SERVICE CATALOG & PACKAGES */}
              <section id="catalog" className="max-w-7xl mx-auto px-6 py-12 border-t border-white/10">
                <div className="flex flex-wrap items-end justify-between gap-6 mb-10">
                  <div>
                    <div className="text-xs font-medium text-orange-400 mb-2">Service &amp; Solution Catalog</div>
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
                  {filteredProducts.map((product, idx) => {
                    const catName = categories.find((c) => c.id === product.category_id)?.name || 'Enterprise Service';
                    const lowerCat = catName.toLowerCase();
                    const catSculpture = lowerCat.includes('security') ? (
                      <Sculptural3DCheck className="w-12 h-12" />
                    ) : lowerCat.includes('ai') || lowerCat.includes('automation') ? (
                      <Sculptural3DBust className="w-12 h-12" />
                    ) : lowerCat.includes('engineering') ? (
                      <Sculptural3DGear className="w-12 h-12" />
                    ) : (
                      <Sculptural3DArrow className="w-12 h-12" />
                    );

                    const formatBillingCycle = (cycle: string) => {
                      const map: Record<string, string> = {
                        monthly: 'Monthly Plan',
                        quarterly: 'Quarterly Plan',
                        annual: 'Annual Plan',
                        one_time: 'One-Time Plan',
                      };
                      return map[cycle] || cycle.replace(/_/g, ' ');
                    };

                    return (
                      <motion.div
                        key={product.id}
                        initial={{ opacity: 0, y: 20 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true, amount: 0.12 }}
                        transition={{ duration: 0.35, delay: idx * 0.06 }}
                        className="h-full"
                      >
                        <Tilt3DCard
                          maxTilt={6}
                          className={`rounded-2xl p-6 md:p-8 border ${
                            product.featured
                              ? 'bg-gradient-to-b from-[#170C07] to-[#0D0D11] border-orange-500/35'
                              : 'bg-[#0D0D11] border-white/10'
                          }`}
                        >
                          <div className="flex flex-col justify-between h-full space-y-6">
                            <div className="space-y-4">
                              <div className="flex items-start justify-between gap-4">
                                <div>
                                  <div className="text-xs text-orange-400 font-medium">{catName}</div>
                                  <h3 className="font-display text-2xl font-bold text-white mt-1">{product.name}</h3>
                                </div>
                                <div
                                  style={{ transform: 'translateZ(28px)' }}
                                  className="shrink-0 drop-shadow-[0_12px_18px_rgba(0,0,0,0.6)]"
                                >
                                  {catSculpture}
                                </div>
                              </div>
                              <p className="text-sm text-zinc-400 leading-relaxed">{product.description}</p>
                              <ul className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-xs text-zinc-300 pt-1">
                                {product.features.map((feat, fIdx) => (
                                  <li key={fIdx} className="flex items-center gap-2.5">
                                    <span className="w-1.5 h-1.5 rounded-full bg-orange-400 shrink-0 shadow-[0_0_8px_rgba(255,107,44,0.8)]" />
                                    <span>{feat}</span>
                                  </li>
                                ))}
                              </ul>
                            </div>

                            <div className="space-y-2.5 pt-4 border-t border-white/10">
                              <div className="text-xs font-semibold text-zinc-400">Available Packages</div>
                              {product.packages.map((pkg) => {
                                const isSelected = selectedProductId === product.id && selectedPackageId === pkg.id;
                                return (
                                  <div
                                    key={pkg.id}
                                    className={`flex flex-wrap items-center justify-between gap-3 p-3.5 rounded-xl border transition-all duration-300 hover:-translate-y-0.5 ${
                                      isSelected
                                        ? 'border-orange-500 bg-orange-500/10 shadow-[0_8px_24px_-8px_rgba(234,88,12,0.35)]'
                                        : 'border-white/10 bg-[#070709]/90 hover:border-orange-500/40 hover:bg-[#101016]'
                                    }`}
                                  >
                                    <div>
                                      <div className="text-sm font-semibold text-white">{pkg.name}</div>
                                      <div className="text-xs text-zinc-400 mt-0.5">
                                        {formatBillingCycle(pkg.billing_cycle)} · {pkg.duration_days} days
                                      </div>
                                    </div>
                                    <div className="flex items-center gap-3.5">
                                      <span className="font-display text-lg font-bold text-white tabular-nums">
                                        {formatCurrency(pkg.price_cents, pkg.currency)}
                                      </span>
                                      <button
                                        onClick={() => handleSelectPackageAndScroll(product.id, pkg.id)}
                                        className="px-4 py-2 text-xs font-semibold rounded-lg bg-orange-600 hover:bg-orange-500 text-white whitespace-nowrap transition-all duration-200 hover:shadow-[0_6px_18px_-4px_rgba(234,88,12,0.5)]"
                                      >
                                        Order Tier
                                      </button>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        </Tilt3DCard>
                      </motion.div>
                    );
                  })}
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
                  navigate('customer');
                }}
                onNotify={showToast}
              />
            </motion.div>
          )}

          {view === 'auth' && (
            <AuthPage
              key="view-auth"
              mode={authMode}
              needsAdminSetup={needsAdminSetup}
              onModeChange={(nextMode) => navigate('auth', nextMode)}
              onBackToStorefront={() => navigate('storefront')}
              onSuccess={(loggedInUser, msg) => {
                setUser(loggedInUser);
                if (loggedInUser.role === 'super_admin' || loggedInUser.role === 'admin') {
                  setNeedsAdminSetup(false);
                }
                showToast('success', msg);
                if (loggedInUser.role === 'admin' || loggedInUser.role === 'super_admin') {
                  navigate('admin');
                } else {
                  navigate('customer');
                }
              }}
            />
          )}

          {view === 'customer' && user && (
            <motion.div
              key="view-customer"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.25 }}
            >
              <CustomerDashboard
                user={user}
                settings={settings}
                onUserUpdated={setUser}
                onOpenInvoice={setActiveInvoice}
                onNavigateToOrder={() => scrollToSection('checkout')}
                onLogout={handleLogout}
                onNotify={showToast}
              />
            </motion.div>
          )}

          {view === 'admin' && isAdmin && user && (
            <motion.div
              key="view-admin"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.25 }}
            >
              <AdminDashboard
                user={user}
                onOpenInvoice={setActiveInvoice}
                onCatalogChanged={loadCatalog}
                onLogout={handleLogout}
                onNotify={showToast}
              />
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Quiet Enterprise Footer */}
      <footer className="no-print border-t border-white/10 bg-[#070709] py-8 px-6">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-zinc-500">
          <div>HelzerX Technologies Inc. · Enterprise Billing, Orders &amp; Support Portal</div>
          <div className="flex items-center gap-5">
            <button onClick={() => navigate('storefront')} className="hover:text-zinc-300 transition-colors">Services</button>
            {!user && (
              <>
                <button onClick={() => navigate('auth', 'login')} className="hover:text-zinc-300 transition-colors">Sign In</button>
                <button onClick={() => navigate('auth', 'register')} className="hover:text-zinc-300 transition-colors">Create Account</button>
              </>
            )}
            {user && (
              <button onClick={handleOpenPortal} className="hover:text-zinc-300 transition-colors">Customer Portal</button>
            )}
            <a href="mailto:billing@helzerx.cyou" className="hover:text-zinc-300 transition-colors">billing@helzerx.cyou</a>
          </div>
        </div>
      </footer>

      {/* 30-Minute Idle Timeout Countdown Modal */}
      <AnimatePresence>
        {idleWarningSeconds !== null && user && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4"
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.96, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: 10 }}
              className="w-full max-w-md bg-[#0D0D11] border border-orange-500/40 rounded-2xl p-6 space-y-4 shadow-2xl"
            >
              <div className="flex items-center gap-2.5 text-orange-400 font-display font-bold text-lg">
                <Lock className="w-5 h-5" />
                Session Inactivity Warning
              </div>
              <p className="text-xs text-zinc-300 leading-relaxed">
                For account security, your authenticated session will automatically sign out in{' '}
                <span className="font-mono font-bold text-orange-400 tabular-nums">{idleWarningSeconds}s</span> due to inactivity.
              </p>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => handleLogout()}
                  className="px-3.5 py-2 text-xs rounded-lg border border-white/15 text-zinc-300 hover:bg-white/5"
                >
                  Sign Out Now
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    lastActivityRef.current = Date.now();
                    setIdleWarningSeconds(null);
                    await loadSession();
                  }}
                  className="px-4 py-2 text-xs font-semibold rounded-lg bg-orange-600 hover:bg-orange-500 text-white"
                >
                  Stay Signed In
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

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
