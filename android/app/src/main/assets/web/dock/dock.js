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
  { id: "page-clock", title: "Clock Dashboard", badge: "Dashboard [1/7]" },
  { id: "page-alarms", title: "Alarms & Schedule", badge: "Alarms [2/7]" },
  { id: "page-focus", title: "Focus Timer", badge: "Focus Timer [3/7]" },
  { id: "page-tasks", title: "Study Tasks", badge: "Study Tasks [4/7]" },
  { id: "page-mirror", title: "Mirror", badge: "Mirror [5/7]" },
  { id: "page-stats", title: "Telemetry & Power", badge: "Telemetry [6/7]" },
  { id: "page-settings", title: "Dock Settings", badge: "Settings [7/7]" }
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
window.resetToDashboard = function(force = false) {
  const m = $("firstRunModal");
  const isModalOpen = m && !m.classList.contains("hidden");
  if (force || (activePage !== 0 && !isModalOpen && activePage !== 6)) {
    goToPage(0);
  }
};

document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") {
    window.resetToDashboard();
    render();
    refresh();
    if (typeof window.onSystemStateChanged === "function") {
      window.onSystemStateChanged();
    }
  }
});

window.addEventListener("focus", () => {
  window.resetToDashboard();
  render();
  refresh();
  if (typeof window.onSystemStateChanged === "function") {
    window.onSystemStateChanged();
  }
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
  document.body.classList.toggle("mirror-active", activePage === 4);
  if (activePage === 1) {
    renderAlarmsPage();
  } else if (activePage === 3) {
    renderTasksPage();
  } else if (activePage === 5) {
    renderStatsPage();
  } else if (activePage === 6) {
    updateSettingsPage();
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
const FOCUS_PRESETS = [15, 25, 45, 60];
let focusPresetIdx = 1; // Default 25m
let focusSecondsLeft = 25 * 60;
let focusRunning = false;
let focusTimerInterval = null;

function setFocusPreset(mins) {
  if (focusRunning) pauseFocusTimer();
  const idx = FOCUS_PRESETS.indexOf(mins);
  if (idx !== -1) focusPresetIdx = idx;
  focusSecondsLeft = mins * 60;
  document.querySelectorAll(".btn-preset").forEach(btn => {
    btn.classList.toggle("active", +btn.dataset.preset === mins);
  });
  updateFocusDisplay();
  showToast(`Focus Duration: ${mins} min`);
}
window.setFocusPreset = setFocusPreset;

function cycleFocusPreset() {
  if (focusRunning) {
    pauseFocusTimer();
  }
  focusPresetIdx = (focusPresetIdx + 1) % FOCUS_PRESETS.length;
  focusSecondsLeft = FOCUS_PRESETS[focusPresetIdx] * 60;
  document.querySelectorAll(".btn-preset").forEach(btn => {
    btn.classList.toggle("active", +btn.dataset.preset === FOCUS_PRESETS[focusPresetIdx]);
  });
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
      ? "Focusing · Tap digits or button to pause" 
      : "Paused · Tap digits or Start to begin";
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
    stateLbl.textContent = "Focus session complete! Tap Reset to start fresh";
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
    stateLbl.textContent = "Paused · Tap digits or Start to begin";
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
  const clearBtn = $("btnTouchTaskClear");
  if (!ul) return;
  const tasks = state?.tasks || [];
  const openCount = tasks.filter(t => !t.done).length;
  const doneCount = tasks.length - openCount;
  if (summary) {
    summary.textContent = `${openCount} open · ${doneCount} done`;
  }
  if (clearBtn) {
    clearBtn.classList.toggle("hidden", doneCount === 0);
  }
  
  if (tasks.length === 0) {
    ul.innerHTML = `<li class="task-row"><span style="color:var(--ink3)">No tasks yet. Add one using the field above.</span></li>`;
    return;
  }
  
  if (selectedTaskIdx >= tasks.length) selectedTaskIdx = 0;
  
  ul.innerHTML = tasks.map((t, idx) => {
    const isSel = idx === selectedTaskIdx;
    const isDone = !!t.done;
    return `
      <li class="task-row ${isSel ? 'selected' : ''} ${isDone ? 'done' : ''}" id="taskItem-${idx}">
        <span class="chk" onclick="window.toggleTaskDone('${t.id}', ${!isDone})">${isDone ? '✓' : '○'}</span>
        <span class="txt" style="flex:1; cursor:pointer;" onclick="window.toggleTaskDone('${t.id}', ${!isDone})">${esc(t.text)}</span>
        <button style="background:transparent; border:none; color:var(--pastel-rose); font-size:14px; cursor:pointer; padding:4px;" onclick="window.deleteTaskById('${t.id}')" title="Delete">✕</button>
      </li>
    `;
  }).join("");
}

async function addNewTask() {
  const input = $("newTaskInput");
  if (!input) return;
  const text = input.value.trim();
  if (!text) return;
  input.value = "";
  
  try {
    const res = await fetch("/api/tasks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: text })
    });
    if (res.ok) {
      const created = await res.json();
      if (!state.tasks) state.tasks = [];
      state.tasks.push(created);
      renderTasksPage();
      showToast("Added: " + text.slice(0, 24));
    }
  } catch (e) {
    showToast("Error adding task");
  }
}
window.addNewTask = addNewTask;

async function toggleTaskDone(id, done) {
  if (state?.tasks) {
    const t = state.tasks.find(x => x.id === id);
    if (t) t.done = done;
  }
  renderTasksPage();
  await fetch(`/api/tasks/${id}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ done: done })
  }).catch(() => {});
}
window.toggleTaskDone = toggleTaskDone;

async function deleteTaskById(id) {
  if (state?.tasks) {
    state.tasks = state.tasks.filter(t => t.id !== id);
  }
  renderTasksPage();
  await fetch(`/api/tasks/${id}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ delete: true })
  }).catch(() => {});
  showToast("Task Deleted");
}
window.deleteTaskById = deleteTaskById;

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

window.toggleTaskByIndex = function(idx) {
  selectedTaskIdx = idx;
  toggleCurrentTask();
};

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
  const cardLoad = $("cardLoad");
  if (p && p.cpu != null && p.ram != null) {
    if (cpuEl) cpuEl.textContent = `${Math.round(p.cpu)}% CPU`;
    if (ramEl) ramEl.textContent = `${Math.round(p.ram)}% RAM`;
  } else {
    if (cpuEl) cpuEl.textContent = "Standalone";
    if (ramEl) ramEl.textContent = "Dock Active";
  }
  const guardModeEl = $("statGuardMode");
  const guardSubEl = $("statGuardSub");
  if (guardModeEl) {
    const isGuard = state?.settings?.guardEnabled !== false;
    guardModeEl.textContent = isGuard ? "50-60% Active" : "Standard";
    if (guardSubEl) {
      guardSubEl.textContent = isGuard ? "Hardware Protected" : "Normal Charging";
    }
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

  // Capability & Warning Banner check
  const warnBanner = $("alarmWarningBanner");
  const warnText = $("alarmWarningText");
  const fixBtn = $("btnFixAlarmPerm");
  if (warnBanner && window.AndroidBridge && typeof window.AndroidBridge.getCapabilities === "function") {
    try {
      const caps = JSON.parse(window.AndroidBridge.getCapabilities());
      if (!caps.canScheduleExactAlarms) {
        warnBanner.classList.remove("hidden");
        if (warnText) warnText.textContent = "Exact alarm permission disabled. Alarms may not ring on time.";
        if (fixBtn) fixBtn.onclick = () => window.AndroidBridge.openExactAlarmSettings();
      } else if (!caps.ignoringBatteryOptimizations) {
        warnBanner.classList.remove("hidden");
        if (warnText) warnText.textContent = "Battery optimization active. Dock may be put to sleep.";
        if (fixBtn) fixBtn.onclick = () => window.AndroidBridge.openBatteryOptimizationSettings();
      } else {
        warnBanner.classList.add("hidden");
      }
    } catch (e) {
      warnBanner.classList.add("hidden");
    }
  } else if (warnBanner) {
    warnBanner.classList.add("hidden");
  }

  if (alarms.length === 0) {
    ul.innerHTML = `
      <li class="alarm-item-card empty-card" style="text-align:center; padding:24px 16px;">
        <div style="color:var(--ink3); font-size:14px; margin-bottom:12px;">No alarms configured.</div>
        <button class="btn-tactile primary sm" type="button" onclick="openAddAlarmModal()">+ Add Your First Alarm</button>
      </li>
    `;
    return;
  }

  const is12h = (state?.settings?.timeFormat || "12h") === "12h";
  const solar = state?.solar;

  ul.innerHTML = alarms.map((alm, idx) => {
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
      <li class="alarm-item-card ${isAct ? 'active-alarm' : 'disabled'}" id="alarmItem-${idx}">
        <div class="alarm-time-tag">
          <div class="alarm-time-val">${esc(timeDisplay)}</div>
          <div class="alarm-tag-text">${esc(alm.tag || 'Alarm')}</div>
          <div class="alarm-card-meta" style="font-size:11px; color:var(--ink3); display:flex; gap:6px; margin-top:4px;">
            <span>${esc(typeLabel)}</span>
            <span>·</span>
            <span style="color:var(--pastel-sand); font-weight:600;">${esc(repeatLabel)}</span>
            <span>·</span>
            <span>${esc(alm.sound || 'homecoming.mp3')}</span>
          </div>
        </div>
        <div class="alarm-right-controls">
          <label class="toggle-switch" onclick="event.stopPropagation()">
            <input type="checkbox" ${isAct ? 'checked' : ''} onchange="window.toggleAlarmById('${alm.id}', this.checked)">
            <span class="toggle-slider"></span>
          </label>
          <button class="btn-del-alarm" type="button" onclick="window.deleteAlarmById('${alm.id}', event)" title="Delete Alarm">&#x2715;</button>
        </div>
      </li>
    `;
  }).join("");
}

function openAddAlarmModal() {
  const m = $("addAlarmModal");
  if (!m) return;
  m.classList.remove("hidden");
  m.setAttribute("aria-hidden", "false");
  $("alarmTagInput")?.focus();
}
window.openAddAlarmModal = openAddAlarmModal;

function closeAddAlarmModal() {
  const m = $("addAlarmModal");
  if (!m) return;
  m.classList.add("hidden");
  m.setAttribute("aria-hidden", "true");
}
window.closeAddAlarmModal = closeAddAlarmModal;

function onAlarmTypeChanged(type) {
  const fixedGrp = $("fixedTimeGroup");
  const offsetGrp = $("offsetTimeGroup");
  if (type === "fixed") {
    fixedGrp?.classList.remove("hidden");
    offsetGrp?.classList.add("hidden");
  } else {
    fixedGrp?.classList.add("hidden");
    offsetGrp?.classList.remove("hidden");
  }
}
window.onAlarmTypeChanged = onAlarmTypeChanged;

async function submitNewAlarm() {
  const type = $("alarmTypeInput")?.value || "fixed";
  const tag = $("alarmTagInput")?.value?.trim() || "Alarm";
  const time = $("alarmTimeInput")?.value || "07:00";
  const offset = parseInt($("alarmOffsetInput")?.value || "0", 10);
  
  const days = [];
  document.querySelectorAll('input[name="alarmDay"]:checked').forEach(cb => {
    days.push(parseInt(cb.value, 10));
  });
  
  const newAlarm = {
    type: type,
    tag: tag,
    time: time,
    offsetMinutes: offset,
    days: days,
    enabled: true,
    sound: "homecoming.mp3"
  };
  
  if (window.AndroidBridge && typeof window.AndroidBridge.addAlarm === "function") {
    window.AndroidBridge.addAlarm(JSON.stringify(newAlarm));
  } else {
    try {
      await fetch("/api/alarms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newAlarm)
      });
    } catch (e) {
      console.error("Add alarm error:", e);
    }
  }
  
  closeAddAlarmModal();
  $("addAlarmForm")?.reset();
  showToast("Alarm Created: " + tag);
  refresh();
}
window.submitNewAlarm = submitNewAlarm;

async function toggleAlarmById(id, enabled) {
  if (state?.alarms) {
    const alm = state.alarms.find(a => a.id === id);
    if (alm) alm.enabled = enabled;
  }
  renderAlarmsPage();
  showToast(`Alarm ${enabled ? 'Enabled' : 'Disabled'}`);
  
  if (window.AndroidBridge && typeof window.AndroidBridge.toggleAlarm === "function") {
    window.AndroidBridge.toggleAlarm(id);
  } else {
    try {
      await fetch(`/api/alarms/${id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: enabled })
      });
    } catch (e) {
      console.error("Toggle alarm error:", e);
    }
  }
}
window.toggleAlarmById = toggleAlarmById;

async function deleteAlarmById(id, event) {
  if (event) event.stopPropagation();
  if (state?.alarms) {
    state.alarms = state.alarms.filter(a => a.id !== id);
  }
  renderAlarmsPage();
  showToast("Alarm Deleted");
  
  if (window.AndroidBridge && typeof window.AndroidBridge.deleteAlarm === "function") {
    window.AndroidBridge.deleteAlarm(id);
  } else {
    try {
      await fetch(`/api/alarms/${id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ delete: true })
      });
    } catch (e) {
      console.error("Delete alarm error:", e);
    }
  }
}
window.deleteAlarmById = deleteAlarmById;

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
  if (alarms.length === 0) return;
  const alm = alarms[selectedAlarmIdx];
  toggleAlarmById(alm.id, !alm.enabled);
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

  // 6. NAVIGATION CHROME & ANTI-RETENTION MICRO-DRIFT
  try {
    const navMode = s.navMode || "both";
    document.body.classList.toggle("nav-buttons", navMode === "buttons");
    document.body.classList.toggle("nav-touch", navMode === "touch");

    const devLabel = $("sysDeviceLabel");
    if (devLabel) {
      devLabel.textContent = state?.device || "Universal Android Dock";
    }

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
  const video = $("mirrorVideo");
  const permCard = $("mirrorPermCard");
  const permMsg = $("mirrorPermMsg");
  const reqBtn = $("btnReqCameraPerm");

  // Check camera hardware & permission via bridge
  if (window.AndroidBridge) {
    let caps = null;
    try {
      caps = JSON.parse(window.AndroidBridge.getCapabilities());
    } catch (e) {}

    if (caps && !caps.hasFrontCamera && !caps.hasCamera) {
      if (video) video.classList.add("hidden");
      if (permCard) {
        permCard.classList.remove("hidden");
        if (permMsg) permMsg.textContent = "No front camera hardware detected on this device.";
        if (reqBtn) reqBtn.classList.add("hidden");
      }
      return;
    }

    if (typeof window.AndroidBridge.isCameraPermissionGranted === "function") {
      const granted = window.AndroidBridge.isCameraPermissionGranted();
      if (!granted) {
        if (video) video.classList.add("hidden");
        if (permCard) {
          permCard.classList.remove("hidden");
          if (permMsg) permMsg.textContent = "Desk Dock needs camera permission to display the live mirror viewfinder.";
          if (reqBtn) reqBtn.classList.remove("hidden");
        }
        return;
      }
    }
  }

  // Permission granted or web simulation
  if (permCard) permCard.classList.add("hidden");
  if (video) video.classList.remove("hidden");

  try {
    mirrorStream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 720 } },
      audio: false
    });
    if (video) video.srcObject = mirrorStream;
    if (window.AndroidBridge && typeof window.AndroidBridge.onMirrorActive === "function") {
      try { window.AndroidBridge.onMirrorActive(true); } catch (e) {}
    }
  } catch (err) {
    console.error("[Mirror] Camera error:", err);
    mirrorStream = null;
    if (permCard) {
      permCard.classList.remove("hidden");
      if (permMsg) permMsg.textContent = "Camera access unavailable (" + (err.message || err.name) + "). Tap to retry.";
      if (reqBtn) reqBtn.classList.remove("hidden");
    }
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

window.onCameraPermissionResult = function(granted) {
  if (granted) {
    showToast("Camera Permission Granted");
    startMirror();
  } else {
    showToast("Camera Permission Denied");
    const permCard = $("mirrorPermCard");
    const permMsg = $("mirrorPermMsg");
    if (permCard) permCard.classList.remove("hidden");
    if (permMsg) permMsg.textContent = "Camera permission was denied. Tap to retry or grant in System Settings.";
  }
};

function executeHardwareAction(btn, gesture) {
  // If navMode is set to Touch Only, suppress hardware button page cycling / actions in WebView
  if (state?.settings?.navMode === "touch") {
    return;
  }

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
        
      case 4: // Mirror page [5/7] — passive viewfinder
        if (gesture === "single" || gesture === "double") {
          goToPage(0);
        }
        break;

      case 5: // Telemetry & Power page [6/7]
        if (gesture === "single") {
          toggleChargeGuard();
        } else if (gesture === "double") {
          refresh();
          showToast("Telemetry Refreshed");
        } else if (gesture === "long") {
          sleepScreen();
        }
        break;

      case 6: // Settings Hub [7/7]
        if (gesture === "single") {
          showToast("Dock Settings");
        }
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

/* ---------- Countdown Advance Helper ---------- */
function advanceCountdown() {
  const cds = state?.settings?.countdowns;
  if (Array.isArray(cds) && cds.length > 1) {
    const first = cds.shift();
    cds.push(first);
    slot(now());
    showToast(`Countdown: ${cds[0].label}`);
  }
}

/* ---------- Touch & Swipe Navigation Engine ---------- */
let touchStartX = 0;
let touchStartY = 0;
let touchStartTime = 0;
let isSwiping = false;

window.addEventListener("touchstart", (e) => {
  if (e.touches.length !== 1) return;
  const t = e.touches[0];
  touchStartX = t.clientX;
  touchStartY = t.clientY;
  touchStartTime = Date.now();
  isSwiping = true;
}, { passive: true });

window.addEventListener("touchmove", (e) => {
  if (!isSwiping || e.touches.length !== 1) return;
  const t = e.touches[0];
  const dy = Math.abs(t.clientY - touchStartY);
  const dx = Math.abs(t.clientX - touchStartX);
  // Cancel swipe if user is predominantly scrolling vertically in lists
  if (dy > 45 && dy > dx * 1.4) {
    isSwiping = false;
  }
}, { passive: true });

window.addEventListener("touchend", (e) => {
  if (!isSwiping) return;
  isSwiping = false;
  const t = e.changedTouches[0];
  if (!t) return;
  const dx = t.clientX - touchStartX;
  const dy = t.clientY - touchStartY;
  const duration = Date.now() - touchStartTime;

  // Criteria: at least 45px horizontal displacement, dominant over vertical, within 750ms
  if (Math.abs(dx) >= 45 && Math.abs(dx) > Math.abs(dy) * 1.25 && duration < 750) {
    if (dx < 0) {
      switchPage(1); // Swipe left -> Next Page
    } else {
      switchPage(-1); // Swipe right -> Previous Page
    }
  }
}, { passive: true });

/* ---------- Minimal App Drawer Engine ---------- */
let installedAppsCache = [];

function openAppDrawer() {
  const modal = $("appDrawerModal");
  if (!modal) return;
  modal.classList.remove("hidden");
  modal.setAttribute("aria-hidden", "false");
  const searchInput = $("appSearchInput");
  if (searchInput) {
    searchInput.value = "";
    setTimeout(() => searchInput.focus(), 100);
  }
  
  if (window.AndroidBridge && typeof window.AndroidBridge.getInstalledApps === "function") {
    try {
      const json = window.AndroidBridge.getInstalledApps();
      installedAppsCache = JSON.parse(json);
    } catch (e) {
      console.error("Failed to load installed apps:", e);
      installedAppsCache = [];
    }
  } else {
    // Development / Browser simulation apps
    installedAppsCache = [
      { package: "com.android.settings", label: "Settings" },
      { package: "com.android.chrome", label: "Browser" },
      { package: "com.google.android.calculator", label: "Calculator" },
      { package: "com.google.android.calendar", label: "Calendar" },
      { package: "com.google.android.apps.photos", label: "Photos" }
    ];
  }
  renderAppDrawer(installedAppsCache);
}
window.openAppDrawer = openAppDrawer;

function closeAppDrawer() {
  const modal = $("appDrawerModal");
  if (!modal) return;
  modal.classList.add("hidden");
  modal.setAttribute("aria-hidden", "true");
}
window.closeAppDrawer = closeAppDrawer;

function renderAppDrawer(apps) {
  const grid = $("appDrawerGrid");
  if (!grid) return;
  if (!apps || apps.length === 0) {
    grid.innerHTML = `<div class="app-drawer-empty" style="color:var(--ink3); text-align:center; padding:32px 16px;">No matching applications found.</div>`;
    return;
  }
  grid.innerHTML = apps.map(app => `
    <div class="app-item-card" role="button" tabindex="0" onclick="window.launchAppItem('${esc(app.package)}')">
      <div class="app-item-icon">${esc((app.label || "?").charAt(0).toUpperCase())}</div>
      <div class="app-item-label">${esc(app.label || app.package)}</div>
    </div>
  `).join("");
}

function filterAppDrawer(query) {
  const q = (query || "").trim().toLowerCase();
  if (!q) {
    renderAppDrawer(installedAppsCache);
    return;
  }
  const filtered = installedAppsCache.filter(app =>
    (app.label && app.label.toLowerCase().includes(q)) ||
    (app.package && app.package.toLowerCase().includes(q))
  );
  renderAppDrawer(filtered);
}
window.filterAppDrawer = filterAppDrawer;

function launchAppItem(pkg) {
  if (window.AndroidBridge && typeof window.AndroidBridge.launchApp === "function") {
    window.AndroidBridge.launchApp(pkg);
  } else {
    showToast(`Launching ${pkg} (Simulated)`);
  }
  closeAppDrawer();
}
window.launchAppItem = launchAppItem;

/* ---------- On-Device Settings Hub Engine (Page 7) ---------- */
function updateSettingsPage() {
  // 1. Launcher Status
  const badge = $("launcherStatusBadge");
  const detail = $("launcherStatusDetail");
  const btnSet = $("btnSetAsLauncher");
  const btnSwitch = $("btnSwitchLauncher");

  if (window.AndroidBridge && typeof window.AndroidBridge.isDefaultLauncher === "function") {
    const isDef = window.AndroidBridge.isDefaultLauncher();
    const curLauncherName = typeof window.AndroidBridge.getDefaultLauncherName === "function"
      ? window.AndroidBridge.getDefaultLauncherName()
      : (isDef ? "Desk Dock" : "Stock Launcher");

    if (badge) {
      badge.textContent = isDef ? "Default Launcher (Active)" : "Not Default";
      badge.className = "status-badge " + (isDef ? "active badge-active" : "badge-warn");
    }
    if (detail) {
      if (isDef) {
        detail.textContent = "Desk Dock is currently active as your primary Android home launcher. Tap switch below to return to your stock home screen anytime.";
      } else {
        detail.innerHTML = `Current system launcher: <b>${esc(curLauncherName)}</b>. Set Desk Dock as default to turn your phone into a dedicated glanceable desk timepiece.`;
      }
    }
    if (btnSet) {
      btnSet.textContent = isDef ? "Default Launcher (Active)" : "Set as Default Launcher";
      btnSet.disabled = isDef;
      btnSet.style.display = isDef ? "none" : "inline-block";
    }
    if (btnSwitch) {
      btnSwitch.textContent = isDef ? "Switch to Stock Launcher" : "Change System Launcher";
      btnSwitch.style.display = "inline-block";
    }
  } else if (badge) {
    badge.textContent = "Web Simulation";
    if (detail) detail.textContent = "Running in simulated browser environment.";
  }

  // 1b. Battery Optimization & Background Execution
  const battBadge = $("batteryStatusBadge");
  const battDetail = $("batteryStatusDetail");
  const btnBatt = $("btnBatteryOpt");
  if (window.AndroidBridge && typeof window.AndroidBridge.isIgnoringBatteryOptimizations === "function") {
    const isIgnored = window.AndroidBridge.isIgnoringBatteryOptimizations();
    if (battBadge) {
      battBadge.textContent = isIgnored ? "Unrestricted ✓" : "Optimized (Restricted)";
      battBadge.className = "status-badge " + (isIgnored ? "active badge-active" : "badge-warn");
    }
    if (battDetail) {
      battDetail.textContent = isIgnored
        ? "Battery optimization is disabled. Background alarms, clock sync, and server run uninterrupted."
        : "Android battery optimization is active. The system may freeze the clock and alarms when idle.";
    }
    if (btnBatt) {
      btnBatt.textContent = isIgnored ? "Configured" : "Disable Optimization";
    }
  }

  // 2. Fullscreen & Screen Timeout & Display Type
  const fsToggle = $("settingFullscreenToggle");
  if (fsToggle) {
    fsToggle.checked = state?.settings?.immersive !== false;
  }
  const toSel = $("settingTimeoutSel");
  if (toSel && state?.settings?.screenTimeoutSec) {
    toSel.value = String(state.settings.screenTimeoutSec);
  }
  const dtSel = $("settingDisplayType");
  if (dtSel && state?.settings?.displayType) {
    dtSel.value = state.settings.displayType;
  }

  // 3. Theme & Scene Selection
  const curScene = state?.settings?.scene || "desk";
  document.querySelectorAll(".btn-theme-opt").forEach(btn => {
    btn.classList.toggle("active", btn.dataset.scene === curScene);
  });

  // 4. Clock 12h/24h Format
  const is12h = (state?.settings?.timeFormat || "12h") === "12h";
  $("btnFmt12h")?.classList.toggle("active", is12h);
  $("btnFmt24h")?.classList.toggle("active", !is12h);

  // 5. Location
  const locLbl = $("settingLocationLabel");
  if (locLbl) {
    const s = state?.settings;
    if (s?.cityName) {
      locLbl.textContent = `${s.cityName} (${(s.lat || 0).toFixed(2)}, ${(s.lon || 0).toFixed(2)})`;
    } else if (s?.lat && s?.lon) {
      locLbl.textContent = `${s.lat.toFixed(2)}, ${s.lon.toFixed(2)}`;
    } else {
      locLbl.textContent = "Auto-Detecting Location...";
    }
  }

  // 6. Night Mode
  const nmToggle = $("settingNightModeToggle");
  if (nmToggle) {
    nmToggle.checked = state?.settings?.nightModeEnabled !== false;
  }
  const nmStart = $("settingNightStart");
  if (nmStart) {
    nmStart.value = state?.settings?.nightStart || "23:00";
  }
  const nmEnd = $("settingNightEnd");
  if (nmEnd) {
    nmEnd.value = state?.settings?.nightEnd || "06:00";
  }

  // 7. Navigation Mode
  const navSel = $("settingNavMode");
  if (navSel) {
    navSel.value = state?.settings?.navMode || "touch";
  }

  // 8. Hub URL
  const hubUrl = $("settingHubUrl");
  if (hubUrl) {
    const origin = window.location.origin;
    hubUrl.textContent = origin.startsWith("file:") ? "http://localhost:8080" : origin;
  }
}
window.updateSettingsPage = updateSettingsPage;

function selectThemeScene(sceneName) {
  if (state?.settings) {
    state.settings.scene = sceneName;
  }
  document.querySelectorAll(".btn-theme-opt").forEach(btn => {
    btn.classList.toggle("active", btn.dataset.scene === sceneName);
  });
  fetch("/api/settings", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ scene: sceneName })
  }).catch(() => {});
  showToast("Theme: " + sceneName.charAt(0).toUpperCase() + sceneName.slice(1));
  render();
}
window.selectThemeScene = selectThemeScene;

function setClockFormat(fmt) {
  if (state?.settings) {
    state.settings.timeFormat = fmt;
  }
  $("btnFmt12h")?.classList.toggle("active", fmt === "12h");
  $("btnFmt24h")?.classList.toggle("active", fmt === "24h");
  fetch("/api/settings", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ timeFormat: fmt })
  }).catch(() => {});
  showToast(`Clock Format: ${fmt}`);
  render();
}
window.setClockFormat = setClockFormat;

function toggleImmersiveFullscreen(checked) {
  if (state?.settings) {
    state.settings.immersive = checked;
  }
  if (window.AndroidBridge && typeof window.AndroidBridge.toggleFullscreen === "function") {
    window.AndroidBridge.toggleFullscreen(checked);
  }
  fetch("/api/settings", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ immersive: checked })
  }).catch(() => {});
  showToast(checked ? "Immersive Fullscreen: Enabled" : "System Bars: Visible");
}
window.toggleImmersiveFullscreen = toggleImmersiveFullscreen;

function updateDisplayType(val) {
  if (state?.settings) state.settings.displayType = val;
  fetch("/api/settings", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ displayType: val })
  }).catch(() => {});
  showToast(`Display Type: ${val.toUpperCase()}`);
}
window.updateDisplayType = updateDisplayType;

function updateScreenTimeout(sec) {
  if (state?.settings) state.settings.screenTimeoutSec = sec;
  fetch("/api/settings", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ screenTimeoutSec: sec })
  }).catch(() => {});
  showToast(`Sleep Timeout: ${sec >= 60 ? (sec / 60) + ' min' : sec + ' sec'}`);
}
window.updateScreenTimeout = updateScreenTimeout;

function updateNavMode(val) {
  if (state?.settings) state.settings.navMode = val;
  fetch("/api/settings", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ navMode: val })
  }).catch(() => {});
  showToast(`Navigation: ${val.charAt(0).toUpperCase() + val.slice(1)}`);
}
window.updateNavMode = updateNavMode;

function toggleNightMode(enabled) {
  if (state?.settings) {
    state.settings.nightMode = enabled;
    state.settings.nightModeEnabled = enabled;
  }
  fetch("/api/settings", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ nightMode: enabled, nightModeEnabled: enabled })
  }).catch(() => {});
  showToast(`Night Mode: ${enabled ? 'Enabled' : 'Disabled'}`);
}
window.toggleNightMode = toggleNightMode;

function updateNightTimes() {
  const startVal = $("settingNightStart")?.value || "23";
  const endVal = $("settingNightEnd")?.value || "6";
  const startHour = parseInt(startVal.split(":")[0], 10) || 23;
  const endHour = parseInt(endVal.split(":")[0], 10) || 6;
  if (state?.settings) {
    state.settings.nightStart = startHour;
    state.settings.nightEnd = endHour;
  }
  fetch("/api/settings", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ nightStart: startHour, nightEnd: endHour })
  }).catch(() => {});
  showToast(`Night Schedule: ${pad(startHour)}:00 - ${pad(endHour)}:00`);
}
window.updateNightTimes = updateNightTimes;

async function exportDiagnostics() {
  let caps = {};
  if (window.AndroidBridge?.getCapabilities) {
    try { caps = JSON.parse(window.AndroidBridge.getCapabilities()); } catch (e) {}
  }
  const report = {
    timestamp: new Date().toISOString(),
    userAgent: navigator.userAgent,
    screen: {
      width: window.innerWidth,
      height: window.innerHeight,
      pixelRatio: window.devicePixelRatio
    },
    capabilities: caps,
    settings: state?.settings || {},
    battery: state?.battery || {},
    alarmsCount: state?.alarms?.length || 0,
    tasksCount: state?.tasks?.length || 0,
    solar: state?.solar || {}
  };
  const jsonStr = JSON.stringify(report, null, 2);
  try {
    if (navigator.clipboard) {
      await navigator.clipboard.writeText(jsonStr);
      showToast("Diagnostics Copied to Clipboard");
    } else {
      console.log("[Diagnostics]", jsonStr);
      showToast("Diagnostics Logged to Console");
    }
  } catch (e) {
    showToast("Report Generated (Logged to Console)");
    console.log("[Diagnostics]", jsonStr);
  }
}
window.exportDiagnostics = exportDiagnostics;

/* ---------- Touch UI & Action Buttons Initializer ---------- */
function setupTouchUI() {
  $("navBtnPrev")?.addEventListener("click", () => switchPage(-1));
  $("navBtnNext")?.addEventListener("click", () => switchPage(1));
  $("pageBadge")?.addEventListener("click", () => switchPage(1));
  $("btnNavSettings")?.addEventListener("click", () => goToPage(6));
  $("btnNavDrawer")?.addEventListener("click", () => openAppDrawer());
  $("page-mirror")?.addEventListener("click", () => goToPage(0));

  // Dismiss Alarm touch listener on full-screen overlay
  $("alarmDismissBox")?.addEventListener("click", () => {
    if (state?.isAlarmRinging) {
      if (window.AndroidBridge && window.AndroidBridge.dismissAlarm) {
        window.AndroidBridge.dismissAlarm();
      } else {
        fetch("/api/alarms/dismiss", { method: "POST" }).catch(() => {});
      }
      hideAlarmOverlay();
      showToast("Alarm Dismissed");
    }
  });

  // Alarms Page actions
  $("btnOpenAddAlarm")?.addEventListener("click", openAddAlarmModal);

  // Focus Timer actions
  $("btnTouchFocusStart")?.addEventListener("click", toggleFocusTimer);
  $("btnTouchFocusReset")?.addEventListener("click", resetFocusTimer);
  $("focusDigits")?.addEventListener("click", toggleFocusTimer);
  document.querySelectorAll(".btn-preset").forEach(btn => {
    btn.addEventListener("click", () => {
      const preset = parseInt(btn.dataset.preset, 10);
      setFocusPreset(preset);
    });
  });

  // Tasks Page actions
  $("btnTouchTaskClear")?.addEventListener("click", clearCompletedTasks);

  // Telemetry Page actions
  $("btnTouchStatsRefresh")?.addEventListener("click", () => { refresh(); showToast("Telemetry Refreshed"); });

  // Mirror Page actions
  $("btnReqCameraPerm")?.addEventListener("click", () => {
    if (window.AndroidBridge && typeof window.AndroidBridge.requestCameraPermission === "function") {
      window.AndroidBridge.requestCameraPermission();
    } else {
      startMirror();
    }
  });

  // Settings Page actions
  $("btnSetAsLauncher")?.addEventListener("click", () => {
    if (window.AndroidBridge && typeof window.AndroidBridge.openHomeLauncherSettings === "function") {
      window.AndroidBridge.openHomeLauncherSettings();
    } else {
      showToast("Home Launcher Settings (Bridge only)");
    }
  });
  $("btnSwitchLauncher")?.addEventListener("click", () => {
    if (window.AndroidBridge && typeof window.AndroidBridge.openLauncherChooser === "function") {
      window.AndroidBridge.openLauncherChooser();
    } else {
      showToast("Stock Launcher Chooser (Bridge only)");
    }
  });
  $("btnFmt12h")?.addEventListener("click", () => setClockFormat("12h"));
  $("btnFmt24h")?.addEventListener("click", () => setClockFormat("24h"));
  $("settingNightModeToggle")?.addEventListener("change", (e) => toggleNightMode(e.target.checked));
  $("settingNightStart")?.addEventListener("change", updateNightTimes);
  $("settingNightEnd")?.addEventListener("change", updateNightTimes);
  $("btnCopyHubUrl2")?.addEventListener("click", () => {
    const url = $("settingHubUrl")?.textContent;
    if (url && navigator.clipboard) {
      navigator.clipboard.writeText(url).then(() => showToast("Copied Hub URL")).catch(() => {});
    }
  });
  document.querySelectorAll(".btn-theme-opt").forEach(btn => {
    btn.addEventListener("click", () => {
      selectThemeScene(btn.dataset.scene);
    });
  });

  // Clock Dashboard interactive clicks
  $("slot")?.addEventListener("click", advanceCountdown);
  // Weather click refreshes weather data - DO NOT CYCLE SCENE
  $("wxNow")?.addEventListener("click", () => {
    loadWeather();
    showToast("Weather Refreshed");
  });

  // Settings Page system background & permission actions
  $("btnBatteryOpt")?.addEventListener("click", () => {
    if (window.AndroidBridge && typeof window.AndroidBridge.openBatteryOptimizationSettings === "function") {
      window.AndroidBridge.openBatteryOptimizationSettings();
    } else {
      showToast("Battery Optimization Settings (Bridge only)");
    }
  });
  $("btnAutoStart")?.addEventListener("click", () => {
    if (window.AndroidBridge && typeof window.AndroidBridge.openAutoStartSettings === "function") {
      window.AndroidBridge.openAutoStartSettings();
    } else {
      showToast("Auto-Start Settings (Bridge only)");
    }
  });
  $("btnAppInfo")?.addEventListener("click", () => {
    if (window.AndroidBridge && typeof window.AndroidBridge.openAppDetailsSettings === "function") {
      window.AndroidBridge.openAppDetailsSettings();
    } else {
      showToast("App Details Settings (Bridge only)");
    }
  });

  // First-Run Onboarding Modal actions
  $("btnFirstRunSetLauncher")?.addEventListener("click", () => {
    if (window.AndroidBridge && typeof window.AndroidBridge.openHomeLauncherSettings === "function") {
      window.AndroidBridge.openHomeLauncherSettings();
    } else {
      showToast("Home Launcher Settings (Bridge only)");
    }
  });
  $("btnFirstRunKeepLauncher")?.addEventListener("click", () => {
    showToast("Stock Launcher Kept");
    dismissFirstRunModal();
  });
  $("btnFirstRunBatteryOpt")?.addEventListener("click", () => {
    if (window.AndroidBridge && typeof window.AndroidBridge.openBatteryOptimizationSettings === "function") {
      window.AndroidBridge.openBatteryOptimizationSettings();
    } else {
      showToast("Battery Optimization Settings (Bridge only)");
    }
  });
  $("btnFirstRunAutoStart")?.addEventListener("click", () => {
    if (window.AndroidBridge && typeof window.AndroidBridge.openAutoStartSettings === "function") {
      window.AndroidBridge.openAutoStartSettings();
    } else {
      showToast("Auto-Start Settings (Bridge only)");
    }
  });
  $("btnFirstRunDismiss")?.addEventListener("click", () => {
    dismissFirstRunModal();
  });

  initSetupWizardListeners();
  checkFirstRunPrompt();
}
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", setupTouchUI);
} else {
  setupTouchUI();
}

/* Back button handler for Android Daily Driver mode */
window.onBackPressed = function() {
  if (activePage !== 0) {
    goToPage(0);
    return true; // Page was reset to 0, consume event
  }
  return false; // Already on dashboard, let Android move task to back
};

/* ---------- First-Run Onboarding & Permissions Engine ---------- */
function checkFirstRunPrompt() {
  if (!window.AndroidBridge) return;
  const isDismissed = typeof window.AndroidBridge.isFirstRunPromptDismissed === "function"
    ? window.AndroidBridge.isFirstRunPromptDismissed()
    : false;
  if (isDismissed) return;

  setTimeout(() => {
    openFirstRunModal();
  }, 450);
}
window.checkFirstRunPrompt = checkFirstRunPrompt;

function openFirstRunModal() {
  const m = $("firstRunModal");
  if (!m) return;
  m.classList.remove("hidden");
  m.setAttribute("aria-hidden", "false");
  updateFirstRunModalState();
}
window.openFirstRunModal = openFirstRunModal;

function dismissFirstRunModal() {
  const m = $("firstRunModal");
  if (m) {
    m.classList.add("hidden");
    m.setAttribute("aria-hidden", "true");
  }
  if (window.AndroidBridge && typeof window.AndroidBridge.dismissFirstRunPrompt === "function") {
    window.AndroidBridge.dismissFirstRunPrompt();
  }
}
window.dismissFirstRunModal = dismissFirstRunModal;

function updateFirstRunModalState() {
  if (!window.AndroidBridge) return;

  // 1. Launcher State
  const lBadge = $("firstRunLauncherBadge");
  const lCurrent = $("firstRunCurrentLauncher");
  const btnSet = $("btnFirstRunSetLauncher");
  const isDef = typeof window.AndroidBridge.isDefaultLauncher === "function"
    ? window.AndroidBridge.isDefaultLauncher()
    : false;
  const defName = typeof window.AndroidBridge.getDefaultLauncherName === "function"
    ? window.AndroidBridge.getDefaultLauncherName()
    : (isDef ? "Desk Dock" : "Stock Launcher");

  if (lBadge) {
    lBadge.textContent = isDef ? "Default Launcher (Active)" : "Not Default";
    lBadge.className = "status-badge " + (isDef ? "active badge-active" : "badge-warn");
  }
  if (lCurrent) {
    lCurrent.innerHTML = isDef
      ? `Desk Dock is active as your home screen.`
      : `Current default: <b>${esc(defName)}</b>`;
  }
  if (btnSet) {
    btnSet.textContent = isDef ? "Default Launcher (Active)" : "Set as Default Launcher";
    btnSet.disabled = isDef;
    btnSet.classList.toggle("disabled", isDef);
  }

  // 2. Battery Optimization
  const bBadge = $("firstRunBatteryBadge");
  const btnBatt = $("btnFirstRunBatteryOpt");
  const isIgnored = typeof window.AndroidBridge.isIgnoringBatteryOptimizations === "function"
    ? window.AndroidBridge.isIgnoringBatteryOptimizations()
    : false;

  if (bBadge) {
    bBadge.textContent = isIgnored ? "Unrestricted ✓" : "Optimized (Restricted)";
    bBadge.className = "status-badge " + (isIgnored ? "active badge-active" : "badge-warn");
  }
  if (btnBatt) {
    btnBatt.textContent = isIgnored ? "Configured (Unrestricted)" : "Disable Battery Optimization";
  }
}
window.updateFirstRunModalState = updateFirstRunModalState;

window.onSystemStateChanged = function() {
  updateSettingsPage();
  updateFirstRunModalState();
};

/* ---------- Universal Setup Wizard Engine ---------- */
let currentSetupStep = 1;
const TOTAL_SETUP_STEPS = 4;

function openSetupWizard() {
  currentSetupStep = 1;
  updateSetupWizardView();
  const w = $("setupWizard");
  if (w) {
    w.classList.remove("hidden");
    w.setAttribute("aria-hidden", "false");
  }
}
window.openSetupWizard = openSetupWizard;

function closeSetupWizard() {
  const w = $("setupWizard");
  if (w) {
    w.classList.add("hidden");
    w.setAttribute("aria-hidden", "true");
  }
}

function updateSetupWizardView() {
  for (let i = 1; i <= TOTAL_SETUP_STEPS; i++) {
    const s = $(`setupStep${i}`);
    if (s) s.classList.toggle("active", i === currentSetupStep);
  }
  const dots = $("setupDots")?.querySelectorAll("i");
  if (dots) {
    dots.forEach((dot, idx) => dot.classList.toggle("on", idx === currentSetupStep - 1));
  }
  const prevBtn = $("btnSetupPrev");
  const nextBtn = $("btnSetupNext");
  if (prevBtn) prevBtn.classList.toggle("disabled", currentSetupStep === 1);
  if (nextBtn) nextBtn.textContent = currentSetupStep === TOTAL_SETUP_STEPS ? "Finish Setup" : "Next Step";

  const titles = [
    "Operation Mode",
    "Navigation Mode",
    "PC Control Hub Access",
    "Air Wave & Proximity"
  ];
  if ($("setupStepTitle")) $("setupStepTitle").textContent = titles[currentSetupStep - 1];

  if (currentSetupStep === 3) {
    renderSetupHubInfo();
  }
}

function renderSetupHubInfo() {
  const token = state?.token || state?.settings?.token || "••••••••";
  const host = location.hostname || "127.0.0.1";
  const port = location.port || "8000";
  const url = `http://${host}:${port}/control/?token=${token}`;
  const urlEl = $("setupHubUrl");
  if (urlEl) urlEl.textContent = url;

  const qrBox = $("setupQrCode");
  if (qrBox) {
    qrBox.innerHTML = generateMiniQrSvg(url);
  }
}

function generateMiniQrSvg(text) {
  let hash = 0;
  for (let i = 0; i < text.length; i++) hash = ((hash << 5) - hash) + text.charCodeAt(i);
  let rects = "";
  const size = 9;
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      const bit = ((hash ^ (r * 13 + c * 7)) & (1 << ((r + c) % 8))) !== 0;
      const isCorner = (r < 3 && c < 3) || (r < 3 && c > 5) || (r > 5 && c < 3);
      if (isCorner || bit) {
        rects += `<rect x="${c * 10 + 10}" y="${r * 10 + 10}" width="8" height="8" fill="#CBB79F" />`;
      }
    }
  }
  return `<svg viewBox="0 0 110 110" xmlns="http://www.w3.org/2000/svg">${rects}</svg>`;
}

function initSetupWizardListeners() {
  $("btnSkipSetup")?.addEventListener("click", () => {
    closeSetupWizard();
    saveSetupPreferences(true);
  });
  $("btnSetupPrev")?.addEventListener("click", () => {
    if (currentSetupStep > 1) {
      currentSetupStep--;
      updateSetupWizardView();
    }
  });
  $("btnSetupNext")?.addEventListener("click", () => {
    if (currentSetupStep < TOTAL_SETUP_STEPS) {
      currentSetupStep++;
      updateSetupWizardView();
    } else {
      closeSetupWizard();
      saveSetupPreferences(true);
      showToast("Setup Completed!");
    }
  });
  $("btnCopyHubUrl")?.addEventListener("click", () => {
    const url = $("setupHubUrl")?.textContent;
    if (url && navigator.clipboard) {
      navigator.clipboard.writeText(url).then(() => showToast("Copied Hub URL")).catch(() => {});
    }
  });

  document.querySelectorAll('input[name="setupOpMode"]').forEach(r => {
    r.addEventListener("change", (e) => {
      document.querySelectorAll('#setupStep1 .setup-opt').forEach(opt => opt.classList.remove("active"));
      e.target.closest(".setup-opt")?.classList.add("active");
    });
  });
  document.querySelectorAll('input[name="setupNavMode"]').forEach(r => {
    r.addEventListener("change", (e) => {
      document.querySelectorAll('#setupStep2 .setup-opt').forEach(opt => opt.classList.remove("active"));
      e.target.closest(".setup-opt")?.classList.add("active");
    });
  });
}

async function saveSetupPreferences(complete = true) {
  const opMode = document.querySelector('input[name="setupOpMode"]:checked')?.value || "dock";
  const navMode = document.querySelector('input[name="setupNavMode"]:checked')?.value || "both";
  
  if (state?.settings) {
    state.settings.operationMode = opMode;
    state.settings.navMode = navMode;
    state.settings.setupComplete = complete;
  }
  
  try {
    await fetch("/api/settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        operationMode: opMode,
        navMode: navMode,
        setupComplete: complete
      })
    });
  } catch (e) {}
}

window.onProximityUpdate = function(dist, near, lux) {
  const distEl = $("setupSensorDist");
  const luxEl = $("setupSensorLux");
  const fill = $("setupSensorFill");
  if (distEl) distEl.textContent = dist >= 0 ? `${dist.toFixed(1)} cm (${near ? "NEAR" : "FAR"})` : "--";
  if (luxEl) luxEl.textContent = lux >= 0 ? `${Math.round(lux)} lux` : "--";
  if (fill) {
    const pct = near ? 100 : Math.max(10, Math.min(100, Math.round((lux / 100) * 100)));
    fill.style.width = pct + "%";
    fill.style.backgroundColor = near ? "var(--pastel-sand)" : "var(--pastel-sage)";
  }
};
