import { createMainRuntimeUiController } from './main-runtime-ui.js';
import { createMainUiHelpersController } from './main-ui-helpers.js';
import { createMainViewerShellController } from './main-viewer-shell.js';
import type { LoadedFile, UICuttingStats } from './types.js';

export function createMainAppShellController(input: {
  btnNesting: HTMLButtonElement;
  nestingPanel: HTMLDivElement;
  getCuttingComputeMode: () => string;
  getNestingComputeMode: () => string;
  getNestingMode: () => boolean;
  setCuttingComputeMode: (mode: string) => void;
  computeCuttingStats: (doc: LoadedFile['doc']) => UICuttingStats;
  welcome: HTMLDivElement;
  renderer: import('../../core-engine/src/render/renderer.js').DXFRenderer;
  statusZoom: HTMLSpanElement;
  statusEntities: HTMLSpanElement;
  statusVersion: HTMLSpanElement;
  loadedFiles: LoadedFile[];
  renderFileList: () => void;
  setActiveFileId: (id: number) => void;
  updateUploadTargetHint: () => void;
  applyAuthUiState: (updateUploadTargetHint: () => void) => void;
  canvas: HTMLCanvasElement;
  container: HTMLDivElement;
  dropOverlay: HTMLDivElement;
  fileInput: HTMLInputElement;
  getHoveredSheet: () => number;
  getShowGrid: () => boolean;
  getZoomPanStartX: () => number;
  getZoomPanStartY: () => number;
  getZoomPanning: () => boolean;
  inspectorContent: HTMLDivElement;
  loadSingleFile: (file: File, setActiveFile: (id: number) => void) => Promise<void>;
  mobileBackdrop: HTMLDivElement;
  onExitNesting: () => void;
  renderZoomSheet: (sheetIndex: number) => void;
  setShowGrid: (value: boolean) => void;
  setZoomPanX: (value: number) => void;
  setZoomPanY: (value: number) => void;
  setZoomPanning: (value: boolean) => void;
  shortcutsClose: HTMLButtonElement;
  shortcutsOverlay: HTMLDivElement;
  sidebarFiles: HTMLElement;
  sidebarInspector: HTMLDivElement;
  statusCoords: HTMLElement;
}): {
  computeStatsFromBuffer(base64: string, doc: LoadedFile['doc']): Promise<UICuttingStats>;
  mobileUi: ReturnType<typeof createMainViewerShellController>['mobileUi'];
  setActiveFile(id: number): void;
  syncWelcomeVisibility(): void;
  updateAuthUi(): void;
  updateModeBadge(): void;
  updateNestingButtonState(): void;
  updateStatusBar(): void;
  viewerActions: ReturnType<typeof createMainViewerShellController>['viewerActions'];
  viewportScene: ReturnType<typeof createMainViewerShellController>['viewportScene'];
} {
  const mainRuntimeUi = createMainRuntimeUiController({
    btnNesting: input.btnNesting,
    nestingPanel: input.nestingPanel,
    getCuttingComputeMode: input.getCuttingComputeMode,
    getNestingComputeMode: input.getNestingComputeMode,
    getNestingMode: input.getNestingMode,
    setCuttingComputeMode: input.setCuttingComputeMode,
    computeCuttingStats: input.computeCuttingStats,
  });

  const mainUiHelpers = createMainUiHelpersController({
    welcome: input.welcome,
    renderer: input.renderer,
    statusZoom: input.statusZoom,
    statusEntities: input.statusEntities,
    statusVersion: input.statusVersion,
    loadedFiles: input.loadedFiles,
    renderFileList: input.renderFileList,
    setActiveFileId: input.setActiveFileId,
    updateUploadTargetHint: input.updateUploadTargetHint,
    applyAuthUiState: input.applyAuthUiState,
  });

  const mainViewerShell = createMainViewerShellController({
    canvas: input.canvas,
    container: input.container,
    dropOverlay: input.dropOverlay,
    fileInput: input.fileInput,
    files: input.loadedFiles,
    getHoveredSheet: input.getHoveredSheet,
    getNestingMode: input.getNestingMode,
    getShowGrid: input.getShowGrid,
    getZoomPanStartX: input.getZoomPanStartX,
    getZoomPanStartY: input.getZoomPanStartY,
    getZoomPanning: input.getZoomPanning,
    inspectorContent: input.inspectorContent,
    loadSingleFile: input.loadSingleFile,
    mobileBackdrop: input.mobileBackdrop,
    nestingPanel: input.nestingPanel,
    onExitNesting: input.onExitNesting,
    renderZoomSheet: input.renderZoomSheet,
    renderer: input.renderer,
    setActiveFile: (id) => mainUiHelpers.setActiveFile(id),
    setShowGrid: input.setShowGrid,
    setZoomPanX: input.setZoomPanX,
    setZoomPanY: input.setZoomPanY,
    setZoomPanning: input.setZoomPanning,
    shortcutsClose: input.shortcutsClose,
    shortcutsOverlay: input.shortcutsOverlay,
    sidebarFiles: input.sidebarFiles,
    sidebarInspector: input.sidebarInspector,
    statusCoords: input.statusCoords,
    syncWelcomeVisibility: () => mainUiHelpers.syncWelcomeVisibility(),
    updateNestingButtonState: () => mainRuntimeUi.updateNestingButtonState(),
    updateStatusBar: () => mainUiHelpers.updateStatusBar(),
  });

  return {
    computeStatsFromBuffer: (base64, doc) => mainRuntimeUi.computeStatsFromBuffer(base64, doc),
    mobileUi: mainViewerShell.mobileUi,
    setActiveFile: (id) => mainUiHelpers.setActiveFile(id),
    syncWelcomeVisibility: () => mainUiHelpers.syncWelcomeVisibility(),
    updateAuthUi: () => mainUiHelpers.updateAuthUi(),
    updateModeBadge: () => mainRuntimeUi.updateModeBadge(),
    updateNestingButtonState: () => mainRuntimeUi.updateNestingButtonState(),
    updateStatusBar: () => mainUiHelpers.updateStatusBar(),
    viewerActions: mainViewerShell.viewerActions,
    viewportScene: mainViewerShell.viewportScene,
  };
}
