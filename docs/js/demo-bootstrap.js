/**
 * demo-bootstrap.js
 * Runs BEFORE main.js. Patches browser globals so the production main.js
 * works fully offline without any backend server.
 *
 * 1. Patches window.fetch  — intercepts /api/* calls, returns mock data
 * 2. Replaces window.WebSocket — MockWebSocket, simulates connection
 * 3. Wraps window.setInterval — captures printer poll fn for force-refresh
 * 4. MutationObserver — swaps MJPEG <img> tags with CameraCanvas <canvas>
 * 5. Builds demo control panel after DOMContentLoaded
 */

(function () {
  'use strict';

  // ── Mock data ─────────────────────────────────────────────────────

  const MOCK_CAMERAS = [
    { id: 1, name: 'TuerPin',  stream_port: 8081 },
    { id: 2, name: 'Gang',     stream_port: 8082 },
    { id: 3, name: 'Kamera3',  stream_port: 8083 },
    { id: 4, name: 'Kamera4',  stream_port: 8084 }
  ];

  function idleState(hotend, bed) {
    return {
      online: true, state: 'Operational', filename: '',
      progress: 0, print_time_left: 0,
      temps: { hotend, hotend_target: 0, bed, bed_target: 0 }
    };
  }

  window.__demoState = {
    printers: {
      crx_pro: idleState(22, 21),
      k2:      idleState(23, 22)
    }
  };

  // ── 1. Mock fetch ─────────────────────────────────────────────────

  const _realFetch = window.fetch;
  window.fetch = function (url, opts) {
    const s = String(url);
    if (s.includes('/api/cameras'))
      return Promise.resolve({ ok: true, json: () => Promise.resolve(MOCK_CAMERAS) });
    if (s.includes('/api/config/ui'))
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ motion_clear_delay_ms: 8000 }) });
    if (s.includes('/api/printers'))
      return Promise.resolve({ ok: true, json: () => Promise.resolve(window.__demoState.printers) });
    return _realFetch ? _realFetch(url, opts) : Promise.reject(new Error('no fetch'));
  };

  // ── 2. Mock WebSocket ─────────────────────────────────────────────

  function MockWebSocket() {
    this.readyState = 1; // OPEN
    const self = this;
    // Fire onopen after main.js has assigned ws.onopen
    setTimeout(function () { if (self.onopen) self.onopen({}); }, 0);
    window.__mockWs = this;
  }
  MockWebSocket.OPEN    = 1;
  MockWebSocket.CLOSING = 2;
  MockWebSocket.CLOSED  = 3;
  MockWebSocket.prototype.close = function () { this.readyState = 3; };
  MockWebSocket.prototype.send  = function () {};

  window.WebSocket = MockWebSocket;

  // Public: inject a motion event into main.js
  window.__sendMotionEvent = function (motionStateObj) {
    if (window.__mockWs && window.__mockWs.onmessage) {
      window.__mockWs.onmessage({
        data: JSON.stringify({ type: 'motion', motionState: motionStateObj })
      });
    }
  };

  // ── 3. Wrap setInterval — capture printer poll ────────────────────

  let _printerPollFn = null;
  const _realSetInterval = window.setInterval;
  window.setInterval = function (fn, delay) {
    if (delay === 10000) _printerPollFn = fn;  // PRINTER_POLL_INTERVAL
    return _realSetInterval.apply(window, arguments);
  };
  window.__forcePrinterPoll = function () { if (_printerPollFn) _printerPollFn(); };

  // ── 4. MutationObserver — replace MJPEG <img> with <canvas> ──────

  const MJPEG_RE = /^https?:\/\/[^/]+:808\d\/?$/;

  const observer = new MutationObserver(function (mutations) {
    mutations.forEach(function (mutation) {
      mutation.addedNodes.forEach(function (node) {
        if (node.nodeType !== 1) return;
        const imgs = node.tagName === 'IMG' ? [node] : Array.from(node.querySelectorAll('img'));
        imgs.forEach(function (img) {
          if (!MJPEG_RE.test(img.src) && !img.src.includes(':808')) return;
          const portMatch = img.src.match(/:(\d+)\/?$/);
          const streamPort = portMatch ? parseInt(portMatch[1], 10) : 0;
          const camId = streamPort >= 8081 ? streamPort - 8080 : 0;
          const cam = MOCK_CAMERAS.find(c => c.id === camId);
          const camName = cam ? cam.name : (img.alt || 'Cam');

          const canvas = document.createElement('canvas');
          canvas.dataset.camId = camId;

          if (img.parentNode) {
            img.parentNode.replaceChild(canvas, img);
            window.CameraCanvas.attach(canvas, camId, camName);
            // Sync motion state if already active
            if (window.__demoMotionState && window.__demoMotionState[camId]) {
              window.CameraCanvas.setMotionActive(camId, true);
            }
          }
        });
      });
    });
  });

  observer.observe(document.documentElement, { childList: true, subtree: true });

  // ── 5. Demo Panel ─────────────────────────────────────────────────

  // Per-camera motion state tracked by the demo panel
  window.__demoMotionState = {};
  MOCK_CAMERAS.forEach(c => { window.__demoMotionState[c.id] = false; });

  document.addEventListener('DOMContentLoaded', function () {
    buildPanel();
  });

  function buildPanel() {
    const toggle = document.getElementById('demo-toggle');
    const panel  = document.getElementById('demo-panel');
    if (!toggle || !panel) return;

    toggle.addEventListener('click', function () {
      panel.classList.toggle('demo-collapsed');
    });

    buildCamButtons();
    buildPrinterControls();
    buildAutoplay();
  }

  // Camera toggle buttons
  function buildCamButtons() {
    const container = document.getElementById('demo-cam-buttons');
    if (!container) return;

    MOCK_CAMERAS.forEach(function (cam) {
      const btn = document.createElement('button');
      btn.className = 'demo-cam-btn';
      btn.dataset.camId = cam.id;
      btn.innerHTML = `<span class="demo-cam-dot"></span>${cam.name}`;

      btn.addEventListener('click', function () {
        const id = cam.id;
        window.__demoMotionState[id] = !window.__demoMotionState[id];
        const active = window.__demoMotionState[id];

        btn.classList.toggle('active', active);
        window.CameraCanvas.setMotionActive(id, active);
        window.__sendMotionEvent({ ...window.__demoMotionState });
      });

      container.appendChild(btn);
    });
  }

  // Printer state buttons
  const PRINTER_PRESETS = {
    crx: {
      idle:    { online: true, state: 'Operational', filename: '', progress: 0, print_time_left: 0,
                 temps: { hotend: 22, hotend_target: 0, bed: 21, bed_target: 0 } },
      printing:{ online: true, state: 'Printing', filename: 'benchy_0.2mm_PLA.gcode',
                 progress: 0.42, print_time_left: 4320,
                 temps: { hotend: 215, hotend_target: 215, bed: 60, bed_target: 60 } },
      done:    { online: true, state: 'Operational', filename: 'benchy_0.2mm_PLA.gcode',
                 progress: 1, print_time_left: 0,
                 temps: { hotend: 80, hotend_target: 0, bed: 40, bed_target: 0 } }
    },
    k2: {
      idle:    { online: true, state: 'standby', filename: '', progress: 0, print_time_left: 0,
                 temps: { hotend: 23, hotend_target: 0, bed: 22, bed_target: 0 } },
      printing:{ online: true, state: 'printing', filename: 'vase_spiral_0.3mm_PETG.gcode',
                 progress: 0.67, print_time_left: 2100,
                 temps: { hotend: 240, hotend_target: 240, bed: 80, bed_target: 80 } },
      done:    { online: true, state: 'complete', filename: 'vase_spiral_0.3mm_PETG.gcode',
                 progress: 1, print_time_left: 0,
                 temps: { hotend: 100, hotend_target: 0, bed: 50, bed_target: 0 } }
    }
  };

  const activePrinterState = { crx: 'idle', k2: 'idle' };

  function buildPrinterControls() {
    const container = document.getElementById('demo-printer-controls');
    if (!container) return;

    [
      { key: 'crx', label: 'CRX-Pro', stateKey: 'crx_pro' },
      { key: 'k2',  label: 'K2',      stateKey: 'k2' }
    ].forEach(function (printer) {
      const row = document.createElement('div');
      row.className = 'demo-printer-row';
      row.innerHTML = `<div class="demo-printer-label">${printer.label}</div>
                       <div class="demo-state-btns" id="demo-btns-${printer.key}"></div>`;
      container.appendChild(row);

      const btnsEl = document.getElementById(`demo-btns-${printer.key}`);
      const defs = [
        { id: 'idle',     label: 'Idle' },
        { id: 'printing', label: 'Druckt' },
        { id: 'done',     label: 'Fertig' }
      ];

      defs.forEach(function (def) {
        const btn = document.createElement('button');
        btn.className = 'demo-state-btn' + (def.id === 'idle' ? ' active' : '');
        btn.textContent = def.label;
        btn.dataset.state = def.id;
        btn.dataset.printer = printer.key;

        btn.addEventListener('click', function () {
          const prev = activePrinterState[printer.key];

          // "Fertig" only meaningful after "Druckt"
          if (def.id === 'done' && prev !== 'printing') {
            // First set printing so completion detection fires
            window.__demoState.printers[printer.stateKey] = PRINTER_PRESETS[printer.key].printing;
            window.__forcePrinterPoll();
          }

          activePrinterState[printer.key] = def.id;
          window.__demoState.printers[printer.stateKey] = PRINTER_PRESETS[printer.key][def.id];
          window.__forcePrinterPoll();

          // Update active button styling
          btnsEl.querySelectorAll('.demo-state-btn').forEach(b => b.classList.remove('active'));
          btn.classList.add('active');
        });

        btnsEl.appendChild(btn);
      });
    });
  }

  // Autoplay sequence
  function buildAutoplay() {
    const btn = document.getElementById('demo-autoplay');
    if (!btn) return;

    btn.addEventListener('click', function () {
      btn.disabled = true;
      btn.textContent = '⏳ Läuft…';
      runAutoplay(function () {
        btn.disabled = false;
        btn.textContent = '▶ Komplett-Demo abspielen';
      });
    });
  }

  function runAutoplay(done) {
    const steps = [
      // t=0: both printers printing
      function () {
        setPrinter('crx', 'crx_pro', 'printing');
        setPrinter('k2', 'k2', 'printing');
        window.__forcePrinterPoll();
      },
      // t=2s: motion on camera 1 + 2
      function () { triggerMotion([1, 2], true); },
      // t=5s: stop motion
      function () { triggerMotion([1, 2], false); },
      // t=9s: CRX-Pro done → toast + chime
      function () {
        setPrinter('crx', 'crx_pro', 'done');
        window.__forcePrinterPoll();
      },
      // t=13s: K2 done
      function () {
        setPrinter('k2', 'k2', 'done');
        window.__forcePrinterPoll();
      },
      // t=18s: reset all
      function () {
        setPrinter('crx', 'crx_pro', 'idle');
        setPrinter('k2', 'k2', 'idle');
        window.__forcePrinterPoll();
        syncPrinterButtons();
        done && done();
      }
    ];

    const delays = [0, 2000, 5000, 9000, 13000, 18000];
    steps.forEach(function (step, i) {
      setTimeout(step, delays[i]);
    });
  }

  function setPrinter(key, stateKey, preset) {
    activePrinterState[key] = preset;
    window.__demoState.printers[stateKey] = PRINTER_PRESETS[key][preset];
  }

  function syncPrinterButtons() {
    ['crx', 'k2'].forEach(function (key) {
      const btnsEl = document.getElementById(`demo-btns-${key}`);
      if (!btnsEl) return;
      btnsEl.querySelectorAll('.demo-state-btn').forEach(function (b) {
        b.classList.toggle('active', b.dataset.state === activePrinterState[key]);
      });
    });
  }

  function triggerMotion(camIds, active) {
    camIds.forEach(function (id) {
      window.__demoMotionState[id] = active;
      window.CameraCanvas.setMotionActive(id, active);

      // Update cam button styling
      const btn = document.querySelector(`.demo-cam-btn[data-cam-id="${id}"]`);
      if (btn) btn.classList.toggle('active', active);
    });
    window.__sendMotionEvent({ ...window.__demoMotionState });
  }

})();
