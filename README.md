# Fram

Chrome extension that puts an image on your webcam during video calls. Works on Meet, Teams, Zoom, whatever — if the site uses a camera, Fram can draw on it.

## What it does

You pick an image, you pick where it goes on screen. Fram composites it onto your camera feed before the video call app ever sees it. The call site has no idea anything changed. It just gets a video stream with your overlay baked in.

No server, no account. Everything happens locally in the browser.

## How it works

Every video call site uses a browser API called `getUserMedia` to access your camera. Fram hooks that call. When a site asks for camera access, Fram grabs the real stream, draws each frame onto a canvas, slaps your overlay on top, and hands the modified stream back to the site.

The frame processing uses `MediaStreamTrackProcessor` and `MediaStreamTrackGenerator` (the Insertable Streams API) with an `OffscreenCanvas` so it doesn't block the page.

## Install

1. Clone or download this repo
2. Go to `chrome://extensions`
3. Turn on "Developer mode" top right
4. Hit "Load unpacked", pick the Fram folder
5. Open a video call and click the Fram icon in your toolbar

## Where this is at

Early days. Right now it overlays a test image and lets you drag it around and resize it. QR code generation, image uploads, and a paid version are on the list but not built yet.

## License

MIT
