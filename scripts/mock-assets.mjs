import { PNG } from 'pngjs';
import fs from 'fs/promises';
import path from 'path';

export function createPng(width, height, drawPixel) {
  const png = new PNG({ width, height });

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = (width * y + x) << 2;
      const [r, g, b, a] = drawPixel(x, y, width, height);
      png.data[index] = r;
      png.data[index + 1] = g;
      png.data[index + 2] = b;
      png.data[index + 3] = a;
    }
  }

  return PNG.sync.write(png);
}

export function createMockReferencePng() {
  return createPng(1024, 1024, (x, y) => {
    const green = [0, 255, 0, 255];
    const inBody = x >= 380 && x <= 644 && y >= 240 && y <= 820;
    const inHead = Math.hypot(x - 512, y - 180) <= 76;
    const inAnchor = Math.abs(x - 128) <= 3 && Math.abs(y - 255) <= 3;

    if (inAnchor) {
      return [17, 24, 39, 255];
    }

    if (inHead || inBody) {
      return [31, 41, 55, 255];
    }

    return green;
  });
}

export function createMockAnchorPng() {
  return createPng(1024, 1024, (x, y) => {
    const green = [0, 255, 0, 255];
    const cross = (Math.abs(x - 128) <= 2 && Math.abs(y - 255) <= 32)
      || (Math.abs(y - 255) <= 2 && Math.abs(x - 128) <= 32);

    if (cross) {
      return [17, 24, 39, 255];
    }

    return green;
  });
}

export function createMockFramePng(frameIndex) {
  const offset = frameIndex % 2 === 0 ? 0 : 4;

  return createPng(256, 256, (x, y) => {
    const inSprite = Math.hypot(x - (128 + offset), y - 126) <= 44;
    const inShadow = x >= 96 + offset && x <= 160 + offset && y >= 170 && y <= 188;

    if (inSprite) {
      return [59, 130, 246, 255];
    }

    if (inShadow) {
      return [15, 23, 42, 255];
    }

    return [0, 0, 0, 0];
  });
}

export function createTransparentExportPng() {
  return createPng(256, 256, (x, y) => {
    const body = Math.hypot(x - 128, y - 126) <= 44;
    if (body) {
      return [59, 130, 246, 220];
    }
    return [0, 0, 0, 0];
  });
}

export async function writePngFile(filePath, buffer) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, buffer);
}

export function analyzePngBuffer(buffer) {
  const png = PNG.sync.read(buffer);
  const { width, height, data } = png;

  let greenPixels = 0;
  let semiTransparentPixels = 0;
  let transparentPixels = 0;
  let opaquePixels = 0;

  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const a = data[i + 3];

    if (a === 0) {
      transparentPixels += 1;
    } else {
      opaquePixels += 1;
    }

    if (a > 0 && a < 255) {
      semiTransparentPixels += 1;
    }

    if (r === 0 && g === 255 && b === 0) {
      greenPixels += 1;
    }
  }

  return {
    width,
    height,
    totalPixels: width * height,
    greenPixels,
    greenCoverage: greenPixels / (width * height),
    semiTransparentPixels,
    transparentPixels,
    opaquePixels
  };
}

export function packSpritesheetPng(frames, columns = 4, cellSize = 256) {
  const rows = Math.max(1, Math.ceil(frames.length / columns));
  const sheet = new PNG({ width: columns * cellSize, height: rows * cellSize, fill: true });

  for (const frame of frames) {
    const png = PNG.sync.read(frame.buffer);
    const col = frame.frameIndex % columns;
    const row = Math.floor(frame.frameIndex / columns);
    const offsetX = col * cellSize;
    const offsetY = row * cellSize;

    for (let y = 0; y < cellSize; y += 1) {
      for (let x = 0; x < cellSize; x += 1) {
        const srcIndex = (png.width * y + x) << 2;
        const dstIndex = ((sheet.width * (offsetY + y)) + (offsetX + x)) << 2;
        sheet.data[dstIndex] = png.data[srcIndex];
        sheet.data[dstIndex + 1] = png.data[srcIndex + 1];
        sheet.data[dstIndex + 2] = png.data[srcIndex + 2];
        sheet.data[dstIndex + 3] = png.data[srcIndex + 3];
      }
    }
  }

  return PNG.sync.write(sheet);
}
