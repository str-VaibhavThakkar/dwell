import React from 'react';
import type { WeatherType } from '../../themes/palettes';
import { FEATHERED_RAIN } from '../../themes/palettes';

interface RainVeilProps {
  weather: WeatherType;
  isDarkTheme?: boolean;
}

export const RainVeil: React.FC<RainVeilProps> = ({ weather, isDarkTheme = false }) => {
  if (weather !== 'rain' && weather !== 'storm') return null;

  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden z-[5]">
      {/* High-visibility feathered rain streaks */}
      {FEATHERED_RAIN.map((drop) => {
        const dropOpacity = isDarkTheme ? drop.opacity * 0.7 : drop.opacity;
        return (
          <div
            key={drop.id}
            className="rain-veil-drop animate-feathered-rain"
            style={{
              left: drop.left,
              width: '1.5px',
              height: `${drop.height}px`,
              background:
                'linear-gradient(180deg, transparent 0%, rgba(215, 232, 250, 0.15) 12%, rgba(238, 248, 255, 0.88) 42%, rgba(238, 248, 255, 0.88) 58%, rgba(215, 232, 250, 0.15) 88%, transparent 100%)',
              ['--drop-op' as any]: dropOpacity,
              ['--rain-dur' as any]: drop.dur,
              ['--rain-del' as any]: drop.del,
            }}
          />
        );
      })}

      {/* Dramatic Forked Lightning in Storm */}
      {weather === 'storm' && (
        <div className="absolute inset-0 animate-lightning-bolt">
          {/* Atmospheric sky flash */}
          <div
            className="absolute inset-0"
            style={{
              background:
                'radial-gradient(circle at 74% 24%, rgba(225, 205, 255, 0.35) 0%, rgba(165, 135, 215, 0.12) 50%, transparent 78%)',
            }}
          />
          {/* Detailed Jagged Forked Lightning SVG */}
          <svg className="absolute top-[4%] right-[16%] w-56 h-96" viewBox="0 0 220 380" fill="none">
            {/* Outer Lavender Halo */}
            <path
              d="M125,0 L102,74 L118,88 L84,178 L98,192 L52,315 M102,74 L146,128 L134,178 M84,178 L46,236"
              stroke="rgba(218, 192, 255, 0.55)"
              strokeWidth="7"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            {/* Bright White Core Bolt */}
            <path
              d="M125,0 L102,74 L118,88 L84,178 L98,192 L52,315 M102,74 L146,128 L134,178 M84,178 L46,236"
              stroke="#FFFDFE"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </div>
      )}
    </div>
  );
};
