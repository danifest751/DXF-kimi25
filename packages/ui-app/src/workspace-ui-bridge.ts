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
  let refreshFrameId: number | null = null;
  let pendingCatalogFilter = false;
  let pendingFileList = false;
  let pendingTotals = false;
  let pendingNestItems = false;
  let pendingWelcome = false;

  function init(callbacks: WorkspaceUiBridgeCallbacks): void {
    renderCatalogFilter = callbacks.renderCatalogFilter;
    renderFileList = callbacks.renderFileList;
    recalcTotals = callbacks.recalcTotals;
    updateNestItems = callbacks.updateNestItems;
    setActiveFile = callbacks.setActiveFile;
    syncWelcomeVisibility = callbacks.syncWelcomeVisibility;
    computeStats = callbacks.computeStats;
  }

  function scheduleRefresh(): void {
    if (refreshFrameId !== null) return;
    refreshFrameId = window.requestAnimationFrame(() => {
      refreshFrameId = null;
      if (pendingCatalogFilter) renderCatalogFilter();
      if (pendingFileList) renderFileList();
      if (pendingTotals) recalcTotals();
      if (pendingNestItems) updateNestItems();
      if (pendingWelcome) syncWelcomeVisibility();
      pendingCatalogFilter = false;
      pendingFileList = false;
      pendingTotals = false;
      pendingNestItems = false;
      pendingWelcome = false;
    });
  }

  function refreshCatalogSelectionViews(): void {
    pendingCatalogFilter = true;
    pendingFileList = true;
    pendingTotals = true;
    pendingNestItems = true;
    scheduleRefresh();
  }

  function refreshFileListOnly(): void {
    pendingFileList = true;
    scheduleRefresh();
  }

  function refreshFileMetrics(): void {
    pendingFileList = true;
    pendingTotals = true;
    pendingNestItems = true;
    scheduleRefresh();
  }

  function refreshWorkspaceView(): void {
    pendingCatalogFilter = true;
    pendingFileList = true;
    pendingTotals = true;
    pendingNestItems = true;
    pendingWelcome = true;
    scheduleRefresh();
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
