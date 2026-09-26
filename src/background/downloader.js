/**
 * Meshy Downloader - Direct Download Manager
 * 
 * Handles browser-native downloads using chrome.downloads API.
 * Packages textured models into ZIP archives (model + all PBR textures)
 * and uses clean, human-readable model filenames.
 */

import { isValidAssetUrl } from '../shared/constants.js';
import { getOutputState } from './storage.js';

// Precomputed CRC32 table for fast zip checksums
const CRC_TABLE = new Uint32Array(256);
for (let i = 0; i < 256; i++) {
  let c = i;
  for (let k = 0; k < 8; k++) {
    c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
  }
  CRC_TABLE[i] = c;
}

function computeCrc32(buf) {
  let crc = -1;
  for (let i = 0; i < buf.length; i++) {
    crc = (crc >>> 8) ^ CRC_TABLE[(crc ^ buf[i]) & 0xFF];
  }
  return (crc ^ (-1)) >>> 0;
}

/**
 * Pure Javascript standard ZIP creator (Store mode)
 * Works in Service Workers without external dependencies.
 */
function createZipArchive(files) {
  const localHeaders = [];
  const centralHeaders = [];
  let offset = 0;
  const enc = new TextEncoder();

  for (const file of files) {
    const nameBytes = enc.encode(file.name);
    const data = file.data instanceof Uint8Array ? file.data : new Uint8Array(file.data);
    const crc = computeCrc32(data);
    const size = data.length;

    // Local Header (30 bytes + name + data)
    const local = new Uint8Array(30 + nameBytes.length + size);
    const dv = new DataView(local.buffer);
    dv.setUint32(0, 0x04034b50, true);
    dv.setUint16(4, 20, true);
    dv.setUint16(6, 0, true);
    dv.setUint16(8, 0, true); // Compression: Store
    dv.setUint16(10, 0, true);
    dv.setUint16(12, 0, true);
    dv.setUint32(14, crc, true);
    dv.setUint32(18, size, true);
    dv.setUint32(22, size, true);
    dv.setUint16(26, nameBytes.length, true);
    dv.setUint16(28, 0, true);
    local.set(nameBytes, 30);
    local.set(data, 30 + nameBytes.length);

    localHeaders.push(local);

    // Central Directory Header (46 bytes + name)
    const central = new Uint8Array(46 + nameBytes.length);
    const cdv = new DataView(central.buffer);
    cdv.setUint32(0, 0x02014b50, true);
    cdv.setUint16(4, 20, true);
    cdv.setUint16(6, 20, true);
    cdv.setUint16(8, 0, true);
    cdv.setUint16(10, 0, true);
    cdv.setUint16(12, 0, true);
    cdv.setUint14 ? null : null;
    cdv.setUint16(14, 0, true);
    cdv.setUint32(16, crc, true);
    cdv.setUint32(20, size, true);
    cdv.setUint32(24, size, true);
    cdv.setUint16(28, nameBytes.length, true);
    cdv.setUint16(30, 0, true);
    cdv.setUint16(32, 0, true);
    cdv.setUint16(34, 0, true);
    cdv.setUint16(36, 0, true);
    cdv.setUint32(38, 0, true);
    cdv.setUint32(42, offset, true);
    central.set(nameBytes, 46);

    centralHeaders.push(central);
    offset += local.length;
  }

  const centralOffset = offset;
  let centralSize = 0;
  for (const c of centralHeaders) centralSize += c.length;

  // End of Central Directory Record (22 bytes)
  const eocd = new Uint8Array(22);
  const edv = new DataView(eocd.buffer);
  edv.setUint32(0, 0x06054b50, true);
  edv.setUint16(4, 0, true);
  edv.setUint16(6, 0, true);
  edv.setUint16(8, files.length, true);
  edv.setUint16(10, files.length, true);
  edv.setUint32(12, centralSize, true);
  edv.setUint32(16, centralOffset, true);
  edv.setUint16(20, 0, true);

  const totalLength = offset + centralSize + 22;
  const zip = new Uint8Array(totalLength);
  let pos = 0;
  for (const l of localHeaders) {
    zip.set(l, pos);
    pos += l.length;
  }
  for (const c of centralHeaders) {
    zip.set(c, pos);
    pos += c.length;
  }
  zip.set(eocd, pos);

  return zip;
}

function toBase64DataUrl(bytes, mimeType = 'application/zip') {
  let binary = '';
  const len = bytes.byteLength;
  const chunkSize = 16384;
  for (let i = 0; i < len; i += chunkSize) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, Math.min(i + chunkSize, len)));
  }
  return `data:${mimeType};base64,${btoa(binary)}`;
}

export async function handleModelDownload(msg, sendResponse) {
  const { url, taskId, downloadType } = msg;

  if (typeof taskId !== 'string' || !taskId) {
    sendResponse({ ok: false, error: 'Missing model task ID.' });
    return;
  }

  if (!isValidAssetUrl(url)) {
    sendResponse({ ok: false, error: 'Invalid model URL.' });
    return;
  }

  // 1. Resolve human-readable model name and texture info
  const state = await getOutputState();
  const task = state.tasksById?.[taskId] || (state.current?.taskId === taskId ? state.current : null);
  const rawName = msg.modelName || task?.modelName || 'Meshy-Model';
  const cleanName = rawName.replace(/[/\\?%*:|"<>]/g, '_').trim() || `Meshy-${taskId.slice(0, 8)}`;
  const format = downloadType || 'glb';

  // 2. Check if model has PBR textures to package into a ZIP
  const textureUrls = task?.textureUrls || msg.textureUrls;
  const hasTextures = Array.isArray(textureUrls) && textureUrls.length > 0;

  if (hasTextures) {
    try {
      console.log(`[MeshyDownloader] Packaging textured model into ZIP for "${cleanName}"...`);
      const files = [];

      // A. Fetch 3D Model file
      const modelRes = await fetch(url);
      if (!modelRes.ok) throw new Error(`Model fetch failed: HTTP ${modelRes.status}`);
      const modelBuf = await modelRes.arrayBuffer();
      files.push({
        name: `${cleanName}.${format}`,
        data: new Uint8Array(modelBuf)
      });

      // B. Fetch all PBR Texture Maps
      for (const group of textureUrls) {
        if (!group || typeof group !== 'object') continue;
        for (const [key, texUrl] of Object.entries(group)) {
          if (typeof texUrl === 'string' && texUrl.startsWith('https://')) {
            try {
              const tRes = await fetch(texUrl);
              if (tRes.ok) {
                const tBuf = await tRes.arrayBuffer();
                const cleanExt = (texUrl.split('?')[0].split('.').pop() || 'png').toLowerCase();
                files.push({
                  name: `textures/${key}.${cleanExt}`,
                  data: new Uint8Array(tBuf)
                });
              }
            } catch (err) {
              console.warn(`[MeshyDownloader] Could not fetch texture "${key}":`, err);
            }
          }
        }
      }

      // C. Build ZIP Archive
      const zipBytes = createZipArchive(files);
      const dataUrl = toBase64DataUrl(zipBytes, 'application/zip');

      chrome.downloads.download({
        url: dataUrl,
        filename: `${cleanName}.zip`,
        saveAs: true,
        conflictAction: 'uniquify'
      }, downloadId => {
        if (chrome.runtime.lastError) {
          console.warn('[MeshyDownloader] ZIP data URL download error, falling back to direct download:', chrome.runtime.lastError.message);
          downloadDirectModel(url, cleanName, format, sendResponse);
          return;
        }
        sendResponse({ ok: true, downloadId });
      });
      return;
    } catch (err) {
      console.warn('[MeshyDownloader] ZIP packaging failed, falling back to direct file download:', err);
    }
  }

  // 3. Fallback / Direct download with clean model name
  downloadDirectModel(url, cleanName, format, sendResponse);
}

function downloadDirectModel(url, cleanName, format, sendResponse) {
  const filename = `${cleanName}.${format}`;
  chrome.downloads.download({
    url,
    filename,
    saveAs: true,
    conflictAction: 'uniquify'
  }, downloadId => {
    if (chrome.runtime.lastError) {
      sendResponse({ ok: false, error: chrome.runtime.lastError.message });
      return;
    }
    sendResponse({ ok: true, downloadId });
  });
}

export function handleTextureDownload(msg, sendResponse) {
  const { url, filename } = msg;

  if (typeof url !== 'string' || !url.startsWith('https://')) {
    sendResponse({ ok: false, error: 'Invalid texture URL.' });
    return;
  }

  chrome.downloads.download({
    url,
    filename: filename || 'texture.png',
    saveAs: true,
    conflictAction: 'uniquify'
  }, downloadId => {
    if (chrome.runtime.lastError) {
      sendResponse({ ok: false, error: chrome.runtime.lastError.message });
      return;
    }
    sendResponse({ ok: true, downloadId });
  });
}

