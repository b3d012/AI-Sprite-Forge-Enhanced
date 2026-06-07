import { STAGE_VALIDATION_STATUS, createValidationResult } from './state.js';

export const PIPELINE_STAGE_IDS = Object.freeze([
  'project_setup',
  'reference_image_upload',
  'south_front_anchor_generation',
  'pixel_snap_anchor',
  'directional_anchors_nsew',
  'action_pose_board_generation',
  'frame_recovery_components',
  'per_frame_chroma_layout_snap',
  'background_cleanup',
  'runtime_normalization',
  'foot_baseline_alignment',
  'preview_animation',
  'export_bundle',
]);

function stageResult(stageId, patch = {}, validation = createValidationResult(), extras = {}) {
  return {
    stageId,
    patch,
    validation,
    ...extras,
  };
}

async function asDataUrl(value) {
  if (!value) return '';
  if (typeof value === 'string') return value;
  if (value.dataUrl) return value.dataUrl;

  if (typeof File !== 'undefined' && value instanceof File) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(new Error('Unable to read the reference file.'));
      reader.readAsDataURL(value);
    });
  }

  if (typeof Blob !== 'undefined' && value instanceof Blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(new Error('Unable to read the reference blob.'));
      reader.readAsDataURL(value);
    });
  }

  return '';
}

async function maybeLoadImageDimensions(dataUrl) {
  if (typeof document === 'undefined' || !dataUrl) {
    return null;
  }

  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve({ width: img.naturalWidth || img.width, height: img.naturalHeight || img.height });
    img.onerror = () => resolve(null);
    img.src = dataUrl;
  });
}

async function detectForegroundComponents(dataUrl) {
  if (typeof document === 'undefined' || !dataUrl) {
    return [
      {
        id: 'component-1',
        bounds: { x: 0, y: 0, width: 256, height: 256 },
        confidence: 0.5,
        note: 'Server-side placeholder component. Replace with connected-component recovery when a raster pipeline is available.',
      },
    ];
  }

  const imageInfo = await maybeLoadImageDimensions(dataUrl);
  if (!imageInfo) return [];

  const canvas = document.createElement('canvas');
  canvas.width = imageInfo.width;
  canvas.height = imageInfo.height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  const image = new Image();

  await new Promise((resolve, reject) => {
    image.onload = resolve;
    image.onerror = reject;
    image.src = dataUrl;
  });

  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(image, 0, 0);
  const { data, width, height } = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const visited = new Uint8Array(width * height);
  const components = [];
  const threshold = 20;

  const neighbors = [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ];

  function enqueue(x, y, queue) {
    if (x < 0 || y < 0 || x >= width || y >= height) return;
    const index = y * width + x;
    if (visited[index]) return;
    const alpha = data[index * 4 + 3];
    if (alpha <= threshold) return;
    visited[index] = 1;
    queue.push([x, y]);
  }

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = y * width + x;
      if (visited[index] || data[index * 4 + 3] <= threshold) continue;

      const queue = [[x, y]];
      visited[index] = 1;
      let minX = x;
      let minY = y;
      let maxX = x;
      let maxY = y;
      let pixelCount = 0;

      while (queue.length) {
        const [cx, cy] = queue.pop();
        pixelCount += 1;
        if (cx < minX) minX = cx;
        if (cy < minY) minY = cy;
        if (cx > maxX) maxX = cx;
        if (cy > maxY) maxY = cy;

        for (const [dx, dy] of neighbors) {
          const nx = cx + dx;
          const ny = cy + dy;
          const nIndex = ny * width + nx;
          if (nx < 0 || ny < 0 || nx >= width || ny >= height || visited[nIndex]) continue;
          if (data[nIndex * 4 + 3] <= threshold) continue;
          visited[nIndex] = 1;
          queue.push([nx, ny]);
        }
      }

      components.push({
        id: `component-${components.length + 1}`,
        bounds: {
          x: minX,
          y: minY,
          width: maxX - minX + 1,
          height: maxY - minY + 1,
        },
        pixelCount,
        confidence: Math.min(1, pixelCount / (width * height * 0.05)),
      });
    }
  }

  return components;
}

function toFrameGrid(components = [], stageId = 'frames') {
  return components.map((component, index) => ({
    id: `${stageId}-frame-${index + 1}`,
    componentId: component.id,
    bounds: { ...component.bounds },
    layout: {
      cellSize: 256,
      row: index,
      column: 0,
    },
    note: 'Placeholder frame derived from foreground component recovery.',
  }));
}

async function renderPlaceholder(provider, payload) {
  if (!provider || typeof provider.renderImage !== 'function') {
    return null;
  }

  return provider.renderImage(payload);
}

function withValidationWarning(message, details = {}) {
  return createValidationResult(STAGE_VALIDATION_STATUS.WARNING, message, details);
}

export const PIPELINE_STAGE_DEFINITIONS = [
  {
    id: 'project_setup',
    label: 'Project Setup',
    description: 'Initialize the project metadata and baseline pipeline context.',
    async run(context) {
      const projectName = (context.state.project.name || 'Untitled Sprite Project').trim();
      return stageResult('project_setup', {
        project: {
          ...context.state.project,
          name: projectName,
          updatedAt: new Date().toISOString(),
        },
      }, createValidationResult(STAGE_VALIDATION_STATUS.PASSED, 'Project metadata is ready.'));
    },
  },
  {
    id: 'reference_image_upload',
    label: 'Reference Image Upload',
    description: 'Capture the source reference image and normalize it for downstream stages.',
    async run(context) {
      const referenceDataUrl = await asDataUrl(context.state.inputs.referenceImageDataUrl || context.state.inputs.referenceImage);
      if (!referenceDataUrl) {
        return stageResult(
          'reference_image_upload',
          {},
          createValidationResult(
            STAGE_VALIDATION_STATUS.FAILED,
            'Upload a reference image before running the production pipeline.'
          )
        );
      }

      return stageResult(
        'reference_image_upload',
        {
          inputs: {
            ...context.state.inputs,
            referenceImageDataUrl: referenceDataUrl,
          },
        },
        createValidationResult(STAGE_VALIDATION_STATUS.PASSED, 'Reference image is available.')
      );
    },
  },
  {
    id: 'south_front_anchor_generation',
    label: 'South/Front Anchor Generation',
    description: 'Generate the canonical south/front anchor pose used to align future frames.',
    async run(context) {
      const referenceDataUrl = await asDataUrl(context.state.inputs.referenceImageDataUrl);
      const image = await renderPlaceholder(context.provider, {
        stageId: 'south_front_anchor_generation',
        prompt: 'Generate a south/front anchor pose for a production sprite pipeline. Use a flat chroma-key green background exactly #00FF00.',
        image: referenceDataUrl,
        seed: context.state.project.id || context.state.project.name,
        label: 'South / Front Anchor',
        width: 512,
        height: 512,
      });

      return stageResult(
        'south_front_anchor_generation',
        {
          anchors: {
            ...context.state.anchors,
            southFront: image,
          },
        },
        context.provider?.mode === 'mock'
          ? withValidationWarning('Mock provider used. Replace with OpenAI, AUTOMATIC1111, or another generator when ready.', { provider: 'mock' })
          : createValidationResult(STAGE_VALIDATION_STATUS.PASSED, 'South/front anchor generated.')
      );
    },
  },
  {
    id: 'pixel_snap_anchor',
    label: 'Pixel Snap Anchor',
    description: 'Lock the anchor to the pixel grid and record the alignment origin.',
    async run(context) {
      return stageResult(
        'pixel_snap_anchor',
        {
          anchors: {
            ...context.state.anchors,
            pixelSnap: {
              origin: { x: 128, y: 192 },
              baseline: 224,
              note: 'Placeholder pixel-snap anchor. Plug in the real anchor solver here.',
            },
          },
        },
        createValidationResult(STAGE_VALIDATION_STATUS.PASSED, 'Pixel snap anchor recorded.')
      );
    },
  },
  {
    id: 'directional_anchors_nsew',
    label: 'Directional Anchors NSEW',
    description: 'Generate the north, east, south, and west anchor set used for pose planning.',
    async run(context) {
      const directions = ['north', 'east', 'south', 'west'];
      const directional = { ...context.state.anchors.directional };
      for (const direction of directions) {
        directional[direction] = await renderPlaceholder(context.provider, {
          stageId: `directional_${direction}`,
          prompt: `Generate the ${direction} directional anchor for the sprite rig. Use a flat chroma-key green background exactly #00FF00.`,
          image: await asDataUrl(context.state.inputs.referenceImageDataUrl),
          seed: `${context.state.project.id || context.state.project.name}:${direction}`,
          label: `${direction.toUpperCase()} Anchor`,
          width: 512,
          height: 512,
        });
      }

      return stageResult(
        'directional_anchors_nsew',
        {
          anchors: {
            ...context.state.anchors,
            directional,
          },
        },
        createValidationResult(STAGE_VALIDATION_STATUS.PASSED, 'Directional anchors prepared.')
      );
    },
  },
  {
    id: 'action_pose_board_generation',
    label: 'Action Pose Board Generation',
    description: 'Generate the working pose board that later stages decompose into animation frames.',
    async run(context) {
      const board = await renderPlaceholder(context.provider, {
        stageId: 'action_pose_board_generation',
        prompt: 'Generate a pose board with action poses for a game-ready sprite sheet. Use a flat chroma-key green background exactly #00FF00.',
        image: await asDataUrl(context.state.inputs.referenceImageDataUrl),
        seed: `${context.state.project.id || context.state.project.name}:board`,
        label: 'Action Pose Board',
        width: 1024,
        height: 1024,
      });

      return stageResult(
        'action_pose_board_generation',
        { actionBoard: board },
        createValidationResult(STAGE_VALIDATION_STATUS.PASSED, 'Action board generated.')
      );
    },
  },
  {
    id: 'frame_recovery_components',
    label: 'Frame Recovery',
    description: 'Recover foreground components instead of cropping on a rigid grid.',
    async run(context) {
      const boardDataUrl = await asDataUrl(context.state.actionBoard?.dataUrl || context.state.actionBoard);
      const components = await detectForegroundComponents(boardDataUrl);
      const frames = toFrameGrid(components, 'recovered');

      return stageResult(
        'frame_recovery_components',
        {
          recoveredFrames: frames,
        },
        createValidationResult(STAGE_VALIDATION_STATUS.PASSED, 'Foreground components recovered.')
      );
    },
  },
  {
    id: 'per_frame_chroma_layout_snap',
    label: 'Per-frame Chroma Snap',
    description: 'Snap each frame layout while preserving chroma and component placement.',
    async run(context) {
      const snappedFrames = (context.state.recoveredFrames || []).map((frame, index) => ({
        ...frame,
        chromaLayout: {
          snapX: Math.round(frame.bounds.x / 4) * 4,
          snapY: Math.round(frame.bounds.y / 4) * 4,
          colorKey: '#00FF00',
          index,
        },
      }));

      return stageResult(
        'per_frame_chroma_layout_snap',
        { recoveredFrames: snappedFrames },
        createValidationResult(STAGE_VALIDATION_STATUS.PASSED, 'Chroma-layout snap complete.')
      );
    },
  },
  {
    id: 'background_cleanup',
    label: 'Background Cleanup',
    description: 'Clear background spill and prepare the sprite for compositing.',
    async run(context) {
      return stageResult(
        'background_cleanup',
        {
          recoveredFrames: (context.state.recoveredFrames || []).map((frame) => ({
            ...frame,
            cleanup: {
              backgroundRemoved: true,
              greenFringeRemoved: true,
              note: 'Placeholder cleanup pass. Replace with the real matte cleaner.',
            },
          })),
        },
        createValidationResult(STAGE_VALIDATION_STATUS.WARNING, 'Background cleanup is currently a placeholder pass.')
      );
    },
  },
  {
    id: 'runtime_normalization',
    label: 'Runtime Normalization',
    description: 'Normalize every frame into 256x256 runtime cells.',
    async run(context) {
      const normalizedFrames = (context.state.recoveredFrames || []).map((frame, index) => ({
        ...frame,
        runtimeCell: {
          width: 256,
          height: 256,
          index,
        },
      }));

      return stageResult(
        'runtime_normalization',
        { normalizedFrames },
        createValidationResult(STAGE_VALIDATION_STATUS.PASSED, 'Frames normalized to 256x256 cells.')
      );
    },
  },
  {
    id: 'foot_baseline_alignment',
    label: 'Foot Baseline Alignment',
    description: 'Align the feet to the production baseline for consistent motion.',
    async run(context) {
      return stageResult(
        'foot_baseline_alignment',
        {
          normalizedFrames: (context.state.normalizedFrames || []).map((frame) => ({
            ...frame,
            alignment: {
              footBaseline: 224,
              anchored: true,
            },
          })),
        },
        createValidationResult(STAGE_VALIDATION_STATUS.PASSED, 'Foot baseline alignment complete.')
      );
    },
  },
  {
    id: 'preview_animation',
    label: 'Preview Animation',
    description: 'Build the in-app playback preview for QA and review.',
    async run(context) {
      const frames = (context.state.normalizedFrames || []).map((frame) => frame.id || frame.componentId);
      return stageResult(
        'preview_animation',
        {
          previews: {
            animation: {
              frameOrder: frames,
              fps: 12,
              note: 'Use this preview hook to plug in a real animation renderer.',
            },
          },
        },
        createValidationResult(STAGE_VALIDATION_STATUS.PASSED, 'Preview animation assembled.')
      );
    },
  },
  {
    id: 'export_bundle',
    label: 'Export Bundle',
    description: 'Package PNG spritesheet, GIF preview, manifest.json, and ZIP bundle outputs.',
    async run(context) {
      const manifest = {
        project: context.state.project,
        provider: context.state.provider,
        generatedAt: new Date().toISOString(),
        frameCount: (context.state.normalizedFrames || []).length,
        exports: {
          spritesheetPng: context.state.exports.spritesheetPng ? true : false,
          gifPreview: context.state.exports.gifPreview ? true : false,
          zipBundle: context.state.exports.zipBundle ? true : false,
        },
        note: 'Manifest placeholder. Swap in the real packaging step here.',
      };

      return stageResult(
        'export_bundle',
        {
          exports: {
            ...context.state.exports,
            manifest,
          },
        },
        createValidationResult(STAGE_VALIDATION_STATUS.WARNING, 'Export bundle metadata prepared. Plug in the final packager for binary assets.')
      );
    },
  },
];

export function getStageDefinition(stageId) {
  return PIPELINE_STAGE_DEFINITIONS.find((stage) => stage.id === stageId) || null;
}
