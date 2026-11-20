# CUTOUT CINEMA

**Production system · version 1.0** — a small, deterministic 2D cut-out animation studio. Reusable SVG rigs, layered scene art, keyframes, camera transforms and audio replace generative video frames. The starting prototype is intentionally narrow: one courier, a small set of layered locations and five controllable movement presets.

## Run

```sh
python3 -m http.server 4173 --bind 0.0.0.0
```

Open `http://localhost:4173`. No build step or runtime package dependencies. The rig is fetched as an SVG asset, so use a local HTTP server rather than opening the HTML as a `file://` URL.

## V1 prototype

- **Reusable puppet:** `assets/rigs/courier.svg` separates the backpack, head, torso, arms, hands, legs and knee joints into named groups. The stage loads this asset and applies repeatable pose transforms.
- **Motion presets:** idle/breathing, walk cycle, head turn, arm gesture and intercom press. Presets are driven by project time and editable speed, not generated video.
- **First episode:** an 80-second, seven-shot cut-out episode built from the same courier rig and four reusable vector locations; six Russian VO cues, procedural stairwell sound effects and a deliberate silent beat before the reveal.
- **Scene and camera:** layered vector entrance/stairwell art, a 9:16 stage, safe-area guides, draggable courier, X/Y/scale/rotation controls and camera pan/zoom.
- **Timeline:** 10–120 seconds, 12/24/30 fps, pose/camera keyframes, interpolation, scrubbing, playback and keyboard shortcuts (Space, K, ←/→).
- **Project files:** autosave in browser storage; export/import a JSON scene description.
- **Audio:** import a local audio file onto the audio lane, preview it against the timeline and include it in export when the browser supports audio capture.
- **Render:** export the deterministic stage as 720×1280 WebM using browser MediaRecorder. Convert to MP4 with `scripts/convert_mp4.sh output.webm`; this requires an FFmpeg build with H.264/AAC encoders. No generated video frames are used.
- **Style tab:** original cut-out rules, outline and paper-grain controls, palette swatches and composition guides.

**Series 01:** “ДРУЖБЫ, 18, КВ. 14” — 80 seconds across seven cuts. POV intercom press, stair climb, wrong-entrance realization, the yellow cube, a withheld impact and an ambiguous overhead reveal. The voice-over is segmented by shot; the impact beat is silent. All character and camera motion is authored from reusable vector assets and saved keyframes.

## Project structure

```text
index.html                  Studio UI and SVG scene viewport
styles.css                  Layout, timeline and studio visual system
script.js                   Timeline, rig controls, project I/O and WebM capture
assets/rigs/courier.svg     Reusable articulated courier puppet
assets/locations/*.svg      Layered entrance and stairwell environments
```

See [`docs/STYLE_GUIDE.md`](docs/STYLE_GUIDE.md) and [`docs/ROADMAP.md`](docs/ROADMAP.md).

## Scope notes

This is an editable production prototype, not a fully featured character editor. The present rig has a defined front three-quarter view, a small set of procedural motion cycles and four sample environments. Sprite-atlas authoring, arbitrary rig editing, lipsync, multitrack audio mixing, alternate aspect ratios and an offline render queue are planned follow-ups.
