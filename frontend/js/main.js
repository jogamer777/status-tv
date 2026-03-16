// ── Config ──────────────────────────────────────────────────────────
const BACKEND_WS   = `ws://${location.hostname}:3000`;
const BACKEND_HTTP = `http://${location.hostname}:3000`;
const PRINTER_POLL_INTERVAL = 10000; // ms

// ── State ───────────────────────────────────────────────────────────
let cameras    = [];
let motionState = {};
let alertTimeout = null;
const MOTION_CLEAR_DELAY = 8000; // ms after last motion event before returning to dashboard

// ── Init ─────────────────────────────────────────────────────────────
async function init() {
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
  const ws = new WebSocket(BACKEND_WS);

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

  ws.onclose = () => setTimeout(connectWebSocket, 3000);
  ws.onerror = () => ws.close();
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

  if (!printer || !printer.online) {
    dot.className = 'printer-status-dot offline';
    state.textContent = 'Offline';
    filename.textContent = '';
    progress.style.width = '0%';
    hotend.textContent = '—';
    bed.textContent = '—';
    return;
  }

  dot.className = 'printer-status-dot online';
  state.textContent = capitalise(printer.state);
  filename.textContent = printer.filename || '';
  progress.style.width = `${Math.round((printer.progress || 0) * 100)}%`;

  const t = printer.temps || {};
  hotend.textContent = t.hotend != null
    ? `${Math.round(t.hotend)}°C / ${Math.round(t.hotend_target || 0)}°C` : '—';
  bed.textContent = t.bed != null
    ? `${Math.round(t.bed)}°C / ${Math.round(t.bed_target || 0)}°C` : '—';
}

function capitalise(s) {
  if (!s) return '';
  return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
}

// ── Start ─────────────────────────────────────────────────────────────
init();
