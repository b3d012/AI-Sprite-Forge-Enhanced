import { DEFAULT_PROMPT_VALUES, ACTION_PRESET_LIST, ACTION_PRESET_MAP, PROMPT_PROVIDER_OPTIONS } from './defaults.js';
import { PROMPT_TEMPLATES, PROMPT_TEMPLATE_LIST } from './templates.js';

const PLACEHOLDER_RE = /\{\{(\w+)\}\}/g;

export function normalizePromptValues(overrides = {}) {
  return {
    ...DEFAULT_PROMPT_VALUES,
    ...overrides
  };
}

export function getPromptTemplate(stageId = DEFAULT_PROMPT_VALUES.stageId) {
  return PROMPT_TEMPLATES[stageId] || PROMPT_TEMPLATES[DEFAULT_PROMPT_VALUES.stageId];
}

export function renderPromptTemplate(templateBody, values = {}) {
  const normalized = normalizePromptValues(values);
  return String(templateBody || '').replace(PLACEHOLDER_RE, (_, key) => {
    const value = normalized[key];
    return value === undefined || value === null ? '' : String(value);
  }).trim();
}

export function buildPrompt(options = {}) {
  const normalized = normalizePromptValues(options);
  const template = getPromptTemplate(normalized.stageId);
  return renderPromptTemplate(template.body, normalized);
}

export function buildPipelinePrompt(options = {}) {
  return buildPrompt(options);
}

export function getPromptTemplateOptions() {
  return PROMPT_TEMPLATE_LIST;
}

export function getActionPresetOptions() {
  return ACTION_PRESET_LIST;
}

export function getActionPreset(actionId) {
  return ACTION_PRESET_MAP[actionId] || null;
}

export function getProviderOptions() {
  return PROMPT_PROVIDER_OPTIONS;
}

export { PROMPT_TEMPLATES, PROMPT_TEMPLATE_LIST, DEFAULT_PROMPT_VALUES, ACTION_PRESET_LIST, ACTION_PRESET_MAP, PROMPT_PROVIDER_OPTIONS };

