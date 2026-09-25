/**
 * Meshy Fetch - Workspace Bridge Script
 * 
 * Runs in the ISOLATED world at document_start.
 * Relays events from the page's MAIN world interceptor to the extension background worker,
 * extracts Supabase auth session tokens from cookies, and queries Meshy's v2 task endpoints
 * for the freshest textured 3D models and textures.
 */

(function initMeshyBridge() {
  if (window.__meshyOutputBridgeInjected) return;
  window.__meshyOutputBridgeInjected = true;

  const TASK_STATUS_REGEX = /\/meshyd-api\/web\/(?:public\/)?v\d+\/tasks\/([^/]+)\/status(?:\?|$)/;

  // 1. EXTRACT SUPABASE AUTH TOKEN FROM COOKIES
  function getAuthToken() {
    try {
      const cookies = document.cookie.split(';').map(c => c.trim()).filter(Boolean);
      const tokenParts = [];
      for (const c of cookies) {
        const eqIdx = c.indexOf('=');
        if (eqIdx === -1) continue;
        const name = c.slice(0, eqIdx);
        const val = c.slice(eqIdx + 1);
        const match = name.match(/^sb-auth-auth-token(?:\.(\d+))?$/);
        if (match) {
          tokenParts.push({ index: match[1] ? Number(match[1]) : 0, value: val });
        }
      }
      tokenParts.sort((a, b) => a.index - b.index);
      let raw = tokenParts.map(p => p.value).join('');
      if (!raw) return null;

      try { raw = decodeURIComponent(raw); } catch {}
      if (raw.startsWith('base64-')) {
        try { raw = atob(raw.slice(7)); } catch {}
      }

      // Handle URL-safe base64
      try {
        const b64 = raw.replace(/-/g, '+').replace(/_/g, '/');
        const pad = b64.padEnd(b64.length + (4 - (b64.length % 4)) % 4, '=');
        const decoded = atob(pad);
        const parsed = JSON.parse(decoded);
        if (parsed?.access_token) return parsed.access_token;
        if (parsed?.session?.access_token) return parsed.session.access_token;
      } catch {}

      try {
        const parsed = JSON.parse(raw);
        if (parsed?.access_token) return parsed.access_token;
        if (parsed?.session?.access_token) return parsed.session.access_token;
      } catch {}

      if (raw.split('.').length === 3 && raw.length > 50) {
        return raw.trim();
      }
      return null;
    } catch {
      return null;
    }
  }

  // 2. FETCH TASK DATA DIRECTLY FROM MESHY BACKEND
  async function fetchTaskDirectly(taskId) {
    if (!taskId) return null;
    const token = getAuthToken();
    const headers = { 'Accept': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;

    // Try v2 task endpoint (contains full textured models and PBR maps)
    try {
      const res = await fetch(`/meshyd-api/web/v2/tasks/${encodeURIComponent(taskId)}`, {
        method: 'GET',
        headers,
        credentials: 'include'
      });
      if (res.ok) {
        const json = await res.json();
        return json;
      }
    } catch {}

    // Fallback to v1 status endpoint
    try {
      const res = await fetch(`/meshyd-api/web/v1/tasks/${encodeURIComponent(taskId)}/status`, {
        method: 'GET',
        headers,
        credentials: 'include'
      });
      if (res.ok) {
        const json = await res.json();
        return json;
      }
    } catch {}

    return null;
  }

  // 3. FETCH RECENT WORKSPACE TASKS (Gets recent generated/textured tasks)
  async function fetchRecentTasks() {
    const token = getAuthToken();
    const headers = { 'Accept': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;

    try {
      const res = await fetch(`/meshyd-api/web/v2/tasks?page=1&limit=25`, {
        method: 'GET',
        headers,
        credentials: 'include'
      });
      if (res.ok) {
        const json = await res.json();
        return json;
      }
    } catch {}

    try {
      const res = await fetch(`/meshyd-api/web/v1/tasks?page=1&limit=25`, {
        method: 'GET',
        headers,
        credentials: 'include'
      });
      if (res.ok) {
        const json = await res.json();
        return json;
      }
    } catch {}

    return null;
  }

  function getActiveTaskIdFromUrl() {
    try {
      const url = new URL(window.location.href);
      return url.searchParams.get('id') || url.searchParams.get('taskId') || null;
    } catch {
      return null;
    }
  }

  // Detect which card in the UI has the active green outline
  function detectSelectedCardTaskId(tasks) {
    if (!Array.isArray(tasks) || tasks.length === 0) return null;
    try {
      // 1. Check all elements with green border / ring or active / selected classes
      const candidateElements = document.querySelectorAll(
        '[aria-selected="true"], [data-selected="true"], [class*="selected"], [class*="active"], [class*="ring-"], [class*="border-[#"], [class*="border-green"], [class*="border-emerald"]'
      );

      for (const el of candidateElements) {
        const img = el.querySelector('img') || (el.tagName === 'IMG' ? el : null);
        if (img && img.src) {
          for (const t of tasks) {
            const preview = t.previewUrl || t.thumbnailUrl || t.texture?.previewUrl || t.texture?.thumbnailUrl;
            if (preview && (img.src.includes(preview) || preview.includes(img.src) || (t.id && img.src.includes(t.id)))) {
              return t.id || t.taskId;
            }
          }
        }
      }

      // 2. Check computed styles for green borders (Meshy's active selection ring)
      const allButtons = document.querySelectorAll('button, div[role="button"], div[class*="item"], div[class*="card"]');
      for (const el of allButtons) {
        const cs = window.getComputedStyle(el);
        const col = cs.borderColor || '';
        const m = col.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
        if (m) {
          const r = Number(m[1]), g = Number(m[2]), b = Number(m[3]);
          if (g > 140 && g > r * 1.2 && g > b * 1.2) {
            const img = el.querySelector('img');
            if (img && img.src) {
              for (const t of tasks) {
                const preview = t.previewUrl || t.thumbnailUrl || t.texture?.previewUrl || t.texture?.thumbnailUrl;
                if (preview && (img.src.includes(preview) || preview.includes(img.src) || (t.id && img.src.includes(t.id)))) {
                  return t.id || t.taskId;
                }
              }
            }
          }
        }
      }
    } catch {}
    return null;
  }

  // 4. SYNC ACTIVE TASK
  async function syncActiveTask(preferredTaskId = null) {
    const directId = preferredTaskId || getActiveTaskIdFromUrl();

    if (directId) {
      const taskData = await fetchTaskDirectly(directId);
      if (taskData) {
        chrome.runtime.sendMessage({
          action: 'MESHY_TASK_SELECTED',
          payload: { taskId: directId, data: taskData }
        }).catch(() => {});
        return taskData;
      }
    }

    // Fetch batch of recent tasks
    const recent = await fetchRecentTasks();
    const tasks = recent?.result?.data || recent?.result?.tasks || recent?.data || recent?.result;
    if (Array.isArray(tasks) && tasks.length > 0) {
      window.__meshyRecentTasks = tasks;

      // Populate background tasksById with ALL tasks so user can swap them in carousel
      chrome.runtime.sendMessage({
        action: 'MESHY_TASKS_BATCH',
        payload: { tasks }
      }).catch(() => {});

      // Check if user has a card selected in DOM with green outline
      const domSelectedId = detectSelectedCardTaskId(tasks);
      const chosen = (domSelectedId && tasks.find(t => (t.id || t.taskId) === domSelectedId)) || tasks[0];
      const chosenId = chosen?.id || chosen?.taskId;

      if (chosenId) {
        chrome.runtime.sendMessage({
          action: 'MESHY_TASK_SELECTED',
          payload: { taskId: chosenId, data: { result: chosen } }
        }).catch(() => {});
        return { result: chosen };
      }
    }

    return null;
  }

  // 5. LISTEN FOR POSTMESSAGES FROM MAIN-WORLD INTERCEPTOR
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

  // 6. LISTEN FOR EXTENSION RUNTIME COMMANDS (e.g. Refresh button in popup)
  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg?.action === 'REFRESH_ACTIVE_TASK') {
      syncActiveTask(msg.taskId || null).then(result => {
        sendResponse({ ok: !!result, task: result });
      });
      return true; // Keep message channel open for async response
    }
  });

  // 7. TRACK USER CLICKS ON CARDS IN MESHY'S SIDEBAR
  document.addEventListener('click', (e) => {
    try {
      const card = e.target.closest('button, div[role="button"], div[class*="item"], div[class*="card"]');
      if (card && window.__meshyRecentTasks) {
        const img = card.querySelector('img') || (card.tagName === 'IMG' ? card : null);
        if (img && img.src) {
          for (const t of window.__meshyRecentTasks) {
            const preview = t.previewUrl || t.thumbnailUrl || t.texture?.previewUrl || t.texture?.thumbnailUrl;
            if (preview && (img.src.includes(preview) || preview.includes(img.src) || (t.id && img.src.includes(t.id)))) {
              const matchedId = t.id || t.taskId;
              if (matchedId) {
                syncActiveTask(matchedId);
                return;
              }
            }
          }
        }
      }
    } catch {}
    setTimeout(() => syncActiveTask(), 150);
    setTimeout(() => syncActiveTask(), 450);
  }, true);

  // 8. TRACK SPA NAVIGATION & URL CHANGES
  let lastUrl = window.location.href;
  const observer = new MutationObserver(() => {
    if (window.location.href !== lastUrl) {
      lastUrl = window.location.href;
      syncActiveTask();
    }
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });

  window.addEventListener('popstate', () => syncActiveTask());

  // Initial sync on page load
  syncActiveTask();

  console.log('[MeshyFetch] Workspace bridge active with direct task synchronization.');
})();
