import React, { useRef, useState } from 'react';
import { motion } from 'motion/react';

interface Tilt3DCardProps {
  children: React.ReactNode;
  className?: string;
  maxTilt?: number;
  glowColor?: string;
}

export function Tilt3DCard({
  children,
  className = '',
  maxTilt = 8,
  glowColor = 'rgba(255, 107, 44, 0.16)',
}: Tilt3DCardProps) {
  const cardRef = useRef<HTMLDivElement>(null);
  const [tilt, setTilt] = useState({ rx: 0, ry: 0, mx: 50, my: 50, hovered: false });

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const el = cardRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const px = (e.clientX - rect.left) / Math.max(rect.width, 1);
    const py = (e.clientY - rect.top) / Math.max(rect.height, 1);

    setTilt({
      rx: (0.5 - py) * maxTilt * 2,
      ry: (px - 0.5) * maxTilt * 2,
      mx: px * 100,
      my: py * 100,
      hovered: true,
    });
  };

  const handlePointerLeave = () => {
    setTilt({ rx: 0, ry: 0, mx: 50, my: 50, hovered: false });
  };

  return (
    <div style={{ perspective: '1100px' }} className="h-full">
      <motion.div
        ref={cardRef}
        onPointerMove={handlePointerMove}
        onPointerLeave={handlePointerLeave}
        animate={{
          rotateX: tilt.rx,
          rotateY: tilt.ry,
          scale: tilt.hovered ? 1.015 : 1,
        }}
        transition={{
          type: 'spring',
          stiffness: 240,
          damping: 22,
          mass: 0.7,
        }}
        className={`relative h-full hx-card-3d transition-colors duration-300 ${className}`}
      >
        <div
          className="pointer-events-none absolute inset-0 rounded-[inherit] transition-opacity duration-300"
          style={{
            opacity: tilt.hovered ? 1 : 0,
            background: `radial-gradient(420px circle at ${tilt.mx}% ${tilt.my}%, ${glowColor}, transparent 65%)`,
          }}
        />
        <div className="relative h-full" style={{ transform: 'translateZ(14px)' }}>
          {children}
        </div>
      </motion.div>
    </div>
  );
}
