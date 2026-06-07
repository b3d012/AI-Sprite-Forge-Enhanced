# Prompt System Summary

This update adds a production-oriented prompt system for sprite pipeline work.

## What was added

- `js/prompts/defaults.js`
  - Central defaults for the new production prompt system.
  - Includes the default stage values, provider options, and action presets.

- `js/prompts/templates.js`
  - Eight reusable stage templates:
    - South/front anchor
    - Pixel snap anchor
    - Directional anchors NSEW
    - Action pose board
    - Frame recovery instructions
    - Walk cycle instructions
    - Per-frame chroma-layout snap
    - Runtime normalize and align
  - Each template supports the requested variables:
    - `coreIdentity`
    - `costumeAndPalette`
    - `silhouetteNotes`
    - `styleTarget`
    - `actionName`
    - `direction`
    - `cellSize`
    - `backgroundColor`
    - `paletteLimit`
    - `outputSheetRows`
    - `outputSheetColumns`
    - `footAnchorX`
    - `footAnchorY`

- `js/prompts/buildPrompt.js`
  - Renders stage templates into final prompt text.
  - Provides the prompt builder data used by the dashboard UI.
  - Exposes the action preset list and provider options.

- `js/prompts.js`
  - Keeps the legacy sprite helpers working.
  - Reuses the new production prompt builder internally.
  - Updates the system primer to the chroma-green production workflow.

- `js/dashboard.js`
  - Adds the prompt builder controls to the production dashboard.
  - Lets the user choose a stage, edit the main prompt fields, pick action presets, copy the final prompt, and reset to defaults.
  - Keeps the builder state in sync with the pipeline stage.

- `index.html`
  - Adds a dedicated Prompt Builder card to the dashboard layout.

- `js/state.js`
  - Adds a small browser-safe guard around the DOM-ready listener.

- `js/api.js`
  - Updates the image edit background setting to opaque so the request settings match the new chroma-green prompt workflow.

## Production defaults

- South/front anchor uses a `1024x1024` canvas.
- Background is enforced as exact `#00FF00`.
- Runtime cell defaults to `256x256`.
- Default runtime sheet is `5 columns x 2 rows`.
- Default foot anchor is `(128, 255)`.
- Style target is polished `16-bit / early 32-bit JRPG pixel art`.
- The prompt system emphasizes lower fidelity than the input image.
- Palette guidance is kept in the `8 to 12` color range.
- Dark outline clusters and no shadows are enforced in the text.

## Notes

- The prompt builder works without an API key.
- The "Send prompt to selected provider" button now uses the repo's existing provider classes. It renders through the selected provider when possible and falls back to prompt copy/handoff behavior if no key or reference image is available.
- No image processing logic was changed beyond aligning request settings with the new opaque chroma workflow.
