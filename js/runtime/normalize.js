import { createCanvas, getCanvasContext, imageSourceToCanvas } from './utils.js';

export function normalizeFrameToCell(frame, options = {}) {
  const cellWidth = options.cellWidth ?? 256;
  const cellHeight = options.cellHeight ?? 256;
  const anchor = options.anchor || { x: 128, y: 255, type: 'foot' };
  const scale = options.scale ?? frame.scale ?? 1;
  const nudge = frame.nudge || options.nudge || { x: 0, y: 0 };
  const sourceCanvas = frame.canvas || frame.sourceCanvas || imageSourceToCanvas(frame.image || frame.source || frame);
  const sourceWidth = sourceCanvas.width;
  const sourceHeight = sourceCanvas.height;
  const footPoint = frame.footPoint || {
    x: frame.bbox ? frame.bbox.x + (frame.bbox.w / 2) : sourceWidth / 2,
    y: frame.bbox ? frame.bbox.y + frame.bbox.h - 1 : sourceHeight - 1
  };

  const canvas = createCanvas(cellWidth, cellHeight);
  const ctx = getCanvasContext(canvas);
  ctx.clearRect(0, 0, cellWidth, cellHeight);

  const drawWidth = Math.max(1, Math.round(sourceWidth * scale));
  const drawHeight = Math.max(1, Math.round(sourceHeight * scale));
  const dx = Math.round(anchor.x - (footPoint.x * scale) + (nudge.x || 0));
  const dy = Math.round(anchor.y - (footPoint.y * scale) + (nudge.y || 0));

  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(sourceCanvas, dx, dy, drawWidth, drawHeight);

  return {
    id: frame.id,
    index: frame.index ?? 0,
    name: frame.name,
    canvas,
    width: cellWidth,
    height: cellHeight,
    anchor: { ...anchor },
    footPoint: { x: footPoint.x, y: footPoint.y },
    nudge: { x: nudge.x || 0, y: nudge.y || 0 },
    scale,
    sourceSize: { width: sourceWidth, height: sourceHeight },
    sourceFrame: frame,
    drawOffset: { x: dx, y: dy },
    cellSize: { width: cellWidth, height: cellHeight }
  };
}

export function normalizeFramesToCells(frames, options = {}) {
  return frames.map((frame) => normalizeFrameToCell(frame, options));
}

