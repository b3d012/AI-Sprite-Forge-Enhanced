export function serializeJson(value) {
  return JSON.stringify(value, null, 2);
}

export function buildValidationReportMarkdown({
  title = 'AI Sprite Forge Validation Report',
  status = 'PASS',
  commandsRun = [],
  whatWasTested = [],
  results = [],
  limitations = [],
  requiresRealApiKey = [],
  sampleOutputs = []
} = {}) {
  const lines = [
    `# ${title}`,
    '',
    `Status: ${status}`,
    '',
    '## What Was Tested',
    ...whatWasTested.map((item) => `- ${item}`),
    '',
    '## Commands Run',
    ...commandsRun.map((item) => `- \`${item}\``),
    '',
    '## Results',
    ...results.map((item) => `- ${item}`),
    '',
    '## Known Limitations',
    ...limitations.map((item) => `- ${item}`),
    '',
    '## Still Requires A Real API Key',
    ...requiresRealApiKey.map((item) => `- ${item}`),
    '',
    '## Sample Outputs',
    ...sampleOutputs.map((item) => `- ${item}`)
  ];

  return lines.join('\n');
}

export function createDownloadFilePayload({ filename, content, mimeType = 'text/plain' }) {
  return {
    filename,
    mimeType,
    content,
    size: typeof content === 'string' ? content.length : content?.byteLength || 0
  };
}

export function createTextDownload(filename, text) {
  return createDownloadFilePayload({
    filename,
    content: text,
    mimeType: 'text/plain'
  });
}

export function createJsonDownload(filename, value) {
  return createDownloadFilePayload({
    filename,
    content: serializeJson(value),
    mimeType: 'application/json'
  });
}

export function createSvgDataUrl(svg) {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

export function createMockPreviewSvg({
  label = 'Mock Demo',
  width = 256,
  height = 256,
  background = '#00FF00',
  fill = '#111827'
} = {}) {
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`,
    `<rect width="${width}" height="${height}" fill="${background}"/>`,
    `<circle cx="${width / 2}" cy="${height / 2}" r="${Math.min(width, height) / 4}" fill="${fill}" opacity="1"/>`,
    `<text x="50%" y="52%" text-anchor="middle" dominant-baseline="middle" font-family="Arial, sans-serif" font-size="${Math.max(18, Math.round(width / 12))}" fill="#FFFFFF">${label}</text>`,
    '</svg>'
  ].join('');
}

export function createMockTransparentSvg({
  label = 'Transparent Export',
  width = 256,
  height = 256
} = {}) {
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`,
    `<rect width="${width}" height="${height}" fill="none"/>`,
    `<circle cx="${width / 2}" cy="${height / 2}" r="${Math.min(width, height) / 4}" fill="#FFFFFF" fill-opacity="0.9"/>`,
    `<text x="50%" y="52%" text-anchor="middle" dominant-baseline="middle" font-family="Arial, sans-serif" font-size="${Math.max(18, Math.round(width / 12))}" fill="#111827">${label}</text>`,
    '</svg>'
  ].join('');
}

