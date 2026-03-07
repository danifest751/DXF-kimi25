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
import { t } from '../i18n/index.js';

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
export function computeSplitParts(sourceFileId: number): SplitPart[] | null {
  const lf = loadedFiles.find((f) => f.id === sourceFileId);
  if (!lf || !lf.doc) return null;
  try {
    const stats = computeCuttingStats(lf.doc);
    return splitDXFIntoParts(lf.doc, stats);
  } catch {
    return null;
  }
}

/** Draw the split preview onto a canvas */
function drawSplitPreview(
  canvas: HTMLCanvasElement,
  sourceFileId: number,
  parts: SplitPart[],
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
  const scale = Math.min((W - pad * 2) / bbW, (H - pad * 2) / bbH);
  const cx = bb.min.x + bbW / 2;
  const cy = bb.min.y + bbH / 2;

  const opts: EntityRenderOptions = {
    arcSegments: 16,
    splineSegments: 16,
    ellipseSegments: 16,
    pixelSize: 1 / scale,
    viewExtent: Math.max(bbW, bbH) * 2,
  };

  // Draw all entities (dim gray)
  ctx.save();
  ctx.translate(W / 2, H / 2);
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

    // Convert world coords to canvas
    const toCanvasX = (wx: number) => W / 2 + (wx - cx) * scale;
    const toCanvasY = (wy: number) => H / 2 - (wy - cy) * scale;

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

    // Label
    ctx.fillStyle = color;
    ctx.font = 'bold 11px system-ui, sans-serif';
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

function getOrCreateModalRoot(): HTMLDivElement {
  if (!_modalRoot) {
    _modalRoot = document.createElement('div');
    _modalRoot.className = 'sb-split-overlay';
    _modalRoot.style.display = 'none';
    document.body.appendChild(_modalRoot);
  }
  return _modalRoot;
}

function buildModalHTML(parts: SplitPart[], baseName: string): string {
  const isSingle = parts.length === 1;
  const title = isSingle
    ? t('split.titleSingle')
    : t('split.title', { count: String(parts.length) });

  const rows = parts
    .map((p, i) => {
      const color = colorForIndex(i);
      return `
        <tr>
          <td><span class="sb-split-swatch" style="background:${color}"></span>${i + 1}</td>
          <td>${p.name}</td>
          <td>${p.w}×${p.h}</td>
          <td>${p.chainCount}</td>
        </tr>`;
    })
    .join('');

  const multiButtons = isSingle
    ? ''
    : `
      <button class="sb-btn sb-btn--primary" data-split-action="import">${t('split.openInCatalog')}</button>
      <button class="sb-btn" data-split-action="zip">${t('split.downloadZip')}</button>`;

  return `
    <div class="sb-split-panel">
      <div class="sb-split-header">
        <span class="sb-split-title">${title}</span>
        <span class="sb-split-basename">${baseName}</span>
        <button class="sb-icon sb-split-close" data-split-action="close">✕</button>
      </div>
      <canvas class="sb-split-canvas" width="520" height="320"></canvas>
      <div class="sb-split-table-wrap">
        <table class="sb-split-table">
          <thead><tr><th>#</th><th>${t('split.colName')}</th><th>W×H</th><th>${t('setBuilder.piercesShort')}</th></tr></thead>
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

function attachModalListeners(root: HTMLDivElement, state: SetBuilderState, scheduleRender: () => void): void {
  root.addEventListener('click', (e) => {
    const btn = (e.target as HTMLElement).closest<HTMLElement>('[data-split-action]');
    if (!btn) return;
    const action = btn.dataset.splitAction;
    if (action === 'close') { closeSplitModal(); return; }
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
  // Close on overlay click
  root.addEventListener('click', (e) => {
    if (e.target === root) closeSplitModal();
  });
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

  const root = getOrCreateModalRoot();
  root.innerHTML = buildModalHTML(parts, _currentBaseName);
  root.style.display = 'flex';

  attachModalListeners(root, state, scheduleRender);

  // Draw canvas after DOM is ready
  requestAnimationFrame(() => {
    const canvas = root.querySelector<HTMLCanvasElement>('.sb-split-canvas');
    if (canvas) drawSplitPreview(canvas, sourceFileId, parts);
  });
}

export function closeSplitModal(): void {
  if (_modalRoot) {
    _modalRoot.style.display = 'none';
    _modalRoot.innerHTML = '';
  }
  _currentParts = [];
  _currentSourceId = -1;
}
