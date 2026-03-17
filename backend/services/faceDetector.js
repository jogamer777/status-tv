'use strict';
/**
 * faceDetector.js
 * Local face detection using @vladmandic/face-api + @tensorflow/tfjs-node.
 * Uses SSD MobileNet V1 model (bundled with the npm package).
 *
 * Filters faces by minimum confidence (0.5) and minimum box size (80px).
 */

const path = require('path');

// Lazy-init to avoid loading TF at startup if Immich is disabled
let faceapi = null;
let canvas  = null;
let initialized = false;

const MODEL_DIR     = path.join(__dirname, '..', 'node_modules', '@vladmandic', 'face-api', 'model');
const MIN_SCORE     = 0.5;
const MIN_FACE_PX   = 80;  // min width/height in pixels

async function init() {
  if (initialized) return;

  // Dynamic requires so the module loads only when needed
  const tf = require('@tensorflow/tfjs-node');  // eslint-disable-line
  faceapi   = require('@vladmandic/face-api');
  canvas    = require('canvas');

  // Patch face-api to use node-canvas
  const { Canvas, Image, ImageData } = canvas;
  faceapi.env.monkeyPatch({ Canvas, Image, ImageData });

  await faceapi.nets.ssdMobilenetv1.loadFromDisk(MODEL_DIR);
  initialized = true;
  console.log('[faceDetector] SSD MobileNet model loaded');
}

/**
 * Detect faces in a JPEG buffer.
 * @param {Buffer} jpegBuf
 * @returns {Promise<Array<{box:{x,y,width,height}, score:number}>>}
 */
async function detectFaces(jpegBuf) {
  await init();

  let img;
  try {
    img = await canvas.loadImage(jpegBuf);
  } catch (err) {
    console.warn('[faceDetector] Cannot decode image:', err.message);
    return [];
  }

  const detections = await faceapi.detectAllFaces(
    img,
    new faceapi.SsdMobilenetv1Options({ minConfidence: MIN_SCORE })
  );

  return detections
    .map(d => ({ box: d.box, score: d.score }))
    .filter(d => d.box.width >= MIN_FACE_PX && d.box.height >= MIN_FACE_PX);
}

module.exports = { detectFaces };
