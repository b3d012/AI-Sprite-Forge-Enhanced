# AGENT Architecture Summary

This branch adds a production-oriented sprite pipeline core to the existing SpriteForge app without replacing the current UI shell.

## What changed

- Added a shared pipeline state model with save/load support through `localStorage`.
- Added explicit pipeline status values: `idle`, `ready`, `running`, `blocked`, `failed`, `complete`.
- Added stage validation statuses: `passed`, `warning`, `failed`, `not_run`.
- Added a pipeline orchestrator that can run a single stage or the full pipeline.
- Added provider abstractions for `openai` and `mock`, with mock mode as the default fallback.
- Added structured pipeline stages for the production flow, including:
  - project setup
  - reference image upload
  - anchor generation
  - frame recovery
  - chroma/layout cleanup
  - normalization
  - preview assembly
  - export packaging
- Replaced the placeholder server endpoint with structured pipeline endpoints.
- Preserved the existing browser UI by turning `js/state.js` and `js/api.js` into compatibility layers over the new pipeline core.

## Plugin points for future agents

- Replace the placeholder stage logic in `js/pipeline/stages.js` with real anchor solving, component recovery, frame packing, and export encoding.
- Swap the mock export placeholders for real PNG/GIF/ZIP assembly.
- Extend `js/pipeline/providers/openaiProvider.js` if a different OpenAI image workflow is needed.
- Add richer UI controls for per-stage execution and artifact inspection if desired.

## Runtime behavior

- If `OPENAI_API_KEY` is present, the server can use OpenAI-backed generation.
- If no key is present, the app falls back to deterministic mock images so the pipeline can still be tested end to end.

