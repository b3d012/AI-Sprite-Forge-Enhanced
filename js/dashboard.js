import { getState, updateState } from './state.js';
import {
  buildPrompt,
  getActionPresetOptions,
  getProviderOptions,
  getPromptTemplateOptions,
  DEFAULT_PROMPT_VALUES,
  ACTION_PRESET_MAP
} from './prompts/buildPrompt.js';
import { remoteEdit, remoteGenerate } from './api.js';
import { MockImageProvider } from './pipeline/providers/mockProvider.js';

const STORAGE_KEY = 'spriteforge_dashboard_runtime_v1';
const TINY_TRANSPARENT_GIF = 'data:image/gif;base64,R0lGODlhAQABAIABAP///wAAACwAAAAAAQABAAACAkQBADs='; // minimal valid GIF

const ACTIONS = ['idle', 'walk', 'attack', 'hurt', 'jump', 'death', 'cast', 'dash'];
const STAGES = ['setup', 'reference', 'directional', 'animation', 'aligner', 'export'];
const PROMPT_FIELD_DEFAULTS = {
  ...DEFAULT_PROMPT_VALUES,
  footAnchor: `${DEFAULT_PROMPT_VALUES.footAnchorX},${DEFAULT_PROMPT_VALUES.footAnchorY}`
};

const PIPELINE_TO_PROMPT_STAGE = {
  setup: 'south_front_anchor',
  reference: 'south_front_anchor',
  directional: 'directional_anchors_nsew',
  animation: 'action_pose_board',
  aligner: 'pixel_snap_anchor',
  export: 'runtime_normalize_and_align'
};

let promptBuilderState = {
  ...PROMPT_FIELD_DEFAULTS
};

if (typeof window !== 'undefined') {
  window.spritePromptBuilderState = promptBuilderState;
}

const DEFAULT_RUNTIME = {
  projectName: 'Untitled Project',
  provider: 'mock',
  outputSettings: {
    cellSize: 256,
    fps: 12,
    columns: 5,
    rows: 2,
    footAnchorX: 128,
    footAnchorY: 255,
    backgroundMode: 'chroma-green'
  },
  selectedAction: 'idle',
  currentStage: 'setup',
  selectedFrameIndex: -1,
  stageStatus: {
    setup: 'not run',
    reference: 'not run',
    directional: 'not run',
    animation: 'not run',
    aligner: 'not run',
    export: 'not run'
  },
  warnings: [],
  activity: [],
  pipelineProgress: 0,
  referenceImage: null,
  referenceImageName: '',
  previews: {
    reference: '',
    anchor: '',
    compareRaw: '',
    compareSnapped: '',
    direction: '',
    animation: '',
    live: '',
    sheet: '',
    sidebarAnimation: ''
  },
  frames: [],
  frameOffsets: [],
  poseBoard: '',
  validationReport: null,
  promptBuilder: {
    ...PROMPT_FIELD_DEFAULTS
  },
  running: false,
  lastError: ''
};

const PLACEHOLDER_COLORS = {
  reference: ['#0f172a', '#22d3ee'],
  anchor: ['#111827', '#f59e0b'],
  direction: ['#111827', '#a78bfa'],
  animation: ['#111827', '#34d399'],
  sheet: ['#0b1120', '#60a5fa'],
  live: ['#0b1120', '#fb7185']
};

let runtime = loadRuntime();
let els = {};
let animationTimer = null;
let animationCycleIndex = 0;
let openAIStatus = 'unknown';

promptBuilderState = {
  ...PROMPT_FIELD_DEFAULTS,
  ...(runtime.promptBuilder || {})
};

if (typeof window !== 'undefined') {
  window.spritePromptBuilderState = promptBuilderState;
}

const pipeline = typeof window !== 'undefined' ? (window.SpriteForgePipeline || {}) : {};
if (typeof window !== 'undefined') {
  window.SpriteForgePipeline = pipeline;
}

function loadRuntime() {
  try {
    if (typeof localStorage === 'undefined') {
      return structuredClone(DEFAULT_RUNTIME);
    }
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return structuredClone(DEFAULT_RUNTIME);
    const parsed = JSON.parse(raw);
    if (parsed.apiKey || parsed.provider?.apiKey) {
      delete parsed.apiKey;
      if (parsed.provider) {
        delete parsed.provider.apiKey;
      }
      localStorage.setItem(STORAGE_KEY, JSON.stringify(parsed));
    }
    return mergeRuntime(DEFAULT_RUNTIME, parsed);
  } catch (error) {
    console.warn('Failed to load runtime state:', error);
    return structuredClone(DEFAULT_RUNTIME);
  }
}

function mergeRuntime(base, patch) {
  const merged = {
    ...structuredClone(base),
    ...patch,
    outputSettings: { ...base.outputSettings, ...(patch?.outputSettings || {}) },
    stageStatus: { ...base.stageStatus, ...(patch?.stageStatus || {}) },
    previews: { ...base.previews, ...(patch?.previews || {}) },
    promptBuilder: { ...base.promptBuilder, ...(patch?.promptBuilder || {}) },
    warnings: Array.isArray(patch?.warnings) ? patch.warnings : [...base.warnings],
    activity: Array.isArray(patch?.activity) ? patch.activity : [...base.activity],
    frames: Array.isArray(patch?.frames) ? patch.frames : [...base.frames],
    frameOffsets: Array.isArray(patch?.frameOffsets) ? patch.frameOffsets : [...base.frameOffsets]
  };
  return merged;
}

function saveRuntime() {
  try {
    const snapshot = {
      projectName: runtime.projectName,
      provider: runtime.provider,
      outputSettings: runtime.outputSettings,
      selectedAction: runtime.selectedAction,
      currentStage: runtime.currentStage,
      selectedFrameIndex: runtime.selectedFrameIndex,
      stageStatus: runtime.stageStatus,
      warnings: runtime.warnings,
      activity: runtime.activity,
      pipelineProgress: runtime.pipelineProgress,
      referenceImageName: runtime.referenceImageName,
      validationReport: runtime.validationReport,
      promptBuilder: runtime.promptBuilder
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot));
  } catch (error) {
    console.warn('Unable to save dashboard runtime:', error);
  }
}

function onReady(fn) {
  if (typeof document === 'undefined') {
    return;
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', fn);
  } else {
    fn();
  }
}

function $(id) {
  return document.getElementById(id);
}

function parseFootAnchor(value) {
  const [x = PROMPT_FIELD_DEFAULTS.footAnchorX, y = PROMPT_FIELD_DEFAULTS.footAnchorY] = String(value || '')
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);
  return { footAnchorX: x || PROMPT_FIELD_DEFAULTS.footAnchorX, footAnchorY: y || PROMPT_FIELD_DEFAULTS.footAnchorY };
}

function getPromptEls() {
  return {
    stageSelect: $('stagePromptSelect'),
    providerSelect: $('promptProviderSelect'),
    actionChips: $('actionPresetChips'),
    actionName: $('promptActionName'),
    direction: $('promptDirection'),
    coreIdentity: $('promptCoreIdentity'),
    costumePalette: $('promptCostumePalette'),
    silhouetteNotes: $('promptSilhouetteNotes'),
    cellSize: $('promptCellSize'),
    backgroundColor: $('promptBackgroundColor'),
    paletteLimit: $('promptPaletteLimit'),
    footAnchor: $('promptFootAnchor'),
    sheetColumns: $('promptSheetColumns'),
    sheetRows: $('promptSheetRows'),
    output: $('finalPromptOutput'),
    copyBtn: $('copyPromptBtn'),
    sendBtn: $('sendPromptBtn'),
    resetBtn: $('resetPromptBtn'),
    status: $('promptBuilderStatus'),
    currentStageBadge: $('currentStageBadge'),
    providerBadge: $('providerBadge'),
    actionSelect: $('actionSelect')
  };
}

function updatePromptBuilderStateFromInputs() {
  const els = getPromptEls();
  const footAnchor = parseFootAnchor(els.footAnchor?.value);

  promptBuilderState = {
    stageId: els.stageSelect?.value || PROMPT_FIELD_DEFAULTS.stageId,
    providerId: els.providerSelect?.value || PROMPT_FIELD_DEFAULTS.providerId,
    actionName: els.actionName?.value?.trim() || PROMPT_FIELD_DEFAULTS.actionName,
    direction: els.direction?.value || PROMPT_FIELD_DEFAULTS.direction,
    coreIdentity: els.coreIdentity?.value?.trim() || PROMPT_FIELD_DEFAULTS.coreIdentity,
    costumeAndPalette: els.costumePalette?.value?.trim() || PROMPT_FIELD_DEFAULTS.costumeAndPalette,
    silhouetteNotes: els.silhouetteNotes?.value?.trim() || PROMPT_FIELD_DEFAULTS.silhouetteNotes,
    cellSize: els.cellSize?.value?.trim() || PROMPT_FIELD_DEFAULTS.cellSize,
    backgroundColor: els.backgroundColor?.value?.trim() || PROMPT_FIELD_DEFAULTS.backgroundColor,
    paletteLimit: els.paletteLimit?.value?.trim() || PROMPT_FIELD_DEFAULTS.paletteLimit,
    outputSheetColumns: els.sheetColumns?.value?.trim() || PROMPT_FIELD_DEFAULTS.outputSheetColumns,
    outputSheetRows: els.sheetRows?.value?.trim() || PROMPT_FIELD_DEFAULTS.outputSheetRows,
    footAnchorX: footAnchor.footAnchorX,
    footAnchorY: footAnchor.footAnchorY
  };
  runtime.promptBuilder = { ...promptBuilderState };

  if (typeof window !== 'undefined') {
    window.spritePromptBuilderState = promptBuilderState;
  }
  syncSharedState({ promptBuilder: promptBuilderState });
  return promptBuilderState;
}

function renderPromptBuilder() {
  const els = getPromptEls();
  const prompt = buildPrompt({ ...promptBuilderState });
  if (els.output) {
    els.output.value = prompt;
  }
  if (els.status) {
    els.status.dataset.status = 'running';
    els.status.textContent = `Stage: ${promptBuilderState.stageId} | Provider: ${promptBuilderState.providerId}`;
  }
  return prompt;
}

function buildProductionPrompt(stageId, overrides = {}) {
  return buildPrompt({
    ...promptBuilderState,
    ...overrides,
    stageId,
    actionName: overrides.actionName || runtime.selectedAction || promptBuilderState.actionName,
    direction: overrides.direction || promptBuilderState.direction || 'south',
    cellSize: `${runtime.outputSettings.cellSize}x${runtime.outputSettings.cellSize}`,
    backgroundColor: '#00FF00',
    paletteLimit: promptBuilderState.paletteLimit || DEFAULT_PROMPT_VALUES.paletteLimit,
    outputSheetColumns: String(runtime.outputSettings.columns || 5),
    outputSheetRows: String(runtime.outputSettings.rows || 2),
    footAnchorX: String(runtime.outputSettings.footAnchorX || 128),
    footAnchorY: String(runtime.outputSettings.footAnchorY || 255),
  });
}

function populateSelect(selectEl, options) {
  if (!selectEl) return;
  selectEl.innerHTML = '';
  options.forEach((option) => {
    const optionEl = document.createElement('option');
    optionEl.value = option.id;
    optionEl.textContent = option.label;
    selectEl.appendChild(optionEl);
  });
}

function applyPromptPreset(actionId) {
  const preset = ACTION_PRESET_MAP[actionId];
  if (!preset) return;
  const els = getPromptEls();
  if (els.actionName) els.actionName.value = preset.id;
  if (els.stageSelect) els.stageSelect.value = preset.stageId;
  if (els.actionSelect) els.actionSelect.value = preset.id;
  updatePromptBuilderStateFromInputs();
  renderPromptBuilder();
}

function syncPromptBuilderStageFromPipeline(stage) {
  const promptStage = PIPELINE_TO_PROMPT_STAGE[stage] || PROMPT_FIELD_DEFAULTS.stageId;
  const els = getPromptEls();
  if (els.stageSelect) {
    els.stageSelect.value = promptStage;
  }
  updatePromptBuilderStateFromInputs();
  renderPromptBuilder();
}

function resetPromptBuilder() {
  const els = getPromptEls();
  if (els.stageSelect) els.stageSelect.value = PROMPT_FIELD_DEFAULTS.stageId;
  if (els.providerSelect) els.providerSelect.value = PROMPT_FIELD_DEFAULTS.providerId;
  if (els.actionName) els.actionName.value = PROMPT_FIELD_DEFAULTS.actionName;
  if (els.direction) els.direction.value = PROMPT_FIELD_DEFAULTS.direction;
  if (els.coreIdentity) els.coreIdentity.value = PROMPT_FIELD_DEFAULTS.coreIdentity;
  if (els.costumePalette) els.costumePalette.value = PROMPT_FIELD_DEFAULTS.costumeAndPalette;
  if (els.silhouetteNotes) els.silhouetteNotes.value = PROMPT_FIELD_DEFAULTS.silhouetteNotes;
  if (els.cellSize) els.cellSize.value = PROMPT_FIELD_DEFAULTS.cellSize;
  if (els.backgroundColor) els.backgroundColor.value = PROMPT_FIELD_DEFAULTS.backgroundColor;
  if (els.paletteLimit) els.paletteLimit.value = PROMPT_FIELD_DEFAULTS.paletteLimit;
  if (els.footAnchor) els.footAnchor.value = `${PROMPT_FIELD_DEFAULTS.footAnchorX},${PROMPT_FIELD_DEFAULTS.footAnchorY}`;
  if (els.sheetColumns) els.sheetColumns.value = PROMPT_FIELD_DEFAULTS.outputSheetColumns;
  if (els.sheetRows) els.sheetRows.value = PROMPT_FIELD_DEFAULTS.outputSheetRows;
  updatePromptBuilderStateFromInputs();
  renderPromptBuilder();
}

async function copyPromptBuilderText() {
  const prompt = renderPromptBuilder();
  if (!prompt) return;
  try {
    await navigator.clipboard.writeText(prompt);
    addActivity('Copied prompt builder text', 'success');
  } catch {
    const els = getPromptEls();
    els.output?.select();
    if (typeof document.execCommand === 'function') {
      document.execCommand('copy');
    }
    addActivity('Copied prompt builder text', 'success');
  }
}

async function sendPromptToProvider() {
  const prompt = renderPromptBuilder();
  const els = getPromptEls();
  const providerMode = promptBuilderState.providerId || runtime.provider || 'mock';
  const referenceImage = runtime.referenceImage || null;
  const stageId = promptBuilderState.stageId || 'south_front_anchor';
  const providerLabel = providerMode === 'openai' ? 'OpenAI' : 'Mock';
  const generationStageIds = new Set([
    'south_front_anchor',
    'south_front_anchor_generation',
    'directional_anchors_nsew',
    'action_pose_board',
    'action_pose_board_generation',
  ]);
  const requestSize = generationStageIds.has(stageId)
    ? '1024x1024'
    : `${runtime.outputSettings.cellSize}x${runtime.outputSettings.cellSize}`;

  try {
    const result = providerMode === 'openai'
      ? (generationStageIds.has(stageId)
        || !referenceImage
        ? await remoteGenerate(prompt, 'openai', {
          stageId,
          size: requestSize,
          quality: 'low',
          background: 'opaque',
          label: promptBuilderState.actionName || runtime.selectedAction || 'Sprite Prompt',
        })
        : { dataUrl: await remoteEdit(prompt, referenceImage, 'openai') })
      : await (new MockImageProvider({
        width: Number(promptBuilderState.cellSize) || 512,
        height: Number(promptBuilderState.cellSize) || 512,
      })).generateImage({
        prompt,
        stageId,
        quality: 'low',
        background: 'opaque',
      });

    runtime.provider = providerMode;
    runtime.previews.live = result.dataUrl;
    runtime.previews.animation = result.dataUrl;
    runtime.previews.sidebarAnimation = result.dataUrl;
    if (!runtime.referenceImage) {
      runtime.referenceImage = result.dataUrl;
      runtime.referenceImageName = runtime.referenceImageName || `${providerMode}-prompt-result.png`;
      runtime.previews.reference = result.dataUrl;
      runtime.previews.compareRaw = result.dataUrl;
    }
    runtime.currentStage = promptBuilderState.stageId === 'south_front_anchor'
      ? 'reference'
      : promptBuilderState.stageId === 'directional_anchors_nsew'
        ? 'directional'
        : promptBuilderState.stageId === 'runtime_normalize_and_align'
          ? 'export'
          : 'animation';
    runtime.lastError = '';
    addActivity(`Sent prompt to ${providerLabel} provider`, 'success');
    await refreshPreviews();
    updateProviderBadge();
    updateCurrentStageBadge();
    updateButtonStates();
    saveRuntime();
    syncSharedState({ promptBuilder: promptBuilderState });
    if (els.status) {
      els.status.dataset.status = 'complete';
      els.status.textContent = `Sent to ${providerLabel} provider`;
    }
  } catch (error) {
    addWarning(error.message || 'Prompt send failed.', 'provider');
    await copyPromptBuilderText();
    if (els.status) {
      els.status.dataset.status = 'warning';
      els.status.textContent = 'Prompt copied for handoff';
    }
  }
}

function initializePromptBuilderControls() {
  const els = getPromptEls();
  populateSelect(els.stageSelect, getPromptTemplateOptions());
  populateSelect(els.providerSelect, getProviderOptions());

  if (els.actionChips) {
    els.actionChips.innerHTML = '';
    getActionPresetOptions().forEach((preset) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'button button-secondary';
      button.textContent = preset.label;
      button.title = preset.description;
      button.addEventListener('click', () => applyPromptPreset(preset.id));
      els.actionChips.appendChild(button);
    });
  }

  if (els.stageSelect) {
    els.stageSelect.value = promptBuilderState.stageId;
  }
  if (els.providerSelect) {
    els.providerSelect.value = promptBuilderState.providerId;
  }
}

function syncSharedState(patch = {}) {
  updateState({
    provider: runtime.provider,
    projectName: runtime.projectName,
    selectedAction: runtime.selectedAction,
    currentStage: runtime.currentStage,
    outputSettings: runtime.outputSettings,
    stageStatus: runtime.stageStatus,
    pipelineProgress: runtime.pipelineProgress,
    warnings: runtime.warnings,
    errors: runtime.lastError ? [runtime.lastError] : [],
    selectedFrameIndex: runtime.selectedFrameIndex,
    selectedStyle: getState().selectedStyle,
    referenceImageName: runtime.referenceImageName,
    referenceImageDataUrl: runtime.referenceImage,
    promptBuilder: promptBuilderState,
    ...patch
  });
}

function ensureStatus(status) {
  return ['not run', 'running', 'complete', 'warning', 'failed'].includes(status) ? status : 'not run';
}

function setBadge(id, status, text) {
  const badge = $(id);
  if (!badge) return;
  badge.dataset.status = ensureStatus(status);
  badge.textContent = text;
}

function addActivity(message, type = 'info') {
  runtime.activity.unshift({
    message,
    type,
    at: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  });
  runtime.activity = runtime.activity.slice(0, 8);
  renderActivity();
}

function addWarning(message, stage = 'validation') {
  runtime.warnings.unshift({
    message,
    stage,
    at: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  });
  runtime.warnings = runtime.warnings.slice(0, 16);
  renderWarnings();
}

function setLastError(message) {
  runtime.lastError = message || '';
  if (message) {
    addActivity(message, 'error');
  }
}

function setStageStatus(stage, status, label) {
  runtime.stageStatus[stage] = ensureStatus(status);
  const map = {
    setup: 'setupStageStatus',
    reference: 'referenceStageStatus',
    directional: 'directionalStageStatus',
    animation: 'animationStageStatus',
    aligner: 'alignerStageStatus',
    export: 'exportStageStatus'
  };
  setBadge(map[stage], status, label || runtime.stageStatus[stage]);
  updateProjectStatusBadge();
  updatePipelineProgress();
  saveRuntime();
  syncSharedState();
}

function updateProjectStatusBadge() {
  const badge = $('projectStatusBadge');
  if (!badge) return;

  if (!badge.dataset.status) {
    badge.dataset.status = runtime.running ? 'running' : 'not run';
  }
}

function setCurrentStage(stage) {
  runtime.currentStage = stage;
  setBadge('currentStageBadge', runtime.stageStatus[stage] || 'not run', `Current stage: ${stage}`);
  syncPromptBuilderStageFromPipeline(stage);
  syncSharedState();
}

function setProjectStatus(status, text) {
  setBadge('projectStatusBadge', status, text);
}

function updateProviderBadge() {
  const providerText = runtime.provider === 'mock'
    ? 'Mock provider'
    : openAIStatus === 'ready'
      ? 'OpenAI provider'
      : openAIStatus === 'missing'
        ? 'OpenAI server key missing'
        : 'OpenAI provider status unknown';
  const providerStatus = runtime.provider === 'mock' ? 'complete' : openAIStatus === 'ready' ? 'running' : openAIStatus === 'missing' ? 'missing' : 'warning';
  setBadge('providerBadge', providerStatus, providerText);
  setBadge('apiKeyStatus', runtime.provider === 'mock' ? 'connected' : openAIStatus === 'ready' ? 'connected' : openAIStatus === 'missing' ? 'missing' : 'warning', runtime.provider === 'mock' ? 'Mock mode' : openAIStatus === 'ready' ? 'OpenAI server ready' : openAIStatus === 'missing' ? 'OpenAI key missing on server' : 'OpenAI server status unknown');
}

async function refreshOpenAIStatus() {
  if (typeof fetch !== 'function') {
    openAIStatus = 'unknown';
    updateProviderBadge();
    updateButtonStates();
    return;
  }

  try {
    const response = await fetch('/health');
    if (!response.ok) {
      openAIStatus = 'unknown';
    } else {
      const data = await response.json().catch(() => null);
      openAIStatus = data?.openaiConfigured ? 'ready' : 'missing';
    }
  } catch {
    openAIStatus = 'unknown';
  }

  updateProviderBadge();
  updateButtonStates();
}

function updateCurrentStageBadge() {
  const stage = runtime.currentStage || 'setup';
  const status = runtime.stageStatus[stage] || 'not run';
  const label = stage.charAt(0).toUpperCase() + stage.slice(1);
  setBadge('currentStageBadge', status, `Current stage: ${label}`);
}

function updatePipelineProgress() {
  const statuses = STAGES.map(stage => runtime.stageStatus[stage] || 'not run');
  const weights = {
    'not run': 0,
    running: 50,
    complete: 100,
    warning: 82,
    failed: 100
  };
  const total = statuses.reduce((sum, status) => sum + (weights[status] ?? 0), 0);
  const progress = Math.max(0, Math.min(100, Math.round(total / statuses.length)));
  runtime.pipelineProgress = progress;
  const bar = $('pipelineProgressBar');
  if (bar) {
    bar.style.width = `${progress}%`;
    bar.textContent = `${progress}%`;
  }
  syncSharedState();
}

function updateInputsFromRuntime() {
  if ($('projectNameInput')) $('projectNameInput').value = runtime.projectName;
  if ($('providerSelect')) $('providerSelect').value = runtime.provider;
  if ($('cellSizeInput')) $('cellSizeInput').value = runtime.outputSettings.cellSize;
  if ($('fpsInput')) $('fpsInput').value = runtime.outputSettings.fps;
  if ($('columnsInput')) $('columnsInput').value = runtime.outputSettings.columns;
  if ($('rowsInput')) $('rowsInput').value = runtime.outputSettings.rows;
  if ($('footAnchorXInput')) $('footAnchorXInput').value = runtime.outputSettings.footAnchorX;
  if ($('footAnchorYInput')) $('footAnchorYInput').value = runtime.outputSettings.footAnchorY;
  if ($('backgroundModeSelect')) $('backgroundModeSelect').value = runtime.outputSettings.backgroundMode;
  if ($('actionSelect')) $('actionSelect').value = runtime.selectedAction;

  const promptEls = getPromptEls();
  if (promptEls.stageSelect) promptEls.stageSelect.value = promptBuilderState.stageId;
  if (promptEls.providerSelect) promptEls.providerSelect.value = promptBuilderState.providerId;
  if (promptEls.actionName) promptEls.actionName.value = promptBuilderState.actionName;
  if (promptEls.direction) promptEls.direction.value = promptBuilderState.direction;
  if (promptEls.coreIdentity) promptEls.coreIdentity.value = promptBuilderState.coreIdentity;
  if (promptEls.costumePalette) promptEls.costumePalette.value = promptBuilderState.costumeAndPalette;
  if (promptEls.silhouetteNotes) promptEls.silhouetteNotes.value = promptBuilderState.silhouetteNotes;
  if (promptEls.cellSize) promptEls.cellSize.value = promptBuilderState.cellSize;
  if (promptEls.backgroundColor) promptEls.backgroundColor.value = promptBuilderState.backgroundColor;
  if (promptEls.paletteLimit) promptEls.paletteLimit.value = promptBuilderState.paletteLimit;
  if (promptEls.footAnchor) promptEls.footAnchor.value = `${promptBuilderState.footAnchorX},${promptBuilderState.footAnchorY}`;
  if (promptEls.sheetColumns) promptEls.sheetColumns.value = promptBuilderState.outputSheetColumns;
  if (promptEls.sheetRows) promptEls.sheetRows.value = promptBuilderState.outputSheetRows;
  renderPromptBuilder();
}

function fitImage(ctx, img, x, y, width, height) {
  const ratio = Math.min(width / img.width, height / img.height);
  const w = img.width * ratio;
  const h = img.height * ratio;
  const offsetX = x + (width - w) / 2;
  const offsetY = y + (height - h) / 2;
  ctx.drawImage(img, offsetX, offsetY, w, h);
}

function drawCheckerboard(ctx, width, height) {
  ctx.fillStyle = '#0f172a';
  ctx.fillRect(0, 0, width, height);
  for (let y = 0; y < height; y += 20) {
    for (let x = 0; x < width; x += 20) {
      ctx.fillStyle = (x / 20 + y / 20) % 2 === 0 ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.02)';
      ctx.fillRect(x, y, 20, 20);
    }
  }
}

function drawTitle(ctx, title, subtitle, width) {
  ctx.fillStyle = 'rgba(2, 6, 23, 0.72)';
  ctx.fillRect(0, 0, width, 54);
  ctx.fillStyle = '#e2e8f0';
  ctx.font = '700 20px "Inter", sans-serif';
  ctx.fillText(title, 18, 22);
  ctx.fillStyle = '#94a3b8';
  ctx.font = '500 12px "Inter", sans-serif';
  ctx.fillText(subtitle, 18, 40);
}

async function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

async function makePreview({
  source,
  width = 640,
  height = 480,
  title = 'Preview',
  subtitle = '',
  anchor = null,
  backgroundMode = runtime.outputSettings.backgroundMode,
  footer = ''
}) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');

  if (backgroundMode === 'chroma-green') {
    ctx.fillStyle = '#00FF00';
    ctx.fillRect(0, 0, width, height);
  } else {
    drawCheckerboard(ctx, width, height);
  }

  if (source) {
    try {
      const img = await loadImage(source);
      fitImage(ctx, img, 18, 54, width - 36, height - 90);
    } catch {
      ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
      ctx.fillRect(18, 54, width - 36, height - 90);
    }
  }

  if (anchor) {
    ctx.save();
    ctx.strokeStyle = 'rgba(251, 191, 36, 0.95)';
    ctx.fillStyle = 'rgba(251, 191, 36, 0.95)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(anchor.x, anchor.y, 7, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(anchor.x - 12, anchor.y);
    ctx.lineTo(anchor.x + 12, anchor.y);
    ctx.moveTo(anchor.x, anchor.y - 12);
    ctx.lineTo(anchor.x, anchor.y + 12);
    ctx.stroke();
    ctx.restore();
  }

  drawTitle(ctx, title, subtitle, width);

  if (footer) {
    ctx.fillStyle = 'rgba(2, 6, 23, 0.82)';
    ctx.fillRect(0, height - 34, width, 34);
    ctx.fillStyle = '#cbd5e1';
    ctx.font = '600 12px "Inter", sans-serif';
    ctx.fillText(footer, 18, height - 14);
  }

  return canvas.toDataURL('image/png');
}

async function makePlaceholder(label, accent, width = 640, height = 480) {
  const [dark, light] = accent;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');

  const gradient = ctx.createLinearGradient(0, 0, width, height);
  gradient.addColorStop(0, dark);
  gradient.addColorStop(1, light);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);

  ctx.fillStyle = 'rgba(255,255,255,0.08)';
  for (let i = -height; i < width; i += 24) {
    ctx.fillRect(i, 0, 10, height);
  }
  ctx.fillStyle = 'rgba(2, 6, 23, 0.55)';
  ctx.fillRect(18, 18, width - 36, height - 36);

  ctx.fillStyle = '#e2e8f0';
  ctx.font = '800 28px "Space Grotesk", "Inter", sans-serif';
  ctx.fillText(label, 30, 72);
  ctx.fillStyle = '#cbd5e1';
  ctx.font = '500 14px "Inter", sans-serif';
  ctx.fillText('Mock preview generated by SpriteForge Dashboard', 30, 96);
  ctx.fillStyle = 'rgba(255,255,255,0.12)';
  ctx.fillRect(30, height - 88, width - 60, 2);

  return canvas.toDataURL('image/png');
}

function getAnchorPoint() {
  return {
    x: runtime.outputSettings.footAnchorX || 128,
    y: runtime.outputSettings.footAnchorY || 255
  };
}

function getHasApiKey() {
  return openAIStatus === 'ready';
}

function shouldRequireOpenAI() {
  return runtime.provider === 'openai';
}

function canUseOpenAI() {
  return !shouldRequireOpenAI() || getHasApiKey();
}

function canRunReferenceStage() {
  return !!runtime.referenceImage || runtime.provider === 'mock';
}

function canRunAnimationStage() {
  return !!runtime.referenceImage && !!runtime.selectedAction;
}

function showMissingOpenAIKeyMessage(stageLabel = 'this action') {
  const message = `OpenAI mode is selected but the server-side OPENAI_API_KEY is not configured. Switch to Mock mode or set OPENAI_API_KEY before ${stageLabel}.`;
  setLastError(message);
  addWarning(message, 'provider');
  return message;
}

function frameCount() {
  return Math.max(4, Math.min(runtime.outputSettings.columns * runtime.outputSettings.rows, 16));
}

function updateSharedSettingsFromInputs() {
  runtime.projectName = $('projectNameInput')?.value?.trim() || 'Untitled Project';
  runtime.provider = $('providerSelect')?.value || 'mock';
  runtime.outputSettings = {
    cellSize: Number($('cellSizeInput')?.value || 256),
    fps: Number($('fpsInput')?.value || 12),
    columns: Number($('columnsInput')?.value || 5),
    rows: Number($('rowsInput')?.value || 2),
    footAnchorX: Number($('footAnchorXInput')?.value || 128),
    footAnchorY: Number($('footAnchorYInput')?.value || 255),
    backgroundMode: $('backgroundModeSelect')?.value || 'chroma-green'
  };
  runtime.selectedAction = $('actionSelect')?.value || 'idle';
  updateProviderBadge();
  updateCurrentStageBadge();
  saveRuntime();
  syncSharedState();
}

function renderWarnings() {
  const container = $('validationWarningsList');
  if (!container) return;
  container.innerHTML = '';

  if (!runtime.warnings.length) {
    container.innerHTML = '<div class="notice info"><div class="notice-title">No active warnings</div><div class="muted text-sm">Validation messages will appear here when something needs attention.</div></div>';
    return;
  }

  for (const warning of runtime.warnings) {
    const node = document.createElement('div');
    node.className = 'notice warning';
    node.innerHTML = `
      <div class="notice-title">${escapeHtml(warning.stage)} warning</div>
      <div class="muted text-sm">${escapeHtml(warning.message)}</div>
      <div class="muted text-xs mt-2">${escapeHtml(warning.at)}</div>
    `;
    container.appendChild(node);
  }
}

function renderActivity() {
  const container = $('activityFeed');
  if (!container) return;
  container.innerHTML = '';

  if (!runtime.activity.length) {
    container.innerHTML = '<div class="notice info"><div class="notice-title">Waiting for the first action</div><div class="muted text-sm">Use the buttons on the left to start the pipeline.</div></div>';
    return;
  }

  for (const entry of runtime.activity) {
    const node = document.createElement('div');
    node.className = `notice ${entry.type === 'error' ? 'error' : entry.type === 'success' ? 'success' : 'info'}`;
    node.innerHTML = `
      <div class="notice-title">${escapeHtml(entry.at)}</div>
      <div class="muted text-sm">${escapeHtml(entry.message)}</div>
    `;
    container.appendChild(node);
  }
}

function escapeHtml(text) {
  return String(text)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function setImage(id, src, fallbackLabel) {
  const el = $(id);
  if (!el) return;
  el.src = src || '';
  el.alt = fallbackLabel || el.alt || '';
}

async function refreshPreviews() {
  const fallbackReference = await makePlaceholder('Reference Placeholder', PLACEHOLDER_COLORS.reference);
  const fallbackAnchor = await makePlaceholder('Anchor Placeholder', PLACEHOLDER_COLORS.anchor);
  const fallbackDirection = await makePlaceholder('Direction Grid', PLACEHOLDER_COLORS.direction);
  const fallbackAnimation = await makePlaceholder('Animation Preview', PLACEHOLDER_COLORS.animation);
  const fallbackSheet = await makePlaceholder('Spritesheet Preview', PLACEHOLDER_COLORS.sheet);
  const fallbackLive = await makePlaceholder('Live Frame', PLACEHOLDER_COLORS.live);

  const referenceSrc = runtime.referenceImage || fallbackReference;
  const anchorSrc = runtime.previews.anchor || fallbackAnchor;
  const compareRawSrc = runtime.previews.compareRaw || referenceSrc;
  const compareSnappedSrc = runtime.previews.compareSnapped || anchorSrc;
  const directionSrc = runtime.previews.direction || fallbackDirection;
  const animationSrc = runtime.previews.animation || fallbackAnimation;
  const liveSrc = runtime.previews.live || fallbackLive;
  const sheetSrc = runtime.previews.sheet || fallbackSheet;

  setImage('referencePreview', referenceSrc, 'Reference preview');
  setImage('sidebarReferencePreview', referenceSrc, 'Sidebar reference preview');
  setImage('anchorPreview', anchorSrc, 'Anchor preview');
  setImage('sidebarAnchorPreview', anchorSrc, 'Sidebar anchor preview');
  setImage('compareRawPreview', compareRawSrc, 'Raw preview');
  setImage('compareSnappedPreview', compareSnappedSrc, 'Snapped preview');
  setImage('directionGridPreview', directionSrc, 'Direction grid preview');
  setImage('animationPreview', animationSrc, 'Animation preview');
  setImage('sidebarAnimationPreview', runtime.previews.sidebarAnimation || animationSrc, 'Sidebar animation preview');
  setImage('livePreview', liveSrc, 'Live preview');
  setImage('sheetPreview', sheetSrc, 'Spritesheet preview');
}

function renderFrameStrip() {
  const strip = $('frameThumbStrip');
  if (!strip) return;

  strip.innerHTML = '';

  if (!runtime.frames.length) {
    const empty = document.createElement('div');
    empty.className = 'notice info';
    empty.style.gridColumn = '1 / -1';
    empty.innerHTML = '<div class="notice-title">No frames yet</div><div class="muted text-sm">Generate a pose board or run the mock demo to populate frame thumbnails.</div>';
    strip.appendChild(empty);
    return;
  }

  runtime.frames.forEach((frame, index) => {
    const card = document.createElement('button');
    card.type = 'button';
    card.className = `frame-thumb ${runtime.selectedFrameIndex === index ? 'is-selected' : ''}`;
    card.innerHTML = `
      <img src="${frame.imageUrl}" alt="${escapeHtml(frame.label)}" />
      <div class="text-left">
        <div class="text-sm font-semibold text-slate-100">${escapeHtml(frame.label)}</div>
        <small>x:${frame.offsetX || 0} y:${frame.offsetY || 0}</small>
      </div>
    `;
    card.addEventListener('click', () => selectFrame(index));
    strip.appendChild(card);
  });
}

function updateSelectedFrameMeta() {
  const badge = $('selectedFrameBadge');
  const offset = $('selectedFrameOffset');
  const frame = runtime.frames[runtime.selectedFrameIndex];
  if (!frame) {
    if (badge) {
      badge.dataset.status = 'not run';
      badge.textContent = 'No frame selected';
    }
    if (offset) offset.textContent = 'Offset: 0, 0';
    return;
  }
  if (badge) {
    badge.dataset.status = 'complete';
    badge.textContent = `Selected: ${frame.label}`;
  }
  if (offset) offset.textContent = `Offset: ${frame.offsetX || 0}, ${frame.offsetY || 0}`;
}

function selectFrame(index) {
  runtime.selectedFrameIndex = index;
  updateSelectedFrameMeta();
  renderFrameStrip();
  setCurrentStage('aligner');
  setStageStatus('aligner', 'complete', 'Frame selected');
  syncSharedState();
  refreshLivePreview();
  addActivity(`Selected frame ${index + 1}`, 'info');
}

function updateFrameOffsets(partial) {
  const frame = runtime.frames[runtime.selectedFrameIndex];
  if (!frame) return;
  setCurrentStage('aligner');
  runtime.frames[runtime.selectedFrameIndex] = {
    ...frame,
    offsetX: (frame.offsetX || 0) + (partial.offsetX || 0),
    offsetY: (frame.offsetY || 0) + (partial.offsetY || 0)
  };
  runtime.frameOffsets[runtime.selectedFrameIndex] = {
    offsetX: runtime.frames[runtime.selectedFrameIndex].offsetX || 0,
    offsetY: runtime.frames[runtime.selectedFrameIndex].offsetY || 0
  };
  updateSelectedFrameMeta();
  renderFrameStrip();
  refreshLivePreview();
  setStageStatus('aligner', 'complete', 'Offsets adjusted');
  saveRuntime();
  syncSharedState();
}

function resetSelectedFrame() {
  const frame = runtime.frames[runtime.selectedFrameIndex];
  if (!frame) return;
  setCurrentStage('aligner');
  frame.offsetX = 0;
  frame.offsetY = 0;
  runtime.frameOffsets[runtime.selectedFrameIndex] = { offsetX: 0, offsetY: 0 };
  updateSelectedFrameMeta();
  renderFrameStrip();
  refreshLivePreview();
  setStageStatus('aligner', 'complete', 'Frame reset');
  addActivity(`Reset frame ${runtime.selectedFrameIndex + 1}`, 'info');
}

function applyOffsetToAllFrames() {
  const frame = runtime.frames[runtime.selectedFrameIndex];
  if (!frame) return;
  setCurrentStage('aligner');
  const offsetX = frame.offsetX || 0;
  const offsetY = frame.offsetY || 0;
  runtime.frames = runtime.frames.map(item => ({ ...item, offsetX, offsetY }));
  runtime.frameOffsets = runtime.frames.map(() => ({ offsetX, offsetY }));
  renderFrameStrip();
  refreshLivePreview();
  setStageStatus('aligner', 'complete', 'Offsets applied');
  addActivity(`Applied ${offsetX}, ${offsetY} to all frames`, 'success');
  saveRuntime();
  syncSharedState();
}

async function refreshLivePreview() {
  const frame = runtime.frames[runtime.selectedFrameIndex];
  if (!frame) {
    await refreshPreviews();
    return;
  }
  const preview = await makePreview({
    source: frame.imageUrl,
    title: `Live Preview - ${frame.label}`,
    subtitle: `Offset ${frame.offsetX || 0}, ${frame.offsetY || 0}`,
    footer: `Action ${runtime.selectedAction} | FPS ${runtime.outputSettings.fps}`
  });
  runtime.previews.live = preview;
  setImage('livePreview', preview, 'Live preview');
  saveRuntime();
}

async function renderPlaceholderPreview(key, label, footer = '') {
  const preview = await makePlaceholder(label, PLACEHOLDER_COLORS[key]);
  runtime.previews[key] = preview;
  if (key === 'animation') runtime.previews.sidebarAnimation = preview;
  if (key === 'sheet') runtime.previews.sheet = preview;
  if (key === 'live') runtime.previews.live = preview;
  if (footer) {
    const withDetail = await makePreview({ source: preview, title: label, subtitle: footer, footer });
    runtime.previews[key] = withDetail;
  }
  saveRuntime();
}

function makeGridFrameImage(label, index, baseSource) {
  return makePreview({
    source: baseSource,
    title: `${label} #${String(index + 1).padStart(2, '0')}`,
    subtitle: `${runtime.selectedAction} frame`,
    anchor: getAnchorPoint(),
    footer: `Cell ${runtime.outputSettings.cellSize}px`
  });
}

async function createFrameSet({ baseSource, count, labelPrefix }) {
  const frames = [];
  for (let i = 0; i < count; i += 1) {
    const frameSource = await makeGridFrameImage(labelPrefix, i, baseSource);
    frames.push({
      id: `${runtime.selectedAction}-${i}`,
      label: `${labelPrefix} ${String(i + 1).padStart(2, '0')}`,
      imageUrl: frameSource,
      offsetX: 0,
      offsetY: 0
    });
  }
  runtime.frames = frames;
  runtime.frameOffsets = frames.map(() => ({ offsetX: 0, offsetY: 0 }));
  runtime.selectedFrameIndex = frames.length ? 0 : -1;
  renderFrameStrip();
  updateSelectedFrameMeta();
  await refreshLivePreview();
  saveRuntime();
  syncSharedState();
}

async function generateMockSheet() {
  const canvas = document.createElement('canvas');
  canvas.width = runtime.outputSettings.columns * runtime.outputSettings.cellSize;
  canvas.height = runtime.outputSettings.rows * runtime.outputSettings.cellSize;
  const ctx = canvas.getContext('2d');
  if (runtime.outputSettings.backgroundMode === 'chroma-green') {
    ctx.fillStyle = '#00FF00';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  } else {
    drawCheckerboard(ctx, canvas.width, canvas.height);
  }

  for (let i = 0; i < runtime.frames.length; i += 1) {
    const frame = runtime.frames[i];
    try {
      const img = await loadImage(frame.imageUrl);
      const col = i % runtime.outputSettings.columns;
      const row = Math.floor(i / runtime.outputSettings.columns);
      const x = col * runtime.outputSettings.cellSize;
      const y = row * runtime.outputSettings.cellSize;
      ctx.drawImage(img, x, y, runtime.outputSettings.cellSize, runtime.outputSettings.cellSize);
      ctx.strokeStyle = 'rgba(255,255,255,0.10)';
      ctx.strokeRect(x + 0.5, y + 0.5, runtime.outputSettings.cellSize - 1, runtime.outputSettings.cellSize - 1);
    } catch {
      // keep placeholder cell blank
    }
  }

  ctx.fillStyle = 'rgba(2, 6, 23, 0.78)';
  ctx.fillRect(0, canvas.height - 30, canvas.width, 30);
  ctx.fillStyle = '#dbeafe';
  ctx.font = '600 12px "Inter", sans-serif';
  ctx.fillText(`${runtime.projectName} | ${runtime.selectedAction} | ${runtime.frames.length} frames`, 16, canvas.height - 11);

  runtime.previews.sheet = canvas.toDataURL('image/png');
  setImage('sheetPreview', runtime.previews.sheet, 'Spritesheet preview');
  saveRuntime();
}

function collectValidationWarnings() {
  const warnings = [];
  if (runtime.provider !== 'openai' && !runtime.referenceImage) warnings.push('Upload a reference image before running anchor or animation stages.');
  if (!runtime.selectedAction) warnings.push('Choose an action in the Animation Builder.');
  if (!runtime.frames.length) warnings.push('No animation frames are available yet.');
  if (runtime.outputSettings.footAnchorX < 0 || runtime.outputSettings.footAnchorY < 0) warnings.push('Foot anchor coordinates must be positive.');
  if (runtime.outputSettings.columns * runtime.outputSettings.rows < runtime.frames.length) warnings.push('Sheet dimensions are smaller than the generated frame count.');
  if (runtime.provider === 'openai' && openAIStatus === 'missing') warnings.push('OpenAI mode is selected but the server-side OPENAI_API_KEY is missing.');
  return warnings;
}

function renderValidationSnapshot() {
  runtime.validationReport = {
    projectName: runtime.projectName,
    provider: runtime.provider,
    action: runtime.selectedAction,
    outputSettings: runtime.outputSettings,
    stageStatus: runtime.stageStatus,
    warnings: collectValidationWarnings(),
    frameCount: runtime.frames.length,
    updatedAt: new Date().toISOString()
  };
  const qcWarnings = runtime.validationReport.warnings.map(message => ({
    message,
    stage: 'qc',
    at: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  }));
  runtime.warnings = [...qcWarnings, ...runtime.warnings.filter(item => item.stage !== 'qc')];
  runtime.warnings = runtime.warnings.slice(0, 16);
  renderWarnings();
  saveRuntime();
  syncSharedState();
  return runtime.validationReport;
}

function updateButtonStates() {
  const hasReference = !!runtime.referenceImage;
  const hasAnchor = !!runtime.previews.anchor;
  const hasDirectional = !!runtime.previews.direction;
  const hasGenerationSource = hasReference || hasAnchor || hasDirectional || !!runtime.poseBoard;
  const hasFrames = runtime.frames.length > 0;
  const hasSelectedFrame = runtime.selectedFrameIndex >= 0 && !!runtime.frames[runtime.selectedFrameIndex];
  const hasAction = !!runtime.selectedAction;

  const disable = {
    generateSouthAnchorBtn: runtime.provider === 'openai' ? false : !hasReference,
    pixelSnapAnchorBtn: !hasGenerationSource,
    validateAnchorBtn: !hasGenerationSource,
    downloadAnchorBtn: !runtime.previews.anchor,
    compareRawSnappedBtn: !hasGenerationSource,
    generateDirectionsBtn: runtime.provider === 'openai' ? false : !hasGenerationSource,
    snapDirectionsBtn: !hasGenerationSource,
    validateDirectionsBtn: !runtime.previews.direction,
    previewDirectionGridBtn: !hasGenerationSource,
    generatePoseBoardBtn: runtime.provider === 'openai' ? !hasAction : (!hasGenerationSource || !hasAction),
    recoverFramesBtn: !runtime.poseBoard && !hasFrames,
    pixelSnapFramesBtn: !hasFrames,
    cleanBackgroundBtn: !hasFrames,
    normalizeRuntimeSheetBtn: !hasFrames,
    validateAnimationBtn: !hasFrames,
    previewAnimationBtn: !hasFrames,
    nudgeLeft1Btn: !hasSelectedFrame,
    nudgeRight1Btn: !hasSelectedFrame,
    nudgeUp1Btn: !hasSelectedFrame,
    nudgeDown1Btn: !hasSelectedFrame,
    nudgeLeft5Btn: !hasSelectedFrame,
    nudgeRight5Btn: !hasSelectedFrame,
    nudgeUp5Btn: !hasSelectedFrame,
    nudgeDown5Btn: !hasSelectedFrame,
    resetFrameBtn: !hasSelectedFrame,
    applyOffsetToAllBtn: !hasSelectedFrame,
    exportSpritesheetBtn: !hasFrames,
    exportManifestBtn: !hasFrames,
    exportGifBtn: !hasFrames,
    exportZipBtn: !hasFrames,
    exportReportBtn: !runtime.validationReport,
    runFullPipelineBtn: runtime.provider === 'openai' ? false : !hasReference,
    runCurrentStageBtn: false,
    runQcValidationBtn: false,
    runMockDemoBtn: false,
    uploadReferenceBtn: false,
    loadProjectBtn: false,
    newProjectBtn: false,
    saveProjectBtn: false,
    resetProjectBtn: false
  };

  Object.entries(disable).forEach(([id, isDisabled]) => {
    const el = $(id);
    if (el) el.disabled = !!isDisabled;
  });
}

function updateTopBadges() {
  setProjectStatus(
    runtime.warnings.length ? 'warning' : runtime.running ? 'running' : 'complete',
    runtime.running ? 'Pipeline running' : runtime.warnings.length ? 'Warnings present' : 'Project ready'
  );
  updateProviderBadge();
  updateCurrentStageBadge();
}

function refreshEverything() {
  updateInputsFromRuntime();
  updateTopBadges();
  renderWarnings();
  renderActivity();
  renderFrameStrip();
  updateSelectedFrameMeta();
  updateButtonStates();
  updatePipelineProgress();
}

async function uploadReferenceFromFile(file) {
  if (!file) return;

  const reader = new FileReader();
  const dataUrl = await new Promise((resolve, reject) => {
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });

  runtime.referenceImage = dataUrl;
  runtime.referenceImageName = file.name;
  runtime.previews.reference = dataUrl;
  runtime.previews.compareRaw = dataUrl;
  addActivity(`Loaded reference image: ${file.name}`, 'success');
  runtime.currentStage = 'reference';
  setStageStatus('reference', 'complete', 'Reference loaded');
  updateButtonStates();
  await refreshPreviews();
  saveRuntime();
  syncSharedState({ uploadedImageUrl: dataUrl, uploadedImage: file });
}

async function generateSouthAnchor() {
  setCurrentStage('reference');
  setStageStatus('reference', 'running', 'Generating south anchor');
  addActivity('Generating south anchor', 'info');
  try {
    const anchorPoint = getAnchorPoint();
    if (runtime.provider === 'openai') {
      const prompt = buildProductionPrompt('south_front_anchor');
      const result = await remoteGenerate(prompt, 'openai', {
        stageId: 'south_front_anchor_generation',
        size: '1024x1024',
        quality: 'low',
        background: 'opaque',
        label: 'South / Front Anchor',
      });

      runtime.previews.anchor = result.dataUrl;
      runtime.previews.compareSnapped = result.dataUrl;
      runtime.previews.compareRaw = runtime.referenceImage || result.dataUrl;
      runtime.previews.sidebarAnimation = result.dataUrl;
      if (!runtime.referenceImage) {
        runtime.referenceImage = result.dataUrl;
        runtime.referenceImageName = runtime.referenceImageName || 'openai-south-anchor.png';
        runtime.previews.reference = result.dataUrl;
      }
      runtime.lastError = '';
      await refreshPreviews();
    } else {
      await sleep(350);
      runtime.previews.anchor = await makePreview({
        source: runtime.referenceImage,
        title: 'South Anchor',
        subtitle: runtime.referenceImageName || 'Reference image',
        anchor: anchorPoint,
        footer: `Foot anchor ${anchorPoint.x}, ${anchorPoint.y}`
      });
      runtime.previews.compareSnapped = runtime.previews.anchor;
      runtime.previews.compareRaw = runtime.referenceImage || runtime.previews.compareRaw;
      runtime.previews.sidebarAnimation = runtime.previews.anchor;
      await refreshPreviews();
    }
    setStageStatus('reference', 'complete', 'South anchor ready');
    addActivity('South anchor generated', 'success');
  } catch (error) {
    setLastError(error.message || 'South anchor generation failed');
    setStageStatus('reference', 'failed', 'South anchor failed');
    addActivity(error.message || 'South anchor generation failed', 'error');
  }
  updateButtonStates();
}

async function pixelSnapAnchor() {
  const source = runtime.referenceImage || runtime.previews.anchor;
  if (!source) return;
  setCurrentStage('reference');
  setStageStatus('reference', 'running', 'Pixel snapping anchor');
  await sleep(220);
  runtime.previews.anchor = await makePreview({
    source,
    title: 'Snapped South Anchor',
    subtitle: 'Aligned to output grid',
    anchor: getAnchorPoint(),
    footer: `${runtime.outputSettings.cellSize}px cells`
  });
  runtime.previews.compareSnapped = runtime.previews.anchor;
  await refreshPreviews();
  setStageStatus('reference', 'complete', 'Anchor snapped');
  addActivity('Pixel snap applied to anchor', 'success');
  updateButtonStates();
}

function validateAnchor() {
  const warnings = [];
  if (!runtime.referenceImage) warnings.push('Reference image is missing.');
  if (runtime.outputSettings.footAnchorX < 0 || runtime.outputSettings.footAnchorY < 0) warnings.push('Foot anchor coordinates must be positive.');
  if (runtime.outputSettings.footAnchorX > runtime.outputSettings.cellSize || runtime.outputSettings.footAnchorY > runtime.outputSettings.cellSize * 2) warnings.push('Anchor is outside the expected sprite bounds.');
  if (warnings.length) {
    warnings.forEach(msg => addWarning(msg, 'anchor'));
    setStageStatus('reference', 'warning', 'Anchor warnings');
    addActivity('Anchor validation produced warnings', 'warning');
  } else {
    setStageStatus('reference', 'complete', 'Anchor validated');
    addActivity('Anchor validation passed', 'success');
  }
  updateButtonStates();
}

async function downloadAnchor() {
  if (!runtime.previews.anchor) return;
  const blob = await fetch(runtime.previews.anchor).then(r => r.blob());
  downloadBlob(blob, `${slugify(runtime.projectName)}-anchor.png`);
  addActivity('Downloaded anchor preview', 'success');
}

async function compareRawVsSnapped() {
  const rawSource = runtime.referenceImage || runtime.previews.anchor;
  if (!rawSource) return;
  runtime.previews.compareRaw = rawSource;
  if (!runtime.previews.anchor) {
    runtime.previews.compareSnapped = await makePreview({
      source: rawSource,
      title: 'Snapped',
      subtitle: 'Awaiting anchor generation',
      anchor: getAnchorPoint(),
      footer: 'Comparison preview'
    });
  } else {
    runtime.previews.compareSnapped = runtime.previews.anchor;
  }
  await refreshPreviews();
  addActivity('Updated raw vs snapped comparison', 'info');
}

async function generateDirectionalAnchors() {
  setCurrentStage('directional');
  setStageStatus('directional', 'running', 'Generating NSEW anchors');
  try {
    if (runtime.provider === 'openai') {
      const prompt = buildProductionPrompt('directional_anchors_nsew');
      const result = await remoteGenerate(prompt, 'openai', {
        stageId: 'directional_anchors_nsew',
        size: '1024x1024',
        quality: 'low',
        background: 'opaque',
        label: 'Directional Anchors NSEW',
      });

      runtime.previews.direction = result.dataUrl;
      runtime.previews.sidebarAnimation = result.dataUrl;
      if (!runtime.referenceImage && runtime.previews.anchor) {
        runtime.referenceImage = runtime.previews.anchor;
      }
      runtime.lastError = '';
      await refreshPreviews();
    } else {
      await sleep(300);
      runtime.previews.direction = await makePreview({
        source: runtime.referenceImage,
        title: 'NSEW Direction Grid',
        subtitle: 'North, South, East, West anchor validation',
        anchor: getAnchorPoint(),
        footer: `Action ${runtime.selectedAction}`
      });
      await refreshPreviews();
    }
    setStageStatus('directional', 'complete', 'Directional anchors ready');
    addActivity('Directional anchors generated', 'success');
  } catch (error) {
    setLastError(error.message || 'Directional anchor generation failed');
    setStageStatus('directional', 'failed', 'Directional anchors failed');
    addActivity(error.message || 'Directional anchor generation failed', 'error');
  }
  updateButtonStates();
}

async function snapDirectionalAnchors() {
  if (!runtime.referenceImage) return;
  setCurrentStage('directional');
  setStageStatus('directional', 'running', 'Pixel snapping directions');
  await sleep(220);
  runtime.previews.direction = await makePreview({
    source: runtime.referenceImage,
    title: 'Snapped Direction Grid',
    subtitle: 'Grid-aligned direction anchors',
    anchor: getAnchorPoint(),
    footer: `Cell size ${runtime.outputSettings.cellSize}px`
  });
  await refreshPreviews();
  setStageStatus('directional', 'complete', 'Directions snapped');
  addActivity('Directional anchors pixel-snapped', 'success');
}

function validateDirectionalAnchors() {
  if (!runtime.previews.direction) {
    addWarning('Generate directional anchors before validating them.', 'directional');
    setStageStatus('directional', 'warning', 'Directional warnings');
  } else {
    setStageStatus('directional', 'complete', 'Directions validated');
    addActivity('Directional validation passed', 'success');
  }
  updateButtonStates();
}

async function previewDirectionGrid() {
  const source = runtime.referenceImage || runtime.previews.anchor || runtime.previews.direction;
  if (!source) return;
  runtime.previews.direction = await makePreview({
    source,
    title: 'Preview Direction Grid',
    subtitle: 'NSEW anchor visualizer',
    anchor: getAnchorPoint(),
    footer: 'Directional anchor preview'
  });
  await refreshPreviews();
  addActivity('Direction grid preview refreshed', 'info');
}

async function generatePoseBoard() {
  if (!runtime.selectedAction) {
    setLastError('Choose an action before generating a pose board.');
    return;
  }
  setCurrentStage('animation');
  setStageStatus('animation', 'running', `Generating ${runtime.selectedAction} pose board`);
  addActivity(`Generating pose board for ${runtime.selectedAction}`, 'info');
  try {
    if (runtime.provider === 'openai') {
      const prompt = buildProductionPrompt('action_pose_board', { actionName: runtime.selectedAction });
      const result = await remoteGenerate(prompt, 'openai', {
        stageId: 'action_pose_board_generation',
        size: '1024x1024',
        quality: 'low',
        background: 'opaque',
        label: `Pose Board - ${runtime.selectedAction}`,
      });

      runtime.poseBoard = result.dataUrl;
      runtime.previews.animation = result.dataUrl;
      runtime.previews.sidebarAnimation = result.dataUrl;
      if (!runtime.referenceImage) {
        runtime.referenceImage = runtime.previews.anchor || result.dataUrl;
      }
      runtime.lastError = '';
      await createFrameSet({ baseSource: runtime.poseBoard, count: frameCount(), labelPrefix: runtime.selectedAction });
      await generateMockSheet();
      await refreshPreviews();
    } else {
      await sleep(350);
      runtime.poseBoard = await makePreview({
        source: runtime.referenceImage,
        title: `Pose Board - ${runtime.selectedAction}`,
        subtitle: `Cell ${runtime.outputSettings.cellSize}px`,
        anchor: getAnchorPoint(),
        footer: `${runtime.outputSettings.columns}x${runtime.outputSettings.rows}`
      });
      const source = runtime.poseBoard || runtime.referenceImage;
      await createFrameSet({ baseSource: source, count: frameCount(), labelPrefix: runtime.selectedAction });
      runtime.previews.animation = runtime.poseBoard;
      runtime.previews.sidebarAnimation = runtime.poseBoard;
      await generateMockSheet();
      await refreshPreviews();
    }
    setStageStatus('animation', 'complete', 'Pose board ready');
    addActivity('Pose board generated', 'success');
  } catch (error) {
    setLastError(error.message || 'Pose board generation failed');
    setStageStatus('animation', 'failed', 'Pose board failed');
    addActivity(error.message || 'Pose board generation failed', 'error');
  }
  updateButtonStates();
}

async function recoverFrames() {
  if (!runtime.poseBoard && !runtime.referenceImage) return;
  setCurrentStage('animation');
  setStageStatus('animation', 'running', 'Recovering frames');
  await sleep(220);
  const base = runtime.poseBoard || runtime.referenceImage;
  await createFrameSet({ baseSource: base, count: frameCount(), labelPrefix: runtime.selectedAction });
  setStageStatus('animation', 'complete', 'Frames recovered');
  addActivity('Frames recovered from pose board', 'success');
}

async function pixelSnapFrames() {
  if (!runtime.frames.length) return;
  setCurrentStage('animation');
  setStageStatus('animation', 'running', 'Snapping frames');
  await sleep(220);
  runtime.frames = await Promise.all(runtime.frames.map(async (frame, index) => ({
    ...frame,
    imageUrl: await makePreview({
      source: frame.imageUrl,
      title: `${frame.label} snapped`,
      subtitle: `Frame ${index + 1}`,
      anchor: getAnchorPoint(),
      footer: 'Pixel-snap pass'
    })
  })));
  runtime.previews.animation = runtime.frames[0]?.imageUrl || runtime.previews.animation;
  runtime.previews.sidebarAnimation = runtime.previews.animation;
  runtime.frameOffsets = runtime.frames.map(frame => ({ offsetX: frame.offsetX || 0, offsetY: frame.offsetY || 0 }));
  renderFrameStrip();
  await generateMockSheet();
  await refreshLivePreview();
  await refreshPreviews();
  setStageStatus('animation', 'complete', 'Frames snapped');
  addActivity('Animation frames pixel-snapped', 'success');
}

async function cleanBackground() {
  if (!runtime.frames.length) return;
  setCurrentStage('animation');
  setStageStatus('animation', 'running', 'Cleaning background');
  await sleep(180);
  runtime.frames = await Promise.all(runtime.frames.map(async (frame, index) => ({
    ...frame,
    imageUrl: await makePreview({
      source: frame.imageUrl,
      title: `${frame.label} clean`,
      subtitle: runtime.outputSettings.backgroundMode === 'chroma-green' ? 'Chroma key ready' : 'Transparent export',
      anchor: getAnchorPoint(),
      backgroundMode: runtime.outputSettings.backgroundMode === 'chroma-green' ? 'chroma-green' : 'transparent',
      footer: `Frame ${index + 1}`
    })
  })));
  runtime.previews.animation = runtime.frames[0]?.imageUrl || runtime.previews.animation;
  renderFrameStrip();
  await generateMockSheet();
  await refreshLivePreview();
  await refreshPreviews();
  setStageStatus('animation', 'complete', 'Background cleaned');
  addActivity('Background cleaned for animation frames', 'success');
}

async function normalizeRuntimeSheet() {
  if (!runtime.frames.length) return;
  setCurrentStage('animation');
  setStageStatus('animation', 'running', 'Normalizing sheet');
  await sleep(220);
  await generateMockSheet();
  await refreshPreviews();
  setStageStatus('animation', 'complete', 'Runtime sheet normalized');
  addActivity('Runtime sheet normalized', 'success');
}

function validateAnimation() {
  if (!runtime.frames.length) {
    addWarning('No frames available for animation validation.', 'animation');
    setStageStatus('animation', 'warning', 'Animation warnings');
  } else if (runtime.frames.length < 4) {
    addWarning('Animation frame count is low. Consider generating more frames.', 'animation');
    setStageStatus('animation', 'warning', 'Low frame count');
  } else {
    setStageStatus('animation', 'complete', 'Animation validated');
    addActivity('Animation validation passed', 'success');
  }
  renderValidationSnapshot();
  updateButtonStates();
}

async function previewAnimation() {
  if (!runtime.frames.length) return;
  if (animationTimer) clearInterval(animationTimer);
  animationCycleIndex = 0;
  runtime.previews.animation = runtime.frames[0].imageUrl;
  runtime.previews.sidebarAnimation = runtime.frames[0].imageUrl;
  await refreshPreviews();
  addActivity('Animation preview started', 'info');
  animationTimer = setInterval(() => {
    if (!runtime.frames.length) return;
    animationCycleIndex = (animationCycleIndex + 1) % runtime.frames.length;
    runtime.previews.animation = runtime.frames[animationCycleIndex].imageUrl;
    runtime.previews.sidebarAnimation = runtime.previews.animation;
    setImage('animationPreview', runtime.previews.animation, 'Animation preview');
    setImage('sidebarAnimationPreview', runtime.previews.sidebarAnimation, 'Sidebar animation preview');
    setImage('livePreview', runtime.previews.animation, 'Live preview');
  }, 220);
}

function stopAnimationPreview() {
  if (animationTimer) {
    clearInterval(animationTimer);
    animationTimer = null;
  }
}

async function exportSpritesheetPng() {
  if (!runtime.previews.sheet) await generateMockSheet();
  setCurrentStage('export');
  setStageStatus('export', 'running', 'Exporting spritesheet');
  const blob = await fetch(runtime.previews.sheet).then(r => r.blob());
  downloadBlob(blob, `${slugify(runtime.projectName)}-spritesheet.png`);
  setStageStatus('export', 'complete', 'Spritesheet exported');
  addActivity('Exported spritesheet PNG', 'success');
}

function exportManifestJson() {
  setCurrentStage('export');
  setStageStatus('export', 'running', 'Exporting manifest');
  const manifest = buildManifest();
  downloadText(JSON.stringify(manifest, null, 2), `${slugify(runtime.projectName)}-manifest.json`, 'application/json');
  setStageStatus('export', 'complete', 'Manifest exported');
  addActivity('Exported manifest JSON', 'success');
}

function exportPreviewGif() {
  setCurrentStage('export');
  setStageStatus('export', 'running', 'Exporting GIF');
  downloadDataUrl(TINY_TRANSPARENT_GIF, `${slugify(runtime.projectName)}-preview.gif`);
  setStageStatus('export', 'warning', 'GIF placeholder exported');
  addActivity('Exported preview GIF placeholder', 'warning');
}

async function exportFullZip() {
  if (typeof JSZip === 'undefined') {
    setLastError('JSZip is not available for ZIP export.');
    return;
  }
  setCurrentStage('export');
  setStageStatus('export', 'running', 'Exporting ZIP');
  const zip = new JSZip();
  const manifest = buildManifest();
  const report = renderValidationSnapshot();

  if (runtime.previews.sheet) {
    const sheetBlob = await fetch(runtime.previews.sheet).then(r => r.blob());
    zip.file('spritesheet.png', sheetBlob);
  }
  zip.file('manifest.json', JSON.stringify(manifest, null, 2));
  zip.file('validation-report.json', JSON.stringify(report, null, 2));
  zip.file('README.txt', 'SpriteForge export package generated from the dashboard.');

  runtime.frames.forEach((frame, index) => {
    zip.file(`frames/${String(index + 1).padStart(2, '0')}-${slugify(frame.label)}.png`, dataUrlToBase64(frame.imageUrl), { base64: true });
  });

  const content = await zip.generateAsync({ type: 'blob' });
  downloadBlob(content, `${slugify(runtime.projectName)}-export.zip`);
  setStageStatus('export', 'complete', 'ZIP exported');
  addActivity('Exported full ZIP package', 'success');
}

function exportValidationReport() {
  setCurrentStage('export');
  setStageStatus('export', 'running', 'Exporting report');
  const report = renderValidationSnapshot();
  downloadText(JSON.stringify(report, null, 2), `${slugify(runtime.projectName)}-validation-report.json`, 'application/json');
  setStageStatus('export', 'complete', 'Report exported');
  addActivity('Exported validation report', 'success');
}

function buildManifest() {
  return {
    projectName: runtime.projectName,
    provider: runtime.provider,
    action: runtime.selectedAction,
    outputSettings: runtime.outputSettings,
    frameCount: runtime.frames.length,
    frameOffsets: runtime.frames.map(frame => ({
      label: frame.label,
      offsetX: frame.offsetX || 0,
      offsetY: frame.offsetY || 0
    })),
    generatedAt: new Date().toISOString()
  };
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

function downloadText(text, filename, type = 'text/plain') {
  const blob = new Blob([text], { type });
  downloadBlob(blob, filename);
}

function downloadDataUrl(dataUrl, filename) {
  const [meta, base64] = dataUrl.split(',');
  const mime = meta.match(/data:(.*?);base64/)?.[1] || 'application/octet-stream';
  const bytes = Uint8Array.from(atob(base64), c => c.charCodeAt(0));
  downloadBlob(new Blob([bytes], { type: mime }), filename);
}

function dataUrlToBase64(dataUrl) {
  return dataUrl.split(',')[1] || '';
}

function slugify(value) {
  return String(value || 'spriteforge')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'spriteforge';
}

async function newProject() {
  stopAnimationPreview();
  runtime = structuredClone(DEFAULT_RUNTIME);
  openAIStatus = 'unknown';
  runtime.projectName = `Project ${new Date().toLocaleDateString().replaceAll('/', '-')}`;
  localStorage.removeItem(STORAGE_KEY);
  runtime.referenceImage = null;
  runtime.referenceImageName = '';
  runtime.frames = [];
  runtime.frameOffsets = [];
  runtime.selectedFrameIndex = -1;
  runtime.warnings = [];
  runtime.activity = [];
  runtime.lastError = '';
  runtime.pipelineProgress = 0;
  addActivity('Started a new project', 'success');
  refreshEverything();
  await refreshPreviews();
  await refreshOpenAIStatus();
}

async function loadProjectFromFile(file) {
  if (!file) return;
  const text = await file.text();
  const parsed = JSON.parse(text);
  if (parsed.apiKey || parsed.provider?.apiKey) {
    delete parsed.apiKey;
    if (parsed.provider) {
      delete parsed.provider.apiKey;
    }
  }
  runtime = mergeRuntime(DEFAULT_RUNTIME, parsed);
  openAIStatus = 'unknown';
  runtime.running = false;
  runtime.lastError = '';
  runtime.stageStatus = { ...DEFAULT_RUNTIME.stageStatus, ...(parsed.stageStatus || {}) };
  runtime.outputSettings = { ...DEFAULT_RUNTIME.outputSettings, ...(parsed.outputSettings || {}) };
  runtime.frames = Array.isArray(parsed.frames) ? parsed.frames : [];
  runtime.frameOffsets = Array.isArray(parsed.frameOffsets) ? parsed.frameOffsets : [];
  runtime.selectedFrameIndex = typeof parsed.selectedFrameIndex === 'number' ? parsed.selectedFrameIndex : (runtime.frames.length ? 0 : -1);
  runtime.referenceImage = parsed.referenceImage || parsed.previews?.reference || '';
  runtime.previews = { ...DEFAULT_RUNTIME.previews, ...(parsed.previews || {}) };
  runtime.warnings = Array.isArray(parsed.warnings) ? parsed.warnings : [];
  runtime.activity = Array.isArray(parsed.activity) ? parsed.activity : [];
  runtime.poseBoard = parsed.poseBoard || '';
  runtime.validationReport = parsed.validationReport || null;
  runtime.promptBuilder = { ...PROMPT_FIELD_DEFAULTS, ...(parsed.promptBuilder || {}) };
  promptBuilderState = { ...PROMPT_FIELD_DEFAULTS, ...runtime.promptBuilder };
  if (typeof window !== 'undefined') {
    window.spritePromptBuilderState = promptBuilderState;
  }
  addActivity('Loaded project from file', 'success');
  refreshEverything();
  await refreshPreviews();
  await refreshLivePreview();
  saveRuntime();
  await refreshOpenAIStatus();
}

function saveProject() {
  const exported = {
    projectName: runtime.projectName,
    provider: runtime.provider,
    outputSettings: runtime.outputSettings,
    selectedAction: runtime.selectedAction,
    currentStage: runtime.currentStage,
    selectedFrameIndex: runtime.selectedFrameIndex,
    stageStatus: runtime.stageStatus,
    warnings: runtime.warnings,
    activity: runtime.activity,
    pipelineProgress: runtime.pipelineProgress,
    referenceImage: runtime.referenceImage,
    referenceImageName: runtime.referenceImageName,
    previews: runtime.previews,
    frames: runtime.frames,
    frameOffsets: runtime.frameOffsets,
    poseBoard: runtime.poseBoard,
    validationReport: runtime.validationReport,
    promptBuilder: runtime.promptBuilder
  };
  downloadText(JSON.stringify(exported, null, 2), `${slugify(runtime.projectName)}-project.json`, 'application/json');
  addActivity('Saved project file', 'success');
}

async function resetProject() {
  stopAnimationPreview();
  runtime = structuredClone(DEFAULT_RUNTIME);
  openAIStatus = 'unknown';
  runtime.provider = $('providerSelect')?.value || 'mock';
  runtime.projectName = $('projectNameInput')?.value || 'Untitled Project';
  runtime.outputSettings.backgroundMode = $('backgroundModeSelect')?.value || 'chroma-green';
  runtime.warnings = [];
  runtime.activity = [];
  runtime.currentStage = 'setup';
  runtime.pipelineProgress = 0;
  runtime.lastError = '';
  runtime.stageStatus = { ...DEFAULT_RUNTIME.stageStatus };
  runtime.selectedAction = $('actionSelect')?.value || 'idle';
  runtime.projectName = 'Untitled Project';
  runtime.referenceImage = null;
  runtime.referenceImageName = '';
  runtime.frames = [];
  runtime.frameOffsets = [];
  runtime.previews = { ...DEFAULT_RUNTIME.previews };
  runtime.promptBuilder = { ...PROMPT_FIELD_DEFAULTS };
  promptBuilderState = { ...PROMPT_FIELD_DEFAULTS };
  if (typeof window !== 'undefined') {
    window.spritePromptBuilderState = promptBuilderState;
  }
  localStorage.removeItem(STORAGE_KEY);
  addActivity('Reset project state', 'warning');
  refreshEverything();
  await refreshPreviews();
  await refreshOpenAIStatus();
}

async function mockDemoRun() {
  stopAnimationPreview();
  runtime.provider = 'mock';
  $('providerSelect').value = 'mock';
  updateProviderBadge();
  setProjectStatus('running', 'Mock demo in progress');
  addActivity('Starting mock demo run', 'info');

  const placeholder = await makePlaceholder('Mock Character Reference', ['#08111f', '#38bdf8']);
  runtime.referenceImage = placeholder;
  runtime.referenceImageName = 'mock-demo.png';
  runtime.previews.reference = placeholder;
  runtime.previews.compareRaw = placeholder;
  setStageStatus('setup', 'complete', 'Mock setup complete');
  setStageStatus('reference', 'running', 'Mock anchor pass');
  await generateSouthAnchor();
  await generateDirectionalAnchors();
  await generatePoseBoard();
  await pixelSnapFrames();
  await cleanBackground();
  await normalizeRuntimeSheet();
  validateAnimation();
  renderValidationSnapshot();
  setStageStatus('export', 'complete', 'Mock export ready');
  addActivity('Mock demo run completed', 'success');
  setProjectStatus('complete', 'Mock project ready');
  updateButtonStates();
  await refreshPreviews();
}

async function runFullProductionPipeline() {
  runtime.running = true;
  setProjectStatus('running', 'Pipeline running');
  addActivity('Running full production pipeline', 'info');
  updateButtonStates();

  try {
    if (runtime.provider === 'mock' && !runtime.referenceImage) {
      await mockDemoRun();
      return;
    }

    setStageStatus('setup', 'complete', 'Project configured');
    await generateSouthAnchor();
    await generateDirectionalAnchors();
    await generatePoseBoard();
    await pixelSnapFrames();
    await cleanBackground();
    await normalizeRuntimeSheet();
    validateAnimation();
    renderValidationSnapshot();
    setStageStatus('export', 'complete', 'Ready to export');
    addActivity('Full production pipeline completed', 'success');
    setProjectStatus('complete', 'Pipeline complete');
  } catch (error) {
    setLastError(error.message || 'Pipeline failed');
    setProjectStatus('failed', 'Pipeline failed');
    setStageStatus(runtime.currentStage || 'setup', 'failed', 'Pipeline failed');
  } finally {
    runtime.running = false;
    updateButtonStates();
    updatePipelineProgress();
    saveRuntime();
  }
}

async function runCurrentStageOnly() {
  const stage = runtime.currentStage || 'setup';
  addActivity(`Running current stage only: ${stage}`, 'info');
  switch (stage) {
    case 'setup':
      setStageStatus('setup', 'complete', 'Setup validated');
      break;
    case 'reference':
      await generateSouthAnchor();
      break;
    case 'directional':
      await generateDirectionalAnchors();
      break;
    case 'animation':
      await generatePoseBoard();
      break;
    case 'aligner':
      renderValidationSnapshot();
      setStageStatus('aligner', 'complete', 'Aligner checked');
      break;
    case 'export':
      await exportSpritesheetPng();
      break;
    default:
      break;
  }
  updateButtonStates();
}

function runQcValidation() {
  renderValidationSnapshot();
  validateAnchor();
  validateDirectionalAnchors();
  validateAnimation();
  setStageStatus('export', runtime.validationReport?.warnings?.length ? 'warning' : 'complete', runtime.validationReport?.warnings?.length ? 'QC warnings' : 'QC complete');
  addActivity('QC validation complete', runtime.validationReport?.warnings?.length ? 'warning' : 'success');
  updateButtonStates();
}

function bindButtons() {
  $('projectNameInput')?.addEventListener('input', () => {
    updateSharedSettingsFromInputs();
    setProjectStatus('running', 'Project edited');
  });

  $('providerSelect')?.addEventListener('change', () => {
    updateSharedSettingsFromInputs();
    setCurrentStage('setup');
    updateButtonStates();
    addActivity(`Provider changed to ${runtime.provider}`, 'info');
    refreshOpenAIStatus();
  });

  ['cellSizeInput', 'fpsInput', 'columnsInput', 'rowsInput', 'footAnchorXInput', 'footAnchorYInput', 'backgroundModeSelect', 'actionSelect'].forEach(id => {
    $(id)?.addEventListener('input', () => {
      updateSharedSettingsFromInputs();
      updateButtonStates();
      saveRuntime();
    });
    $(id)?.addEventListener('change', () => {
      updateSharedSettingsFromInputs();
      updateButtonStates();
      saveRuntime();
    });
  });

  $('apiKey')?.addEventListener('input', () => {
    addActivity('OpenAI key input is ignored. Set OPENAI_API_KEY on the server instead.', 'warning');
    $('apiKey').value = '';
  });

  const promptInputIds = [
    'stagePromptSelect',
    'promptProviderSelect',
    'promptActionName',
    'promptDirection',
    'promptCoreIdentity',
    'promptCostumePalette',
    'promptSilhouetteNotes',
    'promptCellSize',
    'promptBackgroundColor',
    'promptPaletteLimit',
    'promptFootAnchor',
    'promptSheetColumns',
    'promptSheetRows'
  ];

  promptInputIds.forEach((id) => {
    $(id)?.addEventListener('input', () => {
      updatePromptBuilderStateFromInputs();
      renderPromptBuilder();
    });
    $(id)?.addEventListener('change', () => {
      updatePromptBuilderStateFromInputs();
      renderPromptBuilder();
    });
  });

  $('copyPromptBtn')?.addEventListener('click', copyPromptBuilderText);
  $('sendPromptBtn')?.addEventListener('click', sendPromptToProvider);
  $('resetPromptBtn')?.addEventListener('click', resetPromptBuilder);
  $('stagePromptSelect')?.addEventListener('change', () => {
    updatePromptBuilderStateFromInputs();
    renderPromptBuilder();
  });
  $('actionSelect')?.addEventListener('change', (event) => {
    applyPromptPreset(event.target.value);
    runtime.selectedAction = event.target.value;
    updateSharedSettingsFromInputs();
  });

  $('uploadReferenceBtn')?.addEventListener('click', () => $('referenceImageInput')?.click());
  $('referenceImageInput')?.addEventListener('change', async (event) => {
    const file = event.target.files?.[0];
    if (file) {
      await uploadReferenceFromFile(file);
      updateButtonStates();
      refreshEverything();
      await refreshPreviews();
    }
  });

  $('newProjectBtn')?.addEventListener('click', newProject);
  $('loadProjectBtn')?.addEventListener('click', () => $('projectFileInput')?.click());
  $('projectFileInput')?.addEventListener('change', async (event) => {
    const file = event.target.files?.[0];
    if (file) await loadProjectFromFile(file);
  });
  $('saveProjectBtn')?.addEventListener('click', saveProject);
  $('resetProjectBtn')?.addEventListener('click', resetProject);

  $('generateSouthAnchorBtn')?.addEventListener('click', generateSouthAnchor);
  $('pixelSnapAnchorBtn')?.addEventListener('click', pixelSnapAnchor);
  $('validateAnchorBtn')?.addEventListener('click', validateAnchor);
  $('downloadAnchorBtn')?.addEventListener('click', downloadAnchor);
  $('compareRawSnappedBtn')?.addEventListener('click', compareRawVsSnapped);

  $('generateDirectionsBtn')?.addEventListener('click', generateDirectionalAnchors);
  $('snapDirectionsBtn')?.addEventListener('click', snapDirectionalAnchors);
  $('validateDirectionsBtn')?.addEventListener('click', validateDirectionalAnchors);
  $('previewDirectionGridBtn')?.addEventListener('click', previewDirectionGrid);

  $('generatePoseBoardBtn')?.addEventListener('click', generatePoseBoard);
  $('recoverFramesBtn')?.addEventListener('click', recoverFrames);
  $('pixelSnapFramesBtn')?.addEventListener('click', pixelSnapFrames);
  $('cleanBackgroundBtn')?.addEventListener('click', cleanBackground);
  $('normalizeRuntimeSheetBtn')?.addEventListener('click', normalizeRuntimeSheet);
  $('validateAnimationBtn')?.addEventListener('click', validateAnimation);
  $('previewAnimationBtn')?.addEventListener('click', previewAnimation);

  $('nudgeLeft1Btn')?.addEventListener('click', () => updateFrameOffsets({ offsetX: -1 }));
  $('nudgeRight1Btn')?.addEventListener('click', () => updateFrameOffsets({ offsetX: 1 }));
  $('nudgeUp1Btn')?.addEventListener('click', () => updateFrameOffsets({ offsetY: -1 }));
  $('nudgeDown1Btn')?.addEventListener('click', () => updateFrameOffsets({ offsetY: 1 }));
  $('nudgeLeft5Btn')?.addEventListener('click', () => updateFrameOffsets({ offsetX: -5 }));
  $('nudgeRight5Btn')?.addEventListener('click', () => updateFrameOffsets({ offsetX: 5 }));
  $('nudgeUp5Btn')?.addEventListener('click', () => updateFrameOffsets({ offsetY: -5 }));
  $('nudgeDown5Btn')?.addEventListener('click', () => updateFrameOffsets({ offsetY: 5 }));
  $('resetFrameBtn')?.addEventListener('click', resetSelectedFrame);
  $('applyOffsetToAllBtn')?.addEventListener('click', applyOffsetToAllFrames);

  $('exportSpritesheetBtn')?.addEventListener('click', exportSpritesheetPng);
  $('exportManifestBtn')?.addEventListener('click', exportManifestJson);
  $('exportGifBtn')?.addEventListener('click', exportPreviewGif);
  $('exportZipBtn')?.addEventListener('click', exportFullZip);
  $('exportReportBtn')?.addEventListener('click', exportValidationReport);

  $('runFullPipelineBtn')?.addEventListener('click', runFullProductionPipeline);
  $('runCurrentStageBtn')?.addEventListener('click', runCurrentStageOnly);
  $('runQcValidationBtn')?.addEventListener('click', runQcValidation);
  $('runMockDemoBtn')?.addEventListener('click', mockDemoRun);
}

async function init() {
  els = {
    apiKey: $('apiKey')
  };

  initializePromptBuilderControls();
  updateInputsFromRuntime();
  updateProviderBadge();
  updateCurrentStageBadge();
  renderWarnings();
  renderActivity();
  bindButtons();
  refreshEverything();
  await refreshPreviews();
  await renderPlaceholderPreview('sheet', 'Spritesheet Preview', 'Waiting for frames');
  updateButtonStates();
  updatePipelineProgress();
  if (!runtime.activity.length) {
    addActivity('Dashboard ready', 'success');
  }
  updateButtonStates();
  await refreshOpenAIStatus();
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

if (typeof window !== 'undefined') {
  window.SpriteForgeDashboard = {
    get runtime() {
      return runtime;
    },
    refreshPreviews,
    refreshEverything,
    runFullProductionPipeline,
    runCurrentStageOnly,
    runQcValidation,
    mockDemoRun
  };

  window.showImageModal = window.showImageModal || ((src) => {
    const modal = document.createElement('div');
    modal.className = 'fixed inset-0 z-[9999] flex items-center justify-center bg-black/80 p-6';
    modal.innerHTML = `
      <button class="absolute top-4 right-4 rounded-full bg-slate-900/80 px-4 py-2 text-white">Close</button>
      <img src="${src}" alt="Preview" class="max-h-[90vh] max-w-[90vw] rounded-2xl border border-white/10 shadow-2xl" />
    `;
    modal.addEventListener('click', () => modal.remove());
    document.body.appendChild(modal);
  });
}

function bootstrapAdapters() {
  pipeline.newProject = pipeline.newProject || newProject;
  pipeline.loadProject = pipeline.loadProject || loadProjectFromFile;
  pipeline.saveProject = pipeline.saveProject || saveProject;
  pipeline.resetProject = pipeline.resetProject || resetProject;
  pipeline.generateSouthAnchor = pipeline.generateSouthAnchor || generateSouthAnchor;
  pipeline.pixelSnapAnchor = pipeline.pixelSnapAnchor || pixelSnapAnchor;
  pipeline.validateAnchor = pipeline.validateAnchor || validateAnchor;
  pipeline.downloadAnchor = pipeline.downloadAnchor || downloadAnchor;
  pipeline.compareRawVsSnapped = pipeline.compareRawVsSnapped || compareRawVsSnapped;
  pipeline.generateDirectionalAnchors = pipeline.generateDirectionalAnchors || generateDirectionalAnchors;
  pipeline.pixelSnapDirections = pipeline.pixelSnapDirections || snapDirectionalAnchors;
  pipeline.validateDirections = pipeline.validateDirections || validateDirectionalAnchors;
  pipeline.previewDirectionGrid = pipeline.previewDirectionGrid || previewDirectionGrid;
  pipeline.generatePoseBoard = pipeline.generatePoseBoard || generatePoseBoard;
  pipeline.recoverFrames = pipeline.recoverFrames || recoverFrames;
  pipeline.pixelSnapFrames = pipeline.pixelSnapFrames || pixelSnapFrames;
  pipeline.cleanBackground = pipeline.cleanBackground || cleanBackground;
  pipeline.normalizeRuntimeSheet = pipeline.normalizeRuntimeSheet || normalizeRuntimeSheet;
  pipeline.validateAnimation = pipeline.validateAnimation || validateAnimation;
  pipeline.previewAnimation = pipeline.previewAnimation || previewAnimation;
  pipeline.exportSpritesheetPng = pipeline.exportSpritesheetPng || exportSpritesheetPng;
  pipeline.exportManifestJson = pipeline.exportManifestJson || exportManifestJson;
  pipeline.exportPreviewGif = pipeline.exportPreviewGif || exportPreviewGif;
  pipeline.exportFullZip = pipeline.exportFullZip || exportFullZip;
  pipeline.exportValidationReport = pipeline.exportValidationReport || exportValidationReport;
  pipeline.runFullProductionPipeline = pipeline.runFullProductionPipeline || runFullProductionPipeline;
  pipeline.runCurrentStageOnly = pipeline.runCurrentStageOnly || runCurrentStageOnly;
  pipeline.runQcValidation = pipeline.runQcValidation || runQcValidation;
  pipeline.mockDemoRun = pipeline.mockDemoRun || mockDemoRun;
}

function bootstrapFromSharedState() {
  const shared = getState();
  runtime.provider = shared.provider || runtime.provider;
  runtime.projectName = shared.projectName || runtime.projectName;
  runtime.selectedAction = shared.selectedAction || runtime.selectedAction;
  runtime.outputSettings = { ...runtime.outputSettings, ...(shared.outputSettings || {}) };
  runtime.stageStatus = { ...runtime.stageStatus, ...(shared.stageStatus || {}) };
  runtime.currentStage = shared.currentStage || runtime.currentStage;
  if (shared.promptBuilder) {
    runtime.promptBuilder = { ...PROMPT_FIELD_DEFAULTS, ...shared.promptBuilder };
    promptBuilderState = { ...PROMPT_FIELD_DEFAULTS, ...runtime.promptBuilder };
    if (typeof window !== 'undefined') {
      window.spritePromptBuilderState = promptBuilderState;
    }
  }
}

onReady(async () => {
  bootstrapAdapters();
  bootstrapFromSharedState();
  await init();
});
