# AI Sprite Forge Enhanced

<div align="center">
  <img src="./media/spriteforge.png" alt="AI Sprite Forge Enhanced logo" width="300" />
  <p><em>An enhanced fork of SpriteForge for web-based sprite generation and production-ready sprite exports.</em></p>
</div>

## Overview

AI Sprite Forge Enhanced is a fork of SpriteForge that combines a web sprite-generation dashboard with a production game-ready sprite pipeline. It is designed for developers who want to move from quick experimentation to shippable sprite assets without changing tools.

It supports two operating modes:

- Mock mode for running the app without an API key
- OpenAI mode when `OPENAI_API_KEY` is configured on the server

The project is centered around sprite workflows that produce game-ready outputs, including spritesheets, `manifest.json`, and preview assets.

## What It Produces

- `spritesheet.png`
- `manifest.json`
- `preview.gif`
- `validation-report.json`
- ZIP bundles for distribution and handoff

The browser UI also includes preview images, animation playback, and frame downloads for iterative work.

## Screenshots

The repository already includes screenshots in `media/`.

<div align="center">
  <img src="./media/screenshot1.png" alt="SpriteForge dashboard screenshot" width="800" />
  <p><em>Upload and style selection flow</em></p>

  <img src="./media/screenshot2.png" alt="SpriteForge style screenshot" width="800" />
  <p><em>Style preview and selection</em></p>

  <img src="./media/screenshot3.png" alt="SpriteForge animation screenshot" width="800" />
  <p><em>Animation preview and frame editing</em></p>
</div>

If you clone the repo without the media folder or want fresher captures, replace these with current screenshots before publishing.

## Quick Start

1. Install dependencies
   ```bash
   npm install
   ```

2. Start the local app
   ```bash
   npm run dev
   ```

3. Open the app in your browser
   - Local development default: `http://localhost:8080`

## Modes

### Mock Mode

Mock mode is the no-key workflow. It is the safest way to explore the dashboard, run the full deterministic pipeline, inspect the style library, and export sample assets without setting up OpenAI access first. Live sprite generation is reserved for OpenAI mode.

### OpenAI Mode

Set `OPENAI_API_KEY` in your environment and switch the provider to OpenAI in the UI or set `IMAGE_PROVIDER=openai` on the server when you want real image generation. If no key is present, the UI shows a clear missing-key warning and stays usable in Mock mode.

## Recommended Reading Order

1. [docs/DOCS_SUMMARY.md](./docs/DOCS_SUMMARY.md)
2. [docs/MOCK_MODE.md](./docs/MOCK_MODE.md)
3. [docs/PIPELINE.md](./docs/PIPELINE.md)
4. [docs/API.md](./docs/API.md)
5. [docs/EXPORT_FORMAT.md](./docs/EXPORT_FORMAT.md)
6. [docs/TESTING.md](./docs/TESTING.md)
7. [ATTRIBUTION.md](./ATTRIBUTION.md)

## Project Notes

- The UI is a browser-first dashboard.
- The Node server serves the app and health check endpoint.
- The current `/api/generate-sprite` route is a placeholder for server-side generation work.
- Generated and derived assets should always preserve transparency unless a downstream export explicitly calls for a background.

## License

The project remains under the MIT License. See `LICENSE` for the original license text and `ATTRIBUTION.md` for fork credits and provenance notes.
