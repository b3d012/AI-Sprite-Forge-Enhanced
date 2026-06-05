import { describe, expect, it } from 'vitest';
import {
  buildValidationReportMarkdown,
  createJsonDownload,
  createMockPreviewSvg,
  createMockTransparentSvg,
  createTextDownload
} from '../../js/lib/exporters.js';

describe('export helpers', () => {
  it('builds a readable validation report markdown file', () => {
    const report = buildValidationReportMarkdown({
      status: 'PASS',
      commandsRun: ['npm run build'],
      whatWasTested: ['mock pipeline'],
      results: ['PASS anchor-size: 1024x1024']
    });

    expect(report).toContain('# AI Sprite Forge Validation Report');
    expect(report).toContain('Status: PASS');
    expect(report).toContain('npm run build');
    expect(report).toContain('mock pipeline');
  });

  it('creates serializable text and json export payloads', () => {
    const text = createTextDownload('report.md', 'hello');
    const json = createJsonDownload('manifest.json', { ok: true });

    expect(text.filename).toBe('report.md');
    expect(text.mimeType).toBe('text/plain');
    expect(text.content).toBe('hello');
    expect(json.filename).toBe('manifest.json');
    expect(json.mimeType).toBe('application/json');
    expect(json.content).toContain('"ok": true');
  });

  it('creates mock svg previews for opaque and transparent exports', () => {
    const preview = createMockPreviewSvg({ label: 'Demo' });
    const transparent = createMockTransparentSvg({ label: 'Export' });

    expect(preview).toContain('fill="#00FF00"');
    expect(preview).toContain('Demo');
    expect(transparent).toContain('fill="none"');
    expect(transparent).toContain('Export');
  });
});

