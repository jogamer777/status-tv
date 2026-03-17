'use strict';
/**
 * motionAnalyzer.js
 * Orchestrates the motion → frame capture → face detection → Immich upload pipeline.
 *
 * Smart frame selection:
 * - Captures JPEG frames from MJPEG stream during motion event
 * - Runs local face detection (face-api.js / SSD MobileNet) on each frame
 * - Groups faces into "person tracks" using IoU overlap across frames
 * - Selects best frame per track (highest face confidence score)
 * - Uploads max MAX_UPLOADS_PER_EVENT frames to Immich
 * - Per-camera cooldown prevents flooding on repeated motion bursts
 */

require('dotenv').config({ path: require('path').join(__dirname, '.env') });

const { captureFrames }  = require('./services/frameCapture');
const { detectFaces }    = require('./services/faceDetector');
const { uploadFrame, addToAlbum } = require('./services/immichClient');

const ENABLED              = process.env.IMMICH_ENABLED !== 'false';
const MAX_UPLOADS_PER_EVENT = 3;   // max unique-person frames uploaded per motion event
const COOLDOWN_MS          = 2 * 60 * 1000;  // 2-minute cooldown per camera after upload
const IOU_THRESHOLD        = 0.4;  // IoU above this → same person track

// Per-camera state
const cameraState = {}; // camId → { abortCtrl, lastUploadAt, running }

/** Compute Intersection over Union for two face boxes */
function iou(boxA, boxB) {
  const xA = Math.max(boxA.x, boxB.x);
  const yA = Math.max(boxA.y, boxB.y);
  const xB = Math.min(boxA.x + boxA.width,  boxB.x + boxB.width);
  const yB = Math.min(boxA.y + boxA.height, boxB.y + boxB.height);

  const interW = Math.max(0, xB - xA);
  const interH = Math.max(0, yB - yA);
  const inter  = interW * interH;
  if (inter === 0) return 0;

  const areaA = boxA.width * boxA.height;
  const areaB = boxB.width * boxB.height;
  return inter / (areaA + areaB - inter);
}

/**
 * Select the best frame per unique face track.
 * @param {Array<{frame: Buffer, faces: Array}>} candidates
 * @returns {Buffer[]} up to MAX_UPLOADS_PER_EVENT frames
 */
function selectBestFrames(candidates) {
  // tracks: [{bestScore, bestFrame, representativeBox}]
  const tracks = [];

  for (const { frame, faces } of candidates) {
    for (const face of faces) {
      let matched = false;

      for (const track of tracks) {
        if (iou(face.box, track.representativeBox) >= IOU_THRESHOLD) {
          // Same person — keep frame with higher score
          if (face.score > track.bestScore) {
            track.bestScore = face.score;
            track.bestFrame = frame;
            track.representativeBox = face.box;
          }
          matched = true;
          break;
        }
      }

      if (!matched) {
        tracks.push({
          bestScore: face.score,
          bestFrame: frame,
          representativeBox: face.box
        });
      }
    }
  }

  // Sort tracks by best score, take top N
  tracks.sort((a, b) => b.bestScore - a.bestScore);
  return tracks.slice(0, MAX_UPLOADS_PER_EVENT).map(t => t.bestFrame);
}

/**
 * Start frame capture for a camera when motion begins.
 * @param {number} cameraId
 * @param {object} camConfig  { id, name, stream_port }
 * @param {string} host       hostname for MJPEG URL
 */
function startCapture(cameraId, camConfig, host) {
  if (!ENABLED) return;

  // Check cooldown
  const state = cameraState[cameraId] || {};
  if (state.running) return; // already capturing
  if (state.lastUploadAt && Date.now() - state.lastUploadAt < COOLDOWN_MS) {
    console.log(`[motionAnalyzer] Camera ${cameraId} on cooldown, skipping`);
    return;
  }

  const abort = new AbortController();
  cameraState[cameraId] = { abortCtrl: abort, running: true, candidates: [], host };

  const streamUrl = `http://${host}:${camConfig.stream_port}`;
  console.log(`[motionAnalyzer] Start capture camera ${cameraId} from ${streamUrl}`);

  // Run capture+detect in background
  (async () => {
    try {
      for await (const jpegBuf of captureFrames(streamUrl, abort.signal)) {
        const faces = await detectFaces(jpegBuf);
        if (faces.length > 0) {
          console.log(`[motionAnalyzer] Camera ${cameraId}: ${faces.length} face(s) detected`);
          cameraState[cameraId].candidates.push({ frame: jpegBuf, faces });
        }
      }
    } catch (err) {
      if (err.name !== 'AbortError') {
        console.warn(`[motionAnalyzer] Capture error camera ${cameraId}:`, err.message);
      }
    } finally {
      // Auto-finalize if not already done by motion-end webhook
      if (cameraState[cameraId]?.running) {
        await finalize(cameraId, camConfig.name);
      }
    }
  })();
}

/**
 * Finalize capture when motion ends — select best frames and upload.
 * @param {number} cameraId
 * @param {string} cameraName
 */
async function finalize(cameraId, cameraName) {
  const state = cameraState[cameraId];
  if (!state || !state.running) return;

  // Stop the capture stream
  state.abortCtrl.abort();
  state.running = false;

  const { candidates } = state;
  console.log(`[motionAnalyzer] Camera ${cameraId}: ${candidates.length} candidate frame(s)`);

  if (candidates.length === 0) return;

  const bestFrames = selectBestFrames(candidates);
  console.log(`[motionAnalyzer] Uploading ${bestFrames.length} frame(s) to Immich`);

  const assetIds = [];
  for (const frame of bestFrames) {
    const id = await uploadFrame(frame, cameraName, new Date());
    if (id) assetIds.push(id);
  }

  if (assetIds.length > 0) {
    await addToAlbum(assetIds);
    state.lastUploadAt = Date.now();
  }

  state.candidates = [];
}

module.exports = { startCapture, finalize };
