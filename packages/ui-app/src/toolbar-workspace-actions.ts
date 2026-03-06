import type { LoadedFile, WorkspaceCatalog } from './types.js';
import { createToolbarWorkspaceCommands } from './toolbar-workspace-commands.js';

export function initToolbarWorkspaceActions(input: {
  btnAuthLogin: HTMLButtonElement;
  btnAuthLogout: HTMLButtonElement;
  btnSelectAllFiles: HTMLButtonElement;
  btnAddCatalog: HTMLButtonElement;
  btnExportDXF: HTMLButtonElement;
  btnExportCSV: HTMLButtonElement;
  btnExportAllSheets: HTMLButtonElement;
  btnCopyAllHashes: HTMLButtonElement;
  btnCopyAllHashesTop: HTMLButtonElement;
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
  } = input;

  const toolbarWorkspaceCommands = createToolbarWorkspaceCommands({
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
    getCatalogAuthRequiredMessage,
    getCatalogCreateErrorMessage,
  });

  btnAuthLogin.addEventListener('click', () => {
    void runTelegramLoginFlow();
  });
  btnAuthLogout.addEventListener('click', () => {
    void logoutWorkspace();
  });

  btnSelectAllFiles.addEventListener('click', () => {
    toolbarWorkspaceCommands.applyBulkCheckToggle();
  });

  btnAddCatalog.addEventListener('click', () => {
    toolbarWorkspaceCommands.handleAddCatalog();
  });

  btnExportDXF.addEventListener('click', exportFullNestingDXF);
  btnExportCSV.addEventListener('click', () => {
    void toolbarWorkspaceCommands.exportCsv();
  });

  btnExportAllSheets.addEventListener('click', exportAllSheetsDXF);
  btnCopyAllHashes.addEventListener('click', () => copyAllHashes(btnCopyAllHashes));
  btnCopyAllHashesTop.addEventListener('click', () => copyAllHashes(btnCopyAllHashesTop));
}
