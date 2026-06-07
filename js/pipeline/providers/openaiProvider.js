import { saveGeneratedImageArtifact } from '../../image/postprocess.js';

async function blobFromInput(input) {
  if (!input) return null;

  if (typeof Blob !== 'undefined' && input instanceof Blob) {
    return input;
  }

  if (typeof input === 'string' && input.startsWith('data:')) {
    const response = await fetch(input);
    return response.blob();
  }

  if (typeof input === 'string' && /^https?:\/\//i.test(input)) {
    const response = await fetch(input);
    return response.blob();
  }

  if (typeof input === 'object' && (input.dataUrl || input.data_url || input.url)) {
    const response = await fetch(input.dataUrl || input.data_url || input.url);
    return response.blob();
  }

  return null;
}

async function readJsonError(response) {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

function toDataUrlFromB64(b64, mimeType = 'image/png') {
  return `data:${mimeType};base64,${b64}`;
}

function slugify(value = 'image') {
  return String(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48) || 'image';
}

async function blobToDataUrl(blob, mimeType = 'image/png') {
  if (!blob) return null;

  const resolvedMimeType = mimeType || blob.type || 'image/png';
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let base64 = '';

  if (typeof Buffer !== 'undefined') {
    base64 = Buffer.from(bytes).toString('base64');
  } else {
    let binary = '';
    for (const byte of bytes) {
      binary += String.fromCharCode(byte);
    }
    base64 = btoa(binary);
  }

  return toDataUrlFromB64(base64, resolvedMimeType);
}

async function fetchUrlAsDataUrl(url, mimeType = 'image/png') {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Unable to fetch OpenAI image payload from ${url}`);
  }

  const contentType = response.headers.get('content-type') || mimeType || 'image/png';
  const blob = await response.blob();
  return blobToDataUrl(blob, contentType);
}

async function resolveImageDataUrl(node, depth = 0) {
  if (!node || depth > 5) return null;

  if (typeof node === 'string') {
    if (node.startsWith('data:')) return node;
    if (/^https?:\/\//i.test(node)) return fetchUrlAsDataUrl(node);
    return null;
  }

  if (node.dataUrl) return node.dataUrl;
  if (node.data_url) return node.data_url;
  if (node.b64_json) return toDataUrlFromB64(node.b64_json, node.mime_type || node.mimeType || 'image/png');
  if (node.base64) return toDataUrlFromB64(node.base64, node.mime_type || node.mimeType || 'image/png');
  if (node.image_base64) return toDataUrlFromB64(node.image_base64, node.mime_type || node.mimeType || 'image/png');
  if (node.url) return fetchUrlAsDataUrl(node.url, node.mime_type || node.mimeType || 'image/png');
  if (node.image_url?.url) return fetchUrlAsDataUrl(node.image_url.url, node.image_url?.mime_type || node.mime_type || node.mimeType || 'image/png');
  if (Array.isArray(node.content)) {
    for (const item of node.content) {
      const resolved = await resolveImageDataUrl(item, depth + 1);
      if (resolved) return resolved;
    }
  }
  if (Array.isArray(node.data)) {
    for (const item of node.data) {
      const resolved = await resolveImageDataUrl(item, depth + 1);
      if (resolved) return resolved;
    }
  }
  if (Array.isArray(node.output)) {
    for (const item of node.output) {
      const resolved = await resolveImageDataUrl(item, depth + 1);
      if (resolved) return resolved;
    }
  }
  if (Array.isArray(node.images)) {
    for (const item of node.images) {
      const resolved = await resolveImageDataUrl(item, depth + 1);
      if (resolved) return resolved;
    }
  }

  return null;
}

async function normalizeImageResponse(result, stageId, prompt, providerMode) {
  const dataUrl = await resolveImageDataUrl(result);
  if (!dataUrl) {
    throw new Error('OpenAI response did not include an image payload.');
  }

  const mimeType = dataUrl.match(/^data:([^;]+);base64,/)?.[1] || 'image/png';
  return {
    provider: providerMode || 'openai',
    stageId,
    mimeType,
    dataUrl,
    raw: result,
    prompt,
  };
}

export class OpenAIImageProvider {
  constructor({
    apiKey = '',
    endpoint = 'https://api.openai.com/v1/images/edits',
    model = 'gpt-image-1',
    outputDir = '',
    fetchImpl = globalThis.fetch?.bind(globalThis),
  } = {}) {
    this.mode = 'openai';
    this.apiKey = apiKey;
    this.endpoint = endpoint;
    this.model = model;
    this.outputDir = outputDir;
    this.fetchImpl = fetchImpl;
  }

  getStatus() {
    return {
      mode: this.mode,
      ready: !!this.apiKey,
      source: 'openai',
    };
  }

  ensureApiKey() {
    if (!this.apiKey) {
      throw new Error('OpenAI provider requires OPENAI_API_KEY. Set IMAGE_PROVIDER=mock for local development and tests.');
    }
  }

  async generateImage({
    prompt,
    size = '1024x1024',
    quality = 'low',
    background = 'opaque',
    stageId = 'openai-generate',
    model = this.model,
    seed = '',
    negative_prompt = '',
    postprocess = {},
  } = {}) {
    this.ensureApiKey();

    if (!this.fetchImpl) {
      throw new Error('Fetch is not available in this environment.');
    }

    const response = await this.fetchImpl('https://api.openai.com/v1/images/generations', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model,
        prompt: prompt || '',
        size,
        quality,
        background,
        n: 1,
      }),
    });

    if (!response.ok) {
      const payload = await readJsonError(response);
      const message = payload?.error?.message || `OpenAI request failed with status ${response.status}`;
      throw new Error(message);
    }

    const result = await response.json();
    const normalized = await normalizeImageResponse(result, stageId, prompt, this.mode);
    if (this.outputDir && normalized.dataUrl) {
      const artifact = await saveGeneratedImageArtifact({
        outputDir: this.outputDir,
        baseName: `${Date.now()}-${slugify(stageId)}-${slugify(seed || 'random')}`,
        dataUrl: normalized.dataUrl,
        prompt: prompt || '',
        negativePrompt: negative_prompt || '',
        seed,
        model,
        backend: this.mode,
        settings: {
          size,
          quality,
          background,
          endpoint: this.endpoint,
          stageId,
        },
        postprocess,
      });
      normalized.outputDir = artifact.outputDir;
      normalized.fileName = artifact.original?.fileName || null;
      normalized.filePath = artifact.original?.filePath || null;
      normalized.metadataPath = artifact.metadataPath || null;
      normalized.outputPaths = artifact.outputPaths || [];
      normalized.processedImage = artifact.processed || null;
    }
    return normalized;
  }

  async editImage({
    prompt,
    image,
    size = '1024x1024',
    quality = 'low',
    background = 'opaque',
    stageId = 'openai-edit',
    seed = '',
    negative_prompt = '',
    postprocess = {},
  } = {}) {
    this.ensureApiKey();

    if (!this.fetchImpl) {
      throw new Error('Fetch is not available in this environment.');
    }

    const blob = await blobFromInput(image);
    if (!blob) {
      throw new Error('OpenAI provider requires an image input.');
    }

    const formData = new FormData();
    formData.append('model', this.model);
    formData.append('prompt', prompt || '');
    formData.append('n', '1');
    formData.append('size', size);
    formData.append('quality', quality);
    formData.append('background', background);
    formData.append('image', blob, 'reference.png');

    const response = await this.fetchImpl(this.endpoint, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: formData,
    });

    if (!response.ok) {
      const payload = await readJsonError(response);
      const message = payload?.error?.message || `OpenAI request failed with status ${response.status}`;
      throw new Error(message);
    }

    const result = await response.json();
    const normalized = await normalizeImageResponse(result, stageId, prompt, this.mode);
    if (this.outputDir && normalized.dataUrl) {
      const artifact = await saveGeneratedImageArtifact({
        outputDir: this.outputDir,
        baseName: `${Date.now()}-${slugify(stageId)}-${slugify(seed || 'random')}`,
        dataUrl: normalized.dataUrl,
        prompt: prompt || '',
        negativePrompt: negative_prompt || '',
        seed,
        model: this.model,
        backend: this.mode,
        settings: {
          size,
          quality,
          background,
          endpoint: this.endpoint,
          stageId,
        },
        postprocess,
      });
      normalized.outputDir = artifact.outputDir;
      normalized.fileName = artifact.original?.fileName || null;
      normalized.filePath = artifact.original?.filePath || null;
      normalized.metadataPath = artifact.metadataPath || null;
      normalized.outputPaths = artifact.outputPaths || [];
      normalized.processedImage = artifact.processed || null;
    }
    return normalized;
  }

  async renderImage(options = {}) {
    if (options?.image) {
      return this.editImage(options);
    }

    return this.generateImage(options);
  }

  async generateVariations(options = {}) {
    throw new Error('Image variations are not supported for GPT image models in this provider.');
  }
}
