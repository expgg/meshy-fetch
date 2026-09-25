/**
 * Meshy Downloader - Workspace Bridge Script
 * 
 * Runs in the ISOLATED world at document_start.
 * Relays events from the page's MAIN world interceptor to the extension background worker.
 */

(function initMeshyBridge() {
  if (window.__meshyOutputBridgeInjected) return;
  window.__meshyOutputBridgeInjected = true;

  const TASK_STATUS_REGEX = /\/meshyd-api\/web\/(?:public\/)?v\d+\/tasks\/([^/]+)\/status(?:\?|$)/;

  // Listen to postMessage from meshy-interceptor.js
  window.addEventListener('message', event => {
    if (event.source !== window || !event.data) return;
    const msg = event.data;

    if (msg.source === 'meshy-output-extension') {
      if (msg.type === 'MESHY_TASK_STATUS') {
        chrome.runtime.sendMessage({
          action: 'MESHY_NETWORK_EVENT',
          payload: msg.payload
        }).catch(() => {});
      } else if (msg.type === 'MESHY_TASK_SELECTED') {
        const taskId = msg.payload?.taskId?.trim();
        if (taskId) {
          chrome.runtime.sendMessage({
            action: 'MESHY_TASK_SELECTED',
            payload: { taskId, data: msg.payload.data }
          }).catch(() => {});
        }
      }
    }
  });

  // Check URL parameters for direct task IDs
  try {
    const url = new URL(window.location.href);
    const taskId = url.searchParams.get('id') || url.searchParams.get('taskId');
    if (taskId && taskId.trim().length > 0) {
      chrome.runtime.sendMessage({
        action: 'MESHY_TASK_SELECTED',
        payload: { taskId: taskId.trim() }
      }).catch(() => {});
    }
  } catch {}

  console.log('[MeshyDownloader] Workspace bridge active.');
})();
