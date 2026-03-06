/**
 * @module workspace
 * CRUD операции с каталогами и файлами workspace.
 * Загрузка/удаление файлов, reload библиотеки с сервера.
 */

import { apiGetJSON, apiPatchJSON, apiPostJSON, arrayBufferToBase64 } from './api.js';
import { tx } from './i18n/index.js';
import type { LoadedFile, UICuttingStats, WorkspaceCatalog } from './types.js';
import {
  authSessionToken, UNCATEGORIZED_CATALOG_ID,
  workspaceCatalogs, selectedCatalogIds, loadedFiles,
  activeFileId, bumpNextFileId, setActiveFileId,
  renderer,
} from './state.js';
import {
  progressBar, progressFill, progressLabel,
  statusEntities, statusVersion,
} from './dom.js';
import { getAuthHeaders, saveGuestDraft } from './auth.js';
import type { WorkspaceFileMeta } from './auth.js';
import {
  loadRemoteWorkspaceFile as loadRemoteWorkspaceFileImpl,
  uploadWorkspaceFileAuthenticated as uploadWorkspaceFileAuthenticatedImpl,
} from './workspace-remote-files.js';
import { createWorkspaceUiBridgeController } from './workspace-ui-bridge.js';
import { computeCuttingStats } from '../../core-engine/src/cutting/index.js';
import { parseDXFInWorker } from '../../core-engine/src/workers/index.js';

// ─── Callbacks ───────────────────────────────────────────────────────

type VoidFn = () => void;

const workspaceUiBridge = createWorkspaceUiBridgeController({
 computeStats: async (_, doc) => {
  const s = computeCuttingStats(doc);
  return { totalPierces: s.totalPierces, totalCutLength: s.totalCutLength, cuttingEntityCount: s.cuttingEntityCount, chains: s.chains };
 },
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

// ─── Catalog helpers ─────────────────────────────────────────────────

export function fileCatalogKey(file: Pick<LoadedFile, 'catalogId'>): string {
  return file.catalogId ?? UNCATEGORIZED_CATALOG_ID;
}

export function getPreferredUploadCatalogId(): string | null {
  if (selectedCatalogIds.size !== 1) return null;
  const [id] = [...selectedCatalogIds];
  if (!id || id === UNCATEGORIZED_CATALOG_ID) return null;
  return id;
}

export function selectAllCatalogsForCurrentData(): void {
  selectedCatalogIds.clear();
  for (const catalog of workspaceCatalogs) selectedCatalogIds.add(catalog.id);
  if (loadedFiles.some((f) => f.catalogId === null)) {
    selectedCatalogIds.add(UNCATEGORIZED_CATALOG_ID);
  }
}

export function ensureSelectedCatalogsDefaults(): void {
  if (selectedCatalogIds.size > 0) return;
  selectAllCatalogsForCurrentData();
}

export function isFileInSelectedCatalogs(file: LoadedFile): boolean {
  ensureSelectedCatalogsDefaults();
  return selectedCatalogIds.has(fileCatalogKey(file));
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

function applyWorkspaceTreeState(tree: LibraryTreeResponse): void {
  workspaceCatalogs.splice(0, workspaceCatalogs.length, ...tree.catalogs);
  loadedFiles.splice(0, loadedFiles.length);

  selectedCatalogIds.clear();
  for (const catalog of workspaceCatalogs) selectedCatalogIds.add(catalog.id);
  if (tree.files.some((file) => file.catalogId === null)) selectedCatalogIds.add(UNCATEGORIZED_CATALOG_ID);
}

function createLoadingPlaceholders(tree: LibraryTreeResponse): void {
  const EMPTY_STATS: import('./types.js').UICuttingStats = {
    totalPierces: 0, totalCutLength: 0, cuttingEntityCount: 0, chains: [],
  };

  for (const meta of tree.files) {
    const placeholder: import('./types.js').LoadedFile = {
      id: bumpNextFileId(),
      remoteId: meta.id,
      workspaceId: meta.workspaceId,
      catalogId: meta.catalogId,
      name: meta.name,
      doc: null as unknown as import('../../core-engine/src/normalize/index.js').NormalizedDocument,
      stats: EMPTY_STATS,
      checked: meta.checked,
      quantity: meta.quantity,
      loading: true,
    };
    loadedFiles.push(placeholder);
  }
}

function syncInitialWorkspaceTreeView(): void {
  if (loadedFiles.length > 0) {
    workspaceUiBridge.setActiveFile(loadedFiles[0]!.id);
  } else {
    setActiveFileId(-1);
    renderer.clearDocument();
  }
  workspaceUiBridge.refreshWorkspaceView();
}

async function hydrateWorkspaceTreeFiles(tree: LibraryTreeResponse): Promise<void> {
  const CONCURRENCY = 4;
  let nextIdx = 0;
  let active = 0;

  await new Promise<void>((resolve) => {
    function startNext(): void {
      while (active < CONCURRENCY && nextIdx < tree.files.length) {
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
                workspaceUiBridge.setActiveFile(placeholder.id);
              }
              workspaceUiBridge.refreshFileMetrics();
              window.dispatchEvent(new CustomEvent('dxf-files-updated', { detail: { added: 0 } }));
            }
          })
          .catch((err) => {
            console.warn(`Failed to load file "${meta.name}":`, err);
            if (placeholder) {
              placeholder.loading = false;
              placeholder.loadError = err instanceof Error ? err.message : String(err);
              workspaceUiBridge.refreshFileListOnly();
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

export async function reloadWorkspaceLibraryFromServer(): Promise<void> {
  if (!authSessionToken) return;
  try {
    const tree = await apiGetJSON<LibraryTreeResponse>('/api/library-tree', getAuthHeaders());
    applyWorkspaceTreeState(tree);
    createLoadingPlaceholders(tree);
    syncInitialWorkspaceTreeView();
    await hydrateWorkspaceTreeFiles(tree);

  } catch (err) {
    console.error('reloadWorkspaceLibraryFromServer failed:', err);
  }

  workspaceUiBridge.refreshCatalogSelectionViews();
}

function beginWorkspaceLoadProgress(fileName: string): void {
  progressBar.classList.remove('hidden');
  progressFill.style.width = '0%';
  progressLabel.textContent = tx('workspace.loading', { name: fileName });
}

function updateWorkspaceLoadProgress(bytesProcessed: number, totalBytes: number): void {
  const pct = totalBytes > 0 ? (bytesProcessed / totalBytes) * 100 : 0;
  progressFill.style.width = `${Math.min(pct, 95)}%`;
}

function completeWorkspaceLoadProgress(): void {
  progressFill.style.width = '100%';
  setTimeout(() => progressBar.classList.add('hidden'), 400);
}

function failWorkspaceLoadProgress(): void {
  progressBar.classList.add('hidden');
}

async function createLoadedWorkspaceEntry(
  file: File,
  buffer: ArrayBuffer,
  base64: string,
  doc: LoadedFile['doc'],
  stats: LoadedFile['stats'],
): Promise<LoadedFile> {
  if (authSessionToken) {
    const uploadedFile = await uploadWorkspaceFileAuthenticatedImpl(file, buffer, getPreferredUploadCatalogId);
    return {
      id: bumpNextFileId(),
      remoteId: uploadedFile.id,
      workspaceId: uploadedFile.workspaceId,
      catalogId: uploadedFile.catalogId,
      name: file.name,
      doc,
      stats,
      checked: uploadedFile.checked,
      quantity: uploadedFile.quantity,
      sizeBytes: file.size,
    };
  }

  return {
    id: bumpNextFileId(),
    remoteId: '',
    workspaceId: '',
    catalogId: null,
    name: file.name,
    localBase64: base64,
    doc,
    stats,
    checked: true,
    quantity: 1,
    sizeBytes: file.size,
  };
}

async function deleteRemoteWorkspaceFile(remoteId: string): Promise<void> {
  if (!authSessionToken || !remoteId) return;
  try {
    await apiPostJSON<{ success: boolean }>('/api/library-files-delete', {
      fileId: remoteId,
    }, getAuthHeaders());
  } catch (error) {
    console.error('Delete file failed:', error);
  }
}

async function persistRemoteFileChecked(entry: LoadedFile): Promise<void> {
  if (!authSessionToken || !entry.remoteId) return;
  try {
    await apiPatchJSON<{ success: boolean }>('/api/library-files-update', {
      fileId: entry.remoteId,
      checked: entry.checked,
    }, getAuthHeaders());
  } catch (error) {
    console.error('Toggle file checked failed:', error);
  }
}

// ─── File upload / remove ─────────────────────────────────────────────

export async function loadSingleFile(
  file: File,
  setActiveFileFn: (id: number) => void,
): Promise<void> {
  beginWorkspaceLoadProgress(file.name);

  try {
    const buffer = await file.arrayBuffer();
    const base64 = arrayBufferToBase64(buffer);
    const result = await parseDXFInWorker(buffer, {
      onProgress(p) {
        updateWorkspaceLoadProgress(p.bytesProcessed, p.totalBytes);
      },
    });

    completeWorkspaceLoadProgress();

    const stats = await workspaceUiBridge.computeStats(base64, result.document);

    const entry = await createLoadedWorkspaceEntry(file, buffer, base64, result.document, stats);
    loadedFiles.push(entry);
    setActiveFileFn(entry.id);
    workspaceUiBridge.refreshCatalogSelectionViews();
    saveGuestDraft();
  } catch (err) {
    failWorkspaceLoadProgress();
    const msg = err instanceof Error ? err.message : String(err);
    alert(tx('workspace.loadError', { name: file.name, msg }));
  }
}

export async function removeFile(
  id: number,
  setActiveFileFn: (id: number) => void,
): Promise<void> {
  const idx = loadedFiles.findIndex(f => f.id === id);
  if (idx < 0) return;
  const target = loadedFiles[idx]!;
  await deleteRemoteWorkspaceFile(target.remoteId);
  loadedFiles.splice(idx, 1);

  if (loadedFiles.length === 0) {
    setActiveFileId(-1);
    renderer.clearDocument();
    statusEntities.textContent = '';
    statusVersion.textContent = '';
    workspaceUiBridge.syncWelcomeVisibility();
  } else if (activeFileId === id) {
    setActiveFileFn(loadedFiles[Math.min(idx, loadedFiles.length - 1)]!.id);
  }
  workspaceUiBridge.refreshCatalogSelectionViews();
}

export async function toggleFileChecked(id: number): Promise<void> {
  const entry = loadedFiles.find(f => f.id === id);
  if (!entry) return;
  entry.checked = !entry.checked;
  await persistRemoteFileChecked(entry);
  workspaceUiBridge.refreshFileMetrics();
  saveGuestDraft();
}
