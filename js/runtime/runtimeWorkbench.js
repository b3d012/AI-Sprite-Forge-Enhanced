import { recoverFramesFromPoseBoard, createMockPoseBoard } from './frameRecovery.js';
import { normalizeFramesToCells } from './normalize.js';
import { packRuntimeSpritesheet } from './packSheet.js';
import { generateManifest, generateValidationReport } from './manifest.js';
import { RuntimeAlignmentController } from './alignment.js';
import { createAnimatedPreview, exportRuntimeBundle, downloadRuntimeFiles } from './exportBundle.js';
import { loadImageFromFile, downloadBlob } from './utils.js';

class RuntimeWorkbench {
  constructor() {
    this.root = null;
    this.sourceImage = null;
    this.recovered = [];
    this.normalized = [];
    this.sheet = null;
    this.manifest = null;
    this.validation = null;
    this.previewHandle = null;
    this.alignment = new RuntimeAlignmentController([], {
      onChange: () => this.renderFromAlignment()
    });
    this.mount();
  }

  mount() {
    const main = document.querySelector('main') || document.body;
    const section = document.createElement('section');
    section.id = 'runtime-export-workbench';
    section.className = 'mt-16 rounded-2xl border border-white/10 bg-slate-950/70 p-6 shadow-2xl shadow-black/20';
    section.innerHTML = `
      <div class="flex flex-col gap-3 md:flex-row md:items-center md:justify-between mb-6">
        <div>
          <h2 class="text-2xl font-semibold text-white">Runtime Sheet System</h2>
          <p class="text-sm text-slate-400">Recover pose boards by connected components, normalize every frame to 256×256 runtime cells, and export game-ready bundles.</p>
        </div>
        <div class="flex gap-2 flex-wrap">
          <button type="button" id="runtimeLoadDemo" class="px-4 py-2 rounded-lg bg-slate-800 text-white border border-white/10 hover:bg-slate-700">Load demo board</button>
          <button type="button" id="runtimeRecover" class="px-4 py-2 rounded-lg bg-emerald-600 text-white hover:bg-emerald-500">Recover frames</button>
          <button type="button" id="runtimeExportZip" class="px-4 py-2 rounded-lg bg-cyan-600 text-white hover:bg-cyan-500">Export bundle</button>
        </div>
      </div>

      <div class="grid gap-6 lg:grid-cols-[1.1fr_1fr]">
        <div class="space-y-4">
          <div class="rounded-xl border border-white/10 bg-slate-900/80 p-4">
            <div class="flex flex-wrap items-center gap-3 mb-4">
              <input type="file" id="runtimePoseBoardInput" accept="image/*" class="hidden" />
              <button type="button" id="runtimeChooseBoard" class="px-4 py-2 rounded-lg bg-slate-800 text-white border border-white/10 hover:bg-slate-700">Choose pose board</button>
              <div class="flex gap-2">
                <label class="text-xs text-slate-400 flex items-center gap-2">Animation <input id="runtimeAnimationName" class="rounded-md bg-slate-950 border border-white/10 px-3 py-2 text-white" value="pose-board-runtime" /></label>
                <label class="text-xs text-slate-400 flex items-center gap-2">FPS <input id="runtimeFps" type="number" min="1" max="60" class="w-20 rounded-md bg-slate-950 border border-white/10 px-3 py-2 text-white" value="12" /></label>
              </div>
            </div>
            <div class="grid gap-4 md:grid-cols-2">
              <div class="rounded-lg bg-black/20 p-3">
                <div class="mb-2 text-sm text-slate-300">Source board</div>
                <canvas id="runtimeSourcePreview" class="w-full rounded-md border border-white/10 bg-fuchsia-500/30"></canvas>
              </div>
              <div class="rounded-lg bg-black/20 p-3">
                <div class="mb-2 text-sm text-slate-300">Validation</div>
                <pre id="runtimeValidationOutput" class="max-h-64 overflow-auto whitespace-pre-wrap rounded-md bg-slate-950 p-3 text-xs text-slate-300 border border-white/10"></pre>
              </div>
            </div>
          </div>

          <div class="rounded-xl border border-white/10 bg-slate-900/80 p-4">
            <div class="flex items-center justify-between mb-3">
              <h3 class="text-lg font-semibold text-white">Recovered Frames</h3>
              <div class="text-sm text-slate-400" id="runtimeFrameCount">0 frames</div>
            </div>
            <div id="runtimeFrameGrid" class="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-3"></div>
          </div>
        </div>

        <div class="space-y-4">
          <div class="rounded-xl border border-white/10 bg-slate-900/80 p-4">
            <div class="flex items-center justify-between mb-3">
              <h3 class="text-lg font-semibold text-white">Manual Alignment</h3>
              <div id="runtimeSelectedFrameLabel" class="text-sm text-slate-400">No frame selected</div>
            </div>
            <div class="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <button type="button" data-nudge="-1,0" class="runtime-nudge px-3 py-2 rounded-lg bg-slate-800 text-white border border-white/10 hover:bg-slate-700">← 1px</button>
              <button type="button" data-nudge="1,0" class="runtime-nudge px-3 py-2 rounded-lg bg-slate-800 text-white border border-white/10 hover:bg-slate-700">→ 1px</button>
              <button type="button" data-nudge="0,-1" class="runtime-nudge px-3 py-2 rounded-lg bg-slate-800 text-white border border-white/10 hover:bg-slate-700">↑ 1px</button>
              <button type="button" data-nudge="0,1" class="runtime-nudge px-3 py-2 rounded-lg bg-slate-800 text-white border border-white/10 hover:bg-slate-700">↓ 1px</button>
              <button type="button" data-nudge="-5,0" class="runtime-nudge px-3 py-2 rounded-lg bg-slate-800 text-white border border-white/10 hover:bg-slate-700">← 5px</button>
              <button type="button" data-nudge="5,0" class="runtime-nudge px-3 py-2 rounded-lg bg-slate-800 text-white border border-white/10 hover:bg-slate-700">→ 5px</button>
              <button type="button" data-nudge="0,-5" class="runtime-nudge px-3 py-2 rounded-lg bg-slate-800 text-white border border-white/10 hover:bg-slate-700">↑ 5px</button>
              <button type="button" data-nudge="0,5" class="runtime-nudge px-3 py-2 rounded-lg bg-slate-800 text-white border border-white/10 hover:bg-slate-700">↓ 5px</button>
            </div>
            <div class="mt-3 flex flex-wrap gap-2">
              <button type="button" id="runtimeResetAlignment" class="px-3 py-2 rounded-lg bg-slate-800 text-white border border-white/10 hover:bg-slate-700">Reset selected</button>
              <button type="button" id="runtimeCopyAlignment" class="px-3 py-2 rounded-lg bg-slate-800 text-white border border-white/10 hover:bg-slate-700">Copy to all</button>
              <button type="button" id="runtimePreview" class="px-3 py-2 rounded-lg bg-indigo-600 text-white hover:bg-indigo-500">Preview animation</button>
              <button type="button" id="runtimeStopPreview" class="px-3 py-2 rounded-lg bg-slate-800 text-white border border-white/10 hover:bg-slate-700">Stop preview</button>
            </div>
          </div>

          <div class="rounded-xl border border-white/10 bg-slate-900/80 p-4">
            <div class="flex items-center justify-between mb-3">
              <h3 class="text-lg font-semibold text-white">Runtime Preview</h3>
              <div class="text-sm text-slate-400">Uses manifest FPS</div>
            </div>
            <canvas id="runtimePreviewCanvas" width="256" height="256" class="w-full rounded-lg border border-white/10 bg-slate-950"></canvas>
            <div class="mt-3 text-xs text-slate-400" id="runtimePreviewNote">Load a pose board to generate the animation preview.</div>
          </div>

          <div class="rounded-xl border border-white/10 bg-slate-900/80 p-4">
            <div class="flex items-center justify-between mb-3">
              <h3 class="text-lg font-semibold text-white">Export Files</h3>
              <div class="text-sm text-slate-400" id="runtimeSheetSize">No spritesheet yet</div>
            </div>
            <div id="runtimeExportLinks" class="flex flex-wrap gap-2"></div>
          </div>
        </div>
      </div>
    `;

    main.appendChild(section);
    this.root = section;
    this.cacheElements();
    this.bindEvents();
    this.loadDemoBoard();
  }

  cacheElements() {
    this.elements = {
      chooseBoard: document.getElementById('runtimeChooseBoard'),
      boardInput: document.getElementById('runtimePoseBoardInput'),
      loadDemo: document.getElementById('runtimeLoadDemo'),
      recover: document.getElementById('runtimeRecover'),
      exportZip: document.getElementById('runtimeExportZip'),
      animationName: document.getElementById('runtimeAnimationName'),
      fps: document.getElementById('runtimeFps'),
      sourcePreview: document.getElementById('runtimeSourcePreview'),
      validation: document.getElementById('runtimeValidationOutput'),
      frameGrid: document.getElementById('runtimeFrameGrid'),
      frameCount: document.getElementById('runtimeFrameCount'),
      selectedFrameLabel: document.getElementById('runtimeSelectedFrameLabel'),
      resetAlignment: document.getElementById('runtimeResetAlignment'),
      copyAlignment: document.getElementById('runtimeCopyAlignment'),
      preview: document.getElementById('runtimePreview'),
      stopPreview: document.getElementById('runtimeStopPreview'),
      previewCanvas: document.getElementById('runtimePreviewCanvas'),
      previewNote: document.getElementById('runtimePreviewNote'),
      exportLinks: document.getElementById('runtimeExportLinks'),
      sheetSize: document.getElementById('runtimeSheetSize')
    };
  }

  bindEvents() {
    this.elements.chooseBoard.addEventListener('click', () => this.elements.boardInput.click());
    this.elements.boardInput.addEventListener('change', async (event) => {
      const file = event.target.files?.[0];
      if (file) {
        await this.loadBoardFromFile(file);
      }
    });

    this.elements.loadDemo.addEventListener('click', () => this.loadDemoBoard());
    this.elements.recover.addEventListener('click', () => this.recoverCurrentBoard());
    this.elements.exportZip.addEventListener('click', () => this.exportBundle());
    this.elements.resetAlignment.addEventListener('click', () => this.alignment.resetSelected());
    this.elements.copyAlignment.addEventListener('click', () => this.alignment.copySelectedAlignmentToAll());
    this.elements.preview.addEventListener('click', () => this.startPreview());
    this.elements.stopPreview.addEventListener('click', () => this.stopPreview());

    for (const button of this.root.querySelectorAll('.runtime-nudge')) {
      button.addEventListener('click', () => {
        const [dx, dy] = button.dataset.nudge.split(',').map((value) => Number(value));
        this.alignment.nudgeSelected(dx, dy);
      });
    }

    this.elements.fps.addEventListener('change', () => this.renderFromAlignment());
    this.elements.animationName.addEventListener('change', () => this.renderFromAlignment());
  }

  async loadBoardFromFile(file) {
    this.stopPreview();
    const image = await loadImageFromFile(file);
    this.sourceImage = image;
    this.renderSourcePreview(image);
    await this.recoverCurrentBoard();
  }

  async loadDemoBoard() {
    const demo = createMockPoseBoard();
    this.sourceImage = demo.canvas;
    this.renderSourcePreview(demo.canvas);
    await this.recoverCurrentBoard();
  }

  renderSourcePreview(source) {
    const canvas = this.elements.sourcePreview;
    const ctx = canvas.getContext('2d');
    const width = source.width || source.naturalWidth || source.videoWidth;
    const height = source.height || source.naturalHeight || source.videoHeight;
    const maxWidth = 540;
    const scale = Math.min(1, maxWidth / width);
    canvas.width = Math.max(1, Math.round(width * scale));
    canvas.height = Math.max(1, Math.round(height * scale));
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
  }

  async recoverCurrentBoard() {
    if (!this.sourceImage) {
      this.setStatus('Load or generate a pose board first.');
      return;
    }

    const recovered = await recoverFramesFromPoseBoard(this.sourceImage, {
      chromaTolerance: 42,
      minComponentArea: 60,
      padding: 0
    });

    this.recovered = recovered.frames;
    this.alignment = new RuntimeAlignmentController(this.recovered, {
      onChange: () => this.renderFromAlignment()
    });
    this.alignment.selectFrame(this.recovered[0]?.id || null);
    this.recoverMeta = recovered;
    this.renderFromAlignment();
    this.renderFrameGrid();
    this.setStatus(`Recovered ${this.recovered.length} frame${this.recovered.length === 1 ? '' : 's'} from the board.`);
  }

  renderFromAlignment() {
    if (!this.recovered.length) {
      return;
    }

    const frames = this.alignment.getAlignedFrames();
    this.normalized = normalizeFramesToCells(frames, {
      cellWidth: 256,
      cellHeight: 256,
      anchor: { x: 128, y: 255, type: 'foot' }
    });
    this.sheet = packRuntimeSpritesheet(this.normalized, {
      columns: 5,
      rows: 2,
      cellWidth: 256,
      cellHeight: 256
    });
    this.manifest = generateManifest({
      animationName: this.elements.animationName.value || 'pose-board-runtime',
      frameCount: this.normalized.length,
      columns: this.sheet.columns,
      rows: this.sheet.rows,
      cellWidth: 256,
      cellHeight: 256,
      fps: Number(this.elements.fps.value) || 12,
      anchor: { x: 128, y: 255, type: 'foot' },
      sourceStage: {
        name: 'pose-board-recovery',
        input: 'pose-board',
        method: 'connected-components',
        dimensions: this.recoverMeta?.source || null,
        chromaTolerance: this.recoverMeta?.source?.chromaTolerance ?? 42
      },
      frames
    });
    this.validation = generateValidationReport({
      animationName: this.manifest.animationName,
      frames,
      cellWidth: 256,
      cellHeight: 256,
      columns: this.sheet.columns,
      rows: this.sheet.rows,
      anchor: this.manifest.anchor,
      recoveredComponents: this.recoverMeta?.components?.length ?? frames.length,
      warnings: this.recoverMeta?.warnings || []
    });
    this.renderSheetSummary();
    this.renderValidation();
    this.renderFrameGrid();
    this.renderPreviewFrame();
    this.renderExportLinks();
  }

  renderFrameGrid() {
    if (!this.recovered.length) {
      this.elements.frameGrid.innerHTML = '<div class="text-sm text-slate-400">No frames recovered yet.</div>';
      this.elements.frameCount.textContent = '0 frames';
      return;
    }

    this.elements.frameCount.textContent = `${this.recovered.length} frame${this.recovered.length === 1 ? '' : 's'}`;
    const selectedId = this.alignment.selectedFrameId;
    this.elements.frameGrid.innerHTML = '';

    for (const frame of this.alignment.getAlignedFrames()) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = `text-left rounded-lg border p-2 transition ${frame.id === selectedId ? 'border-cyan-400 bg-cyan-400/10' : 'border-white/10 bg-black/20 hover:bg-black/30'}`;
      button.innerHTML = `
        <canvas class="w-full rounded-md border border-white/10 bg-fuchsia-500/30" width="${frame.canvas.width}" height="${frame.canvas.height}"></canvas>
        <div class="mt-2 text-xs text-slate-300">${frame.name}</div>
        <div class="text-[11px] text-slate-500">nudge: ${frame.nudge.x}, ${frame.nudge.y}</div>
      `;
      const previewCanvas = button.querySelector('canvas');
      previewCanvas.getContext('2d').drawImage(frame.canvas, 0, 0, previewCanvas.width, previewCanvas.height);
      button.addEventListener('click', () => {
        this.alignment.selectFrame(frame.id);
        this.renderFrameGrid();
      });
      this.elements.frameGrid.appendChild(button);
    }

    const selected = this.alignment.getSelectedFrame();
    this.elements.selectedFrameLabel.textContent = selected ? `${selected.name} · nudge ${selected.nudge.x}, ${selected.nudge.y}` : 'No frame selected';
  }

  renderSheetSummary() {
    if (!this.sheet) return;
    this.elements.sheetSize.textContent = `${this.sheet.width}×${this.sheet.height} sheet`;
  }

  renderValidation() {
    if (!this.validation) return;
    this.elements.validation.textContent = JSON.stringify(this.validation, null, 2);
  }

  renderPreviewFrame() {
    if (!this.sheet) return;
    const canvas = this.elements.previewCanvas;
    const ctx = canvas.getContext('2d');
    canvas.width = 256;
    canvas.height = 256;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(this.normalized[0].canvas, 0, 0, canvas.width, canvas.height);
    this.elements.previewNote.textContent = `Previewing ${this.manifest.frameCount} frames at ${this.manifest.fps} fps.`;
  }

  startPreview() {
    this.stopPreview();
    if (!this.normalized.length) return;
    this.previewHandle = createAnimatedPreview(this.elements.previewCanvas, this.normalized, Number(this.elements.fps.value) || 12);
    this.elements.previewNote.textContent = `Preview animation running at ${Number(this.elements.fps.value) || 12} fps.`;
  }

  stopPreview() {
    if (this.previewHandle?.stop) {
      this.previewHandle.stop();
    }
    this.previewHandle = null;
    if (this.sheet) {
      this.renderPreviewFrame();
    }
  }

  async exportBundle() {
    if (!this.sheet || !this.manifest || !this.validation) {
      this.setStatus('Recover frames first before exporting.');
      return;
    }

    const bundle = await exportRuntimeBundle({
      sheetCanvas: this.sheet.canvas,
      manifest: this.manifest,
      validationReport: this.validation,
      sourceFrames: this.alignment.getAlignedFrames(),
      normalizedFrames: this.normalized,
      previewCanvas: this.elements.previewCanvas,
      includeZip: true
    });

    this.renderExportLinks(bundle);

    if (bundle.zipBlob) {
      downloadBlob(bundle.zipBlob, `${this.manifest.animationName || 'runtime-export'}.zip`);
      this.setStatus('Exported ZIP bundle and file list.');
    } else {
      downloadRuntimeFiles(bundle.files);
      this.setStatus('ZIP support was unavailable, so the bundle was exported as individual files.');
    }
  }

  renderExportLinks(bundle = null) {
    if (!bundle) {
      this.elements.exportLinks.innerHTML = '<div class="text-sm text-slate-400">Run export to generate downloadable files and ZIP output.</div>';
      return;
    }

    this.elements.exportLinks.innerHTML = '';
    if (bundle.zipBlob) {
      const zipButton = document.createElement('button');
      zipButton.type = 'button';
      zipButton.className = 'px-3 py-2 rounded-lg bg-cyan-600 text-white hover:bg-cyan-500 text-sm';
      zipButton.textContent = 'Download ZIP';
      zipButton.addEventListener('click', () => {
        downloadBlob(bundle.zipBlob, `${this.manifest.animationName || 'runtime-export'}.zip`);
      });
      this.elements.exportLinks.appendChild(zipButton);
    }

    const files = bundle.files || [];
    for (const file of files) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'px-3 py-2 rounded-lg bg-slate-800 text-white border border-white/10 hover:bg-slate-700 text-sm';
      button.textContent = file.name;
      button.addEventListener('click', async () => {
        if (file.type === 'text') {
          const blob = new Blob([file.content], { type: 'application/json' });
          downloadBlob(blob, file.name);
        } else if (file.type === 'blob' && file.content instanceof Blob) {
          downloadBlob(file.content, file.name);
        }
      });
      this.elements.exportLinks.appendChild(button);
    }
  }

  setStatus(message) {
    this.elements.previewNote.textContent = message;
  }
}

if (typeof document !== 'undefined') {
  document.addEventListener('DOMContentLoaded', () => {
    window.runtimeWorkbench = new RuntimeWorkbench();
  });
}
