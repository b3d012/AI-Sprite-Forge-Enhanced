import { cloneImageLike, createImageLike, isImageLike } from './_helpers.js';

export function isBrowserCanvasAvailable() {
  return typeof document !== 'undefined' && typeof document.createElement === 'function';
}

export function createCanvas(width, height) {
  if (!isBrowserCanvasAvailable()) {
    throw new Error('Canvas APIs are not available in this environment');
  }
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

export function imageLikeToImageData(imageLike) {
  if (isImageLike(imageLike)) {
    return cloneImageLike(imageLike);
  }

  if (!isBrowserCanvasAvailable()) {
    throw new Error('Cannot convert non-ImageData input without browser canvas APIs');
  }

  if (typeof ImageData !== 'undefined' && imageLike instanceof ImageData) {
    return createImageLike(imageLike.width, imageLike.height, new Uint8ClampedArray(imageLike.data));
  }

  const canvas = createCanvas(imageLike.width || imageLike.naturalWidth || imageLike.videoWidth, imageLike.height || imageLike.naturalHeight || imageLike.videoHeight);
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) {
    throw new Error('Unable to access 2D canvas context');
  }
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(imageLike, 0, 0, canvas.width, canvas.height);
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  return createImageLike(imageData.width, imageData.height, new Uint8ClampedArray(imageData.data));
}

export function imageLikeToCanvasImageData(imageLike, canvas) {
  if (!canvas) {
    if (!isBrowserCanvasAvailable()) {
      throw new Error('Canvas APIs are not available in this environment');
    }
    canvas = createCanvas(imageLike.width, imageLike.height);
  }
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Unable to access 2D canvas context');
  }
  const imageData = typeof ImageData !== 'undefined'
    ? new ImageData(imageLike.data, imageLike.width, imageLike.height)
    : { data: imageLike.data, width: imageLike.width, height: imageLike.height };
  ctx.putImageData(imageData, 0, 0);
  return canvas;
}

export async function imageLikeToDataURL(imageLike, mimeType = 'image/png') {
  const canvas = imageLikeToCanvasImageData(imageLike);
  return canvas.toDataURL(mimeType);
}

export function ensureImageLike(input) {
  if (isImageLike(input)) return input;
  if (input && typeof input.width === 'number' && typeof input.height === 'number' && input.data) {
    return createImageLike(input.width, input.height, input.data, input.meta || {});
  }
  throw new Error('Expected an ImageData-like object');
}

