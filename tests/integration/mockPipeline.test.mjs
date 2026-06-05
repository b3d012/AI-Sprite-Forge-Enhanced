import fs from 'fs/promises';
import path from 'path';
import { describe, expect, it } from 'vitest';
import {
  createMockPoseBoard,
  generateManifest,
  normalizeFrames,
  packRuntimeSheet,
  recoverFramesFromMockPoseBoard,
  createValidationChecks
} from '../../js/lib/mockPipeline.js';
import { buildValidationReportMarkdown, createJsonDownload, createTextDownload } from '../../js/lib/exporters.js';
import {
  analyzePngBuffer,
  createMockAnchorPng,
  createMockFramePng,
  createMockReferencePng,
  createTransparentExportPng,
  packSpritesheetPng
} from '../../scripts/mock-assets.mjs';

const outputDir = path.resolve('artifacts', 'mock-pipeline');

describe('full mock pipeline', () => {
  it('runs end to end without requiring an API key', async () => {
    await fs.mkdir(outputDir, { recursive: true });

    const referenceBuffer = createMockReferencePng();
    const anchorBuffer = createMockAnchorPng();
    const runtimeFrames = Array.from({ length: 8 }, (_, frameIndex) => ({
      frameIndex,
      buffer: createMockFramePng(frameIndex)
    }));
    const transparentExportBuffer = createTransparentExportPng();

    const referenceStats = analyzePngBuffer(referenceBuffer);
    const anchorStats = analyzePngBuffer(anchorBuffer);
    const frameStats = runtimeFrames.map(({ buffer }) => analyzePngBuffer(buffer));
    const transparentExportStats = analyzePngBuffer(transparentExportBuffer);

    expect(referenceStats.width).toBe(1024);
    expect(referenceStats.height).toBe(1024);
    expect(referenceStats.greenCoverage).toBeGreaterThan(0.6);
    expect(referenceStats.semiTransparentPixels).toBe(0);

    expect(anchorStats.width).toBe(1024);
    expect(anchorStats.height).toBe(1024);
    expect(anchorStats.greenCoverage).toBeGreaterThan(0.9);
    expect(anchorStats.semiTransparentPixels).toBe(0);

    expect(frameStats.every((stat) => stat.width === 256 && stat.height === 256)).toBe(true);

    const frames = runtimeFrames.map((frame) => ({
      frameIndex: frame.frameIndex,
      imageUrl: `frame-${frame.frameIndex}`,
      center: { x: 128, y: 255 }
    }));

    const poseBoard = createMockPoseBoard(frames, { columns: 4, cellSize: 256, anchor: { x: 128, y: 255 } });
    const recoveredFrames = recoverFramesFromMockPoseBoard(poseBoard);
    const normalizedFrames = normalizeFrames(recoveredFrames, { cellSize: 256, anchor: { x: 128, y: 255 } });
    const sheet = packRuntimeSheet(normalizedFrames, { columns: 4, cellSize: 256 });
    const manifest = generateManifest({
      styleId: 'mock-style',
      actionId: 'mock-action',
      frames: normalizedFrames,
      anchor: { x: 128, y: 255 },
      sheet,
      cellSize: 256
    });
    const checks = createValidationChecks({
      anchorImage: {
        width: 1024,
        height: 1024,
        greenCoverage: anchorStats.greenCoverage
      },
      runtimeCells: normalizedFrames,
      sheet,
      manifest,
      finalFrames: normalizedFrames,
      chromaStages: [
        { name: 'reference', semiTransparentCount: referenceStats.semiTransparentPixels },
        { name: 'anchor', semiTransparentCount: anchorStats.semiTransparentPixels }
      ]
    });

    const sheetBuffer = packSpritesheetPng(
      runtimeFrames,
      4,
      256
    );

    await fs.writeFile(path.join(outputDir, 'reference.png'), referenceBuffer);
    await fs.writeFile(path.join(outputDir, 'anchor.png'), anchorBuffer);
    await fs.writeFile(path.join(outputDir, 'spritesheet.png'), sheetBuffer);
    await fs.writeFile(path.join(outputDir, 'transparent-export.png'), transparentExportBuffer);
    await fs.writeFile(path.join(outputDir, 'manifest.json'), JSON.stringify(manifest, null, 2));

    const reportMarkdown = buildValidationReportMarkdown({
      status: checks.every((check) => check.pass) ? 'PASS' : 'FAIL',
      commandsRun: ['npm run build', 'npm run test:unit', 'npm run test:integration'],
      whatWasTested: [
        'reference upload/mock input',
        'mock south anchor generation',
        'pixel snap',
        'generate directions',
        'generate pose board',
        'recover frames',
        'normalize frames',
        'pack spritesheet',
        'generate manifest',
        'export validation report'
      ],
      results: checks.map((check) => `${check.pass ? 'PASS' : 'FAIL'} ${check.name}: ${check.details}`),
      limitations: ['Mock outputs are deterministic placeholders.', 'Live image generation still requires OPENAI_API_KEY.'],
      requiresRealApiKey: ['OpenAI image edit generation'],
      sampleOutputs: [
        path.join(outputDir, 'reference.png'),
        path.join(outputDir, 'spritesheet.png'),
        path.join(outputDir, 'manifest.json')
      ]
    });

    const reportDownload = createTextDownload('VALIDATION_REPORT.md', reportMarkdown);
    const manifestDownload = createJsonDownload('manifest.json', manifest);

    await fs.writeFile(path.join(outputDir, 'VALIDATION_REPORT.md'), reportDownload.content);
    await fs.writeFile(path.join(outputDir, 'manifest-download.json'), manifestDownload.content);

    expect(manifest.anchor).toEqual({ x: 128, y: 255 });
    expect(manifest.frameCount).toBe(8);
    expect(sheet.width).toBe(1024);
    expect(sheet.height).toBe(512);
    expect(checks.every((check) => check.pass)).toBe(true);
    expect(reportMarkdown).toContain('Status: PASS');
    expect(transparentExportStats.semiTransparentPixels).toBeGreaterThan(0);
    expect(transparentExportStats.transparentPixels).toBeGreaterThan(0);
  });
});

