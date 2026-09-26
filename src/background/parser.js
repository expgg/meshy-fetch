/**
 * Meshy Fetch - Model & Texture Parser
 * 
 * Extracts textured GLB models, preview thumbnails, and PBR textures.
 * Explicitly prioritizes textured outputs over untextured base meshes!
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

  // 2. EXTRACT MODEL URL (PRIORITIZE TEXTURED GLB OVER UNTEXTURED BASE MESH & PROPRIETARY .meshy)
  let rawModel = taskResult.texture?.model_urls?.glb ??
                 taskResult.model_urls?.glb ??
                 (typeof taskResult.texture?.modelUrl === 'string' && !taskResult.texture.modelUrl.includes('.meshy') ? taskResult.texture.modelUrl : null) ??
                 (typeof taskResult.modelUrl === 'string' && !taskResult.modelUrl.includes('.meshy') ? taskResult.modelUrl : null) ??
                 (typeof taskResult.generate?.modelUrl === 'string' && !taskResult.generate.modelUrl.includes('.meshy') ? taskResult.generate.modelUrl : null) ??
                 (typeof taskResult.mesh?.modelUrl === 'string' && !taskResult.mesh.modelUrl.includes('.meshy') ? taskResult.mesh.modelUrl : null) ??
                 taskResult.texture?.modelUrl ??
                 taskResult.modelUrl ??
                 taskResult.texture?.model_urls?.meshy ??
                 taskResult.model_urls?.meshy;

  // If model is an object with format keys
  if (rawModel && typeof rawModel === 'object') {
    rawModel = rawModel.glb || rawModel.url || rawModel.meshy || null;
  }

  const validModelUrl = isValidAssetUrl(rawModel) ? String(rawModel) : null;

  // 3. EXTRACT PREVIEW URL (PRIORITIZE TEXTURED PREVIEW OVER UNTEXTURED STATUE!)
  let rawPreview = taskResult.texture?.previewUrl ??
                   taskResult.texture?.thumbnailUrl ??
                   taskResult.texture?.preview_url ??
                   taskResult.previewUrl ??
                   taskResult.preview_url ??
                   taskResult.thumbnailUrl ??
                   taskResult.thumbnail_url ??
                   taskResult.imageUrl ??
                   taskResult.coverUrl ??
                   resultContainer.previewUrl ??
                   resultContainer.thumbnailUrl;

  if (rawPreview && typeof rawPreview === 'object') {
    rawPreview = rawPreview.url || rawPreview.previewUrl || null;
  }

  const validPreviewUrl = isValidAssetUrl(rawPreview) ? String(rawPreview) : null;

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
