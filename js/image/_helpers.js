const DEFAULT_TARGET = '#00FF00';

export function clampByte(value) {
  return Math.max(0, Math.min(255, Math.round(value)));
}

export function normalizeHex(hex = DEFAULT_TARGET) {
  if (typeof hex !== 'string') return DEFAULT_TARGET;
  const value = hex.trim().replace(/^#/, '').toUpperCase();
  if (value.length === 3) {
    return `#${value
      .split('')
      .map((ch) => ch + ch)
      .join('')}`;
  }
  if (value.length !== 6) return DEFAULT_TARGET;
  return `#${value}`;
}

export function hexToRgba(hex = DEFAULT_TARGET) {
  const value = normalizeHex(hex).slice(1);
  return {
    r: parseInt(value.slice(0, 2), 16),
    g: parseInt(value.slice(2, 4), 16),
    b: parseInt(value.slice(4, 6), 16),
    a: 255,
  };
}

export function rgbaToHex(r, g, b) {
  return `#${[r, g, b]
    .map((channel) => clampByte(channel).toString(16).padStart(2, '0'))
    .join('')
    .toUpperCase()}`;
}

export function createImageLike(width, height, data, meta = {}) {
  const pixels = data instanceof Uint8ClampedArray ? data : new Uint8ClampedArray(data);
  return {
    width,
    height,
    data: pixels,
    meta,
  };
}

export function cloneImageLike(image) {
  return createImageLike(image.width, image.height, new Uint8ClampedArray(image.data), image.meta ? { ...image.meta } : {});
}

export function isImageLike(value) {
  return Boolean(
    value &&
      typeof value.width === 'number' &&
      typeof value.height === 'number' &&
      value.data &&
      typeof value.data.length === 'number'
  );
}

export function getPixelIndex(x, y, width) {
  return (y * width + x) * 4;
}

export function getPixel(image, x, y) {
  const idx = getPixelIndex(x, y, image.width);
  const { data } = image;
  return {
    r: data[idx],
    g: data[idx + 1],
    b: data[idx + 2],
    a: data[idx + 3],
  };
}

export function setPixel(data, idx, pixel) {
  data[idx] = clampByte(pixel.r);
  data[idx + 1] = clampByte(pixel.g);
  data[idx + 2] = clampByte(pixel.b);
  data[idx + 3] = clampByte(pixel.a);
}

export function sameColor(a, b, tolerance = 0) {
  return colorDistanceSq(a, b) <= tolerance * tolerance;
}

export function colorDistanceSq(a, b) {
  const dr = a.r - b.r;
  const dg = a.g - b.g;
  const db = a.b - b.b;
  const da = (a.a ?? 255) - (b.a ?? 255);
  return dr * dr + dg * dg + db * db + da * da;
}

export function quantizeChannel(value, step = 16) {
  const safeStep = Math.max(1, step);
  return Math.round(value / safeStep) * safeStep;
}

export function quantizePixel(pixel, step = 16) {
  return {
    r: quantizeChannel(pixel.r, step),
    g: quantizeChannel(pixel.g, step),
    b: quantizeChannel(pixel.b, step),
    a: clampByte(pixel.a),
  };
}

export function luminance(pixel) {
  return 0.2126 * pixel.r + 0.7152 * pixel.g + 0.0722 * pixel.b;
}

export function channelDominance(pixel, target) {
  return {
    r: pixel.r - target.r,
    g: pixel.g - target.g,
    b: pixel.b - target.b,
  };
}

export function gcd(a, b) {
  let x = Math.abs(Math.round(a || 0));
  let y = Math.abs(Math.round(b || 0));
  while (y !== 0) {
    const next = x % y;
    x = y;
    y = next;
  }
  return x || 1;
}

export function gcdList(values) {
  return values.reduce((acc, value) => gcd(acc, value), 0) || 1;
}

export function mean(values) {
  if (!values.length) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

export function median(values) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[mid];
  return (sorted[mid - 1] + sorted[mid]) / 2;
}

export function mode(values) {
  if (!values.length) return 0;
  const counts = new Map();
  let bestValue = values[0];
  let bestCount = 0;
  for (const value of values) {
    const nextCount = (counts.get(value) || 0) + 1;
    counts.set(value, nextCount);
    if (nextCount > bestCount) {
      bestCount = nextCount;
      bestValue = value;
    }
  }
  return bestValue;
}

export function collectNeighborPixels(image, x, y, radius = 1) {
  const pixels = [];
  for (let dy = -radius; dy <= radius; dy += 1) {
    for (let dx = -radius; dx <= radius; dx += 1) {
      if (dx === 0 && dy === 0) continue;
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= image.width || ny >= image.height) continue;
      pixels.push(getPixel(image, nx, ny));
    }
  }
  return pixels;
}

export function countColors(image, quantizeStep = 16) {
  const counts = new Map();
  for (let i = 0; i < image.data.length; i += 4) {
    const key = [
      quantizeChannel(image.data[i], quantizeStep),
      quantizeChannel(image.data[i + 1], quantizeStep),
      quantizeChannel(image.data[i + 2], quantizeStep),
      image.data[i + 3],
    ].join(',');
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  return counts;
}

export function toColorObject(hexOrObject) {
  if (typeof hexOrObject === 'string') return hexToRgba(hexOrObject);
  if (hexOrObject && typeof hexOrObject === 'object') {
    return {
      r: clampByte(hexOrObject.r ?? 0),
      g: clampByte(hexOrObject.g ?? 0),
      b: clampByte(hexOrObject.b ?? 0),
      a: clampByte(hexOrObject.a ?? 255),
    };
  }
  return hexToRgba(DEFAULT_TARGET);
}

export function computeUniqueColorCount(image, quantizeStep = 16) {
  return countColors(image, quantizeStep).size;
}

