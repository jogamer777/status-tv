'use strict';
/**
 * frameCapture.js
 * Connects to an MJPEG stream and extracts individual JPEG frames.
 * Returns an async generator that yields Buffer objects.
 */

const fetch = require('node-fetch');

const FRAME_INTERVAL_MS = 1500; // capture every 1.5s
const MAX_FRAMES        = 20;   // max frames per motion event (~30s)
const CONNECT_TIMEOUT   = 5000;

/**
 * Capture frames from a single MJPEG stream.
 * @param {string} url  e.g. "http://192.168.1.x:8081"
 * @param {AbortSignal} signal  AbortController signal to stop capture
 * @yields {Buffer} JPEG frame buffers
 */
async function* captureFrames(url, signal) {
  let res;
  try {
    res = await fetch(url, {
      timeout: CONNECT_TIMEOUT,
      signal,
      headers: { Accept: 'multipart/x-mixed-replace, image/jpeg' }
    });
  } catch (err) {
    console.warn(`[frameCapture] Cannot connect to ${url}: ${err.message}`);
    return;
  }

  if (!res.ok) {
    console.warn(`[frameCapture] HTTP ${res.status} from ${url}`);
    return;
  }

  const contentType = res.headers.get('content-type') || '';
  const boundaryMatch = contentType.match(/boundary=([^\s;]+)/);

  let frameCount = 0;
  let lastYield = 0;

  if (boundaryMatch) {
    // MJPEG multipart stream
    const boundary = Buffer.from('--' + boundaryMatch[1]);
    let buf = Buffer.alloc(0);

    for await (const chunk of res.body) {
      if (signal.aborted) break;
      buf = Buffer.concat([buf, chunk]);

      let start = -1;
      let end   = -1;

      // Find JPEG SOI (0xFF 0xD8) and EOI (0xFF 0xD9) markers
      for (let i = 0; i < buf.length - 1; i++) {
        if (buf[i] === 0xFF && buf[i + 1] === 0xD8) start = i;
        if (buf[i] === 0xFF && buf[i + 1] === 0xD9 && start !== -1) { end = i + 2; break; }
      }

      if (start !== -1 && end !== -1) {
        const now = Date.now();
        if (now - lastYield >= FRAME_INTERVAL_MS) {
          lastYield = now;
          yield buf.slice(start, end);
          frameCount++;
          if (frameCount >= MAX_FRAMES) break;
        }
        // Discard processed data
        buf = buf.slice(end);
      }

      // Prevent unbounded buffer growth
      if (buf.length > 2 * 1024 * 1024) buf = buf.slice(buf.length - 65536);
    }
  } else {
    // Fallback: single JPEG response (snapshot endpoint)
    const data = await res.buffer();
    yield data;
  }
}

module.exports = { captureFrames, FRAME_INTERVAL_MS, MAX_FRAMES };
