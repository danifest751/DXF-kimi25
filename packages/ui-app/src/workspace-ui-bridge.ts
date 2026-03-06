import type { LoadedFile, UICuttingStats } from './types.js';

export type WorkspaceVoidFn = () => void;

export interface WorkspaceUiBridgeCallbacks {
  computeStats: (base64: string, doc: LoadedFile['doc']) => Promise<UICuttingStats>;
  recalcTotals: WorkspaceVoidFn;
  renderCatalogFilter: WorkspaceVoidFn;
  renderFileList: WorkspaceVoidFn;
  setActiveFile: (id: number) => void;
  syncWelcomeVisibility: WorkspaceVoidFn;
  updateNestItems: WorkspaceVoidFn;
}

export interface WorkspaceUiBridgeController {
  computeStats(base64: string, doc: LoadedFile['doc']): Promise<UICuttingStats>;
  init(callbacks: WorkspaceUiBridgeCallbacks): void;
  refreshCatalogSelectionViews(): void;
  refreshFileListOnly(): void;
  refreshFileMetrics(): void;
  refreshWorkspaceView(): void;
  setActiveFile(id: number): void;
  syncWelcomeVisibility(): void;
}

export function createWorkspaceUiBridgeController(input: {
  computeStats: (base64: string, doc: LoadedFile['doc']) => Promise<UICuttingStats>;
}): WorkspaceUiBridgeController {
  let renderCatalogFilter: WorkspaceVoidFn = () => {};
  let renderFileList: WorkspaceVoidFn = () => {};
  let recalcTotals: WorkspaceVoidFn = () => {};
  let updateNestItems: WorkspaceVoidFn = () => {};
  let setActiveFile: (id: number) => void = () => {};
  let syncWelcomeVisibility: WorkspaceVoidFn = () => {};
  let computeStats = input.computeStats;

  function init(callbacks: WorkspaceUiBridgeCallbacks): void {
    renderCatalogFilter = callbacks.renderCatalogFilter;
    renderFileList = callbacks.renderFileList;
    recalcTotals = callbacks.recalcTotals;
    updateNestItems = callbacks.updateNestItems;
    setActiveFile = callbacks.setActiveFile;
    syncWelcomeVisibility = callbacks.syncWelcomeVisibility;
    computeStats = callbacks.computeStats;
  }

  function refreshCatalogSelectionViews(): void {
    renderCatalogFilter();
    renderFileList();
    recalcTotals();
    updateNestItems();
  }

  function refreshFileListOnly(): void {
    renderFileList();
  }

  function refreshFileMetrics(): void {
    renderFileList();
    recalcTotals();
    updateNestItems();
  }

  function refreshWorkspaceView(): void {
    refreshCatalogSelectionViews();
    syncWelcomeVisibility();
  }

  return {
    computeStats: (base64, doc) => computeStats(base64, doc),
    init,
    refreshCatalogSelectionViews,
    refreshFileListOnly,
    refreshFileMetrics,
    refreshWorkspaceView,
    setActiveFile: (id) => setActiveFile(id),
    syncWelcomeVisibility: () => syncWelcomeVisibility(),
  };
}
