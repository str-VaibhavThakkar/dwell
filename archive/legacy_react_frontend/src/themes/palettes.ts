// ═══════════════════════════════════════════════════════════════════════════
//  5-THEME PAINTERLY ENGINE PALETTES & PROCEDURAL DATA
// ═══════════════════════════════════════════════════════════════════════════

export type RGB = [number, number, number];
export type TabIndex = 0 | 1 | 2 | 3 | 4;
export type ThemeMode = 'meadow' | 'lake' | 'abstract' | 'ambient-dark' | 'amoled';
export type TimeMode = 'live' | 'dawn' | 'day' | 'sunset' | 'night';
export type WeatherType = 'sun' | 'cloud' | 'fog' | 'rain' | 'storm';

export interface TaskItem {
  id: string;
  text: string;
  tag: string;
  done: boolean;
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * Math.max(0, Math.min(1, t));
}

export function lerpRGB(a: RGB, b: RGB, t: number): RGB {
  return [
    Math.round(lerp(a[0], b[0], t)),
    Math.round(lerp(a[1], b[1], t)),
    Math.round(lerp(a[2], b[2], t)),
  ];
}

export function rgb(c: RGB): string {
  return `rgb(${c[0]},${c[1]},${c[2]})`;
}

export function rgba(c: RGB, a: number): string {
  return `rgba(${c[0]},${c[1]},${c[2]},${a})`;
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. MEADOW THEME ATMOSPHERE (Botanical Green Hills & Sunlit Skies)
// ─────────────────────────────────────────────────────────────────────────────

interface MeadowKeyframe {
  h: number;
  skyTop: RGB;
  skyMid: RGB;
  skyBot: RGB;
  hill1: RGB; // Distant teal-sage mountain (#6BA39B range)
  hill2: RGB; // Mid rich green ridge (#559E68 range)
  hill3: RGB; // Near lush green slope (#488E45 - #7EC850 range)
  foliage: RGB; // Foreground botanicals (#1D3B24 range)
  celestial: RGB;
  stars: number;
  sun: number;
  moon: number;
}

const MEADOW_TIMELINE: MeadowKeyframe[] = [
  // 00:00 Midnight
  {
    h: 0,
    skyTop: [12, 18, 42],
    skyMid: [18, 28, 58],
    skyBot: [26, 38, 70],
    hill1: [18, 36, 48],
    hill2: [14, 30, 38],
    hill3: [10, 24, 28],
    foliage: [6, 16, 18],
    celestial: [245, 238, 215],
    stars: 0.9,
    sun: 0,
    moon: 0.95,
  },
  // 05:30 Pastel Rose & Amber Dawn
  {
    h: 5.5,
    skyTop: [198, 142, 172],
    skyMid: [235, 175, 162],
    skyBot: [248, 212, 176],
    hill1: [108, 148, 138], // Teal-sage mist
    hill2: [86, 138, 98],   // Olive-green dawn ridge
    hill3: [64, 118, 78],   // Deep warm green
    foliage: [42, 78, 52],
    celestial: [255, 244, 208],
    stars: 0.1,
    sun: 0.85,
    moon: 0,
  },
  // 09:00 Fresh Morning Cerulean
  {
    h: 9.0,
    skyTop: [88, 168, 228],
    skyMid: [148, 208, 218],
    skyBot: [205, 232, 212],
    hill1: [107, 163, 155], // #6BA39B Teal-sage
    hill2: [85, 158, 104],  // #559E68 Rich sage green
    hill3: [72, 142, 69],   // #488E45
    foliage: [36, 82, 48],
    celestial: [255, 248, 215],
    stars: 0,
    sun: 0.95,
    moon: 0,
  },
  // 13:00 Vibrant Sunlit Meadow Day
  {
    h: 13.0,
    skyTop: [68, 148, 232],
    skyMid: [120, 188, 240],
    skyBot: [188, 222, 204],
    hill1: [107, 163, 155], // #6BA39B
    hill2: [85, 158, 104],  // #559E68
    hill3: [126, 200, 80],  // #7EC850 Bright sunlit grass
    foliage: [46, 102, 58],
    celestial: [255, 246, 200],
    stars: 0,
    sun: 1,
    moon: 0,
  },
  // 18:15 Golden Sunset Over Fields
  {
    h: 18.25,
    skyTop: [128, 88, 138],
    skyMid: [214, 128, 114],
    skyBot: [248, 172, 94],
    hill1: [112, 118, 108],
    hill2: [94, 116, 78],
    hill3: [78, 102, 58],
    foliage: [48, 68, 42],
    celestial: [255, 228, 164],
    stars: 0.1,
    sun: 0.9,
    moon: 0,
  },
  // 21:00 Twilight Dusk
  {
    h: 21.0,
    skyTop: [18, 24, 56],
    skyMid: [28, 38, 76],
    skyBot: [38, 52, 90],
    hill1: [24, 48, 60],
    hill2: [18, 38, 48],
    hill3: [14, 30, 36],
    foliage: [8, 20, 24],
    celestial: [245, 238, 215],
    stars: 0.85,
    sun: 0,
    moon: 0.9,
  },
  // 24:00 Midnight
  {
    h: 24.0,
    skyTop: [12, 18, 42],
    skyMid: [18, 28, 58],
    skyBot: [26, 38, 70],
    hill1: [18, 36, 48],
    hill2: [14, 30, 38],
    hill3: [10, 24, 28],
    foliage: [6, 16, 18],
    celestial: [245, 238, 215],
    stars: 0.9,
    sun: 0,
    moon: 0.95,
  },
];

export function computeMeadowAtmosphere(hour: number, weather: WeatherType) {
  const t = (hour + 24) % 24;
  let lo = MEADOW_TIMELINE[0], hi = MEADOW_TIMELINE[1];
  for (let i = 0; i < MEADOW_TIMELINE.length - 1; i++) {
    if (t >= MEADOW_TIMELINE[i].h && t <= MEADOW_TIMELINE[i + 1].h) {
      lo = MEADOW_TIMELINE[i];
      hi = MEADOW_TIMELINE[i + 1];
      break;
    }
  }
  const p = hi.h > lo.h ? (t - lo.h) / (hi.h - lo.h) : 0;

  let skyTop = lerpRGB(lo.skyTop, hi.skyTop, p);
  let skyMid = lerpRGB(lo.skyMid, hi.skyMid, p);
  let skyBot = lerpRGB(lo.skyBot, hi.skyBot, p);
  let hill1 = lerpRGB(lo.hill1, hi.hill1, p);
  let hill2 = lerpRGB(lo.hill2, hi.hill2, p);
  let hill3 = lerpRGB(lo.hill3, hi.hill3, p);
  let foliage = lerpRGB(lo.foliage, hi.foliage, p);
  const celestial = lerpRGB(lo.celestial, hi.celestial, p);
  let stars = lerp(lo.stars, hi.stars, p);
  let sun = lerp(lo.sun, hi.sun, p);
  let moon = lerp(lo.moon, hi.moon, p);

  // Weather overrides
  if (weather === 'cloud' || weather === 'fog') {
    skyTop = lerpRGB(skyTop, [142, 162, 188], 0.68);
    skyMid = lerpRGB(skyMid, [172, 188, 206], 0.68);
    skyBot = lerpRGB(skyBot, [198, 212, 218], 0.68);
    hill1 = lerpRGB(hill1, [120, 152, 146], 0.45);
    hill2 = lerpRGB(hill2, [98, 140, 110], 0.35);
    hill3 = lerpRGB(hill3, [86, 134, 88], 0.3);
    sun *= 0.3;
    stars *= 0.15;
  } else if (weather === 'rain') {
    // Moody overcast green
    skyTop = lerpRGB(skyTop, [68, 92, 118], 0.8);
    skyMid = lerpRGB(skyMid, [86, 114, 136], 0.8);
    skyBot = lerpRGB(skyBot, [112, 138, 148], 0.8);
    hill1 = lerpRGB(hill1, [64, 98, 98], 0.7);
    hill2 = lerpRGB(hill2, [52, 94, 76], 0.65);
    hill3 = lerpRGB(hill3, [48, 92, 60], 0.6);
    foliage = lerpRGB(foliage, [28, 58, 38], 0.7);
    sun = 0;
    moon = 0;
    stars = 0;
  } else if (weather === 'storm') {
    // Amethyst storm tint over the hills
    skyTop = [58, 54, 84];
    skyMid = [88, 76, 114];
    skyBot = [124, 102, 142];
    hill1 = [68, 74, 96];
    hill2 = [54, 72, 72];
    hill3 = [46, 68, 54];
    foliage = [24, 42, 34];
    sun = 0;
    moon = 0;
    stars = 0;
  }

  const isDawnOrSunset = (t >= 5 && t <= 7.5) || (t >= 17 && t <= 19.5);
  const sunY = isDawnOrSunset ? 66 : 28;
  const sunX = t < 12 ? 26 : 36;

  return {
    skyGradient: `linear-gradient(180deg, ${rgb(skyTop)} 0%, ${rgb(skyMid)} 54%, ${rgb(skyBot)} 100%)`,
    skyTop, skyMid, skyBot,
    hill1, hill2, hill3, foliage,
    celestial,
    stars, sun, moon,
    sunPos: { x: sunX, y: sunY },
    moonPos: { x: 64, y: 24 },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. MOUNTAIN LAKE THEME ATMOSPHERE (Blue-Slate Ridges & Reflective Water)
// ─────────────────────────────────────────────────────────────────────────────

interface LakeKeyframe {
  h: number;
  skyTop: RGB;
  skyMid: RGB;
  skyBot: RGB;
  mountain1: RGB; // Distant ridge (#6889A8)
  mountain2: RGB; // Mid ridge (#496A8A)
  pineForest: RGB; // Silhouette treeline (#1D354D)
  lakeWater: RGB;  // Deep reflective surface (#2F4B69)
  celestial: RGB;
  stars: number;
  sun: number;
  moon: number;
}

const LAKE_TIMELINE: LakeKeyframe[] = [
  // 00:00 Midnight
  {
    h: 0,
    skyTop: [10, 18, 42],
    skyMid: [16, 28, 62],
    skyBot: [22, 40, 78],
    mountain1: [18, 36, 66],
    mountain2: [14, 28, 52],
    pineForest: [10, 20, 38],
    lakeWater: [12, 24, 48],
    celestial: [245, 238, 215],
    stars: 0.9,
    sun: 0,
    moon: 0.95,
  },
  // 05:30 Pastel Rose & Gold Dawn Over Mountains
  {
    h: 5.5,
    skyTop: [184, 136, 168],
    skyMid: [226, 164, 160],
    skyBot: [246, 196, 156],
    mountain1: [112, 102, 140],
    mountain2: [86, 80, 120],
    pineForest: [44, 48, 80],
    lakeWater: [108, 92, 126], // Rich reflective mauve-slate
    celestial: [255, 244, 208],
    stars: 0.1,
    sun: 0.85,
    moon: 0,
  },
  // 09:00 Crisp Morning Alpine Blue
  {
    h: 9.0,
    skyTop: [92, 164, 216],
    skyMid: [144, 196, 226],
    skyBot: [196, 218, 232],
    mountain1: [94, 134, 174],
    mountain2: [72, 112, 154],
    pineForest: [32, 64, 98],
    lakeWater: [54, 98, 142],
    celestial: [255, 248, 215],
    stars: 0,
    sun: 0.95,
    moon: 0,
  },
  // 13:00 High Contrast Mountain Lake Day
  {
    h: 13.0,
    skyTop: [72, 148, 228],
    skyMid: [118, 178, 238],
    skyBot: [178, 208, 228],
    mountain1: [104, 137, 168], // #6889A8
    mountain2: [73, 106, 138],  // #496A8A
    pineForest: [29, 53, 77],   // #1D354D
    lakeWater: [47, 75, 105],   // #2F4B69
    celestial: [255, 246, 200],
    stars: 0,
    sun: 1,
    moon: 0,
  },
  // 18:15 Crimson & Violet Alpine Glow Sunset
  {
    h: 18.25,
    skyTop: [104, 76, 118],
    skyMid: [196, 114, 106],
    skyBot: [246, 164, 96],
    mountain1: [96, 74, 108],
    mountain2: [74, 58, 90],
    pineForest: [38, 34, 58],
    lakeWater: [92, 62, 88],
    celestial: [255, 226, 164],
    stars: 0.1,
    sun: 0.9,
    moon: 0,
  },
  // 21:00 Twilight Dusk
  {
    h: 21.0,
    skyTop: [14, 22, 50],
    skyMid: [22, 36, 72],
    skyBot: [30, 48, 88],
    mountain1: [22, 42, 72],
    mountain2: [18, 34, 58],
    pineForest: [12, 22, 44],
    lakeWater: [16, 30, 56],
    celestial: [245, 238, 215],
    stars: 0.85,
    sun: 0,
    moon: 0.9,
  },
  // 24:00 Midnight
  {
    h: 24.0,
    skyTop: [10, 18, 42],
    skyMid: [16, 28, 62],
    skyBot: [22, 40, 78],
    mountain1: [18, 36, 66],
    mountain2: [14, 28, 52],
    pineForest: [10, 20, 38],
    lakeWater: [12, 24, 48],
    celestial: [245, 238, 215],
    stars: 0.9,
    sun: 0,
    moon: 0.95,
  },
];

export function computeLakeAtmosphere(hour: number, weather: WeatherType) {
  const t = (hour + 24) % 24;
  let lo = LAKE_TIMELINE[0], hi = LAKE_TIMELINE[1];
  for (let i = 0; i < LAKE_TIMELINE.length - 1; i++) {
    if (t >= LAKE_TIMELINE[i].h && t <= LAKE_TIMELINE[i + 1].h) {
      lo = LAKE_TIMELINE[i];
      hi = LAKE_TIMELINE[i + 1];
      break;
    }
  }
  const p = hi.h > lo.h ? (t - lo.h) / (hi.h - lo.h) : 0;

  let skyTop = lerpRGB(lo.skyTop, hi.skyTop, p);
  let skyMid = lerpRGB(lo.skyMid, hi.skyMid, p);
  let skyBot = lerpRGB(lo.skyBot, hi.skyBot, p);
  let mountain1 = lerpRGB(lo.mountain1, hi.mountain1, p);
  let mountain2 = lerpRGB(lo.mountain2, hi.mountain2, p);
  let pineForest = lerpRGB(lo.pineForest, hi.pineForest, p);
  let lakeWater = lerpRGB(lo.lakeWater, hi.lakeWater, p);
  const celestial = lerpRGB(lo.celestial, hi.celestial, p);
  let stars = lerp(lo.stars, hi.stars, p);
  let sun = lerp(lo.sun, hi.sun, p);
  let moon = lerp(lo.moon, hi.moon, p);

  // Weather overrides
  if (weather === 'cloud' || weather === 'fog') {
    skyTop = lerpRGB(skyTop, [144, 164, 192], 0.72);
    skyMid = lerpRGB(skyMid, [172, 186, 208], 0.72);
    skyBot = lerpRGB(skyBot, [200, 210, 222], 0.72);
    mountain1 = lerpRGB(mountain1, [140, 156, 178], 0.6);
    mountain2 = lerpRGB(mountain2, [118, 134, 158], 0.55);
    pineForest = lerpRGB(pineForest, [62, 82, 108], 0.45);
    lakeWater = lerpRGB(lakeWater, [78, 102, 132], 0.4);
    sun *= 0.25;
    stars *= 0.15;
  } else if (weather === 'rain') {
    skyTop = lerpRGB(skyTop, [72, 104, 132], 0.82);
    skyMid = lerpRGB(skyMid, [92, 128, 154], 0.82);
    skyBot = lerpRGB(skyBot, [116, 152, 174], 0.82);
    mountain1 = lerpRGB(mountain1, [82, 118, 142], 0.75);
    mountain2 = lerpRGB(mountain2, [64, 98, 124], 0.75);
    pineForest = lerpRGB(pineForest, [28, 52, 74], 0.8);
    lakeWater = lerpRGB(lakeWater, [38, 64, 88], 0.8);
    sun = 0;
    moon = 0;
    stars = 0;
  } else if (weather === 'storm') {
    skyTop = [60, 58, 88];
    skyMid = [94, 82, 120];
    skyBot = [132, 110, 152];
    mountain1 = [86, 78, 114];
    mountain2 = [68, 62, 94];
    pineForest = [26, 28, 48];
    lakeWater = [32, 34, 58];
    sun = 0;
    moon = 0;
    stars = 0;
  }

  const isDawnOrSunset = (t >= 5 && t <= 7.5) || (t >= 17 && t <= 19.5);
  const sunY = isDawnOrSunset ? 66 : 28;
  const sunX = t < 12 ? 26 : 36;

  return {
    skyGradient: `linear-gradient(180deg, ${rgb(skyTop)} 0%, ${rgb(skyMid)} 54%, ${rgb(skyBot)} 100%)`,
    skyTop, skyMid, skyBot,
    mountain1, mountain2, pineForest, lakeWater,
    celestial,
    stars, sun, moon,
    sunPos: { x: sunX, y: sunY },
    moonPos: { x: 64, y: 24 },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. ABSTRACT SILK ATMOSPHERE (Flowing Silk Ribbons & Glowing Orbs)
// ─────────────────────────────────────────────────────────────────────────────

interface AbstractKeyframe {
  h: number;
  skyTop: RGB;
  skyMid: RGB;
  skyBot: RGB;
  wave1: RGB;
  wave2: RGB;
  wave3: RGB;
  wave4: RGB;
  celestial: RGB;
  stars: number;
  sun: number;
  moon: number;
}

const ABSTRACT_TIMELINE: AbstractKeyframe[] = [
  // 00:00 Deep Indigo Night with Neon Ribbon accents
  {
    h: 0,
    skyTop: [10, 20, 46],
    skyMid: [16, 33, 68],
    skyBot: [24, 48, 88],
    wave1: [28, 54, 102],
    wave2: [22, 44, 86],
    wave3: [16, 32, 68],
    wave4: [12, 22, 48],
    celestial: [245, 238, 215],
    stars: 0.9,
    sun: 0,
    moon: 0.95,
  },
  // 05:30 Pastel Rose & Lavender Dawn
  {
    h: 5.5,
    skyTop: [178, 146, 194],
    skyMid: [226, 168, 172],
    skyBot: [246, 206, 164],
    wave1: [212, 148, 168],
    wave2: [188, 126, 158],
    wave3: [156, 104, 146],
    wave4: [124, 84, 132],
    celestial: [255, 244, 208],
    stars: 0.1,
    sun: 0.85,
    moon: 0,
  },
  // 09:00 Mint & Cerulean Morning
  {
    h: 9.0,
    skyTop: [108, 178, 212],
    skyMid: [154, 208, 208],
    skyBot: [218, 232, 198],
    wave1: [148, 204, 192],
    wave2: [116, 182, 176],
    wave3: [88, 158, 162],
    wave4: [64, 134, 144],
    celestial: [255, 246, 210],
    stars: 0,
    sun: 0.95,
    moon: 0,
  },
  // 13:00 Clear Sky Blue & Warm Alabaster Day
  {
    h: 13.0,
    skyTop: [78, 148, 224],
    skyMid: [128, 182, 234],
    skyBot: [228, 226, 196],
    wave1: [148, 192, 224],
    wave2: [122, 172, 208],
    wave3: [98, 152, 188],
    wave4: [76, 132, 168],
    celestial: [255, 244, 198],
    stars: 0,
    sun: 1,
    moon: 0,
  },
  // 18:15 Warm Amber, Terracotta & Violet Sunset
  {
    h: 18.25,
    skyTop: [96, 82, 132],
    skyMid: [178, 108, 114],
    skyBot: [244, 156, 86],
    wave1: [196, 118, 104],
    wave2: [162, 96, 108],
    wave3: [126, 76, 104],
    wave4: [92, 58, 92],
    celestial: [255, 226, 164],
    stars: 0.1,
    sun: 0.9,
    moon: 0,
  },
  // 21:00 Twilight Indigo
  {
    h: 21.0,
    skyTop: [14, 24, 54],
    skyMid: [22, 38, 76],
    skyBot: [32, 54, 96],
    wave1: [32, 54, 98],
    wave2: [24, 42, 80],
    wave3: [18, 30, 64],
    wave4: [12, 20, 48],
    celestial: [245, 238, 215],
    stars: 0.85,
    sun: 0,
    moon: 0.9,
  },
  // 24:00 Midnight
  {
    h: 24.0,
    skyTop: [10, 20, 46],
    skyMid: [16, 33, 68],
    skyBot: [24, 48, 88],
    wave1: [28, 54, 102],
    wave2: [22, 44, 86],
    wave3: [16, 32, 68],
    wave4: [12, 22, 48],
    celestial: [245, 238, 215],
    stars: 0.9,
    sun: 0,
    moon: 0.95,
  },
];

export function computeAbstractAtmosphere(hour: number, weather: WeatherType) {
  const t = (hour + 24) % 24;
  let lo = ABSTRACT_TIMELINE[0], hi = ABSTRACT_TIMELINE[1];
  for (let i = 0; i < ABSTRACT_TIMELINE.length - 1; i++) {
    if (t >= ABSTRACT_TIMELINE[i].h && t <= ABSTRACT_TIMELINE[i + 1].h) {
      lo = ABSTRACT_TIMELINE[i];
      hi = ABSTRACT_TIMELINE[i + 1];
      break;
    }
  }
  const p = hi.h > lo.h ? (t - lo.h) / (hi.h - lo.h) : 0;

  let skyTop = lerpRGB(lo.skyTop, hi.skyTop, p);
  let skyMid = lerpRGB(lo.skyMid, hi.skyMid, p);
  let skyBot = lerpRGB(lo.skyBot, hi.skyBot, p);
  let wave1 = lerpRGB(lo.wave1, hi.wave1, p);
  let wave2 = lerpRGB(lo.wave2, hi.wave2, p);
  let wave3 = lerpRGB(lo.wave3, hi.wave3, p);
  let wave4 = lerpRGB(lo.wave4, hi.wave4, p);
  const celestial = lerpRGB(lo.celestial, hi.celestial, p);
  let stars = lerp(lo.stars, hi.stars, p);
  let sun = lerp(lo.sun, hi.sun, p);
  let moon = lerp(lo.moon, hi.moon, p);

  if (weather === 'cloud' || weather === 'fog') {
    skyTop = lerpRGB(skyTop, [146, 164, 192], 0.72);
    skyMid = lerpRGB(skyMid, [174, 188, 208], 0.72);
    skyBot = lerpRGB(skyBot, [204, 212, 224], 0.72);
    wave1 = lerpRGB(wave1, [156, 172, 198], 0.75);
    wave2 = lerpRGB(wave2, [134, 150, 178], 0.75);
    wave3 = lerpRGB(wave3, [112, 128, 158], 0.75);
    wave4 = lerpRGB(wave4, [92, 108, 138], 0.75);
    sun *= 0.25;
    stars *= 0.15;
  } else if (weather === 'rain') {
    skyTop = lerpRGB(skyTop, [74, 108, 136], 0.82);
    skyMid = lerpRGB(skyMid, [94, 132, 158], 0.82);
    skyBot = lerpRGB(skyBot, [118, 156, 178], 0.82);
    wave1 = lerpRGB(wave1, [86, 128, 152], 0.85);
    wave2 = lerpRGB(wave2, [68, 112, 138], 0.85);
    wave3 = lerpRGB(wave3, [54, 94, 120], 0.85);
    wave4 = lerpRGB(wave4, [42, 78, 102], 0.85);
    sun = 0;
    moon = 0;
    stars = 0;
  } else if (weather === 'storm') {
    skyTop = [64, 62, 92];
    skyMid = [98, 86, 126];
    skyBot = [138, 114, 158];
    wave1 = [112, 96, 138];
    wave2 = [92, 78, 118];
    wave3 = [74, 62, 98];
    wave4 = [56, 48, 78];
    sun = 0;
    moon = 0;
    stars = 0;
  }

  const isDawnOrSunset = (t >= 5 && t <= 7.5) || (t >= 17 && t <= 19.5);
  const sunY = isDawnOrSunset ? 66 : 28;
  const sunX = t < 12 ? 26 : 36;

  return {
    skyGradient: `linear-gradient(180deg, ${rgb(skyTop)} 0%, ${rgb(skyMid)} 54%, ${rgb(skyBot)} 100%)`,
    skyTop, skyMid, skyBot,
    wave1, wave2, wave3, wave4,
    celestial,
    stars, sun, moon,
    sunPos: { x: sunX, y: sunY },
    moonPos: { x: 64, y: 24 },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. PRE-COMPUTED DETERMINISTIC VISUAL DATA ARRAYS
// ─────────────────────────────────────────────────────────────────────────────

export const STAR_PARTICLES = Array.from({ length: 34 }, (_, i) => ({
  id: i,
  left: `${(i * 37 + 9) % 96}%`,
  top: `${(i * 41 + 5) % 58}%`,
  size: i % 5 === 0 ? 2.5 : i % 2 === 0 ? 1.8 : 1.2,
  dur: `${3.6 + (i % 5) * 1.1}s`,
  del: `${(i * 0.35) % 4.5}s`,
}));

// Feathered, high-visibility rain streaks (tapered at BOTH ends, 32-44 drops)
export const FEATHERED_RAIN = Array.from({ length: 38 }, (_, i) => {
  const dur = 0.42 + (i % 4) * 0.05;
  const del = -((i * 0.13) % dur);
  return {
    id: i,
    left: `${(i * 31 + 5) % 102 - 1}%`,
    height: 95 + (i % 4) * 22, // 95px - 161px
    opacity: i % 3 === 0 ? 0.88 : 0.78,
    dur: `${dur.toFixed(2)}s`,
    del: `${del.toFixed(2)}s`,
  };
});

export const LAKE_RIPPLES = Array.from({ length: 10 }, (_, i) => ({
  id: i,
  left: `${12 + (i * 69) % 80}%`,
  bottom: `${4 + (i % 4) * 4.4}%`,
  w: 30 + (i % 3) * 16,
  dur: `${1.2 + (i % 3) * 0.3}s`,
  del: `-${((i * 0.29) % 1.4).toFixed(2)}s`,
}));

export const SHIMMER_LINES = Array.from({ length: 14 }, (_, i) => ({
  id: i,
  top: `${10 + i * 6.4}%`,
  width: `${18 + ((14 - i) * 4) + (i % 3) * 6}%`,
  dur: `${4 + (i % 4) * 1.2}s`,
  del: `${(i * 0.4) % 3}s`,
}));

export const FLOATING_LEAVES = [
  { id: 1, top: '22%', dur: '17s', del: '-3s', scale: 0.85, rot: 15 },
  { id: 2, top: '38%', dur: '22s', del: '-11s', scale: 1.1, rot: -20 },
  { id: 3, top: '56%', dur: '19s', del: '-7s', scale: 0.95, rot: 35 },
];

export const PINE_TREES_PATH = (() => {
  let d = 'M0,100 ';
  for (let x = 0; x <= 1520; x += 14) {
    const hillBase = 68 + Math.sin(x * 0.005) * 14 + Math.cos(x * 0.012) * 8;
    const treeHeight = (x % 28 === 0 ? 19 : 12) * (x > 550 && x < 980 ? 0.35 : 1);
    d += `L${x},${hillBase} L${x + 7},${hillBase - treeHeight} `;
  }
  return d + 'L1520,100 Z';
})();
