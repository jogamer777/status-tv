/**
 * camera-canvas.js
 * Animated fake camera feed using HTML5 Canvas.
 * Provides window.CameraCanvas.attach() and .setMotionActive().
 *
 * Renders: dark background, sensor noise, live timestamp, camera name label.
 * Motion active: orange border + higher noise intensity.
 */

(function () {
  'use strict';

  // Map: camId (number) → { canvas, ctx, motionActive, animId, name }
  const cameras = new Map();

  function attach(canvas, camId, camName) {
    // Set a sensible initial pixel size; ResizeObserver will correct it.
    const isLarge = canvas.closest('.camera-alert-cell') !== null;
    canvas.width  = isLarge ? 640 : 210;
    canvas.height = isLarge ? 360 : 118;

    const ctx = canvas.getContext('2d');
    const entry = { canvas, ctx, motionActive: false, animId: null, name: camName || `Cam ${camId}` };
    cameras.set(camId, entry);

    // Stop previous loop if re-attaching
    if (entry.animId) cancelAnimationFrame(entry.animId);

    // Resize canvas to match CSS layout
    const ro = new ResizeObserver(() => {
      const w = canvas.offsetWidth;
      const h = canvas.offsetHeight;
      if (w > 0 && h > 0) {
        canvas.width  = w;
        canvas.height = h;
      }
    });
    ro.observe(canvas);

    drawLoop(camId);
  }

  function drawLoop(camId) {
    const entry = cameras.get(camId);
    if (!entry) return;

    const { canvas, ctx, motionActive, name } = entry;
    const w = canvas.width;
    const h = canvas.height;

    // 1. Dark base fill (camera green-black)
    ctx.fillStyle = '#0a0f0a';
    ctx.fillRect(0, 0, w, h);

    // 2. Pixel noise (sensor simulation)
    const noiseCount = motionActive ? 800 : 350;
    const imageData = ctx.getImageData(0, 0, w, h);
    const data = imageData.data;

    for (let i = 0; i < noiseCount; i++) {
      const x = (Math.random() * w) | 0;
      const y = (Math.random() * h) | 0;
      const idx = (y * w + x) * 4;
      const v = Math.random() * (motionActive ? 80 : 35);
      data[idx]     = v * 0.55;   // R
      data[idx + 1] = v;           // G (brighter → night-vision tint)
      data[idx + 2] = v * 0.45;   // B
      data[idx + 3] = 255;
    }
    ctx.putImageData(imageData, 0, 0);

    // 3. Live timestamp (bottom-left)
    const fontSize = Math.max(9, Math.round(w * 0.042));
    ctx.font = `${fontSize}px monospace`;
    ctx.fillStyle = 'rgba(200, 255, 200, 0.55)';
    const ts = new Date().toLocaleTimeString('de-DE');
    ctx.fillText(ts, 7, h - 7);

    // 4. Camera name label (top-left pill)
    const labelFont = Math.max(8, Math.round(w * 0.038));
    ctx.font = `bold ${labelFont}px 'Inter', monospace`;
    const labelText = name.toUpperCase();
    const textW = ctx.measureText(labelText).width;
    const padX = 6, padY = 3;
    const lx = 7, ly = 7;
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    roundRect(ctx, lx, ly, textW + padX * 2, labelFont + padY * 2, 3);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.82)';
    ctx.fillText(labelText, lx + padX, ly + labelFont + padY - 1);

    // 5. Motion active: pulsing orange border
    if (motionActive) {
      const pulse = 0.5 + 0.5 * Math.sin(Date.now() / 300);
      ctx.strokeStyle = `rgba(224,90,0,${0.5 + pulse * 0.5})`;
      ctx.lineWidth = Math.max(2, w * 0.01);
      ctx.strokeRect(1, 1, w - 2, h - 2);
    }

    entry.animId = requestAnimationFrame(() => drawLoop(camId));
  }

  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  }

  function setMotionActive(camId, active) {
    const entry = cameras.get(camId);
    if (entry) entry.motionActive = active;
  }

  window.CameraCanvas = { attach, setMotionActive };
})();
