# Mock Mode

Mock mode is the no-API-key way to work with this fork.

## Purpose

Use Mock mode when you want to:

- inspect the dashboard
- explore the style library
- verify asset loading
- read the pipeline and export contract
- avoid spending API budget while setting up the project

## What Mock Mode Does

- loads the UI without requiring a secret in source control
- runs the full deterministic mock pipeline from reference creation through export
- uses local preview assets and placeholders
- lets you understand the workflow before wiring a real key

## What Mock Mode Does Not Do

- it does not call OpenAI
- it does not replace real validation of production exports

## How To Use It

1. Install dependencies
   ```bash
   npm install
   ```

2. Start the app
   ```bash
   npm run dev
   ```

3. Open the browser UI
   - `http://localhost:8080`

4. Leave the OpenAI key unset

5. Use `Mock Demo Run` to generate the full mock pipeline outputs

6. Export the spritesheet, manifest, and validation report from the UI

## Developer Guidance

If you are working in Mock mode, keep these rules in mind:

- do not commit API keys
- do not assume generated output exists
- use placeholders where the real asset is unavailable
- keep the docs honest about whether a result is simulated or real

## When To Switch To OpenAI Mode

Switch once you are ready to verify the live generation path and compare the output against the expected export format.
