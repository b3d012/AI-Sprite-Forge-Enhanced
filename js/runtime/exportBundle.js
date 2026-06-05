import { canvasToBlob, downloadBlob, downloadText } from './utils.js';

async function collectZipBundle(files) {
  const zipCtor = globalThis.JSZip;
  if (!zipCtor) {
    return null;
  }

  const zip = new zipCtor();
  for (const file of files) {
    if (file.type === 'text') {
      zip.file(file.name, file.content);
    } else if (file.type === 'blob') {
      zip.file(file.name, file.content);
    }
  }

  return zip.generateAsync({ type: 'blob' });
}

export async function generatePreviewGif(options = {}) {
  const maybeGifshot = globalThis.gifshot || globalThis.GIFShot || globalThis.GIF;
  if (!maybeGifshot) {
    return null;
  }

  return null;
}

export function createAnimatedPreview(canvas, frames, fps = 12) {
  if (!canvas || !frames.length) return { stop() {} };

  const ctx = canvas.getContext('2d');
  const frameCount = frames.length;
  const interval = 1000 / Math.max(1, fps);
  let index = 0;
  let lastTime = performance.now();
  let rafId = 0;

  function drawFrame() {
    const frame = frames[index];
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(frame.canvas, 0, 0, canvas.width, canvas.height);
    index = (index + 1) % frameCount;
  }

  function tick(now) {
    if (now - lastTime >= interval) {
      drawFrame();
      lastTime = now;
    }
    rafId = requestAnimationFrame(tick);
  }

  drawFrame();
  rafId = requestAnimationFrame(tick);

  return {
    stop() {
      cancelAnimationFrame(rafId);
    }
  };
}

export async function exportRuntimeBundle({
  sheetCanvas,
  manifest,
  validationReport,
  sourceFrames = [],
  normalizedFrames = [],
  previewCanvas = null,
  includeZip = true
}) {
  const files = [];

  const sheetBlob = await canvasToBlob(sheetCanvas, 'image/png');
  files.push({ name: 'spritesheet.png', type: 'blob', content: sheetBlob });

  files.push({
    name: 'manifest.json',
    type: 'text',
    content: JSON.stringify(manifest, null, 2)
  });

  files.push({
    name: 'validation-report.json',
    type: 'text',
    content: JSON.stringify(validationReport, null, 2)
  });

  for (let index = 0; index < sourceFrames.length; index += 1) {
    const frame = sourceFrames[index];
    if (!frame?.canvas) continue;
    files.push({
      name: `source-frames/frame-${String(index + 1).padStart(2, '0')}.png`,
      type: 'blob',
      content: await canvasToBlob(frame.canvas, 'image/png')
    });
  }

  for (let index = 0; index < normalizedFrames.length; index += 1) {
    const frame = normalizedFrames[index];
    if (!frame?.canvas) continue;
    files.push({
      name: `normalized-frames/frame-${String(index + 1).padStart(2, '0')}.png`,
      type: 'blob',
      content: await canvasToBlob(frame.canvas, 'image/png')
    });
  }

  if (previewCanvas) {
    files.push({
      name: 'preview-frame.png',
      type: 'blob',
      content: await canvasToBlob(previewCanvas, 'image/png')
    });
  }

  const zipBlob = includeZip ? await collectZipBundle(files) : null;
  return {
    files,
    zipBlob
  };
}

export function downloadRuntimeFiles(files) {
  for (const file of files) {
    if (file.type === 'text') {
      downloadText(file.content, file.name, 'application/json');
    } else if (file.type === 'blob') {
      downloadBlob(file.content, file.name);
    }
  }
}

