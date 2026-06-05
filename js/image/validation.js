import {
  computeUniqueColorCount,
  createImageLike,
  hexToRgba,
  normalizeHex,
  quantizePixel,
  sameColor,
  toColorObject,
} from './_helpers.js';
import { detectChromaBackground } from './chroma.js';
import { estimateNativeGrid } from './nativeGrid.js';

function sampleAntiAliasingScore(image, tolerance = 20) {
  let softPixels = 0;
  let evaluatedPixels = 0;

  for (let y = 1; y < image.height - 1; y += 1) {
    for (let x = 1; x < image.width - 1; x += 1) {
      const idx = (y * image.width + x) * 4;
      const pixel = {
        r: image.data[idx],
        g: image.data[idx + 1],
        b: image.data[idx + 2],
        a: image.data[idx + 3],
      };
      if (pixel.a === 0) continue;

      const left = {
        r: image.data[idx - 4],
        g: image.data[idx - 3],
        b: image.data[idx - 2],
        a: image.data[idx - 1],
      };
      const right = {
        r: image.data[idx + 4],
        g: image.data[idx + 5],
        b: image.data[idx + 6],
        a: image.data[idx + 7],
      };
      const up = {
        r: image.data[idx - image.width * 4],
        g: image.data[idx - image.width * 4 + 1],
        b: image.data[idx - image.width * 4 + 2],
        a: image.data[idx - image.width * 4 + 3],
      };
      const down = {
        r: image.data[idx + image.width * 4],
        g: image.data[idx + image.width * 4 + 1],
        b: image.data[idx + image.width * 4 + 2],
        a: image.data[idx + image.width * 4 + 3],
      };

      const neighbors = [left, right, up, down].filter((neighbor) => neighbor.a > 0);
      if (neighbors.length < 2) continue;
      evaluatedPixels += 1;

      const distinct = [];
      for (const neighbor of neighbors) {
        if (!distinct.some((item) => sameColor(item, neighbor, 0))) {
          distinct.push(neighbor);
        }
      }

      if (distinct.length < 2) continue;

      const average = distinct.reduce(
        (acc, neighbor) => ({
          r: acc.r + neighbor.r,
          g: acc.g + neighbor.g,
          b: acc.b + neighbor.b,
          a: acc.a + neighbor.a,
        }),
        { r: 0, g: 0, b: 0, a: 0 }
      );
      const averaged = {
        r: average.r / distinct.length,
        g: average.g / distinct.length,
        b: average.b / distinct.length,
        a: average.a / distinct.length,
      };
      const nearestNeighborDistance = Math.min(
        ...distinct.map((neighbor) => {
          const dr = pixel.r - neighbor.r;
          const dg = pixel.g - neighbor.g;
          const db = pixel.b - neighbor.b;
          return Math.sqrt(dr * dr + dg * dg + db * db);
        })
      );
      const averageDistance = Math.sqrt(
        (pixel.r - averaged.r) * (pixel.r - averaged.r) +
          (pixel.g - averaged.g) * (pixel.g - averaged.g) +
          (pixel.b - averaged.b) * (pixel.b - averaged.b)
      );

      const looksLikeIntermediary = averageDistance <= tolerance && nearestNeighborDistance > tolerance;
      if (looksLikeIntermediary && quantizePixel(pixel, 16).a > 0) {
        softPixels += 1;
      }
    }
  }

  return evaluatedPixels > 0 ? softPixels / evaluatedPixels : 0;
}

export function validatePixelArtImage(image, options = {}) {
  const source = image.data ? image : createImageLike(image.width, image.height, image.data);
  const target = normalizeHex(options.target || '#00FF00');
  const chroma = detectChromaBackground(source, target);
  const nativeGrid = estimateNativeGrid(source, options.nativeGridOptions || {});
  const uniqueColors = computeUniqueColorCount(source, options.uniqueColorQuantizeStep || 16);
  let semiTransparentPixels = 0;
  let exactTransparentPixels = 0;

  for (let i = 0; i < source.data.length; i += 4) {
    const alpha = source.data[i + 3];
    if (alpha === 0) exactTransparentPixels += 1;
    if (alpha > 0 && alpha < 255) semiTransparentPixels += 1;
  }

  const totalPixels = source.width * source.height || 1;
  const semiTransparentRatio = semiTransparentPixels / totalPixels;
  const transparencyRatio = exactTransparentPixels / totalPixels;
  const antiAliasingScore = sampleAntiAliasingScore(source, options.antiAliasTolerance || 20);

  const warnings = [];
  const backgroundThreshold = options.backgroundThreshold ?? 0.75;
  const semiTransparentThreshold = options.semiTransparentThreshold ?? 0.01;
  const uniqueColorThreshold = options.uniqueColorThreshold ?? Math.max(96, Math.round(totalPixels / 32));
  const antiAliasThreshold = options.antiAliasThreshold ?? 0.08;
  const maxNativeCellSize = options.maxNativeCellSize ?? 64;

  if (chroma.edgeCoverage < backgroundThreshold) {
    warnings.push({
      code: 'background-not-chroma',
      severity: 'warning',
      message: `Background is only ${Math.round(chroma.edgeCoverage * 100)}% ${target}; the sprite may not key cleanly.`,
    });
  }

  if (semiTransparentRatio > semiTransparentThreshold) {
    warnings.push({
      code: 'too-many-semi-transparent-pixels',
      severity: 'warning',
      message: `${Math.round(semiTransparentRatio * 100)}% of pixels are semi-transparent, which can create soft edges.`,
    });
  }

  if (uniqueColors > uniqueColorThreshold) {
    warnings.push({
      code: 'too-many-unique-colors',
      severity: 'warning',
      message: `Image uses ${uniqueColors} unique colors, which is high for a tight pixel-art sprite.`,
    });
  }

  if (antiAliasingScore > antiAliasThreshold) {
    warnings.push({
      code: 'looks-anti-aliased',
      severity: 'warning',
      message: `Detected a ${Math.round(antiAliasingScore * 100)}% soft-edge score, suggesting anti-aliasing or blur.`,
    });
  }

  if (nativeGrid.cellSize > maxNativeCellSize) {
    warnings.push({
      code: 'native-grid-too-large',
      severity: 'warning',
      message: `Estimated native grid cell size is ${nativeGrid.cellSize}px, which is unusually large and may indicate too much prompt detail.`,
    });
  }

  const valid = warnings.length === 0;

  return {
    valid,
    warnings,
    stats: {
      width: source.width,
      height: source.height,
      target: normalizeHex(target),
      chromaCoverage: chroma.coverage,
      chromaEdgeCoverage: chroma.edgeCoverage,
      semiTransparentPixels,
      semiTransparentRatio,
      transparencyRatio,
      uniqueColors,
      antiAliasingScore,
      nativeGrid,
      exactTransparentPixels,
    },
  };
}
