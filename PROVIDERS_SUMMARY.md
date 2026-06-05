# Providers Summary

## Modes

- `mock`
  - Deterministic and offline.
  - Used by default for local development and tests when `OPENAI_API_KEY` is not set.
  - Produces SVG-based image fixtures that are stable across runs.
- `openai`
  - Uses the OpenAI Images API.
  - Requires `OPENAI_API_KEY` on the server.
  - Returns a clear error if the key is missing.
- `auto`
  - Uses OpenAI when `OPENAI_API_KEY` exists.
  - Falls back to mock mode when the key is absent.

## Environment Variables

- `IMAGE_PROVIDER`
  - Selects the provider mode.
  - Recommended local default: `mock`.
- `OPENAI_API_KEY`
  - Server-side key for real image generation.
- `OPENAI_IMAGE_MODEL`
  - Model name used by the OpenAI provider.
- `OPENAI_IMAGE_EDIT_ENDPOINT`
  - Optional override for the OpenAI edit endpoint.
- `MAX_UPLOAD_BYTES`
  - Maximum accepted base64 image payload size for API requests.

## API Surface

- `POST /api/pipeline`
  - Generic image generation/edit endpoint used by the browser client.
- `POST /api/generate/anchor`
- `POST /api/generate/directions`
- `POST /api/generate/pose-board`
- `POST /api/process/pixel-snap`
- `POST /api/process/recover-frames`
- `POST /api/export/bundle`

## Prompt Safety

- Generation stages enforce a chroma-key green background using `#00FF00`.
- Process/edit stages keep the background transparent unless overridden.

## Testing

- Mock pipeline coverage lives in `tests/providers.test.mjs`.
- The OpenAI provider test only runs when `OPENAI_API_KEY` is present.
