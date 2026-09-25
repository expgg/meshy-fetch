# 🧊 Meshy Fetch

<p align="center">
  <img src="logo.png" width="140" height="140" alt="Meshy Fetch Logo" style="border-radius: 28px;" />
</p>

<p align="center">
  <b>Free & Unlimited 3D Model Exporter for Meshy.ai</b><br>
  <i>Export GLB, OBJ, and full texture packs directly from your browser with zero paywalls.</i>
</p>

---

## ✨ Features

- ⚡ **1-Click GLB Export:** Intercepts and downloads high-fidelity 3D meshes directly from browser memory.
- 🔄 **Client-Side OBJ Conversion:** Convert GLB models to Wavefront OBJ format on-the-fly without uploading to third-party servers.
- 🎨 **Full PBR Textures:** Extract diffuse, roughness, and normal maps directly from Meshy generations.
- 🔄 **Instant Live Refresh:** 1-click refresh button directly queries Meshy's v2 task endpoints to fetch the latest textured models and previews.
- 🛡️ **Zero Paywall & Zero Telemetry:** Completely disconnected from remote tracking servers (`onrender.com`). Runs 100% offline in your own browser.
- 🌐 **Supports Both Modes:** Works on personal workspace creations and public community showcase posts.

---

## 🚀 Installation

1. **Clone or Download** this repository:
   ```bash
   git clone https://github.com/expgg/meshy-fetch.git
   ```
   *(Or download as a ZIP and extract it to a folder).*

2. Open Google Chrome, Brave, or Microsoft Edge and navigate to:
   ```
   chrome://extensions
   ```

3. Toggle on **Developer mode** in the upper-right corner.

4. Click **Load unpacked** and select the `meshy-downloader` folder.

5. Pin the extension to your toolbar, navigate to [meshy.ai](https://www.meshy.ai), and open the popup on any generated model or post.

---

## 📁 Project Architecture

The codebase is organized into clean, unminified ES modules with clear separation of concerns:

```
meshy-downloader/
├── src/
│   ├── background/
│   │   ├── index.js          # Service worker entry point & message router
│   │   ├── parser.js         # Extracts textured GLBs, preview images & PBR textures
│   │   ├── storage.js        # Output state & offline storage management
│   │   ├── downloader.js     # Native chrome.downloads dispatcher
│   │   └── injector.js       # Registers MAIN-world hooks & injects tab bridges
│   ├── content/
│   │   ├── meshy-interceptor.js     # MAIN world: hooks window.fetch & XMLHttpRequest
│   │   ├── meshy-bridge.js          # ISOLATED world: relays task selection & events
│   │   ├── community-interceptor.js # MAIN world: hooks window.Worker for glTF buffer
│   │   └── community-bridge.js      # ISOLATED world: coordinates community model buffers
│   └── shared/
│       └── constants.js      # Shared storage keys, asset domains & regexes
├── assets/
│   └── icons/                # Extension icons (16px, 32px, 48px, 64px, 128px)
├── popup.html / popup.*      # Sleek cyber-cyan client interface
└── index.html                # Minimal landing page for Cloudflare Pages
```

---

## 🛠️ How It Works Internally

Meshy streams 3D model data to client-side WebGL viewers (Three.js/Babylon) so models can render on your screen:

1. **Web Worker Interception:** The extension hooks `window.Worker` and monitors binary data transfers. Whenever the loader thread outputs a buffer starting with the `glTF` magic header (`0x67 0x6C 0x54 0x46`), the raw binary is captured from RAM.
2. **API Traffic Sniffing:** For workspace models, the extension sniffs task completion endpoints (`/meshyd-api/web/v1/tasks/.../status`) to retrieve direct AWS S3 / CloudFront asset URLs.
3. **Texture Prioritization:** Directly prioritizes textured model URLs and textures (`taskResult.texture.modelUrl`) over base untextured meshes.
4. **Local Processing:** Downloads are handled natively via `chrome.downloads.download()`. No remote proxying or server computation is involved.

---

## 📜 License & Disclaimer

This project is intended strictly for personal workflow enhancement and educational analysis of browser WebGL pipelines. Meshy.ai is a trademark of its respective owners.
