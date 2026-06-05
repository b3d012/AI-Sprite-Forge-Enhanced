import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { PipelineOrchestrator } from './js/pipeline/orchestrator.js';
import { PIPELINE_STAGE_DEFINITIONS } from './js/pipeline/stages.js';
import { MockImageProvider } from './js/pipeline/providers/mockProvider.js';
import { OpenAIImageProvider } from './js/pipeline/providers/openaiProvider.js';
import { createPipelineState } from './js/pipeline/state.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const port = process.env.PORT || 8080;
const host = process.env.NODE_ENV === 'production' ? '0.0.0.0' : 'localhost';
const openaiApiKey = process.env.OPENAI_API_KEY || '';
const maxUploadBytes = Number.parseInt(process.env.MAX_UPLOAD_BYTES || `${10 * 1024 * 1024}`, 10);

app.use(cors());
app.use(express.json({ limit: '25mb' }));
app.use(express.urlencoded({ extended: true, limit: '25mb' }));
app.use(express.static(__dirname));

function createProvider(mode = 'auto') {
  if (mode === 'openai' && openaiApiKey) {
    return new OpenAIImageProvider({
      apiKey: openaiApiKey,
      endpoint: process.env.OPENAI_IMAGE_EDIT_ENDPOINT || 'https://api.openai.com/v1/images/edits',
    });
  }

  if (mode === 'openai' && !openaiApiKey) {
    return new OpenAIImageProvider({
      apiKey: '',
      endpoint: process.env.OPENAI_IMAGE_EDIT_ENDPOINT || 'https://api.openai.com/v1/images/edits',
    });
  }

  if (mode === 'auto' && openaiApiKey) {
    return new OpenAIImageProvider({
      apiKey: openaiApiKey,
      endpoint: process.env.OPENAI_IMAGE_EDIT_ENDPOINT || 'https://api.openai.com/v1/images/edits',
    });
  }

  return new MockImageProvider();
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
    return sendApiError(res, error, 500);
  }
}

async function runProviderEndpoint(res, body = {}, stageId = 'client-edit') {
  try {
    const provider = createProvider(body.providerMode || body.provider || 'auto');
    const imageDataUrl = body.imageDataUrl || body.image || body.inputImage || '';
    const prompt = body.prompt || '';
    const size = body.size || body.options?.size || '1024x1024';
    const quality = body.quality || body.options?.quality || 'low';
    const background = body.background || body.options?.background || 'transparent';
    const label = body.label || stageId;
    const seed = body.seed || body.options?.seed || '';

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

    const isGeneration = ['anchor', 'directions', 'pose-board'].includes(stageId);
    const result = isGeneration
      ? await provider.generateImage({ prompt, size, quality, background, stageId, seed, width: 1024, height: 1024, label })
      : await provider.editImage({ prompt, image: imageDataUrl, size, quality, background, stageId, seed, label });

    return res.json({ ok: true, ...result });
  } catch (error) {
    console.error(`Provider stage ${stageId} failed:`, error);
    return sendApiError(res, error, 500);
  }
}

app.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    provider: openaiApiKey ? 'openai-or-mock' : 'mock',
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
    res.status(500).json({
      error: error.message || 'Stage run failed',
    });
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
    res.status(500).json({
      error: error.message || 'Pipeline run failed',
    });
  }
});

app.post('/api/generate-sprite', async (req, res) => {
  try {
    const orchestrator = createOrchestratorFromBody(req.body);
    const result = await orchestrator.runPipeline();
    res.json(result);
  } catch (error) {
    console.error('Legacy sprite generation failed:', error);
    res.status(500).json({
      error: error.message || 'Sprite generation failed',
    });
  }
});

app.listen(port, host, () => {
  console.log(`Server running at http://${host}:${port}`);
  console.log(`Provider mode: ${openaiApiKey ? 'openai (with mock fallback)' : 'mock only'}`);
});
