import { gcdList, getPixel, mean, median, normalizeHex, quantizePixel, sameColor, toColorObject } from './_helpers.js';

function collectRunLengths(image, axis = 'row', sampleStride = 1, tolerance = 8) {
  const lengths = [];
  const { width, height } = image;

  if (axis === 'row') {
    for (let y = 0; y < height; y += sampleStride) {
      let startX = 0;
      let previous = quantizePixel(getPixel(image, 0, y), 16);
      for (let x = 1; x < width; x += 1) {
        const current = quantizePixel(getPixel(image, x, y), 16);
        if (!sameColor(previous, current, tolerance)) {
          lengths.push(x - startX);
          startX = x;
          previous = current;
        }
      }
      lengths.push(width - startX);
    }
  } else {
    for (let x = 0; x < width; x += sampleStride) {
      let startY = 0;
      let previous = quantizePixel(getPixel(image, x, 0), 16);
      for (let y = 1; y < height; y += 1) {
        const current = quantizePixel(getPixel(image, x, y), 16);
        if (!sameColor(previous, current, tolerance)) {
          lengths.push(y - startY);
          startY = y;
          previous = current;
        }
      }
      lengths.push(height - startY);
    }
  }

  return lengths.filter((value) => value > 1);
}

function scoreCandidate(image, cellSize, tolerance = 8) {
  const { width, height } = image;
  const gridWidth = Math.max(1, Math.round(width / cellSize));
  const gridHeight = Math.max(1, Math.round(height / cellSize));
  let alignedRuns = 0;
  let totalRuns = 0;
  const samples = [];

  const rowRuns = collectRunLengths(image, 'row', Math.max(1, Math.floor(height / 64)), tolerance);
  const colRuns = collectRunLengths(image, 'col', Math.max(1, Math.floor(width / 64)), tolerance);
  samples.push(...rowRuns, ...colRuns);

  for (const run of samples) {
    totalRuns += 1;
    const remainder = run % cellSize;
    const distance = Math.min(remainder, cellSize - remainder);
    if (distance <= 1) {
      alignedRuns += 1;
    }
  }

  const alignment = totalRuns > 0 ? alignedRuns / totalRuns : 0;
  const coveragePenalty = 1 / Math.max(1, gridWidth * gridHeight);
  const divisibilityPenalty = (width % cellSize === 0 && height % cellSize === 0) ? 0 : 0.1;
  const score = alignment + coveragePenalty - divisibilityPenalty;

  return {
    score,
    gridWidth,
    gridHeight,
    alignment,
    sampleCount: totalRuns,
  };
}

export function estimateNativeGrid(image, options = {}) {
  const { width, height } = image;
  const maxCellSize = options.maxCellSize || Math.max(1, Math.floor(Math.min(width, height) / 2));
  const tolerance = options.tolerance ?? 8;
  const sampleStride = options.sampleStride || 1;
  const rowRuns = collectRunLengths(image, 'row', sampleStride, tolerance);
  const colRuns = collectRunLengths(image, 'col', sampleStride, tolerance);
  const allRuns = [...rowRuns, ...colRuns].filter((value) => value > 1 && value <= maxCellSize * 4);

  let gcdEstimate = 1;
  if (allRuns.length > 0) {
    gcdEstimate = gcdList(allRuns);
  }

  if (gcdEstimate < 1) gcdEstimate = 1;
  if (gcdEstimate > maxCellSize) {
    let reduced = gcdEstimate;
    while (reduced > maxCellSize && reduced % 2 === 0) {
      reduced /= 2;
    }
    if (reduced <= maxCellSize) {
      gcdEstimate = reduced;
    }
  }

  const divisors = [];
  for (let size = 1; size <= maxCellSize; size += 1) {
    if (width % size === 0 || height % size === 0 || size <= 4) {
      divisors.push(size);
    }
  }

  let best = {
    cellSize: gcdEstimate,
    score: -Infinity,
    gridWidth: Math.max(1, Math.round(width / gcdEstimate)),
    gridHeight: Math.max(1, Math.round(height / gcdEstimate)),
    alignment: 0,
    sampleCount: allRuns.length,
  };

  for (const size of divisors) {
    const candidate = scoreCandidate(image, size, tolerance);
    if (
      candidate.score > best.score + 0.0001 ||
      (Math.abs(candidate.score - best.score) <= 0.0001 && size > best.cellSize)
    ) {
      best = {
        cellSize: size,
        ...candidate,
      };
    }
  }

  const resolvedCellSize = Math.max(1, best.cellSize || gcdEstimate || 1);
  const resolvedGridWidth = Math.max(1, Math.round(width / resolvedCellSize));
  const resolvedGridHeight = Math.max(1, Math.round(height / resolvedCellSize));
  const confidence = Math.max(
    0,
    Math.min(
      1,
      (best.alignment * 0.7) +
        (Math.min(1, allRuns.length / 100) * 0.2) +
        ((resolvedCellSize <= Math.min(width, height) / 4) ? 0.1 : 0)
    )
  );

  return {
    cellSize: resolvedCellSize,
    gridWidth: resolvedGridWidth,
    gridHeight: resolvedGridHeight,
    confidence,
    sampleCount: allRuns.length,
    alignment: best.alignment,
    method: allRuns.length > 0 ? 'run-length-gcd' : 'dimension-fallback',
    target: normalizeHex(options.target || '#00FF00'),
    suggestedExportScale: options.exportScale || resolvedCellSize,
  };
}

