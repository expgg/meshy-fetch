/**
 * Meshy Downloader - Content Script & Bridge Injector
 */

export async function registerMainWorldScripts() {
  try {
    try {
      await chrome.scripting.unregisterContentScripts({
        ids: ['srcContentsCommunityInterceptor', 'srcContentsMeshyInterceptor']
      });
    } catch {}

    await chrome.scripting.registerContentScripts([
      {
        id: 'srcContentsCommunityInterceptor',
        js: ['src/content/community-interceptor.js'],
        matches: ['https://www.meshy.ai/*', 'https://meshy.ai/*'],
        runAt: 'document_start',
        world: 'MAIN'
      },
      {
        id: 'srcContentsMeshyInterceptor',
        js: ['src/content/meshy-interceptor.js'],
        matches: ['https://www.meshy.ai/*', 'https://meshy.ai/*'],
        runAt: 'document_start',
        world: 'MAIN'
      }
    ]);
    console.log('[MeshyDownloader] MAIN world interceptors registered.');
  } catch (err) {
    console.warn('[MeshyDownloader] Script registration note:', err);
  }
}

export async function ensureBridgeInTab(tabId) {
  try {
    const manifest = chrome.runtime.getManifest();
    const bridgeFiles = [];
    if (manifest.content_scripts) {
      for (const cs of manifest.content_scripts) {
        if (cs.js) {
          for (const js of cs.js) {
            bridgeFiles.push(js);
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

export async function injectBridgeInAllTabs() {
  try {
    const tabs = await chrome.tabs.query({ url: ['https://www.meshy.ai/*', 'https://meshy.ai/*'] });
    for (const tab of tabs) {
      if (typeof tab.id === 'number') {
        await ensureBridgeInTab(tab.id);
      }
    }
  } catch {}
}
