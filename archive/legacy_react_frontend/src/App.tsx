import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  CloudRain, Sun, Cloud, CloudFog, CloudLightning, Laptop, Bell,
  ChevronLeft, ChevronRight, Wifi, Sparkles, Palette,
  Flame, Check, Circle, Play, Pause, RotateCcw,
  Terminal, Cpu, HardDrive, Sunrise, Sunset, Moon, BatteryCharging
} from 'lucide-react';

import {
  type TabIndex,
  type ThemeMode,
  type TimeMode,
  type WeatherType,
  type TaskItem,
  computeMeadowAtmosphere,
  computeLakeAtmosphere,
  computeAbstractAtmosphere,
} from './themes/palettes';

import { MeadowScene } from './components/scenes/MeadowScene';
import { LakeScene } from './components/scenes/LakeScene';
import { AbstractScene } from './components/scenes/AbstractScene';
import { AmbientDarkScene } from './components/scenes/AmbientDarkScene';

export default function App() {
  const [activeTab, setActiveTab] = useState<TabIndex>(0);

  // --- Theme & Time States with LocalStorage Persistence ---
  const [themeMode, setThemeMode] = useState<ThemeMode>(() => {
    const saved = localStorage.getItem('deskdock_theme') as ThemeMode;
    return ['meadow', 'lake', 'abstract', 'ambient-dark', 'amoled'].includes(saved)
      ? saved
      : 'meadow';
  });

  const [timeMode, setTimeMode] = useState<TimeMode>(() => {
    const saved = localStorage.getItem('deskdock_time') as TimeMode;
    return ['live', 'dawn', 'day', 'sunset', 'night'].includes(saved)
      ? saved
      : 'live';
  });

  useEffect(() => {
    localStorage.setItem('deskdock_theme', themeMode);
  }, [themeMode]);

  useEffect(() => {
    localStorage.setItem('deskdock_time', timeMode);
  }, [timeMode]);

  // --- Clock Engine ---
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  const effectiveHour = useMemo(() => {
    switch (timeMode) {
      case 'dawn':   return 5.6;   // Pastel Rose & Gold Dawn
      case 'day':    return 13.0;  // Serene Sky Day
      case 'sunset': return 18.25; // Warm Terracotta & Violet Sunset
      case 'night':  return 23.0;  // Deep Indigo Starry Night
      case 'live':
      default:
        return now.getHours() + now.getMinutes() / 60;
    }
  }, [timeMode, now]);

  const timeFormatted = useMemo(() => {
    const sourceHours = timeMode === 'live' ? now.getHours() : Math.floor(effectiveHour);
    const sourceMins = timeMode === 'live' ? now.getMinutes() : Math.round((effectiveHour % 1) * 60) % 60;
    const ampm = sourceHours >= 12 ? 'PM' : 'AM';
    const h = sourceHours % 12 || 12;
    return {
      hours: h.toString().padStart(2, '0'),
      minutes: sourceMins.toString().padStart(2, '0'),
      ampm,
    };
  }, [timeMode, effectiveHour, now]);

  const dateFormatted = useMemo(() =>
    now.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' }),
  [now]);

  // --- Weather State ---
  const [weather, setWeather] = useState({
    temp: 26,
    condition: 'Clear Sky',
    city: 'Kolkata, WB',
    aqi: 84,
    weatherType: 'sun' as WeatherType,
  });

  useEffect(() => {
    async function fetchWeather() {
      try {
        const res = await fetch(
          'https://api.open-meteo.com/v1/forecast?latitude=22.5726&longitude=88.3639&current=temperature_2m,weather_code&timezone=auto'
        );
        const data = await res.json();
        if (data.current) {
          const code = data.current.weather_code;
          let cond = 'Clear Sky', type: WeatherType = 'sun';
          if (code >= 95) { cond = 'Thunderstorm'; type = 'storm'; }
          else if (code >= 51 && code <= 82) { cond = 'Monsoon Rain'; type = 'rain'; }
          else if (code >= 45 && code <= 48) { cond = 'Valley Mist'; type = 'fog'; }
          else if (code >= 1 && code <= 3) { cond = 'Soft Clouds'; type = 'cloud'; }
          setWeather(prev => ({
            ...prev,
            temp: Math.round(data.current.temperature_2m),
            condition: cond,
            weatherType: type,
          }));
        }
      } catch { /* fallback */ }
    }
    fetchWeather();
    const t = setInterval(fetchWeather, 20 * 60_000);
    return () => clearInterval(t);
  }, []);

  // --- Interactive Cyclers for Theme, Time, and Weather ---
  const cycleTheme = useCallback((reverse = false) => {
    const order: ThemeMode[] = ['meadow', 'lake', 'abstract', 'ambient-dark', 'amoled'];
    setThemeMode(prev => {
      const idx = order.indexOf(prev);
      const step = reverse ? -1 : 1;
      return order[(idx + step + order.length) % order.length];
    });
  }, []);

  const cycleTimeMode = useCallback(() => {
    const order: TimeMode[] = ['live', 'dawn', 'day', 'sunset', 'night'];
    setTimeMode(prev => order[(order.indexOf(prev) + 1) % order.length]);
  }, []);

  const cycleWeather = useCallback(() => {
    const order: { type: WeatherType; cond: string }[] = [
      { type: 'sun', cond: 'Clear Sky' },
      { type: 'cloud', cond: 'Soft Overcast' },
      { type: 'fog', cond: 'Valley Mist' },
      { type: 'rain', cond: 'Monsoon Showers' },
      { type: 'storm', cond: 'Violet Storm' },
    ];
    setWeather(prev => {
      const idx = order.findIndex(o => o.type === prev.weatherType);
      const next = order[(idx + 1) % order.length];
      return { ...prev, weatherType: next.type, condition: next.cond };
    });
  }, []);

  const weatherIcon = useMemo(() => {
    const cls = "w-8 h-8 stroke-[1.75]";
    switch (weather.weatherType) {
      case 'sun':   return <Sun className={`${cls} text-[#C9A679]`} />;
      case 'cloud': return <Cloud className={`${cls} text-[#C8BBAE]`} />;
      case 'fog':   return <CloudFog className={`${cls} text-[#9E9A95]`} />;
      case 'rain':  return <CloudRain className={`${cls} text-[#8DA2B5]`} />;
      case 'storm': return <CloudLightning className={`${cls} text-[#B896A3]`} />;
    }
  }, [weather.weatherType]);

  // --- Live Hardware & PC Telemetry ---
  const [battery, setBattery] = useState({
    level: 54,
    voltage: '3.82V',
    state: 'Idle',
    isSuspended: true,
    temp: 31.4,
  });

  const [pc, setPc] = useState({
    isActive: true,
    cpuLoad: 18,
    cpuTemp: 42,
    ramPercent: 54,
    ramUsed: '4.3GB',
    ramTotal: '8.0GB',
    networkSpeed: '3.4 MB/s',
  });

  useEffect(() => {
    const poll = async () => {
      try {
        const [bRes, pRes] = await Promise.all([
          fetch('/api/battery').catch(() => null),
          fetch('/api/pc').catch(() => null),
        ]);
        if (bRes && bRes.ok) {
          const b = await bRes.json();
          if (typeof b.capacity === 'number') {
            setBattery({
              level: b.capacity,
              voltage: `${(b.voltage / 1e6).toFixed(2)}V`,
              state: b.charging_suspended ? 'Idle' : 'Charging',
              isSuspended: Boolean(b.charging_suspended),
              temp: b.temperature || 31.4,
            });
          }
        }
        if (pRes && pRes.ok) {
          const p = await pRes.json();
          if (typeof p.cpu_load === 'number') {
            setPc({
              isActive: p.is_active ?? true,
              cpuLoad: p.cpu_load,
              cpuTemp: p.cpu_temp || 42,
              ramPercent: p.ram_percent || 54,
              ramUsed: p.ram_used || '4.3GB',
              ramTotal: p.ram_total || '8.0GB',
              networkSpeed: p.network_speed || '3.4 MB/s',
            });
          }
        }
      } catch { /* keep defaults */ }
    };
    poll();
    const id = setInterval(poll, 4000);
    return () => clearInterval(id);
  }, []);

  // --- JEE 2028 Countdown ---
  const jeeTarget = useMemo(() => new Date('2028-05-21T09:00:00'), []);
  const jeeCountdown = useMemo(() => {
    const d = Math.max(0, jeeTarget.getTime() - now.getTime());
    return {
      days: Math.floor(d / 864e5).toString(),
      hours: (Math.floor(d / 36e5) % 24).toString().padStart(2, '0'),
      minutes: (Math.floor(d / 6e4) % 60).toString().padStart(2, '0'),
      seconds: (Math.floor(d / 1e3) % 60).toString().padStart(2, '0'),
    };
  }, [jeeTarget, now]);

  // --- Pomodoro Timer ---
  const TOTAL_POMO = 25 * 60;
  const [pomoSecs, setPomoSecs] = useState(TOTAL_POMO);
  const [pomoRunning, setPomoRunning] = useState(false);
  const [pomoSessions, setPomoSessions] = useState(4);

  useEffect(() => {
    if (!pomoRunning || pomoSecs <= 0) {
      if (pomoSecs === 0) {
        setPomoRunning(false);
        setPomoSessions(s => s + 1);
        setPomoSecs(TOTAL_POMO);
      }
      return;
    }
    const t = setInterval(() => setPomoSecs(s => s - 1), 1000);
    return () => clearInterval(t);
  }, [pomoRunning, pomoSecs, TOTAL_POMO]);

  const pomoFormatted = useMemo(() => {
    const m = Math.floor(pomoSecs / 60).toString().padStart(2, '0');
    const s = (pomoSecs % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  }, [pomoSecs]);

  const pomoProgress = ((TOTAL_POMO - pomoSecs) / TOTAL_POMO) * 100;

  // --- Priority Tasks ---
  const [tasks, setTasks] = useState<TaskItem[]>([
    { id: '1', tag: 'PHYSICS', text: 'Rotational Dynamics Problem Set 4', done: true },
    { id: '2', tag: 'MATHS', text: 'Coordinate Geometry Review (Circles)', done: false },
    { id: '3', tag: 'CHEM', text: 'Thermodynamics Formula Sheet', done: false },
  ]);
  const toggleTask = (id: string) => setTasks(p => p.map(t => t.id === id ? { ...t, done: !t.done } : t));

  // --- Navigation & Keyboard Shortcuts ---
  const tabTitles = ['StandBy', 'JEE 2028', 'Focus', 'Kernel', 'Telemetry'];
  const nextTab = useCallback(() => setActiveTab(p => ((p + 1) % 5) as TabIndex), []);
  const prevTab = useCallback(() => setActiveTab(p => ((p - 1 + 5) % 5) as TabIndex), []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (['ArrowRight', 'ArrowDown', 'AudioVolumeDown', 'VolumeDown'].includes(e.key)) {
        e.preventDefault(); nextTab();
      } else if (['ArrowLeft', 'ArrowUp', 'AudioVolumeUp', 'VolumeUp'].includes(e.key)) {
        e.preventDefault(); prevTab();
      } else if (e.key.toLowerCase() === 'm') {
        cycleTheme(e.shiftKey);
      } else if (e.key.toLowerCase() === 't') {
        cycleTimeMode();
      } else if (e.key.toLowerCase() === 'w') {
        cycleWeather();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [nextTab, prevTab, cycleTheme, cycleTimeMode, cycleWeather]);

  // Compute active background gradient based on theme
  const backgroundStyle = useMemo(() => {
    if (themeMode === 'meadow') {
      return computeMeadowAtmosphere(effectiveHour, weather.weatherType).skyGradient;
    }
    if (themeMode === 'lake') {
      return computeLakeAtmosphere(effectiveHour, weather.weatherType).skyGradient;
    }
    if (themeMode === 'abstract') {
      return computeAbstractAtmosphere(effectiveHour, weather.weatherType).skyGradient;
    }
    return '#000000';
  }, [themeMode, effectiveHour, weather.weatherType]);

  const isPaintedTheme = themeMode === 'meadow' || themeMode === 'lake' || themeMode === 'abstract';
  const matteCard = isPaintedTheme
    ? "bg-[#0C0B0A]/70 backdrop-blur-md rounded-[30px] shadow-[0_12px_32px_rgba(0,0,0,0.36),inset_0_1px_0_0_rgba(230,226,221,0.12)]"
    : "bg-[#0D0C0B]/92 rounded-[30px] shadow-[inset_0_1px_0_0_rgba(230,226,221,0.06)]";

  const themeLabels: Record<ThemeMode, string> = {
    'meadow': 'Green Meadow',
    'lake': 'Mountain Lake',
    'abstract': 'Silk Abstract',
    'ambient-dark': 'Dark Ambient',
    'amoled': 'Pure AMOLED',
  };

  return (
    <div
      className="w-screen h-screen flex flex-col justify-between px-9 py-5 font-sans select-none overflow-hidden relative transition-colors duration-1000"
      style={{
        background: backgroundStyle,
      }}
    >
      {/* ══════════════════════════════════════════════════════════════════
          5-MODE BACKGROUND SCENE ENGINE (z-0)
          ══════════════════════════════════════════════════════════════════ */}
      {themeMode === 'meadow' && (
        <MeadowScene effectiveHour={effectiveHour} weather={weather.weatherType} />
      )}
      {themeMode === 'lake' && (
        <LakeScene effectiveHour={effectiveHour} weather={weather.weatherType} />
      )}
      {themeMode === 'abstract' && (
        <AbstractScene effectiveHour={effectiveHour} weather={weather.weatherType} />
      )}
      {themeMode === 'ambient-dark' && (
        <AmbientDarkScene weather={weather.weatherType} />
      )}

      {/* ══════════════════════════════════════════════════════════════════
          TOP CONTROL BAR: THEME, TIME & WEATHER SCRUBBERS (z-20)
          ══════════════════════════════════════════════════════════════════ */}
      <header className="w-full flex items-center justify-between z-20 shrink-0">
        <div className="flex items-center gap-3">
          {/* 1. Theme Switcher Pill */}
          <button
            onClick={() => cycleTheme()}
            title="Cycle Background Theme (Shortcut: M, Shift+M)"
            className="px-4 py-1.5 rounded-full bg-[#0D0C0B]/75 hover:bg-[#161413]/90 backdrop-blur-md shadow-[inset_0_1px_0_0_rgba(230,226,221,0.12)] flex items-center gap-2 text-xs font-mono tracking-wider uppercase text-[#E6E2DD] cursor-pointer transition-all"
          >
            <Palette className="w-3.5 h-3.5 text-[#C9A679]" />
            <span>{themeLabels[themeMode]}</span>
          </button>

          {/* 2. Time-of-Day Scrubber Pill */}
          {themeMode !== 'amoled' && (
            <button
              onClick={cycleTimeMode}
              title="Cycle Time of Day Palette (Shortcut: T)"
              className="px-3.5 py-1.5 rounded-full bg-[#0D0C0B]/65 hover:bg-[#161413]/85 backdrop-blur-md shadow-[inset_0_1px_0_0_rgba(230,226,221,0.08)] flex items-center gap-2 text-xs font-mono tracking-wider uppercase text-[#C8BBAE] cursor-pointer transition-all"
            >
              {timeMode === 'live' && <Sparkles className="w-3.5 h-3.5 text-[#8FA895]" />}
              {timeMode === 'dawn' && <Sunrise className="w-3.5 h-3.5 text-[#C48B8B]" />}
              {timeMode === 'day' && <Sun className="w-3.5 h-3.5 text-[#C9A679]" />}
              {timeMode === 'sunset' && <Sunset className="w-3.5 h-3.5 text-[#C9A679]" />}
              {timeMode === 'night' && <Moon className="w-3.5 h-3.5 text-[#8DA2B5]" />}
              <span>{timeMode === 'live' ? 'Live Sky' : timeMode}</span>
            </button>
          )}
        </div>

        {/* Right Status Badge */}
        <div className="flex items-center gap-2.5 px-3.5 py-1 rounded-full bg-[#0D0C0B]/60 backdrop-blur-md text-xs font-mono text-[#C8BBAE]/80">
          <span className="w-1.5 h-1.5 rounded-full bg-[#8FA895]" />
          <span>ONCLITE DOCK</span>
        </div>
      </header>

      {/* ══════════════════════════════════════════════════════════════════
          VOLUME ROCKER HARDWARE HINT
          ══════════════════════════════════════════════════════════════════ */}
      <div
        className="fixed right-2 top-1/2 -translate-y-1/2 flex flex-col items-center gap-2 opacity-30 hover:opacity-80 transition-opacity z-50 cursor-pointer"
        onClick={nextTab}
        title="Volume Up / Down to cycle views"
      >
        <div className="w-1 h-7 bg-[#E6E2DD]/40 rounded-full" />
        <div className="w-1 h-7 bg-[#E6E2DD]/40 rounded-full" />
      </div>

      {/* ══════════════════════════════════════════════════════════════════
          MAIN STAGE (z-10)
          ══════════════════════════════════════════════════════════════════ */}
      <main className="flex-1 w-full h-full min-h-0 overflow-hidden py-3 z-10">

        {/* ================= TAB 0: APPLE STANDBY / ECHO SHOW HOME DOCK ================= */}
        {activeTab === 0 && (
          <div className="w-full h-full grid grid-cols-12 gap-8 items-center">

            {/* LEFT 7 COLUMNS: CENTERED FLOATING CLOCK & DATE HERO */}
            <div className="col-span-7 h-full flex flex-col items-center justify-center text-center px-4">
              <div className="flex items-center gap-2.5 px-4 py-1.5 rounded-full bg-[#0D0C0B]/70 backdrop-blur-md shadow-[inset_0_1px_0_0_rgba(230,226,221,0.08)] text-[#E6E2DD] mb-5">
                <Bell className="w-4 h-4 text-[#C9A679] stroke-[2]" />
                <span className="text-xs font-mono tracking-widest uppercase">Next Alarm · 6:00 AM</span>
              </div>

              <div
                onClick={cycleTimeMode}
                className="flex items-baseline justify-center tabular-nums tracking-[-0.055em] leading-none cursor-pointer drop-shadow-[0_8px_32px_rgba(0,0,0,0.55)]"
              >
                <span className="text-[13.2vw] font-bold text-[#F5F2EB]">
                  {timeFormatted.hours}
                </span>
                <span className="text-[10.5vw] font-light text-[#E6E2DD]/60 mx-1 -translate-y-2">
                  :
                </span>
                <span className="text-[13.2vw] font-bold text-[#F5F2EB]">
                  {timeFormatted.minutes}
                </span>
                <span className="text-[2.5vw] font-semibold text-[#E6E2DD]/85 ml-3.5 tracking-normal">
                  {timeFormatted.ampm}
                </span>
              </div>

              <div className="text-3xl font-medium text-[#F5F2EB]/95 tracking-tight mt-4 drop-shadow-[0_4px_16px_rgba(0,0,0,0.5)]">
                {dateFormatted}
              </div>
            </div>

            {/* RIGHT 5 COLUMNS: 3 MATTE SQUIRCLE WIDGETS */}
            <div className="col-span-5 h-full grid grid-rows-3 gap-4 py-1">

              {/* Widget 1: Weather (Click to cycle Sun / Cloud / Mist / Rain / Storm) */}
              <div
                onClick={cycleWeather}
                title="Click to cycle Weather (Shortcut: W)"
                className={`${matteCard} px-7 py-4 flex items-center justify-between cursor-pointer hover:bg-[#141312]/80 transition-colors`}
              >
                <div className="flex items-center gap-5">
                  <div className="w-14 h-14 rounded-2xl bg-[#161514]/80 flex items-center justify-center shrink-0">
                    {weatherIcon}
                  </div>
                  <div>
                    <div className="text-4xl font-bold tabular-nums text-[#F5F2EB] leading-none">
                      {weather.temp}°C
                    </div>
                    <div className="text-base font-medium text-[#C8BBAE] mt-1.5">
                      {weather.condition}
                    </div>
                  </div>
                </div>

                <div className="text-right">
                  <div className="text-lg font-semibold text-[#E6E2DD]">{weather.city}</div>
                  <div className="inline-flex items-center gap-1.5 mt-1.5 px-3 py-0.5 rounded-full bg-[#1A1714]/85 text-sm font-medium text-[#C9A679]">
                    <span className="w-1.5 h-1.5 rounded-full bg-[#C9A679]" />
                    <span>AQI {weather.aqi}</span>
                  </div>
                </div>
              </div>

              {/* Widget 2: Battery & Magisk ACC 3.80V Guard */}
              <div className={`${matteCard} px-7 py-4 flex flex-col justify-center gap-2.5`}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3.5">
                    <BatteryCharging className="w-6 h-6 text-[#8FA895]" />
                    <span className="text-3xl font-bold tabular-nums text-[#F5F2EB] leading-none">
                      {battery.level}%
                    </span>
                    <span className="text-xs font-mono text-[#8FA895] bg-[#141C17]/90 px-2.5 py-1 rounded-full">
                      {battery.state} · {battery.voltage}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5 text-xs font-mono text-[#C8BBAE]/75">
                    <Wifi className="w-3.5 h-3.5 text-[#8FA895]" />
                    <span>ADB :5555</span>
                  </div>
                </div>

                <div className="w-full flex flex-col gap-1">
                  <div className="w-full h-2 bg-[#1A1817] rounded-full overflow-hidden relative">
                    <div
                      className="h-full bg-[#8FA895] rounded-full transition-all duration-500"
                      style={{ width: `${Math.min(100, Math.max(10, battery.level))}%` }}
                    />
                    <div className="absolute top-0 bottom-0 left-[60%] w-[2px] bg-[#C9A679]" />
                  </div>
                  <div className="flex justify-between text-xs font-mono text-[#C8BBAE]/70">
                    <span>Magisk ACC Guard</span>
                    <span className="text-[#C8BBAE]">50%–60% Band (3.80V)</span>
                  </div>
                </div>
              </div>

              {/* Widget 3: PC Companion Telemetry */}
              <div
                onClick={() => setPc(p => ({ ...p, isActive: !p.isActive }))}
                className={`${matteCard} px-7 py-4 flex flex-col justify-center gap-2.5 cursor-pointer hover:bg-[#141312]/80 transition-colors`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Laptop className="w-6 h-6 text-[#8DA2B5]" />
                    <span className="text-xl font-semibold text-[#F5F2EB]">RedmiBook 15</span>
                  </div>
                  <span className={`text-xs font-mono uppercase tracking-wider px-2.5 py-0.5 rounded-full ${
                    pc.isActive ? 'bg-[#141C17]/90 text-[#8FA895]' : 'bg-[#181716] text-[#8A8580]'
                  }`}>
                    {pc.isActive ? '● Online' : '○ Sleeping'}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-5 pt-0.5">
                  <div>
                    <div className="flex justify-between text-xs font-mono text-[#C8BBAE]/80 mb-1">
                      <span>CPU · {pc.cpuTemp}°C</span>
                      <span className="text-[#E6E2DD]">{pc.cpuLoad}%</span>
                    </div>
                    <div className="w-full h-1.5 bg-[#1A1817] rounded-full overflow-hidden">
                      <div className="h-full bg-[#8DA2B5] rounded-full" style={{ width: `${pc.cpuLoad}%` }} />
                    </div>
                  </div>

                  <div>
                    <div className="flex justify-between text-xs font-mono text-[#C8BBAE]/80 mb-1">
                      <span>RAM · {pc.ramUsed}</span>
                      <span className="text-[#E6E2DD]">{pc.ramPercent}%</span>
                    </div>
                    <div className="w-full h-1.5 bg-[#1A1817] rounded-full overflow-hidden">
                      <div className="h-full bg-[#C8BBAE] rounded-full" style={{ width: `${pc.ramPercent}%` }} />
                    </div>
                  </div>
                </div>
              </div>

            </div>

          </div>
        )}

        {/* ================= TAB 1: JEE 2028 COUNTDOWN ================= */}
        {activeTab === 1 && (
          <div className="w-full h-full flex flex-col justify-between py-1">
            <div className="flex items-center justify-between px-2">
              <div className="flex items-center gap-3">
                <Flame className="w-5 h-5 text-[#C9A679]" />
                <span className="text-lg font-semibold tracking-wider uppercase text-[#F5F2EB]">
                  JEE Advanced 2028
                </span>
              </div>
              <div className={`flex items-center gap-4 text-sm font-mono text-[#C8BBAE] px-4 py-1.5 rounded-full ${matteCard}`}>
                <span>Streak <strong className="text-[#8FA895] font-normal">14 Days</strong></span>
                <span className="opacity-40">•</span>
                <span>Target <strong className="text-[#F5F2EB] font-normal">6.0h / day</strong></span>
              </div>
            </div>

            <div className="my-auto grid grid-cols-4 gap-5 h-[74%]">
              {[
                { label: 'Days', value: jeeCountdown.days, color: 'text-[#F5F2EB]' },
                { label: 'Hours', value: jeeCountdown.hours, color: 'text-[#F5F2EB]' },
                { label: 'Minutes', value: jeeCountdown.minutes, color: 'text-[#C8BBAE]' },
                { label: 'Seconds', value: jeeCountdown.seconds, color: 'text-[#C9A679]' },
              ].map((item, i) => (
                <div key={i} className={`${matteCard} flex flex-col items-center justify-center p-6`}>
                  <span className={`text-[8.5vw] font-bold tabular-nums leading-none tracking-[-0.05em] ${item.color}`}>
                    {item.value}
                  </span>
                  <span className="text-sm font-semibold uppercase tracking-[0.25em] text-[#C8BBAE]/70 mt-5">
                    {item.label}
                  </span>
                </div>
              ))}
            </div>

            <div className="text-center text-xs font-mono text-[#E6E2DD]/70 tracking-widest uppercase">
              Examination Milestone · May 21, 2028
            </div>
          </div>
        )}

        {/* ================= TAB 2: POMODORO RING & PRIORITIES ================= */}
        {activeTab === 2 && (
          <div className="w-full h-full grid grid-cols-12 gap-8 items-center">
            <div className={`col-span-5 h-full ${matteCard} flex flex-col items-center justify-center text-center p-6`}>
              <div className="relative w-60 h-60 flex items-center justify-center">
                <svg className="w-full h-full -rotate-90" viewBox="0 0 120 120">
                  <circle cx="60" cy="60" r="54" fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="4.5" />
                  <circle
                    cx="60"
                    cy="60"
                    r="54"
                    fill="none"
                    stroke={pomoRunning ? '#C48B8B' : '#C8BBAE'}
                    strokeWidth="4.5"
                    strokeLinecap="round"
                    strokeDasharray={339.29}
                    strokeDashoffset={339.29 - (339.29 * pomoProgress) / 100}
                    className="transition-all duration-500"
                  />
                </svg>

                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <span className="text-xs font-mono uppercase tracking-widest text-[#C8BBAE]/70 mb-1">
                    {pomoRunning ? 'Deep Focus' : 'Session Ready'}
                  </span>
                  <span className={`text-6xl font-bold tabular-nums tracking-tight ${
                    pomoRunning ? 'text-[#C48B8B]' : 'text-[#F5F2EB]'
                  }`}>
                    {pomoFormatted}
                  </span>
                  <span className="text-xs font-mono text-[#C8BBAE]/80 mt-2">
                    {pomoSessions} done today
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-3 mt-4">
                <button
                  onClick={() => setPomoRunning(!pomoRunning)}
                  className={`px-6 py-2.5 rounded-full text-base font-semibold flex items-center gap-2 cursor-pointer transition-all ${
                    pomoRunning
                      ? 'bg-[#2A1818] text-[#C48B8B]'
                      : 'bg-[#1F1D1B] text-[#E6E2DD] hover:bg-[#2A2725]'
                  }`}
                >
                  {pomoRunning ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                  <span>{pomoRunning ? 'Pause' : 'Start Focus'}</span>
                </button>
                <button
                  onClick={() => { setPomoRunning(false); setPomoSecs(TOTAL_POMO); }}
                  className="p-2.5 rounded-full bg-[#1A1817] text-[#C8BBAE] hover:text-[#F5F2EB] cursor-pointer transition-colors"
                  title="Reset"
                >
                  <RotateCcw className="w-4 h-4" />
                </button>
              </div>
            </div>

            <div className="col-span-7 h-full flex flex-col justify-between py-1">
              <div className="flex items-center justify-between px-2 mb-2">
                <span className="text-sm font-semibold uppercase tracking-widest text-[#F5F2EB]/90">
                  Today's 3 Priorities
                </span>
                <span className="text-sm font-mono text-[#8FA895]">
                  {tasks.filter(t => t.done).length} of {tasks.length} completed
                </span>
              </div>

              <div className="flex-1 grid grid-rows-3 gap-4">
                {tasks.map((task) => (
                  <div
                    key={task.id}
                    onClick={() => toggleTask(task.id)}
                    className={`${matteCard} px-6 flex items-center justify-between gap-4 cursor-pointer transition-all ${
                      task.done ? 'opacity-55' : 'hover:bg-[#141312]/80'
                    }`}
                  >
                    <div className="flex items-center gap-4 min-w-0">
                      {task.done ? (
                        <div className="w-6 h-6 rounded-full bg-[#162019] flex items-center justify-center shrink-0">
                          <Check className="w-4 h-4 text-[#8FA895]" />
                        </div>
                      ) : (
                        <Circle className="w-6 h-6 text-[#C8BBAE]/50 shrink-0" />
                      )}
                      <span className={`text-xl font-medium truncate ${
                        task.done ? 'text-[#C8BBAE]/60 line-through' : 'text-[#F5F2EB]'
                      }`}>
                        {task.text}
                      </span>
                    </div>
                    <span className="text-xs font-mono tracking-widest uppercase px-3 py-1 rounded-full bg-[#1A1716] text-[#B896A3] shrink-0">
                      {task.tag}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ================= TAB 3: HARDWARE KERNEL MONITOR ================= */}
        {activeTab === 3 && (
          <div className="w-full h-full flex flex-col justify-between gap-4 py-1">
            <div className="flex items-center justify-between px-2 font-mono">
              <div className="flex items-center gap-3">
                <Terminal className="w-5 h-5 text-[#8FA895]" />
                <span className="text-base font-semibold text-[#F5F2EB]">
                  onclite · Qualcomm Snapdragon 632
                </span>
              </div>
              <span className="text-xs text-[#8FA895] bg-[#121714]/90 px-3.5 py-1 rounded-full">
                ● Magisk Root Active
              </span>
            </div>

            <div className="grid grid-cols-4 gap-4 flex-1">
              <div className={`${matteCard} p-6 flex flex-col justify-between`}>
                <span className="text-[#C8BBAE]/70 text-xs font-mono uppercase tracking-widest">Cell Voltage</span>
                <span className="text-4xl font-bold tabular-nums text-[#F5F2EB]">{battery.voltage}</span>
                <span className="text-sm font-mono text-[#C9A679]">Nominal 3.80V</span>
              </div>

              <div className={`${matteCard} p-6 flex flex-col justify-between`}>
                <span className="text-[#C8BBAE]/70 text-xs font-mono uppercase tracking-widest">Charge Level</span>
                <span className="text-4xl font-bold tabular-nums text-[#F5F2EB]">{battery.level}%</span>
                <span className="text-sm font-mono text-[#8FA895]">PMIC {battery.state}</span>
              </div>

              <div className={`${matteCard} p-6 flex flex-col justify-between`}>
                <span className="text-[#C8BBAE]/70 text-xs font-mono uppercase tracking-widest">Hysteresis</span>
                <span className="text-4xl font-bold tabular-nums text-[#C8BBAE]">50–60%</span>
                <span className="text-sm font-mono text-[#C8BBAE]/70">input_suspend</span>
              </div>

              <div className={`${matteCard} p-6 flex flex-col justify-between`}>
                <span className="text-[#C8BBAE]/70 text-xs font-mono uppercase tracking-widest">Wireless ADB</span>
                <span className="text-4xl font-bold tabular-nums text-[#F5F2EB]">:5555</span>
                <span className="text-sm font-mono text-[#8DA2B5]">192.168.29.25</span>
              </div>
            </div>

            <div className={`${matteCard} px-6 py-4 font-mono text-sm space-y-1.5`}>
              <div className="text-[#C8BBAE]/75">[battery-guard.sh] Root loop active: Pause at 60%, resume at 50% (3.80V nominal)</div>
              <div className="text-[#8FA895]">[PMIC smb5] /sys/class/power_supply/battery/input_suspend verified</div>
              <div className="text-[#E6E2DD]">[Doze Whitelist] com.termux & deskdock.app locked in memory</div>
            </div>
          </div>
        )}

        {/* ================= TAB 4: PC TELEMETRY HUB ================= */}
        {activeTab === 4 && (
          <div className="w-full h-full flex flex-col justify-between gap-5 py-1">
            <div className="flex items-center justify-between px-2">
              <div className="flex items-center gap-3">
                <Laptop className="w-5 h-5 text-[#8DA2B5]" />
                <span className="text-base font-semibold text-[#F5F2EB]">
                  RedmiBook 15 Pro — Live Telemetry
                </span>
              </div>
              <span className="text-xs font-mono text-[#8DA2B5] bg-[#11161C]/90 px-3.5 py-1 rounded-full">
                ws://192.168.29.160:8000
              </span>
            </div>

            <div className="flex-1 grid grid-cols-3 gap-5">
              <div className={`${matteCard} p-7 flex flex-col justify-between`}>
                <div className="flex items-center justify-between">
                  <span className="text-xs font-mono uppercase tracking-widest text-[#C8BBAE]/75">CPU Load · i5-11300H</span>
                  <Cpu className="w-5 h-5 text-[#8DA2B5]" />
                </div>
                <span className="text-[6.5vw] font-bold tabular-nums text-[#F5F2EB] leading-none my-auto">
                  {pc.cpuLoad}%
                </span>
                <div>
                  <div className="w-full h-2 bg-[#181615] rounded-full overflow-hidden mb-2">
                    <div className="h-full bg-[#8DA2B5] rounded-full" style={{ width: `${pc.cpuLoad}%` }} />
                  </div>
                  <span className="text-sm font-mono text-[#8FA895]">Package Temp · {pc.cpuTemp}°C</span>
                </div>
              </div>

              <div className={`${matteCard} p-7 flex flex-col justify-between`}>
                <div className="flex items-center justify-between">
                  <span className="text-xs font-mono uppercase tracking-widest text-[#C8BBAE]/75">System Memory</span>
                  <HardDrive className="w-5 h-5 text-[#C8BBAE]" />
                </div>
                <span className="text-[6.5vw] font-bold tabular-nums text-[#C8BBAE] leading-none my-auto">
                  {pc.ramPercent}%
                </span>
                <div>
                  <div className="w-full h-2 bg-[#181615] rounded-full overflow-hidden mb-2">
                    <div className="h-full bg-[#C8BBAE] rounded-full" style={{ width: `${pc.ramPercent}%` }} />
                  </div>
                  <span className="text-sm font-mono text-[#C8BBAE]/80">{pc.ramUsed} of {pc.ramTotal} Used</span>
                </div>
              </div>

              <div className={`${matteCard} p-7 flex flex-col justify-between`}>
                <div className="flex items-center justify-between">
                  <span className="text-xs font-mono uppercase tracking-widest text-[#C8BBAE]/75">Network Stream</span>
                  <Wifi className="w-5 h-5 text-[#8FA895]" />
                </div>
                <span className="text-[5.2vw] font-bold tabular-nums text-[#8FA895] leading-none my-auto">
                  {pc.networkSpeed}
                </span>
                <div>
                  <div className="w-full h-2 bg-[#181615] rounded-full overflow-hidden mb-2">
                    <div className="h-full bg-[#8FA895] rounded-full w-[38%]" />
                  </div>
                  <span className="text-sm font-mono text-[#C8BBAE]/80">Wi-Fi 6 · 5 GHz</span>
                </div>
              </div>
            </div>
          </div>
        )}

      </main>

      {/* ══════════════════════════════════════════════════════════════════
          FLOATING PILL DOCK FOOTER (z-10)
          ══════════════════════════════════════════════════════════════════ */}
      <footer className="flex items-center justify-between z-10 pt-1 shrink-0">
        <button
          onClick={prevTab}
          className="flex items-center gap-1.5 text-xs font-mono tracking-widest uppercase text-[#E6E2DD]/70 hover:text-[#F5F2EB] transition-colors cursor-pointer"
        >
          <ChevronLeft className="w-4 h-4" />
          <span>{tabTitles[(activeTab - 1 + 5) % 5]}</span>
        </button>

        <div className="flex items-center gap-2.5 px-5 py-2 rounded-full bg-[#0D0C0B]/80 backdrop-blur-md shadow-[inset_0_1px_0_0_rgba(230,226,221,0.08)]">
          {([0, 1, 2, 3, 4] as const).map((idx) => (
            <button
              key={idx}
              onClick={() => setActiveTab(idx)}
              className={`rounded-full transition-all duration-300 cursor-pointer ${
                activeTab === idx
                  ? 'w-6 h-1.5 bg-[#C8BBAE]'
                  : 'w-1.5 h-1.5 bg-[#E6E2DD]/25 hover:bg-[#E6E2DD]/50'
              }`}
              title={`Switch to ${tabTitles[idx]}`}
            />
          ))}
        </div>

        <button
          onClick={nextTab}
          className="flex items-center gap-1.5 text-xs font-mono tracking-widest uppercase text-[#E6E2DD]/70 hover:text-[#F5F2EB] transition-colors cursor-pointer"
        >
          <span>{tabTitles[(activeTab + 1) % 5]}</span>
          <ChevronRight className="w-4 h-4" />
        </button>
      </footer>

    </div>
  );
}
