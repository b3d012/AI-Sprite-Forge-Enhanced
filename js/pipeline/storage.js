import { clonePipelineState, normalizePipelineState } from './state.js';

export const PIPELINE_STORAGE_KEY = 'spriteforge.pipeline.state.v1';

function getStorage() {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      return window.localStorage;
    }
  } catch {
    return null;
  }

  return null;
}

export function loadPipelineState() {
  const storage = getStorage();
  if (!storage) return null;

  try {
    const raw = storage.getItem(PIPELINE_STORAGE_KEY);
    if (!raw) return null;

    const parsed = JSON.parse(raw);
    return normalizePipelineState(parsed);
  } catch (error) {
    console.warn('Unable to load pipeline state from localStorage:', error);
    return null;
  }
}

export function savePipelineState(state) {
  const storage = getStorage();
  if (!storage) return false;

  try {
    const snapshot = clonePipelineState(state);
    snapshot.inputs = {
      ...(snapshot.inputs || {}),
      referenceImage: null,
    };
    snapshot.uploadedImage = null;
    snapshot.meta = {
      ...(snapshot.meta || {}),
      lastSavedAt: new Date().toISOString(),
    };

    storage.setItem(PIPELINE_STORAGE_KEY, JSON.stringify(snapshot));
    return true;
  } catch (error) {
    console.warn('Unable to save pipeline state to localStorage:', error);
    return false;
  }
}

export function clearPipelineState() {
  const storage = getStorage();
  if (!storage) return false;

  storage.removeItem(PIPELINE_STORAGE_KEY);
  return true;
}
