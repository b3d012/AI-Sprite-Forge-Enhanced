import { getState } from './state.js';
import { STYLE_PROMPTS, generateSpritePrompt } from './prompts.js';

export async function readFileAsDataURL(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error('Failed to read file as data URL'));
    reader.readAsDataURL(file);
  });
}

export async function dataURLtoFile(dataUrl, filename = 'image.png') {
  if (!dataUrl || typeof dataUrl !== 'string' || !dataUrl.startsWith('data:')) {
    throw new Error('Invalid data URL format');
  }

  const response = await fetch(dataUrl);
  const blob = await response.blob();
  return new File([blob], filename, {
    type: blob.type || 'image/png',
    lastModified: Date.now(),
  });
}

async function convertToPNG(file) {
  if (file.type === 'image/png' || typeof document === 'undefined') {
    return file;
  }

  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;

      const ctx = canvas.getContext('2d');
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0);

      canvas.toBlob((blob) => {
        if (!blob) {
          reject(new Error('Failed to convert image to PNG.'));
          return;
        }
        resolve(new File([blob], 'image.png', { type: 'image/png', lastModified: Date.now() }));
      }, 'image/png', 1);
    };
    img.onerror = () => reject(new Error('Failed to load image for PNG conversion.'));
    img.src = URL.createObjectURL(file);
  });
}

async function requestProviderImage(payload = {}) {
  const response = await fetch('/api/pipeline/providers/edit', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => null);
    const error = new Error(errorData?.error || errorData?.message || `Image request failed with status ${response.status}`);
    error.code = errorData?.code || 'image_request_failed';
    throw error;
  }

  const responsePayload = await response.json();
  if (!responsePayload?.dataUrl) {
    throw new Error('Provider endpoint did not return an image.');
  }

  return responsePayload;
}

export async function remoteEdit(prompt, imageDataUrl, providerMode = 'auto', options = {}) {
  const payload = await requestProviderImage({
    prompt,
    imageDataUrl,
    negative_prompt: options.negative_prompt || '',
    model: 'gpt-image-1',
    size: options.size || '1024x1024',
    width: options.width,
    height: options.height,
    steps: options.steps,
    cfg_scale: options.cfg_scale,
    sampler_name: options.sampler_name,
    seed: options.seed ?? '',
    denoising_strength: options.denoising_strength,
    batch_size: options.batch_size,
    quality: options.quality || 'low',
    background: options.background || 'opaque',
    label: options.label || '',
    postprocess: options.postprocess || undefined,
    providerMode,
  });

  return payload.dataUrl;
}

export async function remoteGenerate(prompt, providerMode = 'openai', options = {}) {
  const payload = await requestProviderImage({
    prompt,
    providerMode,
    stageId: options.stageId || 'south_front_anchor_generation',
    size: options.size || '1024x1024',
    width: options.width,
    height: options.height,
    negative_prompt: options.negative_prompt || '',
    steps: options.steps,
    cfg_scale: options.cfg_scale,
    sampler_name: options.sampler_name,
    seed: options.seed ?? '',
    batch_size: options.batch_size,
    quality: options.quality || 'low',
    background: options.background || 'opaque',
    label: options.label || '',
    postprocess: options.postprocess || undefined,
  });

  return payload;
}

export async function callOpenAIEdit(prompt, imageFile, apiKey, options = {}) {
  const state = getState();

  if (!(imageFile instanceof File || imageFile instanceof Blob)) {
    throw new Error('Invalid image type: expected File or Blob');
  }

  const imageDataUrl = await readFileAsDataURL(imageFile);
  return remoteEdit(prompt, imageDataUrl, state.provider?.mode || 'auto', options);
}

export async function generateSpriteStyles(imageFile) {
  const state = getState();
  const baseImage =
    imageFile || state.uploadedImage || state.inputs?.referenceImage || state.inputs?.referenceImageDataUrl || null;
  if (!baseImage) {
    throw new Error('A reference image is required before generating styles.');
  }

  const normalizedInput =
    typeof baseImage === 'string' ? await dataURLtoFile(baseImage, 'reference.png') : baseImage;
  const processedImage = await convertToPNG(normalizedInput);

  const stylePromises = STYLE_PROMPTS.map(async (style) => {
    try {
      const referenceToken = `CHAR_${Date.now().toString(36)}`;
      const prompt = generateSpritePrompt(style.id, 'idle', referenceToken);
      const imageUrl = await callOpenAIEdit(prompt, processedImage, state.apiKey);
      return { id: style.id, imageUrl };
    } catch (error) {
      return { id: style.id, error: error.message || 'Generation failed' };
    }
  });

  const results = await Promise.allSettled(stylePromises);
  return results
    .filter((result) => result.status === 'fulfilled' && result.value?.imageUrl)
    .map((result) => result.value);
}

export async function generateSpriteAction(styleId, actionId, frameIndex = 0, isContinuation = frameIndex > 0) {
  const state = getState();

  let imageToUse = state.uploadedImage || state.inputs?.referenceImage || state.inputs?.referenceImageDataUrl || null;
  if (typeof imageToUse === 'string') {
    imageToUse = await dataURLtoFile(imageToUse, 'reference.png');
  }

  if (isContinuation && frameIndex > 0 && state.generatedFrames?.[actionId]?.[frameIndex - 1]?.imageUrl) {
    try {
      imageToUse = await dataURLtoFile(state.generatedFrames[actionId][frameIndex - 1].imageUrl, `frame-${frameIndex - 1}.png`);
    } catch {
      // Keep the current image if decoding fails.
    }
  } else if (styleId !== 'original') {
    const styledImage = state.generatedStyles?.find((style) => style.id === styleId);
    if (styledImage?.imageUrl) {
      try {
        imageToUse = await dataURLtoFile(styledImage.imageUrl, `${styleId}.png`);
      } catch {
        // Keep the current image if decoding fails.
      }
    }
  }

  if (!(imageToUse instanceof File || imageToUse instanceof Blob)) {
    throw new Error('A valid image is required before generating an action frame.');
  }

  if (imageToUse.type !== 'image/png') {
    imageToUse = await convertToPNG(imageToUse);
  }

  const referenceToken = `CHAR_${Date.now().toString(36)}`;
  const prompt = generateSpritePrompt(styleId, actionId, referenceToken, undefined, frameIndex, isContinuation);
  const imageUrl = await callOpenAIEdit(prompt, imageToUse, state.apiKey);

  return {
    id: actionId,
    frameIndex,
    imageUrl,
    generatedFromPrevious: isContinuation && frameIndex > 0,
    styleId,
  };
}
