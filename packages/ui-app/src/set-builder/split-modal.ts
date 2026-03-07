/**
 * @module split-modal
 * DXF split modal: preview detected parts with colored bboxes, then
 * export them to catalog / ZIP / individual files.
 */

import { parseDXF } from '../../../core-engine/src/dxf/reader/index.js';
import { normalizeDocument } from '../../../core-engine/src/normalize/index.js';
import { computeCuttingStats } from '../../../core-engine/src/cutting/index.js';
import { splitDXFIntoParts } from '../../../core-engine/src/export/index.js';
import type { SplitPart } from '../../../core-engine/src/export/index.js';
import { renderEntity } from '../../../core-engine/src/render/entity-renderer.js';
import type { EntityRenderOptions } from '../../../core-engine/src/render/entity-renderer.js';
import { loadedFiles, bumpNextFileId } from '../state.js';
import type { LoadedFile } from '../types.js';
import type { SetBuilderState } from './types.js';
import { syncLoadedFilesIntoLibrary } from './library.js';
import { buildZip } from '../zip-utils.js';
import { t, tx } from '../i18n/index.js';

const PART_COLORS = [
  '#818cf8', '#4ade80', '#fbbf24', '#22d3ee', '#f87171',
  '#c084fc', '#f472b6', '#2dd4bf', '#fb923c', '#a78bfa',
  '#34d399', '#60a5fa', '#facc15', '#e879f9', '#38bdf8',
];

function colorForIndex(i: number): string {
  return PART_COLORS[i % PART_COLORS.length]!;
}

function hexToRgba(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

function triggerDownload(filename: string, blob: Blob): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

function safeBaseName(name: string): string {
  return name.replace(/[^a-zA-Z0-9_\-. ]/g, '_').replace(/\s+/g, '_').slice(0, 80);
}

/** Returns SplitPart[] for a given sourceFileId, or null if not computable */
export function computeSplitParts(sourceFileId: number, gap = 0): SplitPart[] | null {
  const lf = loadedFiles.find((f) => f.id === sourceFileId);
  if (!lf || !lf.doc) return null;
  try {
    const stats = computeCuttingStats(lf.doc);
    return splitDXFIntoParts(lf.doc, stats, gap);
  } catch {
    return null;
  }
}

/** Draw the split preview onto a canvas, respecting view pan/zoom */
function drawSplitPreview(
  canvas: HTMLCanvasElement,
  sourceFileId: number,
  parts: SplitPart[],
  view?: ViewState,
): void {
  const lf = loadedFiles.find((f) => f.id === sourceFileId);
  if (!lf || !lf.doc) return;

  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const W = canvas.width;
  const H = canvas.height;
  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = 'rgba(7,11,18,0.95)';
  ctx.fillRect(0, 0, W, H);

  const bb = lf.doc.totalBBox;
  if (!bb) return;
  const bbW = Math.max(1e-6, bb.max.x - bb.min.x);
  const bbH = Math.max(1e-6, bb.max.y - bb.min.y);

  const pad = 18;
  const fitScale = Math.min((W - pad * 2) / bbW, (H - pad * 2) / bbH);
  const cx = bb.min.x + bbW / 2;
  const cy = bb.min.y + bbH / 2;

  const scale = view ? fitScale * view.scale : fitScale;
  const offX  = view ? view.offX : 0;
  const offY  = view ? view.offY : 0;

  const opts: EntityRenderOptions = {
    arcSegments: 16,
    splineSegments: 16,
    ellipseSegments: 16,
    pixelSize: 1 / scale,
    viewExtent: Math.max(bbW, bbH) * 2,
  };

  // Draw all entities (dim gray)
  ctx.save();
  ctx.translate(W / 2 + offX, H / 2 + offY);
  ctx.scale(scale, -scale);
  ctx.translate(-cx, -cy);
  ctx.strokeStyle = 'rgba(180,180,200,0.4)';
  ctx.lineWidth = 1 / scale;
  for (const fe of lf.doc.flatEntities) {
    renderEntity(ctx, fe, opts);
  }
  ctx.restore();

  // Draw colored bbox overlays for each part
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i]!;
    const color = colorForIndex(i);
    const { minX, minY, maxX, maxY } = part.bbox;

    const toCanvasX = (wx: number) => W / 2 + offX + (wx - cx) * scale;
    const toCanvasY = (wy: number) => H / 2 + offY - (wy - cy) * scale;

    const x = toCanvasX(minX);
    const y = toCanvasY(maxY);
    const w = (maxX - minX) * scale;
    const h = (maxY - minY) * scale;

    ctx.save();
    ctx.fillStyle = hexToRgba(color, 0.13);
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5;
    ctx.strokeRect(x, y, w, h);

    ctx.fillStyle = color;
    ctx.font = `bold ${Math.max(9, Math.min(13, scale * 10))}px system-ui, sans-serif`;
    ctx.fillText(String(i + 1), x + 4, y + 13);
    ctx.restore();
  }
}

/** Import parts as new LoadedFiles in the uncategorized catalog */
function importPartsToLibrary(
  parts: SplitPart[],
  baseName: string,
  state: SetBuilderState,
  scheduleRender: () => void,
): void {
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i]!;
    try {
      const encoder = new TextEncoder();
      const bytes = encoder.encode(part.dxfString);
      const buf = bytes.buffer as ArrayBuffer;
      const doc = normalizeDocument(parseDXF(buf));
      const stats = computeCuttingStats(doc);

      const b64 = btoa(String.fromCharCode(...bytes));

      const newFile: LoadedFile = {
        id: bumpNextFileId(),
        remoteId: '',
        workspaceId: '',
        catalogId: null,
        name: `${safeBaseName(baseName)}_${part.name.replace(' ', '_')}`,
        localBase64: b64,
        doc,
        stats: {
          totalPierces: stats.totalPierces,
          totalCutLength: stats.totalCutLength,
          cuttingEntityCount: stats.cuttingEntityCount,
          chains: stats.chains.map((c) => ({ piercePoint: c.piercePoint })),
        },
        checked: false,
        quantity: 1,
      };

      loadedFiles.push(newFile);
    } catch {
      // skip failed parts
    }
  }

  syncLoadedFilesIntoLibrary(state);
  scheduleRender();
}

/** Download all parts as ZIP */
function downloadZip(parts: SplitPart[], baseName: string): void {
  const encoder = new TextEncoder();
  const entries = parts.map((p) => ({
    name: `${safeBaseName(baseName)}_${p.name.replace(' ', '_')}.dxf`,
    data: encoder.encode(p.dxfString),
  }));
  const blob = buildZip(entries);
  triggerDownload(`${safeBaseName(baseName)}_split.zip`, blob);
}

/** Download each part as individual file */
function downloadIndividual(parts: SplitPart[], baseName: string): void {
  for (const part of parts) {
    const blob = new Blob([part.dxfString], { type: 'application/dxf' });
    triggerDownload(`${safeBaseName(baseName)}_${part.name.replace(' ', '_')}.dxf`, blob);
  }
}

// ─── Modal DOM ───────────────────────────────────────────────────────

let _modalRoot: HTMLDivElement | null = null;
let _currentSourceId: number = -1;
let _currentParts: SplitPart[] = [];
let _currentBaseName = '';
let _scheduleRender: (() => void) | null = null;
let _state: SetBuilderState | null = null;
let _currentGap = 0;

interface ViewState { scale: number; offX: number; offY: number; }
let _view: ViewState | null = null;

function getOrCreateModalRoot(): HTMLDivElement {
  if (!_modalRoot) {
    _modalRoot = document.createElement('div');
    _modalRoot.className = 'sb-split-overlay';
    _modalRoot.style.display = 'none';
    document.body.appendChild(_modalRoot);
  }
  return _modalRoot;
}

function buildModalHTML(parts: SplitPart[], baseName: string, gap: number): string {
  const isSingle = parts.length === 1;
  const title = isSingle
    ? t('split.titleSingle')
    : tx('split.title', { count: String(parts.length) });

  const rows = parts
    .map((p, i) => {
      const color = colorForIndex(i);
      return `
        <tr data-part-idx="${i}">
          <td><span class="sb-split-swatch" style="background:${color}"></span>${i + 1}</td>
          <td>${p.name}</td>
          <td>${p.w}×${p.h}</td>
          <td>${p.chainCount}</td>
          <td><button class="sb-split-row-del" data-split-action="delete-part" data-part-idx="${i}" title="Удалить">✕</button></td>
        </tr>`;
    })
    .join('');

  const multiButtons = isSingle
    ? ''
    : `
      <button class="sb-btn sb-btn--primary" data-split-action="import">${t('split.openInCatalog')}</button>
      <button class="sb-btn" data-split-action="zip">${t('split.downloadZip')}</button>`;

  const gapSlider = `
    <div class="sb-split-gap-row">
      <label class="sb-split-gap-label" for="sb-split-gap">${t('split.gapLabel')}</label>
      <input class="sb-split-gap-slider" id="sb-split-gap" type="range" min="0" max="100" step="1" value="${Math.round(gap)}"/>
      <span class="sb-split-gap-val" id="sb-split-gap-val">${Math.round(gap)}</span>
    </div>`;

  return `
    <div class="sb-split-panel">
      <div class="sb-split-header">
        <span class="sb-split-title">${title}</span>
        <span class="sb-split-basename">${baseName}</span>
        <button class="sb-icon sb-split-close" data-split-action="close">✕</button>
      </div>
      ${gapSlider}
      <canvas class="sb-split-canvas" width="520" height="320"></canvas>
      <div class="sb-split-table-wrap">
        <table class="sb-split-table">
          <thead><tr><th>#</th><th>${t('split.colName')}</th><th>W×H</th><th>${t('setBuilder.piercesShort')}</th><th></th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
      <div class="sb-split-footer">
        ${multiButtons}
        <button class="sb-btn" data-split-action="files">${isSingle ? t('split.downloadCropped') : t('split.downloadFiles')}</button>
        <button class="sb-btn sb-split-cancel" data-split-action="close">${t('split.cancel')}</button>
      </div>
    </div>
  `;
}

function rebuildModalContent(root: HTMLDivElement, gap: number): void {
  const parts = computeSplitParts(_currentSourceId, gap);
  if (!parts) return;
  _currentParts = parts;
  _currentGap = gap;

  // Update title
  const isSingle = parts.length === 1;
  const titleEl = root.querySelector('.sb-split-title');
  if (titleEl) titleEl.textContent = isSingle ? t('split.titleSingle') : tx('split.title', { count: String(parts.length) });

  // Update table body
  const tbody = root.querySelector('.sb-split-table tbody');
  if (tbody) {
    tbody.innerHTML = parts.map((p, i) => {
      const color = colorForIndex(i);
      return `<tr data-part-idx="${i}"><td><span class="sb-split-swatch" style="background:${color}"></span>${i + 1}</td><td>${p.name}</td><td>${p.w}×${p.h}</td><td>${p.chainCount}</td><td><button class="sb-split-row-del" data-split-action="delete-part" data-part-idx="${i}" title="Удалить">✕</button></td></tr>`;
    }).join('');
  }

  // Redraw canvas
  const canvas = root.querySelector<HTMLCanvasElement>('.sb-split-canvas');
  if (canvas) drawSplitPreview(canvas, _currentSourceId, parts, _view ?? undefined);

  // Update multi-buttons visibility
  const importBtn = root.querySelector<HTMLElement>('[data-split-action="import"]');
  const zipBtn = root.querySelector<HTMLElement>('[data-split-action="zip"]');
  if (importBtn) importBtn.style.display = isSingle ? 'none' : '';
  if (zipBtn) zipBtn.style.display = isSingle ? 'none' : '';

  const filesBtn = root.querySelector<HTMLElement>('[data-split-action="files"]');
  if (filesBtn) filesBtn.textContent = isSingle ? t('split.downloadCropped') : t('split.downloadFiles');
}

function attachModalListeners(root: HTMLDivElement, state: SetBuilderState, scheduleRender: () => void): void {
  root.addEventListener('click', (e) => {
    const btn = (e.target as HTMLElement).closest<HTMLElement>('[data-split-action]');
    if (!btn) return;
    const action = btn.dataset.splitAction;
    if (action === 'close') { closeSplitModal(); return; }
    if (action === 'delete-part') {
      const idx = Number(btn.dataset.partIdx);
      if (!Number.isNaN(idx) && idx >= 0 && idx < _currentParts.length) {
        _currentParts = _currentParts.filter((_, i) => i !== idx);
        // renumber names
        _currentParts = _currentParts.map((p, i) => ({ ...p, name: `Part ${i + 1}` }));
        // update title
        const isSingle = _currentParts.length === 1;
        const titleEl = root.querySelector('.sb-split-title');
        if (titleEl) titleEl.textContent = isSingle ? t('split.titleSingle') : tx('split.title', { count: String(_currentParts.length) });
        // rebuild table
        const tbody = root.querySelector('.sb-split-table tbody');
        if (tbody) {
          tbody.innerHTML = _currentParts.map((p, i) => {
            const color = colorForIndex(i);
            return `<tr data-part-idx="${i}"><td><span class="sb-split-swatch" style="background:${color}"></span>${i + 1}</td><td>${p.name}</td><td>${p.w}×${p.h}</td><td>${p.chainCount}</td><td><button class="sb-split-row-del" data-split-action="delete-part" data-part-idx="${i}" title="Удалить">✕</button></td></tr>`;
          }).join('');
        }
        // redraw canvas
        const canvas = root.querySelector<HTMLCanvasElement>('.sb-split-canvas');
        if (canvas) drawSplitPreview(canvas, _currentSourceId, _currentParts, _view ?? undefined);
        // update buttons visibility
        const importBtn = root.querySelector<HTMLElement>('[data-split-action="import"]');
        const zipBtn = root.querySelector<HTMLElement>('[data-split-action="zip"]');
        if (importBtn) importBtn.style.display = isSingle ? 'none' : '';
        if (zipBtn) zipBtn.style.display = isSingle ? 'none' : '';
        const filesBtn = root.querySelector<HTMLElement>('[data-split-action="files"]');
        if (filesBtn) filesBtn.textContent = isSingle ? t('split.downloadCropped') : t('split.downloadFiles');
      }
      return;
    }
    if (action === 'import') {
      importPartsToLibrary(_currentParts, _currentBaseName, state, scheduleRender);
      closeSplitModal();
      return;
    }
    if (action === 'zip') {
      downloadZip(_currentParts, _currentBaseName);
      return;
    }
    if (action === 'files') {
      downloadIndividual(_currentParts, _currentBaseName);
      return;
    }
  });

  // Gap slider
  const slider = root.querySelector<HTMLInputElement>('#sb-split-gap');
  const valEl = root.querySelector<HTMLElement>('#sb-split-gap-val');
  if (slider) {
    slider.addEventListener('input', () => {
      const v = Number(slider.value);
      if (valEl) valEl.textContent = String(v);
      rebuildModalContent(root, v);
    });
  }

  // Close on overlay click
  root.addEventListener('click', (e) => {
    if (e.target === root) closeSplitModal();
  });

  // Canvas zoom + pan
  const canvas = root.querySelector<HTMLCanvasElement>('.sb-split-canvas');
  if (canvas) {
    if (!_view) _view = { scale: 1, offX: 0, offY: 0 };

    canvas.style.cursor = 'grab';

    canvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      if (!_view) _view = { scale: 1, offX: 0, offY: 0 };
      const factor = e.deltaY < 0 ? 1.12 : 1 / 1.12;
      const rect = canvas.getBoundingClientRect();
      const mx = (e.clientX - rect.left) * (canvas.width / rect.width);
      const my = (e.clientY - rect.top) * (canvas.height / rect.height);
      // zoom towards cursor
      _view.offX = mx - factor * (mx - _view.offX);
      _view.offY = my - factor * (my - _view.offY);
      _view.scale = Math.max(0.1, Math.min(50, _view.scale * factor));
      drawSplitPreview(canvas, _currentSourceId, _currentParts, _view);
    }, { passive: false });

    let dragStart: { x: number; y: number; offX: number; offY: number } | null = null;
    canvas.addEventListener('mousedown', (e) => {
      if (!_view) _view = { scale: 1, offX: 0, offY: 0 };
      dragStart = { x: e.clientX, y: e.clientY, offX: _view.offX, offY: _view.offY };
      canvas.style.cursor = 'grabbing';
    });
    window.addEventListener('mousemove', (e) => {
      if (!dragStart || !_view) return;
      const rect = canvas.getBoundingClientRect();
      const scaleX = canvas.width / rect.width;
      const scaleY = canvas.height / rect.height;
      _view.offX = dragStart.offX + (e.clientX - dragStart.x) * scaleX;
      _view.offY = dragStart.offY + (e.clientY - dragStart.y) * scaleY;
      drawSplitPreview(canvas, _currentSourceId, _currentParts, _view);
    });
    window.addEventListener('mouseup', () => {
      dragStart = null;
      canvas.style.cursor = 'grab';
    });

    // Double-click resets view
    canvas.addEventListener('dblclick', () => {
      _view = { scale: 1, offX: 0, offY: 0 };
      drawSplitPreview(canvas, _currentSourceId, _currentParts, _view);
    });
  }
}

export function openSplitModal(
  state: SetBuilderState,
  sourceFileId: number,
  scheduleRender: () => void,
): void {
  const lf = loadedFiles.find((f) => f.id === sourceFileId);
  if (!lf || !lf.doc) return;

  const parts = computeSplitParts(sourceFileId);
  if (!parts || parts.length === 0) return;

  _currentSourceId = sourceFileId;
  _currentParts = parts;
  _currentBaseName = lf.name.replace(/\.dxf$/i, '');
  _state = state;
  _scheduleRender = scheduleRender;
  _view = { scale: 1, offX: 0, offY: 0 };

  const root = getOrCreateModalRoot();
  root.innerHTML = buildModalHTML(parts, _currentBaseName, _currentGap);
  root.style.display = 'flex';

  attachModalListeners(root, state, scheduleRender);

  // Draw canvas after DOM is ready
  requestAnimationFrame(() => {
    const canvas = root.querySelector<HTMLCanvasElement>('.sb-split-canvas');
    if (canvas) drawSplitPreview(canvas, sourceFileId, parts, _view ?? undefined);
  });
}

export function closeSplitModal(): void {
  if (_modalRoot) {
    _modalRoot.style.display = 'none';
    _modalRoot.innerHTML = '';
  }
  _currentParts = [];
  _currentSourceId = -1;
  _currentGap = 0;
}
