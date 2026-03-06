import { apiPostBlob, apiPostJSON, downloadBlob } from './api.js';
import type { LoadedFile, WorkspaceCatalog } from './types.js';

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

  btnAuthLogin.addEventListener('click', () => {
    void runTelegramLoginFlow();
  });
  btnAuthLogout.addEventListener('click', () => {
    void logoutWorkspace();
  });

  btnSelectAllFiles.addEventListener('click', () => {
    const visible = getVisibleFiles();
    const hasUnchecked = visible.some((file) => !file.checked);
    for (const file of visible) file.checked = hasUnchecked;
    if (isAuthenticated()) {
      const { catalogIds, includeUncategorized } = getCatalogIdsForBulkAction();
      void apiPostJSON<{ success: boolean }>('/api/library-files-check-all', {
        checked: hasUnchecked,
        catalogIds: catalogIds && (catalogIds.length > 0 || includeUncategorized) ? catalogIds : undefined,
      }, getAuthHeaders()).catch((error) => console.error('Check all failed:', error));
    }
    onBulkCheckApplied();
  });

  btnAddCatalog.addEventListener('click', () => {
    if (!isAuthenticated()) {
      showAuthHint(getCatalogAuthRequiredMessage());
      return;
    }
    const name = promptCatalogName();
    if (!name) return;
    void createCatalog(name)
      .then((catalog) => onCatalogCreated(catalog))
      .catch((error) => alert(getCatalogCreateErrorMessage(error)));
  });

  btnExportDXF.addEventListener('click', exportFullNestingDXF);
  btnExportCSV.addEventListener('click', () => {
    const nestingResult = getCurrentNestResult();
    if (!nestingResult) return;
    void (async () => {
      try {
        const blob = await apiPostBlob('/api/export/csv', { nestingResult, fileName: 'nesting' }, getAuthHeaders());
        downloadBlob(blob, 'nesting.csv');
      } catch (error) {
        alert(`Ошибка экспорта CSV: ${error instanceof Error ? error.message : String(error)}`);
      }
    })();
  });

  btnExportAllSheets.addEventListener('click', exportAllSheetsDXF);
  btnCopyAllHashes.addEventListener('click', () => copyAllHashes(btnCopyAllHashes));
  btnCopyAllHashesTop.addEventListener('click', () => copyAllHashes(btnCopyAllHashesTop));
}
