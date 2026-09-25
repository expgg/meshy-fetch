/**
 * Meshy Downloader - Workspace Network Interceptor
 * 
 * Runs in the webpage's MAIN world context at document_start.
 * Intercepts window.fetch and XMLHttpRequest to detect completed task models and selection.
 */

(function initMeshyInterceptor() {
  if (window.__meshyOutputInterceptorInjected) return;
  window.__meshyOutputInterceptorInjected = true;

  const TASK_STATUS_REGEX = /\/meshyd-api\/web\/(?:public\/)?v\d+\/tasks\/([^/]+)\/status(?:\?|$)/;
  const TASK_DETAIL_REGEX = /\/meshyd-api\/web\/(?:public\/)?v\d+\/tasks\/([^/?#]+)(?:[?#].*)?$/;
  const SOURCE_TAG = 'meshy-output-extension';

  function extractStatusTaskId(url) {
    const match = url.match(TASK_STATUS_REGEX);
    return match?.[1] ?? null;
  }

  function extractDetailTaskId(url) {
    const match = url.match(TASK_DETAIL_REGEX);
    return match?.[1] ?? null;
  }

  function emitTaskStatus(phase, url, status, data) {
    window.postMessage({
      source: SOURCE_TAG,
      type: 'MESHY_TASK_STATUS',
      payload: { phase, url, status, data }
    }, window.location.origin);
  }

  function emitTaskSelected(taskId, data) {
    window.postMessage({
      source: SOURCE_TAG,
      type: 'MESHY_TASK_SELECTED',
      payload: { taskId, data }
    }, window.location.origin);
  }

  // 1. Hook window.fetch
  const originalFetch = window.fetch;
  function hookedFetch(...args) {
    const requestUrl = typeof args[0] === 'string' 
      ? args[0] 
      : (args[0] && typeof args[0] === 'object' && 'url' in args[0] ? String(args[0].url) : '');

    const statusId = extractStatusTaskId(requestUrl);
    const detailId = extractDetailTaskId(requestUrl);

    if (statusId) {
      emitTaskStatus('start', requestUrl);
    }

    const fetchPromise = originalFetch.apply(this, args);

    if (statusId || detailId) {
      return fetchPromise.then(response => {
        try {
          const clone = response.clone();
          clone.json().then(json => {
            if (statusId) {
              emitTaskStatus('response', requestUrl, response.status, json);
            }
            if (detailId) {
              const parsedId = json?.result?.id || detailId;
              emitTaskSelected(parsedId, json);
            }
          }).catch(() => {});
        } catch {}
        return response;
      });
    }

    return fetchPromise;
  }

  try {
    Object.defineProperty(window, 'fetch', {
      configurable: true,
      enumerable: true,
      get: () => hookedFetch,
      set: (val) => {
        if (typeof val === 'function' && val !== hookedFetch) {
          // Allow external code to wrap our hook if needed
        }
      }
    });
  } catch {
    window.fetch = hookedFetch;
  }

  // 2. Hook XMLHttpRequest
  const originalXhrOpen = XMLHttpRequest.prototype.open;
  const originalXhrSend = XMLHttpRequest.prototype.send;

  XMLHttpRequest.prototype.open = function(method, url, ...rest) {
    this.__meshyReqUrl = String(url);
    return originalXhrOpen.call(this, method, url, ...rest);
  };

  XMLHttpRequest.prototype.send = function(...args) {
    const url = this.__meshyReqUrl || '';
    const statusId = extractStatusTaskId(url);
    const detailId = extractDetailTaskId(url);

    if (statusId) {
      emitTaskStatus('start', url);
      this.addEventListener('load', function() {
        try {
          const json = JSON.parse(this.responseText);
          emitTaskStatus('response', url, this.status, json);
        } catch {}
      });
    }

    if (detailId) {
      this.addEventListener('load', function() {
        try {
          const json = JSON.parse(this.responseText);
          const parsedId = json?.result?.id || detailId;
          emitTaskSelected(parsedId, json);
        } catch {}
      });
    }

    return originalXhrSend.apply(this, args);
  };

  console.log('[MeshyDownloader] Workspace interceptor active.');
})();
