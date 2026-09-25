/**
 * Meshy Downloader - Community Bridge Script
 * 
 * Runs in the ISOLATED world at document_start.
 * Bridges captured GLB buffers from community-interceptor to extension runtime.
 */

(function initCommunityBridge() {
  if (window.__meshyCommunityBridgeInjected) return;
  window.__meshyCommunityBridgeInjected = true;

  let activePost = null;
  let cachedBuffer = null;

  function toCanonicalId(str) {
    if (!str) return null;
    const match = str.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
    return match ? match[0].toLowerCase() : str.trim().toLowerCase();
  }

  function getPostIdFromUrl() {
    try {
      const match = window.location.pathname.replace(/\/$/, '').match(/^\/posts\/([^/?#]+)$/);
      return match?.[1] ? toCanonicalId(match[1]) : null;
    } catch {
      return null;
    }
  }

  function requestBuffer(postId) {
    window.postMessage({
      source: 'meshy-community-bridge',
      type: 'REQUEST_GLB_BUFFER',
      postId
    }, window.location.origin);
  }

  async function updateStorage(status = 'ready', postData = null) {
    try {
      const existing = await chrome.storage.local.get('meshyCommunityState');
      const prev = existing.meshyCommunityState || {};
      const updatedPost = postData || prev.activePost || activePost;

      await chrome.storage.local.set({
        meshyCommunityState: {
          activePost: updatedPost,
          status,
          error: null,
          updatedAt: new Date().toISOString()
        }
      });
    } catch {}
  }

  // Listen for interceptor postMessages
  window.addEventListener('message', event => {
    if (event.source !== window || !event.data) return;
    const msg = event.data;

    if (msg.source === 'meshy-community-extension') {
      if (msg.type === 'MESHY_COMMUNITY_GLB_READY') {
        const id = toCanonicalId(msg.payload?.postId);
        if (id) requestBuffer(id);
      } else if (msg.type === 'RESPONSE_GLB_BUFFER') {
        const id = toCanonicalId(msg.payload?.postId);
        const buf = msg.payload?.buffer;
        if (id && buf instanceof ArrayBuffer) {
          cachedBuffer = buf;
          updateStorage('ready');
        }
      }
    }
  });

  // Handle Extension runtime queries for GLB buffers
  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg?.action === 'GET_COMMUNITY_GLB_INFO') {
      if (cachedBuffer) {
        const totalBytes = cachedBuffer.byteLength;
        const chunkSize = 4 * 1024 * 1024; // 4MB chunks
        sendResponse({
          ok: true,
          totalBytes,
          chunkSize,
          totalChunks: Math.ceil(totalBytes / chunkSize),
          metadata: activePost
        });
      } else {
        sendResponse({ ok: false, error: 'Buffer not in memory' });
      }
      return true;
    }

    if (msg?.action === 'GET_COMMUNITY_GLB_CHUNK') {
      const { chunkIndex } = msg;
      if (cachedBuffer) {
        const offset = chunkIndex * 4 * 1024 * 1024;
        const end = Math.min(offset + 4 * 1024 * 1024, cachedBuffer.byteLength);
        const chunk = new Uint8Array(cachedBuffer.slice(offset, end));
        sendResponse({
          ok: true,
          chunkIndex,
          chunkData: Array.from(chunk)
        });
      } else {
        sendResponse({ ok: false, error: 'Chunk buffer not ready' });
      }
      return true;
    }

    if (msg?.action === 'CHECK_COMMUNITY_ROUTE') {
      const postId = getPostIdFromUrl();
      if (postId) {
        requestBuffer(postId);
      }
      sendResponse({ ok: true });
      return true;
    }
  });

  console.log('[MeshyDownloader] Community bridge active.');
})();
