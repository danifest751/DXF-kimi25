import type { NormalizedDocument } from '../../core-engine/src/normalize/index.js';
import type { WorkspaceFileMeta } from './auth.js';
import type { LoadedFile, UICuttingStats, WorkspaceCatalog } from './types.js';

export interface WorkspaceLibraryTree {
  readonly catalogs: WorkspaceCatalog[];
  readonly files: WorkspaceFileMeta[];
}

export async function reloadWorkspaceTree(input: {
  tree: WorkspaceLibraryTree;
  workspaceCatalogs: WorkspaceCatalog[];
  selectedCatalogIds: Set<string>;
  loadedFiles: LoadedFile[];
  uncategorizedCatalogId: string;
  bumpNextFileId: () => number;
  clearActiveWorkspaceView: () => void;
  setActiveFile: (id: number) => void;
  refreshWorkspaceView: () => void;
  refreshFileMetrics: () => void;
  refreshFileListOnly: () => void;
  loadRemoteWorkspaceFile: (meta: WorkspaceFileMeta) => Promise<LoadedFile>;
}): Promise<void> {
  const {
    tree,
    workspaceCatalogs,
    selectedCatalogIds,
    loadedFiles,
    uncategorizedCatalogId,
    bumpNextFileId,
    clearActiveWorkspaceView,
    setActiveFile,
    refreshWorkspaceView,
    refreshFileMetrics,
    refreshFileListOnly,
    loadRemoteWorkspaceFile,
  } = input;

  applyWorkspaceTreeState({
    tree,
    workspaceCatalogs,
    selectedCatalogIds,
    loadedFiles,
    uncategorizedCatalogId,
  });
  createLoadingPlaceholders({ tree, loadedFiles, bumpNextFileId });
  syncInitialWorkspaceTreeView({ loadedFiles, clearActiveWorkspaceView, setActiveFile, refreshWorkspaceView });
  await hydrateWorkspaceTreeFiles({
    tree,
    loadedFiles,
    setActiveFile,
    refreshFileMetrics,
    refreshFileListOnly,
    loadRemoteWorkspaceFile,
  });
  window.dispatchEvent(new CustomEvent('dxf-files-updated', { detail: { added: 0, batchDone: true } }));
}

function applyWorkspaceTreeState(input: {
  tree: WorkspaceLibraryTree;
  workspaceCatalogs: WorkspaceCatalog[];
  selectedCatalogIds: Set<string>;
  loadedFiles: LoadedFile[];
  uncategorizedCatalogId: string;
}): void {
  const {
    tree,
    workspaceCatalogs,
    selectedCatalogIds,
    loadedFiles,
    uncategorizedCatalogId,
  } = input;

  workspaceCatalogs.splice(0, workspaceCatalogs.length, ...tree.catalogs);
  loadedFiles.splice(0, loadedFiles.length);

  selectedCatalogIds.clear();
  for (const catalog of workspaceCatalogs) selectedCatalogIds.add(catalog.id);
  if (tree.files.some((file) => file.catalogId === null)) selectedCatalogIds.add(uncategorizedCatalogId);
}

function createLoadingPlaceholders(input: {
  tree: WorkspaceLibraryTree;
  loadedFiles: LoadedFile[];
  bumpNextFileId: () => number;
}): void {
  const { tree, loadedFiles, bumpNextFileId } = input;
  const emptyStats: UICuttingStats = {
    totalPierces: 0,
    totalCutLength: 0,
    cuttingEntityCount: 0,
    chains: [],
  };

  for (const meta of tree.files) {
    const placeholder: LoadedFile = {
      id: bumpNextFileId(),
      remoteId: meta.id,
      workspaceId: meta.workspaceId,
      catalogId: meta.catalogId,
      name: meta.name,
      doc: null as unknown as NormalizedDocument,
      stats: emptyStats,
      checked: meta.checked,
      quantity: meta.quantity,
      loading: true,
    };
    loadedFiles.push(placeholder);
  }
}

function syncInitialWorkspaceTreeView(input: {
  loadedFiles: LoadedFile[];
  clearActiveWorkspaceView: () => void;
  setActiveFile: (id: number) => void;
  refreshWorkspaceView: () => void;
}): void {
  const {
    loadedFiles,
    clearActiveWorkspaceView,
    setActiveFile,
    refreshWorkspaceView,
  } = input;

  if (loadedFiles.length > 0) {
    setActiveFile(loadedFiles[0]!.id);
  } else {
    clearActiveWorkspaceView();
  }
  refreshWorkspaceView();
}

async function hydrateWorkspaceTreeFiles(input: {
  tree: WorkspaceLibraryTree;
  loadedFiles: LoadedFile[];
  setActiveFile: (id: number) => void;
  refreshFileMetrics: () => void;
  refreshFileListOnly: () => void;
  loadRemoteWorkspaceFile: (meta: WorkspaceFileMeta) => Promise<LoadedFile>;
}): Promise<void> {
  const {
    tree,
    loadedFiles,
    setActiveFile,
    refreshFileMetrics,
    refreshFileListOnly,
    loadRemoteWorkspaceFile,
  } = input;
  const concurrency = 4;
  let nextIdx = 0;
  let active = 0;

  await new Promise<void>((resolve) => {
    function startNext(): void {
      while (active < concurrency && nextIdx < tree.files.length) {
        const meta = tree.files[nextIdx]!;
        const placeholder = loadedFiles.find((file) => file.remoteId === meta.id);
        nextIdx++;
        active++;

        loadRemoteWorkspaceFile(meta)
          .then((loaded) => {
            if (placeholder) {
              placeholder.doc = loaded.doc;
              placeholder.stats = loaded.stats;
              placeholder.loading = false;
              placeholder.loadError = undefined;
              placeholder.sizeBytes = loaded.sizeBytes;
              if (placeholder.id === loadedFiles[0]?.id) {
                setActiveFile(placeholder.id);
              }
              refreshFileMetrics();
              window.dispatchEvent(new CustomEvent('dxf-file-ready', { detail: { fileId: placeholder.id } }));
            }
          })
          .catch((err) => {
            console.warn(`Failed to load file "${meta.name}":`, err);
            if (placeholder) {
              placeholder.loading = false;
              placeholder.loadError = err instanceof Error ? err.message : String(err);
              refreshFileListOnly();
            }
          })
          .finally(() => {
            active--;
            startNext();
            if (active === 0) resolve();
          });
      }
      if (active === 0) resolve();
    }

    startNext();
  });
}
