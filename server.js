import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { PipelineOrchestrator } from './js/pipeline/orchestrator.js';
import { PIPELINE_STAGE_DEFINITIONS } from './js/pipeline/stages.js';
import { MockImageProvider } from './js/pipeline/providers/mockProvider.js';
import { OpenAIImageProvider } from './js/pipeline/providers/openaiProvider.js';
import { Automatic1111ImageProvider } from './js/pipeline/providers/localStableDiffusionProvider.js';
import { createPipelineState } from './js/pipeline/state.js';
import { saveGeneratedImageArtifact } from './js/image/postprocess.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const port = process.env.PORT || 8080;
const host = process.env.NODE_ENV === 'production' ? '0.0.0.0' : 'localhost';
const openaiApiKey = process.env.OPENAI_API_KEY || '';
const automatic1111BaseUrl = process.env.AUTOMATIC1111_BASE_URL || process.env.A1111_BASE_URL || 'http://127.0.0.1:7860';
const automatic1111DenoisingStrength = process.env.AUTOMATIC1111_DENOISING_STRENGTH || 0.55;
const defaultProviderMode = process.env.IMAGE_PROVIDER || 'mock';
const maxUploadBytes = Number.parseInt(process.env.MAX_UPLOAD_BYTES || `${10 * 1024 * 1024}`, 10);
const GENERATION_STAGE_IDS = new Set([
  'anchor',
  'directions',
  'pose-board',
  'south_front_anchor',
  'south_front_anchor_generation',
  'directional_anchors_nsew',
  'action_pose_board',
  'action_pose_board_generation',
]);

function slugify(value = 'image') {
  return String(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48) || 'image';
}

class SavingMockImageProvider extends MockImageProvider {
  constructor(options = {}) {
    super(options);
    this.outputDir = options.outputDir || '';
  }

  async renderImage(options = {}) {
    const result = await super.renderImage(options);
    if (!this.outputDir || !result?.dataUrl) {
      return result;
    }

    try {
      const artifact = await saveGeneratedImageArtifact({
        outputDir: this.outputDir,
        baseName: `${Date.now()}-${slugify(result.stageId || options.stageId || 'mock')}-${slugify(options.seed || 'random')}`,
        dataUrl: result.dataUrl,
        prompt: options.prompt || '',
        negativePrompt: '',
        seed: options.seed || '',
        model: 'mock',
        backend: this.mode,
        settings: {
          width: result.width,
          height: result.height,
          stageId: result.stageId || options.stageId || 'mock-stage',
        },
        postprocess: options.postprocess || {},
      });

      return {
        ...result,
        fileName: artifact.original?.fileName || null,
        filePath: artifact.original?.filePath || null,
        outputDir: artifact.outputDir,
        outputPaths: artifact.outputPaths || [],
      };
    } catch (error) {
      console.warn('Unable to save mock output:', error);
      return result;
    }
  }
}

app.use(cors());
app.use(express.json({ limit: '25mb' }));
app.use(express.urlencoded({ extended: true, limit: '25mb' }));
app.use(express.static(__dirname));

function createProvider(mode = 'auto') {
  const requestedMode = (mode || defaultProviderMode || 'auto').toLowerCase();
  const model = process.env.OPENAI_IMAGE_MODEL || 'gpt-image-1';
  const outputDir = process.env.OPENAI_OUTPUT_DIR || process.env.IMAGE_OUTPUT_DIR || '';

  if (requestedMode === 'local') {
    return new Automatic1111ImageProvider({
      baseUrl: automatic1111BaseUrl,
      outputDir: process.env.AUTOMATIC1111_OUTPUT_DIR || process.env.IMAGE_OUTPUT_DIR || '',
      timeoutMs: process.env.AUTOMATIC1111_TIMEOUT_MS || 120000,
      denoisingStrength: automatic1111DenoisingStrength,
    });
  }

  if (requestedMode === 'openai' && openaiApiKey) {
    return new OpenAIImageProvider({
      apiKey: openaiApiKey,
      endpoint: process.env.OPENAI_IMAGE_EDIT_ENDPOINT || 'https://api.openai.com/v1/images/edits',
      model,
      outputDir,
    });
  }

  if (requestedMode === 'openai' && !openaiApiKey) {
    const error = new Error('OPENAI_API_KEY is not configured on the server. Set it to use OpenAI mode.');
    error.code = 'missing_openai_api_key';
    error.status = 503;
    throw error;
  }

  if (requestedMode === 'auto' && defaultProviderMode === 'local') {
    return new Automatic1111ImageProvider({
      baseUrl: automatic1111BaseUrl,
      outputDir: process.env.AUTOMATIC1111_OUTPUT_DIR || process.env.IMAGE_OUTPUT_DIR || '',
      timeoutMs: process.env.AUTOMATIC1111_TIMEOUT_MS || 120000,
      denoisingStrength: automatic1111DenoisingStrength,
    });
  }

  if (requestedMode === 'auto' && openaiApiKey) {
    return new OpenAIImageProvider({
      apiKey: openaiApiKey,
      endpoint: process.env.OPENAI_IMAGE_EDIT_ENDPOINT || 'https://api.openai.com/v1/images/edits',
      model,
      outputDir,
    });
  }

  return new SavingMockImageProvider({
    outputDir: process.env.IMAGE_OUTPUT_DIR || '',
  });
}

async function checkAutomatic1111Reachable(baseUrl = automatic1111BaseUrl) {
  if (!baseUrl || typeof fetch !== 'function') {
    return false;
  }

  const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const timeoutId = controller ? setTimeout(() => controller.abort(), 2000) : null;

  try {
    const response = await fetch(`${baseUrl.replace(/\/+$/, '')}/sdapi/v1/sd-models`, {
      method: 'GET',
      signal: controller?.signal,
    });
    return response.ok;
  } catch {
    return false;
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
}

function createOrchestratorFromBody(body = {}) {
  const state = body.state || createPipelineState();
  const provider = createProvider(body.providerMode || state.provider?.mode || 'auto');
  const orchestrator = new PipelineOrchestrator({
    state,
    provider,
    autoSave: false,
    stageDefinitions: PIPELINE_STAGE_DEFINITIONS,
  });
  return orchestrator;
}

function sendApiError(res, error, status = 500) {
  return res.status(status).json({
    ok: false,
    error: error?.message || 'Request failed',
    code: error?.code || 'server_error',
  });
}

async function runOrchestratorEndpoint(res, body, stageId) {
  try {
    const orchestrator = createOrchestratorFromBody(body);
    const result = await orchestrator.runStage(stageId, body?.inputPatch || {});
    return res.json(result);
  } catch (error) {
    console.error(`Stage ${stageId} failed:`, error);
    return sendApiError(
      res,
      error,
      error.status || (error.code === 'missing_openai_api_key' || error.code === 'local_stable_diffusion_unavailable' ? 503 : 500)
    );
  }
}

async function runProviderEndpoint(res, body = {}, stageId = 'client-edit') {
  try {
    const provider = createProvider(body.providerMode || body.provider || 'auto');
    const imageDataUrl = body.imageDataUrl || body.image || body.inputImage || '';
    const prompt = body.prompt || '';
    const negativePrompt = body.negative_prompt || body.negativePrompt || body.options?.negative_prompt || body.options?.negativePrompt || '';
    const size = body.size || body.options?.size || '1024x1024';
    const width = body.width || body.options?.width || undefined;
    const height = body.height || body.options?.height || undefined;
    const steps = body.steps || body.options?.steps || 20;
    const cfgScale = body.cfg_scale || body.cfgScale || body.options?.cfg_scale || body.options?.cfgScale || 7;
    const samplerName = body.sampler_name || body.samplerName || body.options?.sampler_name || body.options?.samplerName || 'Euler a';
    const batchSize = body.batch_size || body.batchSize || body.options?.batch_size || body.options?.batchSize || 1;
    const denoisingStrength = body.denoising_strength ?? body.denoisingStrength ?? body.options?.denoising_strength ?? body.options?.denoisingStrength ?? automatic1111DenoisingStrength;
    const quality = body.quality || body.options?.quality || 'low';
    const background = body.background || body.options?.background || 'opaque';
    const label = body.label || stageId;
    const seed = body.seed ?? body.options?.seed ?? '';
    const postprocess = body.postprocess || body.options?.postprocess || {};

    if (!prompt.trim() && stageId !== 'recover-frames' && stageId !== 'pixel-snap') {
      return sendApiError(res, { message: 'Prompt is required.', code: 'invalid_prompt' }, 400);
    }

    if (imageDataUrl && imageDataUrl.startsWith('data:')) {
      const base64Index = imageDataUrl.indexOf('base64,');
      if (base64Index !== -1) {
        const base64 = imageDataUrl.slice(base64Index + 7);
        const byteLength = Buffer.from(base64, 'base64').length;
        if (byteLength > maxUploadBytes) {
          return sendApiError(res, { message: 'Upload too large. Please use an image under 10 MB.', code: 'upload_too_large' }, 413);
        }
      }
    }

    const isGeneration = GENERATION_STAGE_IDS.has(stageId);
    const result = isGeneration
      ? await provider.generateImage({
        prompt,
        negative_prompt: negativePrompt,
        size,
        quality,
        background,
        stageId,
        seed,
        width,
        height,
        steps,
        cfg_scale: cfgScale,
        sampler_name: samplerName,
        batch_size: batchSize,
        label,
        postprocess,
      })
      : await provider.editImage({
        prompt,
        image: imageDataUrl,
        size,
        width,
        height,
        steps,
        cfg_scale: cfgScale,
        sampler_name: samplerName,
        batch_size: batchSize,
        denoising_strength: denoisingStrength,
        quality,
        background,
        stageId,
        seed,
        label,
        negative_prompt: negativePrompt,
        postprocess,
      });

    return res.json({ ok: true, ...result });
  } catch (error) {
    console.error(`Provider stage ${stageId} failed:`, error);
    return sendApiError(
      res,
      error,
      error.status || (error.code === 'missing_openai_api_key' || error.code === 'local_stable_diffusion_unavailable' ? 503 : 500)
    );
  }
}

app.get('/health', async (_req, res) => {
  const automatic1111Running = await checkAutomatic1111Reachable();
  const provider = defaultProviderMode === 'local' ? 'local' : openaiApiKey ? 'openai-or-mock' : 'mock';
  res.json({
    status: 'ok',
    provider,
    automatic1111BaseUrl,
    automatic1111Configured: automatic1111Running,
    openaiConfigured: !!openaiApiKey,
  });
});

app.post('/api/pipeline', async (req, res) => {
  const stage = req.body?.stage || 'edit';
  if (stage === 'anchor') return runProviderEndpoint(res, req.body, 'anchor');
  if (stage === 'directions') return runProviderEndpoint(res, req.body, 'directions');
  if (stage === 'pose-board') return runProviderEndpoint(res, req.body, 'pose-board');
  if (stage === 'pixel-snap') return runProviderEndpoint(res, req.body, 'pixel-snap');
  if (stage === 'recover-frames') return runProviderEndpoint(res, req.body, 'recover-frames');
  if (stage === 'export-bundle') {
    return res.json({
      ok: true,
      bundle: {
        title: req.body?.title || 'sprite-bundle',
        assets: Array.isArray(req.body?.assets) ? req.body.assets : [],
        manifest: req.body?.manifest || {},
      },
    });
  }
  return runProviderEndpoint(res, req.body, stage);
});

app.post('/api/generate/anchor', async (req, res) => runOrchestratorEndpoint(res, req.body, 'south_front_anchor_generation'));
app.post('/api/generate/directions', async (req, res) => runOrchestratorEndpoint(res, req.body, 'directional_anchors_nsew'));
app.post('/api/generate/pose-board', async (req, res) => runOrchestratorEndpoint(res, req.body, 'action_pose_board_generation'));
app.post('/api/process/pixel-snap', async (req, res) => runOrchestratorEndpoint(res, req.body, 'pixel_snap_anchor'));
app.post('/api/process/recover-frames', async (req, res) => runOrchestratorEndpoint(res, req.body, 'frame_recovery_components'));
app.post('/api/export/bundle', async (req, res) => runOrchestratorEndpoint(res, req.body, 'export_bundle'));

app.get('/api/pipeline/stages', (_req, res) => {
  res.json({
    stages: PIPELINE_STAGE_DEFINITIONS.map((stage) => ({
      id: stage.id,
      label: stage.label,
      description: stage.description,
    })),
  });
});

app.post('/api/pipeline/providers/edit', async (req, res) => {
  return runProviderEndpoint(res, req.body, req.body?.stageId || 'client-edit');
});

app.post('/api/pipeline/stages/:stageId/run', async (req, res) => {
  try {
    const orchestrator = createOrchestratorFromBody(req.body);
    const result = await orchestrator.runStage(req.params.stageId, req.body?.inputPatch || {});
    res.json(result);
  } catch (error) {
    console.error('Stage run failed:', error);
    return sendApiError(
      res,
      error,
      error.status || (error.code === 'missing_openai_api_key' || error.code === 'local_stable_diffusion_unavailable' ? 503 : 500)
    );
  }
});

app.post('/api/pipeline/run', async (req, res) => {
  try {
    const orchestrator = createOrchestratorFromBody(req.body);
    if (req.body?.stageId) {
      const result = await orchestrator.runStage(req.body.stageId, req.body?.inputPatch || {});
      return res.json(result);
    }

    const result = await orchestrator.runPipeline({
      untilStageId: req.body?.untilStageId || null,
    });

    return res.json(result);
  } catch (error) {
    console.error('Pipeline run failed:', error);
    return sendApiError(
      res,
      error,
      error.status || (error.code === 'missing_openai_api_key' || error.code === 'local_stable_diffusion_unavailable' ? 503 : 500)
    );
  }
});

app.post('/api/generate-sprite', async (req, res) => {
  try {
    const orchestrator = createOrchestratorFromBody(req.body);
    const result = await orchestrator.runPipeline();
    res.json(result);
  } catch (error) {
    console.error('Legacy sprite generation failed:', error);
    return sendApiError(
      res,
      error,
      error.status || (error.code === 'missing_openai_api_key' || error.code === 'local_stable_diffusion_unavailable' ? 503 : 500)
    );
  }
});

app.listen(port, host, () => {
  console.log(`Server running at http://${host}:${port}`);
  console.log(`Provider mode: ${defaultProviderMode}`);
  console.log(`Automatic1111 base URL: ${automatic1111BaseUrl}`);
});
