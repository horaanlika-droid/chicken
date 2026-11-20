# Production roadmap

## V1 — Animation prototype (current)

- Style guide and one original courier rig.
- One entrance/stairwell location and reusable prop layers.
- Pokeable SVG controller groups and four motion presets: idle, walk, head turn and hand gesture.
- Coordinate-based puppet placement, camera pan/zoom, keyframe timeline and project JSON.
- Voice-over/audio import and a browser-rendered vertical WebM preview.
- First authored episode, “ДРУЖБЫ, 18, КВ. 14”: seven shot cuts, six shot-timed Russian voice cues, vector impact/reveal locations and a procedural soundscape.

**V1 validation short:** a 30-second courier test: approach the intercom, walk a few steps, stop, look back, gesture. All action is authored from deterministic rig controls and saved timeline data.

## V2 — Short-film production

- Full-body turnaround and separate hand, face and mouth atlases.
- Reusable walk/stair-climb cycles, pose library, secondary characters, more stairwell angles and prop interaction.
- Scene/shot list with independent durations, camera presets and per-track keyframes.
- Voice-over timing, lip-sync marks, sound-effect clips and multitrack audio mixing.
- Render queue, output presets, captions and MP4 transcode path.

## V3 — Animation editor

- Select/reorder layers on stage; transform handles and pivot editing.
- Timeline curves, easing, copy/paste poses, onion skin and camera keyframe editing.
- Asset browser with import/export, versioned rigs and background variants.
- Autosave recovery and project packaging with linked assets.

## V4 — Story-to-animation workflow

- Import a text story and propose beats, shots and timing.
- Suggest existing reusable rigs, locations, props and motion presets.
- Generate editable keyframe/shot drafts as data—not AI video.
- Human approval and revision at each stage before final render.

## Production principle

`STORY → SCRIPT → STORYBOARD → ASSET SELECTION → RIGGING → KEYFRAMES → CAMERA → VOICE-OVER → SOUND → COMPOSITING → EXPORT`

Each scene remains editable and reproducible from its SVG assets, scene JSON and timing data.
