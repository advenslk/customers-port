import React, { useState } from 'react';
import { Check, Eye, EyeOff, Lock } from 'lucide-react';
import { evaluatePasswordStrength } from '../lib/api';

interface PasswordStrengthFieldProps {
  label?: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  required?: boolean;
  showMeter?: boolean;
  compact?: boolean;
  autoComplete?: string;
}

export function PasswordStrengthField({
  label,
  value,
  onChange,
  placeholder = 'At least 12 characters',
  required = true,
  showMeter = true,
  compact = false,
  autoComplete = 'new-password',
}: PasswordStrengthFieldProps) {
  const [visible, setVisible] = useState(false);
  const strength = evaluatePasswordStrength(value);

  const barColors = [
    'bg-zinc-800',
    'bg-rose-500',
    'bg-amber-500',
    'bg-orange-500',
    'bg-emerald-500',
    'bg-emerald-400',
  ];

  const barClass = barColors[strength.score] || 'bg-zinc-800';

  return (
    <div className="space-y-2">
      {label && <label className="block text-xs font-medium text-zinc-300">{label}</label>}
      <div className="relative">
        <Lock className="w-4 h-4 text-zinc-500 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
        <input
          type={visible ? 'text' : 'password'}
          required={required}
          minLength={showMeter ? 12 : undefined}
          maxLength={128}
          autoComplete={autoComplete}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className={`w-full pl-9 pr-10 ${compact ? 'py-2 text-xs' : 'py-2.5 text-sm'} bg-[#070709] border border-white/15 rounded-xl text-white transition-colors focus:outline-none focus:border-orange-500`}
        />
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          aria-label={visible ? 'Hide password' : 'Show password'}
          className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-zinc-500 hover:text-zinc-200 transition-colors"
        >
          {visible ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
        </button>
      </div>

      {showMeter && (
        <div className="space-y-2 pt-0.5">
          <div className="flex items-center justify-between gap-3">
            <div className="flex-1 grid grid-cols-5 gap-1.5 h-1">
              {[1, 2, 3, 4, 5].map((step) => (
                <div
                  key={step}
                  className={`rounded-full transition-colors duration-300 ${
                    value.length > 0 && strength.score >= step ? barClass : 'bg-white/10'
                  }`}
                />
              ))}
            </div>
            <span
              className={`text-[11px] font-medium ${
                strength.isValid ? 'text-emerald-400' : value.length > 0 ? 'text-orange-400' : 'text-zinc-500'
              }`}
            >
              {value.length === 0 ? 'Required' : strength.label}
            </span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-3 gap-y-1 text-[11px] text-zinc-500">
            {[
              { ok: strength.checks.length, text: '12+ characters' },
              { ok: strength.checks.upper, text: 'Uppercase letter' },
              { ok: strength.checks.lower, text: 'Lowercase letter' },
              { ok: strength.checks.digit, text: 'Number' },
              { ok: strength.checks.special, text: 'Special symbol' },
            ].map((req) => (
              <div
                key={req.text}
                className={`flex items-center gap-1.5 transition-colors ${req.ok ? 'text-emerald-400' : 'text-zinc-500'}`}
              >
                <Check className={`w-3 h-3 shrink-0 transition-opacity ${req.ok ? 'opacity-100' : 'opacity-30'}`} />
                <span className="truncate">{req.text}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
