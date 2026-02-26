/**
 * @module main
 * Точка входа приложения DXF Viewer.
 * Только инициализация и склейка модулей.
 */

import './styles/base.css';
import './styles/toolbar.css';
import './styles/sidebar.css';
import './styles/canvas.css';
import './styles/nesting.css';
import './styles/statusbar.css';
import './styles/animations.css';
import './styles/responsive.css';

import { apiGetJSON, apiPatchJSON, apiPostJSON, apiPostBlob, arrayBufferToBase64, downloadBlob } from './api.js';
import type { LoadedFile, UICuttingStats, ComputeMode } from './types.js';
import { computeCuttingStats } from '../../core-engine/src/cutting/index.js';
import { SHEET_PRESETS } from '../../core-engine/src/nesting/index.js';
import type { FlattenedEntity } from '../../core-engine/src/normalize/index.js';
import type { Color } from '../../core-engine/src/types/index.js';

// ─── Modules ─────────────────────────────────────────────────────────

import {
  renderer, loadedFiles, activeFileId, setActiveFileId,
  workspaceCatalogs, selectedCatalogIds,
  authSessionToken, cuttingComputeMode, nestingComputeMode,
  setCuttingComputeMode, setNestingComputeMode,
  nestingMode, currentNestResult, nestHoveredSheet, nestCellRects,
  setNestHoveredSheet, setShowGrid, showGrid,
} from './state.js';
import {
  canvas, container, fileInput,
  btnOpen, btnWelcomeOpen, btnFit, btnAddFiles, btnAddCatalog,
  btnSelectAllFiles, btnInspector, btnGrid,
  btnAuthLogin, btnAuthLogout,
  sidebarInspector, inspectorContent,
  statusZoom, statusEntities, statusVersion,
  chkPierces, pierceToggle,
  chkDimensions, dimToggle,
  btnNesting, nestingPanel, nestPreset, nestCustomRow,
  nestRotateEnabled, nestRotateStep, nestModeRadios,
  btnAdvancedToggle, nestAdvanced, nestCommonLineEnabled,
  btnNestRun, btnExportDXF, btnExportCSV,
  btnExportAllSheets, btnCopyAllHashes, btnCopyAllHashesTop,
  nestingScroll, nestZoomCanvas, nestZoomPopup,
  nestClose, mobileBackdrop, sidebarFiles,
  shortcutsOverlay, shortcutsClose,
  dropOverlay, welcome,
} from './dom.js';
import {
  initAuthCallbacks, restoreAuthSession, runTelegramLoginFlow,
  logoutWorkspace, applyAuthUiState, showAuthHint, getAuthHeaders, saveGuestDraft,
} from './auth.js';
import {
  initWorkspaceCallbacks,
  reloadWorkspaceLibraryFromServer, loadSingleFile, removeFile, toggleFileChecked,
  isFileInSelectedCatalogs, selectAllCatalogsForCurrentData, ensureSelectedCatalogsDefaults,
  refreshCatalogSelectionViews, getPreferredUploadCatalogId,
} from './workspace.js';
import {
  initSidebarCallbacks,
  renderCatalogFilter, renderFileList, recalcTotals, updateUploadTargetHint, updateBulkControlsUi,
} from './sidebar.js';
import {
  initNestingPanelCallbacks,
  updateNestItems, runNesting, autoRerunNesting, exitNestingMode,
  exportAllSheetsDXF, exportFullNestingDXF, copyAllHashes,
  renderAllNestingSheets,
  applyZoomWheel, renderZoomSheet, showZoomPopup, hideZoomPopup, scheduleHideZoomPopup,
  positionPopup,
  setNestModeValue, getNestModeValue,
  setZoomLevel, setZoomPanX, setZoomPanY, setZoomPopupLocked, setZoomPanning,
  setZoomPanStartX, setZoomPanStartY, setZoomHideTimer,
} from './nesting-panel.js';
import * as NP from './nesting-panel.js';
import { t, applyLocale, setLocale, getLocale, onLocaleChange } from './i18n/index.js';

// ─── i18n init ───────────────────────────────────────────────────────

applyLocale();

const btnLangToggle = document.getElementById('btn-lang-toggle') as HTMLButtonElement | null;
btnLangToggle?.addEventListener('click', () => {
  setLocale(getLocale() === 'ru' ? 'en' : 'ru');
});
onLocaleChange(() => {
  applyAuthUiState(updateUploadTargetHint);
  updateBulkControlsUi();
});

// ─── Mode badge ───────────────────────────────────────────────────────

const modeBadge = document.createElement('div');
modeBadge.style.cssText = 'position:fixed;right:12px;bottom:12px;padding:6px 10px;border-radius:8px;font:500 11px/1.2 system-ui,sans-serif;color:#e5e7eb;background:rgba(17,24,39,0.85);border:1px solid rgba(229,231,235,0.2);backdrop-filter:blur(4px);z-index:9999';
// Показываем badge только в dev режиме
if (import.meta.env.DEV) document.body.appendChild(modeBadge);

function updateModeBadge(): void {
  modeBadge.textContent = `Mode: cutting ${cuttingComputeMode.toUpperCase()} | nesting ${nestingComputeMode.toUpperCase()}`;
}
updateModeBadge();

// ─── Nesting button state ─────────────────────────────────────────────

function updateNestingButtonState(): void {
  const panelOpen = !nestingPanel.classList.contains('hidden') || nestingPanel.classList.contains('mobile-open');
  btnNesting.classList.toggle('active', panelOpen || nestingMode);
}

// ─── Computing stats ──────────────────────────────────────────────────

async function computeStatsFromBuffer(base64: string, doc: LoadedFile['doc']): Promise<UICuttingStats> {
  try {
    const res = await apiPostJSON<{ success: boolean; data: UICuttingStats }>('/api/cutting-stats', { base64 });
    setCuttingComputeMode('api');
    updateModeBadge();
    return res.data;
  } catch {
    const s = computeCuttingStats(doc);
    setCuttingComputeMode('local');
    updateModeBadge();
    return { totalPierces: s.totalPierces, totalCutLength: s.totalCutLength, cuttingEntityCount: s.cuttingEntityCount, chains: s.chains };
  }
}

// ─── Auth UI ──────────────────────────────────────────────────────────

function updateAuthUi(): void {
  applyAuthUiState(updateUploadTargetHint);
}

// ─── setActiveFile ────────────────────────────────────────────────────

function setActiveFile(id: number): void {
  setActiveFileId(id);
  const entry = loadedFiles.find(f => f.id === id);
  if (!entry) return;
  welcome.classList.toggle('hidden', loadedFiles.length > 0);
  if (entry.loading || entry.doc == null) {
    renderer.clearDocument();
    statusEntities.textContent = '…';
    statusVersion.textContent  = '';
    renderFileList();
    return;
  }
  renderer.setDocument(entry.doc);
  renderer.setPiercePoints(entry.stats.chains.map(c => c.piercePoint));
  updateStatusBar();
  statusEntities.textContent = `${entry.doc.entityCount} obj`;
  statusVersion.textContent  = entry.doc.source.metadata.version;
  renderFileList();
}

function syncWelcomeVisibility(): void {
  welcome.classList.toggle('hidden', loadedFiles.length > 0);
}

// ─── Init callbacks ───────────────────────────────────────────────────

initAuthCallbacks({
  updateAuthUi,
  renderCatalogFilter,
  renderFileList,
  recalcTotals,
  updateNestItems,
  computeStats: computeStatsFromBuffer,
  setActiveFile,
  reloadFromServer: reloadWorkspaceLibraryFromServer,
});

initWorkspaceCallbacks({
  renderCatalogFilter,
  renderFileList,
  recalcTotals,
  updateNestItems,
  setActiveFile,
  syncWelcomeVisibility,
  computeStats: computeStatsFromBuffer,
});

initSidebarCallbacks({
  toggleFileChecked: (id) => toggleFileChecked(id),
  removeFile: (id) => removeFile(id, setActiveFile),
  setActiveFile,
  recalcTotals,
  updateNestItems,
});

initNestingPanelCallbacks({
  updateModeBadge,
  updateNestingButtonState,
});

// ─── Status bar ───────────────────────────────────────────────────────

function updateStatusBar(): void {
  statusZoom.textContent = `${(renderer.camera.zoom * 100).toFixed(0)}%`;
}

// ─── Inspector ────────────────────────────────────────────────────────

/** Экранирует строку для безопасной вставки в HTML (защита от XSS) */
function escHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function showInspector(fe: FlattenedEntity): void {
  sidebarInspector.classList.remove('hidden');
  const e = fe.entity;
  const row = (label: string, value: string) =>
    `<div class="prop-row"><span class="prop-label">${escHtml(label)}</span><span class="prop-value">${escHtml(value)}</span></div>`;
  let html = '';
  html += row('Тип', e.type);
  html += row('Handle', e.handle);
  html += row('Слой', e.layer);
  html += row('Цвет', colorStr(fe.effectiveColor));
  html += row('Тип линии', fe.effectiveLineType);
  if ('start' in e && 'end' in e) {
    const s = e.start as { x: number; y: number };
    const en = e.end as { x: number; y: number };
    html += row('Начало', `${s.x.toFixed(2)}, ${s.y.toFixed(2)}`);
    html += row('Конец', `${en.x.toFixed(2)}, ${en.y.toFixed(2)}`);
  }
  if ('center' in e && 'radius' in e) {
    const c = e.center as { x: number; y: number };
    html += row('Центр', `${c.x.toFixed(2)}, ${c.y.toFixed(2)}`);
    html += row('Радиус', (e as { radius: number }).radius.toFixed(3));
  }
  inspectorContent.innerHTML = html;
  renderer.resizeToContainer();
}

function clearInspector(): void {
  inspectorContent.innerHTML = '<p style="color: var(--text-muted); font-size: 12px;">Кликните на объект</p>';
}

function colorStr(c: Color): string {
  return `rgb(${c.r}, ${c.g}, ${c.b})`;
}

// ─── File open / drag-drop onto canvas ───────────────────────────────

function openFileDialog(): void { fileInput.click(); }

fileInput.addEventListener('change', () => {
  const files = fileInput.files;
  if (files && files.length > 0) addFiles(Array.from(files));
  fileInput.value = '';
});

const MAX_FILE_SIZE_BYTES = 200 * 1024 * 1024; // 200 MB

async function addFiles(files: File[]): Promise<void> {
  syncWelcomeVisibility();
  for (const file of files) {
    if (!file.name.toLowerCase().endsWith('.dxf')) continue;
    if (file.size > MAX_FILE_SIZE_BYTES) {
      alert(`Файл "${file.name}" слишком большой (${(file.size / 1024 / 1024).toFixed(1)} MB). Максимальный размер: 200 MB.`);
      continue;
    }
    await loadSingleFile(file, setActiveFile);
  }
}

let _dragDepth = 0;
container.addEventListener('dragenter', (e) => { e.preventDefault(); _dragDepth++; dropOverlay.classList.add('active'); });
container.addEventListener('dragover',  (e) => { e.preventDefault(); });
container.addEventListener('dragleave', () => { if (--_dragDepth <= 0) { _dragDepth = 0; dropOverlay.classList.remove('active'); } });
container.addEventListener('drop', (e) => {
  e.preventDefault(); _dragDepth = 0; dropOverlay.classList.remove('active');
  if (e.dataTransfer?.files) {
    const dxfs = Array.from(e.dataTransfer.files).filter(f => f.name.toLowerCase().endsWith('.dxf'));
    if (dxfs.length > 0) addFiles(dxfs);
  }
});

// ─── Canvas mouse: pan, zoom, inspect ────────────────────────────────

let isPanning = false, lastMouseX = 0, lastMouseY = 0;

canvas.addEventListener('wheel', (e) => {
  e.preventDefault();
  const factor = e.deltaY < 0 ? 1.15 : 1 / 1.15;
  const rect = canvas.getBoundingClientRect();
  renderer.camera.zoomAt(
    (e.clientX - rect.left) * devicePixelRatio,
    (e.clientY - rect.top) * devicePixelRatio,
    factor,
  );
  renderer.requestRedraw();
  updateStatusBar();
}, { passive: false });

canvas.addEventListener('mousedown', (e) => {
  if (e.button === 1 || (e.button === 0 && e.shiftKey)) {
    isPanning = true; lastMouseX = e.clientX; lastMouseY = e.clientY;
    canvas.style.cursor = 'grabbing';
  } else if (e.button === 0) {
    const rect = canvas.getBoundingClientRect();
    const sx = (e.clientX - rect.left) * devicePixelRatio;
    const sy = (e.clientY - rect.top) * devicePixelRatio;
    const idx = renderer.hitTestScreen(sx, sy);
    renderer.clearSelection();
    if (idx >= 0) {
      const fe = renderer.getEntity(idx);
      if (fe) { renderer.select(fe.entity.handle); showInspector(fe); }
    } else { clearInspector(); }
  }
});

window.addEventListener('mousemove', (e) => {
  if (isPanning) {
    renderer.camera.panBy(
      (e.clientX - lastMouseX) * devicePixelRatio,
      (e.clientY - lastMouseY) * devicePixelRatio,
    );
    renderer.requestRedraw();
    lastMouseX = e.clientX; lastMouseY = e.clientY;
    updateStatusBar();
  }
  const rect = canvas.getBoundingClientRect();
  const sx = (e.clientX - rect.left) * devicePixelRatio;
  const sy = (e.clientY - rect.top) * devicePixelRatio;
  const world = renderer.camera.screenToWorld(sx, sy);
  document.getElementById('status-coords')!.textContent = `X: ${world.x.toFixed(2)}  Y: ${world.y.toFixed(2)}`;
  if (!isPanning) {
    const idx = renderer.hitTestScreen(sx, sy);
    renderer.setHovered(idx, sx, sy);
    canvas.style.cursor = idx >= 0 ? 'pointer' : 'default';
  }

  // Zoom popup pan
  if (NP.zoomPanning) {
    setZoomPanX(e.clientX - NP.zoomPanStartX);
    setZoomPanY(e.clientY - NP.zoomPanStartY);
    if (nestHoveredSheet >= 0) renderZoomSheet(nestHoveredSheet);
  }
});

window.addEventListener('mouseup', () => {
  isPanning = false;
  canvas.style.cursor = 'default';
  setZoomPanning(false);
});

// ─── Toolbar buttons ──────────────────────────────────────────────────

btnOpen.addEventListener('click', openFileDialog);
btnWelcomeOpen.addEventListener('click', openFileDialog);
btnAddFiles.addEventListener('click', openFileDialog);

btnFit.addEventListener('click', () => { renderer.zoomToFit(); updateStatusBar(); });

btnInspector.addEventListener('click', () => {
  if (isMobile()) {
    const isOpen = sidebarInspector.classList.contains('mobile-open');
    closeMobilePanels();
    if (!isOpen) openMobilePanel(sidebarInspector);
  } else {
    sidebarInspector.classList.toggle('hidden');
    renderer.resizeToContainer();
  }
});

btnGrid.addEventListener('click', () => {
  setShowGrid(!showGrid);
  renderer.requestRedraw();
});

chkPierces.addEventListener('change', () => {
  renderer.showPiercePoints = chkPierces.checked;
  pierceToggle.classList.toggle('on', chkPierces.checked);
});

chkDimensions.addEventListener('change', () => {
  renderer.showDimensions = chkDimensions.checked;
  dimToggle.classList.toggle('on', chkDimensions.checked);
});

btnAuthLogin.addEventListener('click', () => { void runTelegramLoginFlow(); });
btnAuthLogout.addEventListener('click', () => { void logoutWorkspace(); });

btnSelectAllFiles.addEventListener('click', () => {
  const visible = loadedFiles.filter((f) => isFileInSelectedCatalogs(f));
  const hasUnchecked = visible.some((f) => !f.checked);
  for (const file of visible) file.checked = hasUnchecked;
  if (authSessionToken) {
    const catalogIds = [...selectedCatalogIds].filter(id => id !== '__uncategorized__');
    const includeUncat = selectedCatalogIds.has('__uncategorized__');
    void apiPostJSON<{ success: boolean }>('/api/library-files-check-all', {
      checked: hasUnchecked,
      catalogIds: catalogIds.length > 0 || includeUncat ? catalogIds : undefined,
    }, getAuthHeaders()).catch((e) => console.error('Check all failed:', e));
  }
  renderFileList(); recalcTotals(); updateNestItems(); saveGuestDraft();
});

btnAddCatalog.addEventListener('click', () => {
  if (!authSessionToken) { showAuthHint('Нужен вход для каталогов'); return; }
  const name = prompt('Название каталога:')?.trim() ?? '';
  if (!name) return;
  void apiPostJSON<{ success: boolean; catalog: import('./types.js').WorkspaceCatalog }>('/api/library-catalogs', {
    name,
  }, getAuthHeaders())
    .then((resp) => {
      workspaceCatalogs.push(resp.catalog);
      selectedCatalogIds.add(resp.catalog.id);
      renderCatalogFilter();
      renderFileList();
    })
    .catch((e) => alert(`Не удалось создать каталог: ${e instanceof Error ? e.message : String(e)}`));
});

// ─── Resize ───────────────────────────────────────────────────────────

new ResizeObserver(() => { renderer.resizeToContainer(); }).observe(container);

// ─── Nesting panel ────────────────────────────────────────────────────

btnNesting.addEventListener('click', () => {
  if (isMobile()) {
    const isOpen = nestingPanel.classList.contains('mobile-open');
    closeMobilePanels();
    if (!isOpen) openMobilePanel(nestingPanel);
  } else {
    nestingPanel.classList.toggle('hidden');
    if (!nestingPanel.classList.contains('hidden')) updateNestItems();
  }
  updateNestingButtonState();
  renderer.resizeToContainer();
});

nestPreset.addEventListener('change', () => {
  nestCustomRow.classList.toggle('hidden', nestPreset.value !== 'custom');
  if (nestPreset.value !== 'custom') {
    const p = SHEET_PRESETS[Number(nestPreset.value)]!;
    (document.getElementById('nest-w') as HTMLInputElement).value = String(p.size.width);
    (document.getElementById('nest-h') as HTMLInputElement).value = String(p.size.height);
  }
});

function updateRotationControls(): void {
  nestRotateStep.disabled = !nestRotateEnabled.checked;
  nestRotateStep.style.opacity = nestRotateEnabled.checked ? '1' : '0.5';
}

function updateCommonLineControls(): void {
  const enabled = nestCommonLineEnabled.checked;
  const dist = document.getElementById('nest-commonline-dist') as HTMLInputElement;
  const minLen = document.getElementById('nest-commonline-minlen') as HTMLInputElement;
  const status = document.getElementById('nest-commonline-status') as HTMLDivElement;
  dist.disabled = !enabled; minLen.disabled = !enabled;
  dist.style.opacity = enabled ? '1' : '0.5'; minLen.style.opacity = enabled ? '1' : '0.5';
  status.textContent = enabled ? 'Status: ON (совместный рез включен)' : 'Status: OFF';
  status.style.color = enabled ? '#10b981' : '#f59e0b';
}

let applyingModePreset = false;

function applyNestingModePreset(mode: 'precise' | 'common'): void {
  applyingModePreset = true;
  try {
    nestCommonLineEnabled.checked = mode === 'common';
    updateCommonLineControls();
    setNestModeValue(mode === 'common' ? 'common' : 'precise');
  } finally {
    applyingModePreset = false;
  }
}

function syncModeByAdvancedControls(): void {
  if (applyingModePreset) return;
  setNestModeValue(nestCommonLineEnabled.checked ? 'common' : 'precise');
}

updateRotationControls();
applyNestingModePreset('precise');
updateCommonLineControls();

for (const radio of nestModeRadios) {
  radio.addEventListener('change', () => {
    if (applyingModePreset) return;
    const mode = getNestModeValue();
    applyNestingModePreset(mode === 'common' ? 'common' : 'precise');
    autoRerunNesting();
  });
}

btnAdvancedToggle.addEventListener('click', () => {
  const isOpen = !nestAdvanced.classList.contains('hidden');
  nestAdvanced.classList.toggle('hidden', isOpen);
  btnAdvancedToggle.classList.toggle('open', !isOpen);
});

nestRotateEnabled.addEventListener('change', () => { updateRotationControls(); autoRerunNesting(); });
nestRotateStep.addEventListener('change', () => { autoRerunNesting(); });
(document.getElementById('nest-seed') as HTMLInputElement).addEventListener('change', () => { autoRerunNesting(); });
nestCommonLineEnabled.addEventListener('change', () => { updateCommonLineControls(); syncModeByAdvancedControls(); autoRerunNesting(); });
(document.getElementById('nest-commonline-dist') as HTMLInputElement).addEventListener('change', () => { autoRerunNesting(); });
(document.getElementById('nest-commonline-minlen') as HTMLInputElement).addEventListener('change', () => { autoRerunNesting(); });

btnNestRun.addEventListener('click', () => { void runNesting(); });
nestClose.addEventListener('click', exitNestingMode);

// ─── Export ───────────────────────────────────────────────────────────

btnExportDXF.addEventListener('click', exportFullNestingDXF);

btnExportCSV.addEventListener('click', () => {
  if (!currentNestResult) return;
  void (async () => {
    try {
      const blob = await apiPostBlob('/api/export/csv', { nestingResult: currentNestResult, fileName: 'nesting' });
      downloadBlob(blob, 'nesting.csv');
    } catch (err) { alert(`Ошибка экспорта CSV: ${err instanceof Error ? err.message : String(err)}`); }
  })();
});

btnExportAllSheets.addEventListener('click', exportAllSheetsDXF);
btnCopyAllHashes.addEventListener('click', () => copyAllHashes(btnCopyAllHashes));
btnCopyAllHashesTop.addEventListener('click', () => copyAllHashes(btnCopyAllHashesTop));

// ─── Nesting scroll: zoom popup ───────────────────────────────────────

new ResizeObserver(() => { if (nestingMode) renderAllNestingSheets(); }).observe(container);

nestingScroll.addEventListener('wheel', (e) => {
  if (nestHoveredSheet < 0 && !nestZoomPopup.classList.contains('visible')) return;
  e.preventDefault(); applyZoomWheel(e.deltaY);
}, { passive: false });

nestZoomCanvas.addEventListener('wheel', (e) => {
  e.preventDefault(); e.stopPropagation();
  if (nestHoveredSheet < 0) return;
  const rect = nestZoomCanvas.getBoundingClientRect();
  const mx = e.clientX - rect.left, my = e.clientY - rect.top;
  const oldZoom = NP.zoomLevel;
  const factor = e.deltaY < 0 ? 1.15 : 1 / 1.15;
  const newZoom = Math.max(0.5, Math.min(20, NP.zoomLevel * factor));
  setZoomLevel(newZoom);
  const ratio = newZoom / oldZoom;
  setZoomPanX(mx - (mx - NP.zoomPanX) * ratio);
  setZoomPanY(my - (my - NP.zoomPanY) * ratio);
  setZoomPopupLocked(true);
  renderZoomSheet(nestHoveredSheet);
}, { passive: false });

nestZoomCanvas.addEventListener('mousedown', (e) => {
  if (e.button !== 0) return;
  setZoomPanning(true);
  setZoomPanStartX(e.clientX - NP.zoomPanX);
  setZoomPanStartY(e.clientY - NP.zoomPanY);
  setZoomPopupLocked(true);
});

nestZoomPopup.addEventListener('mouseenter', () => {
  if (NP.zoomHideTimer) { clearTimeout(NP.zoomHideTimer); setZoomHideTimer(null); }
  setZoomPopupLocked(true);
});
nestZoomPopup.addEventListener('mouseleave', () => {
  setZoomPopupLocked(false); setZoomPanning(false); hideZoomPopup();
});
nestZoomCanvas.addEventListener('dblclick', () => {
  setZoomLevel(1); setZoomPanX(0); setZoomPanY(0);
  if (nestHoveredSheet >= 0) renderZoomSheet(nestHoveredSheet);
});

nestingScroll.addEventListener('mousemove', (e) => {
  if (!currentNestResult || nestCellRects.length === 0) {
    setZoomPopupLocked(false); scheduleHideZoomPopup(); return;
  }
  const rect = nestingScroll.getBoundingClientRect();
  const mx = e.clientX - rect.left + nestingScroll.scrollLeft;
  const my = e.clientY - rect.top  + nestingScroll.scrollTop;

  let found = -1;
  for (const cell of nestCellRects) {
    if (mx >= cell.x && mx <= cell.x + cell.w && my >= cell.y && my <= cell.y + cell.h) {
      found = cell.si; break;
    }
  }

  if (found >= 0) {
    if (NP.zoomHideTimer) { clearTimeout(NP.zoomHideTimer); setZoomHideTimer(null); }
    if (nestHoveredSheet !== found) {
      setZoomPopupLocked(false);
      setNestHoveredSheet(found);
      showZoomPopup(found, e.clientX, e.clientY);
    } else if (!NP.zoomPopupLocked) {
      positionPopup(e.clientX, e.clientY);
    }
  } else if (!NP.zoomPopupLocked) {
    scheduleHideZoomPopup();
  }
});
nestingScroll.addEventListener('mouseleave', () => { if (!NP.zoomPopupLocked) scheduleHideZoomPopup(); });

// ─── Mobile ───────────────────────────────────────────────────────────

function isMobile(): boolean { return window.innerWidth <= 768; }

function closeMobilePanels(): void {
  sidebarFiles.classList.remove('mobile-open');
  sidebarInspector.classList.remove('mobile-open');
  nestingPanel.classList.remove('mobile-open');
  mobileBackdrop.classList.remove('active');
  updateNestingButtonState();
}

function openMobilePanel(panel: HTMLElement): void {
  closeMobilePanels();
  panel.classList.add('mobile-open');
  mobileBackdrop.classList.add('active');
  updateNestingButtonState();
}

mobileBackdrop.addEventListener('click', closeMobilePanels);
document.querySelector('.toolbar .logo')?.addEventListener('click', () => {
  if (!isMobile()) return;
  const isOpen = sidebarFiles.classList.contains('mobile-open');
  closeMobilePanels();
  if (!isOpen) openMobilePanel(sidebarFiles);
});
window.addEventListener('resize', () => { if (!isMobile()) closeMobilePanels(); });

// ─── Shortcuts ────────────────────────────────────────────────────────

function toggleShortcutsDialog(show?: boolean): void {
  const visible = show ?? shortcutsOverlay.classList.contains('hidden');
  shortcutsOverlay.classList.toggle('hidden', !visible);
}
shortcutsClose.addEventListener('click', () => toggleShortcutsDialog(false));
shortcutsOverlay.addEventListener('click', (e) => { if (e.target === shortcutsOverlay) toggleShortcutsDialog(false); });

window.addEventListener('keydown', (e) => {
  const tag = (e.target as HTMLElement).tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
  if ((e.ctrlKey || e.metaKey) && e.key === 'o') { e.preventDefault(); openFileDialog(); return; }
  if (e.key === 'f' || e.key === 'F') { renderer.zoomToFit(); updateStatusBar(); }
  if (e.key === 'Escape') {
    if (!shortcutsOverlay.classList.contains('hidden')) { toggleShortcutsDialog(false); return; }
    if (isMobile() && mobileBackdrop.classList.contains('active')) { closeMobilePanels(); return; }
    if (nestingMode) { exitNestingMode(); } else { renderer.clearSelection(); clearInspector(); }
  }
  if (e.key === 'g' || e.key === 'G') { btnGrid.click(); }
  if (e.key === '?') { toggleShortcutsDialog(); }
});

// ─── Boot ─────────────────────────────────────────────────────────────

updateNestingButtonState();
void restoreAuthSession();
