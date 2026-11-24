import React, { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  ArrowLeft,
  ArrowRight,
  Eye,
  EyeOff,
  FileText,
  Lock,
  Mail,
  ShieldAlert,
  ShieldCheck,
  UserCheck,
} from 'lucide-react';
import { apiFetch, evaluatePasswordStrength, fetchAuthChallenge } from '../lib/api';
import { UserProfile } from '../types';
import { HelzerXLogoMark } from './HelzerXBrand';
import { ThreePrismCanvas } from './ThreePrismCanvas';
import { PasswordStrengthField } from './PasswordStrengthField';

export type AuthMode = 'login' | 'register' | 'forgot' | 'reset' | 'bootstrap';

interface AuthPageProps {
  mode: AuthMode;
  needsAdminSetup?: boolean;
  onModeChange: (nextMode: AuthMode) => void;
  onBackToStorefront: () => void;
  onSuccess: (user: UserProfile, toastMsg: string) => void;
}

export function AuthPage({
  mode,
  needsAdminSetup = false,
  onModeChange,
  onBackToStorefront,
  onSuccess,
}: AuthPageProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showLoginPw, setShowLoginPw] = useState(false);
  const [totpCode, setTotpCode] = useState('');
  const [requires2fa, setRequires2fa] = useState(false);

  // Registration & Bootstrap fields
  const [fullName, setFullName] = useState('');
  const [mobile, setMobile] = useState('');
  const [country, setCountry] = useState('');
  const [city, setCity] = useState('');
  const [billingAddress, setBillingAddress] = useState('');
  const [postalCode, setPostalCode] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [discordUsername, setDiscordUsername] = useState('');

  // Reset fields
  const [resetToken, setResetToken] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [infoMsg, setInfoMsg] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setError('');
    setInfoMsg('');
    setRequires2fa(false);
    setTotpCode('');
  }, [mode]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const challenge_token = await fetchAuthChallenge();
      const data = await apiFetch<any>('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({
          email,
          password,
          totp_code: requires2fa ? totpCode.trim() : undefined,
          challenge_token,
        }),
      });
      if (data.requires_2fa) {
        setRequires2fa(true);
        setLoading(false);
        return;
      }
      onSuccess(data.user, `Welcome back, ${data.user.full_name}.`);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!evaluatePasswordStrength(password).isValid) {
      setError('Please choose a stronger password meeting every requirement below.');
      return;
    }
    setLoading(true);
    try {
      const challenge_token = await fetchAuthChallenge();
      const data = await apiFetch<any>('/api/auth/register', {
        method: 'POST',
        body: JSON.stringify({
          full_name: fullName,
          email,
          password,
          mobile,
          country,
          city,
          billing_address: billingAddress,
          postal_code: postalCode,
          company_name: companyName,
          discord_username: discordUsername,
          challenge_token,
        }),
      });
      onSuccess(data.user, `Account ${data.user.customer_code} created successfully.`);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleBootstrapAdmin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!evaluatePasswordStrength(password).isValid) {
      setError('Administrator password must satisfy every requirement below.');
      return;
    }
    setLoading(true);
    try {
      const challenge_token = await fetchAuthChallenge();
      const data = await apiFetch<any>('/api/auth/bootstrap-admin', {
        method: 'POST',
        body: JSON.stringify({
          full_name: fullName,
          email,
          password,
          challenge_token,
        }),
      });
      onSuccess(data.user, `Primary Administrator ${data.user.customer_code} created.`);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleForgot = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const challenge_token = await fetchAuthChallenge();
      const data = await apiFetch<any>('/api/auth/forgot-password', {
        method: 'POST',
        body: JSON.stringify({ email, challenge_token }),
      });
      setInfoMsg(data.message || 'If an account matches that email, recovery instructions have been sent.');
      onModeChange('reset');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!evaluatePasswordStrength(newPassword).isValid) {
      setError('Your new password must meet every security requirement below.');
      return;
    }
    setLoading(true);
    try {
      await apiFetch('/api/auth/reset-password', {
        method: 'POST',
        body: JSON.stringify({ token: resetToken, new_password: newPassword }),
      });
      setInfoMsg('Password updated cleanly. You may now sign in with your new credentials.');
      onModeChange('login');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const pageHeading: Record<AuthMode, { title: string; subtitle: string }> = {
    login: {
      title: requires2fa ? 'Two-Factor Verification' : 'Sign In to Your Portal',
      subtitle: requires2fa
        ? 'Confirm your identity with a verification code from your authenticator app.'
        : 'Access orders, printable PDF invoices, active services, and direct engineering support.',
    },
    register: {
      title: 'Create Customer Account',
      subtitle: 'Set up your verified HelzerX billing profile for instant invoicing and order tracking.',
    },
    forgot: {
      title: 'Recover Account Access',
      subtitle: 'Enter your registered email address to receive a single-use recovery code.',
    },
    reset: {
      title: 'Set a New Password',
      subtitle: 'Enter the verification code sent to your inbox along with a new strong password.',
    },
    bootstrap: {
      title: 'Primary Administrator Setup',
      subtitle: 'Create the founding administrator account to manage orders, billing, and clients.',
    },
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.35 }}
      className="min-h-[calc(100vh-4rem)] relative overflow-hidden hx-grid-bg"
    >
      <div className="absolute inset-0 hx-molten-glow pointer-events-none" />

      <div className="relative max-w-7xl mx-auto px-6 py-10 lg:py-16 grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-12 items-center">
        {/* Left Interactive 3D Showcase Panel */}
        <div className="lg:col-span-6 space-y-6 order-2 lg:order-1">
          <button
            type="button"
            onClick={onBackToStorefront}
            className="inline-flex items-center gap-2 text-xs font-medium text-zinc-400 hover:text-white transition-colors"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            Return to Services &amp; Storefront
          </button>

          <div className="relative rounded-3xl border border-white/10 bg-[#0A0A0E]/85 p-6 md:p-8 overflow-hidden">
            {/* Subtle Monumental Watermark Behind 3D Canvas */}
            <div
              aria-hidden="true"
              className="pointer-events-none select-none absolute inset-x-0 top-8 text-center font-display font-extrabold text-[4.75rem] sm:text-[6.5rem] leading-none tracking-tight hx-hero-wordmark"
            >
              HELZERX
            </div>

            <div className="relative z-10 h-[310px] sm:h-[360px]">
              <ThreePrismCanvas interactive variant="auth" />
            </div>

            <div className="relative z-10 pt-5 mt-2 border-t border-white/10 grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="space-y-1">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-white">
                  <ShieldCheck className="w-3.5 h-3.5 text-orange-400" />
                  Protected Access
                </div>
                <p className="text-[11px] text-zinc-400 leading-relaxed">
                  Authenticator verification and device-aware session controls safeguard every account.
                </p>
              </div>
              <div className="space-y-1">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-white">
                  <FileText className="w-3.5 h-3.5 text-orange-400" />
                  Instant Billing
                </div>
                <p className="text-[11px] text-zinc-400 leading-relaxed">
                  Download print-ready invoices and review verified settlement history anytime.
                </p>
              </div>
              <div className="space-y-1">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-white">
                  <Lock className="w-3.5 h-3.5 text-orange-400" />
                  Private Workspace
                </div>
                <p className="text-[11px] text-zinc-400 leading-relaxed">
                  Isolated client portals for service monitoring, renewals, and priority support.
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Right Full-Page Form Column */}
        <div className="lg:col-span-6 order-1 lg:order-2">
          <div className="w-full max-w-xl mx-auto bg-[#0D0D11] border border-white/12 rounded-3xl p-6 sm:p-8 md:p-10 shadow-2xl">
            <div className="flex items-center justify-between gap-4 mb-6">
              <div className="flex items-center gap-2.5">
                <HelzerXLogoMark className="w-7 h-7" />
                <span className="font-display text-base font-bold tracking-tight text-white">HelzerX Client Access</span>
              </div>

              {(mode === 'login' || mode === 'register') && (
                <div className="flex p-1 bg-[#070709] border border-white/10 rounded-xl text-xs">
                  <button
                    type="button"
                    onClick={() => onModeChange('login')}
                    className={`px-3.5 py-1.5 rounded-lg font-medium transition-colors whitespace-nowrap ${
                      mode === 'login' ? 'bg-orange-600 text-white' : 'text-zinc-400 hover:text-white'
                    }`}
                  >
                    Sign In
                  </button>
                  <button
                    type="button"
                    onClick={() => onModeChange('register')}
                    className={`px-3.5 py-1.5 rounded-lg font-medium transition-colors whitespace-nowrap ${
                      mode === 'register' ? 'bg-orange-600 text-white' : 'text-zinc-400 hover:text-white'
                    }`}
                  >
                    Create Account
                  </button>
                </div>
              )}
            </div>

            <div className="mb-6">
              <h1 className="font-display text-2xl sm:text-3xl font-bold tracking-tight text-white">
                {pageHeading[mode].title}
              </h1>
              <p className="text-xs sm:text-sm text-zinc-400 mt-1.5 leading-relaxed">
                {pageHeading[mode].subtitle}
              </p>
            </div>

            {error && (
              <motion.div
                initial={{ opacity: 0, y: -6 }}
                animate={{ opacity: 1, y: 0 }}
                className="mb-5 px-4 py-3 rounded-xl bg-rose-950/60 border border-rose-500/30 text-xs text-rose-300"
              >
                {error}
              </motion.div>
            )}
            {infoMsg && (
              <motion.div
                initial={{ opacity: 0, y: -6 }}
                animate={{ opacity: 1, y: 0 }}
                className="mb-5 px-4 py-3 rounded-xl bg-emerald-950/50 border border-emerald-500/30 text-xs text-emerald-300"
              >
                {infoMsg}
              </motion.div>
            )}

            <AnimatePresence mode="wait">
              {mode === 'login' && (
                <motion.form
                  key="auth-login"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  transition={{ duration: 0.22 }}
                  onSubmit={handleLogin}
                  className="space-y-4"
                >
                  {!requires2fa ? (
                    <>
                      <div>
                        <label className="block text-xs font-medium text-zinc-300 mb-1.5">Email Address</label>
                        <div className="relative">
                          <Mail className="w-4 h-4 text-zinc-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
                          <input
                            type="email"
                            required
                            autoComplete="email"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            placeholder="name@company.com"
                            className="w-full pl-10 pr-3.5 py-2.5 text-sm bg-[#070709] border border-white/15 rounded-xl text-white transition-colors focus:outline-none focus:border-orange-500"
                          />
                        </div>
                      </div>
                      <div>
                        <div className="flex items-center justify-between mb-1.5">
                          <label className="block text-xs font-medium text-zinc-300">Password</label>
                          <button
                            type="button"
                            onClick={() => onModeChange('forgot')}
                            className="text-xs text-orange-400 hover:text-orange-300 transition-colors"
                          >
                            Forgot password?
                          </button>
                        </div>
                        <div className="relative">
                          <Lock className="w-4 h-4 text-zinc-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
                          <input
                            type={showLoginPw ? 'text' : 'password'}
                            required
                            autoComplete="current-password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            placeholder="Enter your password"
                            className="w-full pl-10 pr-10 py-2.5 text-sm bg-[#070709] border border-white/15 rounded-xl text-white transition-colors focus:outline-none focus:border-orange-500"
                          />
                          <button
                            type="button"
                            onClick={() => setShowLoginPw((s) => !s)}
                            aria-label={showLoginPw ? 'Hide password' : 'Show password'}
                            className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-zinc-500 hover:text-zinc-200 transition-colors"
                          >
                            {showLoginPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                          </button>
                        </div>
                      </div>
                    </>
                  ) : (
                    <div className="space-y-2.5">
                      <label className="block text-xs font-medium text-zinc-300">
                        Authenticator Code or Backup Recovery Code
                      </label>
                      <div className="relative">
                        <ShieldCheck className="w-4 h-4 text-orange-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                        <input
                          type="text"
                          required
                          maxLength={12}
                          autoFocus
                          value={totpCode}
                          onChange={(e) => setTotpCode(e.target.value.toUpperCase())}
                          placeholder="6-digit code or backup code"
                          className="w-full pl-10 pr-3.5 py-2.5 text-sm font-mono tracking-widest bg-[#070709] border border-white/15 rounded-xl text-white transition-colors focus:outline-none focus:border-orange-500"
                        />
                      </div>
                      <p className="text-xs text-zinc-500">
                        Enter the verification code from your authenticator app or a saved single-use recovery code.
                      </p>
                    </div>
                  )}

                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-orange-600 hover:bg-orange-500 text-white text-sm font-semibold transition-all duration-200 disabled:opacity-50 shadow-lg shadow-orange-950/40"
                  >
                    {loading ? 'Signing In...' : requires2fa ? 'Verify & Continue' : 'Sign In'}
                    <ArrowRight className="w-4 h-4" />
                  </button>

                  <div className="text-center text-xs text-zinc-400 pt-3 border-t border-white/10">
                    New to HelzerX?{' '}
                    <button
                      type="button"
                      onClick={() => onModeChange('register')}
                      className="text-orange-400 hover:text-orange-300 font-semibold transition-colors"
                    >
                      Create your customer account
                    </button>
                  </div>

                  {needsAdminSetup && (
                    <div className="pt-2">
                      <button
                        type="button"
                        onClick={() => onModeChange('bootstrap')}
                        className="w-full flex items-center justify-center gap-2 px-3.5 py-2.5 text-xs rounded-xl border border-orange-500/35 bg-orange-500/10 hover:bg-orange-500/20 text-orange-300 font-medium transition-colors"
                      >
                        <UserCheck className="w-4 h-4" />
                        Set Up Primary Administrator Account
                      </button>
                    </div>
                  )}
                </motion.form>
              )}

              {mode === 'register' && (
                <motion.form
                  key="auth-register"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  transition={{ duration: 0.22 }}
                  onSubmit={handleRegister}
                  className="space-y-3.5"
                >
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                    <div>
                      <label className="block text-xs font-medium text-zinc-300 mb-1">Full Name *</label>
                      <input
                        required
                        value={fullName}
                        onChange={(e) => setFullName(e.target.value)}
                        placeholder="Full Legal Name"
                        className="w-full px-3.5 py-2 text-sm bg-[#070709] border border-white/15 rounded-xl text-white focus:outline-none focus:border-orange-500"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-zinc-300 mb-1">Email Address *</label>
                      <input
                        type="email"
                        required
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="name@company.com"
                        className="w-full px-3.5 py-2 text-sm bg-[#070709] border border-white/15 rounded-xl text-white focus:outline-none focus:border-orange-500"
                      />
                    </div>
                    <div className="sm:col-span-2">
                      <PasswordStrengthField
                        label="Account Password *"
                        value={password}
                        onChange={setPassword}
                        placeholder="Create a strong password"
                        compact
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-zinc-300 mb-1">Mobile Number *</label>
                      <input
                        required
                        value={mobile}
                        onChange={(e) => setMobile(e.target.value)}
                        placeholder="+1 415 555 0199"
                        className="w-full px-3.5 py-2 text-sm bg-[#070709] border border-white/15 rounded-xl text-white focus:outline-none focus:border-orange-500"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-zinc-300 mb-1">Country *</label>
                      <input
                        required
                        value={country}
                        onChange={(e) => setCountry(e.target.value)}
                        placeholder="United States"
                        className="w-full px-3.5 py-2 text-sm bg-[#070709] border border-white/15 rounded-xl text-white focus:outline-none focus:border-orange-500"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-zinc-300 mb-1">City *</label>
                      <input
                        required
                        value={city}
                        onChange={(e) => setCity(e.target.value)}
                        placeholder="San Francisco"
                        className="w-full px-3.5 py-2 text-sm bg-[#070709] border border-white/15 rounded-xl text-white focus:outline-none focus:border-orange-500"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-zinc-300 mb-1">Postal Code *</label>
                      <input
                        required
                        value={postalCode}
                        onChange={(e) => setPostalCode(e.target.value)}
                        placeholder="94104"
                        className="w-full px-3.5 py-2 text-sm bg-[#070709] border border-white/15 rounded-xl text-white focus:outline-none focus:border-orange-500"
                      />
                    </div>
                    <div className="sm:col-span-2">
                      <label className="block text-xs font-medium text-zinc-300 mb-1">Billing Address *</label>
                      <input
                        required
                        value={billingAddress}
                        onChange={(e) => setBillingAddress(e.target.value)}
                        placeholder="Street address, suite or unit"
                        className="w-full px-3.5 py-2 text-sm bg-[#070709] border border-white/15 rounded-xl text-white focus:outline-none focus:border-orange-500"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-zinc-300 mb-1">Company Name (Optional)</label>
                      <input
                        value={companyName}
                        onChange={(e) => setCompanyName(e.target.value)}
                        placeholder="Organization name"
                        className="w-full px-3.5 py-2 text-sm bg-[#070709] border border-white/15 rounded-xl text-white focus:outline-none focus:border-orange-500"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-zinc-300 mb-1">Discord Username (Optional)</label>
                      <input
                        value={discordUsername}
                        onChange={(e) => setDiscordUsername(e.target.value)}
                        placeholder="Username"
                        className="w-full px-3.5 py-2 text-sm bg-[#070709] border border-white/15 rounded-xl text-white focus:outline-none focus:border-orange-500"
                      />
                    </div>
                  </div>
                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-orange-600 hover:bg-orange-500 text-white text-sm font-semibold transition-all duration-200 disabled:opacity-50"
                  >
                    {loading ? 'Creating Account...' : 'Create Customer Account'}
                    <ArrowRight className="w-4 h-4" />
                  </button>
                  <div className="text-center text-xs text-zinc-400 pt-2">
                    Already registered?{' '}
                    <button
                      type="button"
                      onClick={() => onModeChange('login')}
                      className="text-orange-400 hover:text-orange-300 font-semibold transition-colors"
                    >
                      Sign in instead
                    </button>
                  </div>
                </motion.form>
              )}

              {mode === 'bootstrap' && (
                <motion.form
                  key="auth-bootstrap"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  transition={{ duration: 0.22 }}
                  onSubmit={handleBootstrapAdmin}
                  className="space-y-4"
                >
                  <div className="p-3.5 rounded-xl bg-orange-950/35 border border-orange-500/30 flex items-start gap-2.5 text-xs text-orange-200 leading-relaxed">
                    <ShieldAlert className="w-4 h-4 text-orange-400 shrink-0 mt-0.5" />
                    <span>
                      This one-time setup creates the primary administrator account for your HelzerX workspace and permanently locks once finished.
                    </span>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-zinc-300 mb-1">Administrator Full Name *</label>
                    <input
                      required
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      placeholder="Primary Operations Lead"
                      className="w-full px-3.5 py-2.5 text-sm bg-[#070709] border border-white/15 rounded-xl text-white focus:outline-none focus:border-orange-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-zinc-300 mb-1">Administrator Email *</label>
                    <input
                      type="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="admin@helzerx.cyou"
                      className="w-full px-3.5 py-2.5 text-sm bg-[#070709] border border-white/15 rounded-xl text-white focus:outline-none focus:border-orange-500"
                    />
                  </div>
                  <PasswordStrengthField
                    label="Administrator Password *"
                    value={password}
                    onChange={setPassword}
                    placeholder="Create a strong administrator password"
                  />
                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full py-3 px-4 rounded-xl bg-orange-600 hover:bg-orange-500 text-white text-sm font-semibold transition-colors disabled:opacity-50"
                  >
                    {loading ? 'Creating Administrator...' : 'Complete Administrator Setup'}
                  </button>
                  <div className="text-center text-xs pt-1">
                    <button type="button" onClick={() => onModeChange('login')} className="text-zinc-400 hover:text-white">
                      Back to Sign In
                    </button>
                  </div>
                </motion.form>
              )}

              {mode === 'forgot' && (
                <motion.form
                  key="auth-forgot"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  transition={{ duration: 0.22 }}
                  onSubmit={handleForgot}
                  className="space-y-4"
                >
                  <div>
                    <label className="block text-xs font-medium text-zinc-300 mb-1.5">Registered Email Address</label>
                    <input
                      type="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="name@company.com"
                      className="w-full px-3.5 py-2.5 text-sm bg-[#070709] border border-white/15 rounded-xl text-white focus:outline-none focus:border-orange-500"
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full py-3 px-4 rounded-xl bg-orange-600 hover:bg-orange-500 text-white text-sm font-semibold transition-colors disabled:opacity-50"
                  >
                    {loading ? 'Sending Instructions...' : 'Send Recovery Instructions'}
                  </button>
                  <div className="flex justify-between text-xs pt-2 border-t border-white/10">
                    <button type="button" onClick={() => onModeChange('login')} className="text-zinc-400 hover:text-white">
                      Back to Sign In
                    </button>
                    <button type="button" onClick={() => onModeChange('reset')} className="text-orange-400 hover:text-orange-300 font-medium">
                      I already have a code
                    </button>
                  </div>
                </motion.form>
              )}

              {mode === 'reset' && (
                <motion.form
                  key="auth-reset"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  transition={{ duration: 0.22 }}
                  onSubmit={handleReset}
                  className="space-y-4"
                >
                  <div>
                    <label className="block text-xs font-medium text-zinc-300 mb-1">Recovery Code</label>
                    <input
                      required
                      value={resetToken}
                      onChange={(e) => setResetToken(e.target.value)}
                      placeholder="Paste the code from your email"
                      className="w-full px-3.5 py-2.5 text-sm font-mono bg-[#070709] border border-white/15 rounded-xl text-white focus:outline-none focus:border-orange-500"
                    />
                  </div>
                  <PasswordStrengthField
                    label="New Password *"
                    value={newPassword}
                    onChange={setNewPassword}
                    placeholder="Choose a new strong password"
                  />
                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full py-3 px-4 rounded-xl bg-orange-600 hover:bg-orange-500 text-white text-sm font-semibold transition-colors disabled:opacity-50"
                  >
                    {loading ? 'Updating Password...' : 'Save New Password'}
                  </button>
                  <div className="text-center text-xs pt-2 border-t border-white/10">
                    <button type="button" onClick={() => onModeChange('login')} className="text-zinc-400 hover:text-white">
                      Back to Sign In
                    </button>
                  </div>
                </motion.form>
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>
    </motion.div>
  );
}
