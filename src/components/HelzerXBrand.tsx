import React from 'react';

export function HelzerXLogoMark({ className = 'w-8 h-8' }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" fill="none" className={className} aria-hidden="true">
      <defs>
        <linearGradient id="hx-copper-a" x1="8" y1="8" x2="56" y2="56" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#FF8A4C" />
          <stop offset="48%" stopColor="#EA580C" />
          <stop offset="100%" stopColor="#431407" />
        </linearGradient>
        <linearGradient id="hx-copper-b" x1="56" y1="8" x2="8" y2="56" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#FDBA74" />
          <stop offset="55%" stopColor="#C2410C" />
          <stop offset="100%" stopColor="#1C0B05" />
        </linearGradient>
      </defs>
      <path d="M12 10L32 30L52 10H39L32 17L25 10H12Z" fill="url(#hx-copper-a)" />
      <path d="M12 54L32 34L52 54H39L32 47L25 54H12Z" fill="url(#hx-copper-b)" />
      <path d="M8 14L26 32L8 50V37L13 32L8 27V14Z" fill="#FF6B2C" fillOpacity="0.9" />
      <path d="M56 14L38 32L56 50V37L51 32L56 27V14Z" fill="#EA580C" fillOpacity="0.65" />
    </svg>
  );
}

/**
 * Sculptural 3D metallic copper geometric prism inspired directly by the primary HelzerX design reference.
 */
export function HeroSculpturalPrism() {
  return (
    <div className="relative w-full h-full min-h-[280px] flex items-center justify-center select-none pointer-events-none">
      <div
        className="absolute inset-4 rounded-full blur-3xl opacity-45"
        style={{
          background: 'radial-gradient(circle, rgba(255,107,44,0.55) 0%, rgba(194,65,12,0.2) 50%, transparent 75%)',
        }}
      />
      <svg viewBox="0 0 420 340" fill="none" className="relative w-full max-w-[400px] drop-shadow-2xl">
        <defs>
          <linearGradient id="prism-face-1" x1="40" y1="30" x2="290" y2="280" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#FFB085" />
            <stop offset="35%" stopColor="#EA580C" />
            <stop offset="80%" stopColor="#7C2D12" />
            <stop offset="100%" stopColor="#140804" />
          </linearGradient>
          <linearGradient id="prism-face-2" x1="360" y1="40" x2="110" y2="300" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#27140E" />
            <stop offset="40%" stopColor="#C2410C" />
            <stop offset="75%" stopColor="#FF7A38" />
            <stop offset="100%" stopColor="#2A0F06" />
          </linearGradient>
          <linearGradient id="prism-bevel" x1="150" y1="20" x2="270" y2="310" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#FED7AA" stopOpacity="0.85" />
            <stop offset="50%" stopColor="#EA580C" stopOpacity="0.4" />
            <stop offset="100%" stopColor="#09090B" stopOpacity="0.95" />
          </linearGradient>
        </defs>
        {/* Left intersecting metallic arm */}
        <path
          d="M52 72 L126 36 L236 146 L162 182 Z"
          fill="url(#prism-face-1)"
          stroke="rgba(255,215,170,0.28)"
          strokeWidth="1.2"
        />
        <path
          d="M52 72 L162 182 L162 214 L52 104 Z"
          fill="#261007"
          stroke="rgba(255,255,255,0.08)"
          strokeWidth="1"
        />
        {/* Right intersecting metallic arm */}
        <path
          d="M368 78 L294 42 L184 152 L258 188 Z"
          fill="url(#prism-face-2)"
          stroke="rgba(255,215,170,0.22)"
          strokeWidth="1.2"
        />
        {/* Lower sculptural anchor */}
        <path
          d="M184 152 L258 188 L358 288 L284 316 L184 216 Z"
          fill="url(#prism-face-1)"
          stroke="rgba(255,215,170,0.22)"
          strokeWidth="1.2"
        />
        <path
          d="M162 182 L236 146 L136 286 L62 258 Z"
          fill="url(#prism-bevel)"
          stroke="rgba(255,255,255,0.16)"
          strokeWidth="1.2"
        />
        {/* Center molten core facet */}
        <polygon
          points="210,126 254,170 210,214 166,170"
          fill="#FF6B2C"
          fillOpacity="0.85"
          stroke="#FED7AA"
          strokeOpacity="0.55"
          strokeWidth="1.2"
        />
      </svg>
    </div>
  );
}
