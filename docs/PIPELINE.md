# Pipeline

This fork documents the sprite workflow as a production pipeline so the dashboard, prompt design, and export artifacts are easy to reason about together.

## 1. South/Front Anchor

The pipeline starts from a stable front-facing reference pose. In practice, this is the visual anchor that tells the model where the face, torso, and feet should sit before motion is added.

## 2. Pixel Snap

The reference is treated as a grid-aligned image so the generated result keeps crisp edges and stable proportions. For pixel-art styles, this means keeping the visual body locked to the intended base resolution.

## 3. Directional Anchors

Each style and action inherits directional cues so the character stays consistent across poses and facing changes. This is especially important when turning, walking, or swapping between side views and front views.

## 4. Pose Board

The action library works like a pose board. Every animation action is split into frame-level prompts so the sequence has a clear beginning, middle, and end.

The current prompt library already includes actions such as idle, walk, jump, hurt, knockout, punches, and turn-around.

## 5. Frame Recovery

When a frame is missing, fails, or drifts too far from the sequence, the pipeline can recover by reusing the closest valid source frame or falling back to the base styled image.

## 6. Per-Frame Snap

Every frame should be re-checked against the same visual rules as the first frame:

- body scale stays stable
- head position stays stable
- foot placement stays readable
- outline thickness stays consistent

## 7. Background Cleanup

Generated sprites should remain transparent unless a specific export wants a background for presentation. The prompt system explicitly pushes the model away from solid backdrops, logos, text, and UI fragments.

## 8. Runtime Normalization

The browser flow normalizes uploaded images before generation:

- non-PNG uploads are converted to PNG
- transparency is preserved when possible
- image objects are validated before API use

This keeps the input shape predictable for the generation pipeline.

## 9. Foot-Baseline Alignment

Game-ready sprites need a consistent contact point with the ground. Foot-baseline alignment keeps the character from floating or sinking between frames, which is especially important in walk cycles and landing poses.

## 10. Export

The production pipeline should export a validated bundle containing the sheet, metadata, and preview assets described in `docs/EXPORT_FORMAT.md`.

## How This Maps To The Current App

- `js/prompts.js` holds the style and action prompt library.
- `js/api.js` handles browser-side OpenAI requests and image normalization.
- `js/wizard.js` and `js/ui.js` drive the interactive dashboard and frame downloads.
- `js/workers/spriteWorker.js` shows the worker-based frame generation path.

## Practical Rule

If a sprite looks good in the preview but fails the baseline or transparency rules, it should not be treated as production-ready yet.
