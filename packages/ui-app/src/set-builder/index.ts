import { SHEET_PRESETS } from './mock-data.js';
import { apiGetJSON, apiPatchJSON, apiPostJSON, downloadBlob } from '../api.js';
import { authSessionToken, authWorkspaceId, loadedFiles, workspaceCatalogs, UNCATEGORIZED_CATALOG_ID } from '../state.js';
import { fileInput } from '../dom.js';
import { getLocale, onLocaleChange, setLocale, t } from '../i18n/index.js';
import { AUTH_SESSION_EVENT, getAuthHeaders, logoutWorkspace, runTelegramLoginFlow, saveGuestDraft } from '../auth.js';
import { nestItems } from '../../../core-engine/src/nesting/index.js';
import type { NestingItem, NestingOptions, NestingResult } from '../../../core-engine/src/nesting/index.js';
import { exportNestingToDXF } from '../../../core-engine/src/export/index.js';
import type { ItemDocData } from '../../../core-engine/src/export/index.js';
import { renderEntity } from '../../../core-engine/src/render/entity-renderer.js';
import type { EntityRenderOptions } from '../../../core-engine/src/render/entity-renderer.js';
import {
  canRunNesting,
  createInitialState,
  getAggregatedIssues,
  getLibraryItem,
  getSetRows,
  getSetItem,
  getTotals,
  removeFromSet,
  setQty,
  upsertSetItem,
} from './state.js';
import type { LibraryItem, SetBuilderState, SheetResult } from './types.js';

const STORAGE_KEY = 'dxf_set_builder_state_v1';

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function getActiveSheetPreset(
  state: SetBuilderState,
  presets: ReadonlyArray<{ id: string; w: number; h: number }>,
): { w: number; h: number } {
  const p = presets.find((it) => it.id === state.sheetPresetId) ?? presets[0] ?? SHEET_PRESETS[0]!;
  return { w: p.w, h: p.h };
}

function calcPierceEstimateForSheets(sheets: NestingResult['sheets']): number {
  let total = 0;
  for (const sheet of sheets) {
    for (const p of sheet.placed) {
      const lf = loadedFiles.find((f) => f.id === p.itemId);
      if (lf) total += lf.stats.totalPierces;
    }
  }
  return total;
}

function buildSetNestingItems(state: SetBuilderState): { items: NestingItem[]; skipped: number } {
  const rows = getSetRows(state).filter((r) => r.set.enabled && r.set.qty > 0);
  let skipped = 0;
  const items: NestingItem[] = [];

  for (const row of rows) {
    if (row.item.sourceFileId === undefined) {
      skipped++;
      continue;
    }
    const lf = loadedFiles.find((f) => f.id === row.item.sourceFileId);
    if (!lf || lf.loading || lf.doc == null) {
      skipped++;
      continue;
    }

    const bb = lf.doc.totalBBox;
    const width = bb ? Math.max(0, Math.abs(bb.max.x - bb.min.x)) : 0;
    const height = bb ? Math.max(0, Math.abs(bb.max.y - bb.min.y)) : 0;
    if (width <= 0 || height <= 0) {
      skipped++;
      continue;
    }

    items.push({
      id: lf.id,
      name: lf.name,
      width,
      height,
      quantity: row.set.qty,
    });
  }

  return { items, skipped };
}

function buildItemDocsForSet(state: SetBuilderState): Map<number, ItemDocData> {
  const docs = new Map<number, ItemDocData>();
  for (const row of getSetRows(state)) {
    if (!row.set.enabled || row.item.sourceFileId === undefined) continue;
    const lf = loadedFiles.find((f) => f.id === row.item.sourceFileId);
    if (!lf || lf.loading || lf.doc == null || docs.has(lf.id)) continue;
    const bbox = lf.doc.totalBBox ?? { min: { x: 0, y: 0, z: 0 }, max: { x: 0, y: 0, z: 0 } };
    docs.set(lf.id, { flatEntities: lf.doc.flatEntities, bbox });
  }
  return docs;
}

function createNestingOptions(state: SetBuilderState): NestingOptions {
  const strategy = state.nestStrategy;
  const multiStart = strategy === 'true_shape' ? false : state.multiStart;
  return {
    rotationEnabled: state.rotationEnabled,
    rotationAngleStepDeg: state.rotationStepDeg,
    strategy,
    multiStart,
    seed: state.seed,
    commonLine: {
      enabled: state.mode === 'commonLine',
      maxMergeDistanceMm: state.commonLineMaxMergeDistanceMm,
      minSharedLenMm: state.commonLineMinSharedLenMm,
    },
  };
}

function mapEngineResultToSetBuilder(result: NestingResult, hashes: readonly string[]): { sheets: SheetResult[] } {
  return {
    sheets: result.sheets.map((sheet, idx) => ({
      id: `sheet-${sheet.sheetIndex + 1}`,
      utilization: Math.max(0, Math.min(100, Math.round(sheet.fillPercent))),
      partCount: sheet.placed.length,
      hash: hashes[idx] ?? '',
      sheetWidth: Math.max(1, result.sheet.width),
      sheetHeight: Math.max(1, result.sheet.height),
      placements: sheet.placed.map((p) => ({
        itemId: p.itemId,
        name: p.name,
        x: p.x,
        y: p.y,
        w: p.width,
        h: p.height,
        angleDeg: p.angleDeg,
      })),
    })),
  };
}

function mapLoadedCatalogName(catalogId: string | null): string {
  if (catalogId === null || catalogId === UNCATEGORIZED_CATALOG_ID) return t('setBuilder.unnamedCatalog');
  return workspaceCatalogs.find((c) => c.id === catalogId)?.name ?? 'Workspace';
}

function mapLoadedFileToLibraryItem(sourceId: number, nextLibraryId: number): LibraryItem | null {
  const lf = loadedFiles.find((f) => f.id === sourceId);
  if (!lf || lf.doc == null) return null;

  const bb = lf.doc.totalBBox;
  const w = bb !== null ? Math.max(1, Math.round(bb.max.x - bb.min.x)) : 0;
  const h = bb !== null ? Math.max(1, Math.round(bb.max.y - bb.min.y)) : 0;
  const status = lf.loadError ? 'error' : lf.loading ? 'warn' : 'ok';
  const issues = lf.loadError
    ? [lf.loadError]
    : lf.loading
      ? [t('setBuilder.fileLoading')]
      : [];

  return {
    id: nextLibraryId,
    sourceFileId: sourceId,
    name: lf.name,
    catalog: mapLoadedCatalogName(lf.catalogId),
    w,
    h,
    pierces: Math.max(0, lf.stats.totalPierces),
    cutLen: Math.max(0, lf.stats.totalCutLength),
    layersCount: lf.doc.layerNames.length,
    status,
    issues,
    thumbVariant: 1000 + sourceId,
  };
}

function sortMark(state: SetBuilderState, key: 'name' | 'area' | 'pierces' | 'cutLen'): string {
  if (state.sortBy !== key) return '';
  return state.sortDir === 'asc' ? ' ↑' : ' ↓';
}

function fmtLen(mm: number): string {
  return mm >= 1000 ? `${(mm / 1000).toFixed(2)}${t('unit.m')}` : `${mm.toFixed(0)}${t('unit.mm')}`;
}

function statusLabel(item: LibraryItem): string {
  return item.status === 'ok' ? t('setBuilder.status.ok') : item.status === 'warn' ? t('setBuilder.status.warn') : t('setBuilder.status.error');
}

function thumbSvg(_item: LibraryItem, large = false): string {
  const w = large ? 220 : 84;
  const h = large ? 140 : 56;
  const iconW = large ? 52 : 30;
  const iconH = large ? 62 : 36;
  const iconX = Math.round((w - iconW) / 2);
  const iconY = Math.round((h - iconH) / 2);
  const fold = Math.round(iconW * 0.26);
  return `
    <svg viewBox="0 0 ${w} ${h}" class="sb-thumb-svg" role="img" aria-label="DXF">
      <rect x="4" y="4" width="${w - 8}" height="${h - 8}" rx="7" fill="rgba(12,20,35,0.45)" stroke="rgba(255,255,255,0.12)"/>
      <path d="M${iconX} ${iconY + 2} h${iconW - fold} l${fold} ${fold} v${iconH - fold - 2} a4 4 0 0 1 -4 4 h-${iconW - 4} a4 4 0 0 1 -4 -4 v-${iconH - 2} a4 4 0 0 1 4 -4 z" fill="rgba(20,36,62,0.95)" stroke="rgba(126,198,255,0.8)"/>
      <path d="M${iconX + iconW - fold} ${iconY + 2} v${fold} h${fold}" fill="none" stroke="rgba(126,198,255,0.8)"/>
      <text x="${Math.round(w / 2)}" y="${iconY + iconH - 8}" text-anchor="middle" font-size="${large ? 14 : 9}" font-family="'Segoe UI', sans-serif" font-weight="700" fill="rgba(126,198,255,0.95)">DXF</text>
    </svg>
  `;
}

export function initSetBuilder(root: HTMLDivElement, trigger: HTMLButtonElement): void {
  const state = createInitialState();
  state.library = [];
  let sheetPresets = [...SHEET_PRESETS];
  let customSheetWidthMm = 1000;
  let customSheetHeightMm = 2000;
  let toastText = '';
  let toastTimer: ReturnType<typeof setTimeout> | null = null;
  let lastPickedLibraryId: number | null = null;
  let draggedLibraryId: number | null = null;
  let dragOverCatalogEl: HTMLElement | null = null;
  let lastEngineResult: NestingResult | null = null;
  let lastItemDocs = new Map<number, ItemDocData>();
  const dxfThumbCache = new Map<string, string>();

  function renderDxfThumbDataUrl(sourceFileId: number, width: number, height: number): string | null {
    const cacheKey = `${sourceFileId}:${width}x${height}`;
    const cached = dxfThumbCache.get(cacheKey);
    if (cached) return cached;

    const lf = loadedFiles.find((f) => f.id === sourceFileId);
    if (!lf || lf.loading || !lf.doc) return null;

    const bb = lf.doc.totalBBox;
    const bbW = bb ? Math.max(1e-6, bb.max.x - bb.min.x) : 0;
    const bbH = bb ? Math.max(1e-6, bb.max.y - bb.min.y) : 0;
    if (bbW <= 0 || bbH <= 0) return null;

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = 'rgba(7, 11, 18, 0.8)';
    ctx.fillRect(0, 0, width, height);

    const pad = Math.max(4, Math.round(Math.min(width, height) * 0.08));
    const availW = Math.max(1, width - pad * 2);
    const availH = Math.max(1, height - pad * 2);
    const scale = Math.max(1e-6, Math.min(availW / bbW, availH / bbH));

    const cx = bb!.min.x + bbW / 2;
    const cy = bb!.min.y + bbH / 2;
    const pixelSize = 1 / scale;
    const opts: EntityRenderOptions = {
      arcSegments: 28,
      splineSegments: 28,
      ellipseSegments: 28,
      pixelSize,
      viewExtent: Math.max(bbW, bbH) * 2,
    };

    ctx.save();
    ctx.translate(width / 2, height / 2);
    ctx.scale(scale, -scale);
    ctx.translate(-cx, -cy);
    for (const fe of lf.doc.flatEntities) {
      renderEntity(ctx, fe, opts);
    }
    ctx.restore();

    const dataUrl = canvas.toDataURL('image/png');
    dxfThumbCache.set(cacheKey, dataUrl);
    return dataUrl;
  }

  function buildThumbMarkup(item: LibraryItem, large = false): string {
    if (item.sourceFileId !== undefined) {
      const width = large ? 760 : 112;
      const height = large ? 460 : 72;
      const dataUrl = renderDxfThumbDataUrl(item.sourceFileId, width, height);
      if (dataUrl) {
        return `<img class="sb-thumb-real" src="${dataUrl}" alt="${esc(item.name)}" loading="lazy" />`;
      }
    }
    return thumbSvg(item, large);
  }

  function buildSheetPlacementsMarkup(sheet: SheetResult): string {
    const safeW = Math.max(1, sheet.sheetWidth);
    const safeH = Math.max(1, sheet.sheetHeight);
    const ratio = (safeW / safeH).toFixed(4);
    const placements = sheet.placements
      .slice(0, 120)
      .map((p) => {
        const left = Math.max(0, Math.min(100, (p.x / safeW) * 100));
        const width = Math.max(0.9, Math.min(100, (p.w / safeW) * 100));
        const top = Math.max(0, Math.min(100, (p.y / safeH) * 100));
        const height = Math.max(0.9, Math.min(100, (p.h / safeH) * 100));
        const thumb = renderDxfThumbDataUrl(p.itemId, 160, 100);
        return `
          <div class="sb-sheet-part" style="left:${left.toFixed(3)}%;top:${top.toFixed(3)}%;width:${width.toFixed(3)}%;height:${height.toFixed(3)}%;" title="${esc(p.name)}">
            ${thumb ? `<img class="sb-sheet-part-img" src="${thumb}" alt="${esc(p.name)}" loading="lazy" />` : '<span class="sb-sheet-part-fallback">DXF</span>'}
            <span class="sb-sheet-part-name">${esc(p.name)}</span>
          </div>
        `;
      })
      .join('');
    return `<div class="sb-sheet-canvas" style="--sheet-ratio:${ratio};">${placements}</div>`;
  }

  function buildSingleSheetResult(sheetIndex: number): NestingResult | null {
    if (!lastEngineResult) return null;
    const sheet = lastEngineResult.sheets[sheetIndex];
    if (!sheet) return null;
    return {
      sheet: lastEngineResult.sheet,
      gap: lastEngineResult.gap,
      sheets: [{ ...sheet, sheetIndex: 0 }],
      totalSheets: 1,
      totalPlaced: sheet.placed.length,
      totalRequired: sheet.placed.length,
      avgFillPercent: sheet.fillPercent,
      cutLengthEstimate: lastEngineResult.cutLengthEstimate,
      sharedCutLength: lastEngineResult.sharedCutLength,
      cutLengthAfterMerge: lastEngineResult.cutLengthAfterMerge,
      pierceEstimate: calcPierceEstimateForSheets([sheet]),
      pierceDelta: 0,
      strategy: lastEngineResult.strategy,
    };
  }

  function exportSheetByIndex(sheetIndex: number): boolean {
    const singleResult = buildSingleSheetResult(sheetIndex);
    if (!singleResult) return false;
    const dxfStr = exportNestingToDXF({ nestingResult: singleResult, itemDocs: lastItemDocs });
    const blob = new Blob([dxfStr], { type: 'application/dxf' });
    downloadBlob(blob, `set_builder_sheet_${sheetIndex + 1}.dxf`);
    return true;
  }

  function hydrateState(): void {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    try {
      const parsed = JSON.parse(raw) as {
        search?: string;
        catalogFilter?: string;
        sheetPresetId?: string;
        gapMm?: number;
        mode?: 'normal' | 'commonLine';
        nestStrategy?: 'maxrects_bbox' | 'true_shape';
        rotationEnabled?: boolean;
        rotationStepDeg?: 1 | 2 | 5;
        multiStart?: boolean;
        seed?: number;
        commonLineMaxMergeDistanceMm?: number;
        commonLineMinSharedLenMm?: number;
        sortBy?: 'name' | 'area' | 'pierces' | 'cutLen';
        sortDir?: 'asc' | 'desc';
        activeTab?: 'library' | 'results';
        customSheetPresets?: Array<{ id: string; label: string; w: number; h: number }>;
        customSheetWidthMm?: number;
        customSheetHeightMm?: number;
        set?: Array<{ libraryId: number; qty: number; enabled: boolean }>;
      };
      state.search = typeof parsed.search === 'string' ? parsed.search : '';
      state.catalogFilter = typeof parsed.catalogFilter === 'string' ? parsed.catalogFilter : 'All';
      state.sheetPresetId = typeof parsed.sheetPresetId === 'string' ? parsed.sheetPresetId : state.sheetPresetId;
      state.gapMm = Number.isFinite(parsed.gapMm) ? Math.max(0, parsed.gapMm ?? 0) : 5;
      state.mode = parsed.mode === 'commonLine' ? 'commonLine' : 'normal';
      state.nestStrategy = parsed.nestStrategy === 'true_shape' ? 'true_shape' : 'maxrects_bbox';
      state.rotationEnabled = parsed.rotationEnabled !== false;
      state.rotationStepDeg = parsed.rotationStepDeg === 1 || parsed.rotationStepDeg === 5 ? parsed.rotationStepDeg : 2;
      state.multiStart = parsed.multiStart !== false;
      state.seed = Number.isFinite(parsed.seed) ? Math.trunc(parsed.seed ?? 0) : 0;
      state.commonLineMaxMergeDistanceMm = Number.isFinite(parsed.commonLineMaxMergeDistanceMm)
        ? Math.max(0, parsed.commonLineMaxMergeDistanceMm ?? 0)
        : 0.2;
      state.commonLineMinSharedLenMm = Number.isFinite(parsed.commonLineMinSharedLenMm)
        ? Math.max(0, parsed.commonLineMinSharedLenMm ?? 0)
        : 20;
      state.sortBy = parsed.sortBy === 'area' || parsed.sortBy === 'pierces' || parsed.sortBy === 'cutLen' ? parsed.sortBy : 'name';
      state.sortDir = parsed.sortDir === 'desc' ? 'desc' : 'asc';
      state.activeTab = 'library';
      const customPresets = (parsed.customSheetPresets ?? []).filter((p) => {
        return typeof p.id === 'string'
          && p.id.startsWith('custom_')
          && typeof p.label === 'string'
          && Number.isFinite(p.w)
          && Number.isFinite(p.h)
          && p.w > 0
          && p.h > 0;
      });
      sheetPresets = [...SHEET_PRESETS, ...customPresets.map((p) => ({ id: p.id, label: p.label, w: p.w, h: p.h }))];
      customSheetWidthMm = Number.isFinite(parsed.customSheetWidthMm)
        ? Math.max(1, Math.round(parsed.customSheetWidthMm ?? 1))
        : customSheetWidthMm;
      customSheetHeightMm = Number.isFinite(parsed.customSheetHeightMm)
        ? Math.max(1, Math.round(parsed.customSheetHeightMm ?? 1))
        : customSheetHeightMm;
      if (!sheetPresets.some((p) => p.id === state.sheetPresetId)) {
        state.sheetPresetId = sheetPresets[0]?.id ?? SHEET_PRESETS[0]!.id;
      }
      state.set.clear();
      for (const row of parsed.set ?? []) {
        if (!Number.isFinite(row.libraryId) || !Number.isFinite(row.qty)) continue;
        if (row.qty <= 0) continue;
        state.set.set(row.libraryId, {
          libraryId: row.libraryId,
          qty: Math.max(1, Math.round(row.qty)),
          enabled: row.enabled !== false,
        });
      }
    } catch {
      // ignore malformed persisted state
    }
  }

  function persistState(): void {
    const customSheetPresets = sheetPresets
      .filter((p) => p.id.startsWith('custom_'))
      .map((p) => ({ id: p.id, label: p.label, w: p.w, h: p.h }));
    const payload = {
      search: state.search,
      catalogFilter: state.catalogFilter,
      sheetPresetId: state.sheetPresetId,
      gapMm: state.gapMm,
      mode: state.mode,
      nestStrategy: state.nestStrategy,
      rotationEnabled: state.rotationEnabled,
      rotationStepDeg: state.rotationStepDeg,
      multiStart: state.multiStart,
      seed: state.seed,
      commonLineMaxMergeDistanceMm: state.commonLineMaxMergeDistanceMm,
      commonLineMinSharedLenMm: state.commonLineMinSharedLenMm,
      sortBy: state.sortBy,
      sortDir: state.sortDir,
      customSheetPresets,
      customSheetWidthMm,
      customSheetHeightMm,
      set: [...state.set.values()].map((s) => ({ libraryId: s.libraryId, qty: s.qty, enabled: s.enabled })),
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  }

  function syncLoadedFilesIntoLibrary(): void {
    const loadedIds = new Set<number>(loadedFiles.map((f) => f.id));
    const existingLoadedBySource = new Map<number, LibraryItem>();
    for (const item of state.library) {
      if (item.sourceFileId !== undefined) {
        existingLoadedBySource.set(item.sourceFileId, item);
      }
    }

    state.library = state.library.filter((item) => item.sourceFileId !== undefined && loadedIds.has(item.sourceFileId));

    let nextLibraryId = Math.max(0, ...state.library.map((i) => i.id)) + 1;
    for (const lf of loadedFiles) {
      const existing = existingLoadedBySource.get(lf.id);
      const mapped = mapLoadedFileToLibraryItem(lf.id, existing?.id ?? nextLibraryId);
      if (!mapped) continue;

      if (existing) {
        const idx = state.library.findIndex((i) => i.id === existing.id);
        if (idx >= 0) state.library[idx] = mapped;
      } else {
        state.library.push(mapped);
        nextLibraryId++;
      }
    }

    const availableCatalogs = new Set<string>(['All', t('setBuilder.unnamedCatalog')]);
    for (const item of state.library) availableCatalogs.add(item.catalog);
    for (const c of workspaceCatalogs) availableCatalogs.add(c.name);
    if (!availableCatalogs.has(state.catalogFilter)) {
      state.catalogFilter = 'All';
    }
  }

  function showToast(msg: string): void {
    toastText = msg;
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      toastText = '';
      render();
    }, 1800);
    render();
  }

  async function copyHash(hash: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(hash);
      showToast(t('setBuilder.toast.hashCopied'));
    } catch {
      const ta = document.createElement('textarea');
      ta.value = hash;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      ta.remove();
      showToast(t('setBuilder.toast.hashCopied'));
    }
  }

  async function copyAllHashes(): Promise<void> {
    const hashes = state.results?.sheets.map((s) => s.hash).filter((h) => h.length > 0) ?? [];
    if (hashes.length === 0) {
      showToast(t('setBuilder.toast.noHashes'));
      return;
    }

    const text = hashes.join('\n');
    try {
      await navigator.clipboard.writeText(text);
      showToast(t('setBuilder.toast.allHashesCopied'));
    } catch {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      ta.remove();
      showToast(t('setBuilder.toast.allHashesCopied'));
    }
  }

  function toggleOpen(next?: boolean): void {
    state.open = typeof next === 'boolean' ? next : !state.open;
    render();
  }

  async function runNesting(): Promise<void> {
    if (!canRunNesting(state)) return;

    const sheet = getActiveSheetPreset(state, sheetPresets);
    const options = createNestingOptions(state);
    const gap = options.commonLine?.enabled ? 0 : Math.max(0, state.gapMm);
    const { items, skipped } = buildSetNestingItems(state);

    if (items.length === 0) {
      state.loading = false;
      render();
      showToast(t('setBuilder.toast.noEligible'));
      return;
    }

    state.loading = true;
    render();

    let result: NestingResult | null = null;
    try {
      try {
        const resp = await apiPostJSON<{ success: boolean; data: NestingResult }>('/api/nest', {
          items,
          sheet: { width: sheet.w, height: sheet.h },
          gap,
          rotationEnabled: options.rotationEnabled,
          rotationAngleStepDeg: options.rotationAngleStepDeg,
          strategy: options.strategy,
          multiStart: options.multiStart,
          seed: options.seed,
          commonLine: options.commonLine,
        });
        result = resp.data;
      } catch (apiErr) {
        console.warn('[set-builder] API nesting failed, falling back to local:', apiErr);
        result = nestItems(items, { width: sheet.w, height: sheet.h }, gap, options);
      }

      if (!result) {
        showToast(t('setBuilder.toast.nestingFailed'));
        return;
      }

      const correctedPierces = calcPierceEstimateForSheets(result.sheets);
      lastEngineResult = { ...result, pierceEstimate: correctedPierces };
      lastItemDocs = buildItemDocsForSet(state);

      let hashes: string[] = [];
      try {
        const shareResp = await apiPostJSON<{ success: boolean; hashes: string[] }>('/api/nesting-share', {
          nestingResult: result,
          itemDocs: Object.fromEntries(lastItemDocs),
        });
        hashes = shareResp.hashes;
      } catch (shareErr) {
        console.warn('[set-builder] sharing hashes failed:', shareErr);
      }

      state.results = mapEngineResultToSetBuilder(result, hashes);
      state.activeTab = 'results';
      showToast(skipped > 0 ? `${t('setBuilder.toast.nestingFinished')} (${skipped} ${t('setBuilder.toast.skipped')})` : t('setBuilder.toast.nestingFinished'));
    } finally {
      state.loading = false;
      render();
    }
  }

  function buildLibraryRow(item: LibraryItem): string {
    const inSet = getSetItem(state, item.id);
    const checked = state.selectedLibraryIds.has(item.id) ? 'checked' : '';
    const selectedClass = checked ? 'sb-lib-row--selected' : '';
    const menuOpen = state.openMenuLibraryId === item.id;
    const draggable = item.sourceFileId !== undefined ? 'draggable="true"' : '';
    return `
      <div class="sb-lib-row sb-lib-row--table" data-a="lib-row" data-id="${item.id}" ${draggable}>
        <label class="sb-chk"><input type="checkbox" data-a="pick-lib" data-id="${item.id}" ${checked} /></label>
        <div class="sb-thumb">${buildThumbMarkup(item)}</div>
        <div class="sb-meta">
          <div class="sb-name">${esc(item.name)}</div>
          <div class="sb-sub">${t('setBuilder.catalog')}: ${esc(item.catalog)} · ${item.w}×${item.h} · ${t('setBuilder.piercesShort')}:${item.pierces} · ${t('setBuilder.cutLengthShort')}:${fmtLen(item.cutLen)} · ${t('setBuilder.layers')}:${item.layersCount}</div>
          <span class="sb-badge sb-badge--${item.status}">${statusLabel(item)}</span>
        </div>
        <div class="sb-stepper" data-a="stepper" data-id="${item.id}">
          <button data-a="qty-minus" data-id="${item.id}">-</button>
          <span>${inSet?.qty ?? 0}</span>
          <button data-a="qty-plus" data-id="${item.id}">+</button>
        </div>
        <div class="sb-col">${item.w}×${item.h}</div>
        <div class="sb-col">${item.pierces}</div>
        <div class="sb-col">${fmtLen(item.cutLen)}</div>
        <div class="sb-actions">
          <button class="sb-btn" data-a="${inSet ? 'remove-set' : 'add-set'}" data-id="${item.id}">${inSet ? t('setBuilder.remove') : t('setBuilder.addToSet')}</button>
          <button class="sb-icon" data-a="preview-lib" data-id="${item.id}" title="${t('setBuilder.openPreview')}">👁</button>
          <button class="sb-icon" data-a="toggle-menu" data-id="${item.id}" title="${t('setBuilder.menu')}">⋯</button>
          <div class="sb-menu ${menuOpen ? 'open' : ''}">
            <button data-a="menu-delete" data-id="${item.id}">${t('setBuilder.menu.delete')}</button>
            <button data-a="menu-move" data-id="${item.id}">${t('setBuilder.menu.moveToCatalog')}</button>
            <button data-a="menu-download" data-id="${item.id}">${t('setBuilder.menu.download')}</button>
          </div>
        </div>
      </div>
    `;
  }

  async function removeLibraryItem(libraryId: number): Promise<boolean> {
    const item = getLibraryItem(state, libraryId);
    if (!item) return false;

    if (item.sourceFileId !== undefined) {
      const fileIdx = loadedFiles.findIndex((f) => f.id === item.sourceFileId);
      if (fileIdx >= 0) {
        const target = loadedFiles[fileIdx]!;
        if (target.remoteId) {
          try {
            await apiPostJSON<{ success: boolean }>('/api/library-files-delete', {
              fileId: target.remoteId,
            }, getAuthHeaders());
          } catch {
            showToast(t('setBuilder.toast.itemDeleteFailed'));
            return false;
          }
        }
        loadedFiles.splice(fileIdx, 1);
      }
    }

    const idx = state.library.findIndex((it) => it.id === libraryId);
    if (idx >= 0) state.library.splice(idx, 1);
    state.set.delete(libraryId);
    state.selectedLibraryIds.delete(libraryId);
    if (state.previewLibraryId === libraryId) state.previewLibraryId = null;
    saveGuestDraft();
    return true;
  }

  async function moveLibraryItemToCatalogName(libraryId: number, targetCatalogName: string): Promise<boolean> {
    const item = getLibraryItem(state, libraryId);
    if (!item) return false;

    const unnamedCatalogName = t('setBuilder.unnamedCatalog');
    let nextCatalogId: string | null = null;
    let nextCatalogName = unnamedCatalogName;

    if (targetCatalogName !== unnamedCatalogName) {
      const found = workspaceCatalogs.find((c) => c.name === targetCatalogName);
      if (!found) return false;
      nextCatalogId = found.id;
      nextCatalogName = found.name;
    }

    if (item.sourceFileId !== undefined) {
      const lf = loadedFiles.find((f) => f.id === item.sourceFileId);
      if (lf) {
        const prevCatalogId = lf.catalogId;
        if (prevCatalogId === nextCatalogId) return false;
        lf.catalogId = nextCatalogId;
        if (lf.remoteId) {
          try {
            await apiPatchJSON<{ success: boolean }>('/api/library-files-update', {
              fileId: lf.remoteId,
              catalogId: nextCatalogId,
            }, getAuthHeaders());
          } catch {
            lf.catalogId = prevCatalogId;
            return false;
          }
        }
      }
    }

    const libIdx = state.library.findIndex((it) => it.id === libraryId);
    if (libIdx < 0) return false;
    state.library[libIdx] = { ...item, catalog: nextCatalogName };
    saveGuestDraft();
    return true;
  }

  async function moveLibraryItemToCatalog(libraryId: number): Promise<void> {
    const item = getLibraryItem(state, libraryId);
    if (!item) return;

    const unnamedCatalogName = t('setBuilder.unnamedCatalog');
    const options = [unnamedCatalogName, ...workspaceCatalogs.map((c, i) => `${i + 1}: ${c.name}`)].join('\n');
    const raw = prompt(`${t('setBuilder.prompt.moveToCatalog')}\n${options}`, item.catalog);
    if (raw == null) return;

    const val = raw.trim();
    const lower = val.toLowerCase();

    let nextCatalogName = unnamedCatalogName;
    if (!val || lower === unnamedCatalogName.toLowerCase() || lower === '0' || lower === 'uncategorized') {
      nextCatalogName = unnamedCatalogName;
    } else {
      const idx = Number(val);
      if (Number.isFinite(idx) && idx >= 1 && idx <= workspaceCatalogs.length) {
        nextCatalogName = workspaceCatalogs[idx - 1]!.name;
      } else {
        const found = workspaceCatalogs.find((c) => c.name.toLowerCase() === lower);
        if (!found) {
          showToast(t('setBuilder.toast.catalogNotFound'));
          return;
        }
        nextCatalogName = found.name;
      }
    }
    const moved = await moveLibraryItemToCatalogName(libraryId, nextCatalogName);
    if (!moved) {
      showToast(t('setBuilder.toast.itemMoveFailed'));
      return;
    }
    showToast(t('setBuilder.toast.itemMoved'));
  }

  async function downloadLibraryItemSource(libraryId: number): Promise<void> {
    const item = getLibraryItem(state, libraryId);
    if (!item || item.sourceFileId === undefined) {
      showToast(t('setBuilder.toast.sourceUnavailable'));
      return;
    }

    const lf = loadedFiles.find((f) => f.id === item.sourceFileId);
    if (!lf) {
      showToast(t('setBuilder.toast.sourceUnavailable'));
      return;
    }

    try {
      if (lf.localBase64) {
        const bin = atob(lf.localBase64);
        const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
        downloadBlob(new Blob([bytes.buffer], { type: 'application/dxf' }), lf.name);
        showToast(t('setBuilder.toast.downloadStarted'));
        return;
      }

      if (!lf.remoteId) {
        showToast(t('setBuilder.toast.sourceUnavailable'));
        return;
      }

      const dl = await apiGetJSON<{ success: boolean; name: string; base64: string; sizeBytes: number }>(
        `/api/library-files-download?fileId=${encodeURIComponent(lf.remoteId)}`,
        getAuthHeaders(),
      );
      const bin = atob(dl.base64);
      const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
      downloadBlob(new Blob([bytes.buffer], { type: 'application/dxf' }), dl.name || lf.name);
      showToast(t('setBuilder.toast.downloadStarted'));
    } catch {
      showToast(t('setBuilder.toast.downloadFailed'));
    }
  }

  function getCatalogByFilterName(): { id: string; name: string } | null {
    if (state.catalogFilter === 'All' || state.catalogFilter === t('setBuilder.unnamedCatalog')) return null;
    const found = workspaceCatalogs.find((c) => c.name === state.catalogFilter);
    return found ? { id: found.id, name: found.name } : null;
  }

  function getCatalogByName(catalogName: string | null | undefined): { id: string; name: string } | null {
    const name = (catalogName ?? '').trim();
    if (!name || name === 'All' || name === t('setBuilder.unnamedCatalog')) return null;
    const found = workspaceCatalogs.find((c) => c.name === name);
    return found ? { id: found.id, name: found.name } : null;
  }

  function getVisibleLibraryItems(): LibraryItem[] {
    const q = state.search.trim().toLowerCase();
    const filtered = state.library.filter((item) => q.length === 0 || item.name.toLowerCase().includes(q));
    const sorted = [...filtered].sort((a, b) => {
      if (state.sortBy === 'name') return a.name.localeCompare(b.name);
      if (state.sortBy === 'pierces') return a.pierces - b.pierces;
      if (state.sortBy === 'cutLen') return a.cutLen - b.cutLen;
      return a.w * a.h - b.w * b.h;
    });
    return state.sortDir === 'asc' ? sorted : sorted.reverse();
  }

  async function addCatalog(): Promise<void> {
    if (!authSessionToken) {
      showToast(t('catalog.add.authRequired'));
      return;
    }
    const name = prompt(t('catalog.add.prompt'))?.trim() ?? '';
    if (!name) return;
    try {
      const resp = await apiPostJSON<{ success: boolean; catalog: { id: string; name: string; workspaceId: string; createdAt: number; updatedAt: number } }>(
        '/api/library-catalogs',
        { name },
        getAuthHeaders(),
      );
      workspaceCatalogs.push(resp.catalog);
      state.catalogFilter = 'All';
      showToast(t('setBuilder.toast.catalogAdded'));
      render();
    } catch {
      showToast(t('setBuilder.toast.catalogOpFailed'));
    }
  }

  async function renameCurrentCatalog(catalogName?: string): Promise<void> {
    const current = getCatalogByName(catalogName) ?? getCatalogByFilterName();
    if (!current) {
      showToast(t('setBuilder.toast.catalogActionUnavailable'));
      return;
    }
    const nextName = prompt(t('catalog.rename.title'), current.name)?.trim() ?? '';
    if (!nextName || nextName === current.name) return;

    const cat = workspaceCatalogs.find((c) => c.id === current.id);
    if (!cat) return;
    const prevName = cat.name;
    (cat as { name: string }).name = nextName;
    state.catalogFilter = nextName;
    render();

    try {
      await apiPatchJSON<{ success: boolean }>(
        '/api/library-catalogs-update',
        { catalogId: current.id, name: nextName },
        getAuthHeaders(),
      );
      showToast(t('setBuilder.toast.catalogRenamed'));
    } catch {
      (cat as { name: string }).name = prevName;
      state.catalogFilter = prevName;
      showToast(t('setBuilder.toast.catalogOpFailed'));
      render();
    }
  }

  async function deleteCurrentCatalog(catalogName?: string): Promise<void> {
    const current = getCatalogByName(catalogName) ?? getCatalogByFilterName();
    if (!current) {
      showToast(t('setBuilder.toast.catalogActionUnavailable'));
      return;
    }
    const modeRaw = prompt(t('setBuilder.prompt.deleteCatalogMode'), 'move')?.trim().toLowerCase();
    if (!modeRaw) return;
    const mode: 'move_to_uncategorized' | 'delete_files' = modeRaw === 'delete' ? 'delete_files' : 'move_to_uncategorized';

    const catIdx = workspaceCatalogs.findIndex((c) => c.id === current.id);
    if (catIdx < 0) return;
    const removedCat = workspaceCatalogs.splice(catIdx, 1)[0]!;
    const affected: Array<{ fileId: number; oldCatalogId: string | null }> = [];
    const deletedFiles: Array<{ file: typeof loadedFiles[number]; index: number }> = [];
    const deletedFileIds = new Set<number>();

    if (mode === 'move_to_uncategorized') {
      for (const f of loadedFiles) {
        if (f.catalogId !== current.id) continue;
        affected.push({ fileId: f.id, oldCatalogId: f.catalogId });
        f.catalogId = null;
      }
    } else {
      for (let i = loadedFiles.length - 1; i >= 0; i--) {
        const f = loadedFiles[i]!;
        if (f.catalogId !== current.id) continue;
        affected.push({ fileId: f.id, oldCatalogId: f.catalogId });
        deletedFiles.push({ file: f, index: i });
        deletedFileIds.add(f.id);
        loadedFiles.splice(i, 1);
      }
      state.library = state.library.filter((it) => it.sourceFileId === undefined || !deletedFileIds.has(it.sourceFileId));
      for (const id of deletedFileIds) {
        const lib = state.library.find((it) => it.sourceFileId === id);
        if (lib) {
          state.set.delete(lib.id);
          state.selectedLibraryIds.delete(lib.id);
        }
      }
    }

    state.catalogFilter = 'All';
    saveGuestDraft();
    render();

    try {
      await apiPostJSON<{ success: boolean }>(
        '/api/library-catalogs-delete',
        { catalogId: current.id, mode },
        getAuthHeaders(),
      );
      showToast(t('setBuilder.toast.catalogDeleted'));
    } catch {
      workspaceCatalogs.splice(catIdx, 0, removedCat);
      for (const a of affected) {
        const file = loadedFiles.find((f) => f.id === a.fileId);
        if (file) file.catalogId = a.oldCatalogId;
      }
      if (mode === 'delete_files') {
        deletedFiles.sort((a, b) => a.index - b.index);
        for (const d of deletedFiles) loadedFiles.splice(Math.min(d.index, loadedFiles.length), 0, d.file);
      }
      showToast(t('setBuilder.toast.catalogOpFailed'));
      render();
    }
  }

  function renderPreviewModal(): string {
    const item = state.previewLibraryId !== null ? getLibraryItem(state, state.previewLibraryId) : null;
    if (!item && !state.previewSheetId) return '';

    if (item) {
      const set = getSetItem(state, item.id);
      const allItems = getVisibleLibraryItems();
      const idx = allItems.findIndex((it) => it.id === item.id);
      const prevItem = idx > 0 ? allItems[idx - 1] : null;
      const nextItem = idx >= 0 && idx < allItems.length - 1 ? allItems[idx + 1] : null;
      const statusClass = item.status === 'ok' ? 'sb-badge--ok' : item.status === 'warn' ? 'sb-badge--warn' : 'sb-badge--error';
      const area = Math.round(item.w * item.h / 100) / 100;

      const hasPierces = item.pierces > 0 && item.sourceFileId !== undefined;
      return `
        <div class="sb-modal-backdrop">
          <div class="sb-modal sb-modal--dxf">
            <div class="sb-modal-head">
              <div class="sb-modal-title">
                <button class="sb-icon sb-modal-nav" data-a="preview-lib" data-id="${prevItem?.id ?? ''}" ${!prevItem ? 'disabled' : ''} title="${prevItem ? esc(prevItem.name) : ''}">‹</button>
                <div class="sb-modal-title-text">
                  <span class="sb-modal-name">${esc(item.name)}</span>
                  <span class="sb-modal-catalog">${esc(item.catalog)}</span>
                </div>
                <button class="sb-icon sb-modal-nav" data-a="preview-lib" data-id="${nextItem?.id ?? ''}" ${!nextItem ? 'disabled' : ''} title="${nextItem ? esc(nextItem.name) : ''}">›</button>
              </div>
              <div class="sb-modal-head-right">
                ${hasPierces ? `
                <label class="sb-pierce-toggle ${state.previewShowPierces ? 'on' : ''}" title="${t('setBuilder.pierces')}">
                  <input type="checkbox" data-a="toggle-pierces" ${state.previewShowPierces ? 'checked' : ''} />
                  <span class="sb-pierce-toggle-dot"></span>
                  <span>${t('setBuilder.pierces')}</span>
                </label>` : ''}
                <span class="sb-badge ${statusClass}">${statusLabel(item)}</span>
                <button class="sb-icon" data-a="close-preview" title="${t('setBuilder.close')}">✕</button>
              </div>
            </div>
            <div class="sb-modal-dxf-body">
              <div class="sb-modal-dxf-preview">
                <canvas id="sb-modal-dxf-canvas" class="sb-modal-dxf-canvas" data-source-id="${item.sourceFileId ?? ''}"></canvas>
              </div>
              <div class="sb-modal-dxf-side">
                <div class="sb-modal-stats">
                  <div class="sb-modal-stat">
                    <div class="sb-modal-stat-label">${t('setBuilder.size')}</div>
                    <div class="sb-modal-stat-value">${item.w} × ${item.h} ${t('unit.mm')}</div>
                  </div>
                  <div class="sb-modal-stat">
                    <div class="sb-modal-stat-label">${t('setBuilder.area')}</div>
                    <div class="sb-modal-stat-value">${area} ${t('unit.cm2')}</div>
                  </div>
                  <div class="sb-modal-stat">
                    <div class="sb-modal-stat-label">${t('setBuilder.pierces')}</div>
                    <div class="sb-modal-stat-value">${item.pierces}</div>
                  </div>
                  <div class="sb-modal-stat">
                    <div class="sb-modal-stat-label">${t('setBuilder.cutLength')}</div>
                    <div class="sb-modal-stat-value">${fmtLen(item.cutLen)}</div>
                  </div>
                  <div class="sb-modal-stat">
                    <div class="sb-modal-stat-label">${t('setBuilder.layers')}</div>
                    <div class="sb-modal-stat-value">${item.layersCount}</div>
                  </div>
                  ${item.issues.length > 0 ? `
                  <div class="sb-modal-stat sb-modal-stat--warn">
                    <div class="sb-modal-stat-label">${t('setBuilder.issues.title')}</div>
                    <div class="sb-modal-stat-value sb-modal-stat-issues">${esc(item.issues.join(' · '))}</div>
                  </div>` : ''}
                </div>
                <div class="sb-modal-set-block">
                  <div class="sb-modal-set-label">${t('setBuilder.tabSet')}</div>
                  <div class="sb-modal-set-controls">
                    <button class="sb-btn ${set ? 'sb-btn--ghost' : 'sb-btn--primary'} sb-modal-set-btn" data-a="${set ? 'remove-set' : 'add-set'}" data-id="${item.id}">
                      ${set ? t('setBuilder.removeFromSet') : t('setBuilder.addToSet')}
                    </button>
                    <div class="sb-stepper sb-modal-stepper">
                      <button data-a="qty-minus" data-id="${item.id}" ${!set ? 'disabled' : ''}>−</button>
                      <span>${set?.qty ?? 0}</span>
                      <button data-a="qty-plus" data-id="${item.id}" ${!set ? 'disabled' : ''}>+</button>
                    </div>
                  </div>
                  ${set ? `<div class="sb-modal-set-hint">${t('setBuilder.totalQty')}: ${set.qty}</div>` : ''}
                </div>
                <div class="sb-modal-nav-footer">
                  <span class="sb-modal-counter">${idx + 1} / ${allItems.length}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      `;
    }

    const sheet = state.results?.sheets.find((s) => s.id === state.previewSheetId) ?? null;
    if (!sheet) return '';
    const sheets = state.results?.sheets ?? [];
    const sheetIdx = sheets.findIndex((s) => s.id === sheet.id);
    const prevSheet = sheetIdx > 0 ? sheets[sheetIdx - 1] : null;
    const nextSheet = sheetIdx >= 0 && sheetIdx < sheets.length - 1 ? sheets[sheetIdx + 1] : null;
    const utilizationClamped = Math.max(0, Math.min(100, sheet.utilization));
    const utilizationColor = utilizationClamped >= 75 ? '#57ffbc' : utilizationClamped >= 50 ? '#ffd26f' : '#ff8b98';

    return `
      <div class="sb-modal-backdrop">
        <div class="sb-modal sb-modal--sheet">
          <div class="sb-modal-head">
            <div class="sb-modal-title">
              <button class="sb-icon sb-modal-nav" data-a="preview-sheet" data-sheet="${prevSheet?.id ?? ''}" ${!prevSheet ? 'disabled' : ''} title="${prevSheet?.id.toUpperCase() ?? ''}">‹</button>
              <div class="sb-modal-title-text">
                <span class="sb-modal-name">${t('setBuilder.sheet')} ${sheetIdx + 1}</span>
                <span class="sb-modal-catalog">${sheet.sheetWidth} × ${sheet.sheetHeight} ${t('unit.mm')}</span>
              </div>
              <button class="sb-icon sb-modal-nav" data-a="preview-sheet" data-sheet="${nextSheet?.id ?? ''}" ${!nextSheet ? 'disabled' : ''} title="${nextSheet?.id.toUpperCase() ?? ''}">›</button>
            </div>
            <div class="sb-modal-head-right">
              <span class="sb-modal-counter">${sheetIdx + 1} / ${sheets.length}</span>
              <button class="sb-icon" data-a="close-preview" title="${t('setBuilder.close')}">✕</button>
            </div>
          </div>
          <div class="sb-modal-sheet-body">
            <div class="sb-modal-sheet-preview">${buildSheetPlacementsMarkup(sheet)}</div>
            <div class="sb-modal-sheet-side">
              <div class="sb-modal-util-block">
                <div class="sb-modal-util-label">${t('setBuilder.utilization')}</div>
                <div class="sb-modal-util-bar">
                  <div class="sb-modal-util-fill" style="width:${utilizationClamped}%;background:${utilizationColor};"></div>
                </div>
                <div class="sb-modal-util-value" style="color:${utilizationColor};">${sheet.utilization}%</div>
              </div>
              <div class="sb-modal-stats">
                <div class="sb-modal-stat">
                  <div class="sb-modal-stat-label">${t('setBuilder.partCount')}</div>
                  <div class="sb-modal-stat-value">${sheet.partCount}</div>
                </div>
                <div class="sb-modal-stat">
                  <div class="sb-modal-stat-label">${t('setBuilder.size')}</div>
                  <div class="sb-modal-stat-value">${sheet.sheetWidth} × ${sheet.sheetHeight}</div>
                </div>
              </div>
              ${sheet.hash ? `
              <div class="sb-modal-hash-block">
                <div class="sb-modal-stat-label">${t('setBuilder.hash')}</div>
                <code class="sb-hash-code sb-modal-hash-code" data-a="copy-hash" data-hash="${sheet.hash}" title="${t('setBuilder.copyHash')}">${sheet.hash}</code>
              </div>` : ''}
              <div class="sb-modal-sheet-actions">
                <button class="sb-btn sb-btn--primary" data-a="export-sheet" data-index="${sheetIdx}">${t('setBuilder.exportDxf')}</button>
                <button class="sb-btn sb-btn--ghost" data-a="copy-hash" data-hash="${sheet.hash}" ${sheet.hash ? '' : 'disabled'}>${t('setBuilder.copyHash')}</button>
              </div>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  // ─── Modal canvas view state (zoom/pan) ─────────────────────────────
  let _modalZoom = 1;
  let _modalPanX = 0;
  let _modalPanY = 0;
  let _modalBaseScale = 1;
  let _modalCx = 0;
  let _modalCy = 0;
  let _modalCanvasW = 0;
  let _modalCanvasH = 0;
  let _modalInteractionAttached = false;

  function drawModalCanvas(
    ctx: CanvasRenderingContext2D,
    lf: typeof loadedFiles[number],
    cw: number,
    ch: number,
  ): void {
    ctx.clearRect(0, 0, cw, ch);
    ctx.fillStyle = 'rgba(7, 11, 18, 0.85)';
    ctx.fillRect(0, 0, cw, ch);

    const totalScale = _modalBaseScale * _modalZoom;
    const pixelSize = 1 / totalScale;
    const opts: EntityRenderOptions = {
      arcSegments: 32,
      splineSegments: 32,
      ellipseSegments: 32,
      pixelSize,
      viewExtent: Math.max(
        (lf.doc.totalBBox?.max.x ?? 0) - (lf.doc.totalBBox?.min.x ?? 0),
        (lf.doc.totalBBox?.max.y ?? 0) - (lf.doc.totalBBox?.min.y ?? 0),
      ) * 2,
    };

    ctx.save();
    ctx.translate(cw / 2 + _modalPanX, ch / 2 + _modalPanY);
    ctx.scale(totalScale, -totalScale);
    ctx.translate(-_modalCx, -_modalCy);
    for (const fe of lf.doc.flatEntities) {
      renderEntity(ctx, fe, opts);
    }
    ctx.restore();

    if (state.previewShowPierces && lf.stats.chains.length > 0) {
      const dotR = Math.max(2, Math.min(10, totalScale * 1.5));
      ctx.save();
      ctx.translate(cw / 2 + _modalPanX, ch / 2 + _modalPanY);
      ctx.scale(totalScale, -totalScale);
      ctx.translate(-_modalCx, -_modalCy);

      for (const chain of lf.stats.chains) {
        const p = chain.piercePoint;
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.scale(1 / totalScale, -1 / totalScale);

        ctx.beginPath();
        ctx.arc(0, 0, dotR + 2, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(0, 255, 157, 0.25)';
        ctx.fill();

        ctx.beginPath();
        ctx.arc(0, 0, dotR, 0, Math.PI * 2);
        ctx.fillStyle = '#00ff9d';
        ctx.shadowColor = '#00ff9d';
        ctx.shadowBlur = 8;
        ctx.fill();
        ctx.shadowBlur = 0;

        ctx.restore();
      }
      ctx.restore();
    }
  }

  function setupModalCanvasInteraction(canvas: HTMLCanvasElement, lf: typeof loadedFiles[number]): void {
    if (_modalInteractionAttached) return;
    _modalInteractionAttached = true;

    let dragging = false;
    let dragStartX = 0;
    let dragStartY = 0;
    let dragStartPanX = 0;
    let dragStartPanY = 0;

    function redraw(): void {
      const ctx = canvas.getContext('2d');
      if (ctx) drawModalCanvas(ctx, lf, canvas.width, canvas.height);
    }

    canvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      const rect = canvas.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;

      const factor = e.deltaY < 0 ? 1.12 : 1 / 1.12;
      const newZoom = Math.max(0.05, Math.min(200, _modalZoom * factor));

      // Keep point under cursor fixed: offset from canvas center
      const ocx = mx - canvas.width / 2;
      const ocy = my - canvas.height / 2;
      const ratio = newZoom / _modalZoom;
      _modalPanX = ocx - ratio * (ocx - _modalPanX);
      _modalPanY = ocy - ratio * (ocy - _modalPanY);
      _modalZoom = newZoom;
      redraw();
    }, { passive: false });

    canvas.addEventListener('mousedown', (e) => {
      if (e.button !== 0) return;
      dragging = true;
      dragStartX = e.clientX;
      dragStartY = e.clientY;
      dragStartPanX = _modalPanX;
      dragStartPanY = _modalPanY;
      canvas.style.cursor = 'grabbing';
    });

    window.addEventListener('mousemove', (e) => {
      if (!dragging) return;
      _modalPanX = dragStartPanX + e.clientX - dragStartX;
      _modalPanY = dragStartPanY + e.clientY - dragStartY;
      redraw();
    });

    window.addEventListener('mouseup', () => {
      if (!dragging) return;
      dragging = false;
      canvas.style.cursor = 'grab';
    });

    canvas.addEventListener('dblclick', () => {
      _modalZoom = 1;
      _modalPanX = 0;
      _modalPanY = 0;
      redraw();
    });

    canvas.style.cursor = 'grab';
  }

  function applyModalPierceCanvas(): void {
    const canvas = root.querySelector<HTMLCanvasElement>('#sb-modal-dxf-canvas');
    if (!canvas) return;
    const sourceFileId = Number(canvas.dataset.sourceId);
    if (!Number.isFinite(sourceFileId) || sourceFileId <= 0) return;

    const lf = loadedFiles.find((f) => f.id === sourceFileId);
    if (!lf || lf.loading || !lf.doc) return;

    const bb = lf.doc.totalBBox;
    const bbW = bb ? Math.max(1e-6, bb.max.x - bb.min.x) : 0;
    const bbH = bb ? Math.max(1e-6, bb.max.y - bb.min.y) : 0;
    if (bbW <= 0 || bbH <= 0) return;

    const container = canvas.parentElement;
    const cw = container ? Math.max(100, container.clientWidth) : 760;
    const ch = container ? Math.max(100, container.clientHeight) : 460;
    canvas.width = cw;
    canvas.height = ch;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Recalculate base scale (fit to canvas) and document center
    const pad = Math.max(4, Math.round(Math.min(cw, ch) * 0.06));
    const availW = Math.max(1, cw - pad * 2);
    const availH = Math.max(1, ch - pad * 2);
    _modalBaseScale = Math.max(1e-6, Math.min(availW / bbW, availH / bbH));
    _modalCx = bb!.min.x + bbW / 2;
    _modalCy = bb!.min.y + bbH / 2;
    _modalCanvasW = cw;
    _modalCanvasH = ch;

    drawModalCanvas(ctx, lf, cw, ch);
    setupModalCanvasInteraction(canvas, lf);
  }

  function render(): void {
    syncLoadedFilesIntoLibrary();

    const filtered = getVisibleLibraryItems();
    const setRows = getSetRows(state);
    const totals = getTotals(state);
    const issues = getAggregatedIssues(state);
    const unnamedCatalogName = t('setBuilder.unnamedCatalog');
    const commonLineActive = lastEngineResult?.gap === 0;
    const sharedCutLen = lastEngineResult?.sharedCutLength ?? 0;
    const pierceDelta = lastEngineResult?.pierceDelta ?? 0;
    const showResultsInMain = state.activeTab === 'results';

    const tableHead = `
      <div class="sb-table-head">
        <div></div><div></div>
        <button class="sb-th" data-a="sort-col" data-sort="name">${t('setBuilder.name')}${sortMark(state, 'name')}</button>
        <div>${t('setBuilder.qty')}</div>
        <button class="sb-th" data-a="sort-col" data-sort="area">W×H${sortMark(state, 'area')}</button>
        <button class="sb-th" data-a="sort-col" data-sort="pierces">${t('setBuilder.pierces')}${sortMark(state, 'pierces')}</button>
        <button class="sb-th" data-a="sort-col" data-sort="cutLen">${t('setBuilder.cutLength')}${sortMark(state, 'cutLen')}</button>
        <div>${t('setBuilder.actions')}</div>
      </div>
    `;
    const renderCatalogItems = (items: LibraryItem[]): string =>
      `${tableHead}${items.map((item) => buildLibraryRow(item)).join('')}`;

    const groupedCatalogContent = (() => {
      const groups = new Map<string, LibraryItem[]>();
      for (const item of filtered) {
        const list = groups.get(item.catalog);
        if (list) list.push(item);
        else groups.set(item.catalog, [item]);
      }

      const allCatalogNames = new Set<string>();
      for (const c of workspaceCatalogs) allCatalogNames.add(c.name);
      for (const item of state.library) allCatalogNames.add(item.catalog);
      allCatalogNames.add(unnamedCatalogName);

      const orderedCatalogs = [
        ...workspaceCatalogs.map((c) => c.name),
        unnamedCatalogName,
        ...[...allCatalogNames].filter((name) => name !== unnamedCatalogName && !workspaceCatalogs.some((c) => c.name === name)),
      ];

      return orderedCatalogs
        .map((catalogName) => {
          const items = groups.get(catalogName) ?? [];
          const canManageCatalog = catalogName !== unnamedCatalogName && workspaceCatalogs.some((c) => c.name === catalogName);
          return `
            <section class="sb-catalog-group">
              <div class="sb-catalog-group-head" data-a="catalog-drop" data-catalog="${esc(catalogName)}">
                <div class="sb-catalog-group-meta">
                  <span class="sb-catalog-folder-icon">📁</span><span class="sb-catalog-group-name">${esc(catalogName)}</span>
                  <span class="sb-catalog-group-count">${items.length}</span>
                </div>
                ${canManageCatalog ? `
                  <div class="sb-catalog-group-actions">
                    <button class="sb-icon" data-a="catalog-rename" data-catalog="${esc(catalogName)}" title="${t('setBuilder.catalogRename')}">✎</button>
                    <button class="sb-icon" data-a="catalog-delete" data-catalog="${esc(catalogName)}" title="${t('setBuilder.catalogDelete')}">🗑</button>
                  </div>
                ` : ''}
              </div>
              <div class="sb-catalog-group-body sb-library--table">
                ${items.length === 0
                  ? `<div class="sb-catalog-empty">${t('setBuilder.empty.noItems')}</div>`
                  : renderCatalogItems(items)}
              </div>
            </section>
          `;
        })
        .join('');
    })();

    const selectedCount = state.selectedLibraryIds.size;
    const runDisabled = canRunNesting(state) ? '' : 'disabled';
    const authActive = authSessionToken.length > 0;
    const localeLabel = getLocale().toUpperCase();
    const authWorkspaceLabel = authActive
      ? `WS: ${authWorkspaceId.length > 12 ? authWorkspaceId.slice(0, 12) + '…' : authWorkspaceId}`
      : t('toolbar.guest');

    root.classList.toggle('hidden', !state.open);
    root.setAttribute('aria-hidden', state.open ? 'false' : 'true');
    trigger.classList.toggle('active', state.open);

    root.innerHTML = state.open ? `
      <div class="sb-shell">
        <div class="sb-topbar">
          <span class="sb-auth-pill" title="${esc(authWorkspaceLabel)}">${esc(authWorkspaceLabel)}</span>
          <button class="sb-btn sb-btn--ghost" data-a="lang-toggle">${localeLabel}</button>
          <button class="sb-btn sb-btn--ghost" data-a="tg-login">${authActive ? t('auth.changeAccount') : t('toolbar.login')}</button>
          ${authActive ? `<button class="sb-btn sb-btn--ghost" data-a="tg-logout">${t('toolbar.logout')}</button>` : ''}
          <button class="sb-btn sb-btn--ghost" data-a="close">${t('setBuilder.close')}</button>
        </div>

        <div class="sb-main">
          <div class="sb-left">
            <div class="sb-list-toolbar">
              <div class="sb-tabs">
                <button class="${state.activeTab === 'library' ? 'active' : ''}" data-a="tab" data-tab="library">${t('setBuilder.tabLibrary')}</button>
                <button class="${state.activeTab === 'results' ? 'active' : ''}" data-a="tab" data-tab="results">${t('setBuilder.tabResults')}</button>
              </div>
              ${showResultsInMain ? '' : `
                <div class="sb-list-toolbar-main">
                  <button class="sb-btn" data-a="upload">${t('setBuilder.upload')}</button>
                  <input class="sb-input sb-input--search" data-a="search" id="sb-search" placeholder="${t('setBuilder.searchPlaceholder')}" value="${esc(state.search)}" />
                  <button class="sb-btn sb-btn--ghost" data-a="catalog-add">${t('setBuilder.catalogAdd')}</button>
                </div>
                <select class="sb-select" data-a="sort-by" title="${t('setBuilder.sortBy')}">
                  <option value="name" ${state.sortBy === 'name' ? 'selected' : ''}>${t('setBuilder.sortName')}</option>
                  <option value="area" ${state.sortBy === 'area' ? 'selected' : ''}>${t('setBuilder.sortArea')}</option>
                  <option value="pierces" ${state.sortBy === 'pierces' ? 'selected' : ''}>${t('setBuilder.sortPierces')}</option>
                  <option value="cutLen" ${state.sortBy === 'cutLen' ? 'selected' : ''}>${t('setBuilder.sortCutLen')}</option>
                </select>
                <select class="sb-select" data-a="sort-dir" title="${t('setBuilder.sortDirection')}">
                  <option value="asc" ${state.sortDir === 'asc' ? 'selected' : ''}>${t('setBuilder.asc')}</option>
                  <option value="desc" ${state.sortDir === 'desc' ? 'selected' : ''}>${t('setBuilder.desc')}</option>
                </select>
              `}
            </div>
            ${!showResultsInMain && selectedCount > 0 ? `
              <div class="sb-bulk">
                <span>${selectedCount} ${t('setBuilder.selected')}</span>
                <button class="sb-btn" data-a="bulk-add">${t('setBuilder.bulkAdd')}</button>
                <button class="sb-btn" data-a="bulk-remove">${t('setBuilder.bulkRemove')}</button>
                <button class="sb-btn" data-a="bulk-qty">${t('setBuilder.bulkSetQty')}</button>
                <button class="sb-btn sb-btn--ghost" data-a="bulk-clear">${t('setBuilder.clear')}</button>
              </div>
            ` : ''}
            ${showResultsInMain ? `
              <div class="sb-library">
                <div class="sb-results">
                  ${lastEngineResult ? `
                    <div class="sb-bulk">
                      <button class="sb-btn" data-a="export-all">${t('setBuilder.exportAllSheets')}</button>
                      <button class="sb-btn" data-a="copy-all-hashes">${t('setBuilder.copyAllHashes')}</button>
                    </div>
                    <div class="sb-totals">
                      <div><span>${t('setBuilder.placedRequired')}:</span><b>${lastEngineResult.totalPlaced} / ${lastEngineResult.totalRequired}</b></div>
                      <div><span>${t('setBuilder.avgUtilization')}:</span><b>${Math.round(lastEngineResult.avgFillPercent)}%</b></div>
                      <div><span>${t('setBuilder.cutLenEst')}:</span><b>${fmtLen(lastEngineResult.cutLengthEstimate)}</b></div>
                      <div><span>${t('setBuilder.pierces')}:</span><b>${lastEngineResult.pierceEstimate}</b></div>
                      ${commonLineActive ? `<div><span>${t('setBuilder.savedCut')}:</span><b>−${fmtLen(Math.max(0, sharedCutLen))}</b></div>` : ''}
                      ${commonLineActive ? `<div><span>${t('setBuilder.savedPierces')}:</span><b>−${Math.max(0, pierceDelta)}</b></div>` : ''}
                    </div>
                  ` : ''}
                  ${!state.results
                    ? `<div class="sb-empty">${t('setBuilder.empty.runToSee')}</div>`
                    : `<div class="sb-sheets-grid">${state.results.sheets.map((sheet, index) => `
                      <div class="sb-sheet-card">
                        <div class="sb-sheet-head"><b>${sheet.id.toUpperCase()}</b><span>${sheet.utilization}%</span></div>
                        ${buildSheetPlacementsMarkup(sheet)}
                        <div class="sb-sheet-meta">${sheet.partCount} ${t('setBuilder.parts')}</div>
                        <div class="sb-sheet-actions">
                          <button class="sb-btn" data-a="export-sheet" data-index="${index}">${t('setBuilder.exportDxf')}</button>
                          <button class="sb-btn" data-a="preview-sheet" data-sheet="${sheet.id}">${t('setBuilder.openPreview')}</button>
                        </div>
                        ${sheet.hash
                          ? `<code class="sb-hash-code" data-a="copy-hash" data-hash="${sheet.hash}" title="${t('setBuilder.copyHash')}">${sheet.hash}</code>`
                          : `<span class="sb-hash-code sb-hash-code--empty">—</span>`}
                      </div>
                    `).join('')}</div>`}
                </div>
              </div>
            ` : `
              <div class="sb-library">${groupedCatalogContent}</div>
            `}
          </div>

          <aside class="sb-right">
            <div class="sb-set-list">
              ${setRows.length === 0
                ? `<div class="sb-empty">${t('setBuilder.empty.set')}</div>`
                : setRows.map(({ item, set }) => `
                  <div class="sb-set-row">
                    <div class="sb-set-head">
                      <div class="sb-set-thumb">${buildThumbMarkup(item)}</div>
                      <div class="sb-set-name">${esc(item.name)}</div>
                    </div>
                    <div class="sb-set-controls">
                      <label><input type="checkbox" data-a="set-enabled" data-id="${item.id}" ${set.enabled ? 'checked' : ''}/> ${t('setBuilder.enabled')}</label>
                      <div class="sb-stepper">
                        <button data-a="qty-minus" data-id="${item.id}">-</button>
                        <span>${set.qty}</span>
                        <button data-a="qty-plus" data-id="${item.id}">+</button>
                      </div>
                      <button class="sb-icon" data-a="preview-lib" data-id="${item.id}" title="${t('setBuilder.openPreview')}">👁</button>
                      <button class="sb-icon" data-a="remove-set" data-id="${item.id}" title="${t('setBuilder.remove')}">🗑</button>
                    </div>
                  </div>
                `).join('')}
            </div>
            <div class="sb-set-nest-panel">

              <div class="sb-nest-section">
                <div class="sb-nest-section-label">${t('setBuilder.settingsSheet')}</div>
                <div class="sb-preset-row">
                  <select class="sb-select sb-select--preset" data-a="preset">
                    ${sheetPresets.map((p) => `<option value="${p.id}" ${state.sheetPresetId === p.id ? 'selected' : ''}>${p.label}</option>`).join('')}
                  </select>
                  <button class="sb-btn sb-btn--ghost sb-btn--xs sb-btn--icon" data-a="preset-rename" title="${t('setBuilder.renamePreset')}">✎</button>
                  ${state.sheetPresetId.startsWith('custom_') ? `<button class="sb-btn sb-btn--ghost sb-btn--xs sb-btn--icon" data-a="preset-delete" title="${t('setBuilder.deletePreset')}">✕</button>` : ''}
                </div>
                <div class="sb-custom-sheet">
                  <input class="sb-input sb-input--sm" type="number" min="1" data-a="sheet-custom-w" value="${customSheetWidthMm}" placeholder="W" title="${t('setBuilder.customSheetW')}" />
                  <span>×</span>
                  <input class="sb-input sb-input--sm" type="number" min="1" data-a="sheet-custom-h" value="${customSheetHeightMm}" placeholder="H" title="${t('setBuilder.customSheetH')}" />
                  <button class="sb-btn sb-btn--ghost sb-btn--xs" data-a="sheet-custom-add">${t('setBuilder.addSheetSize')}</button>
                </div>
              </div>

              <div class="sb-nest-section">
                <div class="sb-nest-section-label">${t('setBuilder.settingsMode')}</div>
                <div class="sb-toggle">
                  <button class="${state.mode === 'normal' ? 'active' : ''}" data-a="mode" data-mode="normal">${t('setBuilder.normal')}</button>
                  <button class="${state.mode === 'commonLine' ? 'active' : ''}" data-a="mode" data-mode="commonLine">${t('setBuilder.commonLine')}</button>
                </div>
                ${state.mode === 'commonLine' ? `
                <div class="sb-nest-row">
                  <label class="sb-nest-row-label">${t('setBuilder.commonLineMaxDistance')}</label>
                  <input class="sb-input sb-input--sm" type="number" min="0" step="0.1" data-a="cl-dist" value="${state.commonLineMaxMergeDistanceMm}" />
                </div>
                <div class="sb-nest-row">
                  <label class="sb-nest-row-label">${t('setBuilder.commonLineMinSharedLen')}</label>
                  <input class="sb-input sb-input--sm" type="number" min="0" step="1" data-a="cl-min" value="${state.commonLineMinSharedLenMm}" />
                </div>` : ''}
              </div>

              <div class="sb-nest-section">
                <div class="sb-nest-section-label">${t('setBuilder.settingsAlgo')}</div>
                <div class="sb-nest-row">
                  <label class="sb-nest-row-label">${t('setBuilder.nestingStrategy')}</label>
                  <select class="sb-select sb-select--compact" data-a="strategy">
                    <option value="maxrects_bbox" ${state.nestStrategy === 'maxrects_bbox' ? 'selected' : ''}>${t('setBuilder.strategyPrecise')}</option>
                    <option value="true_shape" ${state.nestStrategy === 'true_shape' ? 'selected' : ''}>${t('setBuilder.strategyTrueShape')}</option>
                  </select>
                </div>
                <div class="sb-nest-row">
                  <label class="sb-nest-row-label">${t('setBuilder.gapLabel')}</label>
                  <input class="sb-input sb-input--sm" type="number" min="0" data-a="gap" value="${state.gapMm}" />
                </div>
                <div class="sb-nest-row">
                  <label class="sb-nest-row-label">${t('setBuilder.rotate')}</label>
                  <div class="sb-nest-row-controls">
                    <input type="checkbox" data-a="rotation" ${state.rotationEnabled ? 'checked' : ''}/>
                    <select class="sb-select sb-select--mini" data-a="rotation-step" title="${t('setBuilder.rotationStep')}" ${state.rotationEnabled ? '' : 'disabled'}>
                      <option value="1" ${state.rotationStepDeg === 1 ? 'selected' : ''}>1°</option>
                      <option value="2" ${state.rotationStepDeg === 2 ? 'selected' : ''}>2°</option>
                      <option value="5" ${state.rotationStepDeg === 5 ? 'selected' : ''}>5°</option>
                    </select>
                  </div>
                </div>
                <div class="sb-nest-row">
                  <label class="sb-nest-row-label">${t('setBuilder.multiStart')}</label>
                  <input type="checkbox" data-a="multi-start" ${state.multiStart ? 'checked' : ''} ${state.nestStrategy === 'true_shape' ? 'disabled' : ''}/>
                </div>
                <div class="sb-nest-row">
                  <label class="sb-nest-row-label">${t('setBuilder.seed')}</label>
                  <input class="sb-input sb-input--sm" type="number" step="1" data-a="seed" value="${state.seed}" />
                </div>
              </div>

              <button class="sb-btn sb-btn--primary sb-btn--run" data-a="run" ${runDisabled}>${state.loading ? t('setBuilder.running') : t('setBuilder.runNesting')}</button>
            </div>
            <div class="sb-totals">
              <div><span>${t('setBuilder.enabledParts')}:</span><b>${totals.enabledParts}</b></div>
              <div><span>${t('setBuilder.totalQty')}:</span><b>${totals.qtySum}</b></div>
              <div><span>${t('setBuilder.totalPierces')}:</span><b>${totals.piercesSum}</b></div>
              <div><span>${t('setBuilder.totalCutLen')}:</span><b>${fmtLen(totals.cutLenSum)}</b></div>
            </div>
            <div class="sb-issues">
              <div class="sb-issues-title">${t('setBuilder.issues.title')}</div>
              ${issues.length === 0 ? `<div class="sb-empty">${t('setBuilder.empty.noIssues')}</div>` : issues.map((it) => `<div>${esc(it.issue)} <b>×${it.count}</b></div>`).join('')}
            </div>
            <button class="sb-btn sb-btn--ghost" data-a="clear-set">${t('setBuilder.clearSet')}</button>
          </aside>
        </div>

        ${toastText ? `<div class="sb-toast">${esc(toastText)}</div>` : ''}
        ${renderPreviewModal()}
      </div>
    ` : '';

    persistState();
    applyModalPierceCanvas();
  }

  root.addEventListener('change', (e) => {
    const target = e.target as HTMLElement;
    if (target instanceof HTMLInputElement && target.dataset.a === 'toggle-pierces') {
      state.previewShowPierces = target.checked;
      const label = target.closest('.sb-pierce-toggle');
      if (label) label.classList.toggle('on', target.checked);
      applyModalPierceCanvas();
      return;
    }
  });

  root.addEventListener('click', (e) => {
    const target = e.target as HTMLElement;

    if (target.classList.contains('sb-modal-backdrop')) {
      state.previewLibraryId = null;
      state.previewSheetId = null;
      render();
      return;
    }

    let menuClosedByBackgroundClick = false;
    if (state.openMenuLibraryId !== null && target.closest('.sb-actions') === null) {
      state.openMenuLibraryId = null;
      menuClosedByBackgroundClick = true;
    }

    const button = target.closest<HTMLElement>('[data-a]');
    if (!button) {
      if (menuClosedByBackgroundClick) render();
      return;
    }

    const action = button.dataset.a;
    const id = Number(button.dataset.id ?? '0');

    if (action === 'pick-lib' && target instanceof HTMLInputElement) {
      const shouldCheck = target.checked;
      const currentId = Number(target.dataset.id ?? '0');
      if (!Number.isFinite(currentId)) return;

      const isShift = e instanceof MouseEvent && e.shiftKey;
      if (isShift && lastPickedLibraryId !== null) {
        const visibleIds = getVisibleLibraryItems().map((item) => item.id);
        const a = visibleIds.indexOf(lastPickedLibraryId);
        const b = visibleIds.indexOf(currentId);
        if (a >= 0 && b >= 0) {
          const from = Math.min(a, b);
          const to = Math.max(a, b);
          for (let i = from; i <= to; i++) {
            const vid = visibleIds[i]!;
            if (shouldCheck) state.selectedLibraryIds.add(vid);
            else state.selectedLibraryIds.delete(vid);
          }
        } else if (shouldCheck) {
          state.selectedLibraryIds.add(currentId);
        } else {
          state.selectedLibraryIds.delete(currentId);
        }
      } else if (shouldCheck) {
        state.selectedLibraryIds.add(currentId);
      } else {
        state.selectedLibraryIds.delete(currentId);
      }

      lastPickedLibraryId = currentId;
      render();
      return;
    }

    if (action === 'close') return toggleOpen(false);
    if (action === 'upload') {
      fileInput.click();
      return;
    }
    if (action === 'lang-toggle') {
      setLocale(getLocale() === 'ru' ? 'en' : 'ru');
      return;
    }
    if (action === 'tg-login') {
      void runTelegramLoginFlow().then(() => render());
      return;
    }
    if (action === 'tg-logout') {
      void logoutWorkspace().then(() => render());
      return;
    }
    if (action === 'catalog-add') {
      void addCatalog();
      return;
    }
    if (action === 'catalog-rename') {
      void renameCurrentCatalog(button.dataset.catalog);
      return;
    }
    if (action === 'catalog-delete') {
      void deleteCurrentCatalog(button.dataset.catalog);
      return;
    }
    if (action === 'sheet-custom-add') {
      const w = Math.max(1, Math.round(customSheetWidthMm));
      const h = Math.max(1, Math.round(customSheetHeightMm));
      const id = `custom_${w}x${h}`;
      const existing = sheetPresets.find((p) => p.id === id);
      if (!existing) {
        sheetPresets = [...sheetPresets, { id, label: `${w}×${h}`, w, h }];
      }
      state.sheetPresetId = id;
      render();
      return;
    }
    if (action === 'preset-rename') {
      const preset = sheetPresets.find((p) => p.id === state.sheetPresetId);
      if (!preset) return;
      const newLabel = window.prompt(t('setBuilder.renamePreset'), preset.label);
      if (newLabel === null) return;
      const trimmed = newLabel.trim();
      if (!trimmed) return;
      sheetPresets = sheetPresets.map((p) => p.id === preset.id ? { ...p, label: trimmed } : p);
      render();
      return;
    }
    if (action === 'preset-delete') {
      if (!state.sheetPresetId.startsWith('custom_')) return;
      sheetPresets = sheetPresets.filter((p) => p.id !== state.sheetPresetId);
      state.sheetPresetId = sheetPresets[0]?.id ?? '';
      render();
      return;
    }
    if (action === 'tab') {
      const tab = button.dataset.tab;
      if (tab === 'library' || tab === 'results') {
        state.activeTab = tab;
        render();
      }
      return;
    }
    if (action === 'sort-col') {
      const nextSort = button.dataset.sort;
      if (nextSort === 'name' || nextSort === 'area' || nextSort === 'pierces' || nextSort === 'cutLen') {
        if (state.sortBy === nextSort) {
          state.sortDir = state.sortDir === 'asc' ? 'desc' : 'asc';
        } else {
          state.sortBy = nextSort;
          state.sortDir = 'asc';
        }
      }
      render();
      return;
    }
    if (action === 'mode') {
      state.mode = button.dataset.mode === 'commonLine' ? 'commonLine' : 'normal';
      render();
      return;
    }
    if (action === 'strategy') return;
    if (action === 'rotation') return;
    if (action === 'rotation-step') return;
    if (action === 'multi-start') return;
    if (action === 'seed') return;
    if (action === 'cl-dist') return;
    if (action === 'cl-min') return;
    if (action === 'run') {
      void runNesting();
      return;
    }
    if (action === 'add-set') {
      upsertSetItem(state, id, 1);
      showToast(t('setBuilder.toast.addedToSet'));
      return;
    }
    if (action === 'remove-set') {
      removeFromSet(state, id);
      showToast(t('setBuilder.toast.removedFromSet'));
      return;
    }
    if (action === 'qty-plus') {
      upsertSetItem(state, id, 1);
      render();
      return;
    }
    if (action === 'qty-minus') {
      const s = getSetItem(state, id);
      if (!s) return;
      if (s.qty <= 1) removeFromSet(state, id);
      else s.qty -= 1;
      render();
      return;
    }
    if (action === 'set-enabled') return;
    if (action === 'bulk-add') {
      for (const sid of state.selectedLibraryIds) upsertSetItem(state, sid, 1);
      showToast(t('setBuilder.toast.selectedAdded'));
      return;
    }
    if (action === 'bulk-remove') {
      void (async () => {
        const ids = [...state.selectedLibraryIds];
        let removedCount = 0;
        for (const sid of ids) {
          const removed = await removeLibraryItem(sid);
          if (removed) removedCount += 1;
        }
        if (removedCount > 0) showToast(t('setBuilder.toast.selectedRemoved'));
        render();
      })();
      return;
    }
    if (action === 'bulk-qty') {
      const raw = prompt(t('setBuilder.prompt.setQtySelected'), '1');
      if (!raw) return;
      const qty = Number(raw);
      if (!Number.isFinite(qty) || qty < 1) return;
      for (const sid of state.selectedLibraryIds) setQty(state, sid, Math.round(qty));
      showToast(t('setBuilder.toast.qtyUpdated'));
      return;
    }
    if (action === 'bulk-clear') {
      state.selectedLibraryIds.clear();
      render();
      return;
    }
    if (action === 'clear-set') {
      state.set.clear();
      render();
      return;
    }
    if (action === 'preview-lib') {
      state.previewLibraryId = id;
      state.previewSheetId = null;
      _modalZoom = 1;
      _modalPanX = 0;
      _modalPanY = 0;
      _modalInteractionAttached = false;
      render();
      return;
    }
    if (action === 'preview-sheet') {
      state.previewSheetId = button.dataset.sheet ?? null;
      state.previewLibraryId = null;
      render();
      return;
    }
    if (action === 'close-preview') {
      state.previewLibraryId = null;
      state.previewSheetId = null;
      render();
      return;
    }
    if (action === 'copy-hash') {
      const hash = button.dataset.hash ?? '';
      if (hash) void copyHash(hash);
      else showToast(t('setBuilder.toast.hashUnavailable'));
      return;
    }
    if (action === 'export-sheet') {
      const sheetIndex = Number(button.dataset.index ?? '-1');
      if (!Number.isFinite(sheetIndex) || sheetIndex < 0) return;
      if (!lastEngineResult) {
        showToast(t('setBuilder.toast.noResultToExport'));
        return;
      }
      if (!exportSheetByIndex(sheetIndex)) return;
      showToast(t('setBuilder.toast.sheetExported'));
      return;
    }
    if (action === 'export-all') {
      if (!lastEngineResult || lastEngineResult.sheets.length === 0) {
        showToast(t('setBuilder.toast.noResultToExport'));
        return;
      }
      for (let i = 0; i < lastEngineResult.sheets.length; i++) {
        exportSheetByIndex(i);
      }
      showToast(t('setBuilder.toast.allSheetsExported'));
      return;
    }
    if (action === 'copy-all-hashes') {
      void copyAllHashes();
      return;
    }
    if (action === 'toggle-menu') {
      state.openMenuLibraryId = state.openMenuLibraryId === id ? null : id;
      render();
      return;
    }
    if (action === 'menu-delete') {
      void removeLibraryItem(id).then((removed) => {
        if (!removed) return;
        state.openMenuLibraryId = null;
        showToast(t('setBuilder.toast.itemDeleted'));
        render();
      });
      return;
    }
    if (action === 'menu-move') {
      state.openMenuLibraryId = null;
      void moveLibraryItemToCatalog(id).then(() => render());
      return;
    }
    if (action === 'menu-download') {
      state.openMenuLibraryId = null;
      void downloadLibraryItemSource(id);
      return;
    }
    if (action === 'stub') {
      showToast(`${t('setBuilder.action')} (${t('setBuilder.stub')})`);
      state.openMenuLibraryId = null;
      return;
    }
  });

  root.addEventListener('dragstart', (e) => {
    const target = e.target as HTMLElement;
    const libRow = target.closest<HTMLElement>('[data-a="lib-row"][data-id]');
    if (!libRow) return;
    const libraryId = Number(libRow.dataset.id ?? '0');
    if (!Number.isFinite(libraryId) || libraryId <= 0) return;
    draggedLibraryId = libraryId;
    if (e.dataTransfer) {
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('application/x-set-builder-lib-id', String(libraryId));
    }
  });

  root.addEventListener('dragover', (e) => {
    if (draggedLibraryId !== null) {
      const catalogHead = (e.target as HTMLElement).closest<HTMLElement>('[data-a="catalog-drop"][data-catalog]');
      if (!catalogHead) return;
      e.preventDefault();
      if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
      if (dragOverCatalogEl && dragOverCatalogEl !== catalogHead) {
        dragOverCatalogEl.classList.remove('drag-over');
      }
      dragOverCatalogEl = catalogHead;
      dragOverCatalogEl.classList.add('drag-over');
    }
  });

  root.addEventListener('drop', (e) => {
    if (draggedLibraryId !== null) {
      const catalogHead = (e.target as HTMLElement).closest<HTMLElement>('[data-a="catalog-drop"][data-catalog]');
      if (!catalogHead) return;
      e.preventDefault();
      const targetCatalog = catalogHead.dataset.catalog ?? '';
      const currentItem = getLibraryItem(state, draggedLibraryId);
      dragOverCatalogEl?.classList.remove('drag-over');
      dragOverCatalogEl = null;
      if (!targetCatalog || !currentItem || currentItem.catalog === targetCatalog) {
        draggedLibraryId = null;
        return;
      }
      const moveId = draggedLibraryId;
      draggedLibraryId = null;
      void moveLibraryItemToCatalogName(moveId, targetCatalog).then((moved) => {
        if (moved) showToast(t('setBuilder.toast.itemMoved'));
        else showToast(t('setBuilder.toast.itemMoveFailed'));
        render();
      });
    }
  });

  root.addEventListener('dragend', () => {
    draggedLibraryId = null;
    if (dragOverCatalogEl) {
      dragOverCatalogEl.classList.remove('drag-over');
      dragOverCatalogEl = null;
    }
  });

  root.addEventListener('input', (e) => {
    const t = e.target as HTMLElement;
    if (!(t instanceof HTMLInputElement)) return;
    if (t.dataset.a === 'search') {
      state.search = t.value;
      render();
    }
  });

  root.addEventListener('change', (e) => {
    const t = e.target as HTMLElement;
    if (!(t instanceof HTMLInputElement || t instanceof HTMLSelectElement)) return;

    const action = t.dataset.a;
    if (action === 'search') {
      state.search = t.value;
      render();
      return;
    }
    if (action === 'sort-by' && t instanceof HTMLSelectElement) {
      state.sortBy = t.value === 'area' || t.value === 'pierces' || t.value === 'cutLen' ? t.value : 'name';
      render();
      return;
    }
    if (action === 'sort-dir' && t instanceof HTMLSelectElement) {
      state.sortDir = t.value === 'desc' ? 'desc' : 'asc';
      render();
      return;
    }
    if (action === 'preset' && t instanceof HTMLSelectElement) {
      state.sheetPresetId = t.value;
      render();
      return;
    }
    if (action === 'sheet-custom-w' && t instanceof HTMLInputElement) {
      customSheetWidthMm = Math.max(1, Number(t.value) || 1);
      return;
    }
    if (action === 'sheet-custom-h' && t instanceof HTMLInputElement) {
      customSheetHeightMm = Math.max(1, Number(t.value) || 1);
      return;
    }
    if (action === 'gap' && t instanceof HTMLInputElement) {
      state.gapMm = Math.max(0, Number(t.value) || 0);
      render();
      return;
    }
    if (action === 'strategy' && t instanceof HTMLSelectElement) {
      state.nestStrategy = t.value === 'true_shape' ? 'true_shape' : 'maxrects_bbox';
      if (state.nestStrategy === 'true_shape') state.multiStart = false;
      render();
      return;
    }
    if (action === 'rotation' && t instanceof HTMLInputElement) {
      state.rotationEnabled = t.checked;
      render();
      return;
    }
    if (action === 'rotation-step' && t instanceof HTMLSelectElement) {
      const step = Number(t.value);
      state.rotationStepDeg = step === 1 || step === 5 ? step : 2;
      render();
      return;
    }
    if (action === 'multi-start' && t instanceof HTMLInputElement) {
      state.multiStart = state.nestStrategy === 'true_shape' ? false : t.checked;
      render();
      return;
    }
    if (action === 'seed' && t instanceof HTMLInputElement) {
      state.seed = Number.isFinite(Number(t.value)) ? Math.trunc(Number(t.value)) : 0;
      render();
      return;
    }
    if (action === 'cl-dist' && t instanceof HTMLInputElement) {
      state.commonLineMaxMergeDistanceMm = Math.max(0, Number(t.value) || 0);
      render();
      return;
    }
    if (action === 'cl-min' && t instanceof HTMLInputElement) {
      state.commonLineMinSharedLenMm = Math.max(0, Number(t.value) || 0);
      render();
      return;
    }
    if (action === 'set-enabled' && t instanceof HTMLInputElement) {
      const id = Number(t.dataset.id ?? '0');
      const s = getSetItem(state, id);
      if (!s) return;
      s.enabled = t.checked;
      render();
      return;
    }

  });

  window.addEventListener('dxf-files-updated', () => {
    if (!state.open) return;
    dxfThumbCache.clear();
    render();
    showToast(t('setBuilder.toast.filesSynced'));
  });

  window.addEventListener(AUTH_SESSION_EVENT, () => {
    if (!state.open) return;
    render();
  });

  onLocaleChange(() => {
    if (!state.open) return;
    render();
  });

  window.addEventListener('keydown', (e) => {
    if (!state.open) return;
    if (e.key === 'Escape') {
      if (state.openMenuLibraryId !== null) {
        state.openMenuLibraryId = null;
        render();
        return;
      }
      if (state.previewLibraryId !== null || state.previewSheetId !== null) {
        state.previewLibraryId = null;
        state.previewSheetId = null;
        render();
        return;
      }
      toggleOpen(false);
      return;
    }
    if (e.key === '/') {
      e.preventDefault();
      (root.querySelector('#sb-search') as HTMLInputElement | null)?.focus();
    }
  });

  document.addEventListener('click', (e) => {
    if (!state.open || state.openMenuLibraryId === null) return;
    const target = e.target as Node;
    if (root.contains(target)) return;
    state.openMenuLibraryId = null;
    render();
  });

  hydrateState();
  trigger.addEventListener('click', () => toggleOpen());
  render();
}
