import { describe, expect, it } from 'vitest';
import { getLocalSdPreset, getLocalSdPresetOptions } from '../../js/prompts/buildPrompt.js';

describe('local stable diffusion presets', () => {
  it('exposes the reusable sprite presets with editable defaults', () => {
    const presets = getLocalSdPresetOptions();

    expect(presets).toHaveLength(4);
    expect(presets.map((preset) => preset.id)).toContain('jrpg_character_sprite');
    expect(presets.map((preset) => preset.id)).toContain('pixel_sprite_sheet_concept');
    expect(presets.map((preset) => preset.id)).toContain('sprite_anchor_from_reference');

    const jrpg = getLocalSdPreset('jrpg_character_sprite');
    expect(jrpg.label).toBe('16-bit JRPG Character Sprite');
    expect(jrpg.promptTemplate).toContain('full body character sprite');
    expect(jrpg.negativePrompt).toContain('realistic, photorealistic');
    expect(jrpg.settings).toMatchObject({
      width: 1024,
      height: 1024,
      steps: 25,
      cfg_scale: 7,
      sampler_name: 'DPM++ 2M Karras',
      batch_size: 1
    });
  });

  it('falls back to the custom preset when the id is unknown', () => {
    expect(getLocalSdPreset('missing')).toMatchObject({
      id: 'custom',
      label: 'Custom'
    });
  });
});
