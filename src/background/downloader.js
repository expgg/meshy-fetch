/**
 * Meshy Downloader - Direct Download Manager
 * 
 * Handles browser-native downloads using chrome.downloads API.
 * Free, offline, and without rate limits.
 */

import { isValidAssetUrl } from '../shared/constants.js';

export function handleModelDownload(msg, sendResponse) {
  const { url, taskId, downloadType } = msg;

  if (typeof taskId !== 'string' || !taskId) {
    sendResponse({ ok: false, error: 'Missing model task ID.' });
    return;
  }

  if (!isValidAssetUrl(url)) {
    sendResponse({ ok: false, error: 'Invalid model URL.' });
    return;
  }

  const filename = `${taskId.slice(0, 8)}-model.${downloadType || 'glb'}`;

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
