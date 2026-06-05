# Testing

This repository ships automated unit, integration, and UI smoke tests, plus optional live API verification.

## 1. Test Without An API Key

This is the best first pass for new developers.

### Steps

1. Install dependencies
   ```bash
   npm install
   ```

2. Start the app
   ```bash
   npm run dev
   ```

3. Open the dashboard in the browser
   - `http://localhost:8080`

4. Verify the UI loads
   - screenshots render
   - style cards render
   - upload controls render
   - preview placeholders show up
   - mock pipeline buttons remain usable in Mock mode
   - OpenAI mode shows a helpful missing-key message when no key is saved

### Expected Output

- the page loads without throwing console errors
- the dashboard layout is visible
- style preview images load from `media/style_previews/`
- no OpenAI request is attempted until a key is provided
- `Mock Demo Run` completes and export buttons produce `spritesheet.png`, `manifest.json`, and `validation-report.json`

## 2. Automated Checks

Run these from the repo root:

```bash
npm run build
npm test
npm run validate
```

Expected results:

- build completes cleanly
- unit, integration, and UI smoke tests pass
- validation writes `VALIDATION_REPORT.md` and artifacts under `artifacts/validation/`

## 3. Optional Real API Test

Use this only when you want to confirm the OpenAI path.

### Steps

1. Set `OPENAI_API_KEY` in your shell or environment
2. Enter the same key in the UI if you are using the browser generation flow
3. Upload a reference image
4. Generate a style preview or action frames

### Expected Output

- a generated sprite image appears in the preview area
- frame downloads become available
- ZIP download buttons work when frames are produced
- transparent-background prompts produce transparent or near-transparent results depending on model output

## 4. Manual Checks To Run Every Time

- Open the health endpoint if the Node server is running
  - `http://localhost:8080/health`
- Confirm the browser can load the static app without 404s
- Confirm the style preview images fall back correctly when a file is missing
- Confirm the download buttons create a ZIP file when frames exist

## 5. Troubleshooting

### Missing API Key

If OpenAI mode is selected without a saved key, the dashboard should show a clear warning and keep working in Mock mode.

### Blank Or Broken Preview

Check the console for:

- image load errors
- invalid data URLs
- a missing style preview asset

### ZIP Download Does Nothing

Make sure JSZip is available in the page before testing the download flow.

### Health Check Fails

If `http://localhost:8080/health` fails, confirm the Node server is running and the port is not already in use.

### Real API Returns 401 Or 403

That usually means one of these:

- the key is missing
- the key is invalid
- the account does not have access to the requested model or endpoint

### Real API Returns A Format Error

Check the response structure. The current browser code expects base64 image data in the first result item.

## 6. Suggested Regression List

When changing docs or code around the pipeline, re-check:

- style selection
- prompt generation
- image upload and normalization
- frame generation
- frame download
- browser refresh with a stored key
