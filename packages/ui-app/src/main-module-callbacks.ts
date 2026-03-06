import { initAuthCallbacks } from './auth.js';
import { initWorkspaceCallbacks, removeFile } from './workspace.js';
import { initSidebarCallbacks } from './sidebar.js';
import type { LoadedFile, UICuttingStats } from './types.js';

export function initMainModuleCallbacks(input: {
  updateAuthUi: () => void;
  renderCatalogFilter: () => void;
  renderFileList: () => void;
  recalcTotals: () => void;
  updateNestItems: () => void;
  computeStatsFromBuffer: (base64: string, doc: LoadedFile['doc']) => Promise<UICuttingStats>;
  setActiveFile: (id: number) => void;
  reloadWorkspaceLibraryFromServer: () => Promise<void>;
  syncWelcomeVisibility: () => void;
  toggleFileChecked: (id: number) => Promise<void>;
}): void {
  const {
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
  } = input;

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
}
