export function generateManifest(options = {}) {
  const anchor = options.anchor || { x: 128, y: 255, type: 'foot' };
  const frames = options.frames || [];
  return {
    schemaVersion: 1,
    animationName: options.animationName || 'runtime-animation',
    frameCount: options.frameCount ?? frames.length,
    columns: options.columns ?? 5,
    rows: options.rows ?? 2,
    cellWidth: options.cellWidth ?? 256,
    cellHeight: options.cellHeight ?? 256,
    fps: options.fps ?? 12,
    anchor: {
      x: anchor.x ?? 128,
      y: anchor.y ?? 255,
      type: anchor.type || 'foot'
    },
    sourceStage: options.sourceStage || {
      name: 'pose-board-recovery',
      input: 'pose-board',
      method: 'connected-components',
      chromaKey: options.chromaKey || '#ff00ff'
    },
    frames: frames.map((frame, index) => ({
      id: frame.id || `frame-${index + 1}`,
      index,
      name: frame.name || `Frame ${index + 1}`,
      sourceBox: frame.bbox ? { ...frame.bbox } : null,
      footPoint: frame.footPoint ? { ...frame.footPoint } : null,
      scale: frame.scale ?? 1,
      nudge: frame.nudge ? { x: frame.nudge.x || 0, y: frame.nudge.y || 0 } : { x: 0, y: 0 },
      cellIndex: index,
      alignedAnchor: { x: anchor.x ?? 128, y: anchor.y ?? 255, type: anchor.type || 'foot' },
      editable: frame.editable !== false
    })),
    generatedAt: new Date().toISOString()
  };
}

export function generateValidationReport(options = {}) {
  const frames = options.frames || [];
  const anchor = options.anchor || { x: 128, y: 255, type: 'foot' };
  const frameAnchors = frames.map((frame) => ({
    id: frame.id,
    nudge: { x: frame.nudge?.x || 0, y: frame.nudge?.y || 0 },
    footPoint: frame.footPoint ? { ...frame.footPoint } : null
  }));

  return {
    generatedAt: new Date().toISOString(),
    animationName: options.animationName || 'runtime-animation',
    frameCount: frames.length,
    cellSize: {
      width: options.cellWidth ?? 256,
      height: options.cellHeight ?? 256
    },
    anchor: {
      x: anchor.x ?? 128,
      y: anchor.y ?? 255,
      type: anchor.type || 'foot'
    },
    columns: options.columns ?? 5,
    rows: options.rows ?? 2,
    recoveredComponents: options.recoveredComponents ?? frames.length,
    warnings: options.warnings || [],
    frameAnchors,
    hasAlignmentOffsets: frameAnchors.some((frame) => frame.nudge.x !== 0 || frame.nudge.y !== 0)
  };
}
