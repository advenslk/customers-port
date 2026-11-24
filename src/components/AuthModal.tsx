import React, { useState } from 'react';
import { X, Lock, Mail, ArrowRight, ShieldCheck } from 'lucide-react';
import { apiFetch } from '../lib/api';
import { UserProfile } from '../types';

interface AuthModalProps {
  initialMode?: 'login' | 'register' | 'forgot';
  onClose: () => void;
  onSuccess: (user: UserProfile, toastMsg: string) => void;
}

export function AuthModal({ initialMode = 'login', onClose, onSuccess }: AuthModalProps) {
  const [mode, setMode] = useState<'login' | 'register' | 'forgot' | 'reset'>(initialMode);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [totpCode, setTotpCode] = useState('');
  const [requires2fa, setRequires2fa] = useState(false);

  // Registration fields
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

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const data = await apiFetch<any>('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password, totp_code: requires2fa ? totpCode : undefined }),
      });
      if (data.requires_2fa) {
        setRequires2fa(true);
        setLoading(false);
        return;
      }
      onSuccess(data.user, `Signed in as ${data.user.full_name}`);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
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
        }),
      });
      onSuccess(data.user, `Account ${data.user.customer_code} created!`);
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
      const data = await apiFetch<any>('/api/auth/forgot-password', {
        method: 'POST',
        body: JSON.stringify({ email }),
      });
      setInfoMsg(
        data.reset_token_preview
          ? `${data.message} Token (dev preview): ${data.reset_token_preview}`
          : data.message
      );
      if (data.reset_token_preview) {
        setResetToken(data.reset_token_preview);
      }
      setMode('reset');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await apiFetch('/api/auth/reset-password', {
        method: 'POST',
        body: JSON.stringify({ token: resetToken, new_password: newPassword }),
      });
      setInfoMsg('Password updated. You can now sign in with your new password.');
      setMode('login');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const fillDemo = (role: 'customer' | 'admin') => {
    setRequires2fa(false);
    setMode('login');
    if (role === 'customer') {
      setEmail('ana.morales@solcraft.mx');
      setPassword('Customer!2026');
    } else {
      setEmail('admin@helzerx.cyou');
      setPassword('HelzerX!Admin2026');
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
      <div className="w-full max-w-lg bg-[#0D0D11] border border-white/15 rounded-2xl p-6 md:p-8 shadow-2xl my-8">
        <div className="flex items-start justify-between gap-4 mb-6">
          <div>
            <h2 className="font-display text-2xl font-bold text-white">
              {mode === 'login' && (requires2fa ? 'Two-Factor Verification' : 'Portal Sign In')}
              {mode === 'register' && 'Create HelzerX Account'}
              {mode === 'forgot' && 'Reset Password'}
              {mode === 'reset' && 'Set New Password'}
            </h2>
            <p className="text-xs text-zinc-400 mt-1">customers.helzerx.cyou · Encrypted Session</p>
          </div>
          <button
            onClick={onClose}
            aria-label="Close authentication modal"
            className="p-2 rounded-lg border border-white/10 text-zinc-400 hover:text-white hover:bg-white/5"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {error && (
          <div className="mb-4 px-4 py-2.5 rounded-lg bg-rose-950/60 border border-rose-500/30 text-xs text-rose-300">
            {error}
          </div>
        )}
        {infoMsg && (
          <div className="mb-4 px-4 py-2.5 rounded-lg bg-emerald-950/50 border border-emerald-500/30 text-xs text-emerald-300 break-all">
            {infoMsg}
          </div>
        )}

        {mode === 'login' && (
          <form onSubmit={handleLogin} className="space-y-4">
            {!requires2fa ? (
              <>
                <div>
                  <label className="block text-xs font-medium text-zinc-300 mb-1.5">Email Address</label>
                  <div className="relative">
                    <Mail className="w-4 h-4 text-zinc-500 absolute left-3 top-2.5" />
                    <input
                      type="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="you@company.com"
                      className="w-full pl-9 pr-3 py-2 text-sm bg-[#070709] border border-white/15 rounded-lg text-white focus:outline-none focus:border-orange-500"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-medium text-zinc-300 mb-1.5">Password</label>
                  <div className="relative">
                    <Lock className="w-4 h-4 text-zinc-500 absolute left-3 top-2.5" />
                    <input
                      type="password"
                      required
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="••••••••"
                      className="w-full pl-9 pr-3 py-2 text-sm bg-[#070709] border border-white/15 rounded-lg text-white focus:outline-none focus:border-orange-500"
                    />
                  </div>
                </div>
              </>
            ) : (
              <div>
                <label className="block text-xs font-medium text-zinc-300 mb-1.5">6-Digit Authenticator Code</label>
                <div className="relative">
                  <ShieldCheck className="w-4 h-4 text-orange-400 absolute left-3 top-2.5" />
                  <input
                    type="text"
                    required
                    maxLength={6}
                    value={totpCode}
                    onChange={(e) => setTotpCode(e.target.value)}
                    placeholder="000000"
                    className="w-full pl-9 pr-3 py-2 text-sm font-mono tracking-widest bg-[#070709] border border-white/15 rounded-lg text-white focus:outline-none focus:border-orange-500"
                  />
                </div>
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-lg bg-orange-600 hover:bg-orange-500 text-white text-sm font-semibold transition-colors disabled:opacity-50"
            >
              {loading ? 'Authenticating...' : requires2fa ? 'Verify & Sign In' : 'Sign In'}
              <ArrowRight className="w-4 h-4" />
            </button>

            <div className="flex items-center justify-between text-xs pt-2 border-t border-white/10">
              <button type="button" onClick={() => setMode('forgot')} className="text-zinc-400 hover:text-orange-400">
                Forgot password?
              </button>
              <button type="button" onClick={() => setMode('register')} className="text-orange-400 hover:text-orange-300 font-medium">
                Create customer account
              </button>
            </div>

            <div className="pt-3 border-t border-white/10">
              <div className="text-[11px] text-zinc-500 mb-2">Seeded Portal Accounts (Quick Fill)</div>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => fillDemo('customer')}
                  className="px-3 py-1.5 text-xs rounded-lg border border-white/10 bg-white/5 hover:bg-white/10 text-zinc-200 text-left"
                >
                  Customer · Ana Morales
                </button>
                <button
                  type="button"
                  onClick={() => fillDemo('admin')}
                  className="px-3 py-1.5 text-xs rounded-lg border border-orange-500/25 bg-orange-500/10 hover:bg-orange-500/20 text-orange-300 text-left"
                >
                  Admin · HelzerX Ops
                </button>
              </div>
            </div>
          </form>
        )}

        {mode === 'register' && (
          <form onSubmit={handleRegister} className="space-y-3">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-zinc-400 mb-1">Full Name *</label>
                <input required value={fullName} onChange={(e) => setFullName(e.target.value)} className="w-full px-3 py-2 text-sm bg-[#070709] border border-white/15 rounded-lg text-white focus:outline-none focus:border-orange-500" />
              </div>
              <div>
                <label className="block text-xs text-zinc-400 mb-1">Email Address *</label>
                <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} className="w-full px-3 py-2 text-sm bg-[#070709] border border-white/15 rounded-lg text-white focus:outline-none focus:border-orange-500" />
              </div>
              <div>
                <label className="block text-xs text-zinc-400 mb-1">Password (min 8 chars) *</label>
                <input type="password" minLength={8} required value={password} onChange={(e) => setPassword(e.target.value)} className="w-full px-3 py-2 text-sm bg-[#070709] border border-white/15 rounded-lg text-white focus:outline-none focus:border-orange-500" />
              </div>
              <div>
                <label className="block text-xs text-zinc-400 mb-1">Mobile Number *</label>
                <input required value={mobile} onChange={(e) => setMobile(e.target.value)} className="w-full px-3 py-2 text-sm bg-[#070709] border border-white/15 rounded-lg text-white focus:outline-none focus:border-orange-500" />
              </div>
              <div>
                <label className="block text-xs text-zinc-400 mb-1">Country *</label>
                <input required value={country} onChange={(e) => setCountry(e.target.value)} className="w-full px-3 py-2 text-sm bg-[#070709] border border-white/15 rounded-lg text-white focus:outline-none focus:border-orange-500" />
              </div>
              <div>
                <label className="block text-xs text-zinc-400 mb-1">City *</label>
                <input required value={city} onChange={(e) => setCity(e.target.value)} className="w-full px-3 py-2 text-sm bg-[#070709] border border-white/15 rounded-lg text-white focus:outline-none focus:border-orange-500" />
              </div>
              <div className="md:col-span-2">
                <label className="block text-xs text-zinc-400 mb-1">Billing Address *</label>
                <input required value={billingAddress} onChange={(e) => setBillingAddress(e.target.value)} className="w-full px-3 py-2 text-sm bg-[#070709] border border-white/15 rounded-lg text-white focus:outline-none focus:border-orange-500" />
              </div>
              <div>
                <label className="block text-xs text-zinc-400 mb-1">Postal Code *</label>
                <input required value={postalCode} onChange={(e) => setPostalCode(e.target.value)} className="w-full px-3 py-2 text-sm bg-[#070709] border border-white/15 rounded-lg text-white focus:outline-none focus:border-orange-500" />
              </div>
              <div>
                <label className="block text-xs text-zinc-400 mb-1">Company Name (Optional)</label>
                <input value={companyName} onChange={(e) => setCompanyName(e.target.value)} className="w-full px-3 py-2 text-sm bg-[#070709] border border-white/15 rounded-lg text-white focus:outline-none focus:border-orange-500" />
              </div>
              <div className="md:col-span-2">
                <label className="block text-xs text-zinc-400 mb-1">Discord Username (Optional)</label>
                <input value={discordUsername} onChange={(e) => setDiscordUsername(e.target.value)} placeholder="@username" className="w-full px-3 py-2 text-sm bg-[#070709] border border-white/15 rounded-lg text-white focus:outline-none focus:border-orange-500" />
              </div>
            </div>
            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 px-4 rounded-lg bg-orange-600 hover:bg-orange-500 text-white text-sm font-semibold transition-colors disabled:opacity-50"
            >
              {loading ? 'Creating Account...' : 'Create Customer Account'}
            </button>
            <div className="text-center text-xs pt-2">
              <button type="button" onClick={() => setMode('login')} className="text-zinc-400 hover:text-white">
                Already have an account? Sign in
              </button>
            </div>
          </form>
        )}

        {mode === 'forgot' && (
          <form onSubmit={handleForgot} className="space-y-4">
            <p className="text-xs text-zinc-400">Enter your registered email address to receive a secure password reset token.</p>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@company.com"
              className="w-full px-3 py-2 text-sm bg-[#070709] border border-white/15 rounded-lg text-white focus:outline-none focus:border-orange-500"
            />
            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 px-4 rounded-lg bg-orange-600 hover:bg-orange-500 text-white text-sm font-semibold"
            >
              {loading ? 'Sending...' : 'Request Reset Token'}
            </button>
            <div className="flex justify-between text-xs">
              <button type="button" onClick={() => setMode('login')} className="text-zinc-400 hover:text-white">Back to Sign In</button>
              <button type="button" onClick={() => setMode('reset')} className="text-orange-400 hover:text-orange-300">Have a token?</button>
            </div>
          </form>
        )}

        {mode === 'reset' && (
          <form onSubmit={handleReset} className="space-y-4">
            <div>
              <label className="block text-xs text-zinc-400 mb-1">Reset Token</label>
              <input required value={resetToken} onChange={(e) => setResetToken(e.target.value)} className="w-full px-3 py-2 text-sm font-mono bg-[#070709] border border-white/15 rounded-lg text-white focus:outline-none focus:border-orange-500" />
            </div>
            <div>
              <label className="block text-xs text-zinc-400 mb-1">New Password (min 8 chars)</label>
              <input type="password" minLength={8} required value={newPassword} onChange={(e) => setNewPassword(e.target.value)} className="w-full px-3 py-2 text-sm bg-[#070709] border border-white/15 rounded-lg text-white focus:outline-none focus:border-orange-500" />
            </div>
            <button type="submit" disabled={loading} className="w-full py-2.5 px-4 rounded-lg bg-orange-600 hover:bg-orange-500 text-white text-sm font-semibold">
              {loading ? 'Updating...' : 'Update Password'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
