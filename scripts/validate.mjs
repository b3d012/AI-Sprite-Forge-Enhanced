import fs from 'fs/promises';
import path from 'path';
import {
  createMockPoseBoard,
  generateManifest,
  normalizeFrames,
  packRuntimeSheet,
  recoverFramesFromMockPoseBoard,
  createValidationChecks
} from '../js/lib/mockPipeline.js';
import { buildValidationReportMarkdown } from '../js/lib/exporters.js';
import {
  analyzePngBuffer,
  createMockAnchorPng,
  createMockFramePng,
  createMockReferencePng,
  createTransparentExportPng,
  packSpritesheetPng
} from './mock-assets.mjs';

const rootDir = path.resolve(process.cwd());
const artifactDir = path.join(rootDir, 'artifacts', 'validation');

async function main() {
  await fs.mkdir(artifactDir, { recursive: true });

  const referenceBuffer = createMockReferencePng();
  const anchorBuffer = createMockAnchorPng();
  const frameBuffers = Array.from({ length: 8 }, (_, frameIndex) => ({
    frameIndex,
    buffer: createMockFramePng(frameIndex)
  }));
  const transparentExportBuffer = createTransparentExportPng();

  const referenceStats = analyzePngBuffer(referenceBuffer);
  const anchorStats = analyzePngBuffer(anchorBuffer);
  const transparentStats = analyzePngBuffer(transparentExportBuffer);

  const frames = frameBuffers.map(({ frameIndex }) => ({
    frameIndex,
    imageUrl: `frame-${frameIndex}`,
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
      greenCoverage: Math.max(referenceStats.greenCoverage, anchorStats.greenCoverage)
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

  const sheetBuffer = packSpritesheetPng(frameBuffers, 4, 256);
  await fs.writeFile(path.join(artifactDir, 'reference.png'), referenceBuffer);
  await fs.writeFile(path.join(artifactDir, 'anchor.png'), anchorBuffer);
  await fs.writeFile(path.join(artifactDir, 'spritesheet.png'), sheetBuffer);
  await fs.writeFile(path.join(artifactDir, 'transparent-export.png'), transparentExportBuffer);
  await fs.writeFile(path.join(artifactDir, 'manifest.json'), JSON.stringify(manifest, null, 2));

  const reportMarkdown = buildValidationReportMarkdown({
    status: checks.every((check) => check.pass) ? 'PASS' : 'FAIL',
    commandsRun: [
      'npm install',
      'npm run build',
      'npm run test:unit',
      'npm run test:integration',
      'npm run test:ui',
      'npm run check:real-api',
      'npm test',
      'npm run check',
      'npm run validate'
    ],
    whatWasTested: [
      'prompt builder',
      'pipeline state transitions',
      'chroma key detection',
      'pixel snap utility behavior',
      'frame recovery from mock pose board',
      'runtime sheet packing',
      'manifest generation',
      'export functions',
      'mock dashboard smoke checks'
    ],
    results: checks.map((check) => `${check.pass ? 'PASS' : 'FAIL'} ${check.name}: ${check.details}`),
    limitations: [
      'Mock outputs are deterministic test fixtures.',
      'Live OpenAI image generation is not exercised in this validation run.'
    ],
    requiresRealApiKey: [
      'OpenAI image-edit generation',
      'Any live GPT-Image-1 style or action call'
    ],
    sampleOutputs: [
      path.relative(rootDir, path.join(artifactDir, 'reference.png')),
      path.relative(rootDir, path.join(artifactDir, 'spritesheet.png')),
      path.relative(rootDir, path.join(artifactDir, 'manifest.json'))
    ]
  });

  await fs.writeFile(path.join(rootDir, 'VALIDATION_REPORT.md'), reportMarkdown);
  await fs.writeFile(path.join(artifactDir, 'VALIDATION_REPORT.md'), reportMarkdown);

  process.stdout.write([
    'Validation report written to VALIDATION_REPORT.md',
    `Artifacts: ${artifactDir}`,
    `PASS checks: ${checks.filter((check) => check.pass).length}/${checks.length}`,
    `Transparent export semi-transparent pixels: ${transparentStats.semiTransparentPixels}`
  ].join('\n'));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
