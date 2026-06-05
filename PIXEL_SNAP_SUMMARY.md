# Pixel Snap Subsystem Summary

This repository now includes a browser-friendly, testable image-processing layer for pixel-art sprite cleanup and chroma-key handling.

## What It Does

- Detects whether a sprite already uses a chroma-key background.
- Converts exact or near-`#00FF00` backgrounds to alpha.
- Converts transparent pixels back to exact `#00FF00` for chroma-key export.
- Estimates a native pixel grid from upscaled sprite images.
- Resizes with nearest-neighbor only.
- Reduces mixed pixels and green fringe artifacts.
- Validates pixel-art images and returns warnings.

## Files

- `js/image/chroma.js`
- `js/image/nativeGrid.js`
- `js/image/pixelSnap.js`
- `js/image/validation.js`
- `js/image/canvasUtils.js`
- `js/image/index.js`
- `tests/image-processing.test.js`

## Processing Notes

- The core functions operate on `ImageData`-like objects, which keeps them easy to test and easy to use from browser canvas code.
- `pixelSnapImage()` defaults to producing chroma-key-friendly output and preserves crisp edges with nearest-neighbor resizing.
- Transparent output is reserved for final exports via `finalExport: true`.

## Limitations

- Native grid estimation is heuristic. It works well on nearest-neighbor-upscaled sprites, but very noisy or heavily anti-aliased input can reduce confidence.
- Green-fringe cleanup is intentionally conservative so it does not smear chunky pixel edges.
- The validation layer is advisory. It returns warnings instead of blocking processing.

## Attribution

No external pixel-snap implementation was ported into this subsystem, so no third-party attribution file update was required.

