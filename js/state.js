import {
  PIPELINE_STATUS,
  STAGE_VALIDATION_STATUS,
  clonePipelineState,
  createPipelineState,
  normalizePipelineState,
} from './pipeline/state.js';
import { loadPipelineState, savePipelineState } from './pipeline/storage.js';

let state = normalizePipelineState(loadPipelineState() || createPipelineState());

let cachedApiKey = '';

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

function persist() {
  savePipelineState(state);
}

export function getState() {
  return clonePipelineState(state);
}

export function setState(nextState) {
  state = normalizePipelineState(nextState);
  persist();
  updateUIState();
  return getState();
}

export function updateState(newState) {
  state = normalizePipelineState(mergeDeep(state, newState));
  persist();
  updateUIState();
  return getState();
}

export function updateUIState() {
  const apiKeyInput =
    document.getElementById('apiKey') || document.getElementById('api-key') || document.getElementById('apiKeyInput');

  if (apiKeyInput && cachedApiKey) {
    apiKeyInput.value = cachedApiKey;
  }

  const providerLabel = document.getElementById('provider-label');
  if (providerLabel) {
    providerLabel.textContent = state.provider?.mode || 'mock';
  }
}

export function updateSourceImage(file) {
  state = normalizePipelineState(
    mergeDeep(state, {
      uploadedImage: file,
      sourceImageFile: file,
      inputs: {
        referenceImage: file,
      },
    })
  );
  persist();
}

export function updateChosenStyle(style) {
  state = normalizePipelineState(mergeDeep(state, { chosenStyle: style }));
  persist();
}

export function resetStyleChoice() {
  state = normalizePipelineState(mergeDeep(state, { chosenStyle: null }));
  persist();
}

export function setApiKey(apiKey = '') {
  cachedApiKey = apiKey;
  state = normalizePipelineState(
    mergeDeep(state, {
      apiKey,
      provider: {
        apiKey,
      },
    })
  );

  persist();
}

export const storage = {
  getApiKey: () => {
    return cachedApiKey || state.apiKey || '';
  },
  setApiKey: (key) => setApiKey((key || '').trim()),
  loadPipelineState,
  savePipelineState,
};

if (typeof document !== 'undefined') {
  document.addEventListener('DOMContentLoaded', () => {
    try {
      localStorage.removeItem('openai_api_key');
    } catch {
      // Ignore inaccessible storage in restricted environments.
    }
    cachedApiKey = '';
    updateUIState();
  });
}

export { PIPELINE_STATUS, STAGE_VALIDATION_STATUS };
