# Dashboard UI Summary

## What Changed

The app now opens as a production-style sprite workflow dashboard instead of a small wizard.

## Main Sections

1. Project Setup
   - New Project
   - Load Project
   - Save Project
   - Reset Project
   - Provider selector: Mock / OpenAI
   - API key status indicator that never reveals the key
   - Output settings:
     - cell size
     - FPS
     - columns
     - rows
     - foot anchor X/Y
     - background mode

2. Reference and Anchor
   - Upload Reference Image
   - Generate South Anchor
   - Pixel Snap Anchor
   - Validate Anchor
   - Download Anchor
   - Compare Raw vs Snapped

3. Directional Anchors
   - Generate NSEW Anchors
   - Pixel Snap Directions
   - Validate Directions
   - Preview Direction Grid

4. Animation Builder
   - Action selector
   - Generate Pose Board
   - Recover Frames
   - Pixel Snap Frames
   - Clean Background
   - Normalize Runtime Sheet
   - Validate Animation
   - Preview Animation

5. Manual Frame Aligner
   - Frame thumbnails
   - Frame selection
   - 1 px and 5 px nudges
   - Reset selected frame
   - Apply current offset to all frames
   - Live preview

6. Export Center
   - Export Spritesheet PNG
   - Export Manifest JSON
   - Export Preview GIF
   - Export Full ZIP
   - Export Validation Report

7. One-Click Buttons
   - Run Full Production Pipeline
   - Run Current Stage Only
   - Run QC Validation
   - Mock Demo Run

## Behavior

- Buttons disable when required inputs are missing.
- Stage cards show `not run`, `running`, `complete`, `warning`, or `failed`.
- Validation warnings appear in a dedicated warnings rail.
- Progress is shown at the top of the dashboard.
- Mock mode works without an OpenAI API key.
- API keys are stored only in local browser storage and are never included in exported project files.

## Implementation Notes

- [`index.html`](./index.html) now contains the dashboard layout and polished shell.
- [`js/dashboard.js`](./js/dashboard.js) owns the UI state, previews, project import/export, mock pipeline actions, and button wiring.
- [`js/state.js`](./js/state.js) now persists lightweight dashboard settings and API key presence safely.

## Preserved Experience

The workspace still provides:

- reference image previewing
- anchor and animation previews
- frame thumbnails
- export actions
- a project-level save/load flow

When a real pipeline function exists, the dashboard exposes it through `window.SpriteForgePipeline` so future agents can wire in production implementations without changing the UI.
