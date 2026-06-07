# Documentation Summary

This folder is the shortest path to understanding the fork.

## Read First

- `README.md` explains what the project is, how to start it, and where the outputs go.
- `docs/LOCAL_AUTOMATIC1111.md` explains how to run the free local AUTOMATIC1111 backend without the OpenAI image API.
- `docs/MOCK_MODE.md` explains how to use the app without an API key.
- `docs/PIPELINE.md` explains the sprite pipeline from anchor selection to export.

## API And Output

- `docs/API.md` describes how the app talks to OpenAI and what configuration is expected.
- `docs/EXPORT_FORMAT.md` defines the files that belong in the game-ready export bundle.

## Verification

- `docs/TESTING.md` covers local checks, optional real API checks, expected output, and troubleshooting.

## Attribution

- `ATTRIBUTION.md` records the fork lineage and license obligations.

## Current Status

The current codebase is a browser dashboard with a Node server wrapper. Some production export steps are documented as the target bundle contract even when the browser UI still exposes intermediate frame downloads.
