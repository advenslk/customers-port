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
 * Fallback 2D-vector sculptural prism if hardware WebGL context is unavailable.
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
        <path
          d="M368 78 L294 42 L184 152 L258 188 Z"
          fill="url(#prism-face-2)"
          stroke="rgba(255,215,170,0.22)"
          strokeWidth="1.2"
        />
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

/**
 * 3D Sculpted Capabilities Icons (matched directly to the 4 metallic sculptures in Reference 1)
 */
export function Sculptural3DArrow({ className = 'w-20 h-20' }: { className?: string }) {
  return (
    <svg viewBox="0 0 96 96" fill="none" className={className} aria-hidden="true">
      <defs>
        <linearGradient id="s3d-arr-top" x1="14" y1="14" x2="82" y2="82" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#FF9E6D" />
          <stop offset="42%" stopColor="#EA580C" />
          <stop offset="100%" stopColor="#2E1108" />
        </linearGradient>
        <linearGradient id="s3d-arr-side" x1="18" y1="24" x2="72" y2="86" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#43180B" />
          <stop offset="100%" stopColor="#120907" />
        </linearGradient>
      </defs>
      {/* Extrusion depth */}
      <path
        d="M28 24H72V68L59 56V37H40L28 24Z"
        transform="translate(-4, 6)"
        fill="url(#s3d-arr-side)"
      />
      <path
        d="M16 66L54 28L66 40L28 78L16 66Z"
        transform="translate(-3, 6)"
        fill="#190B07"
      />
      {/* Main brushed copper front bevel */}
      <path
        d="M26 22H74V70L61 57V43L30 74L18 62L49 31H35L26 22Z"
        fill="url(#s3d-arr-top)"
        stroke="rgba(254,215,170,0.4)"
        strokeWidth="1"
      />
    </svg>
  );
}

export function Sculptural3DBust({ className = 'w-20 h-20' }: { className?: string }) {
  return (
    <svg viewBox="0 0 96 96" fill="none" className={className} aria-hidden="true">
      <defs>
        <radialGradient id="s3d-head" cx="38%" cy="32%" r="65%">
          <stop offset="0%" stopColor="#FFB085" />
          <stop offset="45%" stopColor="#C2410C" />
          <stop offset="100%" stopColor="#140A08" />
        </radialGradient>
        <linearGradient id="s3d-shoulders" x1="20" y1="48" x2="76" y2="86" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#FF7A38" />
          <stop offset="50%" stopColor="#9A3412" />
          <stop offset="100%" stopColor="#120806" />
        </linearGradient>
      </defs>
      {/* Shoulders extrusion */}
      <path
        d="M18 76C18 60 31 50 48 50C65 50 78 60 78 76V82H18V76Z"
        transform="translate(-3, 4)"
        fill="#160906"
      />
      <path
        d="M20 75C20 59 32 49 48 49C64 49 76 59 76 75V80H20V75Z"
        fill="url(#s3d-shoulders)"
        stroke="rgba(254,215,170,0.35)"
        strokeWidth="1"
      />
      {/* Head sphere */}
      <circle
        cx="48"
        cy="30"
        r="15"
        fill="url(#s3d-head)"
        stroke="rgba(254,215,170,0.38)"
        strokeWidth="1"
      />
      {/* Subtle sculpted crest */}
      <path d="M44 50L48 64L52 50H44Z" fill="#0B090B" fillOpacity="0.65" />
    </svg>
  );
}

export function Sculptural3DGear({ className = 'w-20 h-20' }: { className?: string }) {
  return (
    <svg viewBox="0 0 96 96" fill="none" className={className} aria-hidden="true">
      <defs>
        <linearGradient id="s3d-gear-face" x1="16" y1="14" x2="80" y2="82" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#FF9E6D" />
          <stop offset="48%" stopColor="#C2410C" />
          <stop offset="100%" stopColor="#1B0B07" />
        </linearGradient>
      </defs>
      {/* Shadow extrusion */}
      <g transform="translate(-3, 5)" opacity="0.85">
        <path
          d="M42 14H54L56 23C59 24 62 25 65 27L73 22L81 30L76 38C78 41 79 44 80 47L88 49V61L80 63C79 66 78 69 76 72L81 80L73 88L65 83C62 85 59 86 56 87L54 95H42L40 87C37 86 34 85 31 83L23 88L15 80L20 72C18 69 17 66 16 63L8 61V49L16 47C17 44 18 41 20 38L15 30L23 22L31 27C34 25 37 24 40 23L42 14Z"
          transform="scale(0.84) translate(8, 2)"
          fill="#150805"
        />
      </g>
      <g transform="scale(0.84) translate(8, 2)">
        <path
          fillRule="evenodd"
          clipRule="evenodd"
          d="M42 14H54L56 23C59 24 62 25 65 27L73 22L81 30L76 38C78 41 79 44 80 47L88 49V61L80 63C79 66 78 69 76 72L81 80L73 88L65 83C62 85 59 86 56 87L54 95H42L40 87C37 86 34 85 31 83L23 88L15 80L20 72C18 69 17 66 16 63L8 61V49L16 47C17 44 18 41 20 38L15 30L23 22L31 27C34 25 37 24 40 23L42 14ZM48 67C55.1797 67 61 61.1797 61 54C61 46.8203 55.1797 41 48 41C40.8203 41 35 46.8203 35 54C35 61.1797 40.8203 67 48 67Z"
          fill="url(#s3d-gear-face)"
          stroke="rgba(254,215,170,0.4)"
          strokeWidth="1.2"
        />
      </g>
    </svg>
  );
}

export function Sculptural3DCheck({ className = 'w-20 h-20' }: { className?: string }) {
  return (
    <svg viewBox="0 0 96 96" fill="none" className={className} aria-hidden="true">
      <defs>
        <linearGradient id="s3d-chk-face" x1="20" y1="22" x2="80" y2="78" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#3B180B" />
          <stop offset="48%" stopColor="#1D0B05" />
          <stop offset="100%" stopColor="#090403" />
        </linearGradient>
      </defs>
      {/* Warm rim highlight extrusion */}
      <path
        d="M22 50L39 67L76 28"
        stroke="#FFBA93"
        strokeOpacity="0.65"
        strokeWidth="14"
        strokeLinecap="round"
        strokeLinejoin="round"
        transform="translate(-3, 4)"
      />
      <path
        d="M22 50L39 67L76 28"
        stroke="url(#s3d-chk-face)"
        strokeWidth="14"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M22 50L39 67L76 28"
        stroke="rgba(255, 255, 255, 0.2)"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
