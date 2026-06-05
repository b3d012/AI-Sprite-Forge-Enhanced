const DEFAULT_STAGE_ORDER = [
  'idle',
  'reference-uploaded',
  'south-anchor-generated',
  'pixel-snapped',
  'directions-generated',
  'pose-board-generated',
  'frames-recovered',
  'frames-normalized',
  'spritesheet-packed',
  'manifest-generated',
  'validation-generated',
  'exported'
];

const STAGE_INDEX = new Map(DEFAULT_STAGE_ORDER.map((stage, index) => [stage, index]));

export const PIPELINE_STAGES = DEFAULT_STAGE_ORDER.slice();

export function createPipelineState(overrides = {}) {
  return {
    stage: 'idle',
    history: ['idle'],
    outputs: {},
    warnings: [],
    errors: [],
    ...overrides
  };
}

export function transitionPipelineState(state, nextStage, details = {}) {
  if (!STAGE_INDEX.has(nextStage)) {
    throw new Error(`Unknown pipeline stage: ${nextStage}`);
  }

  const currentStage = state?.stage || 'idle';
  const currentIndex = STAGE_INDEX.get(currentStage);
  const nextIndex = STAGE_INDEX.get(nextStage);

  if (nextIndex < currentIndex) {
    throw new Error(`Invalid pipeline transition from ${currentStage} to ${nextStage}`);
  }

  if (nextIndex === currentIndex) {
    return {
      ...state,
      ...details,
      history: [...(state.history || [])]
    };
  }

  return {
    ...state,
    ...details,
    stage: nextStage,
    history: [...(state.history || []), nextStage]
  };
}

export function snapToPixelGrid(value, gridSize = 1) {
  if (!Number.isFinite(value) || !Number.isFinite(gridSize) || gridSize <= 0) {
    throw new Error('snapToPixelGrid requires finite positive values');
  }

  return Math.round(value / gridSize) * gridSize;
}

export function snapPoint(point, gridSize = 1) {
  return {
    x: snapToPixelGrid(point.x, gridSize),
    y: snapToPixelGrid(point.y, gridSize)
  };
}

export function snapRect(rect, gridSize = 1) {
  return {
    x: snapToPixelGrid(rect.x, gridSize),
    y: snapToPixelGrid(rect.y, gridSize),
    width: snapToPixelGrid(rect.width, gridSize),
    height: snapToPixelGrid(rect.height, gridSize)
  };
}

export function isChromaGreenPixel(r, g, b, tolerance = 18) {
  return g >= 255 - tolerance && r <= tolerance && b <= tolerance;
}

export function analyzeChromaKeyPixels({ width, height, data, tolerance = 18 }) {
  if (!width || !height || !data) {
    throw new Error('analyzeChromaKeyPixels requires width, height, and data');
  }

  let chromaCount = 0;
  let opaqueCount = 0;
  let transparentCount = 0;
  let semiTransparentCount = 0;

  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const a = data[i + 3];

    if (a === 0) {
      transparentCount += 1;
    } else {
      opaqueCount += 1;
    }

    if (a > 0 && a < 255) {
      semiTransparentCount += 1;
    }

    if (isChromaGreenPixel(r, g, b, tolerance)) {
      chromaCount += 1;
    }
  }

  return {
    width,
    height,
    totalPixels: width * height,
    chromaCount,
    opaqueCount,
    transparentCount,
    semiTransparentCount,
    chromaCoverage: chromaCount / (width * height)
  };
}

export function hasMajorDrift(frames, threshold = 16) {
  const maxDrift = calculateFrameDrift(frames);
  return maxDrift > threshold;
}

export function calculateFrameDrift(frames) {
  if (!Array.isArray(frames) || frames.length < 2) {
    return 0;
  }

  let maxDrift = 0;

  for (let i = 1; i < frames.length; i += 1) {
    const prev = frames[i - 1];
    const current = frames[i];
    const prevCenter = prev?.center || prev?.anchor || prev?.position;
    const currentCenter = current?.center || current?.anchor || current?.position;

    if (!prevCenter || !currentCenter) {
      continue;
    }

    const dx = Math.abs((currentCenter.x || 0) - (prevCenter.x || 0));
    const dy = Math.abs((currentCenter.y || 0) - (prevCenter.y || 0));
    maxDrift = Math.max(maxDrift, dx, dy);
  }

  return maxDrift;
}

export function createMockPoseBoard(frames, options = {}) {
  const columns = options.columns || 4;
  const cellSize = options.cellSize || 256;
  const anchor = options.anchor || { x: 128, y: 255 };

  const cells = frames.map((frame, index) => {
    const frameIndex = frame.frameIndex ?? index;
    const row = Math.floor(index / columns);
    const column = index % columns;

    return {
      frameIndex,
      row,
      column,
      x: column * cellSize,
      y: row * cellSize,
      width: cellSize,
      height: cellSize,
      center: frame.center || { x: anchor.x, y: anchor.y },
      pose: frame.pose || `pose-${frameIndex}`,
      imageUrl: frame.imageUrl,
      drift: frame.drift || 0,
      alphaMode: frame.alphaMode || 'opaque'
    };
  });

  return {
    columns,
    cellSize,
    anchor,
    rows: Math.max(1, Math.ceil(frames.length / columns)),
    width: columns * cellSize,
    height: Math.max(1, Math.ceil(frames.length / columns)) * cellSize,
    cells
  };
}

export function recoverFramesFromMockPoseBoard(board) {
  if (!board?.cells) {
    return [];
  }

  return [...board.cells]
    .sort((a, b) => a.frameIndex - b.frameIndex)
    .map((cell) => ({
      frameIndex: cell.frameIndex,
      imageUrl: cell.imageUrl,
      center: cell.center,
      pose: cell.pose,
      x: cell.x,
      y: cell.y,
      width: cell.width,
      height: cell.height,
      alphaMode: cell.alphaMode,
      drift: cell.drift
    }));
}

export function normalizeFrames(frames, options = {}) {
  const cellSize = options.cellSize || 256;
  const anchor = options.anchor || { x: 128, y: 255 };

  return frames.map((frame, index) => ({
    ...frame,
    frameIndex: frame.frameIndex ?? index,
    width: cellSize,
    height: cellSize,
    center: frame.center || { x: anchor.x, y: anchor.y },
    normalized: true,
    drift: frame.drift || 0
  }));
}

export function packRuntimeSheet(frames, options = {}) {
  const columns = options.columns || 4;
  const cellSize = options.cellSize || 256;
  const rows = Math.max(1, Math.ceil(frames.length / columns));
  const placements = frames.map((frame, index) => {
    const column = index % columns;
    const row = Math.floor(index / columns);
    return {
      frameIndex: frame.frameIndex ?? index,
      column,
      row,
      x: column * cellSize,
      y: row * cellSize,
      width: cellSize,
      height: cellSize
    };
  });

  return {
    columns,
    rows,
    cellSize,
    width: columns * cellSize,
    height: rows * cellSize,
    placements
  };
}

export function generateManifest({
  styleId = 'mock',
  actionId = 'mock-action',
  frames = [],
  anchor = { x: 128, y: 255 },
  sheet = null,
  cellSize = 256
} = {}) {
  const packedSheet = sheet || packRuntimeSheet(frames, { cellSize });

  return {
    version: '1.0.0',
    styleId,
    actionId,
    anchor,
    cellSize: packedSheet.cellSize,
    columns: packedSheet.columns,
    rows: packedSheet.rows,
    sheetWidth: packedSheet.width,
    sheetHeight: packedSheet.height,
    frameCount: frames.length,
    frames: frames.map((frame, index) => ({
      frameIndex: frame.frameIndex ?? index,
      ...packedSheet.placements[index]
    }))
  };
}

export function createValidationChecks({
  anchorImage,
  runtimeCells = [],
  sheet,
  manifest,
  finalFrames = [],
  chromaStages = []
} = {}) {
  const checks = [];

  if (anchorImage) {
    checks.push({
      name: 'anchor-size',
      pass: anchorImage.width === 1024 && anchorImage.height === 1024,
      details: `${anchorImage.width}x${anchorImage.height}`
    });

    checks.push({
      name: 'anchor-green-background',
      pass: anchorImage.greenCoverage >= 0.6,
      details: `${Math.round((anchorImage.greenCoverage || 0) * 100)}% green`
    });
  }

  if (runtimeCells.length) {
    checks.push({
      name: 'runtime-cells',
      pass: runtimeCells.every((cell) => cell.width === 256 && cell.height === 256),
      details: `${runtimeCells.length} cells`
    });
  }

  if (sheet && manifest) {
    checks.push({
      name: 'sheet-dimensions',
      pass: sheet.width === manifest.columns * manifest.cellSize && sheet.height === manifest.rows * manifest.cellSize,
      details: `${sheet.width}x${sheet.height}`
    });
  }

  if (manifest) {
    checks.push({
      name: 'manifest-anchor',
      pass: manifest.anchor?.x === 128 && manifest.anchor?.y === 255,
      details: `(${manifest.anchor?.x}, ${manifest.anchor?.y})`
    });

    checks.push({
      name: 'frame-count',
      pass: manifest.frameCount === finalFrames.length,
      details: `${manifest.frameCount} vs ${finalFrames.length}`
    });
  }

  if (finalFrames.length) {
    checks.push({
      name: 'drift',
      pass: !hasMajorDrift(finalFrames),
      details: `max drift ${calculateFrameDrift(finalFrames)}`
    });
  }

  if (chromaStages.length) {
    const chromaOk = chromaStages.every((stage) => stage.semiTransparentCount === 0);
    checks.push({
      name: 'chroma-alpha',
      pass: chromaOk,
      details: chromaStages.map((stage) => `${stage.name}:${stage.semiTransparentCount}`).join(', ')
    });
  }

  return checks;
}

