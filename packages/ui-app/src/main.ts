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
  restoreAuthSession, runTelegramLoginFlow,
  logoutWorkspace, applyAuthUiState, showAuthHint, getAuthHeaders, saveGuestDraft,
} from './auth.js';
import {
  reloadWorkspaceLibraryFromServer, loadSingleFile, toggleFileChecked,
  isFileInSelectedCatalogs,
} from './workspace.js';
import {
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
import { initSetBuilder } from './set-builder/index.js';
import { initNestingControls } from './nesting-controls.js';
import { initNestingZoomUi } from './nesting-zoom-ui.js';
import { initToolbarActions } from './toolbar-actions.js';
import { initMainModuleCallbacks } from './main-module-callbacks.js';
import { initMainShellUi } from './main-shell-ui.js';
import { createMainToolbarBridgeController } from './main-toolbar-bridge.js';
import { createMainUiHelpersController } from './main-ui-helpers.js';
import { createMainRuntimeUiController } from './main-runtime-ui.js';
import { createMainViewerShellController } from './main-viewer-shell.js';
import { t } from './i18n/index.js';

// ─── i18n init ───────────────────────────────────────────────────────

initMainShellUi({
  container,
  applyAuthUiState,
  updateUploadTargetHint,
  updateBulkControlsUi,
  onResizeRenderer: () => renderer.resizeToContainer(),
  onResizeViewport: () => viewportScene.handleResize(),
});

const mainRuntimeUi = createMainRuntimeUiController({
  btnNesting,
  nestingPanel,
  getCuttingComputeMode: () => cuttingComputeMode,
  getNestingComputeMode: () => nestingComputeMode,
  getNestingMode: () => nestingMode,
  setCuttingComputeMode,
  computeCuttingStats,
});

const updateModeBadge = (): void => mainRuntimeUi.updateModeBadge();
const updateNestingButtonState = (): void => mainRuntimeUi.updateNestingButtonState();
const computeStatsFromBuffer = (base64: string, doc: LoadedFile['doc']): Promise<UICuttingStats> => mainRuntimeUi.computeStatsFromBuffer(base64, doc);

updateModeBadge();

// ─── Auth UI ──────────────────────────────────────────────────────────

const mainUiHelpers = createMainUiHelpersController({
  welcome,
  renderer,
  statusZoom,
  statusEntities,
  statusVersion,
  loadedFiles,
  renderFileList,
  setActiveFileId,
  updateUploadTargetHint,
  applyAuthUiState,
});

const updateAuthUi = (): void => mainUiHelpers.updateAuthUi();
const setActiveFile = (id: number): void => mainUiHelpers.setActiveFile(id);
const syncWelcomeVisibility = (): void => mainUiHelpers.syncWelcomeVisibility();
const updateStatusBar = (): void => mainUiHelpers.updateStatusBar();

const statusCoords = document.getElementById('status-coords')!;

const mainViewerShell = createMainViewerShellController({
  canvas,
  container,
  dropOverlay,
  fileInput,
  files: loadedFiles,
  getHoveredSheet: () => nestHoveredSheet,
  getNestingMode: () => nestingMode,
  getShowGrid: () => showGrid,
  getZoomPanStartX: () => NP.zoomPanStartX,
  getZoomPanStartY: () => NP.zoomPanStartY,
  getZoomPanning: () => NP.zoomPanning,
  inspectorContent,
  loadSingleFile,
  mobileBackdrop,
  nestingPanel,
  onExitNesting: exitNestingMode,
  renderZoomSheet,
  renderer,
  setActiveFile,
  setShowGrid,
  setZoomPanX,
  setZoomPanY,
  setZoomPanning,
  shortcutsClose,
  shortcutsOverlay,
  sidebarFiles,
  sidebarInspector,
  statusCoords,
  syncWelcomeVisibility,
  updateNestingButtonState,
  updateStatusBar,
});

const { mobileUi, viewerActions, viewportScene } = mainViewerShell;

const mainToolbarBridge = createMainToolbarBridgeController({
  authSessionToken,
  getAuthHeaders,
  loadedFiles,
  renderCatalogFilter,
  renderFileList,
  recalcTotals,
  saveGuestDraft,
  selectedCatalogIds,
  showCatalogAddAuthRequiredMessage: () => t('catalog.add.authRequired'),
  formatCatalogCreateErrorMessage: (error) => t('catalog.add.error', { msg: error instanceof Error ? error.message : String(error) }),
  promptCatalogName: () => prompt(t('catalog.add.prompt'))?.trim() ?? '',
  updateNestItems,
  workspaceCatalogs,
  isFileInSelectedCatalogs,
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
  openFileDialog: viewerActions.openFileDialog,
  toggleGrid: viewerActions.toggleGrid,
  runTelegramLoginFlow,
  logoutWorkspace,
  getVisibleFiles: () => mainToolbarBridge.getVisibleFiles(),
  isAuthenticated: () => mainToolbarBridge.isAuthenticated(),
  getAuthHeaders,
  getCatalogIdsForBulkAction: () => mainToolbarBridge.getCatalogIdsForBulkAction(),
  onBulkCheckApplied: () => mainToolbarBridge.onBulkCheckApplied(),
  showAuthHint,
  promptCatalogName: () => mainToolbarBridge.promptCatalogName(),
  createCatalog: (name) => mainToolbarBridge.createCatalog(name),
  onCatalogCreated: (catalog) => mainToolbarBridge.onCatalogCreated(catalog),
  getCurrentNestResult: () => currentNestResult,
  exportFullNestingDXF,
  exportAllSheetsDXF,
  copyAllHashes,
  getCatalogAuthRequiredMessage: () => mainToolbarBridge.getCatalogAuthRequiredMessage(),
  getCatalogCreateErrorMessage: (error) => mainToolbarBridge.getCatalogCreateErrorMessage(error),
});

// ─── Init callbacks ───────────────────────────────────────────────────

initMainModuleCallbacks({
  updateAuthUi,
  renderCatalogFilter,
  renderFileList,
  recalcTotals,
  updateNestItems,
  computeStatsFromBuffer,
  setActiveFile,
  reloadWorkspaceLibraryFromServer,
  syncWelcomeVisibility,
  toggleFileChecked,
});

// ─── Resize ───────────────────────────────────────────────────────────

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
