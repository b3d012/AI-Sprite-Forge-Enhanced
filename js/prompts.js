/* --------------------------------------------------------------------------- *
 *  prompts.js  –  Prompt factory for GPT-Image 1 sprite sheets  
 * --------------------------------------------------------------------------- */

///////////////////////
// 1.  Data Models   //
///////////////////////

import {
  buildPrompt,
  buildPipelinePrompt,
  DEFAULT_PROMPT_VALUES,
  getActionPresetOptions,
  getPromptTemplateOptions,
  PROMPT_TEMPLATES,
  ACTION_PRESET_MAP
} from './prompts/buildPrompt.js';

export {
  buildPrompt,
  buildPipelinePrompt,
  DEFAULT_PROMPT_VALUES,
  getActionPresetOptions,
  getPromptTemplateOptions,
  PROMPT_TEMPLATES,
  ACTION_PRESET_MAP
};

// Common constants and helpers
const NEGATIVE_ITEMS = [
  'text',
  'logos',
  'watermarks',
  'UI',
  'grids',
  'props',
  'extra characters',
  'transparent background',
  'alpha channel transparency',
  'soft shadows',
  'gradient backgrounds',
  'white background',
  'solid background'
].join(', ');

export const SPRITE_SYSTEM_PRIMER = `Generate a production sprite with a flat opaque chroma green background (#00FF00) and no transparent background during generation. Keep the character lower fidelity than the input image, fully readable at sprite scale, and consistent across frames.`;

// Helper functions
const imageSize = (base) => `${base}×${base}`;

/////////////////////////////////
// 2.  Style Configuration     //
/////////////////////////////////

// Predefined color palettes
export const PALETTES = {
  NES: [
    '#7C7C7C', '#0000FC', '#0000BC', '#4428BC', '#940084',
    '#A80020', '#A81000', '#881400', '#503000', '#007800',
    '#006800', '#005800', '#004058', '#000000', '#BCBCBC',
    '#0078F8', '#0058F8', '#6844FC', '#D800CC', '#E40058',
    '#F83800', '#E45C10', '#AC7C00', '#00B800', '#00A800'
  ],
  CPS2: [
    '#000000', '#1F0745', '#510B7C', '#772082', '#8A2387',
    '#9B3C8C', '#AC5591', '#BD6E96', '#CE879B', '#DFA0A0',
    '#F0B9A5', '#FFD2AA', '#FFFFFF'
  ]
};

/////////////////////////////////
// 3.  Style Definitions       //
/////////////////////////////////

export const STYLE_DEFINITIONS = {
  original: {
    id: 'original',
    name: 'Original Style',
    description: 'Uses the reference image directly',
    base: 512,
    isReferenceOnly: true, // Special flag to indicate this style uses reference directly
    iconUrl: 'media/style_previews/original.png',
    technicalSpecs: [
      'Direct use of reference image',
      'No style modification',
      'Maintains original proportions'
    ],
    specialFeatures: [
      'Exact reference matching',
      'Original art style'
    ],
    restrictions: []
  },

  pixelart: {
    id: 'pixelart',
    name: 'Stardew Valley',
    description: '32×32 cozy farming RPG style',
    base: 32,
    gutter: 1,
    iconUrl: 'media/style_previews/stardew_valley.png',
    styleAnchor: 'Stardew Valley character sprite',
    technicalSpecs: [
      'Limited 32-color palette',
      'Soft pastel shading',
      'Clean pixel edges',
      '1px black outline'
    ],
    specialFeatures: [
      'Charming facial features',
      'Slightly oversized head',
      'Warm color grading'
    ],
    restrictions: [
      'harsh shadows',
      'complex gradients',
      'realistic proportions',
      'aggressive poses'
    ]
  },

  celshaded: {
    id: 'celshaded',
    name: 'Breath of the Wild',
    description: '256×256 cel-shaded adventure style',
    base: 256,
    gutter: 2,
    iconUrl: 'media/style_previews/breath_wild.png',
    styleAnchor: 'Legend of Zelda: Breath of the Wild character',
    technicalSpecs: [
      'Cel-shaded rendering',
      'Soft rim lighting',
      'Muted color palette',
      'Subtle material variation'
    ],
    specialFeatures: [
      'Environmental color bounce',
      'Cloth material definition',
      'Dynamic wind effects'
    ],
    restrictions: [
      'full black outlines',
      'flat shading',
      'oversaturated colors',
      'rigid poses'
    ]
  },

  lowpoly: {
    id: 'lowpoly',
    name: 'Genshin Impact',
    description: '192×192 anime-styled cel-shading',
    base: 192,
    gutter: 2,
    iconUrl: 'media/style_previews/genshin.png',
    styleAnchor: 'Genshin Impact character render',
    technicalSpecs: [
      'Anime cel-shading',
      'Vibrant color palette',
      'Gradient hair shading',
      'Subtle ambient occlusion'
    ],
    specialFeatures: [
      'Dynamic hair physics',
      'Glossy material highlights',
      'Elemental effects integration'
    ],
    restrictions: [
      'realistic textures',
      'dark color schemes',
      'rigid animation',
      'western art style'
    ]
  },

  handdrawn: {
    id: 'handdrawn',
    name: 'Hollow Knight',
    description: '128×128 hand-drawn gothic style',
    base: 128,
    gutter: 2,
    iconUrl: 'media/style_previews/hollow_knight.png',
    styleAnchor: 'Hollow Knight character art',
    technicalSpecs: [
      'Hand-drawn line art',
      'Ink wash shading',
      'Limited color palette',
      'Atmospheric effects'
    ],
    specialFeatures: [
      'Ethereal particle effects',
      'Dramatic pose silhouettes',
      'Flowing cape physics'
    ],
    restrictions: [
      'bright colors',
      'rigid geometry',
      'clean edges',
      'realistic proportions'
    ]
  },

  cartoon: {
    id: 'cartoon',
    name: 'Fall Guys',
    description: '160×160 bouncy cartoon style',
    base: 160,
    gutter: 2,
    iconUrl: 'media/style_previews/fall_guys.png',
    styleAnchor: 'Fall Guys character model',
    technicalSpecs: [
      'Soft rubber shading',
      'Pastel color palette',
      'Subsurface scattering',
      'Smooth deformation'
    ],
    specialFeatures: [
      'Jelly physics hints',
      'Cute face patterns',
      'Costume integration'
    ],
    restrictions: [
      'sharp edges',
      'realistic materials',
      'complex geometry',
      'serious expressions'
    ]
  },

  retro: {
    id: 'retro',
    name: '8-bit Retro',
    description: '32×32 EXTREME pixel-crawl, NES constraints',
    base: 32,
    gutter: 1,
    iconUrl: 'media/style_previews/retro.png',
    styleAnchor: '1986 Famicom sprite',
    technicalSpecs: [
      'Use exact 25-color NES palette',
      'Max 3 shades per material',
      'Perfect square pixels only',
      '1px black outline'
    ],
    specialFeatures: [
      'Micro "+" dithering on mid-tones',
      'Checker shadow under feet'
    ],
    restrictions: [
      'anti-aliasing',
      'gradients',
      'smooth edges',
      'modern anatomy'
    ]
  },

  fighter: {
    id: 'fighter',
    name: 'Arcade Fighter',
    description: '120×120 Hi-Res CPS-2 sprite, Street-Fighter-III era',
    base: 120,
    gutter: 4,
    iconUrl: 'media/style_previews/arcade_fighter.png',
    styleAnchor: 'CPS-2 ROM sprite (SF III style)',
    technicalSpecs: [
      'Use CPS-2 palette, max 64 colors',
      '4-6 shade banding with AA',
      '2px warm-grey outline (#444)'
    ],
    specialFeatures: [
      'Sub-pixel beard highlights',
      'Strong dynamic posing'
    ],
    restrictions: [
      'black outline',
      'flat fills',
      'pixel dithering',
      'stiff poses'
    ]
  },

  modern: {
    id: 'modern',
    name: 'Flat Cartoon',
    description: 'Adobe-Animate-style vector graphic, 96×96',
    base: 96,
    gutter: 2,
    iconUrl: 'media/style_previews/flat_cartoon.png',
    styleAnchor: 'Modern indie game sprite (Cult of the Lamb style)',
    technicalSpecs: [
      'Flat fills with 3-step shading',
      'Thick 3px outline (#1A1A1A)',
      'Subtle metal gradients'
    ],
    specialFeatures: [
      'Rounded corners',
      'Chibi proportions'
    ],
    restrictions: [
      'pixel art',
      'heavy shading',
      'realistic anatomy',
      'complex textures'
    ]
  }
};

// Style template builder with validation
const createStylePrompt = ({
  id,
  name,
  description,
  base,
  gutter = 0,
  styleAnchor,
  technicalSpecs,
  specialFeatures,
  restrictions,
  isReferenceOnly = false
}) => {
  // Skip validation for reference-only styles
  if (!isReferenceOnly) {
    if (!id || !name || !description || !base || !styleAnchor || !technicalSpecs || !specialFeatures || !restrictions) {
      throw new Error(`Invalid style definition for ${id || 'unknown style'}`);
    }
  }

  return {
    id,
    name,
    description,
    base,
    gutter,
    isReferenceOnly,
    buildBlock: () => {
      if (isReferenceOnly) {
        return `Style: Reference\nSize: ${imageSize(base)}`;
      }

      // Create a more concise style block
      return [
        `Style: ${styleAnchor}`,
        `Size: ${imageSize(base)}`,
        `Tech: ${technicalSpecs.slice(0, 2).join('. ')}`,
        `Key: ${specialFeatures[0]}`,
        `Avoid: ${restrictions.slice(0, 2).join(', ')}`
      ].join('\n');
    }
  };
};

// Validate style definitions
Object.entries(STYLE_DEFINITIONS).forEach(([id, style]) => {
  console.log(`Validating style definition: ${id}`, style);
  
  // Skip full validation for reference-only styles
  if (style.isReferenceOnly) {
    // Only validate essential fields for reference styles
    const essentialFields = ['id', 'name', 'description', 'base'];
    const missingFields = essentialFields.filter(field => !style[field]);
    
    if (missingFields.length > 0) {
      console.error(`Reference style ${id} is missing essential fields:`, missingFields);
    }
    return;
  }
  
  // Full validation for generated styles
  const requiredFields = ['id', 'name', 'description', 'base', 'gutter', 'styleAnchor', 'technicalSpecs', 'specialFeatures', 'restrictions'];
  const missingFields = requiredFields.filter(field => !style[field]);
  
  if (missingFields.length > 0) {
    console.error(`Style ${id} is missing required fields:`, missingFields);
  }
});

// Generate the actual STYLE_PROMPTS from definitions with validation
export const STYLE_PROMPTS = Object.entries(STYLE_DEFINITIONS).map(([id, def]) => {
  console.log(`Creating style prompt for ${id}`);
  try {
    return createStylePrompt(def);
  } catch (error) {
    console.error(`Failed to create style prompt for ${id}:`, error);
    return null;
  }
}).filter(Boolean);

console.log('Available style prompts:', STYLE_PROMPTS.map(s => s.id));

/////////////////////////////////
// 4.  Action Prompt Library   //
/////////////////////////////////

export const ACTION_PROMPTS = {
  idle: {
    name: 'Idle Animation',
    frames: 4,
    basePrompt: 'Character in neutral standing pose, slight breathing motion, maintaining balance with subtle movement. Arms relaxed at sides, head straight, alert expression.',
    framePrompts: [
      'Initial neutral stance, weight evenly distributed',
      'Subtle chest rise during inhale, shoulders lifting slightly',
      'Peak of breathing motion, maximum height',
      'Returning to neutral stance, shoulders lowering'
    ]
  },

  walk: {
    name: 'Walking Animation',
    frames: 12,
    basePrompt: 'Character walking cycle with smooth, natural movement. Arms swinging naturally opposite to legs.',
    framePrompts: [
      'Starting walk pose, right foot forward',
      'Right foot plant, left foot lifting',
      'Mid-step, left foot passing right',
      'Left foot extending forward',
      'Left foot about to plant',
      'Left foot planted, right lifting',
      'Mid-step, right foot passing left',
      'Right foot extending forward',
      'Right foot about to plant',
      'Full stride, weight shifting',
      'Recovery phase, preparing next step',
      'Completing cycle, returning to start'
    ]
  },

  attack: {
    name: 'Attack Animation',
    frames: 4,
    basePrompt: 'Character committing to a readable attack pose with clear impact intent and grounded balance.',
    framePrompts: [
      'Wind-up pose, body loading into the strike',
      'Strike extension, attack line fully readable',
      'Peak impact, maximum silhouette clarity',
      'Recovery pose, returning to stance'
    ]
  },

  jump: {
    name: 'Jump Animation',
    frames: 4,
    basePrompt: 'Character performing a vertical jump with dynamic motion. Arms assist the jumping motion.',
    framePrompts: [
      'Crouch preparation, knees bent, arms back',
      'Launch phase, legs extending, arms swinging up',
      'Peak of jump, fully extended, arms raised',
      'Landing preparation, legs bent for impact'
    ]
  },

  dash: {
    name: 'Dash Animation',
    frames: 2,
    basePrompt: 'Character performing a quick burst of forward movement with a crisp silhouette and strong momentum.',
    framePrompts: [
      'Compression into the dash, body leaning forward',
      'Explosive burst forward, motion clearly readable'
    ]
  },

  cast: {
    name: 'Cast Animation',
    frames: 4,
    basePrompt: 'Character channeling a spell or ability with deliberate hand placement and readable magical anticipation.',
    framePrompts: [
      'Focus pose, energy gathering at the core',
      'Arms lifting into the casting channel',
      'Spell release moment, energy visibly directed',
      'Recovery pose, magic dissipating'
    ]
  },

  air_attack: {
    name: 'Air Attack',
    frames: 2,
    basePrompt: 'Character executing an aerial attack with powerful striking motion while airborne.',
    framePrompts: [
      'Wind-up pose in air, preparing strike',
      'Full extension of aerial attack, maximum reach'
    ]
  },

  death: {
    name: 'Death Animation',
    frames: 6,
    basePrompt: 'Character collapsing into a clear defeat sequence with a final resting pose.',
    framePrompts: [
      'Impact reaction, balance beginning to fail',
      'Body tipping out of the stance',
      'Falling through the middle of the collapse',
      'Near-ground horizontal transition',
      'Landing and settling on the ground',
      'Final resting pose, fully resolved'
    ]
  },

  hurt: {
    name: 'Hurt Animation',
    frames: 2,
    basePrompt: 'Character reacting to taking damage, showing pain and recoil motion.',
    framePrompts: [
      'Initial impact reaction, body tensing, face grimacing',
      'Recoil position, defensive stance, showing pain'
    ]
  },

  knock_out: {
    name: 'Knockout Animation',
    frames: 6,
    basePrompt: 'Character being defeated and falling to the ground, dramatic motion.',
    framePrompts: [
      'Initial impact reaction, losing balance',
      'Beginning to fall backward',
      'Mid-fall, limbs starting to go limp',
      'Near ground, body horizontal',
      'Impact with ground, slight bounce',
      'Final resting position, defeated'
    ]
  },

  punches: {
    name: 'Punch Combinations',
    frames: 8,
    basePrompt: 'Character executing various punch attacks with proper fighting stance and form.',
    framePrompts: [
      'Ready stance, guard up',
      'Right jab initiation',
      'Right jab extension',
      'Recovery and left hook wind-up',
      'Left hook execution',
      'Hook follow-through',
      'Uppercut preparation',
      'Uppercut connection'
    ]
  },

  turn_around: {
    name: 'Turn Around Animation',
    frames: 3,
    basePrompt: 'Character smoothly changing direction with a 180-degree turn.',
    framePrompts: [
      'Beginning turn, weight shift initiation',
      'Mid-turn, profile view, arms following motion',
      'Completing turn, settling into new direction'
    ]
  }
};

const ACTION_STAGE_MAP = {
  idle: 'south_front_anchor',
  walk: 'walk_cycle_instructions',
  attack: 'action_pose_board',
  hurt: 'frame_recovery_instructions',
  jump: 'directional_anchors_nsew',
  death: 'runtime_normalize_and_align',
  cast: 'per_frame_chroma_layout_snap',
  dash: 'pixel_snap_anchor',
  air_attack: 'action_pose_board',
  knock_out: 'frame_recovery_instructions',
  punches: 'action_pose_board',
  turn_around: 'directional_anchors_nsew'
};

function getPromptBuilderOverrides() {
  if (typeof window === 'undefined') {
    return {};
  }
  return window.spritePromptBuilderState || {};
}

/////////////////////////////////////
// 5.  Prompt Generation Functions //
/////////////////////////////////////

/**
 * Build the full prompt to send to GPT-Image 1.
 */
export function generateSpritePrompt(styleId, actionId, referenceToken = 'REF_CHAR', seed, frameIndex = 0, isContinuation = false) {
  const style = STYLE_PROMPTS.find((s) => s.id === styleId);
  const action = ACTION_PROMPTS[actionId];

  if (!style || !action) {
    throw new Error(`Invalid style (${styleId}) or action (${actionId})`);
  }

  // Validate frame index
  if (frameIndex < 0 || frameIndex >= action.frames) {
    throw new Error(`Invalid frame index ${frameIndex} for action ${actionId}`);
  }

  const builderState = getPromptBuilderOverrides();
  const stageId = ACTION_STAGE_MAP[actionId] || builderState.stageId || DEFAULT_PROMPT_VALUES.stageId;
  const styleBlock = style.buildBlock ? style.buildBlock().trim() : style.name;
  const actionFrameText = action.framePrompts?.[frameIndex] || action.basePrompt || action.name;
  let motionDescription = action.frames > 1
    ? (frameIndex === 0
      ? `This is the FIRST frame of a ${action.frames}-frame animation sequence.`
      : frameIndex === action.frames - 1
        ? `This is the FINAL frame (${frameIndex + 1}/${action.frames}) of the animation sequence.`
        : `This is frame ${frameIndex + 1} in a ${action.frames}-frame animation sequence.`)
    : '';

  const promptCore = buildPrompt({
    stageId,
    coreIdentity: builderState.coreIdentity || referenceToken,
    costumeAndPalette: builderState.costumeAndPalette || styleBlock,
    silhouetteNotes: builderState.silhouetteNotes || `${action.basePrompt} ${actionFrameText}`.trim(),
    styleTarget: builderState.styleTarget || style.name,
    actionName: builderState.actionName || action.name,
    direction: builderState.direction || 'south',
    cellSize: builderState.cellSize || DEFAULT_PROMPT_VALUES.cellSize,
    backgroundColor: builderState.backgroundColor || DEFAULT_PROMPT_VALUES.backgroundColor,
    paletteLimit: builderState.paletteLimit || DEFAULT_PROMPT_VALUES.paletteLimit,
    outputSheetRows: builderState.outputSheetRows || DEFAULT_PROMPT_VALUES.outputSheetRows,
    outputSheetColumns: builderState.outputSheetColumns || DEFAULT_PROMPT_VALUES.outputSheetColumns,
    footAnchorX: builderState.footAnchorX || DEFAULT_PROMPT_VALUES.footAnchorX,
    footAnchorY: builderState.footAnchorY || DEFAULT_PROMPT_VALUES.footAnchorY
  });

  const continuityBlock = isContinuation
    ? `Continuity: DIRECTLY CONTINUE from the previous frame. Frame ${frameIndex + 1} must preserve exact character design, palette, outline thickness, and pose logic while remaining lower fidelity than the input image.`
    : '';

  const seedLine = seed !== undefined ? `Seed: ${seed}` : '';
  if (action.frames > 1) {
    if (frameIndex > 0) {
      motionDescription += ` Previous frame showed: ${action.framePrompts[frameIndex - 1]}`;
    }
    if (frameIndex < action.frames - 1) {
      motionDescription += ` Next frame will show: ${action.framePrompts[frameIndex + 1]}`;
    }
  }

  const fullPrompt = [
    SPRITE_SYSTEM_PRIMER,
    `Character: ${referenceToken}`,
    `Style profile: ${styleBlock}`,
    promptCore,
    `Frame: ${frameIndex + 1}/${action.frames}`,
    `Action: ${action.name}`,
    `Base Description: ${action.basePrompt}`,
    `Frame Description: ${action.framePrompts[frameIndex]}`,
    motionDescription,
    continuityBlock,
    seedLine,
    style.isReferenceOnly ? `Reference mode: preserve the source character structure while keeping the production green-screen workflow.` : '',
    `Avoid: ${NEGATIVE_ITEMS}`,
    `IMPORTANT: Output image MUST have a flat opaque chroma green background (#00FF00) with no transparent background during generation.`,
    isContinuation ? `This frame is part of a sequential animation and MUST flow naturally from the previous frame.` : ''
  ]
    .filter(Boolean)
    .join('\n');

  return fullPrompt;
}

// Helper function to check if we've completed an animation sequence
export function isAnimationComplete(actionId, frameIndex) {
  const action = ACTION_PROMPTS[actionId];
  return !action || frameIndex >= action.frames;
}

// Helper function to get total frames for an action
export function getActionFrameCount(actionId) {
  return ACTION_PROMPTS[actionId]?.frames || 0;
}

/**
 * Generate a style preview prompt with just the style information.
 */
export function makeStylePreview(styleId) {
  console.log('Generating style preview prompt:', { styleId });

  const style = STYLE_PROMPTS.find(s => s.id === styleId);
  if (!style) {
    console.error('Style not found for preview:', { 
      requestedStyle: styleId, 
      availableStyles: STYLE_PROMPTS.map(s => s.id) 
    });
    throw new Error(`Unknown style: ${styleId}`);
  }
  
  const styleBlock = style.buildBlock().trim();
  const fullPrompt = buildPrompt({
    stageId: 'south_front_anchor',
    coreIdentity: style.name,
    costumeAndPalette: styleBlock,
    silhouetteNotes: 'Create the style preview using a neutral full-body front view.',
    styleTarget: style.name,
    actionName: 'idle',
    direction: 'south',
    cellSize: DEFAULT_PROMPT_VALUES.cellSize,
    backgroundColor: DEFAULT_PROMPT_VALUES.backgroundColor,
    paletteLimit: DEFAULT_PROMPT_VALUES.paletteLimit,
    outputSheetRows: DEFAULT_PROMPT_VALUES.outputSheetRows,
    outputSheetColumns: DEFAULT_PROMPT_VALUES.outputSheetColumns,
    footAnchorX: DEFAULT_PROMPT_VALUES.footAnchorX,
    footAnchorY: DEFAULT_PROMPT_VALUES.footAnchorY
  });

  console.log('Final preview prompt:', {
    styleId,
    promptLength: fullPrompt.length,
    fullPrompt
  });

  return fullPrompt;
} 
