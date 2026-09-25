/**
 * Meshy Downloader - Storage & State Management
 */

import { STORAGE_KEYS, DEFAULT_OUTPUT_STATE, UNLIMITED_ENTITLEMENT } from '../shared/constants.js';

let stateQueue = Promise.resolve();

export function queueStateUpdate(fn) {
  stateQueue = stateQueue.then(fn).catch(err => {
    console.error('[MeshyDownloader] State queue error:', err);
  });
}

export async function getOutputState() {
  const result = await chrome.storage.local.get(STORAGE_KEYS.OUTPUT_STATE);
  return result[STORAGE_KEYS.OUTPUT_STATE] 
    ? { ...DEFAULT_OUTPUT_STATE, ...result[STORAGE_KEYS.OUTPUT_STATE] } 
    : DEFAULT_OUTPUT_STATE;
}

export async function setOutputState(state) {
  await chrome.storage.local.set({ [STORAGE_KEYS.OUTPUT_STATE]: state });
}

export async function ensureUnlimitedEntitlement() {
  await chrome.storage.local.set({ [STORAGE_KEYS.ENTITLEMENT]: UNLIMITED_ENTITLEMENT });
}
