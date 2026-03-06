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
import { initMainNestingShell } from './main-nesting-shell.js';
import { initMainToolbarShell } from './main-toolbar-shell.js';
import { createMainAppShellController } from './main-app-shell.js';
import { initMainShellUi } from './main-shell-ui.js';
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

const statusCoords = document.getElementById('status-coords')!;
const mainAppShell = createMainAppShellController({
  btnNesting,
  nestingPanel,
  getCuttingComputeMode: () => cuttingComputeMode,
  getNestingComputeMode: () => nestingComputeMode,
  getNestingMode: () => nestingMode,
  setCuttingComputeMode,
  computeCuttingStats,
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
  canvas,
  container,
  dropOverlay,
  fileInput,
  getHoveredSheet: () => nestHoveredSheet,
  getShowGrid: () => showGrid,
  getZoomPanStartX: () => NP.zoomPanStartX,
  getZoomPanStartY: () => NP.zoomPanStartY,
  getZoomPanning: () => NP.zoomPanning,
  inspectorContent,
  loadSingleFile,
  mobileBackdrop,
  onExitNesting: exitNestingMode,
  renderZoomSheet,
  setShowGrid,
  setZoomPanX,
  setZoomPanY,
  setZoomPanning,
  shortcutsClose,
  shortcutsOverlay,
  sidebarFiles,
  sidebarInspector,
  statusCoords,
});

const updateModeBadge = (): void => mainAppShell.updateModeBadge();
const updateAuthUi = (): void => mainAppShell.updateAuthUi();
const setActiveFile = (id: number): void => mainAppShell.setActiveFile(id);
const syncWelcomeVisibility = (): void => mainAppShell.syncWelcomeVisibility();
const updateStatusBar = (): void => mainAppShell.updateStatusBar();
const updateNestingButtonState = (): void => mainAppShell.updateNestingButtonState();
const computeStatsFromBuffer = (base64: string, doc: LoadedFile['doc']): Promise<UICuttingStats> => mainAppShell.computeStatsFromBuffer(base64, doc);

updateModeBadge();

const { mobileUi, viewerActions, viewportScene } = mainAppShell;

initMainToolbarShell({
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
  showAuthHint,
  getCurrentNestResult: () => currentNestResult,
  exportFullNestingDXF,
  exportAllSheetsDXF,
  copyAllHashes,
  updateAuthUi,
  computeStatsFromBuffer,
  setActiveFile,
  reloadWorkspaceLibraryFromServer,
  syncWelcomeVisibility,
  toggleFileChecked,
});

// ─── Resize ───────────────────────────────────────────────────────────

// ─── Nesting panel ────────────────────────────────────────────────────

initMainNestingShell({
  container,
  nestingScroll,
  nestZoomCanvas,
  nestZoomPopup,
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
