# API

This repository currently uses a browser-first API flow with an optional Node server wrapper.

## OpenAI Mode

The browser-side generation path calls the OpenAI Images API directly from `js/api.js`.

### Current Request Shape

- Endpoint: `https://api.openai.com/v1/images/edits`
- Model: `gpt-image-1`
- Request body uses `FormData`
- The uploaded image is sent as the reference asset
- The prompt is built from the style and action library

### Runtime Validation

The code validates that:

- an API key exists before generation
- the uploaded image is a `File` or `Blob`
- the API response contains base64 image data

### Local Storage

The UI stores the user-supplied key in `localStorage` under `openai_api_key` so the dashboard can restore it on refresh.

## Environment Variables

`server.js` reads `OPENAI_API_KEY` through `dotenv`.

Important note:

- the Node server currently serves static files and a health check
- the `/api/generate-sprite` route is still a placeholder
- if you want server-side generation later, `OPENAI_API_KEY` is the environment variable the server already knows about

## Worker Path

The worker-based path in `js/workers/spriteWorker.js` uses OpenAI image generation endpoints for frame creation.

That path is useful to understand because it shows the intended production animation flow:

- initialize a worker with a key
- generate a frame from a prompt
- return a base64 payload
- retry failed frames when needed

## What Not To Put In The API Layer

- API keys in source files
- secrets in prompts
- hard-coded production credentials
- private URLs or account tokens

## Common Failure Modes

- missing API key
- unsupported or expired model access
- invalid image format
- unexpected response payload shape
- network failure or browser CORS issue

## Source Files

- `js/api.js`
- `js/workers/spriteWorker.js`
- `server.js`
