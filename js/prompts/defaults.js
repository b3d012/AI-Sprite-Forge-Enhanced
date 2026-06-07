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
  providerId: 'local'
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

export const LOCAL_SD_PRESET_LIST = Object.freeze([
  {
    id: 'custom',
    label: 'Custom',
    description: 'Start from the current prompt and settings without applying a preset.',
    promptTemplate: '',
    negativePrompt: '',
    settings: {
      width: 1024,
      height: 1024,
      steps: 25,
      cfg_scale: 7,
      sampler_name: 'DPM++ 2M Karras',
      batch_size: 1,
    },
  },
  {
    id: 'jrpg_character_sprite',
    label: '16-bit JRPG Character Sprite',
    description: 'Front-facing production character sprite for lower-fidelity pixel art games.',
    promptTemplate: 'full body character sprite, front-facing, south-facing, centered, neutral upright pose, polished 16-bit JRPG pixel art, crisp chunky pixels, readable silhouette, dark outline clusters, simple shapes, limited detail, game sprite, isolated character, chroma green background',
    negativePrompt: 'realistic, photorealistic, 3d render, blurry, soft edges, anti-aliased, painterly, high detail, complex background, scenery, cropped body, cut off feet, multiple characters, weapon, shadow, transparent background, text, watermark, logo',
    settings: {
      width: 1024,
      height: 1024,
      steps: 25,
      cfg_scale: 7,
      sampler_name: 'DPM++ 2M Karras',
      batch_size: 1,
    },
  },
  {
    id: 'pixel_sprite_sheet_concept',
    label: 'Pixel Sprite Sheet Concept',
    description: 'Multi-view concept sheet for a small game character.',
    promptTemplate: 'small game character sprite sheet, 16-bit pixel art, front view, side view, back view, idle pose, clean grid layout, consistent character design, crisp pixel edges, readable silhouette, simple shapes, dark outline clusters, chroma green background',
    negativePrompt: 'realistic, photorealistic, 3d render, blurry, inconsistent character, extra limbs, messy grid, overlapping poses, cropped body, complex background, text, watermark, logo',
    settings: {
      width: 1024,
      height: 1024,
      steps: 25,
      cfg_scale: 7,
      sampler_name: 'DPM++ 2M Karras',
      batch_size: 1,
    },
  },
  {
    id: 'sprite_anchor_from_reference',
    label: 'Sprite Anchor From Reference',
    description: 'Lower-fidelity anchor sprite designed to stay close to a reference character.',
    promptTemplate: 'convert the reference character into a lower-fidelity production sprite anchor, full body, front-facing, south-facing, centered, neutral upright pose, polished 16-bit JRPG character sprite style, crisp chunky pixel art, readable silhouette, dark outline clusters, simple shapes, fewer fine details, chroma green background',
    negativePrompt: 'photorealistic, realistic, 3d render, painterly, high-detail illustration, complex lighting, cropped body, cut off feet, multiple characters, weapon, shadow, text, watermark, logo, transparent background',
    settings: {
      width: 1024,
      height: 1024,
      steps: 25,
      cfg_scale: 7,
      sampler_name: 'DPM++ 2M Karras',
      batch_size: 1,
    },
  },
]);

export const LOCAL_SD_PRESET_MAP = Object.freeze(
  LOCAL_SD_PRESET_LIST.reduce((acc, preset) => {
    acc[preset.id] = preset;
    return acc;
  }, {})
);

export const PROMPT_PROVIDER_OPTIONS = Object.freeze([
  {
    id: 'local',
    label: 'Local Stable Diffusion',
    description: 'Send the prompt to AUTOMATIC1111 running on your machine.'
  },
  {
    id: 'mock',
    label: 'Mock',
    description: 'Use the deterministic local mock provider for testing.'
  },
  {
    id: 'openai',
    label: 'OpenAI GPT-Image-1',
    description: 'Send the prompt through the existing OpenAI image pipeline.'
  }
]);
