import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { JSDOM } from 'jsdom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const indexPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../index.html');

function installCanvasAndImageStubs(window) {
  const context = {
    fillStyle: '#000',
    strokeStyle: '#000',
    lineWidth: 1,
    font: '12px sans-serif',
    imageSmoothingEnabled: false,
    clearRect: vi.fn(),
    fillRect: vi.fn(),
    drawImage: vi.fn(),
    beginPath: vi.fn(),
    arc: vi.fn(),
    stroke: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    save: vi.fn(),
    restore: vi.fn(),
    createLinearGradient: vi.fn(() => ({ addColorStop: vi.fn() })),
    fillText: vi.fn(),
    getImageData: vi.fn(() => ({ data: new Uint8ClampedArray(4), width: 1, height: 1 })),
    putImageData: vi.fn()
  };

  Object.defineProperty(window.HTMLCanvasElement.prototype, 'getContext', {
    configurable: true,
    value: vi.fn(() => context)
  });

  Object.defineProperty(window.HTMLCanvasElement.prototype, 'toDataURL', {
    configurable: true,
    value: vi.fn(function toDataURL() {
      return `data:image/png;base64,MOCK_${this.width}x${this.height}`;
    })
  });

  class FakeImage {
    constructor() {
      this.width = 640;
      this.height = 480;
      this.onload = null;
      this.onerror = null;
    }

    set src(value) {
      this._src = value;
      queueMicrotask(() => {
        if (typeof this.onload === 'function') {
          this.onload();
        }
      });
    }

    get src() {
      return this._src;
    }
  }

  window.Image = FakeImage;
  globalThis.Image = FakeImage;
  globalThis.requestAnimationFrame = window.requestAnimationFrame || ((cb) => setTimeout(() => cb(Date.now()), 16));
  globalThis.cancelAnimationFrame = window.cancelAnimationFrame || ((id) => clearTimeout(id));
  globalThis.URL.createObjectURL = globalThis.URL.createObjectURL || vi.fn(() => 'blob:mock');
  globalThis.URL.revokeObjectURL = globalThis.URL.revokeObjectURL || vi.fn();
}

function installLocalStorageStub(window) {
  const store = new Map();
  const storage = {
    getItem(key) {
      return store.has(key) ? store.get(key) : null;
    },
    setItem(key, value) {
      store.set(key, String(value));
    },
    removeItem(key) {
      store.delete(key);
    },
    clear() {
      store.clear();
    }
  };

  Object.defineProperty(window, 'localStorage', {
    configurable: true,
    value: storage
  });
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: storage
  });
}

async function loadDashboardDom() {
  const html = await fs.readFile(indexPath, 'utf8');
  const dom = new JSDOM(html, { url: 'http://localhost/' });

  document.head.innerHTML = dom.window.document.head.innerHTML;
  document.body.innerHTML = dom.window.document.body.innerHTML;

  installLocalStorageStub(window);
  installCanvasAndImageStubs(window);
  window.JSZip = class {
    file() {}
    async generateAsync() {
      return new Blob(['zip'], { type: 'application/zip' });
    }
  };

  vi.resetModules();
  const dashboard = await import('../../js/dashboard.js');
  await new Promise((resolve) => setTimeout(resolve, 0));
  return dashboard;
}

async function waitForCondition(predicate, timeoutMs = 5000, intervalMs = 50) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (predicate()) {
      return true;
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  return false;
}

describe('dashboard smoke', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    document.head.innerHTML = '';
    vi.restoreAllMocks();
  });

  it('loads the dashboard, exposes the main buttons, and runs the mock demo', async () => {
    await loadDashboardDom();

    const mainButtons = [
      'runMockDemoBtn',
      'runFullPipelineBtn',
      'runQcValidationBtn',
      'exportReportBtn',
      'exportSpritesheetBtn',
      'exportManifestBtn'
    ];

    for (const id of mainButtons) {
      expect(document.getElementById(id)).not.toBeNull();
    }

    expect(window.SpriteForgeDashboard).toBeTruthy();

    document.getElementById('runMockDemoBtn').click();
    const completed = await waitForCondition(() => !!window.SpriteForgeDashboard.runtime.validationReport, 8000, 100);
    expect(completed).toBe(true);

    const runtime = window.SpriteForgeDashboard.runtime;
    expect(runtime.validationReport).toBeTruthy();
    expect(runtime.validationReport.frameCount).toBeGreaterThan(0);
    expect(document.getElementById('validationWarningsList').textContent).toContain('No active warnings');
    expect(document.getElementById('exportReportBtn').disabled).toBe(false);
    expect(document.getElementById('exportSpritesheetBtn').disabled).toBe(false);
  });
});
