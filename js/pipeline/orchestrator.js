import { PIPELINE_STAGE_DEFINITIONS, getStageDefinition } from './stages.js';
import {
  PIPELINE_STATUS,
  STAGE_EXECUTION_STATUS,
  STAGE_VALIDATION_STATUS,
  clonePipelineState,
  createPipelineState,
  createStageMap,
} from './state.js';
import { aggregatePipelineStatus, toFriendlyError, validateStageResult } from './validation.js';
import { loadPipelineState, savePipelineState } from './storage.js';
import { MockImageProvider } from './providers/mockProvider.js';
import { OpenAIImageProvider } from './providers/openaiProvider.js';
import { Automatic1111ImageProvider } from './providers/localStableDiffusionProvider.js';

function mergeDeep(target, source) {
  if (!source) return target;
  const output = Array.isArray(target) ? [...target] : { ...target };

  for (const [key, value] of Object.entries(source)) {
    if (value && typeof value === 'object' && !Array.isArray(value) && !(value instanceof Date)) {
      output[key] = mergeDeep(target?.[key] || {}, value);
    } else {
      output[key] = value;
    }
  }

  return output;
}

function buildProvider(state, options = {}) {
  const mode = options.mode || state.provider?.mode || 'mock';
  const apiKey = options.apiKey || state.provider?.apiKey || '';
  const baseUrl = options.baseUrl || state.provider?.baseUrl || process.env.AUTOMATIC1111_BASE_URL || 'http://127.0.0.1:7860';
  const denoisingStrength = options.denoisingStrength || state.provider?.denoisingStrength || process.env.AUTOMATIC1111_DENOISING_STRENGTH || 0.55;

  if (mode === 'openai' && apiKey) {
    return new OpenAIImageProvider({
      apiKey,
      endpoint: options.endpoint,
      model: options.model,
      fetchImpl: options.fetchImpl,
    });
  }

  if (mode === 'local') {
    return new Automatic1111ImageProvider({
      baseUrl,
      endpoint: options.localEndpoint,
      outputDir: options.outputDir,
      timeoutMs: options.timeoutMs,
      denoisingStrength,
      fetchImpl: options.fetchImpl,
    });
  }

  return new MockImageProvider({
    width: options.width,
    height: options.height,
  });
}

export class PipelineOrchestrator {
  constructor({
    state = null,
    provider = null,
    autoSave = true,
    stageDefinitions = PIPELINE_STAGE_DEFINITIONS,
  } = {}) {
    const loadedState = state || loadPipelineState() || createPipelineState();
    this.state = clonePipelineState(loadedState);
    this.stageDefinitions = stageDefinitions;
    this.stageIndex = new Map(stageDefinitions.map((stage, index) => [stage.id, { ...stage, index }]));
    this.state.stageMap = {
      ...createStageMap(stageDefinitions),
      ...(this.state.stageMap || {}),
    };
    this.provider = provider || buildProvider(this.state);
    this.autoSave = autoSave;
    this.listeners = new Set();
  }

  getStageOrder() {
    return this.stageDefinitions.map((stage) => stage.id);
  }

  subscribe(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  emit(event, payload) {
    for (const listener of this.listeners) {
      try {
        listener(event, clonePipelineState(this.state), payload);
      } catch (error) {
        console.warn('Pipeline listener failed:', error);
      }
    }
  }

  getState() {
    return clonePipelineState(this.state);
  }

  setState(nextState) {
    this.state = mergeDeep(this.state, nextState);
    this.syncStatus();
    this.persist();
    this.emit('state', { state: this.getState() });
    return this.getState();
  }

  setProvider(provider) {
    this.provider = provider || new MockImageProvider();
    this.state.provider = {
      ...this.state.provider,
      mode: this.provider.mode || 'mock',
      baseUrl: this.provider.baseUrl || this.state.provider?.baseUrl || '',
    };
    this.persist();
  }

  hydrateFromStorage() {
    const stored = loadPipelineState();
    if (stored) {
      this.state = clonePipelineState(stored);
      this.state.stageMap = {
        ...createStageMap(this.stageDefinitions),
        ...(stored.stageMap || {}),
      };
      this.syncStatus();
      this.emit('hydrate', { state: this.getState() });
      return true;
    }
    return false;
  }

  persist() {
    if (!this.autoSave) return false;
    return savePipelineState(this.state);
  }

  syncStatus() {
    this.state.pipelineStatus = aggregatePipelineStatus(this.state);
    this.state.meta = {
      ...(this.state.meta || {}),
      lastSavedAt: this.state.meta?.lastSavedAt || null,
    };
    return this.state.pipelineStatus;
  }

  ensureProvider() {
    if (this.provider) return this.provider;
    this.provider = buildProvider(this.state);
    return this.provider;
  }

  setReferenceImage(referenceImage, meta = {}) {
    this.state.inputs.referenceImage = referenceImage || null;
    this.state.inputs.referenceImageDataUrl = typeof referenceImage === 'string' ? referenceImage : meta.dataUrl || '';
    this.state.inputs.referenceImageName = meta.name || this.state.inputs.referenceImageName || '';
    this.state.inputs.referenceImageType = meta.type || this.state.inputs.referenceImageType || '';
    this.state.meta = {
      ...(this.state.meta || {}),
      lastUpdatedAt: new Date().toISOString(),
    };
    this.state.pipelineStatus = PIPELINE_STATUS.READY;
    this.persist();
    this.emit('referenceImage', { state: this.getState() });
    return this.getState();
  }

  getStage(stageId) {
    return getStageDefinition(stageId);
  }

  getStageRecord(stageId) {
    if (!this.state.stageMap[stageId]) {
      this.state.stageMap[stageId] = {
        id: stageId,
        status: STAGE_EXECUTION_STATUS.IDLE,
        validation: {
          status: STAGE_VALIDATION_STATUS.NOT_RUN,
          message: '',
          details: {},
          updatedAt: new Date().toISOString(),
        },
        startedAt: null,
        finishedAt: null,
        message: '',
        summary: '',
        inputs: {},
        outputs: {},
        warnings: [],
        errors: [],
      };
    }
    return this.state.stageMap[stageId];
  }

  setStageRecord(stageId, patch) {
    const current = this.getStageRecord(stageId);
    this.state.stageMap[stageId] = mergeDeep(current, patch);
  }

  applyPatch(patch = {}) {
    this.state = mergeDeep(this.state, patch);
  }

  async runStage(stageId, inputPatch = {}) {
    const stage = this.getStage(stageId);
    if (!stage) {
      throw toFriendlyError(new Error(`Unknown stage "${stageId}".`), `Unknown stage "${stageId}".`);
    }

    const current = this.getStageRecord(stageId);
    this.setStageRecord(stageId, {
      status: STAGE_EXECUTION_STATUS.RUNNING,
      startedAt: current.startedAt || new Date().toISOString(),
      finishedAt: null,
      message: '',
      errors: [],
    });
    this.state.pipelineStatus = PIPELINE_STATUS.RUNNING;
    this.state.runtime.activeStageId = stageId;
    this.persist();
    this.emit('stage:start', { stageId, state: this.getState() });

    try {
      const context = {
        state: clonePipelineState(this.state),
        provider: this.ensureProvider(),
        inputPatch,
        orchestrator: this,
      };
      const result = await stage.run(context);
      const validation = validateStageResult(result);
      const patch = result.patch || {};

      this.applyPatch(patch);
      this.state.meta.lastRunAt = new Date().toISOString();

      const nextStatus =
        validation.status === STAGE_VALIDATION_STATUS.FAILED
          ? STAGE_EXECUTION_STATUS.BLOCKED
          : STAGE_EXECUTION_STATUS.COMPLETE;

      this.setStageRecord(stageId, {
        status: nextStatus,
        validation,
        finishedAt: new Date().toISOString(),
        message: result.message || validation.message || '',
        summary: result.summary || stage.description || '',
        inputs: inputPatch,
        outputs: result.outputs || patch,
        warnings: result.warnings || [],
        errors: result.errors || [],
      });

      this.state.runtime.activeStageId = null;
      this.syncStatus();
      this.persist();
      this.emit('stage:complete', { stageId, result, state: this.getState() });

      return {
        ok: validation.status !== STAGE_VALIDATION_STATUS.FAILED,
        stageId,
        state: this.getState(),
        result,
      };
    } catch (error) {
      const friendly = toFriendlyError(error, `The "${stageId}" stage could not complete.`);
      this.setStageRecord(stageId, {
        status: STAGE_EXECUTION_STATUS.FAILED,
        validation: {
          status: STAGE_VALIDATION_STATUS.FAILED,
          message: friendly.userMessage,
          details: friendly.details || {},
          updatedAt: new Date().toISOString(),
        },
        finishedAt: new Date().toISOString(),
        message: friendly.userMessage,
        errors: [friendly.message],
      });
      this.state.runtime.activeStageId = null;
      this.state.runtime.lastError = friendly.userMessage;
      this.state.pipelineStatus = PIPELINE_STATUS.FAILED;
      this.persist();
      this.emit('stage:error', { stageId, error: friendly, state: this.getState() });
      return {
        ok: false,
        stageId,
        error: friendly.userMessage,
        state: this.getState(),
      };
    }
  }

  async runPipeline({ untilStageId = null } = {}) {
    const order = this.getStageOrder();
    const stopIndex = untilStageId ? order.indexOf(untilStageId) : order.length - 1;
    if (untilStageId && stopIndex === -1) {
      throw new Error(`Unknown stage "${untilStageId}".`);
    }

    this.state.pipelineStatus = PIPELINE_STATUS.RUNNING;
    this.persist();
    this.emit('pipeline:start', { state: this.getState() });

    for (let index = 0; index <= stopIndex; index += 1) {
      const stageId = order[index];
      const result = await this.runStage(stageId);
      if (!result.ok) {
        this.state.pipelineStatus = PIPELINE_STATUS.BLOCKED;
        this.persist();
        this.emit('pipeline:blocked', { stageId, result, state: this.getState() });
        return result;
      }
    }

    this.state.pipelineStatus = PIPELINE_STATUS.COMPLETE;
    this.persist();
    this.emit('pipeline:complete', { state: this.getState() });

    return {
      ok: true,
      state: this.getState(),
    };
  }
}

export function createOrchestrator(options = {}) {
  return new PipelineOrchestrator(options);
}
