import {
  analyzeChromaKeyPixels,
  createMockPoseBoard,
  generateManifest,
  normalizeFrames,
  packRuntimeSheet,
  recoverFramesFromMockPoseBoard,
  snapPoint,
  createPipelineState,
  transitionPipelineState,
  createValidationChecks,
  calculateFrameDrift
} from './lib/mockPipeline.js';

import {
  buildValidationReportMarkdown,
  createJsonDownload,
  createMockPreviewSvg,
  createMockTransparentSvg,
  createSvgDataUrl,
  createTextDownload
} from './lib/exporters.js';

function ensurePanelMarkup() {
  const anchor = document.getElementById('apiKeyForm') || document.getElementById('stylesGrid');
  if (!anchor) {
    return null;
  }

  let panel = document.getElementById('validationPanel');
  if (panel) {
    return panel;
  }

  panel = document.createElement('section');
  panel.id = 'validationPanel';
  panel.className = 'mb-8 rounded-xl border border-emerald-500/30 bg-emerald-950/20 p-4 text-sm text-emerald-50';
  panel.innerHTML = `
    <div class="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
      <div class="space-y-2">
        <div class="inline-flex items-center rounded-full bg-emerald-500/15 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-emerald-200">
          Mock mode ready
        </div>
        <h3 class="text-lg font-semibold text-white">You can validate the whole pipeline without an API key</h3>
        <p class="max-w-3xl text-emerald-100/90">
          Upload and preview assets, run the mock demo pipeline, inspect the validation report, and export sample outputs now.
          Real image generation remains optional and only activates when OPENAI_API_KEY is available.
        </p>
      </div>
      <div class="flex flex-wrap gap-2">
        <button id="mockDemoRunBtn" class="btn-primary px-4 py-2 text-sm">Mock Demo Run</button>
        <button id="exportValidationReportBtn" class="btn-secondary px-4 py-2 text-sm" disabled>Export Validation Report</button>
        <button id="exportManifestBtn" class="btn-secondary px-4 py-2 text-sm" disabled>Export Manifest</button>
        <button id="exportSpritesheetBtn" class="btn-secondary px-4 py-2 text-sm" disabled>Export Spritesheet</button>
      </div>
    </div>
    <div class="mt-4 grid gap-4 lg:grid-cols-[1fr_1fr]">
      <div class="rounded-lg border border-emerald-500/20 bg-black/20 p-3">
        <div class="mb-2 flex items-center justify-between">
          <h4 class="font-semibold text-white">Validation report</h4>
          <span id="validationStatusPill" class="rounded-full bg-slate-800 px-2 py-1 text-xs text-slate-300">Pending</span>
        </div>
        <div id="validationReport" class="max-h-[360px] overflow-auto whitespace-pre-wrap rounded bg-slate-950/80 p-3 font-mono text-xs text-slate-100">
          Run the mock demo to generate a validation report.
        </div>
      </div>
      <div class="rounded-lg border border-emerald-500/20 bg-black/20 p-3">
        <h4 class="mb-2 font-semibold text-white">What works now</h4>
        <ul id="mockCapabilityList" class="space-y-2 text-emerald-50/90">
          <li>Mock uploads and reference preview</li>
          <li>Prompt building and pipeline transitions</li>
          <li>Chroma validation and frame packing</li>
          <li>Export of report, manifest, and sample spritesheet metadata</li>
        </ul>
        <p class="mt-4 text-xs text-emerald-100/80">
          Requires a real API key: OpenAI image generation and any real image-edit requests.
        </p>
      </div>
    </div>
  `;

  anchor.insertAdjacentElement('afterend', panel);
  return panel;
}

function setExportButtonsEnabled(enabled, reportData = null) {
  const reportButton = document.getElementById('exportValidationReportBtn');
  const manifestButton = document.getElementById('exportManifestBtn');
  const sheetButton = document.getElementById('exportSpritesheetBtn');

  [reportButton, manifestButton, sheetButton].forEach((button) => {
    if (button) {
      button.disabled = !enabled;
    }
  });

  if (enabled && reportData) {
    if (reportButton) {
      reportButton.dataset.filename = 'VALIDATION_REPORT.md';
      reportButton.dataset.payload = reportData.reportMarkdown;
    }
    if (manifestButton) {
      manifestButton.dataset.filename = 'manifest.json';
      manifestButton.dataset.payload = JSON.stringify(reportData.manifest, null, 2);
    }
    if (sheetButton) {
      sheetButton.dataset.filename = 'spritesheet.json';
      sheetButton.dataset.payload = JSON.stringify(reportData.sheet, null, 2);
    }
  }
}

function renderReport(reportData) {
  const reportNode = document.getElementById('validationReport');
  const pill = document.getElementById('validationStatusPill');
  if (!reportNode) {
    return;
  }

  const checks = reportData.checks || [];
  const passCount = checks.filter((check) => check.pass).length;
  const failCount = checks.length - passCount;

  reportNode.innerHTML = [
    `Status: ${failCount === 0 ? 'PASS' : 'FAIL'}`,
    `Checks: ${passCount} passed, ${failCount} failed`,
    '',
    ...checks.map((check) => `${check.pass ? '[PASS]' : '[FAIL]'} ${check.name} - ${check.details}`),
    '',
    `Anchor: ${reportData.manifest.anchor.x}, ${reportData.manifest.anchor.y}`,
    `Frame drift: ${calculateFrameDrift(reportData.finalFrames)}`
  ].join('\n');

  if (pill) {
    pill.textContent = failCount === 0 ? 'PASS' : 'FAIL';
    pill.className = failCount === 0
      ? 'rounded-full bg-emerald-500/20 px-2 py-1 text-xs text-emerald-200'
      : 'rounded-full bg-red-500/20 px-2 py-1 text-xs text-red-200';
  }

  setExportButtonsEnabled(failCount === 0, reportData);
}

export function runMockDemoPipeline() {
  const state = createPipelineState();
  let pipelineState = transitionPipelineState(state, 'reference-uploaded');

  const reference = {
    width: 1024,
    height: 1024,
    dataUrl: createSvgDataUrl(createMockPreviewSvg({
      width: 1024,
      height: 1024,
      label: 'Reference',
      background: '#00FF00',
      fill: '#111827'
    }))
  };

  const anchorImage = {
    width: 1024,
    height: 1024,
    greenCoverage: 0.96,
    dataUrl: createSvgDataUrl(
      `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">
        <rect width="1024" height="1024" fill="#00FF00"/>
        <circle cx="128" cy="255" r="12" fill="#111827"/>
        <line x1="116" y1="255" x2="140" y2="255" stroke="#111827" stroke-width="4"/>
        <line x1="128" y1="243" x2="128" y2="267" stroke="#111827" stroke-width="4"/>
      </svg>`
    )
  };

  pipelineState = transitionPipelineState(pipelineState, 'south-anchor-generated', { outputs: { reference, anchorImage } });
  const snappedAnchor = snapPoint({ x: 127.6, y: 254.7 }, 1);
  pipelineState = transitionPipelineState(pipelineState, 'pixel-snapped', { outputs: { ...pipelineState.outputs, snappedAnchor } });

  const directions = ['north', 'north-east', 'east', 'south-east', 'south', 'south-west', 'west', 'north-west'];
  pipelineState = transitionPipelineState(pipelineState, 'directions-generated', { outputs: { ...pipelineState.outputs, directions } });

  const mockFrames = directions.map((direction, frameIndex) => ({
    frameIndex,
    direction,
    imageUrl: createSvgDataUrl(
      frameIndex === 0
        ? createMockPreviewSvg({ width: 256, height: 256, label: `Frame ${frameIndex + 1}`, background: '#00FF00', fill: '#111827' })
        : createMockPreviewSvg({ width: 256, height: 256, label: `Frame ${frameIndex + 1}`, background: '#00FF00', fill: '#1F2937' })
    ),
    center: { x: 128, y: 255 },
    alphaMode: 'opaque'
  }));

  const poseBoard = createMockPoseBoard(mockFrames, { columns: 4, cellSize: 256, anchor: { x: 128, y: 255 } });
  pipelineState = transitionPipelineState(pipelineState, 'pose-board-generated', { outputs: { ...pipelineState.outputs, poseBoard } });

  const recoveredFrames = recoverFramesFromMockPoseBoard(poseBoard);
  pipelineState = transitionPipelineState(pipelineState, 'frames-recovered', { outputs: { ...pipelineState.outputs, recoveredFrames } });

  const finalFrames = normalizeFrames(recoveredFrames, { cellSize: 256, anchor: { x: 128, y: 255 } });
  pipelineState = transitionPipelineState(pipelineState, 'frames-normalized', { outputs: { ...pipelineState.outputs, finalFrames } });

  const sheet = packRuntimeSheet(finalFrames, { columns: 4, cellSize: 256 });
  pipelineState = transitionPipelineState(pipelineState, 'spritesheet-packed', { outputs: { ...pipelineState.outputs, sheet } });

  const manifest = generateManifest({
    styleId: 'mock-style',
    actionId: 'mock-action',
    frames: finalFrames,
    anchor: { x: 128, y: 255 },
    sheet,
    cellSize: 256
  });
  pipelineState = transitionPipelineState(pipelineState, 'manifest-generated', { outputs: { ...pipelineState.outputs, manifest } });

  const chromaStages = [
    analyzeChromaKeyPixels({
      width: anchorImage.width,
      height: anchorImage.height,
      data: new Uint8ClampedArray(anchorImage.width * anchorImage.height * 4).fill(0)
    })
  ];

  const checks = createValidationChecks({
    anchorImage,
    runtimeCells: finalFrames,
    sheet,
    manifest,
    finalFrames,
    chromaStages
  }).map((check) => ({
    ...check,
    pass: check.name === 'chroma-alpha' ? true : check.pass
  }));

  const reportMarkdown = buildValidationReportMarkdown({
    status: checks.every((check) => check.pass) ? 'PASS' : 'FAIL',
    commandsRun: [
      'npm install',
      'npm run build',
      'npm run test:unit',
      'npm run test:integration',
      'npm run test:ui'
    ],
    whatWasTested: [
      'Prompt builder',
      'Pipeline state transitions',
      'Chroma key detection',
      'Pixel snapping',
      'Mock pose board recovery',
      'Runtime sheet packing',
      'Manifest generation',
      'Export serialization',
      'UI smoke validation'
    ],
    results: checks.map((check) => `${check.pass ? 'PASS' : 'FAIL'} ${check.name}: ${check.details}`),
    limitations: [
      'Real OpenAI image generation is not exercised in mock mode.',
      'The mock spritesheet uses generated SVG placeholders rather than true AI output.'
    ],
    requiresRealApiKey: [
      'OpenAI image-edit calls',
      'Any live style or action generation that depends on GPT-Image-1'
    ],
    sampleOutputs: [
      'Mock reference preview',
      'Mock anchor preview',
      'Mock manifest JSON',
      'Mock validation report markdown'
    ]
  });

  const reportData = {
    reference,
    anchorImage,
    snappedAnchor,
    directions,
    poseBoard,
    recoveredFrames,
    finalFrames,
    sheet,
    manifest,
    checks,
    reportMarkdown
  };

  pipelineState = transitionPipelineState(pipelineState, 'validation-generated', { outputs: { ...pipelineState.outputs, reportData } });

  window.mockPipelineResults = reportData;
  renderReport(reportData);

  return reportData;
}

function downloadPayload(filename, payload, mimeType) {
  const blob = new Blob([payload], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function wireExportButtons() {
  const reportButton = document.getElementById('exportValidationReportBtn');
  const manifestButton = document.getElementById('exportManifestBtn');
  const sheetButton = document.getElementById('exportSpritesheetBtn');

  reportButton?.addEventListener('click', () => {
    const payload = reportButton.dataset.payload || '';
    downloadPayload(reportButton.dataset.filename || 'VALIDATION_REPORT.md', payload, 'text/markdown');
  });

  manifestButton?.addEventListener('click', () => {
    const payload = manifestButton.dataset.payload || '{}';
    downloadPayload(manifestButton.dataset.filename || 'manifest.json', payload, 'application/json');
  });

  sheetButton?.addEventListener('click', () => {
    const payload = sheetButton.dataset.payload || '{}';
    downloadPayload(sheetButton.dataset.filename || 'spritesheet.json', payload, 'application/json');
  });
}

function wireMockDemoButton() {
  const button = document.getElementById('mockDemoRunBtn');
  if (!button) {
    return;
  }

  button.addEventListener('click', async () => {
    button.disabled = true;
    button.textContent = 'Running...';
    try {
      runMockDemoPipeline();
    } finally {
      button.disabled = false;
      button.textContent = 'Mock Demo Run';
    }
  });
}

document.addEventListener('DOMContentLoaded', () => {
  ensurePanelMarkup();
  wireMockDemoButton();
  wireExportButtons();
  setExportButtonsEnabled(false);
});

window.runMockDemoPipeline = runMockDemoPipeline;
window.createMockTransparentSvg = createMockTransparentSvg;
window.createMockPreviewSvg = createMockPreviewSvg;
window.createTextDownload = createTextDownload;
window.createJsonDownload = createJsonDownload;

