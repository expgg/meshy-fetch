/**
 * Meshy Fetch - Workspace Physical In-Page Sleek Download Widget
 * 
 * Injects a sleek, low-profile physical download widget directly into the right assets sidebar
 * on https://www.meshy.ai/workspace with format pills (GLB, OBJ, FBX, 3MF, STL, USDZ, ZIP).
 * Matches the width of the right section perfectly without covering pagination.
 */

(function initWorkspaceWidget() {
  if (window.__meshyWorkspaceWidgetInjected) return;
  window.__meshyWorkspaceWidgetInjected = true;

  const STORAGE_KEY = 'meshyOutputState';
  let activeTask = null;
  let activeFormat = 'glb';
  let isDownloading = false;

  // Format definitions
  const FORMATS = [
    { id: 'glb', label: 'GLB' },
    { id: 'obj', label: 'OBJ' },
    { id: 'fbx', label: 'FBX' },
    { id: '3mf', label: '3MF' },
    { id: 'stl', label: 'STL' },
    { id: 'usdz', label: 'USDZ' },
    { id: 'textures', label: 'ZIP (TEX)', isTextures: true }
  ];

  // 1. CREATE SLEEK WIDGET DOM
  function createWidgetElement() {
    const container = document.createElement('div');
    container.id = 'meshy-fetch-workspace-container';
    container.innerHTML = `
      <div class="meshy-fetch-header">
        <div class="meshy-fetch-title-row">
          <span class="meshy-fetch-status-dot inactive" id="meshy-widget-status-dot"></span>
          <span class="meshy-fetch-badge">Meshy Fetch</span>
          <span class="meshy-fetch-model-name" id="meshy-widget-model-name">Loading model...</span>
        </div>
        <div class="meshy-fetch-status-hint" id="meshy-widget-status-hint">Instant Free</div>
      </div>

      <button type="button" class="meshy-big-fat-btn" id="meshy-widget-big-download-btn" disabled>
        <span class="meshy-btn-icon" id="meshy-widget-btn-icon">⬇</span>
        <span id="meshy-widget-btn-label">DOWNLOAD GLB</span>
      </button>

      <div class="meshy-format-options-row" id="meshy-widget-format-row">
        <!-- Rendered dynamically -->
      </div>

      <div class="meshy-widget-status-msg" id="meshy-widget-status-msg">
        Select a model from recent generations
      </div>
    `;

    return container;
  }

  // 2. CHECK FORMAT AVAILABILITY
  function checkFormatAvailability(formatId, task) {
    if (!task) return { available: false, url: null };

    // GLB
    if (formatId === 'glb') {
      const glbUrl = task.modelUrls?.glb || 
                     (task.modelUrl && task.modelUrl.includes('.glb') ? task.modelUrl : null) ||
                     (task.modelUrl && !task.modelUrl.includes('.meshy') ? task.modelUrl : null);
      return { available: !!glbUrl, url: glbUrl };
    }

    // OBJ
    if (formatId === 'obj') {
      const objUrl = task.modelUrls?.obj || null;
      const glbUrl = task.modelUrls?.glb || (task.modelUrl && !task.modelUrl.includes('.meshy') ? task.modelUrl : null);
      return { available: !!(objUrl || glbUrl), url: objUrl || glbUrl, isConverted: !objUrl };
    }

    // FBX
    if (formatId === 'fbx') {
      const fbxUrl = task.modelUrls?.fbx || null;
      return { available: !!fbxUrl, url: fbxUrl };
    }

    // 3MF
    if (formatId === '3mf') {
      const tmfUrl = task.modelUrls?.['3mf'] || task.modelUrls?.three_mf || null;
      return { available: !!tmfUrl, url: tmfUrl };
    }

    // STL
    if (formatId === 'stl') {
      const stlUrl = task.modelUrls?.stl || null;
      return { available: !!stlUrl, url: stlUrl };
    }

    // USDZ
    if (formatId === 'usdz') {
      const usdzUrl = task.modelUrls?.usdz || null;
      return { available: !!usdzUrl, url: usdzUrl };
    }

    // TEXTURES
    if (formatId === 'textures') {
      const hasTextures = Array.isArray(task.textureUrls) && task.textureUrls.length > 0;
      return { available: hasTextures, url: hasTextures ? task.textureUrls : null };
    }

    return { available: false, url: null };
  }

  // 3. RENDER FORMAT PILLS
  function renderFormatPills(task) {
    const row = document.getElementById('meshy-widget-format-row');
    if (!row) return;

    row.innerHTML = '';

    FORMATS.forEach(fmt => {
      const { available } = checkFormatAvailability(fmt.id, task);
      const pill = document.createElement('div');
      pill.className = `meshy-format-pill ${fmt.isTextures ? 'meshy-format-textures-pill' : ''} ${!available ? 'disabled' : ''} ${activeFormat === fmt.id && available ? 'active' : ''}`;
      pill.dataset.format = fmt.id;
      pill.title = available ? `Switch to ${fmt.label}` : `${fmt.label} not generated`;
      pill.textContent = fmt.label;

      if (available) {
        pill.addEventListener('click', (e) => {
          e.stopPropagation();
          selectFormat(fmt.id);
        });
      }

      row.appendChild(pill);
    });
  }

  // 4. SELECT ACTIVE FORMAT
  function selectFormat(fmtId) {
    activeFormat = fmtId;
    renderFormatPills(activeTask);
    updateDownloadButtonState();
  }

  // 5. UPDATE BUTTON STATE & LABELS
  function updateDownloadButtonState() {
    const btn = document.getElementById('meshy-widget-big-download-btn');
    const label = document.getElementById('meshy-widget-btn-label');
    const statusMsg = document.getElementById('meshy-widget-status-msg');
    const statusDot = document.getElementById('meshy-widget-status-dot');
    const nameEl = document.getElementById('meshy-widget-model-name');
    const hintEl = document.getElementById('meshy-widget-status-hint');

    if (!btn || !label) return;

    if (!activeTask) {
      btn.disabled = true;
      label.textContent = 'NO MODEL SELECTED';
      if (statusDot) statusDot.className = 'meshy-fetch-status-dot inactive';
      if (nameEl) nameEl.textContent = 'Waiting for selection...';
      if (statusMsg) statusMsg.textContent = 'Click any model in Recent Generations';
      if (hintEl) hintEl.textContent = 'Select model';
      return;
    }

    const displayName = activeTask.modelName || activeTask.name || `Task ${activeTask.taskId?.slice(0, 8) || ''}`;
    if (nameEl) {
      nameEl.textContent = displayName;
      nameEl.title = displayName;
    }

    const { available } = checkFormatAvailability(activeFormat, activeTask);

    if (statusDot) {
      statusDot.className = available ? 'meshy-fetch-status-dot' : 'meshy-fetch-status-dot inactive';
    }

    if (isDownloading) {
      btn.disabled = true;
      label.innerHTML = `<span class="meshy-spinner"></span> EXPORTING ${activeFormat.toUpperCase()}...`;
      if (statusMsg) {
        statusMsg.className = 'meshy-widget-status-msg';
        statusMsg.innerHTML = `<span class="meshy-spinner"></span> Exporting model payload...`;
      }
      if (hintEl) hintEl.textContent = 'Exporting...';
      return;
    }

    if (available) {
      btn.disabled = false;
      label.textContent = `DOWNLOAD ${activeFormat.toUpperCase()}`;
      if (statusMsg) {
        statusMsg.className = 'meshy-widget-status-msg success';
        statusMsg.textContent = `✓ ${activeFormat.toUpperCase()} Ready for Instant Download`;
      }
      if (hintEl) hintEl.textContent = 'Ready ✓';
    } else {
      btn.disabled = true;
      label.textContent = `${activeFormat.toUpperCase()} UNAVAILABLE`;
      if (statusMsg) {
        statusMsg.className = 'meshy-widget-status-msg';
        statusMsg.textContent = `Format ${activeFormat.toUpperCase()} not generated for this model`;
      }
      if (hintEl) hintEl.textContent = 'Unavailable';
    }
  }

  // 6. EXECUTE DOWNLOAD
  async function executeDownload() {
    if (!activeTask || isDownloading) return;

    const { available, url } = checkFormatAvailability(activeFormat, activeTask);
    if (!available || !url) return;

    isDownloading = true;
    updateDownloadButtonState();

    const taskId = activeTask.taskId || 'meshy-model';
    const rawName = activeTask.modelName || `meshy-${taskId.slice(0, 8)}`;
    const sanitizedName = rawName.replace(/[/\\?%*:|"<>]/g, '_').trim();

    try {
      if (activeFormat === 'textures') {
        const textures = Array.isArray(url) ? url : [];
        if (textures.length > 0) {
          for (let i = 0; i < textures.length; i++) {
            const entry = textures[i];
            for (const [mapType, texUrl] of Object.entries(entry)) {
              if (typeof texUrl === 'string' && texUrl.startsWith('https://')) {
                const ext = texUrl.split('?')[0].split('.').pop() || 'png';
                const filename = `${sanitizedName}_${mapType}.${ext}`;
                chrome.runtime.sendMessage({
                  action: 'DOWNLOAD_TEXTURE',
                  url: texUrl,
                  filename
                });
              }
            }
          }
        }
        showSuccessMessage('✓ Textures downloaded!');
      } else {
        const filename = `${sanitizedName}.${activeFormat}`;
        chrome.runtime.sendMessage({
          action: 'DOWNLOAD_MODEL',
          url,
          taskId,
          downloadType: activeFormat,
          filename
        }, (res) => {
          if (res && !res.ok) {
            console.warn('[MeshyFetch] Background download response:', res);
          }
        });
        showSuccessMessage(`✓ Downloading ${sanitizedName}.${activeFormat}`);
      }
    } catch (err) {
      console.error('[MeshyFetch] Download failed:', err);
      showErrorMessage(err?.message || 'Download failed');
    } finally {
      setTimeout(() => {
        isDownloading = false;
        updateDownloadButtonState();
      }, 1500);
    }
  }

  function showSuccessMessage(msg) {
    const el = document.getElementById('meshy-widget-status-msg');
    if (el) {
      el.className = 'meshy-widget-status-msg success';
      el.textContent = msg;
    }
  }

  function showErrorMessage(msg) {
    const el = document.getElementById('meshy-widget-status-msg');
    if (el) {
      el.className = 'meshy-widget-status-msg error';
      el.textContent = msg;
    }
  }

  // 7. SYNC TASK FROM STORAGE
  function syncFromStorage() {
    try {
      chrome.storage.local.get(STORAGE_KEY, (res) => {
        const state = res?.[STORAGE_KEY];
        if (!state) return;

        const candidate = state.current || state.lastSuccessful;
        if (candidate && (!activeTask || activeTask.taskId !== candidate.taskId || candidate.modelUrl !== activeTask.modelUrl)) {
          activeTask = candidate;
          
          const { available } = checkFormatAvailability(activeFormat, activeTask);
          if (!available) {
            activeFormat = 'glb';
          }

          renderFormatPills(activeTask);
          updateDownloadButtonState();
        }
      });
    } catch {}
  }

  // 8. RESOLVE AND FETCH TASK DETAILS DIRECTLY
  async function fetchAndSelectTask(taskId, fallbackName = null) {
    if (!taskId) return;
    taskId = taskId.toLowerCase().trim();

    if (!activeTask || activeTask.taskId !== taskId) {
      activeTask = {
        taskId,
        modelName: fallbackName || `Task ${taskId.slice(0, 8)}`,
        taskStatus: 'SUCCEEDED'
      };
      renderFormatPills(activeTask);
      updateDownloadButtonState();
    }

    try {
      // Try v2 task endpoint first
      let res = await fetch(`/meshyd-api/web/v2/tasks/${encodeURIComponent(taskId)}`, { credentials: 'include' });
      let data = null;
      if (res.ok) {
        data = await res.json();
      } else {
        // Fallback to v1
        let resV1 = await fetch(`/meshyd-api/web/v1/tasks/${encodeURIComponent(taskId)}/status`, { credentials: 'include' });
        if (resV1.ok) {
          data = await resV1.json();
        }
      }

      if (data) {
        // Forward to background for chrome storage persistence
        chrome.runtime.sendMessage({
          action: 'MESHY_NETWORK_EVENT',
          payload: {
            phase: 'response',
            url: `${window.location.origin}/meshyd-api/web/v2/tasks/${encodeURIComponent(taskId)}`,
            status: 200,
            data
          }
        }).catch(() => {});

        chrome.runtime.sendMessage({
          action: 'MESHY_TASK_SELECTED',
          payload: { taskId, data }
        }).catch(() => {});

        // Parse directly for immediate widget update
        const n = data?.result ?? data?.data ?? data;
        const r = n?.result ?? n;
        const mu = r?.model_urls || n?.model_urls || r?.modelUrls || n?.modelUrls || null;
        const glb = mu?.glb || r?.modelUrl || n?.modelUrl || r?.generate?.modelUrl || null;
        const textures = r?.textureUrls || n?.textureUrls || r?.texture?.textureUrls || null;
        const name = r?.name || r?.modelName || n?.name || fallbackName || `Task ${taskId.slice(0, 8)}`;

        activeTask = {
          taskId,
          modelName: name,
          taskStatus: n?.status || r?.status || 'SUCCEEDED',
          modelUrl: glb,
          modelUrls: mu,
          textureUrls: textures
        };

        const { available } = checkFormatAvailability(activeFormat, activeTask);
        if (!available) activeFormat = 'glb';

        renderFormatPills(activeTask);
        updateDownloadButtonState();
      }
    } catch (err) {
      console.warn('[MeshyFetch] Task fetch error:', err);
    }
  }

  // 9. MOUNT WIDGET PHYSICALLY INTO RIGHT SIDEBAR
  function mountWidget() {
    if (document.getElementById('meshy-fetch-workspace-container')) return;

    // Look for right sidebar elements in Meshy
    const modelList = document.querySelector('[data-testid="model-list"]') || document.getElementById('model-list');
    const assetsList = document.querySelector('[data-testid="assets-list"]');
    const scrollArea = assetsList ? assetsList.closest('[data-slot="scroll-area"]') : document.querySelector('[data-slot="scroll-area"]');

    let targetParent = null;
    let insertBeforeEl = null;

    if (modelList) {
      // Find the inner flex-col container
      const col = modelList.querySelector('div[class*="flex-col"]') || modelList;
      targetParent = col;

      // Look for pagination container at bottom of sidebar (e.g. element with 1/1 or grid-cols)
      const pagination = col.querySelector('div[class*="grid-cols-[1fr_auto_1fr]"]') || 
                         col.querySelector('[data-testid*="page"], [class*="pagination"]') || 
                         col.lastElementChild;
      if (pagination && pagination !== col) {
        insertBeforeEl = pagination;
      }
    } else if (scrollArea && scrollArea.parentElement) {
      targetParent = scrollArea.parentElement;
      insertBeforeEl = scrollArea.nextSibling;
    }

    const widget = createWidgetElement();

    const bigBtn = widget.querySelector('#meshy-widget-big-download-btn');
    if (bigBtn) {
      bigBtn.addEventListener('click', (e) => {
        e.preventDefault();
        executeDownload();
      });
    }

    if (targetParent) {
      if (insertBeforeEl) {
        targetParent.insertBefore(widget, insertBeforeEl);
      } else {
        targetParent.appendChild(widget);
      }
      console.log('[MeshyFetch] Sleek physical download widget mounted inside right section.');
    } else {
      // Fallback if right panel is not yet rendered
      return;
    }

    renderFormatPills(activeTask);
    updateDownloadButtonState();
    syncFromStorage();
  }

  // 10. LISTEN TO CLICKS ON CARDS IN MESHY'S SIDEBAR
  document.addEventListener('click', (e) => {
    try {
      const card = e.target.closest('[data-testid="assets-card"], div.aspect-square, div[class*="aspect-square"]');
      if (card) {
        const img = card.querySelector('img');
        const srcStr = (img?.getAttribute('srcset') || '') + ' ' + (img?.src || '');
        const uuidMatch = srcStr.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
        if (uuidMatch) {
          const taskId = uuidMatch[0].toLowerCase();
          fetchAndSelectTask(taskId);
        } else {
          setTimeout(syncFromStorage, 150);
        }
      }
    } catch {}
  }, true);

  // 11. AUTO-DETECT ACTIVE OR FIRST CARD ON INITIAL LOAD
  function autoDetectFirstCard() {
    if (activeTask && activeTask.modelUrl) return;
    try {
      const assetsList = document.querySelector('[data-testid="assets-list"]');
      if (!assetsList) return;
      const card = assetsList.querySelector('[data-testid="assets-card"]') || assetsList.querySelector('div.aspect-square');
      if (card) {
        const img = card.querySelector('img');
        const srcStr = (img?.getAttribute('srcset') || '') + ' ' + (img?.src || '');
        const uuidMatch = srcStr.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
        if (uuidMatch) {
          fetchAndSelectTask(uuidMatch[0].toLowerCase());
        }
      }
    } catch {}
  }

  // 12. STORAGE CHANGES LISTENER
  try {
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area === 'local' && changes[STORAGE_KEY]) {
        syncFromStorage();
      }
    });
  } catch {}

  // 13. LIFECYCLE INITIALIZATION & MUTATION OBSERVER
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      mountWidget();
      setTimeout(autoDetectFirstCard, 600);
    });
  } else {
    mountWidget();
    setTimeout(autoDetectFirstCard, 600);
  }

  let lastHref = window.location.href;
  const domObserver = new MutationObserver(() => {
    if (!document.getElementById('meshy-fetch-workspace-container')) {
      mountWidget();
      setTimeout(autoDetectFirstCard, 500);
    }
    if (window.location.href !== lastHref) {
      lastHref = window.location.href;
      syncFromStorage();
      setTimeout(autoDetectFirstCard, 500);
    }
  });

  domObserver.observe(document.documentElement, { childList: true, subtree: true });
})();
