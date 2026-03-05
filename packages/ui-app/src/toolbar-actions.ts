import { apiPostBlob, apiPostJSON, downloadBlob } from './api.js';
import type { MobileUiController } from './mobile-ui.js';
import type { LoadedFile, WorkspaceCatalog } from './types.js';

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

  btnOpen.addEventListener('click', openFileDialog);
  btnWelcomeOpen.addEventListener('click', openFileDialog);
  btnAddFiles.addEventListener('click', openFileDialog);

  btnFit.addEventListener('click', () => {
    renderer.zoomToFit();
    updateStatusBar();
  });

  btnInspector.addEventListener('click', () => {
    if (mobileUi.isMobile()) {
      const isOpen = sidebarInspector.classList.contains('mobile-open');
      mobileUi.closePanels();
      if (!isOpen) mobileUi.openPanel(sidebarInspector);
    } else {
      sidebarInspector.classList.toggle('hidden');
      renderer.resizeToContainer();
    }
  });

  btnGrid.addEventListener('click', toggleGrid);

  chkPierces.addEventListener('change', () => {
    renderer.showPiercePoints = chkPierces.checked;
    pierceToggle.classList.toggle('on', chkPierces.checked);
  });

  chkDimensions.addEventListener('change', () => {
    renderer.showDimensions = chkDimensions.checked;
    dimToggle.classList.toggle('on', chkDimensions.checked);
  });

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
