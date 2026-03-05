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
import './styles/set-builder.css';

import { apiPostJSON } from './api.js';
import type { LoadedFile, UICuttingStats } from './types.js';
import { computeCuttingStats } from '../../core-engine/src/cutting/index.js';

// ─── Modules ─────────────────────────────────────────────────────────

import {
  renderer, loadedFiles, setActiveFileId,
  workspaceCatalogs, selectedCatalogIds,
  authSessionToken, cuttingComputeMode, nestingComputeMode,
  setCuttingComputeMode,
  nestingMode, currentNestResult, nestHoveredSheet, nestCellRects,
  setNestHoveredSheet, setShowGrid, showGrid,
} from './state.js';
import {
  canvas, container, fileInput,
  btnOpen, btnWelcomeOpen, btnFit, btnAddFiles, btnAddCatalog,
  btnSelectAllFiles, btnInspector, btnGrid,
  btnAuthLogin, btnAuthLogout,
  btnSetBuilder, setBuilderRoot,
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
  isFileInSelectedCatalogs,
} from './workspace.js';
import {
  initSidebarCallbacks,
  renderCatalogFilter, renderFileList, recalcTotals, updateUploadTargetHint, updateBulkControlsUi,
} from './sidebar.js';
import {
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
import { createCanvasInteractionController } from './canvas-interaction.js';
import { createFileIngestController } from './file-ingest.js';
import { createInspectorPanelController } from './inspector-panel.js';
import { initSetBuilder } from './set-builder/index.js';
import { createMobileUiController } from './mobile-ui.js';
import { createViewportSceneController } from './viewport-scene.js';
import { initNestingControls } from './nesting-controls.js';
import { initNestingZoomUi } from './nesting-zoom-ui.js';
import { initToolbarActions } from './toolbar-actions.js';
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

const viewportScene = createViewportSceneController({
  container,
  files: loadedFiles,
});

const inspectorPanel = createInspectorPanelController({
  inspectorContent,
  renderer,
  sidebarInspector,
});

const fileIngest = createFileIngestController({
  container,
  dropOverlay,
  fileInput,
  files: loadedFiles,
  loadSingleFile,
  setActiveFile,
  syncWelcomeVisibility,
  viewportScene,
});

const statusCoords = document.getElementById('status-coords')!;

createCanvasInteractionController({
  canvas,
  renderer,
  inspectorPanel,
  statusCoords,
  updateStatusBar,
  getZoomPanning: () => NP.zoomPanning,
  getZoomPanStartX: () => NP.zoomPanStartX,
  getZoomPanStartY: () => NP.zoomPanStartY,
  getHoveredSheet: () => nestHoveredSheet,
  renderZoomSheet,
  setZoomPanX,
  setZoomPanY,
  setZoomPanning,
});

const mobileUi = createMobileUiController({
  mobileBackdrop,
  sidebarFiles,
  sidebarInspector,
  nestingPanel,
  shortcutsOverlay,
  shortcutsClose,
  updateNestingButtonState,
  onOpenFileDialog: () => fileIngest.openFileDialog(),
  onZoomToFit: () => {
    renderer.zoomToFit();
    updateStatusBar();
  },
  onToggleGrid: () => {
    setShowGrid(!showGrid);
    renderer.requestRedraw();
  },
  onExitNesting: exitNestingMode,
  onClearSelection: () => {
    renderer.clearSelection();
    inspectorPanel.clearInspector();
  },
  getNestingMode: () => nestingMode,
});

initToolbarActions({
  btnOpen,
  btnWelcomeOpen,
  btnAddFiles,
  btnFit,
  btnInspector,
  btnGrid,
  chkPierces,
  pierceToggle,
  chkDimensions,
  dimToggle,
  btnAuthLogin,
  btnAuthLogout,
  btnSelectAllFiles,
  btnAddCatalog,
  btnExportDXF,
  btnExportCSV,
  btnExportAllSheets,
  btnCopyAllHashes,
  btnCopyAllHashesTop,
  sidebarInspector,
  renderer,
  mobileUi,
  updateStatusBar,
  openFileDialog: () => fileIngest.openFileDialog(),
  toggleGrid: () => {
    setShowGrid(!showGrid);
    renderer.requestRedraw();
  },
  runTelegramLoginFlow,
  logoutWorkspace,
  getVisibleFiles: () => loadedFiles.filter((file) => isFileInSelectedCatalogs(file)),
  isAuthenticated: () => authSessionToken.length > 0,
  getAuthHeaders,
  getCatalogIdsForBulkAction: () => ({
    catalogIds: [...selectedCatalogIds].filter((id) => id !== '__uncategorized__'),
    includeUncategorized: selectedCatalogIds.has('__uncategorized__'),
  }),
  onBulkCheckApplied: () => {
    renderFileList();
    recalcTotals();
    updateNestItems();
    saveGuestDraft();
  },
  showAuthHint,
  promptCatalogName: () => prompt(t('catalog.add.prompt'))?.trim() ?? '',
  createCatalog: async (name) => {
    const response = await apiPostJSON<{ success: boolean; catalog: import('./types.js').WorkspaceCatalog }>('/api/library-catalogs', {
      name,
    }, getAuthHeaders());
    return response.catalog;
  },
  onCatalogCreated: (catalog) => {
    workspaceCatalogs.push(catalog);
    selectedCatalogIds.add(catalog.id);
    renderCatalogFilter();
    renderFileList();
  },
  getCurrentNestResult: () => currentNestResult,
  exportFullNestingDXF,
  exportAllSheetsDXF,
  copyAllHashes,
  getCatalogAuthRequiredMessage: () => t('catalog.add.authRequired'),
  getCatalogCreateErrorMessage: (error) => t('catalog.add.error', { msg: error instanceof Error ? error.message : String(error) }),
});

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

// ─── Status bar ───────────────────────────────────────────────────────

function updateStatusBar(): void {
  statusZoom.textContent = `${(renderer.camera.zoom * 100).toFixed(0)}%`;
}

// ─── Resize ───────────────────────────────────────────────────────────

new ResizeObserver(() => {
  renderer.resizeToContainer();
  viewportScene.handleResize();
}).observe(container);

// ─── Nesting panel ────────────────────────────────────────────────────

initNestingControls({
  btnNesting,
  nestingPanel,
  nestPreset,
  nestCustomRow,
  nestRotateEnabled,
  nestRotateStep,
  nestModeRadios,
  btnAdvancedToggle,
  nestAdvanced,
  nestCommonLineEnabled,
  btnNestRun,
  nestClose,
  mobileUi,
  updateNestItems,
  updateNestingButtonState,
  autoRerunNesting,
  runNesting,
  exitNestingMode,
  getNestModeValue,
  setNestModeValue,
  onResizeRenderer: () => renderer.resizeToContainer(),
});

initNestingZoomUi({
  container,
  nestingScroll,
  nestZoomCanvas,
  nestZoomPopup,
  isNestingMode: () => nestingMode,
  getCurrentNestResult: () => currentNestResult,
  getNestCellRects: () => nestCellRects,
  getHoveredSheet: () => nestHoveredSheet,
  setHoveredSheet: setNestHoveredSheet,
  getZoomLevel: () => NP.zoomLevel,
  getZoomPanX: () => NP.zoomPanX,
  getZoomPanY: () => NP.zoomPanY,
  getZoomHideTimer: () => NP.zoomHideTimer,
  isZoomPopupLocked: () => NP.zoomPopupLocked,
  renderAllNestingSheets,
  applyZoomWheel,
  renderZoomSheet,
  showZoomPopup,
  hideZoomPopup,
  scheduleHideZoomPopup,
  positionPopup,
  setZoomLevel,
  setZoomPanX,
  setZoomPanY,
  setZoomPopupLocked,
  setZoomPanning,
  setZoomPanStartX,
  setZoomPanStartY,
  setZoomHideTimer,
});

// ─── Boot ─────────────────────────────────────────────────────────────

updateNestingButtonState();
void restoreAuthSession();

initSetBuilder(setBuilderRoot, btnSetBuilder);
