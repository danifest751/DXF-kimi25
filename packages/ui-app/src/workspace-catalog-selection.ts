import type { LoadedFile, WorkspaceCatalog } from './types.js';

export interface WorkspaceCatalogSelectionController {
  ensureSelectedCatalogsDefaults(): void;
  fileCatalogKey(file: Pick<LoadedFile, 'catalogId'>): string;
  getPreferredUploadCatalogId(): string | null;
  isFileInSelectedCatalogs(file: LoadedFile): boolean;
  selectAllCatalogsForCurrentData(): void;
}

export function createWorkspaceCatalogSelectionController(input: {
  selectedCatalogIds: Set<string>;
  workspaceCatalogs: WorkspaceCatalog[];
  loadedFiles: LoadedFile[];
  uncategorizedCatalogId: string;
}): WorkspaceCatalogSelectionController {
  const {
    selectedCatalogIds,
    workspaceCatalogs,
    loadedFiles,
    uncategorizedCatalogId,
  } = input;

  function fileCatalogKey(file: Pick<LoadedFile, 'catalogId'>): string {
    return file.catalogId ?? uncategorizedCatalogId;
  }

  function getPreferredUploadCatalogId(): string | null {
    if (selectedCatalogIds.size !== 1) return null;
    const [id] = [...selectedCatalogIds];
    if (!id || id === uncategorizedCatalogId) return null;
    return id;
  }

  function selectAllCatalogsForCurrentData(): void {
    selectedCatalogIds.clear();
    for (const catalog of workspaceCatalogs) selectedCatalogIds.add(catalog.id);
    if (loadedFiles.some((file) => file.catalogId === null)) {
      selectedCatalogIds.add(uncategorizedCatalogId);
    }
  }

  function ensureSelectedCatalogsDefaults(): void {
    if (selectedCatalogIds.size > 0) return;
    selectAllCatalogsForCurrentData();
  }

  function isFileInSelectedCatalogs(file: LoadedFile): boolean {
    ensureSelectedCatalogsDefaults();
    return selectedCatalogIds.has(fileCatalogKey(file));
  }

  return {
    ensureSelectedCatalogsDefaults,
    fileCatalogKey,
    getPreferredUploadCatalogId,
    isFileInSelectedCatalogs,
    selectAllCatalogsForCurrentData,
  };
}
