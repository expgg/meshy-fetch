/**
 * Meshy Downloader - Background Service Worker
 * 
 * Architecture:
 * 1. Storage & State Management: Handles local extension state (tasks, active model, entitlements).
 * 2. Main World Script Registration: Injects interceptors into Meshy's JavaScript context to hook Web Workers & Fetch.
 * 3. Task & Texture Parser: Extracts textured GLB models, preview images, and PBR texture maps.
 * 4. Download Controller: Natively triggers browser downloads without remote servers or paywalls.
 */

// ============================================================================
// 1. CONSTANTS & CONFIGURATION
// ============================================================================

const STORAGE_KEYS = {
  OUTPUT_STATE: 'meshyOutputState',
  ENTITLEMENT: 'meshyEntitlement',
  COMMUNITY_STATE: 'meshyCommunityState',
  PENDING_DOWNLOADS: 'meshyPendingDownloads',
  PENDING_CONSUMPTIONS: 'meshyPendingConsumptions',
  INSTALLATION_ID: 'meshyInstallationId'
};

const DEFAULT_STATE = {
  active: false,
  activeUrl: null,
  activeSince: null,
  activeTaskId: null,
  current: null,
  lastSuccessful: null,
  tasksById: {}
};

const UNLIMITED_ENTITLEMENT = {
  exists: true,
  userId: 'open-source-user',
  email: 'unlimited@meshy-downloader.dev',
  isPaid: true,
  plan: 'lifetime',
  freeDownloadsUsed: 0,
  freeDownloadsRemaining: null,
  communityModelsUsed: 0,
  communityModelsRemaining: null,
  communityModelsLimit: null,
  textureDownloadsUsed: 0,
  textureDownloadsRemaining: null,
  subscriptionStatus: 'active',
  accountSlots: 999,
  linkedAccountsCount: 1,
  linkedAccountsRemaining: 998,
  accountType: 'unlimited',
  paidAt: new Date().toISOString(),
  syncedAt: new Date().toISOString()
};

const TASK_STATUS_REGEX = /\/meshyd-api\/web\/(?:public\/)?v\d+\/tasks\/([^/]+)\/status(?:\?|$)/;
const TASK_V2_REGEX = /\/meshyd-api\/web\/(?:public\/)?v\d+\/tasks\/([^/?#]+)(?:[?#].*)?$/;

// ============================================================================
// 2. HELPER UTILITIES
// ============================================================================

function isValidAssetUrl(url) {
  if (typeof url !== 'string' || !url.startsWith('https://')) return false;
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.toLowerCase();
    return (
      host.endsWith('.meshy.ai') ||
      host.includes('meshy.ai') ||
      host.includes('amazonaws.com') ||
      host.includes('cloudfront.net')
    );
  } catch {
    return false;
  }
}

function normalizeStatus(status) {
  return typeof status === 'string' ? status.toUpperCase().trim() : null;
}

// Queue for sequential async state mutations
let stateQueue = Promise.resolve();
function queueStateUpdate(fn) {
  stateQueue = stateQueue.then(fn).catch(err => {
    console.error('[MeshyDownloader] State update error:', err);
  });
}

// ============================================================================
// 3. STORAGE ACCESSORS
// ============================================================================

async function getOutputState() {
  const result = await chrome.storage.local.get(STORAGE_KEYS.OUTPUT_STATE);
  return result[STORAGE_KEYS.OUTPUT_STATE] ? { ...DEFAULT_STATE, ...result[STORAGE_KEYS.OUTPUT_STATE] } : DEFAULT_STATE;
}

async function setOutputState(state) {
  await chrome.storage.local.set({ [STORAGE_KEYS.OUTPUT_STATE]: state });
}

async function ensureUnlimitedEntitlement() {
  await chrome.storage.local.set({ [STORAGE_KEYS.ENTITLEMENT]: UNLIMITED_ENTITLEMENT });
}

// ============================================================================
// 4. TASK & TEXTURE PARSER (Fixes untextured model & preview bug)
// ============================================================================

/**
 * Extracts model details from task responses.
 * CRITICAL FIX: Prioritizes textured models and textured previews over untextured base meshes!
 */
function parseTaskData(rawResponse, explicitTaskId) {
  if (!rawResponse || typeof rawResponse !== 'object') return null;

  const resultContainer = rawResponse.result || rawResponse.data || rawResponse;
  const taskResult = resultContainer?.result || resultContainer;
  if (!taskResult || typeof taskResult !== 'object') return null;

  // 1. EXTRACT TEXTURE MAPS (PBR maps: diffuse, roughness, normal, etc.)
  let texturesList = null;
  const rawTextures = taskResult.textureUrls ?? 
                      taskResult.texture?.textureUrls ?? 
                      taskResult.texture_urls ?? 
                      taskResult.texture?.texture_urls;

  if (Array.isArray(rawTextures) && rawTextures.length > 0) {
    const cleaned = [];
    for (const item of rawTextures) {
      if (item && typeof item === 'object') {
        const entry = {};
        let hasUrl = false;
        for (const [key, val] of Object.entries(item)) {
          if (typeof val === 'string' && val.startsWith('https://')) {
            entry[key] = val;
            hasUrl = true;
          }
        }
        if (hasUrl) cleaned.push(entry);
      }
    }
    if (cleaned.length > 0) texturesList = cleaned;
  }

  // 2. EXTRACT MODEL URL (PRIORITIZE TEXTURED MODEL OVER UNTEXTURED BASE MESH!)
  const modelCandidate = taskResult.texture?.modelUrl ??
                         taskResult.texture?.model_url ??
                         taskResult.model_urls?.glb ??
                         taskResult.model_urls?.meshy ??
                         taskResult.modelUrl ??
                         taskResult.generate?.modelUrl ??
                         taskResult.mesh?.modelUrl;

  const validModelUrl = isValidAssetUrl(modelCandidate) ? String(modelCandidate) : null;

  // 3. EXTRACT PREVIEW URL (PRIORITIZE TEXTURED PREVIEW OVER UNTEXTURED STATUE!)
  const previewCandidate = taskResult.texture?.previewUrl ??
                           taskResult.texture?.thumbnailUrl ??
                           taskResult.texture?.preview_url ??
                           taskResult.previewUrl ??
                           taskResult.preview_url ??
                           taskResult.thumbnailUrl ??
                           taskResult.thumbnail_url ??
                           resultContainer.previewUrl ??
                           resultContainer.thumbnailUrl;

  const validPreviewUrl = isValidAssetUrl(previewCandidate) ? String(previewCandidate) : null;

  // 4. EXTRACT TASK METADATA
  const taskId = explicitTaskId ?? (typeof resultContainer.id === 'string' ? resultContainer.id : null);
  const taskStatus = typeof resultContainer.status === 'string' ? resultContainer.status : (taskResult.status ?? 'SUCCEEDED');
  const modelName = taskResult.name ?? 
                    taskResult.modelName ?? 
                    taskResult.taskName ?? 
                    taskResult.title ?? 
                    resultContainer.name ?? 
                    'Meshy-Model';

  return {
    taskId,
    capturedAt: new Date().toISOString(),
    taskStatus,
    retryCount: typeof resultContainer.retryCount === 'number' ? resultContainer.retryCount : null,
    modelUrl: validModelUrl,
    previewUrl: validPreviewUrl,
    modelName: String(modelName),
    textureUrls: texturesList
  };
}

// ============================================================================
// 5. MAIN WORLD SCRIPT REGISTRATION & BRIDGE INJECTION
// ============================================================================

async function registerMainWorldScripts() {
  try {
    // Unregister first to prevent duplicate registration errors
    try {
      await chrome.scripting.unregisterContentScripts({
        ids: ['srcContentsCommunityInterceptor', 'srcContentsMeshyInterceptor']
      });
    } catch {}

    await chrome.scripting.registerContentScripts([
      {
        id: 'srcContentsCommunityInterceptor',
        js: ['community-interceptor.2e9c3aa0.js'],
        matches: ['https://www.meshy.ai/*', 'https://meshy.ai/*'],
        runAt: 'document_start',
        world: 'MAIN'
      },
      {
        id: 'srcContentsMeshyInterceptor',
        js: ['meshy-interceptor.8904ffc7.js'],
        matches: ['https://www.meshy.ai/*', 'https://meshy.ai/*'],
        runAt: 'document_start',
        world: 'MAIN'
      }
    ]);
    console.log('[MeshyDownloader] Main-world interceptors registered.');
  } catch (err) {
    console.warn('[MeshyDownloader] Content script registration notice:', err);
  }
}

async function ensureBridgeInTab(tabId) {
  try {
    const manifest = chrome.runtime.getManifest();
    const bridgeFiles = [];
    if (manifest.content_scripts) {
      for (const cs of manifest.content_scripts) {
        if (cs.js) {
          for (const js of cs.js) {
            if (js.includes('bridge') || js.includes('meshy-bridge')) {
              bridgeFiles.push(js);
            }
          }
        }
      }
    }
    if (bridgeFiles.length > 0) {
      await chrome.scripting.executeScript({
        target: { tabId },
        files: bridgeFiles
      });
    }
  } catch {}
}

async function injectBridgeInAllTabs() {
  try {
    const tabs = await chrome.tabs.query({ url: ['https://www.meshy.ai/*', 'https://meshy.ai/*'] });
    for (const tab of tabs) {
      if (typeof tab.id === 'number') {
        await ensureBridgeInTab(tab.id);
      }
    }
  } catch {}
}

// ============================================================================
// 6. MESSAGE LISTENERS (Network Sniffing, Selection & Downloads)
// ============================================================================

// A. Intercepted Network Status Events
chrome.runtime.onMessage.addListener(msg => {
  if (msg?.action !== 'MESHY_NETWORK_EVENT') return;
  const payload = msg.payload;
  if (!payload?.url) return;

  queueStateUpdate(async () => {
    const match = payload.url.match(TASK_STATUS_REGEX);
    const taskId = match?.[1] ?? null;
    if (!taskId) return;

    const state = await getOutputState();

    if (payload.phase === 'start') {
      await setOutputState({
        ...state,
        active: true,
        activeUrl: payload.url,
        activeSince: new Date().toISOString(),
        activeTaskId: taskId
      });
      return;
    }

    const parsedTask = parseTaskData(payload.data, taskId);
    if (!parsedTask) return;

    const taskWithMeta = {
      ...parsedTask,
      url: payload.url,
      httpStatus: typeof payload.status === 'number' ? payload.status : 200
    };

    const tasksById = { ...state.tasksById, [taskId]: taskWithMeta };
    const status = normalizeStatus(taskWithMeta.taskStatus);
    const isSuccess = taskWithMeta.httpStatus === 200 && status === 'SUCCEEDED';

    await setOutputState({
      ...state,
      active: status === 'PENDING' || status === 'IN_PROGRESS',
      activeUrl: payload.url,
      activeTaskId: taskId,
      current: taskWithMeta,
      lastSuccessful: isSuccess ? taskWithMeta : (state.lastSuccessful?.taskId === taskId ? taskWithMeta : state.lastSuccessful),
      tasksById
    });
  });
});

// B. Task Selection Events (Clicking models in the Meshy UI)
chrome.runtime.onMessage.addListener(msg => {
  if (msg?.action !== 'MESHY_TASK_SELECTED') return;
  const taskId = msg.payload?.taskId;
  const rawData = msg.payload?.data;

  if (typeof taskId === 'string' && taskId) {
    queueStateUpdate(async () => {
      const state = await getOutputState();
      
      // Parse fresh data if attached to the selection event
      let taskData = state.tasksById?.[taskId] ?? null;
      if (rawData) {
        const parsed = parseTaskData(rawData, taskId);
        if (parsed) {
          taskData = { ...taskData, ...parsed };
          state.tasksById[taskId] = taskData;
        }
      }

      await setOutputState({
        ...state,
        active: false,
        activeTaskId: taskId,
        activeUrl: taskData?.url ?? state.activeUrl,
        current: taskData,
        lastSuccessful: taskData ?? (state.lastSuccessful?.taskId === taskId ? state.lastSuccessful : null)
      });
    });
  }
});

// C. Direct Model Download Handler
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg?.action !== 'DOWNLOAD_MODEL') return;
  const { url, taskId, previewUrl, downloadType } = msg;

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

  return true; // Keep message channel open for async response
});

// D. Direct Texture Download Handler
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg?.action !== 'DOWNLOAD_TEXTURE') return;
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

  return true;
});

// E. Identity & Entitlement Synchronization
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg?.action === 'MESHY_IDENTITY_RESOLVED' || msg?.action === 'CONSUME_COMPLETED_DOWNLOAD') {
    ensureUnlimitedEntitlement();
    sendResponse({ ok: true });
    return true;
  }
});

// ============================================================================
// 7. INITIALIZATION
// ============================================================================

chrome.runtime.onInstalled.addListener(() => {
  ensureUnlimitedEntitlement();
  registerMainWorldScripts();
  injectBridgeInAllTabs();
});

ensureUnlimitedEntitlement();
registerMainWorldScripts();
injectBridgeInAllTabs();