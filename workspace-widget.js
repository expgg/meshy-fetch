/**
 * Meshy Fetch - Workspace Physical In-Page Download Widget
 * 
 * Injects a prominent, physical download button directly under the recent generations section
 * on https://www.meshy.ai/workspace with format pills (GLB, OBJ, FBX, 3MF, STL, USDZ, Textures).
 * Inactive formats are grayed out.
 */

(function initWorkspaceWidget() {
  if (window.__meshyWorkspaceWidgetInjected) return;
  window.__meshyWorkspaceWidgetInjected = true;

  const STORAGE_KEY = 'meshyOutputState';
  let activeTask = null;
  let activeFormat = 'glb'; // default
  let isDownloading = false;

  // Format definitions
  const FORMATS = [
    { id: 'glb', label: 'GLB', tag: 'Standard' },
    { id: 'obj', label: 'OBJ', tag: 'Wavefront' },
    { id: 'fbx', label: 'FBX', tag: 'Autodesk' },
    { id: '3mf', label: '3MF', tag: 'Print' },
    { id: 'stl', label: 'STL', tag: 'CAD' },
    { id: 'usdz', label: 'USDZ', tag: 'Apple AR' },
    { id: 'textures', label: 'TEXTURES (ZIP)', tag: 'PBR Maps', fullWidth: true }
  ];

  // 1. CREATE WIDGET DOM
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
      </div>

      <button type="button" class="meshy-big-fat-btn" id="meshy-widget-big-download-btn" disabled>
        <div class="meshy-btn-main-text">
          <span id="meshy-widget-btn-icon">⬇</span>
          <span id="meshy-widget-btn-label">DOWNLOAD GLB</span>
        </div>
        <div class="meshy-btn-sub-text" id="meshy-widget-btn-sub">Instant Free Export • Direct Stream</div>
      </button>

      <div class="meshy-format-section-title">
        <span>Available Formats</span>
        <span style="font-size: 10px; color: #64748b; font-weight: 500;">Select Format</span>
      </div>

      <div class="meshy-format-options-grid" id="meshy-widget-format-grid">
        <!-- Injected dynamically -->
      </div>

      <div class="meshy-widget-status-msg" id="meshy-widget-status-msg">
        Select a model from recent generations
      </div>
    `;

    return container;
  }

  // 2. CHECK FORMAT AVAILABILITY FOR TASK
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
      // OBJ is available either via direct URL or convertible from GLB
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
    const grid = document.getElementById('meshy-widget-format-grid');
    if (!grid) return;

    grid.innerHTML = '';

    FORMATS.forEach(fmt => {
      const { available } = checkFormatAvailability(fmt.id, task);
      const pill = document.createElement('div');
      pill.className = `meshy-format-pill ${fmt.fullWidth ? 'meshy-format-textures-btn' : ''} ${!available ? 'disabled' : ''} ${activeFormat === fmt.id && available ? 'active' : ''}`;
      pill.dataset.format = fmt.id;

      if (!available) {
        pill.title = `${fmt.label} is not available for this model`;
      } else {
        pill.title = `Click to choose ${fmt.label}`;
      }

      pill.innerHTML = `
        <span>${fmt.label}</span>
        <span class="meshy-format-tag">${!available ? 'N/A' : fmt.tag}</span>
      `;

      if (available) {
        pill.addEventListener('click', (e) => {
          e.stopPropagation();
          selectFormat(fmt.id);
        });
      }

      grid.appendChild(pill);
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

    if (!btn || !label) return;

    if (!activeTask) {
      btn.disabled = true;
      label.textContent = 'NO MODEL SELECTED';
      if (statusDot) statusDot.className = 'meshy-fetch-status-dot inactive';
      if (nameEl) nameEl.textContent = 'Waiting for selection...';
      if (statusMsg) statusMsg.textContent = 'Click any model in Recent Generations';
      return;
    }

    if (nameEl) {
      nameEl.textContent = activeTask.modelName || activeTask.name || `Task ${activeTask.taskId?.slice(0, 8) || ''}`;
      nameEl.title = nameEl.textContent;
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
        statusMsg.innerHTML = `<span class="meshy-spinner"></span> Exporting model payload to disk...`;
      }
      return;
    }

    if (available) {
      btn.disabled = false;
      label.textContent = `DOWNLOAD ${activeFormat.toUpperCase()}`;
      if (statusMsg) {
        statusMsg.className = 'meshy-widget-status-msg success';
        statusMsg.textContent = `✓ ${activeFormat.toUpperCase()} Ready for Instant Download`;
      }
    } else {
      btn.disabled = true;
      label.textContent = `${activeFormat.toUpperCase()} UNAVAILABLE`;
      if (statusMsg) {
        statusMsg.className = 'meshy-widget-status-msg';
        statusMsg.textContent = `Format ${activeFormat.toUpperCase()} not generated for this model`;
      }
    }
  }

  // 6. EXECUTE DOWNLOAD (V1 NATIVE ENGINE)
  async function executeDownload() {
    if (!activeTask || isDownloading) return;

    const { available, url, isConverted } = checkFormatAvailability(activeFormat, activeTask);
    if (!available || !url) return;

    isDownloading = true;
    updateDownloadButtonState();

    const taskId = activeTask.taskId || 'meshy-model';
    const rawName = activeTask.modelName || 'meshy-model';
    const sanitizedName = rawName.replace(/[/\\?%*:|"<>]/g, '_').trim();

    try {
      if (activeFormat === 'textures') {
        // Download all texture files
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
        // Direct model download (GLB, OBJ, FBX, 3MF, STL, USDZ)
        const filename = `${sanitizedName}.${activeFormat}`;
        
        chrome.runtime.sendMessage({
          action: 'DOWNLOAD_MODEL',
          url,
          taskId,
          downloadType: activeFormat,
          filename
        }, (res) => {
          if (res && !res.ok) {
            console.warn('[MeshyFetch] Background download message response:', res);
          }
        });

        showSuccessMessage(`✓ Downloading ${sanitizedName}.${activeFormat}`);
      }
    } catch (err) {
      console.error('[MeshyFetch] Download execution failed:', err);
      showErrorMessage(err?.message || 'Download failed');
    } finally {
      setTimeout(() => {
        isDownloading = false;
        updateDownloadButtonState();
      }, 1800);
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
          
          // If active format not available for this task, switch to GLB
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

  // 8. MOUNT WIDGET INTO MESHY DOM
  function mountWidget() {
    if (document.getElementById('meshy-fetch-workspace-container')) return;

    // Search for Recent Generations container in Meshy Workspace
    // In Meshy workspace, the right panel has search input and generation grid
    const searchInput = document.querySelector('input[placeholder*="Search"], input[placeholder*="generation"]');
    let targetContainer = null;

    if (searchInput) {
      // Find parent sidebar / panel
      let parent = searchInput.parentElement;
      for (let i = 0; i < 8 && parent; i++) {
        // Look for the panel container that holds the generation grid
        const hasGrid = parent.querySelector('div[class*="grid"], [role="grid"], button[class*="card"]');
        if (hasGrid && parent.children.length >= 2) {
          targetContainer = parent;
          break;
        }
        parent = parent.parentElement;
      }
    }

    const widget = createWidgetElement();

    // Hook click listener to Big Fat Download Button
    const bigBtn = widget.querySelector('#meshy-widget-big-download-btn');
    if (bigBtn) {
      bigBtn.addEventListener('click', (e) => {
        e.preventDefault();
        executeDownload();
      });
    }

    if (targetContainer) {
      // Look for pagination container at bottom of sidebar (e.g. element with < 1/1 > or buttons)
      const pagination = targetContainer.querySelector('[class*="pagination"], [class*="footer"], div:last-child');
      if (pagination && pagination.parentElement === targetContainer) {
        targetContainer.insertBefore(widget, pagination);
      } else {
        targetContainer.appendChild(widget);
      }
      console.log('[MeshyFetch] Physical download widget mounted under recent generations.');
    } else {
      // Fallback: Dock at bottom right/left of workspace
      widget.style.position = 'fixed';
      widget.style.bottom = '20px';
      widget.style.right = '24px';
      widget.style.width = '340px';
      widget.style.maxHeight = '90vh';
      widget.style.zIndex = '9999999';
      document.body.appendChild(widget);
      console.log('[MeshyFetch] Physical download widget mounted as bottom dock.');
    }

    renderFormatPills(activeTask);
    updateDownloadButtonState();
    syncFromStorage();
  }

  // 9. LISTEN TO CLICKS ON CARDS IN MESHY'S SIDEBAR
  document.addEventListener('click', (e) => {
    try {
      const card = e.target.closest('button, div[role="button"], div[class*="card"], div[class*="item"]');
      if (card) {
        setTimeout(syncFromStorage, 150);
        setTimeout(syncFromStorage, 450);
      }
    } catch {}
  }, true);

  // 10. STORAGE CHANGES LISTENER
  try {
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area === 'local' && changes[STORAGE_KEY]) {
        syncFromStorage();
      }
    });
  } catch {}

  // 11. LIFECYCLE INITIALIZATION & MUTATION OBSERVER
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', mountWidget);
  } else {
    mountWidget();
  }

  // Handle SPA transitions in Meshy
  let lastHref = window.location.href;
  const domObserver = new MutationObserver(() => {
    if (!document.getElementById('meshy-fetch-workspace-container')) {
      mountWidget();
    }
    if (window.location.href !== lastHref) {
      lastHref = window.location.href;
      syncFromStorage();
    }
  });

  domObserver.observe(document.documentElement, { childList: true, subtree: true });
})();
