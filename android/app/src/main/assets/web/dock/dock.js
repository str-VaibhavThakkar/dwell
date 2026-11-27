const $ = id => document.getElementById(id);
const pad = n => String(n).padStart(2, "0");
const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const Q = new URLSearchParams(location.search);           // preview: ?code=63&hour=18.5&cc=80
let state = null, wx = null, wxAt = 0;

const now = () => {
  const d = new Date();
  if (Q.has("hour")) { const h = +Q.get("hour"); d.setHours(Math.floor(h), Math.round(h % 1 * 60), 0, 0); }
  return d;
};
if (Q.has("place")) {
  if (!state) state = { settings: {} };
  if (!state.settings) state.settings = {};
  state.settings.place = Q.get("place");
  state.settings.autoLocation = false;
}

/* ---------- Toast Notification Engine ---------- */
let toastTimer = null;
function showToast(msg) {
  const t = $("hwToast");
  if (!t) return;
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    t.classList.remove("show");
  }, 2200);
}

/* ---------- Multi-Page Carousel Navigation ---------- */
const PAGES = [
  { id: "page-clock", title: "Clock Dashboard", badge: "Dashboard [1/6]" },
  { id: "page-alarms", title: "Alarms & Schedule", badge: "Alarms [2/6]" },
  { id: "page-focus", title: "Focus Timer", badge: "Focus Timer [3/6]" },
  { id: "page-tasks", title: "Study Tasks", badge: "Study Tasks [4/6]" },
  { id: "page-stats", title: "Telemetry & Power", badge: "Telemetry [5/6]" },
  { id: "page-mirror", title: "Mirror", badge: "Mirror [6/6]" }
];
let activePage = 0;
let mirrorStream = null;

function switchPage(direction = 1) {
  const prevPage = activePage;
  activePage = (activePage + direction + PAGES.length) % PAGES.length;
  updatePageDisplay(activePage, prevPage);
  showToast(PAGES[activePage].title + ` [${activePage + 1}/${PAGES.length}]`);
}

function goToPage(idx) {
  if (idx < 0 || idx >= PAGES.length) return;
  const prevPage = activePage;
  activePage = idx;
  updatePageDisplay(activePage, prevPage);
  showToast(PAGES[activePage].title + ` [${activePage + 1}/${PAGES.length}]`);
}

window.goToPage = goToPage;
window.resetToDashboard = function() {
  if (activePage !== 0) {
    goToPage(0);
  }
};

document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") {
    window.resetToDashboard();
  }
});

window.addEventListener("focus", () => {
  window.resetToDashboard();
});

function updatePageDisplay(newPage, oldPage) {
  PAGES.forEach((p, idx) => {
    const el = $(p.id);
    if (el) {
      if (idx === activePage) {
        el.classList.add("active");
      } else {
        el.classList.remove("active");
      }
    }
  });
  const badge = $("pageBadge");
  if (badge) {
    badge.textContent = PAGES[activePage].badge;
  }
  document.body.classList.toggle("subpage", activePage > 0);
  document.body.classList.toggle("mirror-active", activePage === 5);
  if (activePage === 1) {
    renderAlarmsPage();
  }
  // Mirror camera lifecycle
  if (PAGES[activePage].id === "page-mirror") {
    startMirror();
  } else {
    if (mirrorStream) {
      stopMirror();
    }
  }
}
updatePageDisplay();

/* ---------- Hardware Volume Preset Cycling ---------- */
const VOLUME_PRESETS = [100, 60, 30, 0];
let curVolIdx = 0;

function cycleVolume() {
  curVolIdx = (curVolIdx + 1) % VOLUME_PRESETS.length;
  const pct = VOLUME_PRESETS[curVolIdx];
  const lbl = pct === 0 ? "Muted (0%)" : pct + "%";
  
  if (window.AndroidBridge && typeof window.AndroidBridge.setVolume === "function") {
    try { window.AndroidBridge.setVolume(pct); } catch (e) {}
  }
  
  fetch("/api/system/volume", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ percent: pct })
  }).catch(() => {});
  
  const el = $("statVol");
  if (el) el.textContent = lbl;
  showToast("Hardware Volume: " + lbl);
}

/* ---------- Acoustic Chime Synthesizer (Web Audio API & Native Bridge) ---------- */
function playGentleChime() {
  if (window.AndroidBridge && typeof window.AndroidBridge.playChime === "function") {
    try { window.AndroidBridge.playChime(); } catch(e) {}
  }
  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    if (ctx.state === "suspended") ctx.resume();
    
    // Warm harmonic sequence: C5 (523.25Hz) -> E5 (659.25Hz) -> G5 (783.99Hz) -> C6 (1046.50Hz)
    const freqs = [523.25, 659.25, 783.99, 1046.50];
    freqs.forEach((f, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const filter = ctx.createBiquadFilter();
      
      osc.type = "sine";
      osc.frequency.setValueAtTime(f, ctx.currentTime);
      
      filter.type = "lowpass";
      filter.frequency.setValueAtTime(2400, ctx.currentTime);
      
      const startTime = ctx.currentTime + idx * 0.15;
      gain.gain.setValueAtTime(0.0001, startTime);
      gain.gain.exponentialRampToValueAtTime(0.35, startTime + 0.04);
      gain.gain.exponentialRampToValueAtTime(0.0001, startTime + 1.6);
      
      osc.connect(filter);
      filter.connect(gain);
      gain.connect(ctx.destination);
      
      osc.start(startTime);
      osc.stop(startTime + 1.8);
    });
  } catch (e) {
    console.error("Web Audio error:", e);
  }
}

/* ---------- Focus / Pomodoro Timer Engine ---------- */
const FOCUS_PRESETS = [25, 50, 60, 5, 15];
let focusPresetIdx = 0; // Default 25m
let focusSecondsLeft = 25 * 60;
let focusRunning = false;
let focusTimerInterval = null;

function cycleFocusPreset() {
  if (focusRunning) {
    pauseFocusTimer();
  }
  focusPresetIdx = (focusPresetIdx + 1) % FOCUS_PRESETS.length;
  focusSecondsLeft = FOCUS_PRESETS[focusPresetIdx] * 60;
  updateFocusDisplay();
  showToast(`Focus Preset: ${FOCUS_PRESETS[focusPresetIdx]} min`);
}

function updateFocusDisplay() {
  const m = Math.floor(focusSecondsLeft / 60);
  const s = focusSecondsLeft % 60;
  const digits = $("focusDigits");
  const label = $("focusPresetLabel");
  const stateLbl = $("focusState");
  
  if (digits) {
    digits.textContent = `${pad(m)}:${pad(s)}`;
    if (focusRunning) {
      digits.classList.add("running");
      digits.classList.remove("finished");
    } else {
      digits.classList.remove("running");
    }
  }
  if (label) {
    label.textContent = `${FOCUS_PRESETS[focusPresetIdx]}m Preset`;
  }
  if (stateLbl && !digits.classList.contains("finished")) {
    stateLbl.textContent = focusRunning 
      ? "Focusing · Double-press Vol Down to Pause" 
      : "Paused · Double-press Vol Down to Start";
  }
}

function toggleFocusTimer() {
  const digits = $("focusDigits");
  if (digits && digits.classList.contains("finished")) {
    // Reset from completed state
    digits.classList.remove("finished");
    focusSecondsLeft = FOCUS_PRESETS[focusPresetIdx] * 60;
    startFocusTimer();
    return;
  }
  if (focusRunning) {
    pauseFocusTimer();
  } else {
    startFocusTimer();
  }
}

function startFocusTimer() {
  if (focusRunning) return;
  focusRunning = true;
  updateFocusDisplay();
  showToast(`Focus Started: ${Math.ceil(focusSecondsLeft / 60)} min`);
  
  fetch("/api/timer", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "start", minutes: Math.ceil(focusSecondsLeft / 60), label: "Focus" })
  }).catch(() => {});
  
  clearInterval(focusTimerInterval);
  focusTimerInterval = setInterval(() => {
    if (focusSecondsLeft > 0) {
      focusSecondsLeft--;
      updateFocusDisplay();
    } else {
      finishFocusTimer();
    }
  }, 1000);
}

function pauseFocusTimer() {
  focusRunning = false;
  clearInterval(focusTimerInterval);
  updateFocusDisplay();
  showToast("Focus Paused");
  
  fetch("/api/timer", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "stop" })
  }).catch(() => {});
}

function finishFocusTimer() {
  focusRunning = false;
  clearInterval(focusTimerInterval);
  const digits = $("focusDigits");
  const stateLbl = $("focusState");
  if (digits) {
    digits.classList.remove("running");
    digits.classList.add("finished");
  }
  if (stateLbl) {
    stateLbl.textContent = "Focus session complete! Double-press to Reset";
  }
  playGentleChime();
  showToast("Focus Complete! Great work.");
  
  fetch("/api/timer", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "stop" })
  }).catch(() => {});
}

function resetFocusTimer() {
  focusRunning = false;
  clearInterval(focusTimerInterval);
  focusSecondsLeft = FOCUS_PRESETS[focusPresetIdx] * 60;
  const digits = $("focusDigits");
  const stateLbl = $("focusState");
  if (digits) {
    digits.classList.remove("running");
    digits.classList.remove("finished");
  }
  if (stateLbl) {
    stateLbl.textContent = "Paused · Double-press Vol Down to Start";
  }
  updateFocusDisplay();
  showToast(`Focus Reset (${FOCUS_PRESETS[focusPresetIdx]} min)`);
  
  fetch("/api/timer", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "stop" })
  }).catch(() => {});
}

function startDeepWork() {
  focusRunning = false;
  clearInterval(focusTimerInterval);
  focusPresetIdx = FOCUS_PRESETS.indexOf(50) !== -1 ? FOCUS_PRESETS.indexOf(50) : 4;
  focusSecondsLeft = 50 * 60;
  const label = $("focusPresetLabel");
  if (label) label.textContent = "50m Deep Work";
  startFocusTimer();
  showToast("Deep Work: 50 min Started");
}

/* ---------- Study Tasks Page Engine ---------- */
let selectedTaskIdx = 0;

function renderTasksPage() {
  const ul = $("fullTaskList");
  const summary = $("tasksSummary");
  if (!ul) return;
  const tasks = state?.tasks || [];
  const openCount = tasks.filter(t => !t.done).length;
  if (summary) {
    summary.textContent = `${openCount} open · ${tasks.length - openCount} done`;
  }
  
  if (tasks.length === 0) {
    ul.innerHTML = `<li class="task-row"><span style="color:var(--ink3)">No tasks yet. Add one from PC Control Panel.</span></li>`;
    return;
  }
  
  if (selectedTaskIdx >= tasks.length) selectedTaskIdx = 0;
  
  ul.innerHTML = tasks.map((t, idx) => {
    const isSel = idx === selectedTaskIdx;
    const isDone = !!t.done;
    return `
      <li class="task-row ${isSel ? 'selected' : ''} ${isDone ? 'done' : ''}" id="taskItem-${idx}">
        <span class="chk">${isDone ? '✓' : '○'}</span>
        <span class="txt">${esc(t.text)}</span>
      </li>
    `;
  }).join("");
}

function toggleCurrentTask() {
  const tasks = state?.tasks || [];
  if (tasks.length === 0) {
    showToast("No tasks in list");
    return;
  }
  const task = tasks[selectedTaskIdx];
  if (!task) return;
  
  task.done = !task.done;
  renderTasksPage();
  showToast((task.done ? "✓ Done: " : "Reopened: ") + task.text.slice(0, 24));
  
  fetch(`/api/tasks/${task.id}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ done: task.done })
  }).catch(() => {});
}

function selectNextTask() {
  const tasks = state?.tasks || [];
  if (tasks.length === 0) return;
  selectedTaskIdx = (selectedTaskIdx + 1) % tasks.length;
  renderTasksPage();
  const el = $(`taskItem-${selectedTaskIdx}`);
  if (el) el.scrollIntoView({ block: "nearest", behavior: "smooth" });
  showToast("Selected: " + tasks[selectedTaskIdx].text.slice(0, 24));
}

function clearCompletedTasks() {
  const tasks = state?.tasks || [];
  const doneTasks = tasks.filter(t => t.done);
  if (doneTasks.length === 0) {
    showToast("No completed tasks to clear");
    return;
  }
  doneTasks.forEach(t => {
    fetch(`/api/tasks/${t.id}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ delete: true })
    }).catch(() => {});
  });
  if (state?.tasks) {
    state.tasks = state.tasks.filter(t => !t.done);
  }
  selectedTaskIdx = 0;
  renderTasksPage();
  showToast("Cleared completed tasks");
}

/* ---------- Telemetry & Power Page Engine ---------- */
function renderStatsPage() {
  if (!state) return;
  const b = state.battery;
  if (b) {
    const batEl = $("statBat");
    const tempEl = $("statTemp");
    const guardEl = $("statGuard");
    if (batEl) batEl.textContent = `${b.capacity ?? "--"}%`;
    if (tempEl) tempEl.textContent = `${b.temp_c ?? "--"} °C`;
    if (guardEl) {
      const allowed = b.guard?.charging_allowed;
      guardEl.textContent = allowed === false ? "50-60% Limit (Paused)" : "Charging Allowed";
    }
  }
  const p = state.pc;
  const cpuEl = $("statCpu");
  const ramEl = $("statRam");
  if (p && cpuEl && ramEl) {
    cpuEl.textContent = `${Math.round(p.cpu)}% CPU`;
    ramEl.textContent = `${Math.round(p.ram)}% RAM`;
  }
  const guardModeEl = $("statGuardMode");
  if (guardModeEl) {
    const isGuard = state?.settings?.guardEnabled !== false;
    guardModeEl.textContent = isGuard ? "50-60% Active" : "Unrestricted";
  }
}

function toggleChargeGuard() {
  const cur = state?.settings?.guardEnabled !== false;
  const next = !cur;
  if (state?.settings) state.settings.guardEnabled = next;
  renderStatsPage();
  fetch("/api/settings", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ guardEnabled: next })
  }).catch(() => {});
  showToast(next ? "Charge Guard: 50-60% Active" : "Charge Guard: Unrestricted");
}

function sleepScreen() {
  fetch("/api/screen/sleep", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({})
  }).catch(() => {});
  showToast("Display Sleep");
}

/* ---------- Alarms Page Engine ---------- */
let selectedAlarmIdx = 0;

function formatTime24toUser(hhmm, is12h) {
  if (!hhmm || !hhmm.includes(":")) return hhmm || "--:--";
  if (!is12h) return hhmm;
  const parts = hhmm.split(":");
  let h = parseInt(parts[0], 10);
  const m = parts[1];
  const ampm = h >= 12 ? "PM" : "AM";
  h = h % 12;
  if (h === 0) h = 12;
  return `${h}:${m} ${ampm}`;
}

function getAlarmTargetTime(alm, solar, is12h) {
  if (alm.type === "fixed") {
    return formatTime24toUser(alm.time || "07:00", is12h);
  }
  const isRise = alm.type === "sunrise";
  const icon = isRise ? "☀" : "🌙";
  const baseTimeStr = isRise ? solar?.sunrise : solar?.sunset;
  if (!baseTimeStr || !baseTimeStr.includes(":")) {
    return `${icon} ${isRise ? 'Sunrise' : 'Sunset'}`;
  }
  const [hStr, mStr] = baseTimeStr.split(":");
  let totalMin = parseInt(hStr, 10) * 60 + parseInt(mStr, 10) + (alm.offsetMinutes || 0);
  totalMin = (totalMin % 1440 + 1440) % 1440;
  const th = Math.floor(totalMin / 60);
  const tm = totalMin % 60;
  const hhmm = String(th).padStart(2, '0') + ":" + String(tm).padStart(2, '0');
  return `${icon} ${formatTime24toUser(hhmm, is12h)}`;
}

const DAY_LABELS = { 1: "Mon", 2: "Tue", 3: "Wed", 4: "Thu", 5: "Fri", 6: "Sat", 7: "Sun" };

function formatRepeatDays(days) {
  if (!Array.isArray(days) || days.length === 0) return "Once";
  const sorted = [...days].map(Number).sort((a, b) => a - b);
  if (sorted.length === 7) return "Daily";
  if (sorted.length === 5 && sorted.every((d, i) => d === i + 1)) return "Weekdays";
  if (sorted.length === 2 && sorted[0] === 6 && sorted[1] === 7) return "Weekends";
  return sorted.map(d => DAY_LABELS[d] || d).join(", ");
}

function renderAlarmsPage() {
  const ul = $("fullAlarmList");
  const summary = $("alarmsSummary");
  if (!ul) return;
  const alarms = state?.alarms || [];
  const activeCount = alarms.filter(a => a.enabled !== false).length;
  if (summary) {
    summary.textContent = `${activeCount} active · ${alarms.length} total`;
  }
  
  if (alarms.length === 0) {
    ul.innerHTML = `<li class="alarm-item-card"><span style="color:var(--ink3)">No alarms configured. Add one via PC Control Hub.</span></li>`;
    return;
  }
  
  if (selectedAlarmIdx >= alarms.length) selectedAlarmIdx = 0;
  const is12h = (state?.settings?.timeFormat || "12h") === "12h";
  const solar = state?.solar;

  ul.innerHTML = alarms.map((alm, idx) => {
    const isSel = idx === selectedAlarmIdx;
    const isAct = alm.enabled !== false;
    const timeDisplay = getAlarmTargetTime(alm, solar, is12h);
    const repeatLabel = formatRepeatDays(alm.days);
    
    let typeLabel = "Fixed Time";
    if (alm.type === "sunrise") {
      typeLabel = alm.offsetMinutes ? `Sunrise (${alm.offsetMinutes > 0 ? '+' : ''}${alm.offsetMinutes}m)` : "Sunrise (Exact)";
    } else if (alm.type === "sunset") {
      typeLabel = alm.offsetMinutes ? `Sunset (${alm.offsetMinutes > 0 ? '+' : ''}${alm.offsetMinutes}m)` : "Sunset (Exact)";
    }
    
    return `
      <li class="alarm-item-card ${isSel ? 'selected' : ''}" id="alarmItem-${idx}">
        <div class="alarm-card-top">
          <div class="alarm-time-val">${esc(timeDisplay)}</div>
          <div class="alarm-pill-badge ${isAct ? 'active' : 'off'}">${isAct ? 'ACTIVE' : 'OFF'}</div>
        </div>
        <div class="alarm-card-tag">${esc(alm.tag || 'Alarm')}</div>
        <div class="alarm-card-meta">
          <span>${esc(typeLabel)}</span>
          <span>·</span>
          <span style="color:var(--pastel-sand); font-weight:600;">${esc(repeatLabel)}</span>
          <span>·</span>
          <span>${esc(alm.sound || 'homecoming.mp3')}</span>
        </div>
      </li>
    `;
  }).join("");
}

function selectNextAlarm() {
  const alarms = state?.alarms || [];
  if (alarms.length === 0) return;
  selectedAlarmIdx = (selectedAlarmIdx + 1) % alarms.length;
  renderAlarmsPage();
  const el = $(`alarmItem-${selectedAlarmIdx}`);
  if (el) el.scrollIntoView({ block: "nearest", behavior: "smooth" });
  const alm = alarms[selectedAlarmIdx];
  showToast(`Selected: ${alm.tag || alm.time}`);
}

async function toggleSelectedAlarm() {
  const alarms = state?.alarms || [];
  if (alarms.length === 0) {
    showToast("No alarms in list");
    return;
  }
  const alm = alarms[selectedAlarmIdx];
  const newEnabled = !alm.enabled;
  alm.enabled = newEnabled;
  renderAlarmsPage();
  showToast(`${alm.tag || 'Alarm'}: ${newEnabled ? 'ACTIVE' : 'OFF'}`);
  
  try {
    if (window.AndroidBridge && window.AndroidBridge.toggleAlarm) {
      window.AndroidBridge.toggleAlarm(alm.id);
    } else {
      await fetch(`/api/alarms/${alm.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: newEnabled })
      });
    }
  } catch (e) {
    console.error("Toggle alarm error:", e);
  }
}

function testSelectedAlarmSound() {
  const alarms = state?.alarms || [];
  if (alarms.length === 0) return;
  const alm = alarms[selectedAlarmIdx];
  showToast(`Sound: ${alm.sound || 'homecoming.mp3'}`);
}

/* ---------- Full-Screen Glowing Alarm Ringing View ---------- */
function showAlarmOverlay(alm) {
  const overlay = $("alarmOverlay");
  const tagEl = $("alarmTagDisplay");
  const trigEl = $("alarmTriggerInfo");
  const soundEl = $("alarmSoundDisplay");
  const ui = $("ui");
  
  if (tagEl) tagEl.textContent = alm?.tag || "ALARM RINGING";
  if (trigEl) {
    if (alm?.type === "sunrise") trigEl.textContent = `Dynamic Sunrise · ${fmtT(new Date())}`;
    else if (alm?.type === "sunset") trigEl.textContent = `Dynamic Sunset · ${fmtT(new Date())}`;
    else trigEl.textContent = `Scheduled Alarm · ${alm?.time || '--:--'}`;
  }
  if (soundEl) soundEl.textContent = alm?.sound || "homecoming.mp3";
  
  if (overlay) overlay.classList.remove("hidden");
  if (ui) ui.style.opacity = "0";
}

function hideAlarmOverlay() {
  const overlay = $("alarmOverlay");
  const ui = $("ui");
  if (overlay) overlay.classList.add("hidden");
  if (ui) ui.style.opacity = "1";
}

window.onAlarmRinging = function(alarmData) {
  try {
    const data = typeof alarmData === "string" ? JSON.parse(alarmData) : alarmData;
    showAlarmOverlay(data);
  } catch (e) {
    showAlarmOverlay({ tag: "ALARM RINGING" });
  }
};

window.onAlarmDismissed = function() {
  hideAlarmOverlay();
  refresh();
};

window.refreshAlarms = function() {
  refresh();
};

/* ---------- Scene Switching (Clock Page Action) ---------- */
function cycleScene() {
  const scenes = ["desk", "mountains", "sakura", "sky"];
  const cur = state?.settings?.scene || "desk";
  let i = (scenes.indexOf(cur) + 1) % scenes.length;
  const nextScene = scenes[i];
  if (state?.settings) state.settings.scene = nextScene;
  fetch("/api/settings", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ scene: nextScene })
  }).catch(() => {});
  showToast("Scene: " + nextScene.charAt(0).toUpperCase() + nextScene.slice(1));
  render();
}

/* ---------- Sky colour by sun altitude (degrees) ---------- */
const hex = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16) / 255);
const P = (alt, zen, mid, hor, sun) => ({ alt, zen: hex(zen), mid: hex(mid), hor: hex(hor), sun });
const MORNING = [
  P(-90, "#03050c", "#070b18", "#0e1529", [0, 0, 0]),
  P(-14, "#04060e", "#0a1022", "#151d38", [0, 0, 0]),
  P(-8,  "#0b1330", "#1f2b55", "#4b4d78", [.12, .08, .16]),
  P(-3,  "#1c2a4c", "#5e6590", "#e3a185", [.9, .45, .3]),
  P(3,   "#3a5a88", "#a7aec2", "#f4c48f", [1, .6, .32]),
  P(12,  "#3070b4", "#7fb0dc", "#d9e7f0", [1, .9, .74]),
  P(35,  "#2463a9", "#6aa2d8", "#cfe3f2", [1, .96, .88]),
  P(90,  "#2463a9", "#6aa2d8", "#cfe3f2", [1, .96, .88]),
];
const EVENING = MORNING.map(k => k.alt === -3 ? P(-3, "#141b3a", "#5a3f6b", "#d4735a", [.95, .4, .25])
  : k.alt === 3 ? P(3, "#33507e", "#c99a72", "#f6c486", [1, .55, .28]) : k);
const mix = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);
const lum = c => .2126 * c[0] + .7152 * c[1] + .0722 * c[2];
function palette(alt, evening) {
  const K = evening ? EVENING : MORNING;
  let i = 0; while (i < K.length - 2 && alt > K[i + 1].alt) i++;
  const a = K[i], b = K[i + 1], t = Math.min(1, Math.max(0, (alt - a.alt) / (b.alt - a.alt)));
  const s = t * t * (3 - 2 * t);
  return { zen: mix(a.zen, b.zen, s), mid: mix(a.mid, b.mid, s), hor: mix(a.hor, b.hor, s), sun: mix(a.sun, b.sun, s) };
}

/* ---------- WMO weather code -> sky parameters ---------- */
const NAMES = { 0: "Clear", 1: "Mostly clear", 2: "Partly cloudy", 3: "Overcast", 45: "Fog", 48: "Rime fog",
  51: "Light drizzle", 53: "Drizzle", 55: "Heavy drizzle", 56: "Freezing drizzle", 57: "Freezing drizzle",
  61: "Light rain", 63: "Rain", 65: "Heavy rain", 66: "Freezing rain", 67: "Freezing rain",
  71: "Light snow", 73: "Snow", 75: "Heavy snow", 77: "Snow grains", 80: "Showers", 81: "Showers", 82: "Violent showers",
  85: "Snow showers", 86: "Snow showers", 95: "Thunderstorm", 96: "Thunder · hail", 99: "Thunder · hail" };
const RAIN = { 51: .3, 53: .42, 55: .55, 56: .4, 57: .5, 61: .5, 63: .75, 65: 1, 66: .6, 67: .9, 80: .55, 81: .8, 82: 1, 95: .9, 96: 1, 99: 1 };
const SNOW = { 71: .4, 73: .7, 75: 1, 77: .3, 85: .6, 86: 1 };
function weatherParams(code, cover, windKmh, windDir) {
  const rain = RAIN[code] || 0, snow = SNOW[code] || 0, fog = code === 45 || code === 48 ? .78 : 0;
  let cloud = cover;
  if (code === 2) cloud = Math.max(cloud, .45);
  if (code === 3 || rain || snow) cloud = Math.max(cloud, .93);
  if (code <= 1) cloud = Math.min(cloud, .25);
  const dark = rain || snow ? .85 : code === 3 ? .65 : cloud * .3;
  const r = windDir * Math.PI / 180, k = .4 + windKmh / 10;
  return { rain, snow, fog, cloud, dark, thunder: code >= 95, wind: [-Math.sin(r) * k, .08] };
}
const compass = d => ["N", "NE", "E", "SE", "S", "SW", "W", "NW"][Math.round(d / 45) % 8];

/* ---------- drive the sky ---------- */
function updateSky() {
  const s = state?.settings || {}, lat = s.lat ?? 22.5643, lon = s.lon ?? 88.3693, d = now();
  try {
    const sunTimes = SunCalc.getTimes(d, lat, lon);
    const sun = SunCalc.getPosition(d, lat, lon), moon = SunCalc.getMoonPosition(d, lat, lon);
    const ill = SunCalc.getMoonIllumination(d), alt = sun.altitude * 180 / Math.PI;
    const evening = d.getHours() >= 12;
    const pal = palette(alt, evening);

    const code = Q.has("code") ? +Q.get("code") : (wx?.current?.weather_code ?? 1);
    const cover = Q.has("cc") ? +Q.get("cc") / 100 : ((wx?.current?.cloud_cover ?? 10) / 100);
    const windSpeed = wx?.current?.wind_speed_10m ?? 8;
    const windDir = wx?.current?.wind_direction_10m ?? 270;
    const w = weatherParams(code, cover, windSpeed, windDir);

    const g = Math.min(.8, w.dark * .75 + w.fog * .4);
    const grey = c => { const L = lum(c); return mix(c, [L * .96, L * 1.0, L * 1.06], g); };
    const dim = 1 - w.dark * .28;
    ["zen", "mid", "hor"].forEach(k => Sky[k] = grey(pal[k]).map(v => v * dim));
    Sky.sunCol = pal.sun;

    const X = az => Math.min(.9, Math.max(.1, .5 + az / Math.PI * .62));
    const Y = a => .06 + Math.max(-.2, a) / (Math.PI / 2) * .9;
    Sky.sun = [X(sun.azimuth), Y(sun.altitude), Math.min(1, Math.max(0, (alt + 1.5) / 3))];
    const ma = moon.altitude * 180 / Math.PI;
    Sky.moon = [X(moon.azimuth), Y(moon.altitude), ill.phase, Math.max(0, Math.min(1, ma / 3)) * (alt > 0 ? .35 : 1)];
    Sky.stars = Math.min(1, Math.max(0, (-alt - 6) / 8));
    Sky.lum = lum(Sky.mid);
    Object.assign(Sky, { cloud: w.cloud, dark: w.dark, rain: w.rain, snow: w.snow, fog: w.fog, thunder: w.thunder, wind: w.wind });

    const sc = (typeof Scene !== "undefined" && Scene?.update) ? Scene.update({ ...Sky, sun: Sky.sun.slice(), alt }, Q.get("scene") || s.scene || "desk") : null;
    const textBgRgb = mix(Sky.mid, Sky.hor, .65);
    const skyLum = lum(textBgRgb);
    const isCloudyOrStormy = (w.cloud > 0.45) || (w.dark > 0.2) || (w.rain > 0.2) || (w.fog > 0.3);
    const isBrightDaylight = !sc && alt > 15 && skyLum > 0.72 && !isCloudyOrStormy;
    document.body.classList.toggle("light", isBrightDaylight);
    document.body.classList.toggle("scene", !!sc);
    const nightEnabled = s.nightMode !== false;
    const rawNs = s.nightStart ?? 23;
    const rawNe = s.nightEnd ?? 6;
    const ns = typeof rawNs === "string" ? (parseInt(rawNs.split(":")[0], 10) || 23) : Number(rawNs);
    const ne = typeof rawNe === "string" ? (parseInt(rawNe.split(":")[0], 10) || 6) : Number(rawNe);
    const h = d.getHours();
    const isNight = nightEnabled && (ns <= ne ? h >= ns && h < ne : h >= ns || h < ne);
    document.body.classList.toggle("night-mode", isNight);
    document.body.classList.toggle("standby", isNight);
    return { code, sunTimes, alt };
  } catch (err) {
    console.warn("updateSky fallback triggered:", err);
    return { code: 1, sunTimes: SunCalc.getTimes(d, lat, lon), alt: 0 };
  }
}

/* ---------- weather ---------- */
async function loadWeather() {
  const s = state?.settings; if (!s) return;
  wxAt = Date.now();
  try {
    const lat = s.lat ?? 22.5643, lon = s.lon ?? 88.3693;
    const u = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&timezone=auto&forecast_days=2` +
      `&current=temperature_2m,apparent_temperature,relative_humidity_2m,weather_code,cloud_cover,wind_speed_10m,wind_direction_10m,precipitation` +
      `&hourly=temperature_2m,precipitation_probability&daily=temperature_2m_max,temperature_2m_min`;
    const resp = await fetch(u);
    if (!resp.ok) throw new Error("HTTP " + resp.status);
    const w = await resp.json();
    if (w.error) throw new Error(w.reason || "Weather API error");
    try {
      const aqiResp = await fetch(`https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${lat}&longitude=${lon}&current=us_aqi`);
      if (aqiResp.ok) {
        const aqiJson = await aqiResp.json();
        if (aqiJson?.current?.us_aqi != null) w.aqi = aqiJson.current.us_aqi;
      }
    } catch (_) {}
    wx = w;
  } catch (err) {
    console.warn("loadWeather failed:", err.message);
    wxAt = Date.now() - 25 * 60e3;
  }
}

/* ---------- typography & main render loop ---------- */
const fmtT = d => d instanceof Date && !isNaN(d) ? `${pad(d.getHours())}:${pad(d.getMinutes())}` : "--:--";
const aqiWord = a => a <= 50 ? "Good" : a <= 100 ? "Moderate" : a <= 150 ? "Poor" : a <= 200 ? "Unhealthy" : "Very unhealthy";
let tickIdx = 0, tickAt = 0, tickKey = "";

function computeSunStatus(d, t, s) {
  if (!t || !t.sunrise || !t.sunset) return "";
  const nowMs = d.getTime();
  const riseMs = t.sunrise.getTime();
  const setMs = t.sunset.getTime();
  
  if (nowMs >= riseMs && nowMs < setMs) {
    // Current time is between sunrise and sunset (DAYTIME)
    // Always show upcoming sunset time during the day
    return `Sunset ${fmtT(t.sunset)}`;
  } else {
    // Current time is after sunset or before sunrise (NIGHTTIME)
    // Always show upcoming sunrise time during the night
    if (nowMs < riseMs) {
      return `Sunrise ${fmtT(t.sunrise)}`;
    } else {
      const tomorrow = new Date(nowMs + 86400000);
      const tomTimes = SunCalc.getTimes(tomorrow, s.lat ?? 22.5643, s.lon ?? 88.3693);
      return `Sunrise ${fmtT(tomTimes.sunrise)}`;
    }
  }
}

function render() {
  const d = now();
  const s = state?.settings || {};

  // 1. CLOCK & DATE - BULLETPROOF STANDALONE BLOCK
  // Must ALWAYS execute first and never fail, completely decoupled from weather, sky, or network state
  try {
    const is12h = (s.timeFormat || "12h") === "12h";
    let h = d.getHours();
    let ampm = "";
    if (is12h) {
      ampm = h >= 12 ? "PM" : "AM";
      h = h % 12;
      if (h === 0) h = 12;
    }
    const hhEl = $("hh"), mmEl = $("mm"), ampmEl = $("ampm"), dateEl = $("date"), placeEl = $("place");
    if (Q.has("time")) {
      const parts = Q.get("time").split(":");
      if (hhEl) hhEl.textContent = parts[0] || "00";
      if (mmEl) mmEl.textContent = parts[1] || "00";
      if (ampmEl) ampmEl.textContent = "";
    } else {
      if (hhEl) hhEl.textContent = pad(h);
      if (mmEl) mmEl.textContent = pad(d.getMinutes());
      if (ampmEl) ampmEl.textContent = is12h ? ampm : "";
    }
    if (dateEl) dateEl.textContent = d.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" });
    if (placeEl) placeEl.textContent = Q.get("place") || s.place || "Somewhere on Earth";
  } catch (err) {
    console.error("Critical clock render error:", err);
  }

  // 2. SKY & SUN POSITION
  let sky = { code: 1, sunTimes: null, alt: 0 };
  try {
    sky = updateSky();
  } catch (err) {
    console.error("Sky update error:", err);
  }

  // 3. SUN STATUS & WEATHER DISPLAY
  let sunTxt = "";
  try {
    const t = sky.sunTimes;
    sunTxt = computeSunStatus(d, t, s);
    const statusEl = $("status");
    if (statusEl) statusEl.textContent = Q.get("status") || sunTxt;

    const c = wx?.current;
    if ($("temp")) $("temp").textContent = (c && c.temperature_2m != null) ? `${Math.round(c.temperature_2m)}°` : "";
    if ($("condBig")) $("condBig").textContent = NAMES[sky.code] || "";
    if ($("hilo")) {
      const maxT = wx?.daily?.temperature_2m_max?.[0];
      const minT = wx?.daily?.temperature_2m_min?.[0];
      $("hilo").textContent = (maxT != null && minT != null) ? `H ${Math.round(maxT)}°  L ${Math.round(minT)}°` : "";
    }
  } catch (err) {
    console.error("Weather display error:", err);
  }

  // 4. NOW SLOT & SECONDARY TICKER
  try {
    slot(d);
  } catch (err) {
    console.error("Slot render error:", err);
  }

  try {
    ticker(d, sunTxt);
  } catch (err) {
    console.error("Ticker render error:", err);
  }

  // 5. SUBPAGE CARD ENGINES
  try {
    renderTasksPage();
    renderStatsPage();
    renderAlarmsPage();
  } catch (err) {
    console.error("Subpages render error:", err);
  }

  // 6. NIGHT MODE & ANTI-RETENTION MICRO-DRIFT
  try {
    const isNight = !!s.nightMode && (function() {
      const curH = d.getHours();
      const ns = s.nightStart ?? 23;
      const ne = s.nightEnd ?? 6;
      return ns <= ne ? (curH >= ns && curH < ne) : (curH >= ns || curH < ne);
    })();
    document.body.classList.toggle("night-mode", isNight);

    // Continuous anti-retention micro-drift for IPS LCD:
    // Shifts UI coordinates across a 16-point orbit every 90 seconds to eliminate static DC bias
    const driftStep = Math.floor(Date.now() / 90000) % 16;
    const dx = [-1.5, 0, 1.5, 0, 1, -1, 1.5, -1.5, 0.5, -0.5, 1, -1, 0, 1.5, -1, 0][driftStep];
    const dy = [0, 1.5, 0, -1.5, 1, 1.5, -1, -0.5, 1.5, -1.5, 0, 1, -1.5, 0.5, 1, 0][driftStep];
    const uiEl = $("ui");
    if (uiEl) uiEl.style.transform = `translate(${dx}px,${dy}px)`;
  } catch (err) {
    console.error("Drift render error:", err);
  }
}

/* One "now" slot: the single thing worth acting on, then the nearest deadline. */
function slot(d) {
  const slotEl = $("slot");
  if (!slotEl) return;
  if (!state) { slotEl.innerHTML = ""; return; }
  const out = [], tm = state.timer, open = (state.tasks || []).filter(t => !t.done);
  if (tm?.running && tm.endsAt > Date.now()) {
    const L = Math.round((tm.endsAt - Date.now()) / 1000);
    out.push(`<div class="item"><div class="k">${esc(tm.label || "Focus")}</div><div class="v big hot">${pad(Math.floor(L / 60))}:${pad(L % 60)}</div></div>`);
  } else if (open.length) {
    out.push(`<div class="item"><div class="k">Next · ${open.length} left</div><div class="v">${esc(open[0].text)}</div></div>`);
  }
  const cd = (state.settings?.countdowns || []).map(c => ({ ...c, ms: new Date(c.date) - d })).filter(c => c.ms > 0).sort((a, b) => a.ms - b.ms)[0];
  if (cd) out.push(`<div class="item"><div class="k">${esc(cd.label)}</div><div class="v">${Math.floor(cd.ms / 864e5)}<small>days</small> ${Math.floor(cd.ms % 864e5 / 36e5)}<small>hrs</small></div></div>`);
  slotEl.innerHTML = out.join(""); slotEl.style.display = out.length ? "" : "none";
}

/* Secondary ticker row */
function ticker(d, sunTxt) {
  const tickEl = $("ticker");
  const dotsEl = $("dots");
  if (!tickEl || !dotsEl) return;
  const c = wx?.current, items = [], sep = `<span class="sepd">·</span>`;
  if (c && c.apparent_temperature != null) {
    items.push(`<span class="k">Outside</span>Feels <b>${Math.round(c.apparent_temperature)}°</b>${sep}Wind <b>${Math.round(c.wind_speed_10m ?? 0)} km/h ${compass(c.wind_direction_10m ?? 0)}</b>${sep}Humidity <b>${c.relative_humidity_2m ?? 0}%</b>` +
      (wx?.aqi != null ? `${sep}AQI <b class="${wx.aqi > 150 ? "hot" : ""}">${wx.aqi} ${aqiWord(wx.aqi)}</b>` : ""));
  }
  if (wx?.hourly && Array.isArray(wx.hourly.time) && Array.isArray(wx.hourly.temperature_2m)) {
    const H = wx.hourly, iso = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:00`;
    const i0 = Math.max(0, H.time.indexOf(iso));
    const v = H.temperature_2m.slice(i0, i0 + 13);
    const pp = Array.isArray(H.precipitation_probability) ? H.precipitation_probability.slice(i0, i0 + 13) : [];
    if (v.length > 0) {
      const pm = pp.length > 0 ? Math.max(...pp) : 0;
      const at = (d.getHours() + (pp.length > 0 ? pp.indexOf(pm) : 0)) % 24;
      items.push(`<span class="k">Next 12 h</span>${pm >= 40 ? `<b class="hot">Rain likely around ${pad(at)}:00 (${pm}%)</b>` : "No rain expected"}${sep}<b>${Math.round(Math.min(...v))}° – ${Math.round(Math.max(...v))}°</b>${sep}${sunTxt}`);
    }
  }
  if (state?.tasks?.length) {
    const open = state.tasks.filter(t => !t.done).length, done = state.tasks.length - open;
    items.push(`<span class="k">Today</span><b>${done} of ${state.tasks.length}</b> tasks done${open ? `${sep}${open} to go` : `${sep}all clear`}`);
  }
  if (state?.pc) { const p = state.pc; items.push(`<span class="k">${esc(p.host || "PC")}</span>CPU <b>${Math.round(p.cpu)}%</b>${sep}RAM <b>${Math.round(p.ram)}%</b>${p.cpu_temp != null ? `${sep}<b>${Math.round(p.cpu_temp)}°C</b>` : ""}`); }
  const b = state?.battery;
  if (b) items.push(`<span class="k">Dock</span>Battery <b>${b.capacity ?? "?"}%</b>${sep}<b class="${b.temp_c >= 40 ? "hot" : ""}">${b.temp_c ?? "?"} °C</b>${sep}${b.guard?.charging_allowed === false ? "Charging paused (guard)" : esc(b.status || "")}`);
  if (!items.length) return;
  for (let n = 0; n < items.length; n++) items[n] = items[n].split(sep).map(x => `<span class="seg">${x}</span>`).join(sep);
  if (Q.has("tick")) tickIdx = +Q.get("tick"); else if (Date.now() - tickAt > 7000) { tickAt = Date.now(); tickIdx = (tickIdx + 1) % items.length; }
  const i = tickIdx % items.length, key = i + items[i];
  if (key !== tickKey) {
    tickKey = key; tickEl.style.opacity = 0;
    setTimeout(() => { tickEl.innerHTML = items[i]; tickEl.style.opacity = 1; }, tickKey && tickEl.innerHTML ? 300 : 0);
  }
  dotsEl.innerHTML = items.map((_, k) => `<i class="${k === i ? "on" : ""}"></i>`).join("");
}

/* ---------- dynamic geolocation resolver ---------- */
let geoCheckedAt = 0;
async function resolveDynamicLocation(force = false) {
  const s = state?.settings;
  if (Q.has("place") || (s && s.autoLocation === false && !force)) return;
  if (!force && Date.now() - geoCheckedAt < 3 * 3600 * 1000) return;
  geoCheckedAt = Date.now();

  try {
    let lat = null, lon = null, place = null;
    try {
      const r = await (await fetch("https://get.geojs.io/v1/ip/geo.json")).json();
      if (r && r.latitude && r.longitude) {
        lat = parseFloat(r.latitude);
        lon = parseFloat(r.longitude);
        place = r.city ? `${r.city}, ${r.region || r.country || ""}`.trim().replace(/,\s*$/, "") : null;
      }
    } catch {}

    if (!lat || !lon) {
      try {
        const r2 = await (await fetch("https://ipwho.is/")).json();
        if (r2 && r2.success) {
          lat = r2.latitude;
          lon = r2.longitude;
          place = r2.city ? `${r2.city}, ${r2.region || r2.country || ""}`.trim().replace(/,\s*$/, "") : null;
        }
      } catch {}
    }

    if (lat != null && lon != null) {
      const curLat = s?.lat ?? 0, curLon = s?.lon ?? 0;
      const moved = Math.abs(curLat - lat) > 0.05 || Math.abs(curLon - lon) > 0.05 || !s?.place;
      if (moved || force) {
        if (!state) state = { settings: {} };
        if (!state.settings) state.settings = {};
        state.settings.lat = parseFloat(lat.toFixed(4));
        state.settings.lon = parseFloat(lon.toFixed(4));
        if (place) state.settings.place = place;
        state.settings.autoLocation = true;

        fetch("/api/settings", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            lat: state.settings.lat,
            lon: state.settings.lon,
            place: state.settings.place,
            autoLocation: true
          })
        }).catch(() => {});

        await loadWeather();
        render();
      }
    }
  } catch (err) {}
}

let lastActionTs = 0;
let lastActionSig = "";
let longPressLockoutUntil = 0;

/* ---------- Mirror Mode: front camera viewfinder (no capture) ---------- */
async function startMirror() {
  if (mirrorStream) return; // already streaming
  try {
    mirrorStream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 720 } },
      audio: false
    });
    const v = $("mirrorVideo");
    if (v) v.srcObject = mirrorStream;
    if (window.AndroidBridge && typeof window.AndroidBridge.onMirrorActive === "function") {
      try { window.AndroidBridge.onMirrorActive(true); } catch (e) {}
    }
  } catch (err) {
    console.error("[Mirror] Camera error:", err);
    // Camera unavailable — silently return to dashboard
    mirrorStream = null;
    if (activePage === 5) goToPage(0);
  }
}

function stopMirror() {
  const v = $("mirrorVideo");
  if (v) {
    try {
      v.pause();
      v.srcObject = null;
      v.removeAttribute("src");
      v.load();
    } catch (e) {}
  }
  if (mirrorStream) {
    try {
      mirrorStream.getTracks().forEach(t => {
        try { t.stop(); } catch (e) {}
      });
    } catch (e) {}
    mirrorStream = null;
  }
  if (window.AndroidBridge && typeof window.AndroidBridge.onMirrorActive === "function") {
    try { window.AndroidBridge.onMirrorActive(false); } catch (e) {}
  }
}

function executeHardwareAction(btn, gesture) {
  const nowMs = Date.now();
  if (nowMs < longPressLockoutUntil) {
    return;
  }
  if (gesture === "long") {
    longPressLockoutUntil = nowMs + 900;
  }
  const sig = `${btn}:${gesture}`;
  // Deduplicate rapid duplicate dispatches (e.g. from evaluateJavascript + background polling)
  if (sig === lastActionSig && (nowMs - lastActionTs < 320)) {
    return;
  }
  lastActionTs = nowMs;
  lastActionSig = sig;

  if (btn === "up") {
    // Volume Up is dedicated to cycling pages sequentially
    switchPage(1);
    return;
  }
  
  if (btn === "down") {
    // Volume Down is dedicated action controller tailored per page
    switch (activePage) {
      case 0: // Clock Dashboard page
        if (gesture === "single") {
          cycleScene();
        } else if (gesture === "double") {
          showToast("Clock Dashboard");
        } else if (gesture === "long") {
          cycleVolume();
        }
        break;

      case 1: // Alarms & Schedule page
        if (gesture === "single") {
          toggleSelectedAlarm();
        } else if (gesture === "double") {
          selectNextAlarm();
        } else if (gesture === "long") {
          testSelectedAlarmSound();
        }
        break;
        
      case 2: // Focus Timer page
        if (gesture === "single") {
          cycleFocusPreset();
        } else if (gesture === "double") {
          toggleFocusTimer();
        } else if (gesture === "long") {
          resetFocusTimer();
        }
        break;
        
      case 3: // Study Tasks page
        if (gesture === "single") {
          toggleCurrentTask();
        } else if (gesture === "double") {
          selectNextTask();
        } else if (gesture === "long") {
          clearCompletedTasks();
        }
        break;
        
      case 4: // Telemetry & Power page
        if (gesture === "single") {
          toggleChargeGuard();
        } else if (gesture === "double") {
          refresh();
          showToast("Telemetry Refreshed");
        } else if (gesture === "long") {
          sleepScreen();
        }
        break;

      case 5: // Mirror page — passive viewfinder, no Vol Down actions
        // Vol Down does nothing on mirror; Vol Up exits via switchPage(1) wrapping to Dashboard
        break;
    }
  }
}

window.onHardwareAction = function(btn, gesture) {
  executeHardwareAction(btn, gesture);
};

let lastHwActionTs = 0;
function checkHardwareAction() {
  const a = state?.settings?.hwAction;
  if (a && a.ts && a.ts > lastHwActionTs) {
    lastHwActionTs = a.ts;
    executeHardwareAction(a.btn, a.gesture);
  }
}

async function pollHardwareAction() {
  try {
    const res = await fetch("/api/state");
    if (res.ok) {
      const data = await res.json();
      const a = data?.settings?.hwAction;
      if (a && a.ts && a.ts > lastHwActionTs) {
        lastHwActionTs = a.ts;
        state = data;
        executeHardwareAction(a.btn, a.gesture);
      }
    }
  } catch (e) {}
}
setInterval(pollHardwareAction, 100);

async function refresh() {
  try {
    const res = await fetch("/api/state?_t=" + Date.now(), { cache: "no-store" });
    if (res.ok) state = await res.json();
  } catch {}
  checkHardwareAction();
  if (state?.isAlarmRinging && state?.ringingAlarm) {
    showAlarmOverlay(state.ringingAlarm);
  } else if (state && !state.isAlarmRinging) {
    hideAlarmOverlay();
  }
  if (state?.settings?.autoLocation !== false) {
    resolveDynamicLocation();
  }
  if (state && Date.now() - wxAt > 30 * 60e3) await loadWeather();
  render();
}
window.refresh = refresh;
window.syncTime = function() { refresh(); };
document.fonts?.ready.then(render);
setInterval(render, 1000);
setInterval(refresh, 5000);
refresh();

/* Backwards-compatibility hook */
window.onHardwareKey = function(dir) {
  if (dir === "up") window.onHardwareAction("up", "single");
  else if (dir === "down") window.onHardwareAction("down", "single");
};

/* Keyboard event bindings for local PC browser testing & dev simulation */
window.addEventListener("keydown", (e) => {
  if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA") return;
  if (e.key === "p" || e.key === "P" || e.key === "Escape") {
    // Simulate power button alarm stop
    if (state?.isAlarmRinging) {
      e.preventDefault();
      if (window.AndroidBridge && window.AndroidBridge.dismissAlarm) {
        window.AndroidBridge.dismissAlarm();
      } else {
        fetch("/api/alarms/dismiss", { method: "POST" }).catch(() => {});
      }
      hideAlarmOverlay();
      showToast("Alarm Stopped via Power Button");
      return;
    }
  }
  if (e.key === "ArrowUp") {
    e.preventDefault();
    window.onHardwareAction("up", "single");
  } else if (e.key === "ArrowDown") {
    e.preventDefault();
    window.onHardwareAction("down", "single");
  } else if (e.key === " " || e.code === "Space") {
    e.preventDefault();
    window.onHardwareAction("down", "double");
  } else if (e.key === "h" || e.key === "H") {
    e.preventDefault();
    window.onHardwareAction("down", "long");
  } else if (["1", "2", "3", "4", "5", "6"].includes(e.key)) {
    e.preventDefault();
    goToPage(parseInt(e.key) - 1);
  }
});
