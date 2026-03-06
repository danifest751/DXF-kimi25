import { apiPostJSON } from './api.js';
import type { LoadedFile, WorkspaceCatalog } from './types.js';

export interface MainToolbarBridgeController {
  createCatalog(name: string): Promise<WorkspaceCatalog>;
  getCatalogAuthRequiredMessage(): string;
  getCatalogCreateErrorMessage(error: unknown): string;
  getCatalogIdsForBulkAction(): { catalogIds: string[]; includeUncategorized: boolean };
  getVisibleFiles(): LoadedFile[];
  isAuthenticated(): boolean;
  onBulkCheckApplied(): void;
  onCatalogCreated(catalog: WorkspaceCatalog): void;
  promptCatalogName(): string;
}

export function createMainToolbarBridgeController(input: {
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
}): MainToolbarBridgeController {
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
  } = input;

  function getVisibleFiles(): LoadedFile[] {
    return loadedFiles.filter((file) => isFileInSelectedCatalogs(file));
  }

  function isAuthenticated(): boolean {
    return authSessionToken.length > 0;
  }

  function getCatalogIdsForBulkAction(): { catalogIds: string[]; includeUncategorized: boolean } {
    return {
      catalogIds: [...selectedCatalogIds].filter((id) => id !== '__uncategorized__'),
      includeUncategorized: selectedCatalogIds.has('__uncategorized__'),
    };
  }

  function onBulkCheckApplied(): void {
    renderFileList();
    recalcTotals();
    updateNestItems();
    saveGuestDraft();
  }

  async function createCatalog(name: string): Promise<WorkspaceCatalog> {
    const response = await apiPostJSON<{ success: boolean; catalog: WorkspaceCatalog }>('/api/library-catalogs', {
      name,
    }, getAuthHeaders());
    return response.catalog;
  }

  function onCatalogCreated(catalog: WorkspaceCatalog): void {
    workspaceCatalogs.push(catalog);
    selectedCatalogIds.add(catalog.id);
    renderCatalogFilter();
    renderFileList();
  }

  return {
    createCatalog,
    getCatalogAuthRequiredMessage: () => showCatalogAddAuthRequiredMessage(),
    getCatalogCreateErrorMessage: (error) => formatCatalogCreateErrorMessage(error),
    getCatalogIdsForBulkAction,
    getVisibleFiles,
    isAuthenticated,
    onBulkCheckApplied,
    onCatalogCreated,
    promptCatalogName: () => promptCatalogName(),
  };
}
