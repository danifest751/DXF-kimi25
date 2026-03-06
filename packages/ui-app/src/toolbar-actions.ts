import type { MobileUiController } from './mobile-ui.js';
import type { LoadedFile, WorkspaceCatalog } from './types.js';
import { initToolbarViewActions } from './toolbar-view-actions.js';
import { initToolbarWorkspaceActions } from './toolbar-workspace-actions.js';

export function initToolbarActions(input: {
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
  getVisibleFiles: () => LoadedFile[];
  isAuthenticated: () => boolean;
  getAuthHeaders: () => Record<string, string>;
  getCatalogIdsForBulkAction: () => { catalogIds: string[] | undefined; includeUncategorized: boolean };
  onBulkCheckApplied: () => void;
  showAuthHint: (message: string) => void;
  promptCatalogName: () => string;
  createCatalog: (name: string) => Promise<WorkspaceCatalog>;
  onCatalogCreated: (catalog: WorkspaceCatalog) => void;
  getCurrentNestResult: () => unknown;
  exportFullNestingDXF: () => void;
  exportAllSheetsDXF: () => void;
  copyAllHashes: (button: HTMLButtonElement) => void;
  getCatalogAuthRequiredMessage: () => string;
  getCatalogCreateErrorMessage: (error: unknown) => string;
}): void {
  const {
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
    getVisibleFiles,
    isAuthenticated,
    getAuthHeaders,
    getCatalogIdsForBulkAction,
    onBulkCheckApplied,
    showAuthHint,
    promptCatalogName,
    createCatalog,
    onCatalogCreated,
    getCurrentNestResult,
    exportFullNestingDXF,
    exportAllSheetsDXF,
    copyAllHashes,
    getCatalogAuthRequiredMessage,
    getCatalogCreateErrorMessage,
  } = input;

  initToolbarViewActions({
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
    sidebarInspector,
    renderer,
    mobileUi,
    updateStatusBar,
    openFileDialog,
    toggleGrid,
  });

  initToolbarWorkspaceActions({
    btnAuthLogin,
    btnAuthLogout,
    btnSelectAllFiles,
    btnAddCatalog,
    btnExportDXF,
    btnExportCSV,
    btnExportAllSheets,
    btnCopyAllHashes,
    btnCopyAllHashesTop,
    runTelegramLoginFlow,
    logoutWorkspace,
    getVisibleFiles,
    isAuthenticated,
    getAuthHeaders,
    getCatalogIdsForBulkAction,
    onBulkCheckApplied,
    showAuthHint,
    promptCatalogName,
    createCatalog,
    onCatalogCreated,
    getCurrentNestResult,
    exportFullNestingDXF,
    exportAllSheetsDXF,
    copyAllHashes,
    getCatalogAuthRequiredMessage,
    getCatalogCreateErrorMessage,
  });
}
