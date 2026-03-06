import { fileInput } from '../dom.js';
import { authSessionToken, authWorkspaceId, loadedFiles } from '../state.js';
import { getLocale, onLocaleChange, setLocale, t } from '../i18n/index.js';
import { AUTH_SESSION_EVENT, logoutWorkspace, runTelegramLoginFlow } from '../auth.js';
import type { NestingResult } from '../../../core-engine/src/nesting/index.js';
import type { ItemDocData } from '../../../core-engine/src/export/index.js';
import {
  createInitialState,
  getLibraryItem,
  getSetItem,
  removeFromSet,
  setQty,
  upsertSetItem,
} from './state.js';
import type { MaterialAssignment } from './types.js';
import { SHEET_PRESETS } from './mock-data.js';
import type { SheetPreset } from './context.js';
import { hydrateState, persistState, saveMaterials, loadMaterials, loadMaterialsFromServer, syncMaterialsToServer, applyPendingSet, applyPendingMaterials, migrateGuestMaterialsToServer } from './persist.js';
import { syncLoadedFilesIntoLibrary, getVisibleLibraryItems, removeLibraryItem, moveLibraryItemToCatalog, moveLibraryItemToCatalogName, downloadLibraryItemSource, addCatalog, renameCurrentCatalog, deleteCurrentCatalog } from './library.js';
import { runNesting, exportSheetByIndex } from './nesting.js';
import { renderMain, renderDxfThumbDataUrl } from './render.js';
import { applyModalPierceCanvas, createModalCanvasState, resetModalCanvasState } from './canvas-modal.js';
import type { ModalCanvasState } from './canvas-modal.js';
import { getGradesByGroup, getThicknessesByGrade, findMaterial, formatWeightKg, calcWeightKg } from './materials.js';
import { esc } from './utils.js';
import { analyzeFile, optimizeFile, downloadOptimizedDxf, downloadReportJson, createOptimizerState } from './optimizer/index.js';
import type { OptimizerState } from './optimizer/types.js';
import { renderEntity } from '../../../core-engine/src/render/entity-renderer.js';
import type { EntityRenderOptions } from '../../../core-engine/src/render/entity-renderer.js';
import { DXFEntityType } from '../../../core-engine/src/types/index.js';
import { buildBatchEntries, analyzeBatchEntries, runBatchOptimization, downloadBatchZip, createBatchState, createDefaultPlan } from './optimizer/batch-index.js';
import type { BatchOptimizerState } from './optimizer/batch-types.js';
import { renderBatchModal } from './optimizer/batch-render.js';

export function initSetBuilder(root: HTMLDivElement, trigger: HTMLButtonElement): void {
  const appRoot = document.getElementById('app') as HTMLDivElement | null;
  const state = createInitialState();
  state.library = [];
  let sheetPresets: SheetPreset[] = [...SHEET_PRESETS];
  let customSheetWidthMm = 1000;
  let customSheetHeightMm = 2000;
  let toastText = '';
  let toastTimer: ReturnType<typeof setTimeout> | null = null;
  let renderFrameId: number | null = null;
  let filesUpdatedFrameId: number | null = null;
  let pendingFilesUpdatedAdded = 0;
  let lastPickedLibraryId: number | null = null;
  let draggedLibraryId: number | null = null;
  let dragOverCatalogEl: HTMLElement | null = null;
  let lastEngineResult: NestingResult | null = null;
  let lastItemDocs = new Map<number, ItemDocData>();
  const dxfThumbCache = new Map<string, string>();
  const modalCanvasState: ModalCanvasState = createModalCanvasState();
  let optiState: OptimizerState | null = null;
  let batchState: BatchOptimizerState | null = null;
  let thumbQueueToken = 0;
  let thumbQueueTimer: ReturnType<typeof setTimeout> | null = null;

  function setToastState(msg: string): void {
    toastText = msg;
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { toastText = ''; render(); }, 1800);
  }

  function showToast(msg: string): void {
    setToastState(msg);
    scheduleRender();
  }

  function drawOptimizerPreviewCanvas(): void {
    if (!optiState || optiState.activeTab !== 'overview' || !state.optimizerOpenForId) return;
    const canvas = root.querySelector<HTMLCanvasElement>('[data-a="opt-preview-canvas"]');
    if (!canvas) return;
    const item = state.library.find((it) => it.id === state.optimizerOpenForId);
    if (!item || item.sourceFileId === undefined) return;
    const lf = loadedFiles.find((f) => f.id === item.sourceFileId);
    if (!lf || lf.loading || !lf.doc) return;

    const critCodes = new Set<string>(JSON.parse(canvas.dataset.crit ?? '[]') as string[]);
    const warnCodes = new Set<string>(JSON.parse(canvas.dataset.warn ?? '[]') as string[]);

    const hasDuplicates = warnCodes.has('DUPLICATES') || critCodes.has('DUPLICATES');
    const hasSplineWarn = warnCodes.has('SPLINE_ELLIPSE') || critCodes.has('SPLINE_ELLIPSE');
    const hasZeroLen = warnCodes.has('ZERO_LENGTH') || critCodes.has('ZERO_LENGTH');
    const hasMicro = warnCodes.has('MICRO_SEGMENTS') || critCodes.has('MICRO_SEGMENTS');

    // Предварительно вычисляем дублирующиеся LINE для подсветки
    const dupeLineKeys = new Set<string>();
    if (hasDuplicates) {
      const seen = new Set<string>();
      for (const fe of lf.doc.flatEntities) {
        const e = fe.entity as Record<string, unknown>;
        if (e['type'] !== DXFEntityType.LINE) continue;
        const s = e['start'] as { x: number; y: number } | undefined;
        const end = e['end'] as { x: number; y: number } | undefined;
        if (!s || !end) continue;
        const key = `${Math.round(s.x * 100)},${Math.round(s.y * 100)},${Math.round(end.x * 100)},${Math.round(end.y * 100)}`;
        const keyR = `${Math.round(end.x * 100)},${Math.round(end.y * 100)},${Math.round(s.x * 100)},${Math.round(s.y * 100)}`;
        if (seen.has(key) || seen.has(keyR)) {
          dupeLineKeys.add(key);
          dupeLineKeys.add(keyR);
        } else {
          seen.add(key);
        }
      }
    }

    const bb = lf.doc.totalBBox;
    if (!bb) return;
    const bbW = Math.max(1e-6, bb.max.x - bb.min.x);
    const bbH = Math.max(1e-6, bb.max.y - bb.min.y);

    // Устанавливаем aspect-ratio canvas под соотношение сторон детали + padding
    const pad = 32;
    const wrap = canvas.parentElement;
    const availW = wrap ? wrap.clientWidth || 600 : 600;
    const aspectRatio = bbW / bbH;
    const cW = availW;
    const cH = Math.min(Math.max(180, cW / aspectRatio + pad * 2), 480);

    const dpr = window.devicePixelRatio || 1;
    canvas.width = cW * dpr;
    canvas.height = cH * dpr;
    canvas.style.width = `${cW}px`;
    canvas.style.height = `${cH}px`;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, cW, cH);
    ctx.fillStyle = 'rgba(7, 11, 18, 0.95)';
    ctx.fillRect(0, 0, cW, cH);

    const scale = Math.min((cW - pad * 2) / bbW, (cH - pad * 2) / bbH);
    const cx = bb.min.x + bbW / 2;
    const cy = bb.min.y + bbH / 2;
    const pixelSize = 1 / scale;
    const opts: EntityRenderOptions = { arcSegments: 48, splineSegments: 48, ellipseSegments: 48, pixelSize, viewExtent: Math.max(bbW, bbH) * 2 };

    ctx.save();
    ctx.translate(cW / 2, cH / 2);
    ctx.scale(scale, -scale);
    ctx.translate(-cx, -cy);

    for (const fe of lf.doc.flatEntities) {
      const e = fe.entity as Record<string, unknown>;
      const eType = e['type'] as string | undefined;

      let isCrit = false;
      let isWarn = false;

      if (eType === DXFEntityType.LINE) {
        const s = e['start'] as { x: number; y: number } | undefined;
        const end = e['end'] as { x: number; y: number } | undefined;
        if (hasDuplicates && s && end) {
          const key = `${Math.round(s.x * 100)},${Math.round(s.y * 100)},${Math.round(end.x * 100)},${Math.round(end.y * 100)}`;
          if (dupeLineKeys.has(key)) isWarn = true;
        }
        if (!isWarn && hasZeroLen && s && end) {
          const len = Math.sqrt((end.x - s.x) ** 2 + (end.y - s.y) ** 2);
          if (len < 0.01) isCrit = true;
        }
        if (!isWarn && !isCrit && hasMicro && s && end) {
          const len = Math.sqrt((end.x - s.x) ** 2 + (end.y - s.y) ** 2);
          if (len > 0 && len < 0.1) isWarn = true;
        }
      } else if ((eType === DXFEntityType.SPLINE || eType === DXFEntityType.ELLIPSE) && hasSplineWarn) {
        isWarn = true;
      }

      if (isCrit) {
        ctx.strokeStyle = 'rgba(255, 70, 70, 1)';
        ctx.lineWidth = 2.5 / scale;
      } else if (isWarn) {
        ctx.strokeStyle = 'rgba(255, 200, 40, 1)';
        ctx.lineWidth = 2 / scale;
      } else {
        ctx.strokeStyle = 'rgba(100, 200, 255, 0.8)';
        ctx.lineWidth = 1 / scale;
      }
      renderEntity(ctx, fe, opts);
    }
    ctx.restore();
  }

  function stopThumbQueue(): void {
    thumbQueueToken++;
    if (thumbQueueTimer !== null) {
      clearTimeout(thumbQueueTimer);
      thumbQueueTimer = null;
    }
  }

  function replaceThumbSlot(slot: HTMLElement, dataUrl: string, alt: string, imgClass: string): void {
    const img = document.createElement('img');
    img.className = imgClass;
    img.src = dataUrl;
    img.alt = alt;
    img.loading = 'lazy';
    slot.replaceChildren(img);
    slot.dataset.thumbReady = 'true';
  }

  function scheduleThumbQueue(): void {
    stopThumbQueue();
    if (!state.open) return;
    const token = thumbQueueToken;
    thumbQueueTimer = setTimeout(() => {
      thumbQueueTimer = null;
      void processThumbQueue(token);
    }, 0);
  }

  async function processThumbQueue(token: number): Promise<void> {
    if (token !== thumbQueueToken || !state.open) return;
    const slots = Array.from(root.querySelectorAll<HTMLElement>('[data-thumb-slot="true"][data-thumb-ready="false"]'));
    if (slots.length === 0) return;

    let processed = 0;
    for (const slot of slots) {
      if (token !== thumbQueueToken || !slot.isConnected) return;
      const sourceId = Number(slot.dataset.sourceId ?? '0');
      const width = Number(slot.dataset.thumbWidth ?? '0');
      const height = Number(slot.dataset.thumbHeight ?? '0');
      const angleDeg = Number(slot.dataset.thumbAngle ?? '0');
      const padPx = Number(slot.dataset.thumbPad ?? '0');
      const alt = slot.dataset.thumbAlt ?? '';
      const imgClass = slot.dataset.thumbImgClass ?? 'sb-thumb-real';
      if (!Number.isFinite(sourceId) || sourceId <= 0 || !Number.isFinite(width) || !Number.isFinite(height)) {
        slot.dataset.thumbReady = 'true';
        continue;
      }

      const dataUrl = renderDxfThumbDataUrl(sourceId, width, height, angleDeg, dxfThumbCache, padPx);
      if (!dataUrl) continue;
      replaceThumbSlot(slot, dataUrl, alt, imgClass);
      processed++;
      if (processed >= 1) break;
    }

    if (token !== thumbQueueToken || !state.open) return;
    if (!root.querySelector('[data-thumb-slot="true"][data-thumb-ready="false"]')) return;
    thumbQueueTimer = setTimeout(() => {
      thumbQueueTimer = null;
      void processThumbQueue(token);
    }, 0);
  }

  function render(): void {
    if (renderFrameId !== null) {
      window.cancelAnimationFrame(renderFrameId);
      renderFrameId = null;
    }
    syncLoadedFilesIntoLibrary(state);
    // Резолвим stableKey → libraryId для сета и материалов (безопасно вызывать каждый раз)
    applyPendingSet(state);
    applyPendingMaterials(state);
    root.classList.toggle('hidden', !state.open);
    root.setAttribute('aria-hidden', state.open ? 'false' : 'true');
    appRoot?.classList.toggle('set-builder-primary-active', state.open);
    trigger.classList.toggle('active', state.open);
    if (!state.open) {
      stopThumbQueue();
      persistState(state, sheetPresets, customSheetWidthMm, customSheetHeightMm);
      return;
    }
    renderMain(
      root, state, sheetPresets,
      customSheetWidthMm, customSheetHeightMm,
      toastText, lastEngineResult, dxfThumbCache,
      authSessionToken, authWorkspaceId,
      optiState,
      batchState,
    );
    scheduleThumbQueue();
    persistState(state, sheetPresets, customSheetWidthMm, customSheetHeightMm);
    applyModalPierceCanvas(root, modalCanvasState, state);
    drawOptimizerPreviewCanvas();
  }

  function scheduleRender(): void {
    if (renderFrameId !== null) return;
    renderFrameId = window.requestAnimationFrame(() => {
      renderFrameId = null;
      render();
    });
  }

  function toggleOpen(next?: boolean): void {
    state.open = typeof next === 'boolean' ? next : !state.open;
    scheduleRender();
  }

  function scheduleFilesUpdatedRender(added: number): void {
    if (!state.open) return;
    pendingFilesUpdatedAdded += added;
    if (filesUpdatedFrameId !== null) return;
    filesUpdatedFrameId = window.requestAnimationFrame(() => {
      filesUpdatedFrameId = null;
      dxfThumbCache.clear();
      if (pendingFilesUpdatedAdded > 0) {
        setToastState(t('setBuilder.toast.filesSynced'));
      }
      pendingFilesUpdatedAdded = 0;
      render();
    });
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
    if (hashes.length === 0) { showToast(t('setBuilder.toast.noHashes')); return; }
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

  // ─── pierce toggle ───────────────────────────────────────────────────
  root.addEventListener('change', (e) => {
    const target = e.target as HTMLElement;
    if (target instanceof HTMLInputElement && target.dataset.a === 'toggle-pierces') {
      state.previewShowPierces = target.checked;
      target.closest('.sb-pierce-toggle')?.classList.toggle('on', target.checked);
      applyModalPierceCanvas(root, modalCanvasState, state);
    }
  });

  // ─── click ───────────────────────────────────────────────────────────
  root.addEventListener('click', (e) => {
    const target = e.target as HTMLElement;

    if (target.classList.contains('sb-modal-backdrop')) {
      state.previewLibraryId = null;
      state.previewSheetId = null;
      scheduleRender();
      return;
    }

    let menuClosed = false;
    if (state.openMenuLibraryId !== null && target.closest('.sb-actions') === null) {
      state.openMenuLibraryId = null;
      menuClosed = true;
    }

    const button = target.closest<HTMLElement>('[data-a]');
    if (!button) { if (menuClosed) scheduleRender(); return; }

    const action = button.dataset.a;
    const id = Number(button.dataset.id ?? '0');

    if (action === 'pick-lib' && target instanceof HTMLInputElement) {
      const shouldCheck = target.checked;
      const currentId = Number(target.dataset.id ?? '0');
      if (!Number.isFinite(currentId)) return;
      const isShift = e instanceof MouseEvent && e.shiftKey;
      if (isShift && lastPickedLibraryId !== null) {
        const visIds = getVisibleLibraryItems(state).map((it) => it.id);
        const a = visIds.indexOf(lastPickedLibraryId);
        const b = visIds.indexOf(currentId);
        if (a >= 0 && b >= 0) {
          for (let i = Math.min(a, b); i <= Math.max(a, b); i++) {
            if (shouldCheck) state.selectedLibraryIds.add(visIds[i]!);
            else state.selectedLibraryIds.delete(visIds[i]!);
          }
        } else if (shouldCheck) state.selectedLibraryIds.add(currentId);
        else state.selectedLibraryIds.delete(currentId);
      } else if (shouldCheck) state.selectedLibraryIds.add(currentId);
      else state.selectedLibraryIds.delete(currentId);
      lastPickedLibraryId = currentId;
      scheduleRender();
      return;
    }

    if (action === 'close') { toggleOpen(false); return; }
    if (action === 'upload') { fileInput.click(); return; }
    if (action === 'lang-toggle') { setLocale(getLocale() === 'ru' ? 'en' : 'ru'); return; }
    if (action === 'tg-login') { void runTelegramLoginFlow().then(() => scheduleRender()); return; }
    if (action === 'tg-logout') { void logoutWorkspace().then(() => scheduleRender()); return; }
    if (action === 'catalog-add') { void addCatalog(state, authSessionToken, showToast, render); return; }
    if (action === 'catalog-rename') { void renameCurrentCatalog(state, button.dataset.catalog, showToast, render); return; }
    if (action === 'catalog-delete') { void deleteCurrentCatalog(state, button.dataset.catalog, showToast, render); return; }

    if (action === 'sheet-custom-add') {
      const w = Math.max(1, Math.round(customSheetWidthMm));
      const h = Math.max(1, Math.round(customSheetHeightMm));
      const pid = `custom_${w}x${h}`;
      if (!sheetPresets.find((p) => p.id === pid)) sheetPresets = [...sheetPresets, { id: pid, label: `${w}×${h}`, w, h }];
      state.sheetPresetId = pid;
      scheduleRender();
      return;
    }
    if (action === 'preset-rename') {
      const preset = sheetPresets.find((p) => p.id === state.sheetPresetId);
      if (!preset) return;
      const lbl = window.prompt(t('setBuilder.renamePreset'), preset.label);
      if (!lbl?.trim()) return;
      sheetPresets = sheetPresets.map((p) => p.id === preset.id ? { ...p, label: lbl.trim() } : p);
      scheduleRender();
      return;
    }
    if (action === 'preset-delete') {
      if (!state.sheetPresetId.startsWith('custom_')) return;
      sheetPresets = sheetPresets.filter((p) => p.id !== state.sheetPresetId);
      state.sheetPresetId = sheetPresets[0]?.id ?? '';
      scheduleRender();
      return;
    }
    if (action === 'tab') {
      const tab = button.dataset.tab;
      if (tab === 'library' || tab === 'results') { state.activeTab = tab; scheduleRender(); }
      return;
    }
    if (action === 'sort-col') {
      const s = button.dataset.sort;
      if (s === 'name' || s === 'area' || s === 'pierces' || s === 'cutLen') {
        if (state.sortBy === s) state.sortDir = state.sortDir === 'asc' ? 'desc' : 'asc';
        else { state.sortBy = s; state.sortDir = 'asc'; }
      }
      scheduleRender();
      return;
    }
    if (action === 'mode') {
      state.mode = button.dataset.mode === 'commonLine' ? 'commonLine' : 'normal';
      state.nestStrategy = 'maxrects_bbox';
      scheduleRender();
      return;
    }
    if (action === 'strategy' || action === 'rotation' || action === 'rotation-step' ||
        action === 'multi-start' || action === 'seed' || action === 'cl-dist' || action === 'cl-min') return;
    if (action === 'run') {
      void runNesting(
        state, sheetPresets,
        (r) => { lastEngineResult = r; },
        (m) => { lastItemDocs = m; },
        showToast, render,
      );
      return;
    }
    if (action === 'add-set') { upsertSetItem(state, id, 1); showToast(t('setBuilder.toast.addedToSet')); return; }
    if (action === 'remove-set') { removeFromSet(state, id); showToast(t('setBuilder.toast.removedFromSet')); return; }
    if (action === 'qty-plus') { upsertSetItem(state, id, 1); scheduleRender(); return; }
    if (action === 'qty-minus') {
      const s = getSetItem(state, id);
      if (!s) return;
      if (s.qty <= 1) removeFromSet(state, id);
      else s.qty -= 1;
      scheduleRender();
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
        let n = 0;
        for (const sid of [...state.selectedLibraryIds]) {
          if (await removeLibraryItem(state, sid, showToast)) n++;
        }
        if (n > 0) showToast(t('setBuilder.toast.selectedRemoved'));
        scheduleRender();
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
    if (action === 'bulk-clear') { state.selectedLibraryIds.clear(); scheduleRender(); return; }
    if (action === 'clear-set') { state.set.clear(); scheduleRender(); return; }
    if (action === 'preview-lib') {
      state.previewLibraryId = id;
      state.previewSheetId = null;
      resetModalCanvasState(modalCanvasState);
      scheduleRender();
      return;
    }
    if (action === 'preview-sheet') { state.previewSheetId = button.dataset.sheet ?? null; state.previewLibraryId = null; scheduleRender(); return; }
    if (action === 'close-preview') { state.previewLibraryId = null; state.previewSheetId = null; scheduleRender(); return; }
    if (action === 'copy-hash') {
      const hash = button.dataset.hash ?? '';
      if (hash) void copyHash(hash);
      else showToast(t('setBuilder.toast.hashUnavailable'));
      return;
    }
    if (action === 'export-sheet') {
      const idx = Number(button.dataset.index ?? '-1');
      if (!Number.isFinite(idx) || idx < 0 || !lastEngineResult) { showToast(t('setBuilder.toast.noResultToExport')); return; }
      if (exportSheetByIndex(lastEngineResult, lastItemDocs, idx)) showToast(t('setBuilder.toast.sheetExported'));
      return;
    }
    if (action === 'export-all') {
      if (!lastEngineResult || lastEngineResult.sheets.length === 0) { showToast(t('setBuilder.toast.noResultToExport')); return; }
      for (let i = 0; i < lastEngineResult.sheets.length; i++) exportSheetByIndex(lastEngineResult, lastItemDocs, i);
      showToast(t('setBuilder.toast.allSheetsExported'));
      return;
    }
    if (action === 'copy-all-hashes') { void copyAllHashes(); return; }
    if (action === 'toggle-menu') { state.openMenuLibraryId = state.openMenuLibraryId === id ? null : id; scheduleRender(); return; }
    if (action === 'menu-delete') {
      void removeLibraryItem(state, id, showToast).then((removed) => {
        if (!removed) return;
        state.openMenuLibraryId = null;
        showToast(t('setBuilder.toast.itemDeleted'));
        scheduleRender();
      });
      return;
    }
    if (action === 'menu-move') { state.openMenuLibraryId = null; void moveLibraryItemToCatalog(state, id, showToast).then(() => scheduleRender()); return; }
    if (action === 'menu-download') { state.openMenuLibraryId = null; void downloadLibraryItemSource(state, id, showToast); return; }
    if (action === 'stub') {
      showToast(`${t('setBuilder.action')} (${t('setBuilder.stub')})`);
      state.openMenuLibraryId = null;
      return;
    }
    if (action === 'assign-material') { state.materialModalOpenForId = id; state.openMenuLibraryId = null; scheduleRender(); return; }
    if (action === 'close-material-modal') { state.materialModalOpenForId = null; scheduleRender(); return; }
    if (action === 'material-save') {
      const itemIdRaw = Number(button.dataset.itemId ?? '0');
      const group = button.dataset.group ?? '';
      const grade = button.dataset.grade ?? '';
      const thickness = button.dataset.thickness ?? '';
      if (!group || !grade || !thickness) { state.materialModalOpenForId = null; scheduleRender(); return; }
      const materialId = `${group}|${grade}|${thickness}`;
      const applyAll = (root.querySelector('#mat-apply-all') as HTMLInputElement | null)?.checked ?? false;
      const assignment: MaterialAssignment = { materialId, appliedAt: Date.now() };
      const item = state.library.find((it) => it.id === itemIdRaw);
      const targetIds = applyAll && item
        ? state.library.filter((it) => it.catalog === item.catalog).map((it) => it.id)
        : [itemIdRaw];
      for (const tid of targetIds) state.materialAssignments.set(tid, assignment);
      state.lastUsedMaterialId = materialId;
      state.materialModalOpenForId = null;
      saveMaterials(state);
      if (authSessionToken) void syncMaterialsToServer(state, targetIds, materialId);
      showToast(t('material.saved'));
      return;
    }
    if (target.classList.contains('sb-modal-backdrop--material')) { state.materialModalOpenForId = null; scheduleRender(); return; }

    // ── Optimizer ────────────────────────────────────────────────────────
    if (action === 'open-optimizer') {
      const item = state.library.find((it) => it.id === id);
      if (!item || item.sourceFileId === undefined) return;
      const lf = loadedFiles.find((f) => f.id === item.sourceFileId);
      if (!lf || lf.loading || !lf.doc) { showToast(t('setBuilder.toast.filesSynced')); return; }
      state.optimizerOpenForId = id;
      optiState = createOptimizerState();
      scheduleRender();
      void analyzeFile(
        { flatEntities: [...lf.doc.flatEntities], sourceDoc: lf.doc.source, fileName: lf.name },
        optiState,
        render,
      );
      return;
    }
    if (action === 'opt-close' || target.classList.contains('sb-modal-backdrop--optimizer')) {
      state.optimizerOpenForId = null;
      optiState = null;
      scheduleRender();
      return;
    }
    if (action === 'opt-tab') {
      const tab = button.dataset.tab as string;
      if (optiState && ['overview','inventory','optimize'].includes(tab)) {
        optiState.activeTab = tab as typeof optiState.activeTab;
        scheduleRender();
      }
      return;
    }
    if (action === 'opt-preset-laser') {
      if (optiState) {
        optiState.plan.enabled = new Set(['R1','R4','R5','R6']);
        scheduleRender();
      }
      return;
    }
    if (action === 'opt-run') {
      if (!optiState || !state.optimizerOpenForId) return;
      const item = state.library.find((it) => it.id === state.optimizerOpenForId);
      if (!item || item.sourceFileId === undefined) return;
      const lf = loadedFiles.find((f) => f.id === item.sourceFileId);
      if (!lf || lf.loading || !lf.doc) return;
      void optimizeFile(
        { flatEntities: [...lf.doc.flatEntities], sourceDoc: lf.doc.source, fileName: lf.name },
        optiState,
        render,
      );
      return;
    }
    if (action === 'opt-export-dxf') {
      if (optiState?.result) void downloadOptimizedDxf(optiState.result);
      return;
    }
    if (action === 'opt-export-report') {
      if (optiState?.result) downloadReportJson(optiState.result);
      return;
    }

    // ── Batch Optimizer ──────────────────────────────────────────────────
    if (action === 'open-batch-optimizer') {
      const catalogName = button.dataset.catalog ?? null;
      const items = catalogName
        ? state.library.filter((it) => it.catalog === catalogName)
        : state.library;
      batchState = createBatchState(catalogName, createDefaultPlan());
      batchState.entries = buildBatchEntries(items, loadedFiles);
      scheduleRender();
      void analyzeBatchEntries(batchState, loadedFiles, render);
      return;
    }
    if (action === 'batch-close' || target.classList.contains('sb-modal-backdrop--batch')) {
      batchState = null;
      scheduleRender();
      return;
    }
    if (action === 'batch-all-catalogs') {
      if (!batchState) return;
      batchState.allCatalogs = (button as HTMLInputElement).checked;
      if (batchState.allCatalogs) {
        batchState.catalogName = null;
        batchState.entries = buildBatchEntries(state.library, loadedFiles);
      } else {
        // restore original catalog
        const catalog = batchState.catalogName;
        const items = catalog
          ? state.library.filter((it) => it.catalog === catalog)
          : state.library;
        batchState.entries = buildBatchEntries(items, loadedFiles);
      }
      scheduleRender();
      void analyzeBatchEntries(batchState, loadedFiles, render);
      return;
    }
    if (action === 'batch-toggle-all') {
      if (!batchState) return;
      const checked = (button as HTMLInputElement).checked;
      for (const e of batchState.entries) e.enabled = checked;
      scheduleRender();
      return;
    }
    if (action === 'batch-toggle-file') {
      if (!batchState) return;
      const fileId = Number(button.dataset.id ?? '0');
      const entry = batchState.entries.find((e) => e.libraryId === fileId);
      if (entry) { entry.enabled = (button as HTMLInputElement).checked; scheduleRender(); }
      return;
    }
    if (action === 'batch-rule') {
      if (!batchState) return;
      const ruleId = button.dataset.rule as string;
      if ((button as HTMLInputElement).checked) {
        batchState.plan.enabled.add(ruleId as Parameters<typeof batchState.plan.enabled.add>[0]);
      } else {
        batchState.plan.enabled.delete(ruleId as Parameters<typeof batchState.plan.enabled.delete>[0]);
      }
      scheduleRender();
      return;
    }
    if (action === 'batch-run') {
      if (!batchState || batchState.phase === 'running') return;
      void runBatchOptimization(batchState, loadedFiles, render);
      return;
    }
    if (action === 'batch-abort') {
      if (batchState) { batchState.aborted = true; scheduleRender(); }
      return;
    }
    if (action === 'batch-download-zip') {
      if (batchState) void downloadBatchZip(batchState);
      return;
    }
  });

  // ─── drag & drop ─────────────────────────────────────────────────────
  root.addEventListener('dragstart', (e) => {
    const libRow = (e.target as HTMLElement).closest<HTMLElement>('[data-a="lib-row"][data-id]');
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
    if (draggedLibraryId === null) return;
    const catalogHead = (e.target as HTMLElement).closest<HTMLElement>('[data-a="catalog-drop"][data-catalog]');
    if (!catalogHead) return;
    e.preventDefault();
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
    if (dragOverCatalogEl && dragOverCatalogEl !== catalogHead) dragOverCatalogEl.classList.remove('drag-over');
    dragOverCatalogEl = catalogHead;
    dragOverCatalogEl.classList.add('drag-over');
  });

  root.addEventListener('drop', (e) => {
    if (draggedLibraryId === null) return;
    const catalogHead = (e.target as HTMLElement).closest<HTMLElement>('[data-a="catalog-drop"][data-catalog]');
    if (!catalogHead) return;
    e.preventDefault();
    const targetCatalog = catalogHead.dataset.catalog ?? '';
    const currentItem = getLibraryItem(state, draggedLibraryId);
    dragOverCatalogEl?.classList.remove('drag-over');
    dragOverCatalogEl = null;
    if (!targetCatalog || !currentItem || currentItem.catalog === targetCatalog) { draggedLibraryId = null; return; }
    const moveId = draggedLibraryId;
    draggedLibraryId = null;
    void moveLibraryItemToCatalogName(state, moveId, targetCatalog).then((moved) => {
      showToast(moved ? t('setBuilder.toast.itemMoved') : t('setBuilder.toast.itemMoveFailed'));
      scheduleRender();
    });
  });

  root.addEventListener('dragend', () => {
    draggedLibraryId = null;
    if (dragOverCatalogEl) { dragOverCatalogEl.classList.remove('drag-over'); dragOverCatalogEl = null; }
  });

  // ─── input ───────────────────────────────────────────────────────────
  root.addEventListener('input', (e) => {
    const el = e.target as HTMLElement;
    if (el instanceof HTMLInputElement && el.dataset.a === 'search') { state.search = el.value; scheduleRender(); }
  });

  // ─── change (selects & checkboxes) ───────────────────────────────────
  root.addEventListener('change', (e) => {
    const el = e.target as HTMLElement;
    if (!(el instanceof HTMLInputElement || el instanceof HTMLSelectElement)) return;
    const action = el.dataset.a;

    if (action === 'search') { state.search = (el as HTMLInputElement).value; scheduleRender(); return; }
    if (action === 'sort-by' && el instanceof HTMLSelectElement) {
      state.sortBy = el.value === 'area' || el.value === 'pierces' || el.value === 'cutLen' ? el.value : 'name';
      scheduleRender();
      return;
    }
    if (action === 'sort-dir' && el instanceof HTMLSelectElement) { state.sortDir = el.value === 'desc' ? 'desc' : 'asc'; scheduleRender(); return; }
    if (action === 'preset' && el instanceof HTMLSelectElement) { state.sheetPresetId = el.value; scheduleRender(); return; }
    if (action === 'sheet-custom-w' && el instanceof HTMLInputElement) { customSheetWidthMm = Math.max(1, Number(el.value) || 1); return; }
    if (action === 'sheet-custom-h' && el instanceof HTMLInputElement) { customSheetHeightMm = Math.max(1, Number(el.value) || 1); return; }
    if (action === 'gap' && el instanceof HTMLInputElement) { state.gapMm = Math.max(0, Number(el.value) || 0); scheduleRender(); return; }
    if (action === 'strategy' && el instanceof HTMLSelectElement) return;
    if (action === 'rotation' && el instanceof HTMLInputElement) { state.rotationEnabled = el.checked; scheduleRender(); return; }
    if (action === 'rotation-step' && el instanceof HTMLSelectElement) {
      const step = Number(el.value);
      state.rotationStepDeg = step === 1 || step === 5 ? step : 2;
      scheduleRender();
      return;
    }
    if (action === 'multi-start' && el instanceof HTMLInputElement) { state.multiStart = el.checked; scheduleRender(); return; }
    if (action === 'seed' && el instanceof HTMLInputElement) {
      state.seed = Number.isFinite(Number(el.value)) ? Math.trunc(Number(el.value)) : 0;
      scheduleRender();
      return;
    }
    if (action === 'batch-epsilon' && el instanceof HTMLInputElement) {
      if (batchState) { batchState.plan.epsilonMm = Math.max(0.001, Number(el.value) || 0.01); }
      return;
    }
    if (action === 'cl-dist' && el instanceof HTMLInputElement) { state.commonLineMaxMergeDistanceMm = Math.max(0, Number(el.value) || 0); scheduleRender(); return; }
    if (action === 'cl-min' && el instanceof HTMLInputElement) { state.commonLineMinSharedLenMm = Math.max(0, Number(el.value) || 0); scheduleRender(); return; }
    if (action === 'set-enabled' && el instanceof HTMLInputElement) {
      const sid = Number(el.dataset.id ?? '0');
      const s = getSetItem(state, sid);
      if (!s) return;
      s.enabled = el.checked;
      scheduleRender();
      return;
    }
    if ((action === 'mat-group' || action === 'mat-grade' || action === 'mat-thickness') && el instanceof HTMLSelectElement) {
      const itemId = state.materialModalOpenForId;
      if (itemId === null) return;
      const modal = root.querySelector('.sb-modal--material');
      if (!modal) return;
      const groupSel = modal.querySelector<HTMLSelectElement>('[data-a="mat-group"]');
      const gradeSel = modal.querySelector<HTMLSelectElement>('[data-a="mat-grade"]');
      const thickSel = modal.querySelector<HTMLSelectElement>('[data-a="mat-thickness"]');
      const newGroup = groupSel?.value ?? '';
      const newGrade = action === 'mat-group' ? '' : (gradeSel?.value ?? '');
      const newThick = (action === 'mat-group' || action === 'mat-grade') ? '' : (thickSel?.value ?? '');
      const newGrades = newGroup ? getGradesByGroup(newGroup) : [];
      const newThicks = (newGroup && newGrade) ? getThicknessesByGrade(newGroup, newGrade) : [];

      if (gradeSel) {
        gradeSel.innerHTML = `<option value="">${t('material.selectGrade')}</option>` +
          newGrades.map((g) => `<option value="${esc(g)}" ${newGrade === g ? 'selected' : ''}>${esc(g)}</option>`).join('');
        gradeSel.disabled = !newGroup;
      }
      if (thickSel) {
        thickSel.innerHTML = `<option value="">${t('material.selectThickness')}</option>` +
          newThicks.map((th) => `<option value="${th}" ${newThick === String(th) ? 'selected' : ''}>${th} ${t('material.unit.mm')}</option>`).join('');
        thickSel.disabled = !newGroup || !newGrade;
      }
      const saveBtn = modal.querySelector<HTMLButtonElement>('[data-a="material-save"]');
      if (saveBtn) { saveBtn.dataset.group = newGroup; saveBtn.dataset.grade = newGrade; saveBtn.dataset.thickness = newThick; }

      const matInfoEl = modal.querySelector<HTMLElement>('.sb-mat-info');
      if (matInfoEl) {
        const item = state.library.find((it) => it.id === itemId);
        const areaCm2 = (item && item.areaMm2 > 0) ? (item.areaMm2 / 100).toFixed(1) : null;
        const weightStr = (item && newGroup && newGrade && newThick && item.areaMm2 > 0) ? (() => {
          const mat = findMaterial(`${newGroup}|${newGrade}|${newThick}`);
          return mat ? formatWeightKg(calcWeightKg(item.areaMm2, mat.thicknessMm, mat.densityKgM3)) : null;
        })() : null;
        matInfoEl.innerHTML =
          (areaCm2 ? `<div class="sb-mat-stat"><span>${t('material.area')}:</span><b>${areaCm2} ${t('unit.cm2')}</b></div>` : '') +
          (weightStr ? `<div class="sb-mat-stat sb-mat-stat--weight"><span>${t('material.weight')}:</span><b>${esc(weightStr)}</b></div>` : '');
      }
      return;
    }
    if (action === 'opt-rule' && el instanceof HTMLInputElement && optiState) {
      const ruleId = el.dataset.rule as string;
      if (el.checked) optiState.plan.enabled.add(ruleId as Parameters<typeof optiState.plan.enabled.add>[0]);
      else optiState.plan.enabled.delete(ruleId as Parameters<typeof optiState.plan.enabled.delete>[0]);
      scheduleRender();
      return;
    }
    if (action === 'opt-epsilon' && el instanceof HTMLInputElement && optiState) {
      const v = parseFloat(el.value);
      if (Number.isFinite(v) && v > 0) { optiState.plan.epsilonMm = v; }
      return;
    }
  });

  // ─── global events ───────────────────────────────────────────────────
  window.addEventListener('dxf-files-updated', (e) => {
    scheduleFilesUpdatedRender((e as CustomEvent<{ added: number }>).detail?.added ?? 0);
  });

  window.addEventListener(AUTH_SESSION_EVENT, () => {
    if (authSessionToken) {
      void migrateGuestMaterialsToServer().then(() =>
        loadMaterialsFromServer(state),
      ).then(() => scheduleRender());
    } else {
      loadMaterials(state);
      if (state.open) scheduleRender();
    }
  });

  onLocaleChange(() => { if (!state.open) return; scheduleRender(); });

  window.addEventListener('keydown', (e) => {
    if (!state.open) return;
    if (e.key === 'Escape') {
      if (state.materialModalOpenForId !== null) { state.materialModalOpenForId = null; scheduleRender(); return; }
      if (state.openMenuLibraryId !== null) { state.openMenuLibraryId = null; scheduleRender(); return; }
      if (state.previewLibraryId !== null || state.previewSheetId !== null) {
        state.previewLibraryId = null;
        state.previewSheetId = null;
        scheduleRender();
        return;
      }
      toggleOpen(false);
      return;
    }
    if (e.key === '/') { e.preventDefault(); (root.querySelector('#sb-search') as HTMLInputElement | null)?.focus(); }
  });

  document.addEventListener('click', (e) => {
    if (!state.open || state.openMenuLibraryId === null) return;
    if (root.contains(e.target as Node)) return;
    state.openMenuLibraryId = null;
    scheduleRender();
  });

  // ─── init ────────────────────────────────────────────────────────────
  hydrateState(
    state, sheetPresets,
    (p) => { sheetPresets = p; },
    (v) => { customSheetWidthMm = v; },
    (v) => { customSheetHeightMm = v; },
  );
  loadMaterials(state);
  void loadMaterialsFromServer(state).then(() => { if (state.open) scheduleRender(); });
  trigger.addEventListener('click', () => toggleOpen());
  render();
}
