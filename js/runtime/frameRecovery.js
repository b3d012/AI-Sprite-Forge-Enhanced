import {
  colorDistance,
  createCanvas,
  getCanvasContext,
  imageSourceToCanvas,
  median,
  sampleCornerPixels,
  sortFramesByReadingOrder
} from './utils.js';

function buildBackgroundColor(imageData, sampleSize) {
  const samples = sampleCornerPixels(imageData, sampleSize);
  const rgbs = samples
    .filter((sample) => sample[3] > 0)
    .map((sample) => [sample[0], sample[1], sample[2]]);

  if (!rgbs.length) {
    return [0, 0, 0];
  }

  return [
    Math.round(median(rgbs.map((sample) => sample[0]))),
    Math.round(median(rgbs.map((sample) => sample[1]))),
    Math.round(median(rgbs.map((sample) => sample[2])))
  ];
}

function createForegroundMask(imageData, backgroundColor, tolerance) {
  const { data, width, height } = imageData;
  const mask = new Uint8Array(width * height);
  const keyThreshold = Number.isFinite(tolerance) ? tolerance : 36;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = (y * width + x) * 4;
      const alpha = data[index + 3];
      const pixel = [data[index], data[index + 1], data[index + 2]];
      const isForeground = alpha > 12 && colorDistance(pixel, backgroundColor) > keyThreshold;
      mask[y * width + x] = isForeground ? 1 : 0;
    }
  }

  return mask;
}

function floodFillComponents(mask, width, height, minComponentArea) {
  const visited = new Uint8Array(width * height);
  const components = [];
  const neighbors = [
    [-1, -1], [0, -1], [1, -1],
    [-1, 0], [1, 0],
    [-1, 1], [0, 1], [1, 1]
  ];

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const startIndex = y * width + x;
      if (!mask[startIndex] || visited[startIndex]) {
        continue;
      }

      const queue = [startIndex];
      visited[startIndex] = 1;
      const pixels = [];
      let minX = x;
      let maxX = x;
      let minY = y;
      let maxY = y;

      while (queue.length) {
        const current = queue.pop();
        const cx = current % width;
        const cy = Math.floor(current / width);
        pixels.push(current);
        minX = Math.min(minX, cx);
        minY = Math.min(minY, cy);
        maxX = Math.max(maxX, cx);
        maxY = Math.max(maxY, cy);

        for (const [dx, dy] of neighbors) {
          const nx = cx + dx;
          const ny = cy + dy;
          if (nx < 0 || ny < 0 || nx >= width || ny >= height) {
            continue;
          }

          const nextIndex = ny * width + nx;
          if (mask[nextIndex] && !visited[nextIndex]) {
            visited[nextIndex] = 1;
            queue.push(nextIndex);
          }
        }
      }

      if (pixels.length >= minComponentArea) {
        components.push({
          pixels,
          bbox: {
            x: minX,
            y: minY,
            w: maxX - minX + 1,
            h: maxY - minY + 1
          }
        });
      }
    }
  }

  return components;
}

function cropComponent(imageData, component, options = {}) {
  const { data, width } = imageData;
  const { x, y, w, h } = component.bbox;
  const padding = Number(options.padding) || 0;
  const cropX = Math.max(0, x - padding);
  const cropY = Math.max(0, y - padding);
  const cropW = Math.min(width - cropX, w + padding * 2);
  const cropH = Math.min(imageData.height - cropY, h + padding * 2);
  const canvas = createCanvas(cropW, cropH);
  const ctx = getCanvasContext(canvas);
  const output = ctx.createImageData(cropW, cropH);
  const maskSet = new Set(component.pixels);

  for (let cy = 0; cy < cropH; cy += 1) {
    for (let cx = 0; cx < cropW; cx += 1) {
      const sourceX = cropX + cx;
      const sourceY = cropY + cy;
      const sourceIndex = sourceY * width + sourceX;
      const outputIndex = (cy * cropW + cx) * 4;
      if (maskSet.has(sourceIndex)) {
        const inputIndex = sourceIndex * 4;
        output.data[outputIndex] = data[inputIndex];
        output.data[outputIndex + 1] = data[inputIndex + 1];
        output.data[outputIndex + 2] = data[inputIndex + 2];
        output.data[outputIndex + 3] = data[inputIndex + 3];
      } else {
        output.data[outputIndex + 3] = 0;
      }
    }
  }

  ctx.putImageData(output, 0, 0);
  return canvas;
}

export async function recoverFramesFromPoseBoard(image, options = {}) {
  const sourceCanvas = imageSourceToCanvas(image);
  const width = sourceCanvas.width;
  const height = sourceCanvas.height;
  const ctx = getCanvasContext(sourceCanvas, { willReadFrequently: true });
  const imageData = ctx.getImageData(0, 0, width, height);
  const backgroundColor = buildBackgroundColor(imageData, options.sampleSize || 12);
  const mask = createForegroundMask(imageData, backgroundColor, options.chromaTolerance ?? 36);
  const components = floodFillComponents(
    mask,
    width,
    height,
    options.minComponentArea ?? 80
  );

  const sorted = sortFramesByReadingOrder(components);
  const frames = sorted.map((component, index) => {
    const cropCanvas = cropComponent(imageData, component, options);
    return {
      id: options.frameIds?.[index] || `frame-${String(index + 1).padStart(2, '0')}`,
      index,
      name: options.frameNames?.[index] || `Frame ${index + 1}`,
      canvas: cropCanvas,
      width: cropCanvas.width,
      height: cropCanvas.height,
      bbox: { ...component.bbox },
      footPoint: {
        x: cropCanvas.width / 2,
        y: cropCanvas.height - 1
      },
      pixelCount: component.pixels.length,
      editable: true,
      nudge: { x: 0, y: 0 },
      scale: 1,
      sourceStage: 'pose-board',
      source: {
        imageWidth: width,
        imageHeight: height,
        componentIndex: index
      }
    };
  });

  return {
    source: {
      width,
      height,
      backgroundColor,
      chromaTolerance: options.chromaTolerance ?? 36
    },
    components: sorted.map((component) => ({
      bbox: component.bbox,
      pixelCount: component.pixels.length
    })),
    frames,
    warnings: frames.length ? [] : ['No foreground components were detected.']
  };
}

export function createMockPoseBoard(options = {}) {
  const width = options.width || 1500;
  const height = options.height || 640;
  const canvas = createCanvas(width, height);
  const ctx = getCanvasContext(canvas);

  const bg = options.background || '#ff00ff';
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, width, height);

  const frames = [
    { x: 90, y: 80, w: 130, h: 200, accent: '#7dd3fc', stance: 0 },
    { x: 320, y: 100, w: 120, h: 180, accent: '#fda4af', stance: 1 },
    { x: 540, y: 70, w: 140, h: 220, accent: '#fde68a', stance: 2 },
    { x: 780, y: 110, w: 120, h: 175, accent: '#c4b5fd', stance: 3 },
    { x: 1010, y: 82, w: 130, h: 210, accent: '#86efac', stance: 4 },
    { x: 1260, y: 90, w: 120, h: 200, accent: '#f9a8d4', stance: 5 },
    { x: 120, y: 360, w: 120, h: 190, accent: '#fca5a5', stance: 6 },
    { x: 360, y: 340, w: 140, h: 220, accent: '#93c5fd', stance: 7 },
    { x: 610, y: 360, w: 125, h: 180, accent: '#fdba74', stance: 8 },
    { x: 890, y: 340, w: 135, h: 215, accent: '#a7f3d0', stance: 9 }
  ];

  for (const frame of frames) {
    drawMockCharacter(ctx, frame);
  }

  return {
    canvas,
    frames
  };
}

function drawMockCharacter(ctx, spec) {
  const { x, y, w, h, accent, stance } = spec;
  const centerX = x + (w / 2);
  const footY = y + h;

  ctx.fillStyle = '#111827';
  ctx.strokeStyle = '#111827';
  ctx.lineWidth = 12;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  // Head
  ctx.beginPath();
  ctx.arc(centerX, y + 30, 22, 0, Math.PI * 2);
  ctx.fill();

  // Body
  ctx.lineWidth = 16;
  ctx.beginPath();
  ctx.moveTo(centerX, y + 54);
  ctx.lineTo(centerX, y + 128);
  ctx.stroke();

  ctx.fillStyle = accent;
  ctx.fillRect(centerX - 30, y + 72, 60, 34);

  // Arms
  ctx.lineWidth = 12;
  ctx.beginPath();
  ctx.moveTo(centerX, y + 84);
  ctx.lineTo(centerX - 46 + (stance * 2), y + 108);
  ctx.moveTo(centerX, y + 86);
  ctx.lineTo(centerX + 44 - (stance * 2), y + 104);
  ctx.stroke();

  // Legs with slightly different stances to make the baseline visible
  ctx.beginPath();
  ctx.moveTo(centerX, y + 128);
  ctx.lineTo(centerX - 18 - (stance % 2 ? 6 : 0), footY - 20);
  ctx.moveTo(centerX, y + 128);
  ctx.lineTo(centerX + 18 + (stance % 2 ? 6 : 0), footY - 8);
  ctx.stroke();

  // Feet
  ctx.lineWidth = 10;
  ctx.beginPath();
  ctx.moveTo(centerX - 34, footY - 18);
  ctx.lineTo(centerX - 6, footY - 18);
  ctx.moveTo(centerX + 4, footY - 6);
  ctx.lineTo(centerX + 30, footY - 6);
  ctx.stroke();

  // Tiny shadow to make the component larger and more realistic
  ctx.fillStyle = 'rgba(17, 24, 39, 0.22)';
  ctx.beginPath();
  ctx.ellipse(centerX, footY + 3, w * 0.22, 12, 0, 0, Math.PI * 2);
  ctx.fill();
}
