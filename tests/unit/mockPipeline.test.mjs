import { describe, expect, it } from 'vitest';
import { generateSpritePrompt } from '../../js/prompts.js';
import {
  analyzeChromaKeyPixels,
  createMockPoseBoard,
  createPipelineState,
  generateManifest,
  normalizeFrames,
  packRuntimeSheet,
  recoverFramesFromMockPoseBoard,
  snapPoint,
  snapRect,
  transitionPipelineState,
  isChromaGreenPixel,
  calculateFrameDrift,
  hasMajorDrift
} from '../../js/lib/mockPipeline.js';

describe('prompt builder', () => {
  it('builds a sequential prompt with frame and transparency guidance', () => {
    const prompt = generateSpritePrompt('pixelart', 'idle', 'REF_123', 42, 1, true);

    expect(prompt).toContain('Character: REF_123');
    expect(prompt).toContain('Frame: 2/4');
    expect(prompt).toContain('transparent background');
    expect(prompt).toContain('Continuity: DIRECTLY CONTINUE');
  });

  it('rejects invalid style or action identifiers', () => {
    expect(() => generateSpritePrompt('missing', 'idle')).toThrow(/Invalid style/);
    expect(() => generateSpritePrompt('pixelart', 'missing')).toThrow(/Invalid style/);
  });
});

describe('pipeline state transitions', () => {
  it('advances through the expected order', () => {
    let state = createPipelineState();
    state = transitionPipelineState(state, 'reference-uploaded');
    state = transitionPipelineState(state, 'south-anchor-generated');
    state = transitionPipelineState(state, 'pixel-snapped');

    expect(state.stage).toBe('pixel-snapped');
    expect(state.history).toEqual(['idle', 'reference-uploaded', 'south-anchor-generated', 'pixel-snapped']);
  });

  it('rejects backwards transitions', () => {
    const state = createPipelineState({ stage: 'frames-normalized', history: ['idle', 'frames-normalized'] });
    expect(() => transitionPipelineState(state, 'reference-uploaded')).toThrow(/Invalid pipeline transition/);
  });
});

describe('chroma key detection', () => {
  it('recognizes pure chroma green pixels', () => {
    expect(isChromaGreenPixel(0, 255, 0)).toBe(true);
    expect(isChromaGreenPixel(18, 240, 18)).toBe(true);
    expect(isChromaGreenPixel(24, 240, 24)).toBe(false);
  });

  it('detects semi-transparent pixels and green coverage', () => {
    const data = new Uint8ClampedArray([
      0, 255, 0, 255,
      0, 255, 0, 128,
      40, 40, 40, 255,
      0, 255, 0, 255
    ]);

    const stats = analyzeChromaKeyPixels({ width: 2, height: 2, data });
    expect(stats.chromaCount).toBe(3);
    expect(stats.semiTransparentCount).toBe(1);
    expect(stats.chromaCoverage).toBeCloseTo(0.75);
  });
});

describe('pixel snapping', () => {
  it('snaps points and rectangles to the expected grid', () => {
    expect(snapPoint({ x: 12.4, y: 19.6 }, 1)).toEqual({ x: 12, y: 20 });
    expect(snapRect({ x: 3.2, y: 7.7, width: 10.6, height: 22.2 }, 2)).toEqual({
      x: 4,
      y: 8,
      width: 10,
      height: 22
    });
  });
});

describe('drift detection', () => {
  it('flags large movement between frames', () => {
    const smallDrift = [{ center: { x: 10, y: 10 } }, { center: { x: 12, y: 11 } }];
    const majorDrift = [{ center: { x: 10, y: 10 } }, { center: { x: 40, y: 11 } }];

    expect(calculateFrameDrift(smallDrift)).toBe(2);
    expect(hasMajorDrift(smallDrift, 8)).toBe(false);
    expect(hasMajorDrift(majorDrift, 8)).toBe(true);
  });
});

describe('mock pose board and packing', () => {
  const sourceFrames = [
    { frameIndex: 2, imageUrl: 'frame-2', center: { x: 128, y: 255 } },
    { frameIndex: 0, imageUrl: 'frame-0', center: { x: 128, y: 255 } },
    { frameIndex: 1, imageUrl: 'frame-1', center: { x: 128, y: 255 } }
  ];

  it('reorders frames recovered from a mock pose board', () => {
    const board = createMockPoseBoard(sourceFrames, { columns: 2, cellSize: 256, anchor: { x: 128, y: 255 } });
    const recovered = recoverFramesFromMockPoseBoard(board);

    expect(recovered.map((frame) => frame.frameIndex)).toEqual([0, 1, 2]);
    expect(recovered[0].width).toBe(256);
    expect(board.width).toBe(512);
    expect(board.height).toBe(512);
  });

  it('normalizes frames and generates a matching manifest', () => {
    const normalized = normalizeFrames(sourceFrames, { cellSize: 256, anchor: { x: 128, y: 255 } });
    const sheet = packRuntimeSheet(normalized, { columns: 2, cellSize: 256 });
    const manifest = generateManifest({
      styleId: 'mock-style',
      actionId: 'mock-action',
      frames: normalized,
      anchor: { x: 128, y: 255 },
      sheet,
      cellSize: 256
    });

    expect(sheet.width).toBe(512);
    expect(sheet.height).toBe(512);
    expect(manifest.anchor).toEqual({ x: 128, y: 255 });
    expect(manifest.frameCount).toBe(3);
    expect(manifest.frames).toHaveLength(3);
  });
});

