// ── Config ──────────────────────────────────────────────────────────
const BACKEND_WS   = `ws://${location.hostname}:3000`;
const BACKEND_HTTP = `http://${location.hostname}:3000`;
const PRINTER_POLL_INTERVAL = 10000; // ms

// ── State ───────────────────────────────────────────────────────────
let cameras    = [];
let motionState = {};
let alertTimeout = null;
let MOTION_CLEAR_DELAY = 8000; // ms — overridden by /api/config/ui

// WebSocket reconnect state
let ws = null;
let wsReconnectDelay = 1000; // ms, doubles on each failure, max 30s

// Print completion tracking
const printerPrevState = {};

// ── Init ─────────────────────────────────────────────────────────────
async function init() {
  // Load UI config (motion delay etc.)
  try {
    const uiCfg = await fetch(`${BACKEND_HTTP}/api/config/ui`).then(r => r.json());
    if (uiCfg.motion_clear_delay_ms) MOTION_CLEAR_DELAY = uiCfg.motion_clear_delay_ms;
  } catch (_) {}

  cameras = await fetch(`${BACKEND_HTTP}/api/cameras`).then(r => r.json()).catch(() => []);
  renderPiP();
  connectWebSocket();
  pollPrinters();
  setInterval(pollPrinters, PRINTER_POLL_INTERVAL);
}

// ── Camera PiP (corner thumbnails) ───────────────────────────────────
function renderPiP() {
  const container = document.getElementById('camera-pip-container');
  container.innerHTML = '';
  cameras.forEach(cam => {
    const wrap = document.createElement('div');
    wrap.className = 'camera-pip';
    wrap.dataset.camId = cam.id;
    wrap.innerHTML = `
      <img src="http://${location.hostname}:${cam.stream_port}" alt="${cam.name}">
      <div class="camera-pip-label">${cam.name}</div>
    `;
    container.appendChild(wrap);
  });
}

// ── Motion Alert View ─────────────────────────────────────────────────
function renderAlertView() {
  const activeCams = cameras.filter(c => motionState[c.id]);
  const grid = document.getElementById('camera-grid-alert');
  grid.innerHTML = '';

  activeCams.forEach(cam => {
    const cell = document.createElement('div');
    cell.className = 'camera-alert-cell motion-active';
    cell.innerHTML = `
      <img src="http://${location.hostname}:${cam.stream_port}" alt="${cam.name}">
      <div class="camera-alert-label">${cam.name}</div>
    `;
    grid.appendChild(cell);
  });
}

function showAlertView() {
  document.getElementById('dashboard').classList.add('hidden');
  document.getElementById('camera-alert-view').classList.remove('hidden');
  document.getElementById('motion-banner').classList.remove('hidden');
  renderAlertView();
}

function showDashboard() {
  document.getElementById('camera-alert-view').classList.add('hidden');
  document.getElementById('motion-banner').classList.add('hidden');
  document.getElementById('dashboard').classList.remove('hidden');
}

function onMotionUpdate() {
  const anyActive = Object.values(motionState).some(Boolean);

  // Highlight active PiP cameras
  document.querySelectorAll('.camera-pip').forEach(pip => {
    const id = parseInt(pip.dataset.camId);
    pip.classList.toggle('motion-active', !!motionState[id]);
  });

  if (anyActive) {
    clearTimeout(alertTimeout);
    showAlertView();
  } else {
    // Delay return to dashboard so brief gaps don't flicker
    clearTimeout(alertTimeout);
    alertTimeout = setTimeout(showDashboard, MOTION_CLEAR_DELAY);
  }
}

// ── WebSocket ─────────────────────────────────────────────────────────
function connectWebSocket() {
  ws = new WebSocket(BACKEND_WS);

  ws.onopen = () => {
    wsReconnectDelay = 1000; // reset backoff on successful connection
  };

  ws.onmessage = (ev) => {
    const msg = JSON.parse(ev.data);

    if (msg.type === 'state') {
      motionState = msg.motionState || {};
      onMotionUpdate();
    } else if (msg.type === 'motion') {
      motionState = msg.motionState || {};
      onMotionUpdate();
    }
  };

  ws.onclose = () => {
    const delay = wsReconnectDelay + Math.random() * 1000;
    wsReconnectDelay = Math.min(wsReconnectDelay * 2, 30000);
    setTimeout(connectWebSocket, delay);
  };

  ws.onerror = () => {
    if (ws.readyState !== WebSocket.CLOSING && ws.readyState !== WebSocket.CLOSED) {
      ws.close();
    }
  };
}

// ── Print Completion Alert ────────────────────────────────────────────
function triggerCompletionAlert(printerId, filename) {
  const banner = document.getElementById('print-complete-banner');
  const label = document.getElementById('print-complete-label');
  const name = printerId === 'crx' ? 'CRX-Pro' : 'K2';
  label.textContent = `${name} — Druck fertig${filename ? ': ' + filename : ''}`;
  banner.classList.remove('hidden');

  // Web Audio: short chime via oscillator (no audio file needed)
  try {
    const ctx = new AudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.frequency.value = 880;
    gain.gain.setValueAtTime(0.4, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.6);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.6);
  } catch (_) {}

  const dismiss = () => banner.classList.add('hidden');
  banner.onclick = dismiss;
  setTimeout(dismiss, 10000);
}

// ── Printer Polling ───────────────────────────────────────────────────
async function pollPrinters() {
  const data = await fetch(`${BACKEND_HTTP}/api/printers`).then(r => r.json()).catch(() => null);
  if (!data) return;

  updatePrinterCard('crx', data.crx_pro);
  updatePrinterCard('k2',  data.k2);
}

function updatePrinterCard(id, printer) {
  const dot      = document.getElementById(`${id}-dot`);
  const state    = document.getElementById(`${id}-state`);
  const filename = document.getElementById(`${id}-filename`);
  const progress = document.getElementById(`${id}-progress`);
  const hotend   = document.getElementById(`${id}-hotend`);
  const bed      = document.getElementById(`${id}-bed`);
  const eta      = document.getElementById(`${id}-eta`);

  if (!printer || !printer.online) {
    dot.className = 'printer-status-dot offline';
    state.textContent = 'Offline';
    filename.textContent = '';
    progress.style.width = '0%';
    hotend.textContent = '—';
    bed.textContent = '—';
    eta.textContent = '';
    printerPrevState[id] = null;
    return;
  }

  // Detect print completion transition
  const prevState = printerPrevState[id];
  const newState = printer.state || '';
  if (prevState && /printing|running|druckt/i.test(prevState) && /complete|operational|fertig/i.test(newState)) {
    triggerCompletionAlert(id, printer.filename);
  }
  printerPrevState[id] = newState;

  dot.className = 'printer-status-dot online';
  state.textContent = capitalise(newState);
  filename.textContent = printer.filename || '';
  progress.style.width = `${Math.round((printer.progress || 0) * 100)}%`;

  const t = printer.temps || {};
  hotend.textContent = t.hotend != null
    ? `${Math.round(t.hotend)}°C / ${Math.round(t.hotend_target || 0)}°C` : '—';
  bed.textContent = t.bed != null
    ? `${Math.round(t.bed)}°C / ${Math.round(t.bed_target || 0)}°C` : '—';

  // ETA display
  if (printer.print_time_left > 0) {
    const pct = Math.round((printer.progress || 0) * 100);
    const h = Math.floor(printer.print_time_left / 3600);
    const m = Math.floor((printer.print_time_left % 3600) / 60);
    eta.textContent = `${pct}% · ~${h}:${String(m).padStart(2, '0')} übrig`;
  } else {
    eta.textContent = '';
  }
}

function capitalise(s) {
  if (!s) return '';
  return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
}

// ── Start ─────────────────────────────────────────────────────────────
init();
