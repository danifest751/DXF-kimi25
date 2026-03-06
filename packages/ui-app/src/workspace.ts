/**
 * @module workspace
 * CRUD операции с каталогами и файлами workspace.
 * Загрузка/удаление файлов, reload библиотеки с сервера.
 */

import { apiGetJSON } from './api.js';
import type { LoadedFile, UICuttingStats, WorkspaceCatalog } from './types.js';
import {
  authSessionToken, UNCATEGORIZED_CATALOG_ID,
  workspaceCatalogs, selectedCatalogIds, loadedFiles,
  activeFileId, bumpNextFileId, setActiveFileId,
} from './state.js';
import {
  progressBar, progressFill, progressLabel,
} from './ui-shell.js';
import { getAuthHeaders, saveGuestDraft } from './auth.js';
import type { WorkspaceFileMeta } from './auth.js';
import {
  loadRemoteWorkspaceFile as loadRemoteWorkspaceFileImpl,
  uploadWorkspaceFileAuthenticated as uploadWorkspaceFileAuthenticatedImpl,
} from './workspace-remote-files.js';
import { createWorkspaceCatalogSelectionController } from './workspace-catalog-selection.js';
import { createWorkspaceFileActionsController } from './workspace-file-actions.js';
import { reloadWorkspaceTree } from './workspace-tree-reload.js';
import { createWorkspaceUiBridgeController } from './workspace-ui-bridge.js';
import { computeCuttingStats } from '../../core-engine/src/cutting/index.js';

// ─── Callbacks ───────────────────────────────────────────────────────

type VoidFn = () => void;

export async function computeStatsForFile(_base64: string, doc: LoadedFile['doc']): Promise<UICuttingStats> {
  const s = computeCuttingStats(doc);
  return { totalPierces: s.totalPierces, totalCutLength: s.totalCutLength, cuttingEntityCount: s.cuttingEntityCount, chains: s.chains };
}

const workspaceUiBridge = createWorkspaceUiBridgeController({
  computeStats: computeStatsForFile,
});

export function initWorkspaceCallbacks(cbs: {
  renderCatalogFilter: VoidFn;
  renderFileList: VoidFn;
  recalcTotals: VoidFn;
  updateNestItems: VoidFn;
  setActiveFile: (id: number) => void;
  syncWelcomeVisibility: VoidFn;
  computeStats: (base64: string, doc: LoadedFile['doc']) => Promise<UICuttingStats>;
}): void {
  workspaceUiBridge.init(cbs);
}

// ─── Interfaces ──────────────────────────────────────────────────────

export interface LibraryTreeResponse {
  readonly success: boolean;
  readonly catalogs: WorkspaceCatalog[];
  readonly files: WorkspaceFileMeta[];
}

const workspaceCatalogSelection = createWorkspaceCatalogSelectionController({
  selectedCatalogIds,
  workspaceCatalogs,
  loadedFiles,
  uncategorizedCatalogId: UNCATEGORIZED_CATALOG_ID,
});

// ─── Catalog helpers ─────────────────────────────────────────────────

export function fileCatalogKey(file: Pick<LoadedFile, 'catalogId'>): string {
  return workspaceCatalogSelection.fileCatalogKey(file);
}

export function getPreferredUploadCatalogId(): string | null {
  return workspaceCatalogSelection.getPreferredUploadCatalogId();
}

export function selectAllCatalogsForCurrentData(): void {
  workspaceCatalogSelection.selectAllCatalogsForCurrentData();
}

export function ensureSelectedCatalogsDefaults(): void {
  workspaceCatalogSelection.ensureSelectedCatalogsDefaults();
}

export function isFileInSelectedCatalogs(file: LoadedFile): boolean {
  return workspaceCatalogSelection.isFileInSelectedCatalogs(file);
}

export function syncWelcomeVisibility(): void {
  workspaceUiBridge.syncWelcomeVisibility();
}

export function refreshCatalogSelectionViews(): void {
  workspaceUiBridge.refreshCatalogSelectionViews();
}

// ─── Remote file loading ─────────────────────────────────────────────

export async function loadRemoteWorkspaceFile(meta: WorkspaceFileMeta): Promise<LoadedFile> {
  return loadRemoteWorkspaceFileImpl(meta, (base64, doc) => workspaceUiBridge.computeStats(base64, doc));
}

export async function reloadWorkspaceLibraryFromServer(): Promise<void> {
  if (!authSessionToken) return;
  try {
    const tree = await apiGetJSON<LibraryTreeResponse>('/api/library-tree', getAuthHeaders());
    await reloadWorkspaceTree({
      tree,
      workspaceCatalogs,
      selectedCatalogIds,
      loadedFiles,
      uncategorizedCatalogId: UNCATEGORIZED_CATALOG_ID,
      bumpNextFileId,
      clearActiveWorkspaceView: () => {
        setActiveFileId(-1);
      },
      setActiveFile: (id) => workspaceUiBridge.setActiveFile(id),
      refreshWorkspaceView: () => workspaceUiBridge.refreshWorkspaceView(),
      refreshFileMetrics: () => workspaceUiBridge.refreshFileMetrics(),
      refreshFileListOnly: () => workspaceUiBridge.refreshFileListOnly(),
      loadRemoteWorkspaceFile,
    });

  } catch (err) {
    console.error('reloadWorkspaceLibraryFromServer failed:', err);
  }

  workspaceUiBridge.refreshCatalogSelectionViews();
}

const workspaceFileActions = createWorkspaceFileActionsController({
  progressBar,
  progressFill,
  progressLabel,
  getAuthSessionToken: () => authSessionToken,
  getAuthHeaders,
  getPreferredUploadCatalogId,
  uploadWorkspaceFileAuthenticated: uploadWorkspaceFileAuthenticatedImpl,
  loadedFiles,
  getActiveFileId: () => activeFileId,
  bumpNextFileId,
  computeStats: (base64, doc) => workspaceUiBridge.computeStats(base64, doc),
  setActiveFileId,
  clearRendererDocument: () => {},
  clearStatusBar: () => {},
  refreshCatalogSelectionViews: () => workspaceUiBridge.refreshCatalogSelectionViews(),
  refreshFileMetrics: () => workspaceUiBridge.refreshFileMetrics(),
  syncWelcomeVisibility: () => workspaceUiBridge.syncWelcomeVisibility(),
  saveGuestDraft,
});

// ─── File upload / remove ─────────────────────────────────────────────

export async function loadSingleFile(
  file: File,
  setActiveFileFn: (id: number) => void,
): Promise<void> {
  await workspaceFileActions.loadSingleFile(file, setActiveFileFn);
}

export async function removeFile(
  id: number,
  setActiveFileFn: (id: number) => void,
): Promise<void> {
  await workspaceFileActions.removeFile(id, setActiveFileFn);
}

export async function toggleFileChecked(id: number): Promise<void> {
  await workspaceFileActions.toggleFileChecked(id);
}
