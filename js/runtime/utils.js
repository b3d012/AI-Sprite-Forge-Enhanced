export function createCanvas(width, height) {
  if (typeof document !== 'undefined' && document.createElement) {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    return canvas;
  }

  if (typeof OffscreenCanvas !== 'undefined') {
    return new OffscreenCanvas(width, height);
  }

  throw new Error('Canvas is not available in this environment');
}

export function getCanvasContext(canvas, options = {}) {
  const ctx = canvas.getContext('2d', options);
  if (!ctx) {
    throw new Error('2D canvas context is not available');
  }
  return ctx;
}

export function clonePoint(point = { x: 0, y: 0 }) {
  return { x: Number(point.x) || 0, y: Number(point.y) || 0 };
}

export function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

export function median(values) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

export function colorDistance(a, b) {
  const dr = a[0] - b[0];
  const dg = a[1] - b[1];
  const db = a[2] - b[2];
  return Math.sqrt((dr * dr) + (dg * dg) + (db * db));
}

export function sampleCornerPixels(imageData, sampleSize = 12) {
  const { data, width, height } = imageData;
  const samples = [];
  const maxX = Math.max(0, width - 1);
  const maxY = Math.max(0, height - 1);
  const size = clamp(sampleSize, 1, Math.min(width, height));
  const positions = [
    [0, 0],
    [maxX - size + 1, 0],
    [0, maxY - size + 1],
    [maxX - size + 1, maxY - size + 1]
  ];

  for (const [startX, startY] of positions) {
    for (let y = 0; y < size; y += 1) {
      for (let x = 0; x < size; x += 1) {
        const px = clamp(startX + x, 0, maxX);
        const py = clamp(startY + y, 0, maxY);
        const index = (py * width + px) * 4;
        samples.push([data[index], data[index + 1], data[index + 2], data[index + 3]]);
      }
    }
  }

  return samples;
}

export function imageSourceToCanvas(source) {
  if (!source) {
    throw new Error('No image source provided');
  }

  if (source.canvas && source.canvas.width) {
    return source.canvas;
  }

  if (typeof HTMLCanvasElement !== 'undefined' && source instanceof HTMLCanvasElement) {
    return source;
  }

  if (typeof OffscreenCanvas !== 'undefined' && source instanceof OffscreenCanvas) {
    return source;
  }

  if (typeof ImageData !== 'undefined' && source instanceof ImageData) {
    const canvas = createCanvas(source.width, source.height);
    const ctx = getCanvasContext(canvas);
    ctx.putImageData(source, 0, 0);
    return canvas;
  }

  const width = source.naturalWidth || source.videoWidth || source.width;
  const height = source.naturalHeight || source.videoHeight || source.height;

  if (!width || !height) {
    throw new Error('Unsupported image source');
  }

  const canvas = createCanvas(width, height);
  const ctx = getCanvasContext(canvas);
  ctx.drawImage(source, 0, 0, width, height);
  return canvas;
}

export function canvasToDataUrl(canvas, mimeType = 'image/png', quality) {
  if (typeof canvas.toDataURL === 'function') {
    return quality == null ? canvas.toDataURL(mimeType) : canvas.toDataURL(mimeType, quality);
  }

  throw new Error('Canvas serialization is not supported in this environment');
}

export async function canvasToBlob(canvas, mimeType = 'image/png', quality) {
  if (typeof canvas.convertToBlob === 'function') {
    return canvas.convertToBlob({ type: mimeType, quality });
  }

  if (typeof canvas.toBlob === 'function') {
    return await new Promise((resolve, reject) => {
      canvas.toBlob((blob) => {
        if (blob) {
          resolve(blob);
        } else {
          reject(new Error('Failed to export canvas blob'));
        }
      }, mimeType, quality);
    });
  }

  const dataUrl = canvasToDataUrl(canvas, mimeType, quality);
  const response = await fetch(dataUrl);
  return response.blob();
}

export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.rel = 'noopener';
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function downloadText(text, filename, mimeType = 'application/json') {
  const blob = new Blob([text], { type: mimeType });
  downloadBlob(blob, filename);
}

export function loadImageFromFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('Failed to decode image'));
      img.src = reader.result;
    };
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsDataURL(file);
  });
}

export function sortFramesByReadingOrder(frames) {
  return [...frames].sort((a, b) => {
    const ay = a.bbox?.y ?? 0;
    const by = b.bbox?.y ?? 0;
    if (Math.abs(ay - by) > 8) {
      return ay - by;
    }
    const ax = a.bbox?.x ?? 0;
    const bx = b.bbox?.x ?? 0;
    return ax - bx;
  });
}

