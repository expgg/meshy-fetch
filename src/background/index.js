/**
 * Meshy Downloader - Background Service Worker Entry Point
 * 
 * Modular, open-source ES Module architecture.
 */

import { TASK_STATUS_REGEX } from '../shared/constants.js';
import { getOutputState, setOutputState, queueStateUpdate, ensureUnlimitedEntitlement } from './storage.js';
import { parseTaskData } from './parser.js';
import { handleModelDownload, handleTextureDownload } from './downloader.js';
import { registerMainWorldScripts, injectBridgeInAllTabs } from './injector.js';

// ============================================================================
// MESSAGE LISTENERS
// ============================================================================

// 1. Intercepted Network Status Events (from meshy-bridge)
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
    const status = (taskWithMeta.taskStatus || '').toUpperCase().trim();
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

// 2. Task Selection Events (when user selects a task in Meshy's history)
chrome.runtime.onMessage.addListener(msg => {
  if (msg?.action !== 'MESHY_TASK_SELECTED') return;
  const taskId = msg.payload?.taskId;
  const rawData = msg.payload?.data;

  if (typeof taskId === 'string' && taskId) {
    queueStateUpdate(async () => {
      const state = await getOutputState();
      
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

// 3. Model Downloads
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg?.action === 'DOWNLOAD_MODEL') {
    handleModelDownload(msg, sendResponse);
    return true;
  }
});

// 4. Texture Downloads
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg?.action === 'DOWNLOAD_TEXTURE') {
    handleTextureDownload(msg, sendResponse);
    return true;
  }
});

// 5. Entitlement & Lifecycle Synchronization
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg?.action === 'MESHY_IDENTITY_RESOLVED' || msg?.action === 'CONSUME_COMPLETED_DOWNLOAD') {
    ensureUnlimitedEntitlement();
    sendResponse({ ok: true });
    return true;
  }
});

// ============================================================================
// LIFECYCLE & INITIALIZATION
// ============================================================================

chrome.runtime.onInstalled.addListener(() => {
  ensureUnlimitedEntitlement();
  registerMainWorldScripts();
  injectBridgeInAllTabs();
});

ensureUnlimitedEntitlement();
registerMainWorldScripts();
injectBridgeInAllTabs();
