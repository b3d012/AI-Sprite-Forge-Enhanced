# Runtime Export Summary

This fork now includes a runtime sheet workflow for game-ready sprite export.

## What it does

- Recovers frames from a pose board using chroma-key background detection.
- Detects foreground connected components instead of doing naive grid cropping.
- Crops each recovered component into its own source frame.
- Normalizes every frame into a 256×256 runtime cell.
- Locks the shared foot anchor at `128,255` by default.
- Packs normalized frames into a 5×2 runtime sheet by default.
- Exports a manifest with animation metadata and per-frame alignment offsets.
- Provides a browser preview that plays at the manifest FPS.
- Offers manual alignment controls for nudging selected frames.

## Exported files

- `spritesheet.png`
- `manifest.json`
- `validation-report.json`
- `source-frames/frame-XX.png`
- `normalized-frames/frame-XX.png`
- `preview-frame.png` when a canvas preview is available

If `JSZip` is present, the workbench also exports a ZIP bundle. If not, the files are exported individually.

## Alignment controls

- Nudge selected frame by `1 px` or `5 px`
- Reset selected frame alignment
- Copy selected alignment to all frames
- Preview the animation after nudging

The saved `manifest.json` includes the nudge offsets for each frame.

## Demo recovery

The workbench includes a built-in mock pose board so you can verify recovery without uploading an image first.

## Notes

- The preview currently runs in-browser on a canvas.
- A GIF export can be added later if a GIF encoder library is introduced.

