import React from 'react';
import type { WeatherType } from '../../themes/palettes';
import {
  computeLakeAtmosphere,
  rgb,
  rgba,
  SHIMMER_LINES,
  LAKE_RIPPLES,
  PINE_TREES_PATH,
} from '../../themes/palettes';
import { PainterlyClouds } from '../overlays/PainterlyClouds';
import { RainVeil } from '../overlays/RainVeil';

interface LakeSceneProps {
  effectiveHour: number;
  weather: WeatherType;
}

export const LakeScene: React.FC<LakeSceneProps> = ({ effectiveHour, weather }) => {
  const atm = computeLakeAtmosphere(effectiveHour, weather);

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

      {/* 2. Sculpted Clouds */}
      <PainterlyClouds weather={weather} skyBot={atm.skyBot} />

      {/* 3. Mountain Ridges (23% above bottom lake) */}
      <svg
        className="absolute bottom-[23%] left-0 w-full h-[32%]"
        viewBox="0 0 1520 240"
        preserveAspectRatio="none"
      >
        {/* Far Blue-Slate Ridge */}
        <path
          d="M0,135 C240,65 480,165 760,105 C1040,55 1280,125 1520,75 L1520,240 L0,240 Z"
          fill={rgb(atm.mountain1)}
          opacity="0.82"
        />
        {/* Mid Mountain Ridge */}
        <path
          d="M0,165 C200,105 440,180 720,140 C980,95 1260,160 1520,115 L1520,240 L0,240 Z"
          fill={rgb(atm.mountain2)}
          opacity="0.94"
        />
      </svg>

      {/* 4. Pine Forest Treeline Silhouette */}
      <svg
        className="absolute bottom-[23%] left-0 w-full h-[17%]"
        viewBox="0 0 1520 100"
        preserveAspectRatio="none"
      >
        <path d={PINE_TREES_PATH} fill={rgb(atm.pineForest)} opacity="0.96" />
      </svg>

      {/* 5. Valley Mist Veil Rising Over Forest */}
      <div
        className="absolute bottom-[21%] left-0 w-full h-24 animate-mist-float pointer-events-none"
        style={{
          background: `linear-gradient(180deg, transparent 0%, ${rgba(atm.skyBot, weather === 'fog' ? 0.72 : 0.32)} 55%, transparent 100%)`,
        }}
      />

      {/* 6. Reflective Lake Water Surface (Bottom 23%) */}
      <div
        className="absolute bottom-0 left-0 w-full h-[23.5%] overflow-hidden"
        style={{
          background: `linear-gradient(180deg, ${rgb(atm.lakeWater)} 0%, ${rgb(atm.pineForest)} 45%, ${rgb(atm.mountain2)} 100%)`,
          borderTop: `1px solid ${rgba(atm.skyBot, 0.35)}`,
        }}
      >
        {/* Specular Sun / Moon Reflection Shimmer Trail */}
        {(atm.sun > 0.05 || atm.moon > 0.05) && (
          <div
            className="absolute top-0 bottom-0 w-72 -translate-x-1/2 flex flex-col items-center justify-around py-2"
            style={{
              left: `${atm.sun > 0.05 ? atm.sunPos.x : atm.moonPos.x}%`,
              background: `radial-gradient(ellipse at 50% 0%, ${rgba(atm.celestial, 0.42)} 0%, transparent 75%)`,
            }}
          >
            {SHIMMER_LINES.map((line) => (
              <div
                key={line.id}
                className="h-[2px] rounded-full animate-shimmer"
                style={{
                  width: line.width,
                  backgroundColor: rgb(atm.celestial),
                  ['--shim-dur' as any]: line.dur,
                  ['--shim-del' as any]: line.del,
                }}
              />
            ))}
          </div>
        )}

        {/* Concentric Rain Ripples on the Lake */}
        {(weather === 'rain' || weather === 'storm') && (
          <div className="absolute inset-0">
            {LAKE_RIPPLES.map((r) => (
              <div
                key={r.id}
                className="absolute rounded-full border border-white/35 animate-ripple"
                style={{
                  left: r.left,
                  bottom: r.bottom,
                  width: `${r.w}px`,
                  height: `${r.w * 0.26}px`,
                  ['--rip-dur' as any]: r.dur,
                  ['--rip-del' as any]: r.del,
                }}
              />
            ))}
          </div>
        )}
      </div>

      {/* 7. Rain & Storm Overlay */}
      <RainVeil weather={weather} />
    </div>
  );
};
