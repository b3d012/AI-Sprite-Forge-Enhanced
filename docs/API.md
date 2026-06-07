# API

This repository uses a browser dashboard plus a local Node server for mock, local AUTOMATIC1111, and optional OpenAI-backed generation.

## Local Stable Diffusion Mode

The server can call AUTOMATIC1111 through its local REST API.

- Endpoint: `/api/pipeline/providers/edit`
- Set `providerMode=local`
- The base URL comes from `AUTOMATIC1111_BASE_URL`
- Prompt-only requests still use `http://127.0.0.1:7860/sdapi/v1/txt2img`
- Reference-image edits use `http://127.0.0.1:7860/sdapi/v1/img2img`
- OpenAI image API keys are not required for this mode

## OpenAI Mode

The browser now calls the local server, and the server owns the OpenAI credentials through `OPENAI_API_KEY`.

### Current Request Shape

- Endpoint: `/api/pipeline/providers/edit`
- The server switches to OpenAI when `providerMode=openai`
- Prompt-only stages use generation requests
- Edit stages send the source image as a data URL or uploaded blob
- The prompt is built from the style and action library

### Runtime Validation

The code validates that:

- the server is reachable
- the selected stage has the required prompt or image input
- the API response contains an image payload in one of the supported shapes

### Local Storage

The dashboard no longer depends on a saved client-side API key for OpenAI calls. Mock mode remains fully local.

## Environment Variables

`server.js` reads `OPENAI_API_KEY` and AUTOMATIC1111 settings through `dotenv`.

Important note:

- the Node server is the only place that should know the OpenAI secret
- `OPENAI_IMAGE_MODEL` can override the default image model
- `OPENAI_IMAGE_EDIT_ENDPOINT` can override the edit endpoint
- `AUTOMATIC1111_BASE_URL` can point to a local or LAN-hosted AUTOMATIC1111 instance
- `AUTOMATIC1111_TIMEOUT_MS` can limit how long the server waits for a response
- `AUTOMATIC1111_DENOISING_STRENGTH` controls the default img2img strength when a source image is provided

## Worker Path

The worker-based path in `js/workers/spriteWorker.js` still uses the server pipeline route for frame creation.

That path is useful because it shows the intended production animation flow:

- initialize a worker with a stage request
- generate or edit an image through the server
- return a base64-compatible payload to the caller
- retry failed frames when needed

## What Not To Put In The API Layer

- API keys in source files
- secrets in prompts
- hard-coded production credentials
- private URLs or account tokens

## Common Failure Modes

- missing API key on the server
- AUTOMATIC1111 not running or API disabled
- unsupported or expired model access
- invalid image format
- unexpected response payload shape
- network failure or browser CORS issue

## Source Files

- `js/api.js`
- `js/workers/spriteWorker.js`
- `server.js`
