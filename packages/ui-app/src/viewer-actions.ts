import type { DXFRenderer } from '../../core-engine/src/render/renderer.js';
import type { FileIngestController } from './file-ingest.js';
import type { InspectorPanelController } from './inspector-panel.js';

export interface ViewerActionsController {
  clearSelection(): void;
  openFileDialog(): void;
  toggleGrid(): void;
  zoomToFit(): void;
}

export function createViewerActionsController(input: {
  fileIngest: FileIngestController;
  inspectorPanel: InspectorPanelController;
  renderer: DXFRenderer;
  updateStatusBar: () => void;
  getShowGrid: () => boolean;
  setShowGrid: (value: boolean) => void;
}): ViewerActionsController {
  const {
    fileIngest,
    inspectorPanel,
    renderer,
    updateStatusBar,
    getShowGrid,
    setShowGrid,
  } = input;

  function openFileDialog(): void {
    fileIngest.openFileDialog();
  }

  function zoomToFit(): void {
    renderer.zoomToFit();
    updateStatusBar();
  }

  function toggleGrid(): void {
    setShowGrid(!getShowGrid());
    renderer.requestRedraw();
  }

  function clearSelection(): void {
    renderer.clearSelection();
    inspectorPanel.clearInspector();
  }

  return {
    clearSelection,
    openFileDialog,
    toggleGrid,
    zoomToFit,
  };
}
