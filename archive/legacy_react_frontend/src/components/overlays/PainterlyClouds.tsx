import React from 'react';
import type { WeatherType, RGB } from '../../themes/palettes';
import { rgb, rgba } from '../../themes/palettes';

interface PainterlyCloudsProps {
  weather: WeatherType;
  skyBot: RGB;
}

export const PainterlyClouds: React.FC<PainterlyCloudsProps> = ({ weather, skyBot }) => {
  // If clear sun, show only 1 delicate, small wispy cloud at top-right
  // If cloud, show two voluminous painterly cumulus clouds
  // If fog, show misty horizon veil and soft cloud
  // If rain/storm, show dramatic, heavy dark thunderhead clouds

  let topAlpha = 0.55;
  let baseAlpha = 0.42;
  let cloudTintTop: RGB = [255, 252, 248];
  let cloudTintBase: RGB = [218, 222, 230];

  if (weather === 'cloud') {
    topAlpha = 0.78;
    baseAlpha = 0.68;
    cloudTintTop = [245, 248, 252];
    cloudTintBase = [178, 192, 212];
  } else if (weather === 'fog') {
    topAlpha = 0.5;
    baseAlpha = 0.4;
    cloudTintTop = [218, 224, 234];
    cloudTintBase = [168, 178, 194];
  } else if (weather === 'rain') {
    topAlpha = 0.88;
    baseAlpha = 0.82;
    cloudTintTop = [130, 146, 172];
    cloudTintBase = [68, 82, 106];
  } else if (weather === 'storm') {
    topAlpha = 0.94;
    baseAlpha = 0.88;
    cloudTintTop = [98, 88, 122];
    cloudTintBase = [44, 38, 64];
  }

  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden">
      {/* ── Sun Mode: 1 Subtle Wispy Distant Cloud at Top-Right ── */}
      {weather === 'sun' && (
        <div
          className="absolute top-3 right-[14%] w-[380px] h-[160px] animate-cloud-drift opacity-50"
          style={{ ['--drift-dur' as any]: '46s' }}
        >
          <svg viewBox="0 0 500 200" className="w-full h-full" fill="none">
            <defs>
              <linearGradient id="sunWispGrad" x1="0%" y1="0%" x2="0%" y2="100%">
                <stop offset="0%" stopColor="#FFFFFF" stopOpacity="0.65" />
                <stop offset="100%" stopColor={rgb(cloudTintBase)} stopOpacity="0.15" />
              </linearGradient>
            </defs>
            <path
              d="M 40,140 C 15,120 20,80 60,70 C 80,35 135,18 190,32 C 230,8 300,5 350,30 C 390,12 450,20 480,55 C 525,50 565,75 560,115 C 580,140 560,175 520,182 C 460,186 380,178 300,182 C 220,178 140,182 90,178 C 55,180 30,160 40,140 Z"
              fill="url(#sunWispGrad)"
            />
          </svg>
        </div>
      )}

      {/* ── Cloud / Fog / Rain / Storm Modes: Sculpted Multi-Layer Clouds ── */}
      {weather !== 'sun' && (
        <>
          {/* Cloud Bank 1 (Upper Left/Center Billow) */}
          <div
            className="absolute -top-4 left-[2%] w-[680px] h-[280px] animate-cloud-drift"
            style={{ ['--drift-dur' as any]: '40s' }}
          >
            <svg viewBox="0 0 680 280" className="w-full h-full" fill="none">
              <defs>
                <linearGradient id="cloudGrad1" x1="0%" y1="0%" x2="0%" y2="100%">
                  <stop offset="0%" stopColor={rgb(cloudTintTop)} stopOpacity={topAlpha} />
                  <stop offset="60%" stopColor={rgb(cloudTintTop)} stopOpacity={topAlpha * 0.9} />
                  <stop offset="100%" stopColor={rgb(cloudTintBase)} stopOpacity={baseAlpha} />
                </linearGradient>
                <linearGradient id="cloudHigh1" x1="0%" y1="0%" x2="0%" y2="100%">
                  <stop offset="0%" stopColor="#FFFFFF" stopOpacity={weather === 'cloud' ? 0.65 : 0.25} />
                  <stop offset="100%" stopColor={rgb(cloudTintTop)} stopOpacity="0" />
                </linearGradient>
              </defs>

              {/* Main Solid Silhouette Path */}
              <path
                d="M 50,180 C 25,155 30,105 75,95 C 85,55 140,25 205,45 C 245,15 320,10 380,40 C 425,18 495,25 530,70 C 580,65 635,95 630,145 C 660,175 640,215 595,225 C 540,230 460,222 380,228 C 290,220 200,228 140,222 C 90,225 50,205 50,180 Z"
                fill="url(#cloudGrad1)"
              />

              {/* Sunlit Crest Highlight Tier */}
              {weather === 'cloud' && (
                <path
                  d="M 90,105 C 110,60 155,38 205,52 C 245,24 315,18 375,44 C 415,26 480,32 515,74 C 545,72 585,94 595,125 C 520,118 430,110 340,114 C 250,110 160,114 90,105 Z"
                  fill="url(#cloudHigh1)"
                />
              )}
            </svg>
          </div>

          {/* Cloud Bank 2 (Upper Right Stack) */}
          <div
            className="absolute top-2 right-[1%] w-[620px] h-[260px] animate-mist-float"
            style={{ ['--mist-dur' as any]: '34s' }}
          >
            <svg viewBox="0 0 620 260" className="w-full h-full" fill="none">
              <defs>
                <linearGradient id="cloudGrad2" x1="0%" y1="0%" x2="0%" y2="100%">
                  <stop offset="0%" stopColor={rgb(cloudTintTop)} stopOpacity={topAlpha * 0.95} />
                  <stop offset="65%" stopColor={rgb(cloudTintTop)} stopOpacity={topAlpha * 0.85} />
                  <stop offset="100%" stopColor={rgb(cloudTintBase)} stopOpacity={baseAlpha * 1.05} />
                </linearGradient>
              </defs>

              <path
                d="M 40,145 C 15,125 20,85 60,75 C 80,40 135,22 190,36 C 230,12 300,8 350,34 C 390,15 450,24 480,58 C 525,54 565,78 560,118 C 580,144 560,178 520,186 C 460,190 380,182 300,186 C 220,182 140,186 90,182 C 55,184 30,165 40,145 Z"
                fill="url(#cloudGrad2)"
              />
            </svg>
          </div>
        </>
      )}

      {/* Cloud 3: Distant Low Horizon Mist Band (Fog & Rain) */}
      {(weather === 'fog' || weather === 'rain') && (
        <div
          className="absolute bottom-[22%] left-0 w-full h-28 animate-mist-float"
          style={{
            background: `linear-gradient(180deg, transparent 0%, ${rgba(skyBot, weather === 'fog' ? 0.72 : 0.35)} 50%, transparent 100%)`,
          }}
        />
      )}
    </div>
  );
};
