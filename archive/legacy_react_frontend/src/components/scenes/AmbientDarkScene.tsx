import React from 'react';
import type { WeatherType } from '../../themes/palettes';
import { STAR_PARTICLES } from '../../themes/palettes';
import { RainVeil } from '../overlays/RainVeil';

interface AmbientDarkSceneProps {
  weather: WeatherType;
}

export const AmbientDarkScene: React.FC<AmbientDarkSceneProps> = ({ weather }) => {
  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden">
      {/* Subtle warm center radial haze */}
      <div
        className="absolute inset-0"
        style={{
          background:
            'radial-gradient(circle at 28% 46%, rgba(200, 187, 174, 0.05), transparent 64%)',
        }}
      />

      {/* Twinkling Warm Stars & Shooting Star */}
      {weather !== 'rain' && weather !== 'storm' && (
        <div style={{ opacity: 0.8 }}>
          {STAR_PARTICLES.map((s) => (
            <span
              key={s.id}
              className="absolute rounded-full animate-twinkle"
              style={{
                left: s.left,
                top: s.top,
                width: `${s.size}px`,
                height: `${s.size}px`,
                backgroundColor: s.id % 3 === 0 ? '#C8BBAE' : '#E6E2DD',
                ['--tw-dur' as any]: s.dur,
                ['--tw-del' as any]: s.del,
              }}
            />
          ))}
          <div className="absolute top-[16%] right-[22%] w-28 h-[1px] bg-gradient-to-r from-transparent via-[#E6E2DD]/70 to-transparent animate-shooting-star" />
        </div>
      )}

      {/* Whisper Silk Waves at Bottom */}
      <svg
        className="absolute bottom-0 left-0 w-[135%] h-52 animate-silk-a"
        viewBox="0 0 1440 320"
        preserveAspectRatio="none"
      >
        <defs>
          <linearGradient id="darkSilk1" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#C8BBAE" stopOpacity="0.055" />
            <stop offset="100%" stopColor="#000000" stopOpacity="0" />
          </linearGradient>
          <linearGradient id="darkSilk2" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#8DA2B5" stopOpacity="0.045" />
            <stop offset="100%" stopColor="#000000" stopOpacity="0" />
          </linearGradient>
        </defs>
        <path
          d="M0,150 C320,60 640,250 980,140 C1220,70 1350,130 1440,170 L1440,320 L0,320 Z"
          fill="url(#darkSilk1)"
        />
        <path
          d="M0,210 C280,270 600,90 960,165 C1200,210 1340,120 1440,100 L1440,320 L0,320 Z"
          fill="url(#darkSilk2)"
        />
      </svg>

      {/* Rain & Storm Overlay */}
      <RainVeil weather={weather} isDarkTheme={true} />
    </div>
  );
};
