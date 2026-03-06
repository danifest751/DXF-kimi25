import type { DXFRenderer } from '../../core-engine/src/render/renderer.js';
import { createCanvasInteractionController } from './canvas-interaction.js';
import { createFileIngestController } from './file-ingest.js';
import { createInspectorPanelController } from './inspector-panel.js';
import { createMobileUiController, type MobileUiController } from './mobile-ui.js';
import type { LoadedFile } from './types.js';
import { createViewportSceneController, type ViewportSceneController } from './viewport-scene.js';
import { createViewerActionsController, type ViewerActionsController } from './viewer-actions.js';

export interface MainViewerShellController {
  readonly mobileUi: MobileUiController;
  readonly viewerActions: ViewerActionsController;
  readonly viewportScene: ViewportSceneController;
}

export function createMainViewerShellController(input: {
  canvas: HTMLCanvasElement;
  container: HTMLDivElement;
  dropOverlay: HTMLDivElement;
  fileInput: HTMLInputElement;
  files: LoadedFile[];
  getHoveredSheet: () => number;
  getNestingMode: () => boolean;
  getShowGrid: () => boolean;
  getZoomPanStartX: () => number;
  getZoomPanStartY: () => number;
  getZoomPanning: () => boolean;
  inspectorContent: HTMLDivElement;
  loadSingleFile: (file: File, setActiveFile: (id: number) => void) => Promise<void>;
  mobileBackdrop: HTMLDivElement;
  nestingPanel: HTMLElement;
  onExitNesting: () => void;
  renderZoomSheet: (sheetIndex: number) => void;
  renderer: DXFRenderer;
  setActiveFile: (id: number) => void;
  setShowGrid: (value: boolean) => void;
  setZoomPanX: (value: number) => void;
  setZoomPanY: (value: number) => void;
  setZoomPanning: (value: boolean) => void;
  shortcutsClose: HTMLButtonElement;
  shortcutsOverlay: HTMLDivElement;
  sidebarFiles: HTMLElement;
  sidebarInspector: HTMLDivElement;
  statusCoords: HTMLElement;
  syncWelcomeVisibility: () => void;
  updateNestingButtonState: () => void;
  updateStatusBar: () => void;
}): MainViewerShellController {
  const {
    canvas,
    container,
    dropOverlay,
    fileInput,
    files,
    getHoveredSheet,
    getNestingMode,
    getShowGrid,
    getZoomPanStartX,
    getZoomPanStartY,
    getZoomPanning,
    inspectorContent,
    loadSingleFile,
    mobileBackdrop,
    nestingPanel,
    onExitNesting,
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
  } = input;

  const viewportScene = createViewportSceneController({
    container,
    files,
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
    files,
    loadSingleFile,
    setActiveFile,
    syncWelcomeVisibility,
    viewportScene,
  });

  createCanvasInteractionController({
    canvas,
    renderer,
    inspectorPanel,
    statusCoords,
    updateStatusBar,
    getZoomPanning,
    getZoomPanStartX,
    getZoomPanStartY,
    getHoveredSheet,
    renderZoomSheet,
    setZoomPanX,
    setZoomPanY,
    setZoomPanning,
  });

  const viewerActions = createViewerActionsController({
    fileIngest,
    inspectorPanel,
    renderer,
    updateStatusBar,
    getShowGrid,
    setShowGrid,
  });

  const mobileUi = createMobileUiController({
    mobileBackdrop,
    sidebarFiles,
    sidebarInspector,
    nestingPanel,
    shortcutsOverlay,
    shortcutsClose,
    updateNestingButtonState,
    onOpenFileDialog: viewerActions.openFileDialog,
    onZoomToFit: viewerActions.zoomToFit,
    onToggleGrid: viewerActions.toggleGrid,
    onExitNesting,
    onClearSelection: viewerActions.clearSelection,
    getNestingMode,
  });

  return {
    mobileUi,
    viewerActions,
    viewportScene,
  };
}
