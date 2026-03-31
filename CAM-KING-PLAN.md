# Fram — Camera Overlay Chrome Extension

## What this is
Chrome extension that draws an image on your webcam feed during video calls. Works on Meet, Teams, Zoom, anything that uses a camera in the browser. One cached image composited per frame, nothing else. No audio processing, no video playback.

Free version will have a watermark. Paid version removes it, probably around $1/month.

---

## MVP Scope

The MVP does exactly three things:
1. Display an image on your camera feed
2. Let you position it (drag)
3. Let you resize it (slider)

That's it. No QR generation, no labels, no themes, no payment, no watermark. Just prove the core overlay works.

---

## Project Location
`C:\Users\franc\OneDrive\Desktop\Fram\`

## File Structure (6 files)
```
Fram/
├── manifest.json        # Manifest V3, minimal permissions
├── popup.html           # Single-page UI
├── popup.js             # Config save/load, drag logic
├── popup.css            # Minimal dark styling
├── bridge.js            # ISOLATED world — forwards chrome.storage to MAIN world
└── content.js           # MAIN world — getUserMedia hook + frame compositor
```

No service worker. No background script. No external libraries for MVP. Minimal footprint.

---

## File-by-File Breakdown

### 1. `manifest.json`

```json
{
  "manifest_version": 3,
  "name": "Fram",
  "version": "0.1.0",
  "description": "Overlay images on your camera during video calls",
  "permissions": ["storage"],
  "host_permissions": ["https://*/*"],
  "action": {
    "default_popup": "popup.html"
  },
  "content_scripts": [
    {
      "matches": ["<all_urls>"],
      "js": ["content.js"],
      "run_at": "document_start",
      "world": "MAIN"
    },
    {
      "matches": ["<all_urls>"],
      "js": ["bridge.js"],
      "run_at": "document_start",
      "world": "ISOLATED"
    }
  ]
}
```

Key decisions:
- `"world": "MAIN"` for content.js — needs to override `navigator.mediaDevices.getUserMedia`
- `"world": "ISOLATED"` for bridge.js — needs `chrome.storage` API access
- `host_permissions: ["https://*/*"]` — works on all HTTPS sites
- Only one permission: `storage`

---

### 2. `content.js` (MAIN world) — The Core

This is the only performance-critical file. It does two things:
1. Hook `getUserMedia` to intercept the camera stream
2. Composite the overlay image onto each video frame

```
(function() {
  // ── State ──
  let config = { visible: false, posX: 85, posY: 80, size: 120 };
  let overlayImage = null;  // pre-loaded HTMLImageElement or ImageBitmap

  // ── Config listener ──
  // Receives config updates from bridge.js via window.postMessage
  window.addEventListener("message", (e) => {
    if (e.data && e.data.type === "fram-config") {
      config = { ...config, ...e.data.config };
    }
  });

  // ── Compositor ──
  // Called once per video frame. Draws the overlay if visible.
  function compositeOverlay(ctx, width, height) {
    if (!config.visible || !overlayImage) return;
    const x = (config.posX / 100) * width - config.size / 2;
    const y = (config.posY / 100) * height - config.size / 2;
    ctx.drawImage(overlayImage, x, y, config.size, config.size);
  }

  // ── getUserMedia Hook ──
  // Intercepts camera stream, pipes frames through compositor
  const originalGUM = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);

  navigator.mediaDevices.getUserMedia = async function(constraints) {
    const stream = await originalGUM(constraints);

    if (!constraints || !constraints.video) return stream;
    const videoTrack = stream.getVideoTracks()[0];
    if (!videoTrack) return stream;

    // Insertable Streams API required — if missing, pass through cleanly
    if (typeof MediaStreamTrackProcessor === "undefined" ||
        typeof MediaStreamTrackGenerator === "undefined") {
      return stream;
    }

    const processor = new MediaStreamTrackProcessor({ track: videoTrack });
    const generator = new MediaStreamTrackGenerator({ kind: "video" });

    const canvas = new OffscreenCanvas(1, 1);
    const ctx = canvas.getContext("2d");

    const transformer = new TransformStream({
      async transform(frame, controller) {
        const w = frame.displayWidth;
        const h = frame.displayHeight;
        if (canvas.width !== w || canvas.height !== h) {
          canvas.width = w;
          canvas.height = h;
        }

        ctx.drawImage(frame, 0, 0, w, h);
        compositeOverlay(ctx, w, h);

        const newFrame = new VideoFrame(canvas, {
          timestamp: frame.timestamp,
          alpha: "discard",
        });
        frame.close();
        controller.enqueue(newFrame);
      },
    });

    processor.readable.pipeThrough(transformer).pipeTo(generator.writable);

    stream.removeTrack(videoTrack);
    stream.addTrack(generator);

    return stream;
  };
})();
```

**Why this works:** Every video call site calls `getUserMedia` to get the camera. We intercept that call, get the real stream, then pipe each frame through our compositor that draws the overlay on top. The site receives our modified stream and has no idea.

**Insertable Streams API:** `MediaStreamTrackProcessor` reads frames from a track, `MediaStreamTrackGenerator` creates a new track from frames we produce. The `TransformStream` sits in between — for each frame: draw it on canvas, draw our overlay, create a new frame from the canvas.

---

### 3. `bridge.js` (ISOLATED world) — ~15 lines

Forwards config between `chrome.storage` and the MAIN world content script.

```
// On load: send current config to MAIN world
chrome.storage.local.get("framConfig", (result) => {
  window.postMessage({ type: "fram-config", config: result.framConfig || {} }, "*");
});

// On change: forward updates to MAIN world
chrome.storage.onChanged.addListener((changes) => {
  if (changes.framConfig) {
    window.postMessage({ type: "fram-config", config: changes.framConfig.newValue }, "*");
  }
});
```

**Why two worlds:** Chrome extensions have two execution contexts. ISOLATED world can access `chrome.*` APIs but can't touch page globals. MAIN world can override `getUserMedia` but can't access `chrome.*`. The bridge connects them via `postMessage`.

---

### 4. `popup.html`

Single page, top to bottom:
1. **Header** — "Fram"
2. **Position area** — 16:9 box with a draggable handle
3. **Size slider** — `<input type="range">`
4. **Toggle button** — on/off

No URL input, no label input, no preview canvas for MVP. Just controls.

---

### 5. `popup.js`

**Config shape** stored in `chrome.storage.local` under key `framConfig`:
```js
{
  posX: 85,    // percentage from left (0-100)
  posY: 80,    // percentage from top (0-100)
  size: 120,   // overlay size in pixels
  visible: false
}
```

**Functions:**
- `saveConfig()` — writes current form state to `chrome.storage.local`
- `loadConfig()` — reads from storage, populates UI on popup open
- `updateHandle()` — positions drag handle based on posX/posY

**Events:**
- Position area: mousedown/mousemove/mouseup drag → update posX/posY → saveConfig()
- Size slider: input → saveConfig()
- Toggle button: click → flip visible → saveConfig()

---

### 6. `popup.css`

- Dark background (`#1a1a2e` or similar)
- `width: 360px` for the popup
- Position area: `aspect-ratio: 16/9`, dark inner bg, subtle border
- Drag handle: small accent-colored square, `cursor: grab`
- Minimal styling — nothing fancy for MVP

---

## How the Pieces Connect

```
popup.js  ──saves──▶  chrome.storage.local
                              │
                              ▼
bridge.js  ──reads──▶  chrome.storage.local
    │
    │  window.postMessage("fram-config", config)
    ▼
content.js  ──receives config──▶  composites overlay onto camera frames
```

---

## Performance

| Concern | Solution |
|---------|----------|
| Per-frame cost | 1 `drawImage` for camera + 1 `drawImage` for overlay |
| Canvas | `OffscreenCanvas` — off main thread |
| Audio | Not touched — zero overhead |
| No API fallback | Passthrough — no lag added |
| Memory | One overlay image in memory |

---

## Build Order

1. **`manifest.json`** — get the extension loadable in Chrome
2. **`content.js`** — getUserMedia hook + compositor (the hard part, the learning)
3. **`bridge.js`** — tiny forwarder (~15 lines)
4. **`popup.html` + `popup.css` + `popup.js`** — controls UI
5. **Test** — load unpacked in Chrome, open Meet, verify overlay appears

---

## MVP Image Source

For MVP, use a hardcoded test image (a small PNG data URL or a generated colored square on canvas). This proves the overlay pipeline works without needing image upload, QR generation, or any external dependencies.

Once the pipeline works, we add image selection/QR generation as the next step.

---

## Post-MVP Roadmap (not now)

- QR code generation (inline encoder, no library)
- Image upload support
- Label text below overlay
- Free tier watermark ("Fram" text on overlay)
- Paid tier ($1/mo) — removes watermark
- Polish UI
- Chrome Web Store listing
