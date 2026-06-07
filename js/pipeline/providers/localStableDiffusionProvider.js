import fs from 'node:fs/promises';
import path from 'node:path';
import { saveGeneratedImageArtifact } from '../../image/postprocess.js';

const DEFAULT_BASE_URL = 'http://127.0.0.1:7860';
const DEFAULT_DENOISING_STRENGTH = 0.55;
const LOCAL_SD_ERROR_MESSAGE = 'Local Stable Diffusion is not running. Start AUTOMATIC1111 with --api and try again.';

function normalizeBaseUrl(baseUrl = DEFAULT_BASE_URL) {
  return String(baseUrl || DEFAULT_BASE_URL).replace(/\/+$/, '');
}

function toPositiveInt(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function normalizeSeed(seed) {
  if (seed === null || seed === undefined || seed === '') {
    return -1;
  }

  const parsed = Number(seed);
  return Number.isFinite(parsed) ? Math.trunc(parsed) : -1;
}

function normalizeDenoisingStrength(value, fallback = DEFAULT_DENOISING_STRENGTH) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  return Math.min(1, Math.max(0, parsed));
}

function normalizeDimensions({ width, height, size } = {}) {
  if (Number.isFinite(Number(width)) && Number.isFinite(Number(height))) {
    return {
      width: Math.max(64, Math.trunc(Number(width))),
      height: Math.max(64, Math.trunc(Number(height))),
    };
  }

  if (typeof size === 'string' && size.includes('x')) {
    const [maybeWidth, maybeHeight] = size.split('x', 2);
    const parsedWidth = Number.parseInt(maybeWidth, 10);
    const parsedHeight = Number.parseInt(maybeHeight, 10);
    if (Number.isFinite(parsedWidth) && Number.isFinite(parsedHeight)) {
      return {
        width: Math.max(64, parsedWidth),
        height: Math.max(64, parsedHeight),
      };
    }
  }

  return {
    width: 1024,
    height: 1024,
  };
}

function extractImageStrings(result) {
  if (!result) return [];

  const values = [];
  const pushValue = (value) => {
    if (typeof value === 'string' && value.trim()) {
      values.push(value.trim());
    }
  };

  if (typeof result === 'string') {
    pushValue(result);
    return values;
  }

  if (Array.isArray(result.images)) {
    result.images.forEach(pushValue);
  }

  if (Array.isArray(result.data)) {
    result.data.forEach((item) => {
      if (typeof item === 'string') {
        pushValue(item);
      } else {
        pushValue(item?.b64_json || item?.base64 || item?.image || item?.url);
      }
    });
  }

  if (result.image) {
    pushValue(result.image);
  }

  if (result.b64_json) {
    pushValue(result.b64_json);
  }

  return values;
}

function toDataUrl(base64, mimeType = 'image/png') {
  if (!base64) return null;
  if (base64.startsWith('data:')) return base64;
  return `data:${mimeType};base64,${base64}`;
}

function extractBase64(imageString) {
  if (!imageString || typeof imageString !== 'string') return '';

  const trimmed = imageString.trim();
  if (!trimmed) return '';

  if (!trimmed.startsWith('data:')) {
    return trimmed;
  }

  const base64Index = trimmed.indexOf('base64,');
  return base64Index === -1 ? '' : trimmed.slice(base64Index + 7);
}

function toBufferFromImageString(imageString) {
  if (!imageString) return null;

  const base64 = extractBase64(imageString);

  return Buffer.from(base64, 'base64');
}

function slugify(value = 'image') {
  return String(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48) || 'image';
}

async function pathExists(candidatePath) {
  try {
    await fs.access(candidatePath);
    return true;
  } catch {
    return false;
  }
}

async function resolveOutputDirectory(rootDir = process.cwd()) {
  const candidates = [
    path.join(rootDir, 'outputs', 'generated'),
    path.join(rootDir, 'output', 'generated'),
    path.join(rootDir, 'generated'),
  ];

  for (const candidate of candidates) {
    if (await pathExists(candidate)) {
      return candidate;
    }
  }

  const fallback = candidates[0];
  await fs.mkdir(fallback, { recursive: true });
  return fallback;
}

function buildRequestPayload({
  prompt = '',
  negative_prompt = '',
  width = 1024,
  height = 1024,
  steps = 20,
  cfg_scale = 7,
  sampler_name = 'Euler a',
  seed = -1,
  batch_size = 1,
} = {}) {
  return {
    prompt,
    negative_prompt,
    width,
    height,
    steps,
    cfg_scale,
    sampler_name,
    seed,
    batch_size,
    n_iter: 1,
    restore_faces: false,
    tiling: false,
    enable_hr: false,
  };
}

async function safeReadJson(response) {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

async function saveGeneratedImages({
  outputDir,
  images,
  stageId,
  seed,
  prompt = '',
  negativePrompt = '',
  model = '',
  backend = 'automatic1111',
  settings = {},
  postprocess = {},
}) {
  const savedFiles = [];
  const processedFiles = [];
  const baseSeed = slugify(seed === -1 ? 'random' : seed);
  const basePrefix = `${Date.now()}-${slugify(stageId)}-${baseSeed}`;

  for (let index = 0; index < images.length; index += 1) {
    const imageDataUrl = images[index].startsWith('data:')
      ? images[index]
      : `data:image/png;base64,${images[index]}`;
    const suffix = images.length > 1 ? `-${String(index + 1).padStart(2, '0')}` : '';
    const baseName = `${basePrefix}${suffix}`;
    const artifact = await saveGeneratedImageArtifact({
      outputDir,
      baseName,
      dataUrl: imageDataUrl,
      prompt,
      negativePrompt,
      seed,
      model,
      backend,
      settings: {
        ...settings,
        stageId,
      },
      postprocess,
    });

    if (artifact.original) {
      savedFiles.push(artifact.original);
    }

    if (artifact.processed) {
      processedFiles.push(artifact.processed);
    }
  }

  return {
    savedFiles,
    processedFiles,
  };
}

async function resolveInitImage(image) {
  if (!image) return '';

  if (typeof image === 'string') {
    return extractBase64(image);
  }

  if (typeof Buffer !== 'undefined' && Buffer.isBuffer(image)) {
    return image.toString('base64');
  }

  if (typeof Blob !== 'undefined' && image instanceof Blob) {
    const arrayBuffer = await image.arrayBuffer();
    return Buffer.from(arrayBuffer).toString('base64');
  }

  if (typeof image === 'object') {
    return extractBase64(image.dataUrl || image.data_url || image.base64 || image.b64_json || image.image || '');
  }

  return '';
}

function localUnavailableError(details = {}) {
  const error = new Error(LOCAL_SD_ERROR_MESSAGE);
  error.code = 'local_stable_diffusion_unavailable';
  error.status = 503;
  error.details = details;
  return error;
}

export class Automatic1111ImageProvider {
  constructor({
    baseUrl = DEFAULT_BASE_URL,
    endpoint = '/sdapi/v1/txt2img',
    outputDir = null,
    timeoutMs = 120000,
    denoisingStrength = DEFAULT_DENOISING_STRENGTH,
    fetchImpl = globalThis.fetch?.bind(globalThis),
  } = {}) {
    this.mode = 'local';
    this.baseUrl = normalizeBaseUrl(baseUrl);
    this.endpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
    this.outputDir = outputDir;
    this.timeoutMs = toPositiveInt(timeoutMs, 120000);
    this.defaultDenoisingStrength = normalizeDenoisingStrength(denoisingStrength, DEFAULT_DENOISING_STRENGTH);
    this.fetchImpl = fetchImpl;
  }

  getStatus() {
    return {
      mode: this.mode,
      ready: !!this.baseUrl,
      source: 'automatic1111',
      baseUrl: this.baseUrl,
    };
  }

  async ensureOutputDir() {
    if (this.outputDir) {
      await fs.mkdir(this.outputDir, { recursive: true });
      return this.outputDir;
    }

    this.outputDir = await resolveOutputDirectory(process.cwd());
    return this.outputDir;
  }

  async requestToEndpoint(endpoint, payload) {
    if (!this.fetchImpl) {
      throw localUnavailableError({ reason: 'fetch_unavailable' });
    }

    const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const timeoutId = controller
      ? setTimeout(() => controller.abort(), this.timeoutMs)
      : null;

    try {
      const response = await this.fetchImpl(`${this.baseUrl}${endpoint}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
        signal: controller?.signal,
      });

      if (!response.ok) {
        throw localUnavailableError({ status: response.status });
      }

      const result = await response.json().catch(() => null);
      const images = extractImageStrings(result);
      if (!images.length) {
        throw localUnavailableError({ reason: 'no_images_returned' });
      }

      return result;
    } catch (error) {
      if (error?.name === 'AbortError' || error?.code === 'ECONNREFUSED' || error?.cause?.code === 'ECONNREFUSED') {
        throw localUnavailableError({ reason: 'connection_failed' });
      }

      if (error?.code === 'local_stable_diffusion_unavailable') {
        throw error;
      }

      if (error instanceof SyntaxError) {
        throw localUnavailableError({ reason: 'invalid_json' });
      }

      if (String(error?.message || '').toLowerCase().includes('fetch')) {
        throw localUnavailableError({ reason: 'fetch_failed' });
      }

      throw localUnavailableError({ reason: 'unexpected_response' });
    } finally {
      if (timeoutId) clearTimeout(timeoutId);
    }
  }

  async requestTxt2Img(payload) {
    return this.requestToEndpoint(this.endpoint, payload);
  }

  async requestImg2Img(payload) {
    return this.requestToEndpoint('/sdapi/v1/img2img', payload);
  }

  buildCommonPayload({
    prompt = '',
    negative_prompt = '',
    width,
    height,
    size,
    steps = 20,
    cfg_scale = 7,
    sampler_name = 'Euler a',
    seed = -1,
    batch_size = 1,
  } = {}) {
    const { width: resolvedWidth, height: resolvedHeight } = normalizeDimensions({ width, height, size });

    return {
      prompt,
      negative_prompt,
      width: resolvedWidth,
      height: resolvedHeight,
      steps,
      cfg_scale,
      sampler_name,
      seed: normalizeSeed(seed),
      batch_size: Math.max(1, toPositiveInt(batch_size, 1)),
    };
  }

  async generateImage({
    prompt = '',
    negative_prompt = '',
    width,
    height,
    size,
    steps = 20,
    cfg_scale = 7,
    sampler_name = 'Euler a',
    seed = -1,
    batch_size = 1,
    stageId = 'local-generate',
    label = '',
    postprocess = {},
  } = {}) {
    const payload = buildRequestPayload(this.buildCommonPayload({
      prompt,
      negative_prompt,
      width,
      height,
      size,
      steps,
      cfg_scale,
      sampler_name,
      seed,
      batch_size,
    }));
    const { width: resolvedWidth, height: resolvedHeight } = normalizeDimensions({ width, height, size });

    const result = await this.requestTxt2Img(payload);
    const images = extractImageStrings(result);
    const outputDir = await this.ensureOutputDir();
    let savedFiles = [];
    let processedFiles = [];
    try {
      const saved = await saveGeneratedImages({
        outputDir,
        images,
        stageId: label || stageId,
        seed: payload.seed,
        prompt,
        negativePrompt: negative_prompt,
        model: 'AUTOMATIC1111',
        backend: this.mode,
        settings: {
          width: resolvedWidth,
          height: resolvedHeight,
          steps: payload.steps,
          cfgScale: payload.cfg_scale,
          samplerName: payload.sampler_name,
          batchSize: payload.batch_size,
          outputDir,
        },
        postprocess,
      });
      savedFiles = saved.savedFiles || [];
      processedFiles = saved.processedFiles || [];
      if (processedFiles.length) {
        console.info(`Saved ${processedFiles.length} processed sprite variant(s) for ${stageId}.`);
      }
    } catch (saveError) {
      console.warn('Unable to save AUTOMATIC1111 output:', saveError);
    }
    const first = savedFiles[0];

    return {
      provider: this.mode,
      source: 'automatic1111',
      stageId,
      label,
      prompt,
      negativePrompt: negative_prompt,
      width: resolvedWidth,
      height: resolvedHeight,
      steps: payload.steps,
      cfgScale: payload.cfg_scale,
      samplerName: payload.sampler_name,
      seed: payload.seed,
      batchSize: payload.batch_size,
      mimeType: 'image/png',
      dataUrl: first?.dataUrl || toDataUrl(images[0]),
      fileName: first?.fileName || null,
      filePath: first?.filePath || null,
      outputDir,
      outputPaths: [
        ...savedFiles.flatMap((entry) => [entry.filePath, entry.metadataPath].filter(Boolean)),
        ...processedFiles.flatMap((entry) => [entry.filePath, entry.metadataPath].filter(Boolean)),
      ],
      images: savedFiles.map((entry) => entry.dataUrl),
      processedImages: processedFiles.map((entry) => entry.dataUrl),
      processedPaths: processedFiles.flatMap((entry) => [entry.filePath, entry.metadataPath].filter(Boolean)),
      raw: result,
      request: payload,
    };
  }

  async editImage(options = {}) {
    const {
      image,
      denoising_strength,
      stageId = 'local-edit',
      label = '',
    } = options;

    const initImage = await resolveInitImage(image);
    if (!initImage) {
      return this.generateImage({
        ...options,
        stageId,
        label,
      });
    }

    const payload = buildRequestPayload(this.buildCommonPayload(options));
    payload.init_images = [initImage];
    payload.denoising_strength = normalizeDenoisingStrength(denoising_strength, this.defaultDenoisingStrength);
    payload.include_init_images = false;

    const result = await this.requestImg2Img(payload);
    const images = extractImageStrings(result);
    const outputDir = await this.ensureOutputDir();
    let savedFiles = [];
    let processedFiles = [];
    try {
      const saved = await saveGeneratedImages({
        outputDir,
        images,
        stageId: label || stageId,
        seed: payload.seed,
      });
      savedFiles = saved.savedFiles || [];
      processedFiles = saved.processedFiles || [];
    } catch (saveError) {
      console.warn('Unable to save AUTOMATIC1111 output:', saveError);
    }
    const first = savedFiles[0];
    const { width: resolvedWidth, height: resolvedHeight } = normalizeDimensions(options);

    return {
      provider: this.mode,
      source: 'automatic1111',
      stageId,
      label,
      prompt: options.prompt || '',
      negativePrompt: options.negative_prompt || '',
      width: resolvedWidth,
      height: resolvedHeight,
      steps: payload.steps,
      cfgScale: payload.cfg_scale,
      samplerName: payload.sampler_name,
      seed: payload.seed,
      batchSize: payload.batch_size,
      denoisingStrength: payload.denoising_strength,
      mimeType: 'image/png',
      dataUrl: first?.dataUrl || toDataUrl(images[0]),
      fileName: first?.fileName || null,
      filePath: first?.filePath || null,
      outputDir,
      outputPaths: [...savedFiles.map((entry) => entry.filePath), ...processedFiles.map((entry) => entry.filePath)],
      images: savedFiles.map((entry) => entry.dataUrl),
      processedImages: processedFiles.map((entry) => entry.dataUrl),
      processedPaths: processedFiles.map((entry) => entry.filePath),
      raw: result,
      request: payload,
    };
  }

  async renderImage(options = {}) {
    return this.generateImage(options);
  }

  async generateVariations() {
    throw new Error('Image variations are not supported by the AUTOMATIC1111 provider.');
  }
}

export { DEFAULT_BASE_URL as AUTOMATIC1111_DEFAULT_BASE_URL, LOCAL_SD_ERROR_MESSAGE };
