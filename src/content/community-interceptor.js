/**
 * Meshy Downloader - Community 3D Model Interceptor
 * 
 * Runs in the webpage's MAIN world context at document_start.
 * Intercepts Web Workers to capture binary glTF/GLB models directly from WebGL loader memory.
 */

(function initCommunityInterceptor() {
  if (window.__meshyCommunityInterceptorInjected) return;
  window.__meshyCommunityInterceptorInjected = true;

  const SOURCE_TAG = 'meshy-community-extension';
  let activePostId = null;
  let cachedGlbBuffer = null;

  function toCanonicalId(str) {
    if (!str) return null;
    const match = str.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
    return match ? match[0].toLowerCase() : str.trim().toLowerCase();
  }

  function getRoutePostId() {
    try {
      const path = window.location.pathname.replace(/\/$/, '');
      const match = path.match(/^\/posts\/([^/?#]+)$/);
      return match?.[1] ? toCanonicalId(match[1]) : null;
    } catch {
      return null;
    }
  }

  function isGlbMagic(buffer) {
    if (!buffer || buffer.byteLength < 12) return false;
    try {
      const bytes = new Uint8Array(buffer, 0, 4);
      // 'glTF' in ASCII: [103, 108, 84, 70]
      return bytes[0] === 103 && bytes[1] === 108 && bytes[2] === 84 && bytes[3] === 70;
    } catch {
      return false;
    }
  }

  function cacheGlb(buffer) {
    if (!buffer || !isGlbMagic(buffer)) return;
    const postId = getRoutePostId() || activePostId;

    const copy = new Uint8Array(buffer.byteLength);
    copy.set(new Uint8Array(buffer));
    cachedGlbBuffer = copy.buffer;
    window.__meshyCommunityGlbBuffer = cachedGlbBuffer;

    if (postId) {
      activePostId = postId;
      window.__meshyCommunityActivePostId = postId;
      window.postMessage({
        source: SOURCE_TAG,
        type: 'MESHY_COMMUNITY_GLB_READY',
        payload: { postId, byteLength: cachedGlbBuffer.byteLength }
      }, window.location.origin);
    }
  }

  // 1. Hook Web Worker to capture decoded 3D mesh buffers
  const OriginalWorker = window.Worker;
  if (OriginalWorker) {
    window.Worker = function(scriptUrl, options) {
      const worker = new OriginalWorker(scriptUrl, options);
      worker.addEventListener('message', event => {
        try {
          const data = event?.data;
          if (!data) return;

          let buf = null;
          let offset = 0;
          let length = 0;

          if (data instanceof ArrayBuffer) {
            buf = data;
            length = data.byteLength;
          } else if (ArrayBuffer.isView(data)) {
            buf = data.buffer;
            offset = data.byteOffset;
            length = data.byteLength;
          }

          if (buf && length >= 12) {
            const slice = buf.slice(offset, offset + length);
            if (isGlbMagic(slice)) {
              cacheGlb(slice);
            }
          }
        } catch {}
      });
      return worker;
    };
    window.Worker.prototype = OriginalWorker.prototype;
  }

  // 2. Respond to GLB Buffer Requests from the Bridge
  window.addEventListener('message', event => {
    if (event.source !== window || !event.data) return;
    const msg = event.data;

    if (msg.source === 'meshy-community-bridge' && msg.type === 'REQUEST_GLB_BUFFER') {
      const reqId = toCanonicalId(msg.postId);
      const currentId = getRoutePostId() || activePostId;
      if (cachedGlbBuffer && reqId && (reqId === currentId)) {
        window.postMessage({
          source: SOURCE_TAG,
          type: 'RESPONSE_GLB_BUFFER',
          payload: { postId: reqId, buffer: cachedGlbBuffer }
        }, window.location.origin);
      }
    }
  });

  // 3. Track Route Changes
  function onRouteChanged() {
    const currentId = getRoutePostId();
    if (currentId && currentId !== activePostId) {
      activePostId = currentId;
      cachedGlbBuffer = null;
    }
  }

  const origPushState = history.pushState;
  if (typeof origPushState === 'function') {
    history.pushState = function(...args) {
      const res = origPushState.apply(this, args);
      onRouteChanged();
      return res;
    };
  }

  window.addEventListener('popstate', onRouteChanged);
  onRouteChanged();

  console.log('[MeshyDownloader] Community interceptor active.');
})();
