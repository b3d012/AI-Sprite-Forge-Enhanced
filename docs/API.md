# API

This repository uses a browser dashboard plus a local Node server for OpenAI-backed generation.

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

`server.js` reads `OPENAI_API_KEY` through `dotenv`.

Important note:

- the Node server is the only place that should know the OpenAI secret
- `OPENAI_IMAGE_MODEL` can override the default image model
- `OPENAI_IMAGE_EDIT_ENDPOINT` can override the edit endpoint

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
- unsupported or expired model access
- invalid image format
- unexpected response payload shape
- network failure or browser CORS issue

## Source Files

- `js/api.js`
- `js/workers/spriteWorker.js`
- `server.js`
