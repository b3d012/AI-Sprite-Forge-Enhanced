import { colorDistanceSq, createImageLike, hexToRgba, normalizeHex, toColorObject } from './_helpers.js';

function distanceToTarget(pixel, target) {
  return colorDistanceSq(pixel, target);
}

export function detectChromaBackground(image, target = '#00FF00') {
  const normalizedTarget = toColorObject(target);
  const targetHex = normalizeHex(target);
  const { width, height, data } = image;
  let borderPixels = 0;
  let borderMatches = 0;
  let overallMatches = 0;
  const edgeCounts = new Map();
  const edgeSamples = [];

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const idx = (y * width + x) * 4;
      const pixel = {
        r: data[idx],
        g: data[idx + 1],
        b: data[idx + 2],
        a: data[idx + 3],
      };
      const isTarget = distanceToTarget(pixel, normalizedTarget) === 0;
      if (isTarget) overallMatches += 1;

      const isBorder = x === 0 || y === 0 || x === width - 1 || y === height - 1;
      if (isBorder) {
        borderPixels += 1;
        edgeSamples.push(pixel);
        if (isTarget) borderMatches += 1;
        const key = `${pixel.r},${pixel.g},${pixel.b},${pixel.a}`;
        edgeCounts.set(key, (edgeCounts.get(key) || 0) + 1);
      }
    }
  }

  let dominantEdgeColor = targetHex;
  let dominantCount = 0;
  for (const [key, count] of edgeCounts.entries()) {
    if (count > dominantCount) {
      dominantCount = count;
      const [r, g, b] = key.split(',').map(Number);
      dominantEdgeColor = `#${[r, g, b]
        .map((channel) => channel.toString(16).padStart(2, '0'))
        .join('')
        .toUpperCase()}`;
    }
  }

  const coverage = width * height > 0 ? overallMatches / (width * height) : 0;
  const edgeCoverage = borderPixels > 0 ? borderMatches / borderPixels : 0;
  const confidence = Math.max(0, Math.min(1, (coverage * 0.6) + (edgeCoverage * 0.4)));

  return {
    target: targetHex,
    backgroundColor: edgeCoverage > 0.5 ? targetHex : dominantEdgeColor,
    dominantEdgeColor,
    coverage,
    edgeCoverage,
    borderPixels,
    targetPixels: overallMatches,
    edgeTargetPixels: borderMatches,
    confidence,
    isMostlyTarget: edgeCoverage >= 0.75 || coverage >= 0.5,
    edgeSamples: edgeSamples.slice(0, 32),
  };
}

export function chromaKeyToAlpha(image, target = '#00FF00', tolerance = 48) {
  const source = image.data ? image : createImageLike(image.width, image.height, image.data);
  const targetColor = hexToRgba(target);
  const toleranceSq = Math.max(0, tolerance) * Math.max(0, tolerance);
  const output = new Uint8ClampedArray(source.data.length);

  for (let i = 0; i < source.data.length; i += 4) {
    const pixel = {
      r: source.data[i],
      g: source.data[i + 1],
      b: source.data[i + 2],
      a: source.data[i + 3],
    };
    const distSq = distanceToTarget(pixel, targetColor);
    if (distSq <= toleranceSq) {
      output[i] = 0;
      output[i + 1] = 0;
      output[i + 2] = 0;
      output[i + 3] = 0;
      continue;
    }

    output[i] = pixel.r;
    output[i + 1] = pixel.g;
    output[i + 2] = pixel.b;
    output[i + 3] = pixel.a;
  }

  return createImageLike(source.width, source.height, output, {
    ...(source.meta || {}),
    chroma: {
      target: normalizeHex(target),
      tolerance,
    },
  });
}

export function rekeyTransparentToChroma(image, target = '#00FF00') {
  const source = image.data ? image : createImageLike(image.width, image.height, image.data);
  const targetColor = hexToRgba(target);
  const output = new Uint8ClampedArray(source.data.length);

  for (let i = 0; i < source.data.length; i += 4) {
    const alpha = source.data[i + 3];
    if (alpha === 0) {
      output[i] = targetColor.r;
      output[i + 1] = targetColor.g;
      output[i + 2] = targetColor.b;
      output[i + 3] = 255;
      continue;
    }

    output[i] = source.data[i];
    output[i + 1] = source.data[i + 1];
    output[i + 2] = source.data[i + 2];
    output[i + 3] = source.data[i + 3];
  }

  return createImageLike(source.width, source.height, output, {
    ...(source.meta || {}),
    chroma: {
      ...(source.meta?.chroma || {}),
      target: normalizeHex(target),
      rekeyed: true,
    },
  });
}

