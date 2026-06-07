import pngjs from 'pngjs';
import fs from 'node:fs/promises';
import path from 'node:path';

import { detectChromaBackground, rekeyTransparentToChroma } from './chroma.js';
import { nearestNeighborResize } from './pixelSnap.js';
import {
  cloneImageLike,
  colorDistanceSq,
  createImageLike,
  hexToRgba,
  normalizeHex,
  toColorObject,
} from './_helpers.js';

const { PNG } = pngjs;

function parseDataUrl(dataUrl) {
  if (typeof dataUrl !== 'string' || !dataUrl.startsWith('data:')) {
    return null;
  }

  const match = /^data:([^;,]+)?(?:;charset=[^;,]+)?(;base64)?,([\s\S]*)$/i.exec(dataUrl);
  if (!match) {
    return null;
  }

  const mimeType = match[1] || 'application/octet-stream';
  const isBase64 = !!match[2];
  const payload = match[3] || '';
  return {
    mimeType,
    buffer: isBase64
      ? Buffer.from(payload, 'base64')
      : Buffer.from(decodeURIComponent(payload), 'utf8'),
  };
}

export function isPngDataUrl(dataUrl) {
  return /^data:image\/png(;charset=[^;,]+)?;base64,/i.test(dataUrl || '');
}

export function decodePngDataUrl(dataUrl) {
  const parsed = parseDataUrl(dataUrl);
  if (!parsed || !/image\/png/i.test(parsed.mimeType)) {
    return null;
  }

  const png = PNG.sync.read(parsed.buffer);
  return createImageLike(png.width, png.height, new Uint8ClampedArray(png.data), {
    mimeType: parsed.mimeType,
  });
}

export function encodePngDataUrl(imageLike) {
  const image = imageLike.data ? imageLike : createImageLike(imageLike.width, imageLike.height, imageLike.data);
  const png = new PNG({ width: image.width, height: image.height });
  png.data = Buffer.from(image.data);
  const buffer = PNG.sync.write(png);
  return `data:image/png;base64,${buffer.toString('base64')}`;
}

export function imageLikeToBuffer(imageLike) {
  const image = imageLike.data ? imageLike : createImageLike(imageLike.width, imageLike.height, imageLike.data);
  const png = new PNG({ width: image.width, height: image.height });
  png.data = Buffer.from(image.data);
  return PNG.sync.write(png);
}

export function detectForegroundBounds(image, options = {}) {
  const source = image.data ? image : createImageLike(image.width, image.height, image.data);
  const target = toColorObject(options.target || '#00FF00');
  const tolerance = Math.max(0, options.tolerance ?? 48);
  const toleranceSq = tolerance * tolerance;
  const alphaThreshold = options.alphaThreshold ?? 8;

  let minX = source.width;
  let minY = source.height;
  let maxX = -1;
  let maxY = -1;

  for (let y = 0; y < source.height; y += 1) {
    for (let x = 0; x < source.width; x += 1) {
      const idx = (y * source.width + x) * 4;
      const pixel = {
        r: source.data[idx],
        g: source.data[idx + 1],
        b: source.data[idx + 2],
        a: source.data[idx + 3],
      };

      if (pixel.a <= alphaThreshold) continue;
      if (colorDistanceSq(pixel, target) <= toleranceSq) continue;

      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
    }
  }

  if (maxX < 0 || maxY < 0) {
    return {
      x: 0,
      y: 0,
      width: source.width,
      height: source.height,
      found: false,
    };
  }

  const padding = Math.max(0, Math.trunc(options.padding ?? 0));
  const x = Math.max(0, minX - padding);
  const y = Math.max(0, minY - padding);
  const width = Math.min(source.width - x, (maxX - minX + 1) + (padding * 2));
  const height = Math.min(source.height - y, (maxY - minY + 1) + (padding * 2));

  return {
    x,
    y,
    width,
    height,
    found: true,
  };
}

export function cropImageLike(image, options = {}) {
  const source = image.data ? image : createImageLike(image.width, image.height, image.data);
  const bounds = options.bounds || detectForegroundBounds(source, options);
  if (!bounds) {
    return cloneImageLike(source);
  }

  const x = Math.max(0, Math.min(source.width - 1, Math.trunc(bounds.x || 0)));
  const y = Math.max(0, Math.min(source.height - 1, Math.trunc(bounds.y || 0)));
  const width = Math.max(1, Math.min(source.width - x, Math.trunc(bounds.width || source.width)));
  const height = Math.max(1, Math.min(source.height - y, Math.trunc(bounds.height || source.height)));

  if (x === 0 && y === 0 && width === source.width && height === source.height) {
    return cloneImageLike(source);
  }

  const output = new Uint8ClampedArray(width * height * 4);
  for (let row = 0; row < height; row += 1) {
    for (let col = 0; col < width; col += 1) {
      const srcIdx = ((y + row) * source.width + (x + col)) * 4;
      const dstIdx = (row * width + col) * 4;
      output[dstIdx] = source.data[srcIdx];
      output[dstIdx + 1] = source.data[srcIdx + 1];
      output[dstIdx + 2] = source.data[srcIdx + 2];
      output[dstIdx + 3] = source.data[srcIdx + 3];
    }
  }

  return createImageLike(width, height, output, {
    ...(source.meta || {}),
    crop: {
      bounds: { x, y, width, height },
      target: normalizeHex(options.target || '#00FF00'),
      padding: Math.max(0, Math.trunc(options.padding ?? 0)),
    },
  });
}

export function fitImageToCanvas(image, options = {}) {
  const source = image.data ? image : createImageLike(image.width, image.height, image.data);
  const targetWidth = Math.max(1, Math.trunc(options.width || source.width));
  const targetHeight = Math.max(1, Math.trunc(options.height || source.height));
  const background = toColorObject(options.background || '#00FF00');
  const mode = options.mode || 'contain';

  if (mode === 'stretch') {
    return nearestNeighborResize(source, targetWidth, targetHeight);
  }

  const scale = Math.min(targetWidth / source.width, targetHeight / source.height);
  const resizedWidth = Math.max(1, Math.round(source.width * scale));
  const resizedHeight = Math.max(1, Math.round(source.height * scale));
  const resized = (resizedWidth === source.width && resizedHeight === source.height)
    ? cloneImageLike(source)
    : nearestNeighborResize(source, resizedWidth, resizedHeight);

  const output = new Uint8ClampedArray(targetWidth * targetHeight * 4);
  for (let i = 0; i < output.length; i += 4) {
    output[i] = background.r;
    output[i + 1] = background.g;
    output[i + 2] = background.b;
    output[i + 3] = background.a;
  }

  const offsetX = Math.floor((targetWidth - resized.width) / 2);
  const offsetY = Math.floor((targetHeight - resized.height) / 2);

  for (let y = 0; y < resized.height; y += 1) {
    for (let x = 0; x < resized.width; x += 1) {
      const srcIdx = (y * resized.width + x) * 4;
      const dstX = x + offsetX;
      const dstY = y + offsetY;
      if (dstX < 0 || dstY < 0 || dstX >= targetWidth || dstY >= targetHeight) continue;
      const dstIdx = (dstY * targetWidth + dstX) * 4;
      output[dstIdx] = resized.data[srcIdx];
      output[dstIdx + 1] = resized.data[srcIdx + 1];
      output[dstIdx + 2] = resized.data[srcIdx + 2];
      output[dstIdx + 3] = resized.data[srcIdx + 3];
    }
  }

  return createImageLike(targetWidth, targetHeight, output, {
    ...(source.meta || {}),
    resize: {
      method: 'contain',
      from: { width: source.width, height: source.height },
      to: { width: targetWidth, height: targetHeight },
      content: { width: resized.width, height: resized.height },
      background: normalizeHex(options.background || '#00FF00'),
      offset: { x: offsetX, y: offsetY },
    },
  });
}

function normalizePostprocessOptions(options = {}) {
  const targetSize = options.targetSize || {};
  const resize = options.resize || {};
  const trim = options.trim || {};
  return {
    keepChromaGreenBackground: options.keepChromaGreenBackground ?? true,
    targetColor: normalizeHex(options.targetColor || '#00FF00'),
    trim: {
      enabled: trim.enabled ?? !!options.trimEnabled,
      padding: Math.max(0, Math.trunc(trim.padding ?? options.trimPadding ?? 16)),
      target: normalizeHex(trim.target || options.targetColor || '#00FF00'),
      tolerance: Math.max(0, Math.trunc(trim.tolerance ?? options.trimTolerance ?? 48)),
    },
    resize: {
      enabled: resize.enabled ?? !!options.resizeEnabled,
      width: Math.max(1, Math.trunc(resize.width ?? targetSize.width ?? options.resizeWidth ?? 0)),
      height: Math.max(1, Math.trunc(resize.height ?? targetSize.height ?? options.resizeHeight ?? 0)),
      mode: resize.mode || options.resizeMode || 'contain',
      background: normalizeHex(resize.background || options.resizeBackground || '#00FF00'),
    },
    saveProcessedCopy: options.saveProcessedCopy ?? true,
  };
}

export function applySpritePostProcessing(image, options = {}) {
  const source = image.data ? image : createImageLike(image.width, image.height, image.data);
  const normalized = normalizePostprocessOptions(options);
  const operations = [];
  let working = cloneImageLike(source);

  if (normalized.keepChromaGreenBackground && options.convertTransparentToChroma !== false) {
    const rekeyed = rekeyTransparentToChroma(working, normalized.targetColor);
    if (rekeyed.data.some((value, index) => value !== working.data[index])) {
      working = rekeyed;
      operations.push({
        type: 'keep-chroma-green',
        target: normalized.targetColor,
      });
    }
  }

  if (normalized.trim.enabled) {
    const bounds = detectForegroundBounds(working, {
      target: normalized.trim.target,
      tolerance: normalized.trim.tolerance,
      padding: normalized.trim.padding,
    });
    const cropped = cropImageLike(working, {
      bounds,
      target: normalized.trim.target,
      padding: normalized.trim.padding,
    });
    if (cropped.width !== working.width || cropped.height !== working.height) {
      working = cropped;
      operations.push({
        type: 'trim',
        bounds: bounds ? { x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height } : null,
        padding: normalized.trim.padding,
        target: normalized.trim.target,
      });
    }
  }

  if (normalized.resize.enabled && normalized.resize.width && normalized.resize.height) {
    const resized = fitImageToCanvas(working, {
      width: normalized.resize.width,
      height: normalized.resize.height,
      background: normalized.resize.background,
      mode: normalized.resize.mode,
    });
    if (resized.width !== working.width || resized.height !== working.height) {
      working = resized;
      operations.push({
        type: 'resize',
        mode: normalized.resize.mode,
        width: normalized.resize.width,
        height: normalized.resize.height,
        background: normalized.resize.background,
      });
    }
  }

  return createImageLike(working.width, working.height, new Uint8ClampedArray(working.data), {
    ...(working.meta || {}),
    postprocess: {
      ...(working.meta?.postprocess || {}),
      originalSize: { width: source.width, height: source.height },
      targetColor: normalized.targetColor,
      operations,
    },
  });
}

export function buildImageMetadata({
  prompt = '',
  negativePrompt = '',
  seed = '',
  model = '',
  backend = '',
  settings = {},
  source = {},
  output = {},
  postprocess = {},
  variant = 'original',
} = {}) {
  return {
    prompt,
    negativePrompt,
    seed,
    model,
    backend,
    settings: { ...settings },
    source: { ...source },
    output: { ...output },
    postprocess: { ...postprocess, variant },
    generatedAt: new Date().toISOString(),
  };
}

function inferExtension(mimeType = 'image/png') {
  if (/image\/png/i.test(mimeType)) return '.png';
  if (/image\/svg\+xml/i.test(mimeType)) return '.svg';
  if (/image\/jpeg/i.test(mimeType)) return '.jpg';
  return '.bin';
}

async function writeDataUrlToFile(filePath, dataUrl) {
  const parsed = parseDataUrl(dataUrl);
  if (!parsed) {
    throw new Error('Invalid data URL. Unable to save image.');
  }

  await fs.writeFile(filePath, parsed.buffer);
  return parsed.mimeType;
}

export async function saveGeneratedImageArtifact({
  outputDir = '',
  baseName = 'sprite',
  dataUrl,
  prompt = '',
  negativePrompt = '',
  seed = '',
  model = '',
  backend = '',
  settings = {},
  postprocess = {},
}) {
  if (!outputDir) {
    return {
      outputDir: '',
      original: null,
      processed: null,
      metadataPath: null,
      outputPaths: [],
    };
  }

  await fs.mkdir(outputDir, { recursive: true });

  const parsed = parseDataUrl(dataUrl);
  if (!parsed) {
    throw new Error('Invalid data URL. Unable to save generated image.');
  }

  const originalExt = inferExtension(parsed.mimeType);
  const originalFileName = `${baseName}${originalExt}`;
  const originalFilePath = path.join(outputDir, originalFileName);
  await fs.writeFile(originalFilePath, parsed.buffer);

  const sourceMeta = {
    mimeType: parsed.mimeType,
    fileName: originalFileName,
    filePath: originalFilePath,
  };

  const outputPaths = [originalFilePath];
  const originalMetadata = buildImageMetadata({
    prompt,
    negativePrompt,
    seed,
    model,
    backend,
    settings,
    source: sourceMeta,
    output: { fileName: originalFileName, filePath: originalFilePath, mimeType: parsed.mimeType },
    postprocess: {
      enabled: !!(postprocess?.trim?.enabled || postprocess?.resize?.enabled || postprocess?.keepChromaGreenBackground === false),
    },
    variant: 'original',
  });

  const originalMetadataPath = path.join(outputDir, `${baseName}.json`);
  await fs.writeFile(originalMetadataPath, JSON.stringify(originalMetadata, null, 2));
  outputPaths.push(originalMetadataPath);

  let processed = null;
  if (/image\/png/i.test(parsed.mimeType) && (postprocess?.trim?.enabled || postprocess?.resize?.enabled || postprocess?.keepChromaGreenBackground !== undefined)) {
    const originalImage = decodePngDataUrl(dataUrl);
    if (originalImage) {
      const processedImage = applySpritePostProcessing(originalImage, postprocess);
      const changed =
        processedImage.width !== originalImage.width ||
        processedImage.height !== originalImage.height ||
        processedImage.data.some((value, index) => value !== originalImage.data[index]);

      if (changed) {
        const processedFileName = `${baseName}-processed.png`;
        const processedFilePath = path.join(outputDir, processedFileName);
        await fs.writeFile(processedFilePath, imageLikeToBuffer(processedImage));

        const processedMetadata = buildImageMetadata({
          prompt,
          negativePrompt,
          seed,
          model,
          backend,
          settings,
          source: sourceMeta,
          output: {
            fileName: processedFileName,
            filePath: processedFilePath,
            mimeType: 'image/png',
            width: processedImage.width,
            height: processedImage.height,
          },
          postprocess: processedImage.meta?.postprocess || {},
          variant: 'processed',
        });
        const processedMetadataPath = path.join(outputDir, `${baseName}-processed.json`);
        await fs.writeFile(processedMetadataPath, JSON.stringify(processedMetadata, null, 2));
        outputPaths.push(processedFilePath, processedMetadataPath);
        processed = {
          fileName: processedFileName,
          filePath: processedFilePath,
          metadataPath: processedMetadataPath,
          dataUrl: encodePngDataUrl(processedImage),
          width: processedImage.width,
          height: processedImage.height,
        };
      }
    }
  }

  return {
    outputDir,
    original: {
      fileName: originalFileName,
      filePath: originalFilePath,
      metadataPath: originalMetadataPath,
      mimeType: parsed.mimeType,
      dataUrl,
    },
    processed,
    metadataPath: originalMetadataPath,
    outputPaths,
  };
}
