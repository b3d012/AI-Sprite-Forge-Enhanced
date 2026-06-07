import test from 'node:test';
import assert from 'node:assert/strict';

import { PipelineOrchestrator } from '../js/pipeline/orchestrator.js';
import { MockImageProvider } from '../js/pipeline/providers/mockProvider.js';
import { OpenAIImageProvider } from '../js/pipeline/providers/openaiProvider.js';
import { createPipelineState } from '../js/pipeline/state.js';

function makeReferenceDataUrl() {
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">
      <rect width="1024" height="1024" fill="#00FF00"/>
      <circle cx="512" cy="384" r="160" fill="#f97316"/>
      <rect x="360" y="520" width="304" height="280" rx="72" fill="#38bdf8"/>
    </svg>
  `.replace(/\s+\n/g, '').replace(/\n\s+/g, '');

  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

test('mock provider runs the full pipeline without an API key', async () => {
  const state = createPipelineState({
    provider: { mode: 'mock' },
    inputs: {
      referenceImageDataUrl: makeReferenceDataUrl(),
      referenceImageName: 'reference.svg',
      referenceImageType: 'image/svg+xml',
    },
    project: {
      id: 'mock-project',
      name: 'Mock Provider Pipeline',
      description: 'Full deterministic mock run',
    },
  });

  const orchestrator = new PipelineOrchestrator({
    state,
    provider: new MockImageProvider({ width: 1024, height: 1024 }),
    autoSave: false,
  });

  const result = await orchestrator.runPipeline();

  assert.equal(result.ok, true);
  assert.equal(result.state.pipelineStatus, 'complete');
  assert.ok(result.state.anchors.southFront?.dataUrl);
  assert.ok(result.state.anchors.directional.north?.dataUrl);
  assert.ok(result.state.actionBoard?.dataUrl);
  assert.ok(result.state.recoveredFrames.length > 0);
});

test('OpenAI provider normalizes nested generation payloads', async () => {
  const provider = new OpenAIImageProvider({
    apiKey: 'test-key',
    fetchImpl: async (url, options = {}) => {
      if (String(url).includes('/images/generations')) {
        assert.equal(options.method, 'POST');
        return {
          ok: true,
          json: async () => ({
            output: [
              {
                content: [
                  {
                    b64_json: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAEklEQVR42mP8z/C/HwAIAwMCAH+1G0cAAAAASUVORK5CYII=',
                  },
                ],
              },
            ],
          }),
        };
      }

      throw new Error(`Unexpected request: ${url}`);
    },
  });

  const result = await provider.generateImage({
    prompt: 'Create a tiny test sprite.',
    size: '256x256',
    quality: 'low',
    background: 'opaque',
  });

  assert.match(result.dataUrl, /^data:image\/png;base64,/);
  assert.equal(result.stageId, 'openai-generate');
});

test('OpenAI provider normalizes nested edit payloads', async () => {
  const provider = new OpenAIImageProvider({
    apiKey: 'test-key',
    fetchImpl: async (url, options = {}) => {
      if (String(url).includes('/images/edits')) {
        assert.equal(options.method, 'POST');
        return {
          ok: true,
          json: async () => ({
            data: [
              {
                url: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAEklEQVR42mP8z/C/HwAIAwMCAH+1G0cAAAAASUVORK5CYII=',
              },
            ],
          }),
        };
      }

      throw new Error(`Unexpected request: ${url}`);
    },
  });

  const result = await provider.editImage({
    prompt: 'Edit this sprite.',
    image: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAEklEQVR42mP8z/C/HwAIAwMCAH+1G0cAAAAASUVORK5CYII=',
    size: '256x256',
    quality: 'low',
    background: 'transparent',
  });

  assert.match(result.dataUrl, /^data:image\/png;base64,/);
  assert.equal(result.stageId, 'openai-edit');
});

const maybeTest = process.env.OPENAI_API_KEY ? test : test.skip;

maybeTest('real OpenAI provider only runs when OPENAI_API_KEY exists', async () => {
  const provider = new OpenAIImageProvider({
    apiKey: process.env.OPENAI_API_KEY,
    model: process.env.OPENAI_IMAGE_MODEL || 'gpt-image-1',
  });

  const result = await provider.generateImage({
    prompt: 'Generate a tiny deterministic test sprite.',
    size: '256x256',
    quality: 'low',
    background: 'opaque',
  });

  assert.match(result.dataUrl, /^data:image\/png;base64,/);
});
