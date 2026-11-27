import React from 'react';
import type { WeatherType } from '../../themes/palettes';
import {
  computeMeadowAtmosphere,
  rgb,
  rgba,
  FLOATING_LEAVES,
} from '../../themes/palettes';
import { PainterlyClouds } from '../overlays/PainterlyClouds';
import { RainVeil } from '../overlays/RainVeil';

interface MeadowSceneProps {
  effectiveHour: number;
  weather: WeatherType;
}

export const MeadowScene: React.FC<MeadowSceneProps> = ({ effectiveHour, weather }) => {
  const atm = computeMeadowAtmosphere(effectiveHour, weather);

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
            className="w-72 h-72 rounded-full"
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
            className="w-48 h-48 rounded-full"
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

      {/* 2. Sculpted Painterly Clouds */}
      <PainterlyClouds weather={weather} skyBot={atm.skyBot} />

      {/* 3. Layered Green Hills (Merged static SVG for 60fps single compositor layer) */}
      <svg
        className="absolute bottom-0 left-0 w-full h-[52%]"
        viewBox="0 0 1520 380"
        preserveAspectRatio="none"
      >
        <defs>
          <linearGradient id="meadowHill1" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor={rgb(atm.hill1)} stopOpacity="0.88" />
            <stop offset="100%" stopColor={rgb(atm.hill1)} stopOpacity="1" />
          </linearGradient>
          <linearGradient id="meadowHill2" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor={rgb(atm.hill2)} stopOpacity="0.94" />
            <stop offset="100%" stopColor={rgb(atm.hill2)} stopOpacity="1" />
          </linearGradient>
          <linearGradient id="meadowHill3" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor={rgb(atm.hill3)} stopOpacity="0.98" />
            <stop offset="100%" stopColor={rgb(atm.hill3)} stopOpacity="1" />
          </linearGradient>
        </defs>

        {/* Far Teal-Sage Mountains / Distant Ridge */}
        <path
          d="M0,110 C260,35 520,130 820,70 C1100,15 1320,105 1520,60 L1520,380 L0,380 Z"
          fill="url(#meadowHill1)"
        />

        {/* Mid Rolling Fresh Green Ridge */}
        <path
          d="M0,165 C220,110 460,195 760,135 C1040,80 1280,165 1520,120 L1520,380 L0,380 Z"
          fill="url(#meadowHill2)"
        />

        {/* Near Vibrant Sunlit Slope */}
        <path
          d="M0,240 C280,185 580,270 880,215 C1160,165 1380,230 1520,190 L1520,380 L0,380 Z"
          fill="url(#meadowHill3)"
        />

        {/* Foreground Grass Crest Detail */}
        <path
          d="M0,320 Q380,310 760,325 T1520,315 L1520,380 L0,380 Z"
          fill={rgb(atm.foliage)}
          opacity="0.85"
        />
      </svg>

      {/* 4. Foreground Botanical Foliage Silhouette (Left & Right Corners) */}
      <svg
        className="absolute bottom-0 left-0 w-72 h-52 animate-leaf-sway"
        viewBox="0 0 280 200"
        fill={rgb(atm.foliage)}
      >
        <g opacity="0.95">
          {/* Main Leaf Stems */}
          <path d="M-10,200 Q40,135 110,85 Q60,150 15,200 Z" />
          <path d="M10,200 Q70,145 155,120 Q85,170 30,200 Z" />
          <path d="M-5,200 Q20,110 60,55 Q30,130 10,200 Z" />
          {/* Broad Foliage Leaves */}
          <ellipse cx="64" cy="54" rx="16" ry="7" transform="rotate(-35 64 54)" />
          <ellipse cx="112" cy="86" rx="18" ry="7" transform="rotate(-25 112 86)" />
          <ellipse cx="86" cy="110" rx="15" ry="6.5" transform="rotate(-15 86 110)" />
          <ellipse cx="152" cy="122" rx="14" ry="6" transform="rotate(-10 152 122)" />
        </g>
      </svg>

      {/* Subtle Right Grass Silhouette */}
      <svg
        className="absolute bottom-0 right-0 w-56 h-36"
        viewBox="0 0 220 140"
        fill={rgb(atm.foliage)}
        opacity="0.8"
      >
        <path d="M230,140 Q180,95 130,65 Q165,110 205,140 Z" />
        <path d="M210,140 Q150,105 85,85 Q135,120 185,140 Z" />
        <ellipse cx="132" cy="66" rx="13" ry="5.5" transform="rotate(30 132 66)" />
        <ellipse cx="88" cy="86" rx="12" ry="5" transform="rotate(20 88 86)" />
      </svg>

      {/* 5. Windblown Floating Leaves (Breeze in Daylight & Clouds) */}
      {weather !== 'rain' && weather !== 'storm' && (
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          {FLOATING_LEAVES.map((leaf) => (
            <div
              key={leaf.id}
              className="absolute left-0 animate-float-leaf"
              style={{
                top: leaf.top,
                ['--leaf-dur' as any]: leaf.dur,
                ['--leaf-del' as any]: leaf.del,
              }}
            >
              <svg
                width="20"
                height="20"
                viewBox="0 0 24 24"
                style={{
                  transform: `scale(${leaf.scale}) rotate(${leaf.rot}deg)`,
                }}
              >
                <path
                  d="M4,20 C4,20 8,8 20,4 C20,4 16,16 4,20 Z"
                  fill={rgb(atm.hill3)}
                  opacity="0.75"
                />
                <line
                  x1="4"
                  y1="20"
                  x2="16"
                  y2="8"
                  stroke={rgb(atm.foliage)}
                  strokeWidth="1.2"
                />
              </svg>
            </div>
          ))}
        </div>
      )}

      {/* 6. Rain & Storm Overlay */}
      <RainVeil weather={weather} />
    </div>
  );
};
