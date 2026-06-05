# Export Format

The production pipeline should emit a game-ready bundle that can be handed off to a game project without extra assembly work.

## Canonical Files

### `spritesheet.png`

The final assembled sprite sheet containing the rendered frames in their export layout.

### `manifest.json`

Metadata describing the export. This should include at least:

- asset name
- style id
- action id
- frame count
- frame order
- frame dimensions
- transparency or background notes

### `preview.gif`

A lightweight preview animation for quick visual checks in chat, issue trackers, or documentation.

### `validation-report.json`

A machine-readable report that records whether the export passed the pipeline checks.

Typical validation entries include:

- frame count check
- transparent background check
- baseline alignment check
- sprite dimension check
- missing frame check

## ZIP Bundle Structure

The ZIP should preserve the production bundle as a single handoff artifact.

Example structure:

```text
character_export.zip
  spritesheet.png
  manifest.json
  preview.gif
  validation-report.json
  frames/
    frame_01.png
    frame_02.png
    frame_03.png
    ...
```

## Browser UI Note

The current browser UI also supports a frame download ZIP for iterative work. That ZIP is an intermediate artifact and is not a substitute for the production export bundle above.

## What The Export Should Preserve

- transparency
- consistent frame naming
- stable ordering
- readable action metadata
- enough validation metadata for a downstream build or importer to trust the bundle
