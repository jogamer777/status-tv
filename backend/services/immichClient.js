'use strict';
/**
 * immichClient.js
 * Handles uploading JPEG frames to Immich via REST API.
 * Manages album creation/lookup for "Überwachung" (or configured album name).
 */

const fetch    = require('node-fetch');
const FormData = require('form-data');
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const IMMICH_URL   = process.env.IMMICH_URL   || '';
const IMMICH_KEY   = process.env.IMMICH_API_KEY || '';
const ALBUM_NAME   = process.env.IMMICH_ALBUM  || 'Überwachung';
const DEVICE_ID    = 'status-tv';

let cachedAlbumId = null;

function headers(extra = {}) {
  return { 'x-api-key': IMMICH_KEY, ...extra };
}

/**
 * Upload a JPEG buffer as an asset to Immich.
 * @param {Buffer} jpegBuf
 * @param {string} cameraName
 * @param {Date}   capturedAt
 * @returns {Promise<string|null>}  asset ID or null on failure
 */
async function uploadFrame(jpegBuf, cameraName, capturedAt = new Date()) {
  if (!IMMICH_URL || !IMMICH_KEY) {
    console.warn('[immichClient] IMMICH_URL or IMMICH_API_KEY not set');
    return null;
  }

  const ts          = capturedAt.toISOString();
  const deviceAssetId = `${DEVICE_ID}_${cameraName}_${capturedAt.getTime()}`;
  const filename    = `${cameraName}_${capturedAt.toISOString().replace(/[:.]/g, '-')}.jpg`;

  const form = new FormData();
  form.append('deviceAssetId', deviceAssetId);
  form.append('deviceId',      DEVICE_ID);
  form.append('fileCreatedAt', ts);
  form.append('fileModifiedAt', ts);
  form.append('assetData', jpegBuf, {
    filename,
    contentType: 'image/jpeg'
  });

  try {
    const res = await fetch(`${IMMICH_URL}/api/assets`, {
      method:  'POST',
      headers: headers(form.getHeaders()),
      body:    form,
      timeout: 10000
    });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      console.warn(`[immichClient] Upload failed (${res.status}): ${text}`);
      return null;
    }

    const json = await res.json();
    const assetId = json.id || json.assetId;
    console.log(`[immichClient] Uploaded frame for camera "${cameraName}" → asset ${assetId}`);
    return assetId;
  } catch (err) {
    console.warn('[immichClient] Upload error:', err.message);
    return null;
  }
}

/**
 * Get or create the surveillance album.
 * @returns {Promise<string|null>} album ID
 */
async function getOrCreateAlbum() {
  if (cachedAlbumId) return cachedAlbumId;
  if (!ALBUM_NAME)   return null;

  try {
    const res  = await fetch(`${IMMICH_URL}/api/albums`, {
      headers: headers({ 'Content-Type': 'application/json' }),
      timeout: 5000
    });
    const albums = await res.json();
    const existing = albums.find(a => a.albumName === ALBUM_NAME);

    if (existing) {
      cachedAlbumId = existing.id;
      return cachedAlbumId;
    }

    // Create album
    const create = await fetch(`${IMMICH_URL}/api/albums`, {
      method:  'POST',
      headers: headers({ 'Content-Type': 'application/json' }),
      body:    JSON.stringify({ albumName: ALBUM_NAME }),
      timeout: 5000
    });
    const album = await create.json();
    cachedAlbumId = album.id;
    console.log(`[immichClient] Created album "${ALBUM_NAME}" (${cachedAlbumId})`);
    return cachedAlbumId;
  } catch (err) {
    console.warn('[immichClient] Album error:', err.message);
    return null;
  }
}

/**
 * Add asset IDs to the surveillance album.
 * @param {string[]} assetIds
 */
async function addToAlbum(assetIds) {
  if (!assetIds.length) return;
  const albumId = await getOrCreateAlbum();
  if (!albumId) return;

  try {
    await fetch(`${IMMICH_URL}/api/albums/${albumId}/assets`, {
      method:  'PUT',
      headers: headers({ 'Content-Type': 'application/json' }),
      body:    JSON.stringify({ ids: assetIds }),
      timeout: 5000
    });
  } catch (err) {
    console.warn('[immichClient] addToAlbum error:', err.message);
  }
}

module.exports = { uploadFrame, addToAlbum };
