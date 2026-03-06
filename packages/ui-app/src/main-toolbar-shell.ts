import type { MobileUiController } from './mobile-ui.js';
import { initMainModuleCallbacks } from './main-module-callbacks.js';
import {
  createMainToolbarBridgeController,
  type MainToolbarBridgeController,
} from './main-toolbar-bridge.js';
import { initToolbarActions } from './toolbar-actions.js';
import type { LoadedFile, UICuttingStats, WorkspaceCatalog } from './types.js';

export function initMainToolbarShell(input: {
  authSessionToken: string;
  getAuthHeaders: () => Record<string, string>;
  loadedFiles: LoadedFile[];
  renderCatalogFilter: () => void;
  renderFileList: () => void;
  recalcTotals: () => void;
  saveGuestDraft: () => void;
  selectedCatalogIds: Set<string>;
  showCatalogAddAuthRequiredMessage: () => string;
  formatCatalogCreateErrorMessage: (error: unknown) => string;
  promptCatalogName: () => string;
  updateNestItems: () => void;
  workspaceCatalogs: WorkspaceCatalog[];
  isFileInSelectedCatalogs: (file: LoadedFile) => boolean;
  btnOpen: HTMLButtonElement;
  btnWelcomeOpen: HTMLButtonElement;
  btnAddFiles: HTMLButtonElement;
  btnFit: HTMLButtonElement;
  btnInspector: HTMLButtonElement;
  btnGrid: HTMLButtonElement;
  chkPierces: HTMLInputElement;
  pierceToggle: HTMLLabelElement;
  chkDimensions: HTMLInputElement;
  dimToggle: HTMLLabelElement;
  btnAuthLogin: HTMLButtonElement;
  btnAuthLogout: HTMLButtonElement;
  btnSelectAllFiles: HTMLButtonElement;
  btnAddCatalog: HTMLButtonElement;
  btnExportDXF: HTMLButtonElement;
  btnExportCSV: HTMLButtonElement;
  btnExportAllSheets: HTMLButtonElement;
  btnCopyAllHashes: HTMLButtonElement;
  btnCopyAllHashesTop: HTMLButtonElement;
  sidebarInspector: HTMLDivElement;
  renderer: import('../../core-engine/src/render/renderer.js').DXFRenderer;
  mobileUi: MobileUiController;
  updateStatusBar: () => void;
  openFileDialog: () => void;
  toggleGrid: () => void;
  runTelegramLoginFlow: () => Promise<void>;
  logoutWorkspace: () => Promise<void>;
  showAuthHint: (message: string) => void;
  getCurrentNestResult: () => unknown;
  exportFullNestingDXF: () => void;
  exportAllSheetsDXF: () => void;
  copyAllHashes: (button: HTMLButtonElement) => void;
  updateAuthUi: () => void;
  computeStatsFromBuffer: (base64: string, doc: LoadedFile['doc']) => Promise<UICuttingStats>;
  setActiveFile: (id: number) => void;
  reloadWorkspaceLibraryFromServer: () => Promise<void>;
  syncWelcomeVisibility: () => void;
  toggleFileChecked: (id: number) => Promise<void>;
}): void {
  const {
    authSessionToken,
    getAuthHeaders,
    loadedFiles,
    renderCatalogFilter,
    renderFileList,
    recalcTotals,
    saveGuestDraft,
    selectedCatalogIds,
    showCatalogAddAuthRequiredMessage,
    formatCatalogCreateErrorMessage,
    promptCatalogName,
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
    openFileDialog,
    toggleGrid,
    runTelegramLoginFlow,
    logoutWorkspace,
    showAuthHint,
    getCurrentNestResult,
    exportFullNestingDXF,
    exportAllSheetsDXF,
    copyAllHashes,
    updateAuthUi,
    computeStatsFromBuffer,
    setActiveFile,
    reloadWorkspaceLibraryFromServer,
    syncWelcomeVisibility,
    toggleFileChecked,
  } = input;

  const mainToolbarBridge: MainToolbarBridgeController = createMainToolbarBridgeController({
    authSessionToken,
    getAuthHeaders,
    loadedFiles,
    renderCatalogFilter,
    renderFileList,
    recalcTotals,
    saveGuestDraft,
    selectedCatalogIds,
    showCatalogAddAuthRequiredMessage,
    formatCatalogCreateErrorMessage,
    promptCatalogName,
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
    openFileDialog,
    toggleGrid,
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
    getCurrentNestResult,
    exportFullNestingDXF,
    exportAllSheetsDXF,
    copyAllHashes,
    getCatalogAuthRequiredMessage: () => mainToolbarBridge.getCatalogAuthRequiredMessage(),
    getCatalogCreateErrorMessage: (error) => mainToolbarBridge.getCatalogCreateErrorMessage(error),
  });

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
}
