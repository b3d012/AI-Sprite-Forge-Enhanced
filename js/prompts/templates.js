export const PROMPT_TEMPLATES = Object.freeze({
  south_front_anchor: {
    id: 'south_front_anchor',
    label: 'South/front anchor',
    description: 'Create the canonical front-facing anchor sprite.',
    body: `
Production sprite pipeline stage: South/front anchor.
Create the canonical reference sprite for downstream animation and alignment.

Character identity:
{{coreIdentity}}

Costume and palette:
{{costumeAndPalette}}

Silhouette notes:
{{silhouetteNotes}}

Style target:
{{styleTarget}}

Required output:
- Canvas: 1024x1024
- Background: exact {{backgroundColor}}, flat opaque chroma green
- Composition: one centered full-body south-facing character
- Fidelity: lower than the input image, chunky readable pixel art
- Palette: {{paletteLimit}}
- Outline: dark outline clusters, clean edge clusters, no soft rendering
- Lighting: no shadows
- Transparency: no transparent background during generation
- Feet: anchor the stance at {{footAnchorX}},{{footAnchorY}}
- Direction: {{direction}}
`
  },
  pixel_snap_anchor: {
    id: 'pixel_snap_anchor',
    label: 'Pixel snap anchor',
    description: 'Lock the character to the runtime cell grid and foot anchor.',
    body: `
Production sprite pipeline stage: Pixel snap anchor.
Use this stage to lock the sprite to a stable runtime cell and foot anchor.

Character identity:
{{coreIdentity}}

Costume and palette:
{{costumeAndPalette}}

Silhouette notes:
{{silhouetteNotes}}

Style target:
{{styleTarget}}

Required output:
- Runtime cell: {{cellSize}}
- Background: exact {{backgroundColor}}, flat opaque chroma green
- Palette: {{paletteLimit}}
- Snap the body to the grid without drifting off the foot anchor
- Keep the character centered inside the runtime cell
- Preserve a lower fidelity chunky JRPG pixel look
- No shadows, no transparent background, no backdrop variation
- Anchor feet at {{footAnchorX}},{{footAnchorY}}
- Direction: {{direction}}
`
  },
  directional_anchors_nsew: {
    id: 'directional_anchors_nsew',
    label: 'Directional anchors NSEW',
    description: 'Create the north, south, east, and west anchor set.',
    body: `
Production sprite pipeline stage: Directional anchors NSEW.
Build the anchor set for {{outputSheetColumns}} columns by {{outputSheetRows}} rows so the runtime can read the character from every direction.

Character identity:
{{coreIdentity}}

Costume and palette:
{{costumeAndPalette}}

Silhouette notes:
{{silhouetteNotes}}

Style target:
{{styleTarget}}

Required output:
- Sheet layout: {{outputSheetColumns}} columns x {{outputSheetRows}} rows
- Cell size: {{cellSize}}
- Background: exact {{backgroundColor}}, flat opaque chroma green
- Directions to cover: north, south, east, west
- Keep each direction clearly readable and internally consistent
- Use {{paletteLimit}} with dark outline clusters
- No shadows and no transparent background during generation
- Foot anchor: {{footAnchorX}},{{footAnchorY}}
- Active direction hint: {{direction}}
`
  },
  action_pose_board: {
    id: 'action_pose_board',
    label: 'Action pose board',
    description: 'Lay out the motion board for the selected action.',
    body: `
Production sprite pipeline stage: Action pose board.
Create a clear action board for "{{actionName}}" that communicates the key pose language before frame interpolation.

Character identity:
{{coreIdentity}}

Costume and palette:
{{costumeAndPalette}}

Silhouette notes:
{{silhouetteNotes}}

Style target:
{{styleTarget}}

Required output:
- Build a readable pose board for the action "{{actionName}}"
- Keep the stance grounded in the pixel grid
- Background: exact {{backgroundColor}}, flat opaque chroma green
- Palette: {{paletteLimit}}
- Use dark outline clusters and compact shape language
- No shadows and no transparent background during generation
- Frame intent should be obvious at a glance
- Foot anchor: {{footAnchorX}},{{footAnchorY}}
- Direction: {{direction}}
`
  },
  frame_recovery_instructions: {
    id: 'frame_recovery_instructions',
    label: 'Frame recovery instructions',
    description: 'Repair drifted or broken frames without breaking continuity.',
    body: `
Production sprite pipeline stage: Frame recovery instructions.
Recover the frame using the surrounding pose logic, keeping the sprite usable for animation cleanup.

Character identity:
{{coreIdentity}}

Costume and palette:
{{costumeAndPalette}}

Silhouette notes:
{{silhouetteNotes}}

Style target:
{{styleTarget}}

Required output:
- Recover the frame for the action "{{actionName}}"
- Keep the silhouette consistent with adjacent frames
- Maintain the same cell size {{cellSize}} and foot anchor {{footAnchorX}},{{footAnchorY}}
- Background: exact {{backgroundColor}}, flat opaque chroma green
- Use {{paletteLimit}} and preserve outline clusters
- Remove drift, pose wobble, and accidental extra detail
- No shadows and no transparent background during generation
- Direction: {{direction}}
`
  },
  walk_cycle_instructions: {
    id: 'walk_cycle_instructions',
    label: 'Walk cycle instructions',
    description: 'Generate a loopable walk sequence with stable cadence.',
    body: `
Production sprite pipeline stage: Walk cycle instructions.
Create a loopable walk cycle for "{{actionName}}" with disciplined footfalls and consistent timing.

Character identity:
{{coreIdentity}}

Costume and palette:
{{costumeAndPalette}}

Silhouette notes:
{{silhouetteNotes}}

Style target:
{{styleTarget}}

Required output:
- The cycle must read as a clean {{direction}} walk
- Keep the stride consistent across frames
- Background: exact {{backgroundColor}}, flat opaque chroma green
- Cell size: {{cellSize}}
- Palette: {{paletteLimit}}
- Preserve the same foot anchor {{footAnchorX}},{{footAnchorY}} in every frame
- No shadows and no transparent background during generation
- Use compact motion arcs, not exaggerated modern animation
`
  },
  per_frame_chroma_layout_snap: {
    id: 'per_frame_chroma_layout_snap',
    label: 'Per-frame chroma-layout snap',
    description: 'Snap each frame to a fixed chroma layout for export.',
    body: `
Production sprite pipeline stage: Per-frame chroma-layout snap.
Snap each generated frame into the chroma layout so the runtime can keep sheet exports aligned.

Character identity:
{{coreIdentity}}

Costume and palette:
{{costumeAndPalette}}

Silhouette notes:
{{silhouetteNotes}}

Style target:
{{styleTarget}}

Required output:
- Runtime sheet layout: {{outputSheetColumns}} columns x {{outputSheetRows}} rows
- Cell size: {{cellSize}}
- Background: exact {{backgroundColor}}, flat opaque chroma green
- Palette: {{paletteLimit}}
- Keep every frame aligned to the same anchor point
- Use dark outline clusters and avoid shadow noise
- No transparent background during generation
- Direction: {{direction}}
- Foot anchor: {{footAnchorX}},{{footAnchorY}}
`
  },
  runtime_normalize_and_align: {
    id: 'runtime_normalize_and_align',
    label: 'Runtime normalize and align',
    description: 'Normalize exported frames for runtime placement.',
    body: `
Production sprite pipeline stage: Runtime normalize and align.
Normalize the final sprite output so the runtime can place it consistently in-game.

Character identity:
{{coreIdentity}}

Costume and palette:
{{costumeAndPalette}}

Silhouette notes:
{{silhouetteNotes}}

Style target:
{{styleTarget}}

Required output:
- Normalize to cell size {{cellSize}}
- Sheet layout: {{outputSheetColumns}} columns x {{outputSheetRows}} rows
- Background: exact {{backgroundColor}}, flat opaque chroma green
- Palette: {{paletteLimit}}
- Maintain the same foot anchor {{footAnchorX}},{{footAnchorY}}
- Keep the sprite centered and stable in runtime space
- No shadows and no transparent background during generation
- Direction: {{direction}}
`
  }
});

export const PROMPT_TEMPLATE_LIST = Object.freeze(
  Object.values(PROMPT_TEMPLATES)
);

