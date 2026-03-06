import { apiPostBlob, apiPostJSON, downloadBlob } from './api.js';
import type { LoadedFile, WorkspaceCatalog } from './types.js';

export function createToolbarWorkspaceCommands(input: {
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
  getCatalogAuthRequiredMessage: () => string;
  getCatalogCreateErrorMessage: (error: unknown) => string;
}): {
  applyBulkCheckToggle(): void;
  handleAddCatalog(): void;
  exportCsv(): Promise<void>;
} {
  const {
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
  } = input;

  function applyBulkCheckToggle(): void {
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
  }

  function handleAddCatalog(): void {
    if (!isAuthenticated()) {
      showAuthHint(getCatalogAuthRequiredMessage());
      return;
    }
    const name = promptCatalogName();
    if (!name) return;
    void createCatalog(name)
      .then((catalog) => onCatalogCreated(catalog))
      .catch((error) => alert(getCatalogCreateErrorMessage(error)));
  }

  async function exportCsv(): Promise<void> {
    const nestingResult = getCurrentNestResult();
    if (!nestingResult) return;
    try {
      const blob = await apiPostBlob('/api/export/csv', { nestingResult, fileName: 'nesting' }, getAuthHeaders());
      downloadBlob(blob, 'nesting.csv');
    } catch (error) {
      alert(`Ошибка экспорта CSV: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  return {
    applyBulkCheckToggle,
    handleAddCatalog,
    exportCsv,
  };
}
