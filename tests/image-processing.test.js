import test from 'node:test';
import assert from 'node:assert/strict';

import {
  chromaKeyToAlpha,
  detectChromaBackground,
  estimateNativeGrid,
  nearestNeighborResize,
  pixelSnapImage,
  reduceMixels,
  cleanGreenFringe,
  rekeyTransparentToChroma,
  validatePixelArtImage,
} from '../js/image/index.js';

function makeImage(width, height, fill = [0, 255, 0, 255]) {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < data.length; i += 4) {
    data[i] = fill[0];
    data[i + 1] = fill[1];
    data[i + 2] = fill[2];
    data[i + 3] = fill[3];
  }
  return { width, height, data };
}

function fillRect(image, x0, y0, w, h, color) {
  for (let y = y0; y < y0 + h; y += 1) {
    for (let x = x0; x < x0 + w; x += 1) {
      const idx = (y * image.width + x) * 4;
      image.data[idx] = color[0];
      image.data[idx + 1] = color[1];
      image.data[idx + 2] = color[2];
      image.data[idx + 3] = color[3];
    }
  }
}

test('detects chroma background on a mostly green sprite', () => {
  const image = makeImage(16, 16);
  fillRect(image, 4, 4, 8, 8, [255, 0, 0, 255]);

  const result = detectChromaBackground(image);

  assert.equal(result.target, '#00FF00');
  assert.ok(result.coverage > 0.6);
  assert.ok(result.edgeCoverage > 0.75);
  assert.equal(result.isMostlyTarget, true);
});

test('keys chroma to alpha and rekeys alpha back to chroma', () => {
  const image = makeImage(8, 8);
  fillRect(image, 2, 2, 4, 4, [255, 0, 0, 255]);

  const transparent = chromaKeyToAlpha(image, '#00FF00', 4);
  const transparentCount = transparent.data.filter((_, index) => index % 4 === 3 && transparent.data[index] === 0).length;
  assert.ok(transparentCount > 0);

  const rekeyed = rekeyTransparentToChroma(transparent, '#00FF00');
  for (let i = 0; i < rekeyed.data.length; i += 4) {
    if (transparent.data[i + 3] === 0) {
      assert.equal(rekeyed.data[i], 0);
      assert.equal(rekeyed.data[i + 1], 255);
      assert.equal(rekeyed.data[i + 2], 0);
      assert.equal(rekeyed.data[i + 3], 255);
    }
  }
});

test('estimates native grid from nearest-neighbor blocks', () => {
  const image = makeImage(64, 64);
  for (let by = 0; by < 4; by += 1) {
    for (let bx = 0; bx < 4; bx += 1) {
      const color = (bx + by) % 2 === 0 ? [20, 20, 20, 255] : [200, 200, 200, 255];
      fillRect(image, bx * 16, by * 16, 16, 16, color);
    }
  }

  const grid = estimateNativeGrid(image);
  assert.ok(grid.cellSize >= 8);
  assert.ok(grid.gridWidth >= 4);
  assert.ok(grid.gridHeight >= 4);
  assert.ok(grid.confidence >= 0);
});

test('nearest-neighbor resize preserves chunky pixels', () => {
  const image = makeImage(2, 2, [0, 0, 0, 255]);
  fillRect(image, 0, 0, 1, 1, [255, 0, 0, 255]);
  fillRect(image, 1, 0, 1, 1, [0, 255, 0, 255]);
  fillRect(image, 0, 1, 1, 1, [0, 0, 255, 255]);
  fillRect(image, 1, 1, 1, 1, [255, 255, 0, 255]);

  const resized = nearestNeighborResize(image, 4, 4);
  const firstRow = Array.from(resized.data.slice(0, 16));
  const secondRow = Array.from(resized.data.slice(16, 32));
  assert.deepEqual(firstRow, [
    255, 0, 0, 255,
    255, 0, 0, 255,
    0, 255, 0, 255,
    0, 255, 0, 255,
  ]);
  assert.deepEqual(secondRow, [
    255, 0, 0, 255,
    255, 0, 0, 255,
    0, 255, 0, 255,
    0, 255, 0, 255,
  ]);
});

test('pixel snap produces output and metadata for a mock sprite', () => {
  const image = makeImage(32, 32);
  fillRect(image, 8, 8, 16, 16, [255, 0, 0, 255]);
  const snapped = pixelSnapImage(image, {
    outputWidth: 32,
    outputHeight: 32,
    reduceMixels: true,
    cleanGreenFringe: true,
  });

  assert.equal(snapped.width, 32);
  assert.equal(snapped.height, 32);
  assert.ok(snapped.meta.nativeGrid);
  assert.ok(snapped.meta.snapped);
});

test('mixel reduction and green fringe cleanup preserve crisp edges', () => {
  const image = makeImage(4, 4);
  fillRect(image, 1, 1, 2, 2, [120, 255, 120, 255]);
  image.data[(1 * 4 + 1) * 4] = 120;
  image.data[(1 * 4 + 1) * 4 + 1] = 240;
  image.data[(1 * 4 + 1) * 4 + 2] = 120;

  const cleaned = cleanGreenFringe(image, { preserveAlpha: false });
  assert.equal(cleaned.width, 4);
  assert.equal(cleaned.height, 4);

  const reduced = reduceMixels(image, { iterations: 1 });
  assert.equal(reduced.width, 4);
});

test('validation returns warnings for common sprite issues', () => {
  const image = makeImage(16, 16, [10, 255, 10, 255]);
  for (let i = 0; i < image.data.length; i += 4) {
    image.data[i] = (i / 4) % 255;
    image.data[i + 1] = 200;
    image.data[i + 2] = 255 - ((i / 4) % 255);
  }
  image.data[0] = 0;
  image.data[1] = 0;
  image.data[2] = 0;
  image.data[3] = 128;

  const validation = validatePixelArtImage(image, {
    uniqueColorThreshold: 4,
    semiTransparentThreshold: 0,
    backgroundThreshold: 0.95,
    maxNativeCellSize: 4,
  });

  assert.equal(validation.valid, false);
  assert.ok(validation.warnings.length >= 1);
  assert.ok(validation.stats.uniqueColors > 4);
});
