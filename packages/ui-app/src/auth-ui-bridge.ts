import type { LoadedFile } from './types.js';

export type AuthVoidFn = () => void;
export type AuthAsyncVoidFn = () => Promise<void>;

export interface AuthUiBridgeCallbacks {
  computeStats: (base64: string, doc: LoadedFile['doc']) => Promise<LoadedFile['stats']>;
  recalcTotals: AuthVoidFn;
  reloadFromServer: AuthAsyncVoidFn;
  renderCatalogFilter: AuthVoidFn;
  renderFileList: AuthVoidFn;
  setActiveFile: (id: number) => void;
  updateAuthUi: AuthVoidFn;
  updateNestItems: AuthVoidFn;
}

export interface AuthUiBridgeController {
  computeStats(base64: string, doc: LoadedFile['doc']): Promise<LoadedFile['stats']>;
  init(callbacks: AuthUiBridgeCallbacks): void;
  refreshWorkspaceViews(): void;
  reloadFromServer(): Promise<void>;
  setActiveFile(id: number): void;
  updateAuthUi(): void;
}

export function createAuthUiBridgeController(input: {
  computeStats: (base64: string, doc: LoadedFile['doc']) => Promise<LoadedFile['stats']>;
}): AuthUiBridgeController {
  let updateAuthUi: AuthVoidFn = () => {};
  let renderCatalogFilter: AuthVoidFn = () => {};
  let renderFileList: AuthVoidFn = () => {};
  let recalcTotals: AuthVoidFn = () => {};
  let updateNestItems: AuthVoidFn = () => {};
  let setActiveFile: (id: number) => void = () => {};
  let reloadFromServer: AuthAsyncVoidFn = async () => {};
  let computeStats = input.computeStats;

  function init(callbacks: AuthUiBridgeCallbacks): void {
    updateAuthUi = callbacks.updateAuthUi;
    renderCatalogFilter = callbacks.renderCatalogFilter;
    renderFileList = callbacks.renderFileList;
    recalcTotals = callbacks.recalcTotals;
    updateNestItems = callbacks.updateNestItems;
    computeStats = callbacks.computeStats;
    setActiveFile = callbacks.setActiveFile;
    reloadFromServer = callbacks.reloadFromServer;
  }

  function refreshWorkspaceViews(): void {
    renderCatalogFilter();
    renderFileList();
    recalcTotals();
    updateNestItems();
  }

  return {
    computeStats: (base64, doc) => computeStats(base64, doc),
    init,
    refreshWorkspaceViews,
    reloadFromServer: () => reloadFromServer(),
    setActiveFile: (id) => setActiveFile(id),
    updateAuthUi: () => updateAuthUi(),
  };
}
