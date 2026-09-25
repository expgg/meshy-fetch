/**
 * Meshy Downloader - Model & Texture Parser
 * 
 * Extracts textured GLB models, preview thumbnails, and PBR textures.
 * CRITICAL FIX: Prioritizes textured outputs over untextured base meshes!
 */

import { isValidAssetUrl } from '../shared/constants.js';

export function parseTaskData(rawResponse, explicitTaskId) {
  if (!rawResponse || typeof rawResponse !== 'object') return null;

  const resultContainer = rawResponse.result || rawResponse.data || rawResponse;
  const taskResult = resultContainer?.result || resultContainer;
  if (!taskResult || typeof taskResult !== 'object') return null;

  // 1. EXTRACT TEXTURE MAPS (PBR: diffuse, roughness, normal, etc.)
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

  // 2. EXTRACT MODEL URL (PRIORITIZE TEXTURED MODEL OVER BASE MESH!)
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
