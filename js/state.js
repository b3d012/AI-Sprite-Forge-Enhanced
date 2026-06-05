import {
  PIPELINE_STATUS,
  STAGE_VALIDATION_STATUS,
  clonePipelineState,
  createPipelineState,
  normalizePipelineState,
} from './pipeline/state.js';
import { loadPipelineState, savePipelineState } from './pipeline/storage.js';

let state = normalizePipelineState(loadPipelineState() || createPipelineState());

const STORAGE_KEYS = {
  API_KEY: 'openai_api_key',
};

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

  if (apiKeyInput && state.apiKey) {
    apiKeyInput.value = state.apiKey;
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
  state = normalizePipelineState(
    mergeDeep(state, {
      apiKey,
      provider: {
        apiKey,
      },
    })
  );

  try {
    localStorage.setItem(STORAGE_KEYS.API_KEY, apiKey);
  } catch {
    // Local storage may be unavailable in some environments.
  }

  persist();
}

export const storage = {
  getApiKey: () => {
    try {
      return state.apiKey || localStorage.getItem(STORAGE_KEYS.API_KEY) || '';
    } catch {
      return state.apiKey || '';
    }
  },
  setApiKey: (key) => setApiKey((key || '').trim()),
  loadPipelineState,
  savePipelineState,
};

if (typeof document !== 'undefined') {
  document.addEventListener('DOMContentLoaded', () => {
    try {
      const savedApiKey = localStorage.getItem(STORAGE_KEYS.API_KEY);
      if (savedApiKey) {
        setApiKey(savedApiKey);
      }
    } catch {
      // Ignore inaccessible storage in restricted environments.
    }
    updateUIState();
  });
}

export { PIPELINE_STATUS, STAGE_VALIDATION_STATUS };
