import { createCanvas, getCanvasContext } from './utils.js';

export function packRuntimeSpritesheet(frames, options = {}) {
  const columns = options.columns ?? 5;
  const rows = options.rows ?? Math.max(options.rows ?? 2, Math.ceil(frames.length / columns));
  const cellWidth = options.cellWidth ?? 256;
  const cellHeight = options.cellHeight ?? 256;
  const width = columns * cellWidth;
  const height = rows * cellHeight;
  const canvas = createCanvas(width, height);
  const ctx = getCanvasContext(canvas);

  ctx.clearRect(0, 0, width, height);

  const cells = [];
  for (let index = 0; index < columns * rows; index += 1) {
    const frame = frames[index];
    const x = (index % columns) * cellWidth;
    const y = Math.floor(index / columns) * cellHeight;
    if (frame?.canvas) {
      ctx.drawImage(frame.canvas, x, y, cellWidth, cellHeight);
    }
    cells.push({
      index,
      frameId: frame?.id || null,
      empty: !frame,
      x,
      y,
      width: cellWidth,
      height: cellHeight
    });
  }

  return {
    canvas,
    width,
    height,
    columns,
    rows,
    cellWidth,
    cellHeight,
    cells
  };
}

