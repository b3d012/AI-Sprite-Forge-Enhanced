async function blobFromInput(input) {
  if (!input) return null;

  if (typeof Blob !== 'undefined' && input instanceof Blob) {
    return input;
  }

  if (typeof input === 'string' && input.startsWith('data:')) {
    const response = await fetch(input);
    return response.blob();
  }

  if (typeof input === 'object' && input.dataUrl) {
    const response = await fetch(input.dataUrl);
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

export class OpenAIImageProvider {
  constructor({
    apiKey = '',
    endpoint = 'https://api.openai.com/v1/images/edits',
    model = 'gpt-image-1',
    fetchImpl = globalThis.fetch?.bind(globalThis),
  } = {}) {
    this.mode = 'openai';
    this.apiKey = apiKey;
    this.endpoint = endpoint;
    this.model = model;
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
    outputFormat = 'png',
    stageId = 'openai-generate',
    model = this.model,
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
        response_format: 'b64_json',
        n: 1,
        output_format: outputFormat,
      }),
    });

    if (!response.ok) {
      const payload = await readJsonError(response);
      const message = payload?.error?.message || `OpenAI request failed with status ${response.status}`;
      throw new Error(message);
    }

    const result = await response.json();
    const b64 = result?.data?.[0]?.b64_json;
    if (!b64) {
      throw new Error('OpenAI response did not include an image payload.');
    }

    return {
      provider: this.mode,
      stageId,
      mimeType: 'image/png',
      dataUrl: toDataUrlFromB64(b64, 'image/png'),
      raw: result,
    };
  }

  async editImage({
    prompt,
    image,
    size = '1024x1024',
    quality = 'low',
    background = 'transparent',
    stageId = 'openai-edit',
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
    const b64 = result?.data?.[0]?.b64_json;
    const url = result?.data?.[0]?.url;

    if (b64) {
      return {
        provider: this.mode,
        stageId,
        mimeType: 'image/png',
        dataUrl: `data:image/png;base64,${b64}`,
        raw: result,
      };
    }

    if (url) {
      return {
        provider: this.mode,
        stageId,
        mimeType: 'image/png',
        dataUrl: url,
        raw: result,
      };
    }

    throw new Error('OpenAI response did not include an image payload.');
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
