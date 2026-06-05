export const DEFAULT_PROMPT_VALUES = Object.freeze({
  stageId: 'south_front_anchor',
  coreIdentity: 'A single, readable game character with a strong silhouette.',
  costumeAndPalette: 'Keep the costume readable, compact, and palette disciplined.',
  silhouetteNotes: 'Prioritize a strong outer silhouette and avoid clutter.',
  styleTarget: 'polished 16-bit / early 32-bit JRPG pixel art, lower fidelity than the input image',
  actionName: 'idle',
  direction: 'south',
  cellSize: '256x256',
  backgroundColor: '#00FF00',
  paletteLimit: '8 to 12 colors',
  outputSheetRows: '2',
  outputSheetColumns: '5',
  footAnchorX: '128',
  footAnchorY: '255',
  providerId: 'openai'
});

export const ACTION_PRESET_LIST = Object.freeze([
  {
    id: 'idle',
    label: 'Idle',
    description: 'Neutral breathing pose with steady balance.',
    stageId: 'south_front_anchor'
  },
  {
    id: 'walk',
    label: 'Walk',
    description: 'Forward walk cycle with readable foot placement.',
    stageId: 'walk_cycle_instructions'
  },
  {
    id: 'attack',
    label: 'Attack',
    description: 'Committed combat pose with a clear strike silhouette.',
    stageId: 'action_pose_board'
  },
  {
    id: 'hurt',
    label: 'Hurt',
    description: 'Impact reaction with clear recoil and recovery.',
    stageId: 'frame_recovery_instructions'
  },
  {
    id: 'jump',
    label: 'Jump',
    description: 'Upward launch or airborne posture with readable limbs.',
    stageId: 'directional_anchors_nsew'
  },
  {
    id: 'death',
    label: 'Death',
    description: 'Defeat pose with a complete fall and final settle.',
    stageId: 'runtime_normalize_and_align'
  },
  {
    id: 'cast',
    label: 'Cast',
    description: 'Spellcasting pose with deliberate hand placement.',
    stageId: 'per_frame_chroma_layout_snap'
  },
  {
    id: 'dash',
    label: 'Dash',
    description: 'Explosive movement frame with strong forward intent.',
    stageId: 'pixel_snap_anchor'
  }
]);

export const ACTION_PRESET_MAP = Object.freeze(
  ACTION_PRESET_LIST.reduce((acc, preset) => {
    acc[preset.id] = preset;
    return acc;
  }, {})
);

export const PROMPT_PROVIDER_OPTIONS = Object.freeze([
  {
    id: 'openai',
    label: 'OpenAI GPT-Image-1',
    description: 'Send the prompt through the existing OpenAI image pipeline.'
  }
]);

