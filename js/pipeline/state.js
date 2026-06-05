export const PIPELINE_STATUS = Object.freeze({
  IDLE: 'idle',
  READY: 'ready',
  RUNNING: 'running',
  BLOCKED: 'blocked',
  FAILED: 'failed',
  COMPLETE: 'complete',
});

export const STAGE_VALIDATION_STATUS = Object.freeze({
  PASSED: 'passed',
  WARNING: 'warning',
  FAILED: 'failed',
  NOT_RUN: 'not_run',
});

export const STAGE_EXECUTION_STATUS = Object.freeze({
  IDLE: 'idle',
  RUNNING: 'running',
  BLOCKED: 'blocked',
  FAILED: 'failed',
  COMPLETE: 'complete',
});

export const PIPELINE_VERSION = 1;

export function createValidationResult(status = STAGE_VALIDATION_STATUS.NOT_RUN, message = '', details = {}) {
  return {
    status,
    message,
    details: { ...details },
    updatedAt: new Date().toISOString(),
  };
}

export function createStageRecord(stageId, overrides = {}) {
  return {
    id: stageId,
    status: STAGE_EXECUTION_STATUS.IDLE,
    validation: createValidationResult(),
    startedAt: null,
    finishedAt: null,
    message: '',
    summary: '',
    inputs: {},
    outputs: {},
    warnings: [],
    errors: [],
    ...overrides,
  };
}

export function createPipelineState(overrides = {}) {
  return {
    version: PIPELINE_VERSION,
    pipelineStatus: PIPELINE_STATUS.IDLE,
    provider: {
      mode: 'mock',
      preferred: 'auto',
      source: 'auto',
      allowBrowserApiKey: false,
    },
    project: {
      id: '',
      name: 'Untitled Sprite Project',
      description: '',
      notes: '',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    inputs: {
      referenceImage: null,
      referenceImageName: '',
      referenceImageType: '',
      referenceImageSource: 'upload',
      referenceImageDataUrl: '',
    },
    anchors: {
      southFront: null,
      pixelSnap: null,
      directional: {
        north: null,
        east: null,
        south: null,
        west: null,
      },
    },
    actionBoard: null,
    recoveredFrames: [],
    normalizedFrames: [],
    previews: {
      animation: null,
    },
    exports: {
      spritesheetPng: null,
      gifPreview: null,
      manifest: null,
      zipBundle: null,
    },
    runtime: {
      activeStageId: null,
      lastError: null,
      lastWarning: null,
      progress: 0,
      logs: [],
    },
    stageMap: {},
    meta: {
      lastSavedAt: null,
      lastLoadedAt: null,
      lastRunAt: null,
    },
    ...overrides,
  };
}

export function clonePipelineState(state) {
  if (typeof structuredClone === 'function') {
    return structuredClone(state);
  }

  return JSON.parse(JSON.stringify(state));
}

export function normalizePipelineState(input = {}) {
  const state = createPipelineState(input);
  state.stageMap = { ...(input.stageMap || {}) };
  state.provider = { ...state.provider, ...(input.provider || {}) };
  state.project = { ...state.project, ...(input.project || {}) };
  state.inputs = { ...state.inputs, ...(input.inputs || {}) };
  state.anchors = {
    ...state.anchors,
    ...(input.anchors || {}),
    directional: {
      ...state.anchors.directional,
      ...((input.anchors && input.anchors.directional) || {}),
    },
  };
  state.previews = { ...state.previews, ...(input.previews || {}) };
  state.exports = { ...state.exports, ...(input.exports || {}) };
  state.runtime = { ...state.runtime, ...(input.runtime || {}) };
  state.meta = { ...state.meta, ...(input.meta || {}) };
  state.actionBoard = input.actionBoard ?? state.actionBoard;
  state.recoveredFrames = Array.isArray(input.recoveredFrames) ? input.recoveredFrames : state.recoveredFrames;
  state.normalizedFrames = Array.isArray(input.normalizedFrames) ? input.normalizedFrames : state.normalizedFrames;
  state.pipelineStatus = input.pipelineStatus || state.pipelineStatus;
  return state;
}

export function createStageMap(stageDefinitions = []) {
  return stageDefinitions.reduce((acc, stage) => {
    acc[stage.id] = createStageRecord(stage.id, {
      id: stage.id,
      summary: stage.description || '',
    });
    return acc;
  }, {});
}

