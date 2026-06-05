import { PIPELINE_STATUS, STAGE_VALIDATION_STATUS, createValidationResult } from './state.js';

export class PipelineError extends Error {
  constructor(message, { code = 'PIPELINE_ERROR', details = {}, userMessage = '' } = {}) {
    super(message);
    this.name = 'PipelineError';
    this.code = code;
    this.details = details;
    this.userMessage = userMessage || message;
  }
}

export function toFriendlyError(error, fallbackMessage = 'Something went wrong while processing the sprite pipeline.') {
  if (!error) {
    return new PipelineError(fallbackMessage, { userMessage: fallbackMessage });
  }

  if (error instanceof PipelineError) {
    return error;
  }

  const message = error.userMessage || error.message || fallbackMessage;
  return new PipelineError(message, {
    code: error.code || 'PIPELINE_ERROR',
    details: error.details || {},
    userMessage: message,
  });
}

function hasReferenceImage(state) {
  return !!(state?.inputs?.referenceImageDataUrl || state?.inputs?.referenceImage || state?.referenceImage);
}

export function validateProjectSetup(state) {
  const name = (state?.project?.name || '').trim();
  if (!name) {
    return createValidationResult(STAGE_VALIDATION_STATUS.FAILED, 'Add a project name before running the pipeline.');
  }

  return createValidationResult(STAGE_VALIDATION_STATUS.PASSED, 'Project setup looks good.');
}

export function validateReferenceUpload(state) {
  if (!hasReferenceImage(state)) {
    return createValidationResult(
      STAGE_VALIDATION_STATUS.FAILED,
      'Upload a reference image to continue. The remaining stages depend on a source character.'
    );
  }

  return createValidationResult(STAGE_VALIDATION_STATUS.PASSED, 'Reference image is available.');
}

export function validateProviderSelection(state) {
  const mode = state?.provider?.mode || 'mock';
  if (!['mock', 'openai'].includes(mode)) {
    return createValidationResult(
      STAGE_VALIDATION_STATUS.WARNING,
      `Unknown provider mode "${mode}". Falling back to mock mode.`
    );
  }

  return createValidationResult(STAGE_VALIDATION_STATUS.PASSED, `${mode} provider selected.`);
}

export function validateStageResult(result = {}) {
  if (result.validation) {
    return result.validation;
  }

  if (result.error) {
    return createValidationResult(STAGE_VALIDATION_STATUS.FAILED, result.error.message || 'Stage failed.');
  }

  return createValidationResult(STAGE_VALIDATION_STATUS.PASSED, 'Stage completed successfully.');
}

export function aggregatePipelineStatus(state) {
  const stageRecords = Object.values(state?.stageMap || {});
  if (!stageRecords.length) return PIPELINE_STATUS.IDLE;

  const anyRunning = stageRecords.some((stage) => stage.status === 'running');
  if (anyRunning) return PIPELINE_STATUS.RUNNING;

  const anyFailed = stageRecords.some((stage) => stage.status === 'failed');
  if (anyFailed) return PIPELINE_STATUS.FAILED;

  const anyBlocked = stageRecords.some((stage) => stage.status === 'blocked');
  if (anyBlocked) return PIPELINE_STATUS.BLOCKED;

  const allComplete = stageRecords.length > 0 && stageRecords.every((stage) => stage.status === 'complete');
  if (allComplete) return PIPELINE_STATUS.COMPLETE;

  return PIPELINE_STATUS.READY;
}

