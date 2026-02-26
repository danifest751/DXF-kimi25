/**
 * @module nesting-panel
 * Панель раскладки: updateNestItems, runNesting, renderAllNestingSheets, zoom-popup.
 */

import { apiPatchJSON, apiPostJSON, downloadBlob } from './api.js';
import NestingWorker from './nesting-worker.js?worker';
import { t, tx } from './i18n/index.js';
import type { LoadedFile } from './types.js';
import {
  loadedFiles, authSessionToken,
  currentNestResult, setCurrentNestResult,
  lastNestingOptions, setLastNestingOptions,
  nestingMode, setNestingMode,
  nestCellRects, setNestCellRects,
  nestSheetHashes, setNestSheetHashes,
  nestHoveredSheet, setNestHoveredSheet,
  setNestingComputeMode,
} from './state.js';
import {
  nestPreset, nestCustomRow, nestW, nestH, nestGap,
  nestRotateEnabled, nestRotateStep, nestModeRadios,
  btnAdvancedToggle, nestAdvanced, nestSeed,
  nestCommonLineEnabled, nestCommonLineStatus, nestCommonLineDist, nestCommonLineMinLen,
  nestItemsEl, nestItemsEmpty,
  btnNestRun,
  nestResults, nestResultCards, nestResultSummary,
  btnExportDXF, btnExportCSV,
  nestingScroll, nestingCanvas,
  nestSheetBtns, btnCopyAllHashes, btnCopyAllHashesTop,
  nestZoomPopup, nestZoomCanvas, nestZoomLabel,
  container,
} from './dom.js';
import { getAuthHeaders, saveGuestDraft } from './auth.js';
import { nestItems, SHEET_PRESETS } from '../../core-engine/src/nesting/index.js';
import type { NestingResult, NestingOptions, NestingItem } from '../../core-engine/src/nesting/index.js';
import { buildContour } from '../../core-engine/src/contour/index.js';
import { exportNestingToDXF } from '../../core-engine/src/export/index.js';
import { renderEntity } from '../../core-engine/src/render/entity-renderer.js';
import type { EntityRenderOptions } from '../../core-engine/src/render/entity-renderer.js';

// ─── Callbacks ───────────────────────────────────────────────────────

type VoidFn = () => void;

let _updateModeBadge: VoidFn = () => {};
let _updateNestingButtonState: VoidFn = () => {};

export function initNestingPanelCallbacks(cbs: {
  updateModeBadge: VoidFn;
  updateNestingButtonState: VoidFn;
}): void {
  _updateModeBadge          = cbs.updateModeBadge;
  _updateNestingButtonState = cbs.updateNestingButtonState;
}

// ─── Nesting items list ───────────────────────────────────────────────

export function updateNestItems(): void {
  const checked = loadedFiles.filter((f) => f.checked);
  nestItemsEmpty.style.display = checked.length === 0 ? '' : 'none';
  nestItemsEl.innerHTML = '';

  for (const f of checked) {
    const bb = f.doc?.totalBBox ?? null;
    const w = bb ? Math.abs(bb.max.x - bb.min.x) : 0;
    const h = bb ? Math.abs(bb.max.y - bb.min.y) : 0;
    const sizeLabel = f.loading ? '…' : `${w.toFixed(0)}×${h.toFixed(0)}`;

    const row = document.createElement('div');
    row.className = 'np-item-row';
    row.innerHTML = `
      <span class="np-item-name"></span>
      <span class="np-item-size">${sizeLabel}</span>
      <button class="np-qty-btn" data-delta="-10">−10</button>
      <input type="number" class="np-item-qty" min="1" value="${f.quantity}" />
      <button class="np-qty-btn" data-delta="10">+10</button>
      <button class="np-qty-rst" data-i18n-title="nesting.resetQty">↺</button>
    `;
    (row.querySelector('.np-item-name') as HTMLSpanElement).textContent = f.name;
    const qtyInput = row.querySelector('input') as HTMLInputElement;
    const setQty = (v: number) => {
      f.quantity = Math.max(1, v);
      qtyInput.value = String(f.quantity);
      if (authSessionToken && f.remoteId) {
        void apiPatchJSON<{ success: boolean }>('/api/library-files-update', {
          fileId: f.remoteId, quantity: f.quantity,
        }, getAuthHeaders()).catch((e) => console.error('Update quantity failed:', e));
      }
      saveGuestDraft();
      autoRerunNesting();
    };
    qtyInput.addEventListener('change', () => setQty(parseInt(qtyInput.value) || 1));
    row.querySelectorAll('.np-qty-btn').forEach(btn => {
      btn.addEventListener('click', () => setQty(f.quantity + Number((btn as HTMLElement).dataset.delta)));
    });
    row.querySelector('.np-qty-rst')!.addEventListener('click', () => setQty(1));
    nestItemsEl.appendChild(row);
  }
}

// ─── Options ─────────────────────────────────────────────────────────

export function getSheetSize(): { width: number; height: number } {
  if (nestPreset.value === 'custom') {
    return { width: Number(nestW.value) || 1250, height: Number(nestH.value) || 2500 };
  }
  return SHEET_PRESETS[Number(nestPreset.value)]!.size;
}

export function getNestingOptions(): NestingOptions {
  const raw = Number(nestRotateStep.value);
  const rotationAngleStepDeg: 1 | 2 | 5 = raw === 1 || raw === 5 ? raw : 2;
  const seed = Number.isFinite(Number(nestSeed.value)) ? Math.trunc(Number(nestSeed.value)) : 0;
  const maxMergeDistanceMm = Number.isFinite(Number(nestCommonLineDist.value)) ? Number(nestCommonLineDist.value) : 0.2;
  const minSharedLenMm = Number.isFinite(Number(nestCommonLineMinLen.value)) ? Number(nestCommonLineMinLen.value) : 20;
  const modeVal = getNestModeValue();
  const strategy = modeVal === 'true_shape' ? 'true_shape' : 'maxrects_bbox';
  return {
    rotationEnabled: nestRotateEnabled.checked,
    rotationAngleStepDeg,
    strategy,
    multiStart: modeVal !== 'true_shape',
    seed,
    commonLine: { enabled: nestCommonLineEnabled.checked, maxMergeDistanceMm, minSharedLenMm },
  };
}

export function getNestModeValue(): string {
  for (const r of nestModeRadios) { if (r.checked) return r.value; }
  return 'precise';
}

export function setNestModeValue(val: string): void {
  for (const r of nestModeRadios) { r.checked = r.value === val; }
}

// ─── Run nesting ──────────────────────────────────────────────────────

export async function runNesting(): Promise<void> {
  const checked = loadedFiles.filter((f) => f.checked);
  if (checked.length === 0) return;

  btnNestRun.disabled = true;
  btnNestRun.textContent = '…';

  const sheet = getSheetSize();
  const gap = Number(nestGap.value) || 5;
  const options = getNestingOptions();
  const effectiveGap = options.commonLine?.enabled ? 0 : gap;
  setLastNestingOptions({ ...options, commonLine: options.commonLine ? { ...options.commonLine } : undefined });

  const useTrueShape = options.strategy === 'true_shape';
  const items: NestingItem[] = checked
    .filter((f) => !f.loading && f.doc != null)
    .map(f => {
      const bb = f.doc.totalBBox;
      const w = bb ? Math.abs(bb.max.x - bb.min.x) : 0;
      const h = bb ? Math.abs(bb.max.y - bb.min.y) : 0;
      let contour: NestingItem['contour'] | undefined;
      if (useTrueShape) {
        const result = buildContour(f.doc.flatEntities);
        if (result && result.outerRing.length >= 3) {
          contour = result.outerRing;
        }
      }
      return { id: f.id, name: f.name, width: w, height: h, quantity: f.quantity, ...(contour ? { contour } : {}) };
    });

  try {
    if (useTrueShape) {
      // Run in Web Worker to avoid blocking the main thread
      // Falls back to synchronous local if Worker fails
      let result: NestingResult;
      try {
        result = await new Promise<NestingResult>((resolve, reject) => {
          const worker = new NestingWorker();
          const tid = setTimeout(() => { worker.terminate(); reject(new Error('Worker timeout (60s)')); }, 60_000);
          worker.onmessage = (e: MessageEvent<{ ok: boolean; result?: NestingResult; error?: string }>) => {
            clearTimeout(tid);
            worker.terminate();
            if (e.data.ok && e.data.result) resolve(e.data.result);
            else reject(new Error(e.data.error ?? 'Worker error'));
          };
          worker.onerror = (ev) => { clearTimeout(tid); worker.terminate(); reject(new Error(ev.message)); };
          console.log('[nesting] posting to worker, items:', items.length);
          worker.postMessage({ items, sheet, gap: effectiveGap, options });
        });
      } catch (workerErr) {
        console.error('[nesting] Worker failed:', workerErr);
        throw workerErr;
      }
      setCurrentNestResult(result);
      setNestingComputeMode('local');
    } else {
      try {
        const resp = await apiPostJSON<{ success: boolean; data: NestingResult }>('/api/nest', {
          items, sheet, gap: effectiveGap,
          rotationEnabled: options.rotationEnabled,
          rotationAngleStepDeg: options.rotationAngleStepDeg,
          strategy: options.strategy,
          multiStart: options.multiStart,
          seed: options.seed,
          commonLine: options.commonLine,
        });
        setCurrentNestResult(resp.data);
        setNestingComputeMode('api');
      } catch (apiErr) {
        console.warn('[nesting] API failed, falling back to local:', apiErr);
        setCurrentNestResult(nestItems(items, sheet, effectiveGap, options));
        setNestingComputeMode('local');
      }
    }
  } catch (err) {
    console.error('[nesting] failed:', err);
    nestResultSummary.innerHTML = `<span style="color:#f87171">\u041e\u0448\u0438\u0431\u043a\u0430 \u0440\u0430\u0441\u043a\u043b\u0430\u0434\u043a\u0438: ${err instanceof Error ? err.message : String(err)}</span>`;
    nestResults.classList.remove('hidden');
    return;
  } finally {
    btnNestRun.disabled = false;
    btnNestRun.textContent = t('nesting.run');
  }
  _updateModeBadge();

  setNestSheetHashes([]);
  if (currentNestResult) {
    try {
      const shareResp = await apiPostJSON<{ success: boolean; hashes: string[] }>('/api/nesting-share', {
        nestingResult: currentNestResult,
      });
      setNestSheetHashes(shareResp.hashes);
    } catch { /* no hashes */ }
  }

  showNestResults();
  enterNestingMode();
}

let _autoRerunTimer: ReturnType<typeof setTimeout> | null = null;
export function autoRerunNesting(): void {
  if (!nestingMode && !currentNestResult) return;
  if (_autoRerunTimer !== null) clearTimeout(_autoRerunTimer);
  _autoRerunTimer = setTimeout(() => { _autoRerunTimer = null; void runNesting(); }, 400);
}

// ─── Nesting mode ─────────────────────────────────────────────────────

export function enterNestingMode(): void {
  setNestingMode(true);
  nestingScroll.classList.add('visible');
  _updateNestingButtonState();
  renderAllNestingSheets();
}

export function exitNestingMode(): void {
  setNestingMode(false);
  nestingScroll.classList.remove('visible');
  setCurrentNestResult(null);
  _updateNestingButtonState();
}

// ─── Results ──────────────────────────────────────────────────────────

function showNestResults(): void {
  if (!currentNestResult) return;
  const r = currentNestResult;
  const commonLineActive = lastNestingOptions?.commonLine?.enabled ?? false;
  const sharedCutLength  = Number.isFinite(r.sharedCutLength) ? r.sharedCutLength : 0;
  const pierceDelta      = Number.isFinite(r.pierceDelta) ? r.pierceDelta : 0;

  let rawPierces = 0, rawCutLen = 0;
  for (const sheet of r.sheets) {
    for (const p of sheet.placed) {
      const f = loadedFiles.find(lf => lf.id === p.itemId);
      if (f) { rawPierces += f.stats.totalPierces; rawCutLen += f.stats.totalCutLength; }
    }
  }

  const totalPierces = commonLineActive ? Math.max(0, rawPierces - pierceDelta) : rawPierces;
  const totalCutLen  = commonLineActive ? Math.max(0, rawCutLen - sharedCutLength) : rawCutLen;
  const cutM = totalCutLen / 1000;
  const cutStr = cutM >= 1 ? cutM.toFixed(2) + ' м' : totalCutLen.toFixed(1) + ' мм';

  let cardsHtml = `
    <div class="np-card"><div class="np-card-val">${r.totalSheets}</div><div class="np-card-label">${t('result.sheets.label')}</div></div>
    <div class="np-card"><div class="np-card-val">${r.avgFillPercent}%</div><div class="np-card-label">${t('result.fill.label')}</div></div>
    <div class="np-card"><div class="np-card-val">${totalPierces}</div><div class="np-card-label">${t('result.pierces.label')}</div></div>
    <div class="np-card"><div class="np-card-val">${cutStr}</div><div class="np-card-label">${t('result.cutLength.label')}</div></div>
  `;
  if (commonLineActive && (sharedCutLength > 0 || pierceDelta > 0)) {
    cardsHtml += `
      <div class="np-card"><div class="np-card-val">−${(sharedCutLength / 1000).toFixed(2)} м</div><div class="np-card-label">${t('result.saveCut.label')}</div></div>
      <div class="np-card"><div class="np-card-val">−${pierceDelta}</div><div class="np-card-label">${t('result.savePierces.label')}</div></div>
    `;
  }
  nestResultCards.innerHTML = cardsHtml;

  let clSummary = '';
  if (commonLineActive) {
    clSummary = sharedCutLength > 0 || pierceDelta > 0
      ? ` • ${t('result.commonLine.on')}`
      : ` • ${t('result.commonLine.noMatch')}`;
  }
  const strategyBadgeLabel = r.strategy === 'true_shape' ? '🔷 Контурная' : r.strategy === 'maxrects_bbox' ? '📐 Точная' : r.strategy === 'blf_bbox' ? '📦 BLF' : '';
  const badgeHtml = strategyBadgeLabel ? ` <span style="display:inline-block;padding:1px 7px;border-radius:10px;background:rgba(99,102,241,0.18);color:#a5b4fc;font-size:10px;font-weight:600;letter-spacing:.5px;margin-left:6px;vertical-align:middle">${strategyBadgeLabel}</span>` : '';
  nestResultSummary.innerHTML = tx('result.placed', { placed: r.totalPlaced, required: r.totalRequired }) + clSummary + badgeHtml;
  nestResults.classList.remove('hidden');
  btnExportDXF.style.display = 'flex';
  btnExportCSV.style.display = 'flex';
  const ha = nestSheetHashes.length > 0;
  btnCopyAllHashes.style.display    = ha ? 'flex' : 'none';
  btnCopyAllHashesTop.style.display = ha ? 'flex' : 'none';
}

// ─── Render all sheets canvas ─────────────────────────────────────────

const PART_COLORS = [
  '#6366f1', '#22c55e', '#f59e0b', '#06b6d4', '#ef4444',
  '#a855f7', '#ec4899', '#14b8a6', '#f97316', '#8b5cf6',
];

export function getPlacedAngleDeg(p: { angleDeg?: unknown; rotated?: unknown }): number {
  if (typeof p.angleDeg === 'number' && Number.isFinite(p.angleDeg)) return p.angleDeg;
  return p.rotated === true ? 90 : 0;
}

/** Draw absolute contour polygon from contourPts (true_shape mode). */
function drawTrueShapeContour(
  ctx: CanvasRenderingContext2D,
  pts: readonly { x: number; y: number }[],
  ox: number, oy: number, scale: number,
  color: string,
): void {
  if (pts.length < 3) return;
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(ox + pts[0]!.x * scale, oy + pts[0]!.y * scale);
  for (let i = 1; i < pts.length; i++) {
    ctx.lineTo(ox + pts[i]!.x * scale, oy + pts[i]!.y * scale);
  }
  ctx.closePath();
  ctx.fillStyle = color + '22';
  ctx.fill();
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.2;
  ctx.stroke();
  ctx.restore();
}

function drawPartContour(
  ctx: CanvasRenderingContext2D,
  file: LoadedFile,
  p: { x: number; y: number; width: number; height: number; angleDeg?: unknown; rotated?: unknown },
  px: number, py: number, pw: number, ph: number,
  color: string, arcSegments: number,
): void {
  const bb = file.doc.totalBBox!;
  const bbW = bb.max.x - bb.min.x;
  const bbH = bb.max.y - bb.min.y;
  if (bbW <= 0 || bbH <= 0) return;
  const angleDeg  = getPlacedAngleDeg(p);
  const angleRad  = (angleDeg * Math.PI) / 180;
  const c = Math.abs(Math.cos(angleRad));
  const s = Math.abs(Math.sin(angleRad));
  const rotW      = bbW * c + bbH * s;
  const rotH      = bbW * s + bbH * c;
  const partScale = Math.min(pw / rotW, ph / rotH);
  ctx.save();
  ctx.beginPath(); ctx.rect(px, py, pw, ph); ctx.clip();
  ctx.translate(px + pw / 2, py + ph / 2);
  ctx.rotate(-(angleDeg * Math.PI) / 180);
  ctx.scale(partScale, -partScale);
  ctx.translate(-(bb.min.x + bbW / 2), -(bb.min.y + bbH / 2));
  const pixelSize = 1 / partScale;
  const entOpts: EntityRenderOptions = { arcSegments, splineSegments: arcSegments, ellipseSegments: arcSegments, pixelSize, viewExtent: Math.max(bbW, bbH) * 2 };
  for (const fe of file.doc.flatEntities) {
    ctx.strokeStyle = color; ctx.lineWidth = pixelSize * 1.2; ctx.fillStyle = color;
    renderEntity(ctx, fe, entOpts);
  }
  ctx.restore();
}

export function renderAllNestingSheets(): void {
  if (!currentNestResult || currentNestResult.sheets.length === 0) return;
  const r = currentNestResult;
  const containerRect = container.getBoundingClientRect();
  const dpr = devicePixelRatio;
  const viewW = containerRect.width;
  const viewH = containerRect.height;
  const sw = r.sheet.width, sh = r.sheet.height;
  const margin = 16, gap = 12, labelH = 20, n = r.sheets.length;
  const maxCols = Math.min(n, Math.max(1, Math.floor((viewW - margin) / 180)));
  const cols = Math.min(n, Math.max(1, maxCols));
  const rows = Math.ceil(n / cols);
  const cellW      = (viewW - margin * 2 - gap * (cols - 1)) / cols;
  const sheetDrawW = cellW;
  const sheetDrawH = cellW * (sh / sw);
  const scale      = sheetDrawW / sw;
  const cellH      = labelH + sheetDrawH + 4;
  const totalH     = Math.max(viewH, margin * 2 + rows * cellH + (rows - 1) * gap);

  nestingCanvas.width = viewW * dpr; nestingCanvas.height = totalH * dpr;
  nestingCanvas.style.width = `${viewW}px`; nestingCanvas.style.height = `${totalH}px`;
  const ctx = nestingCanvas.getContext('2d')!;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = '#0f1117'; ctx.fillRect(0, 0, viewW, totalH);

  const colorMap = new Map<number, number>(); let ci = 0;
  for (const s of r.sheets) for (const p of s.placed) if (!colorMap.has(p.itemId)) colorMap.set(p.itemId, ci++);

  const newCellRects: typeof nestCellRects = [];
  for (let si = 0; si < n; si++) {
    const sheet = r.sheets[si]!;
    const col   = si % cols, row = Math.floor(si / cols);
    const cellX = margin + col * (cellW + gap);
    const cellY = margin + row * (cellH + gap);
    newCellRects.push({ x: cellX, y: cellY + labelH, w: sheetDrawW, h: sheetDrawH, si });

    const labelSize = Math.max(8, Math.min(11, cellW * 0.04));
    ctx.font = `600 ${labelSize}px Inter, sans-serif`; ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.textAlign = 'left'; ctx.textBaseline = 'top';
    const hashLabel = nestSheetHashes[si] ? `  [${nestSheetHashes[si]}]` : '';
    ctx.fillText(`#${si + 1}  ${sheet.fillPercent}%  (${sheet.placed.length})${hashLabel}`, cellX, cellY);

    const ox = cellX, oy = cellY + labelH;
    ctx.fillStyle = 'rgba(255,255,255,0.03)'; ctx.fillRect(ox, oy, sheetDrawW, sheetDrawH);
    ctx.strokeStyle = 'rgba(255,255,255,0.12)'; ctx.lineWidth = 1; ctx.strokeRect(ox, oy, sheetDrawW, sheetDrawH);

    const isTrueShape = r.strategy === 'true_shape';
    for (const p of sheet.placed) {
      const color = PART_COLORS[(colorMap.get(p.itemId) ?? 0) % PART_COLORS.length]!;
      const px = ox + p.x * scale, py = oy + p.y * scale;
      const pw = p.width * scale,  ph = p.height * scale;
      if (isTrueShape && p.contourPts && p.contourPts.length >= 3) {
        drawTrueShapeContour(ctx, p.contourPts, ox, oy, scale, color);
      } else {
        ctx.fillStyle = color + '10'; ctx.fillRect(px, py, pw, ph);
        ctx.strokeStyle = color + '40'; ctx.lineWidth = 0.5; ctx.strokeRect(px, py, pw, ph);
        const file = loadedFiles.find(lf => lf.id === p.itemId);
        if (file?.doc.totalBBox) drawPartContour(ctx, file, p, px, py, pw, ph, color, 32);
      }
      const fontSize = Math.min(9, pw * 0.18, ph * 0.28);
      if (fontSize > 3.5) {
        ctx.font = `500 ${fontSize}px Inter, sans-serif`; ctx.fillStyle = color + 'cc';
        ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
        ctx.fillText(p.name.replace(/\.dxf$/i, ''), px + pw / 2, py + ph - 1, pw - 2);
      }
    }
  }
  setNestCellRects(newCellRects);

  const footY = margin + rows * (cellH + gap) + 4;
  ctx.font = '400 10px JetBrains Mono, monospace'; ctx.fillStyle = 'rgba(255,255,255,0.2)';
  ctx.textAlign = 'left'; ctx.textBaseline = 'top';
  ctx.fillText(tx('nesting.footer', { w: sw, h: sh, sheets: n, fill: r.avgFillPercent }), margin, footY);

  nestSheetBtns.innerHTML = '';
  for (const cell of newCellRects) {
    const hash = nestSheetHashes[cell.si] ?? '';
    const btn = document.createElement('button');
    btn.className = 'nest-sheet-dl'; btn.title = tx('nesting.sheet.download', { n: cell.si + 1 });
    btn.style.left = `${cell.x + cell.w - 28}px`; btn.style.top = `${cell.y + 4}px`;
    btn.innerHTML = '<svg viewBox="0 0 24 24"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>';
    const si = cell.si;
    btn.addEventListener('click', (e) => { e.stopPropagation(); exportSingleSheetDXF(si); });
    nestSheetBtns.appendChild(btn);
    if (hash) {
      const hb = document.createElement('button');
      hb.className = 'nest-sheet-hash'; hb.title = tx('nesting.sheet.copyHash', { hash });
      hb.style.left = `${cell.x + cell.w - 28 - 68}px`; hb.style.top = `${cell.y + 4}px`;
      hb.textContent = hash;
      hb.addEventListener('click', (e) => {
        e.stopPropagation();
        void navigator.clipboard.writeText(hash).then(() => {
          hb.textContent = '✓'; setTimeout(() => { hb.textContent = hash; }, 1200);
        });
      });
      nestSheetBtns.appendChild(hb);
    }
  }
}

// ─── Export ───────────────────────────────────────────────────────────

export function exportSingleSheetDXF(sheetIndex: number): void {
  if (!currentNestResult) return;
  const r = currentNestResult;
  const sheet = r.sheets[sheetIndex];
  if (!sheet) return;
  const singleResult: NestingResult = {
    sheet: r.sheet, gap: r.gap,
    sheets: [{ ...sheet, sheetIndex: 0 }],
    totalSheets: 1, totalPlaced: sheet.placed.length, totalRequired: sheet.placed.length,
    avgFillPercent: sheet.fillPercent, cutLengthEstimate: r.cutLengthEstimate,
    sharedCutLength: r.sharedCutLength, cutLengthAfterMerge: r.cutLengthAfterMerge,
    pierceEstimate: sheet.placed.length, pierceDelta: 0,
  };
  const dxfStr = exportNestingToDXF({ nestingResult: singleResult });
  const blob = new Blob([dxfStr], { type: 'application/dxf' });
  downloadBlob(blob, `nesting_sheet_${sheetIndex + 1}.dxf`);
}

export function exportAllSheetsDXF(): void {
  if (!currentNestResult) return;
  for (let i = 0; i < currentNestResult.sheets.length; i++) exportSingleSheetDXF(i);
}

export function copyAllHashes(feedbackEl: HTMLElement): void {
  if (nestSheetHashes.length === 0) return;
  void navigator.clipboard.writeText(nestSheetHashes.join('\n')).then(() => {
    const orig = feedbackEl.innerHTML;
    feedbackEl.innerHTML = '<svg viewBox="0 0 24 24" style="width:16px;height:16px;stroke:currentColor;fill:none;stroke-width:2"><polyline points="20 6 9 17 4 12"/></svg>';
    feedbackEl.title = t('nesting.sheet.hashCopied');
    setTimeout(() => { feedbackEl.innerHTML = orig; feedbackEl.title = t('nesting.copyHashes.title'); }, 1200);
  });
}

// ─── Zoom popup state ─────────────────────────────────────────────────

export let zoomLevel       = 1;
export let zoomPanX        = 0;
export let zoomPanY        = 0;
export let zoomPopupLocked = false;
export let zoomPanning     = false;
export let zoomPanStartX   = 0;
export let zoomPanStartY   = 0;
export let zoomHideTimer: ReturnType<typeof setTimeout> | null = null;

export function setZoomLevel(v: number): void        { zoomLevel = v; }
export function setZoomPanX(v: number): void         { zoomPanX = v; }
export function setZoomPanY(v: number): void         { zoomPanY = v; }
export function setZoomPopupLocked(v: boolean): void { zoomPopupLocked = v; }
export function setZoomPanning(v: boolean): void     { zoomPanning = v; }
export function setZoomPanStartX(v: number): void    { zoomPanStartX = v; }
export function setZoomPanStartY(v: number): void    { zoomPanStartY = v; }
export function setZoomHideTimer(v: ReturnType<typeof setTimeout> | null): void { zoomHideTimer = v; }

export function renderZoomSheet(sheetIndex: number): void {
  if (!currentNestResult) return;
  const sheet = currentNestResult.sheets[sheetIndex];
  if (!sheet) return;
  const r = currentNestResult;
  const sw = r.sheet.width, sh = r.sheet.height;
  const dpr = devicePixelRatio;
  const maxW = Math.min(600, window.innerWidth * 0.55);
  const maxH = Math.min(500, window.innerHeight * 0.55);
  const baseScale = Math.min(maxW / sw, maxH / sh);
  const popW = Math.round(sw * baseScale), popH = Math.round(sh * baseScale);
  const zScale = baseScale * zoomLevel;

  nestZoomCanvas.width = popW * dpr; nestZoomCanvas.height = popH * dpr;
  nestZoomCanvas.style.width = `${popW}px`; nestZoomCanvas.style.height = `${popH}px`;
  const ctx = nestZoomCanvas.getContext('2d')!;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = '#14161e'; ctx.fillRect(0, 0, popW, popH);
  ctx.save(); ctx.translate(zoomPanX, zoomPanY);
  ctx.strokeStyle = 'rgba(255,255,255,0.2)'; ctx.lineWidth = 1;
  ctx.strokeRect(0, 0, sw * zScale, sh * zScale);

  const colorMap = new Map<number, number>(); let ci = 0;
  for (const s of r.sheets) for (const p of s.placed) if (!colorMap.has(p.itemId)) colorMap.set(p.itemId, ci++);

  const isTrueShapeZ = r.strategy === 'true_shape';
  for (const p of sheet.placed) {
    const color = PART_COLORS[(colorMap.get(p.itemId) ?? 0) % PART_COLORS.length]!;
    const px = p.x * zScale, py = p.y * zScale;
    const pw = p.width * zScale, ph = p.height * zScale;
    if (isTrueShapeZ && p.contourPts && p.contourPts.length >= 3) {
      drawTrueShapeContour(ctx, p.contourPts, 0, 0, zScale, color);
    } else {
      ctx.fillStyle = color + '15'; ctx.fillRect(px, py, pw, ph);
      ctx.strokeStyle = color + '40'; ctx.lineWidth = 0.5; ctx.strokeRect(px, py, pw, ph);
      const file = loadedFiles.find(lf => lf.id === p.itemId);
      if (file?.doc.totalBBox) drawPartContour(ctx, file, p, px, py, pw, ph, color, 64);
    }
    const fontSize = Math.min(12, pw * 0.15, ph * 0.22);
    if (fontSize > 5) {
      ctx.font = `500 ${fontSize}px Inter, sans-serif`; ctx.fillStyle = color + 'dd';
      ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
      ctx.fillText(p.name.replace(/\.dxf$/i, ''), px + pw / 2, py + ph - 2, pw - 4);
    }
  }
  ctx.restore();

  if (zoomLevel !== 1) {
    ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.fillRect(popW - 52, 4, 48, 18);
    ctx.font = '500 10px JetBrains Mono, monospace'; ctx.fillStyle = 'rgba(255,255,255,0.6)';
    ctx.textAlign = 'right'; ctx.textBaseline = 'top';
    ctx.fillText(`×${zoomLevel.toFixed(1)}`, popW - 8, 7);
  }
  nestZoomLabel.textContent = tx('nesting.zoomLabel', { n: sheetIndex + 1, parts: sheet.placed.length, fill: sheet.fillPercent });
}

export function positionPopup(mouseX: number, mouseY: number): void {
  const popW = nestZoomPopup.offsetWidth, popH = nestZoomPopup.offsetHeight;
  let left = mouseX + 16, top = mouseY - popH / 2;
  if (left + popW > window.innerWidth) left = mouseX - popW - 8;
  if (top < 4) top = 4;
  if (top + popH > window.innerHeight - 4) top = window.innerHeight - popH - 4;
  nestZoomPopup.style.left = `${left}px`; nestZoomPopup.style.top = `${top}px`;
}

export function showZoomPopup(sheetIndex: number, mouseX: number, mouseY: number): void {
  if (zoomHideTimer) { clearTimeout(zoomHideTimer); zoomHideTimer = null; }
  zoomLevel = 1; zoomPanX = 0; zoomPanY = 0;
  renderZoomSheet(sheetIndex);
  positionPopup(mouseX, mouseY);
  nestZoomPopup.classList.add('visible');
}

export function hideZoomPopup(): void {
  if (zoomPopupLocked) return;
  nestZoomPopup.classList.remove('visible');
  setNestHoveredSheet(-1);
  zoomLevel = 1; zoomPanX = 0; zoomPanY = 0;
  if (zoomHideTimer) { clearTimeout(zoomHideTimer); zoomHideTimer = null; }
}

export function scheduleHideZoomPopup(): void {
  if (zoomPopupLocked) return;
  if (zoomHideTimer) clearTimeout(zoomHideTimer);
  zoomHideTimer = setTimeout(() => { zoomHideTimer = null; hideZoomPopup(); }, 300);
}

export function applyZoomWheel(deltaY: number): void {
  if (nestHoveredSheet < 0) return;
  const oldZoom = zoomLevel;
  const factor = deltaY < 0 ? 1.15 : 1 / 1.15;
  zoomLevel = Math.max(0.5, Math.min(20, zoomLevel * factor));
  const cw = nestZoomCanvas.offsetWidth / 2, ch = nestZoomCanvas.offsetHeight / 2;
  const ratio = zoomLevel / oldZoom;
  zoomPanX = cw - (cw - zoomPanX) * ratio;
  zoomPanY = ch - (ch - zoomPanY) * ratio;
  zoomPopupLocked = true;
  renderZoomSheet(nestHoveredSheet);
}
