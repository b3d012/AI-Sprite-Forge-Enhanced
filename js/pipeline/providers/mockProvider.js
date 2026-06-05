function hashString(input = '') {
  let hash = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function pick(seed, options) {
  return options[seed % options.length];
}

function escapeXml(value = '') {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function stageTheme(stageId = '') {
  if (/south_front_anchor|directional_anchors|action_pose_board|anchor_generation/i.test(stageId)) {
    return 'generation';
  }
  if (/pixel_snap|frame_recovery|background_cleanup|runtime_normalization|foot_baseline|preview_animation/i.test(stageId)) {
    return 'process';
  }
  return 'generic';
}

function backgroundForTheme(theme, seed) {
  if (theme === 'generation') {
    return ['#00FF00', '#00E600'];
  }
  if (theme === 'process') {
    return [pick(seed, ['#111827', '#0F172A', '#1E293B']), pick(seed >> 3, ['#1F2937', '#374151', '#334155'])];
  }
  return [pick(seed, ['#0F172A', '#111827', '#18181B']), pick(seed >> 3, ['#1E293B', '#27272A', '#374151'])];
}

function sceneLabel(stageId, label) {
  if (label) return label;
  if (/south_front_anchor_generation/i.test(stageId)) return 'South Anchor';
  if (/directional_anchors_nsew/i.test(stageId)) return 'Directional Anchors';
  if (/action_pose_board_generation/i.test(stageId)) return 'Pose Board';
  if (/frame_recovery_components/i.test(stageId)) return 'Recovered Frames';
  if (/per_frame_chroma_layout_snap/i.test(stageId)) return 'Chroma Snap';
  return stageId || 'Mock Stage';
}

function buildSheetSvg({
  width,
  height,
  stageId,
  prompt = '',
  seed = '',
  label = '',
}) {
  const baseSeed = hashString(`${stageId}|${prompt}|${seed}|${width}x${height}`);
  const accent = pick(baseSeed, ['#F97316', '#38BDF8', '#A78BFA', '#22C55E', '#FB7185']);
  const accent2 = pick(baseSeed >> 5, ['#FDE047', '#60A5FA', '#34D399', '#F472B6', '#FB923C']);
  const [bg1, bg2] = backgroundForTheme(stageTheme(stageId), baseSeed);
  const text = escapeXml(sceneLabel(stageId, label));
  const promptLine = escapeXml(prompt.slice(0, 110));
  const theme = stageTheme(stageId);

  const character = theme === 'generation'
    ? `
      <g filter="url(#shadow)">
        <circle cx="${width * 0.5}" cy="${height * 0.32}" r="${Math.min(width, height) * 0.16}" fill="${accent2}" opacity="0.92" />
        <rect x="${width * 0.36}" y="${height * 0.42}" width="${width * 0.28}" height="${height * 0.32}" rx="${width * 0.07}" fill="${accent}" opacity="0.95" />
        <rect x="${width * 0.27}" y="${height * 0.46}" width="${width * 0.09}" height="${height * 0.18}" rx="${width * 0.04}" fill="#E5E7EB" />
        <rect x="${width * 0.64}" y="${height * 0.46}" width="${width * 0.09}" height="${height * 0.18}" rx="${width * 0.04}" fill="#E5E7EB" />
        <rect x="${width * 0.41}" y="${height * 0.74}" width="${width * 0.06}" height="${height * 0.16}" rx="${width * 0.02}" fill="#F3F4F6" />
        <rect x="${width * 0.53}" y="${height * 0.74}" width="${width * 0.06}" height="${height * 0.16}" rx="${width * 0.02}" fill="#F3F4F6" />
      </g>
    `
    : theme === 'process'
      ? `
        <g filter="url(#shadow)">
          <rect x="${width * 0.18}" y="${height * 0.18}" width="${width * 0.64}" height="${height * 0.54}" rx="${width * 0.08}" fill="${accent}" opacity="0.92" />
          <circle cx="${width * 0.5}" cy="${height * 0.43}" r="${Math.min(width, height) * 0.12}" fill="${accent2}" opacity="0.95" />
          <rect x="${width * 0.34}" y="${height * 0.74}" width="${width * 0.32}" height="${height * 0.08}" rx="${width * 0.03}" fill="#F3F4F6" opacity="0.9" />
        </g>
      `
      : `
        <g filter="url(#shadow)">
          <ellipse cx="${width * 0.5}" cy="${height * 0.5}" rx="${width * 0.28}" ry="${height * 0.22}" fill="${accent}" opacity="0.92" />
          <polygon points="${width * 0.5},${height * 0.14} ${width * 0.84},${height * 0.56} ${width * 0.5},${height * 0.9} ${width * 0.16},${height * 0.56}" fill="${accent2}" opacity="0.9" />
        </g>
      `;

  return `
    <svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
      <defs>
        <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stop-color="${bg1}" />
          <stop offset="100%" stop-color="${bg2}" />
        </linearGradient>
        <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">
          <feDropShadow dx="0" dy="12" stdDeviation="10" flood-color="#000" flood-opacity="0.35"/>
        </filter>
      </defs>
      <rect width="100%" height="100%" fill="url(#bg)" />
      <rect x="${width * 0.08}" y="${height * 0.08}" width="${width * 0.84}" height="${height * 0.12}" rx="${width * 0.03}" fill="#000" opacity="0.25" />
      <text x="${width * 0.1}" y="${height * 0.14}" font-family="Arial, sans-serif" font-size="${Math.max(14, Math.floor(width * 0.03))}" fill="#fff" font-weight="700">${text}</text>
      <text x="${width * 0.1}" y="${height * 0.19}" font-family="Arial, sans-serif" font-size="${Math.max(10, Math.floor(width * 0.02))}" fill="#F3F4F6">${promptLine}</text>
      ${character}
      <circle cx="${width * 0.16}" cy="${height * 0.8}" r="${Math.min(width, height) * 0.08}" fill="${accent2}" opacity="0.2" />
      <circle cx="${width * 0.82}" cy="${height * 0.82}" r="${Math.min(width, height) * 0.12}" fill="${accent}" opacity="0.14" />
    </svg>
  `.replace(/\s+\n/g, '').replace(/\n\s+/g, '');
}

function makeDataUrl(svg) {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

export class MockImageProvider {
  constructor(options = {}) {
    this.mode = 'mock';
    this.width = options.width || 512;
    this.height = options.height || 512;
  }

  getStatus() {
    return {
      mode: this.mode,
      ready: true,
      source: 'deterministic-mock',
    };
  }

  async renderImage({
    stageId = 'mock-stage',
    prompt = '',
    seed = '',
    width = this.width,
    height = this.height,
    label = '',
  } = {}) {
    const svg = buildSheetSvg({ width, height, stageId, prompt, seed, label });
    return {
      provider: this.mode,
      stageId,
      width,
      height,
      mimeType: 'image/svg+xml',
      dataUrl: makeDataUrl(svg),
      summary: `Mock image for ${stageId}`,
      prompt,
    };
  }

  async generateImage(options = {}) {
    return this.renderImage(options);
  }

  async editImage(options = {}) {
    return this.renderImage(options);
  }
}
