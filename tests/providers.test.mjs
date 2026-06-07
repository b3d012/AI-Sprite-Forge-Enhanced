import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import pngjs from 'pngjs';

import { PipelineOrchestrator } from '../js/pipeline/orchestrator.js';
import { MockImageProvider } from '../js/pipeline/providers/mockProvider.js';
import { OpenAIImageProvider } from '../js/pipeline/providers/openaiProvider.js';
import { Automatic1111ImageProvider, LOCAL_SD_ERROR_MESSAGE } from '../js/pipeline/providers/localStableDiffusionProvider.js';
import { createPipelineState } from '../js/pipeline/state.js';

const { PNG } = pngjs;

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

function makeTransparentPngDataUrl() {
  const png = new PNG({ width: 4, height: 4 });
  png.data.fill(0);
  for (let y = 1; y < 3; y += 1) {
    for (let x = 1; x < 3; x += 1) {
      const idx = (y * 4 + x) * 4;
      png.data[idx] = 255;
      png.data[idx + 3] = 255;
    }
  }
  return `data:image/png;base64,${PNG.sync.write(png).toString('base64')}`;
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

test('Automatic1111 provider posts txt2img payloads and saves outputs', async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'spriteforge-a1111-'));
  const base64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAEklEQVR42mP8z/C/HwAIAwMCAH+1G0cAAAAASUVORK5CYII=';
  let requestBody = null;

  const provider = new Automatic1111ImageProvider({
    baseUrl: 'http://127.0.0.1:7860',
    outputDir: tempDir,
    fetchImpl: async (url, options = {}) => {
      requestBody = JSON.parse(options.body);
      assert.equal(String(url), 'http://127.0.0.1:7860/sdapi/v1/txt2img');
      assert.equal(options.method, 'POST');
      return {
        ok: true,
        json: async () => ({
          images: [base64],
          parameters: requestBody,
          info: JSON.stringify({ prompt: requestBody.prompt }),
        }),
      };
    },
  });

  const result = await provider.generateImage({
    prompt: 'Create a local test sprite.',
    negative_prompt: 'blurry',
    width: 512,
    height: 512,
    steps: 28,
    cfg_scale: 8,
    sampler_name: 'Euler a',
    seed: 123,
    batch_size: 1,
    stageId: 'local-test',
  });

  assert.equal(requestBody.prompt, 'Create a local test sprite.');
  assert.equal(requestBody.negative_prompt, 'blurry');
  assert.equal(requestBody.width, 512);
  assert.equal(requestBody.height, 512);
  assert.equal(requestBody.steps, 28);
  assert.equal(requestBody.cfg_scale, 8);
  assert.equal(requestBody.sampler_name, 'Euler a');
  assert.equal(requestBody.seed, 123);
  assert.equal(requestBody.batch_size, 1);
  assert.match(result.dataUrl, /^data:image\/png;base64,/);
  assert.ok(result.filePath);
  await assert.doesNotReject(() => fs.access(result.filePath));
  assert.equal(result.provider, 'local');
});

test('Automatic1111 provider writes metadata and a cleaned variant when requested', async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'spriteforge-a1111-clean-'));
  const provider = new Automatic1111ImageProvider({
    baseUrl: 'http://127.0.0.1:7860',
    outputDir: tempDir,
    fetchImpl: async (url, options = {}) => {
      assert.equal(String(url), 'http://127.0.0.1:7860/sdapi/v1/txt2img');
      assert.equal(options.method, 'POST');
      return {
        ok: true,
        json: async () => ({
          images: [makeTransparentPngDataUrl()],
          parameters: JSON.parse(options.body),
          info: JSON.stringify({ prompt: 'Clean test' }),
        }),
      };
    },
  });

  const result = await provider.generateImage({
    prompt: 'Create a test sprite.',
    negative_prompt: 'blur',
    width: 256,
    height: 256,
    seed: 77,
    stageId: 'clean-test',
    postprocess: {
      keepChromaGreenBackground: true,
    },
  });

  assert.ok(result.filePath);
  assert.ok(result.outputPaths.some((filePath) => filePath.endsWith('.png')));
  assert.ok(result.outputPaths.some((filePath) => filePath.endsWith('.json')));
  await assert.doesNotReject(() => fs.access(path.join(tempDir, path.basename(result.filePath))));
  await assert.doesNotReject(() => fs.access(path.join(tempDir, path.basename(result.filePath).replace('.png', '.json'))));
});

test('Automatic1111 provider posts img2img payloads when a reference image is supplied', async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'spriteforge-a1111-img2img-'));
  const base64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAEklEQVR42mP8z/C/HwAIAwMCAH+1G0cAAAAASUVORK5CYII=';
  let requestBody = null;

  const provider = new Automatic1111ImageProvider({
    baseUrl: 'http://127.0.0.1:7860',
    outputDir: tempDir,
    fetchImpl: async (url, options = {}) => {
      requestBody = JSON.parse(options.body);
      assert.equal(String(url), 'http://127.0.0.1:7860/sdapi/v1/img2img');
      assert.equal(options.method, 'POST');
      return {
        ok: true,
        json: async () => ({
          images: [base64],
          parameters: requestBody,
          info: JSON.stringify({ prompt: requestBody.prompt }),
        }),
      };
    },
  });

  const result = await provider.editImage({
    prompt: 'Convert this character into a sprite anchor.',
    negative_prompt: 'photorealistic',
    image: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAEklEQVR42mP8z/C/HwAIAwMCAH+1G0cAAAAASUVORK5CYII=',
    width: 384,
    height: 512,
    steps: 24,
    cfg_scale: 7.5,
    sampler_name: 'Euler a',
    seed: 999,
    denoising_strength: 0.55,
    batch_size: 1,
    stageId: 'local-img2img',
  });

  assert.equal(requestBody.prompt, 'Convert this character into a sprite anchor.');
  assert.equal(requestBody.negative_prompt, 'photorealistic');
  assert.equal(requestBody.width, 384);
  assert.equal(requestBody.height, 512);
  assert.equal(requestBody.steps, 24);
  assert.equal(requestBody.cfg_scale, 7.5);
  assert.equal(requestBody.sampler_name, 'Euler a');
  assert.equal(requestBody.seed, 999);
  assert.equal(requestBody.batch_size, 1);
  assert.equal(requestBody.denoising_strength, 0.55);
  assert.deepEqual(requestBody.init_images, ['iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAEklEQVR42mP8z/C/HwAIAwMCAH+1G0cAAAAASUVORK5CYII=']);
  assert.equal(requestBody.include_init_images, false);
  assert.match(result.dataUrl, /^data:image\/png;base64,/);
  assert.ok(result.filePath);
  await assert.doesNotReject(() => fs.access(result.filePath));
  assert.equal(result.provider, 'local');
});

test('Automatic1111 provider falls back to txt2img when no reference image is supplied', async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'spriteforge-a1111-fallback-'));
  let requestUrl = '';

  const provider = new Automatic1111ImageProvider({
    baseUrl: 'http://127.0.0.1:7860',
    outputDir: tempDir,
    fetchImpl: async (url) => {
      requestUrl = String(url);
      return {
        ok: true,
        json: async () => ({
          images: ['iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAEklEQVR42mP8z/C/HwAIAwMCAH+1G0cAAAAASUVORK5CYII='],
        }),
      };
    },
  });

  const result = await provider.editImage({
    prompt: 'Generate a fallback sprite.',
    width: 256,
    height: 256,
    steps: 20,
    cfg_scale: 7,
    sampler_name: 'Euler a',
    seed: 123,
    batch_size: 1,
    stageId: 'local-fallback',
  });

  assert.equal(requestUrl, 'http://127.0.0.1:7860/sdapi/v1/txt2img');
  assert.match(result.dataUrl, /^data:image\/png;base64,/);
  assert.equal(result.provider, 'local');
});

test('Automatic1111 provider returns a simple unavailable error when the API is down', async () => {
  const provider = new Automatic1111ImageProvider({
    baseUrl: 'http://127.0.0.1:7860',
    fetchImpl: async () => {
      throw new Error('fetch failed');
    },
  });

  await assert.rejects(
    () => provider.generateImage({ prompt: 'Test sprite' }),
    (error) => {
      assert.equal(error.message, LOCAL_SD_ERROR_MESSAGE);
      assert.equal(error.code, 'local_stable_diffusion_unavailable');
      return true;
    }
  );
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
