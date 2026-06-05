import { chromaKeyToAlpha, rekeyTransparentToChroma } from './chroma.js';
import { estimateNativeGrid } from './nativeGrid.js';
import {
  collectNeighborPixels,
  colorDistanceSq,
  createImageLike,
  hexToRgba,
  normalizeHex,
  quantizePixel,
  sameColor,
  setPixel,
  toColorObject,
} from './_helpers.js';

export function nearestNeighborResize(image, width, height) {
  const source = image.data ? image : createImageLike(image.width, image.height, image.data);
  const output = new Uint8ClampedArray(width * height * 4);
  const xRatio = source.width / width;
  const yRatio = source.height / height;

  for (let y = 0; y < height; y += 1) {
    const srcY = Math.min(source.height - 1, Math.floor(y * yRatio));
    for (let x = 0; x < width; x += 1) {
      const srcX = Math.min(source.width - 1, Math.floor(x * xRatio));
      const srcIdx = (srcY * source.width + srcX) * 4;
      const dstIdx = (y * width + x) * 4;
      output[dstIdx] = source.data[srcIdx];
      output[dstIdx + 1] = source.data[srcIdx + 1];
      output[dstIdx + 2] = source.data[srcIdx + 2];
      output[dstIdx + 3] = source.data[srcIdx + 3];
    }
  }

  return createImageLike(width, height, output, {
    ...(source.meta || {}),
    resize: {
      method: 'nearest-neighbor',
      from: { width: source.width, height: source.height },
      to: { width, height },
    },
  });
}

function sampleBlockMode(image, startX, startY, endX, endY, quantizeStep = 16) {
  const counts = new Map();
  let bestKey = null;
  let bestCount = 0;

  for (let y = startY; y < endY; y += 1) {
    for (let x = startX; x < endX; x += 1) {
      const idx = (y * image.width + x) * 4;
      const pixel = {
        r: image.data[idx],
        g: image.data[idx + 1],
        b: image.data[idx + 2],
        a: image.data[idx + 3],
      };
      const quantized = quantizePixel(pixel, quantizeStep);
      const key = `${quantized.r},${quantized.g},${quantized.b},${quantized.a}`;
      const nextCount = (counts.get(key) || 0) + 1;
      counts.set(key, nextCount);
      if (nextCount > bestCount) {
        bestCount = nextCount;
        bestKey = key;
      }
    }
  }

  if (!bestKey) {
    return { r: 0, g: 0, b: 0, a: 0 };
  }

  const [r, g, b, a] = bestKey.split(',').map(Number);
  return { r, g, b, a };
}

function downscaleToNativeGrid(image, nativeGrid, options = {}) {
  const targetWidth = Math.max(1, nativeGrid.gridWidth || Math.round(image.width / nativeGrid.cellSize));
  const targetHeight = Math.max(1, nativeGrid.gridHeight || Math.round(image.height / nativeGrid.cellSize));
  const output = new Uint8ClampedArray(targetWidth * targetHeight * 4);
  const quantizeStep = options.quantizeStep || 16;

  for (let y = 0; y < targetHeight; y += 1) {
    const startY = Math.floor((y * image.height) / targetHeight);
    const endY = Math.max(startY + 1, Math.floor(((y + 1) * image.height) / targetHeight));
    for (let x = 0; x < targetWidth; x += 1) {
      const startX = Math.floor((x * image.width) / targetWidth);
      const endX = Math.max(startX + 1, Math.floor(((x + 1) * image.width) / targetWidth));
      const color = sampleBlockMode(image, startX, startY, endX, endY, quantizeStep);
      const dstIdx = (y * targetWidth + x) * 4;
      output[dstIdx] = color.r;
      output[dstIdx + 1] = color.g;
      output[dstIdx + 2] = color.b;
      output[dstIdx + 3] = color.a;
    }
  }

  return createImageLike(targetWidth, targetHeight, output, {
    ...(image.meta || {}),
    nativeGrid,
    resize: {
      method: 'block-mode',
      from: { width: image.width, height: image.height },
      to: { width: targetWidth, height: targetHeight },
    },
  });
}

export function reduceMixels(image, options = {}) {
  const source = image.data ? image : createImageLike(image.width, image.height, image.data);
  const iterations = Math.max(1, options.iterations || 1);
  const tolerance = options.tolerance ?? 24;
  const output = new Uint8ClampedArray(source.data);
  const temp = new Uint8ClampedArray(source.data.length);
  let working = createImageLike(source.width, source.height, output);

  for (let iteration = 0; iteration < iterations; iteration += 1) {
    temp.set(working.data);
    for (let y = 0; y < working.height; y += 1) {
      for (let x = 0; x < working.width; x += 1) {
        const idx = (y * working.width + x) * 4;
        const current = {
          r: working.data[idx],
          g: working.data[idx + 1],
          b: working.data[idx + 2],
          a: working.data[idx + 3],
        };
        if (current.a === 0) continue;

        const neighbors = collectNeighborPixels(working, x, y, 1).filter((pixel) => pixel.a > 0);
        if (neighbors.length < 3) continue;

        const colorCounts = new Map();
        let dominant = null;
        let dominantCount = 0;
        for (const neighbor of neighbors) {
          const q = quantizePixel(neighbor, 16);
          const key = `${q.r},${q.g},${q.b},${q.a}`;
          const nextCount = (colorCounts.get(key) || 0) + 1;
          colorCounts.set(key, nextCount);
          if (nextCount > dominantCount) {
            dominantCount = nextCount;
            dominant = q;
          }
        }

        if (!dominant) continue;

        const currentQuantized = quantizePixel(current, 16);
        const dominantDistance = colorDistanceSq(currentQuantized, dominant);
        if (dominantCount >= 5 && dominantDistance <= tolerance * tolerance) {
          temp[idx] = dominant.r;
          temp[idx + 1] = dominant.g;
          temp[idx + 2] = dominant.b;
          temp[idx + 3] = current.a;
        }
      }
    }

    working = createImageLike(working.width, working.height, temp, {
      ...(working.meta || {}),
      mixelsReduced: true,
    });
  }

  return working;
}

export function cleanGreenFringe(image, options = {}) {
  const source = image.data ? image : createImageLike(image.width, image.height, image.data);
  const target = toColorObject(options.target || '#00FF00');
  const tolerance = options.tolerance ?? 48;
  const fringeTolerance = options.fringeTolerance ?? 36;
  const preserveAlpha = options.preserveAlpha ?? false;
  const output = new Uint8ClampedArray(source.data);

  for (let y = 0; y < source.height; y += 1) {
    for (let x = 0; x < source.width; x += 1) {
      const idx = (y * source.width + x) * 4;
      const pixel = {
        r: source.data[idx],
        g: source.data[idx + 1],
        b: source.data[idx + 2],
        a: source.data[idx + 3],
      };

      if (pixel.a === 0) continue;

      const distSq = colorDistanceSq(pixel, target);
      const greenDominant = pixel.g >= pixel.r + 12 && pixel.g >= pixel.b + 12;
      const edgeNeighbors = collectNeighborPixels(source, x, y, 1).filter((neighbor) => neighbor.a === 0);
      const nearBackground = edgeNeighbors.length > 0 || distSq <= fringeTolerance * fringeTolerance;

      if (greenDominant && nearBackground) {
        if (!preserveAlpha && distSq <= tolerance * tolerance) {
          output[idx] = 0;
          output[idx + 1] = 0;
          output[idx + 2] = 0;
          output[idx + 3] = 0;
          continue;
        }

        const opaqueNeighbors = collectNeighborPixels(source, x, y, 1).filter((neighbor) => neighbor.a > 0);
        if (opaqueNeighbors.length > 0) {
          const avg = opaqueNeighbors.reduce(
            (acc, neighbor) => ({
              r: acc.r + neighbor.r,
              g: acc.g + neighbor.g,
              b: acc.b + neighbor.b,
              a: acc.a + neighbor.a,
            }),
            { r: 0, g: 0, b: 0, a: 0 }
          );
          output[idx] = Math.round(avg.r / opaqueNeighbors.length);
          output[idx + 1] = Math.round(avg.g / opaqueNeighbors.length);
          output[idx + 2] = Math.round(avg.b / opaqueNeighbors.length);
          output[idx + 3] = preserveAlpha ? pixel.a : Math.min(255, Math.max(1, pixel.a));
        }
      }
    }
  }

  return createImageLike(source.width, source.height, output, {
    ...(source.meta || {}),
    fringeCleaned: true,
  });
}

export function pixelSnapImage(image, options = {}) {
  const source = image.data ? image : createImageLike(image.width, image.height, image.data);
  const target = normalizeHex(options.target || '#00FF00');
  const finalExport = options.finalExport ?? false;
  const downscale = options.downscale !== false;
  const upscaleToOriginal = options.upscale !== false;
  const cleanupMixels = options.reduceMixels !== false;
  const cleanFringe = options.cleanGreenFringe !== false;
  const preserveTransparent = options.preserveTransparent ?? finalExport;

  let working = createImageLike(source.width, source.height, new Uint8ClampedArray(source.data), {
    ...(source.meta || {}),
    pixelSnap: true,
  });

  const nativeGrid = options.nativeGrid || estimateNativeGrid(working, options.nativeGridOptions || {});
  if (downscale && nativeGrid.cellSize > 1) {
    working = downscaleToNativeGrid(working, nativeGrid, options.downscaleOptions || {});
  }

  if (cleanupMixels) {
    working = reduceMixels(working, options.reduceMixelsOptions || {});
  }

  if (cleanFringe) {
    working = cleanGreenFringe(working, {
      ...(options.cleanGreenFringeOptions || {}),
      target,
      preserveAlpha: preserveTransparent,
    });
  }

  if (!finalExport && !preserveTransparent) {
    working = rekeyTransparentToChroma(working, target);
  }

  if (options.outputWidth || options.outputHeight) {
    working = nearestNeighborResize(
      working,
      options.outputWidth || source.width,
      options.outputHeight || source.height
    );
  } else if (upscaleToOriginal && working.width !== source.width && working.height !== source.height) {
    working = nearestNeighborResize(working, source.width, source.height);
  }

  return createImageLike(working.width, working.height, new Uint8ClampedArray(working.data), {
    ...(working.meta || {}),
    nativeGrid,
    snapped: true,
    finalExport,
    target,
  });
}

