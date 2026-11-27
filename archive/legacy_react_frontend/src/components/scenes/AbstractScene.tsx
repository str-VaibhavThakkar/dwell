import React from 'react';
import type { WeatherType } from '../../themes/palettes';
import {
  computeAbstractAtmosphere,
  rgb,
  rgba,
} from '../../themes/palettes';
import { RainVeil } from '../overlays/RainVeil';

interface AbstractSceneProps {
  effectiveHour: number;
  weather: WeatherType;
}

export const AbstractScene: React.FC<AbstractSceneProps> = ({ effectiveHour, weather }) => {
  const atm = computeAbstractAtmosphere(effectiveHour, weather);

  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden">
      {/* 1. Celestial Sun / Moon */}
      {atm.sun > 0.05 && (
        <div
          className="absolute transition-all duration-1000"
          style={{
            left: `${atm.sunPos.x}%`,
            top: `${atm.sunPos.y}%`,
            transform: 'translate(-50%, -50%)',
            opacity: atm.sun,
          }}
        >
          <div
            className="w-64 h-64 rounded-full"
            style={{
              background: `radial-gradient(circle, ${rgba(atm.celestial, 0.45)} 0%, ${rgba(atm.celestial, 0.12)} 45%, transparent 72%)`,
            }}
          />
          <div
            className="w-20 h-20 rounded-full absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2"
            style={{
              background: `radial-gradient(circle, #FFFDF7 0%, ${rgb(atm.celestial)} 75%, rgba(255,235,190,0) 100%)`,
              boxShadow: `0 0 40px ${rgba(atm.celestial, 0.6)}`,
            }}
          />
        </div>
      )}

      {atm.moon > 0.05 && (
        <div
          className="absolute transition-all duration-1000"
          style={{
            left: `${atm.moonPos.x}%`,
            top: `${atm.moonPos.y}%`,
            transform: 'translate(-50%, -50%)',
            opacity: atm.moon,
          }}
        >
          <div
            className="w-44 h-44 rounded-full"
            style={{
              background: 'radial-gradient(circle, rgba(235, 230, 215, 0.18) 0%, transparent 70%)',
            }}
          />
          <svg
            className="w-12 h-12 absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2"
            viewBox="0 0 64 64"
          >
            <path
              d="M42,8 C27,11 16,24 16,40 C16,52 24,61 36,62 C23,58 14,47 14,34 C14,20 25,10 42,8 Z"
              fill="#F7F2E7"
            />
          </svg>
        </div>
      )}

      {/* 2. Geometric Arcs & Translucent Glass Orbs (Reference Image 1 & 2) */}
      <div
        className="absolute -top-24 -right-24 w-[48vw] h-[48vw] rounded-full border border-white/[0.14]"
        style={{
          background: `radial-gradient(circle at 30% 70%, ${rgba(atm.skyBot, 0.18)}, transparent 70%)`,
        }}
      />
      <div className="absolute top-[12%] left-[36%] w-[38vw] h-[38vw] rounded-full border border-white/[0.08]" />

      {/* Floating Translucent Glass Orbs */}
      <div
        className="absolute top-[28%] left-[22%] w-24 h-24 rounded-full border border-white/20 animate-glass-orb"
        style={{
          background: `radial-gradient(circle at 35% 35%, rgba(255,255,255,0.22) 0%, ${rgba(atm.wave2, 0.18)} 60%, transparent 80%)`,
          ['--orb-dur' as any]: '8s',
        }}
      />
      <div
        className="absolute top-[46%] right-[28%] w-16 h-16 rounded-full border border-white/15 animate-glass-orb"
        style={{
          background: `radial-gradient(circle at 35% 35%, rgba(255,255,255,0.20) 0%, ${rgba(atm.wave1, 0.15)} 60%, transparent 80%)`,
          ['--orb-dur' as any]: '11s',
        }}
      />

      {/* 3. 4 Overlapping Translucent S-Curve Silk Wave Ribbons */}
      <svg
        className="absolute bottom-0 left-0 w-[135%] h-[74%] animate-silk-a"
        viewBox="0 0 1440 500"
        preserveAspectRatio="none"
      >
        <defs>
          <linearGradient id="silk1" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor={rgb(atm.wave1)} stopOpacity="0.7" />
            <stop offset="100%" stopColor={rgb(atm.wave3)} stopOpacity="0.18" />
          </linearGradient>
          <linearGradient id="silk2" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor={rgb(atm.skyBot)} stopOpacity="0.55" />
            <stop offset="100%" stopColor={rgb(atm.wave2)} stopOpacity="0.88" />
          </linearGradient>
        </defs>
        <path
          d="M0,140 C320,40 620,290 980,170 C1220,90 1350,140 1440,190 L1440,500 L0,500 Z"
          fill="url(#silk1)"
        />
        <path
          d="M0,260 C280,340 580,110 960,180 C1200,225 1340,120 1440,95 L1440,500 L0,500 Z"
          fill="url(#silk2)"
        />
      </svg>

      <svg
        className="absolute bottom-0 left-0 w-[135%] h-[56%] animate-silk-b"
        viewBox="0 0 1440 400"
        preserveAspectRatio="none"
      >
        <defs>
          <linearGradient id="silk3" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor={rgb(atm.wave2)} stopOpacity="0.82" />
            <stop offset="100%" stopColor={rgb(atm.wave4)} stopOpacity="0.96" />
          </linearGradient>
          <linearGradient id="silk4" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor={rgb(atm.wave3)} stopOpacity="0.9" />
            <stop offset="100%" stopColor={rgb(atm.wave4)} stopOpacity="1" />
          </linearGradient>
        </defs>
        <path
          d="M0,130 C260,30 560,240 880,150 C1140,75 1320,160 1440,210 L1440,400 L0,400 Z"
          fill="url(#silk3)"
          stroke="rgba(255,255,255,0.18)"
          strokeWidth="1.4"
        />
        <path
          d="M0,250 C340,160 680,310 1060,210 C1260,155 1380,195 1440,235 L1440,400 L0,400 Z"
          fill="url(#silk4)"
          stroke="rgba(255,255,255,0.12)"
          strokeWidth="1.2"
        />
      </svg>

      {/* 4. Rain & Storm Overlay */}
      <RainVeil weather={weather} />
    </div>
  );
};
