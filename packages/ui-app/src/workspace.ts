/**
 * @module workspace
 * CRUD операции с каталогами и файлами workspace.
 * Загрузка/удаление файлов, reload библиотеки с сервера.
 */

import { apiGetJSON, apiPatchJSON, apiPostJSON, arrayBufferToBase64 } from './api.js';
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
import { parseDXFInWorker } from '../../core-engine/src/workers/index.js';
import { computeCuttingStats } from '../../core-engine/src/cutting/index.js';

// ─── Callbacks ───────────────────────────────────────────────────────

type VoidFn = () => void;
type AsyncVoidFn = () => Promise<void>;

let _renderCatalogFilter: VoidFn = () => {};
let _renderFileList: VoidFn = () => {};
let _recalcTotals: VoidFn = () => {};
let _updateNestItems: VoidFn = () => {};
let _setActiveFile: (id: number) => void = () => {};
let _syncWelcomeVisibility: VoidFn = () => {};
let _computeStats: (base64: string, doc: LoadedFile['doc']) => Promise<UICuttingStats> = async (_, doc) => {
  const s = computeCuttingStats(doc);
  return { totalPierces: s.totalPierces, totalCutLength: s.totalCutLength, cuttingEntityCount: s.cuttingEntityCount, chains: s.chains };
};

export function initWorkspaceCallbacks(cbs: {
  renderCatalogFilter: VoidFn;
  renderFileList: VoidFn;
  recalcTotals: VoidFn;
  updateNestItems: VoidFn;
  setActiveFile: (id: number) => void;
  syncWelcomeVisibility: VoidFn;
  computeStats: (base64: string, doc: LoadedFile['doc']) => Promise<UICuttingStats>;
}): void {
  _renderCatalogFilter    = cbs.renderCatalogFilter;
  _renderFileList         = cbs.renderFileList;
  _recalcTotals           = cbs.recalcTotals;
  _updateNestItems        = cbs.updateNestItems;
  _setActiveFile          = cbs.setActiveFile;
  _syncWelcomeVisibility  = cbs.syncWelcomeVisibility;
  _computeStats           = cbs.computeStats;
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
  for (const id of selectedCatalogIds) {
    if (id !== UNCATEGORIZED_CATALOG_ID) return id;
  }
  return null;
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
  _syncWelcomeVisibility();
}

export function refreshCatalogSelectionViews(): void {
  _renderCatalogFilter();
  _renderFileList();
  _recalcTotals();
  _updateNestItems();
}

// ─── Remote file loading ─────────────────────────────────────────────

export async function loadRemoteWorkspaceFile(meta: WorkspaceFileMeta): Promise<LoadedFile> {
  const dl = await apiGetJSON<{ success: boolean; name: string; base64: string; sizeBytes: number }>(
    `/api/library-files-download?fileId=${encodeURIComponent(meta.id)}`,
    getAuthHeaders(),
  );
  const binary = atob(dl.base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  const buffer = bytes.buffer;
  const parsed = await parseDXFInWorker(buffer);
  const stats = await _computeStats(dl.base64, parsed.document);
  return {
    id: bumpNextFileId(),
    remoteId: meta.id,
    workspaceId: meta.workspaceId,
    catalogId: meta.catalogId,
    name: meta.name,
    doc: parsed.document,
    stats,
    checked: meta.checked,
    quantity: meta.quantity,
  };
}

export async function reloadWorkspaceLibraryFromServer(): Promise<void> {
  if (!authSessionToken) return;
  try {
    const tree = await apiGetJSON<LibraryTreeResponse>('/api/library-tree', getAuthHeaders());
    workspaceCatalogs.splice(0, workspaceCatalogs.length, ...tree.catalogs);
    loadedFiles.splice(0, loadedFiles.length);

    selectedCatalogIds.clear();
    for (const catalog of workspaceCatalogs) selectedCatalogIds.add(catalog.id);
    if (tree.files.some((f) => f.catalogId === null)) selectedCatalogIds.add(UNCATEGORIZED_CATALOG_ID);

    _renderCatalogFilter();
    _renderFileList();
    _syncWelcomeVisibility();

    const CONCURRENCY = 3;
    let pending = 0;
    let nextIdx = 0;
    const metas = tree.files;

    await new Promise<void>((resolve) => {
      function onFileReady(loaded: LoadedFile | null): void {
        pending--;
        if (loaded) {
          loadedFiles.push(loaded);
          if (loadedFiles.length === 1) _setActiveFile(loaded.id);
          _renderCatalogFilter();
          _renderFileList();
          _recalcTotals();
          _updateNestItems();
        }
        scheduleNext();
      }

      function scheduleNext(): void {
        while (pending < CONCURRENCY && nextIdx < metas.length) {
          const meta = metas[nextIdx++]!;
          pending++;
          loadRemoteWorkspaceFile(meta)
            .then((loaded) => onFileReady(loaded))
            .catch((err) => { console.warn(`Failed to load file "${meta.name}":`, err); onFileReady(null); });
        }
        if (pending === 0) resolve();
      }

      scheduleNext();
    });

    if (loadedFiles.length === 0) {
      setActiveFileId(-1);
      renderer.clearDocument();
      _syncWelcomeVisibility();
    }
  } catch (err) {
    console.error('reloadWorkspaceLibraryFromServer failed:', err);
  }

  _renderCatalogFilter();
  _renderFileList();
  _recalcTotals();
  _updateNestItems();
}

// ─── File upload / remove ─────────────────────────────────────────────

export async function loadSingleFile(
  file: File,
  setActiveFileFn: (id: number) => void,
): Promise<void> {
  progressBar.classList.remove('hidden');
  progressFill.style.width = '0%';
  progressLabel.textContent = `Загрузка: ${file.name}`;

  try {
    const buffer = await file.arrayBuffer();
    const base64 = arrayBufferToBase64(buffer);
    const result = await parseDXFInWorker(buffer, {
      onProgress(p) {
        const pct = p.totalBytes > 0 ? (p.bytesProcessed / p.totalBytes) * 100 : 0;
        progressFill.style.width = `${Math.min(pct, 95)}%`;
      },
    });

    progressFill.style.width = '100%';
    setTimeout(() => progressBar.classList.add('hidden'), 400);

    const stats = await _computeStats(base64, result.document);

    let entry: LoadedFile;
    if (authSessionToken) {
      const uploadResp = await apiPostJSON<{ success: boolean; file: WorkspaceFileMeta }>('/api/library-files', {
        name: file.name,
        base64,
        catalogId: getPreferredUploadCatalogId(),
        checked: true,
        quantity: 1,
      }, getAuthHeaders());

      entry = {
        id: bumpNextFileId(),
        remoteId: uploadResp.file.id,
        workspaceId: uploadResp.file.workspaceId,
        catalogId: uploadResp.file.catalogId,
        name: file.name,
        doc: result.document,
        stats,
        checked: uploadResp.file.checked,
        quantity: uploadResp.file.quantity,
      };
    } else {
      entry = {
        id: bumpNextFileId(),
        remoteId: '',
        workspaceId: '',
        catalogId: null,
        name: file.name,
        localBase64: base64,
        doc: result.document,
        stats,
        checked: true,
        quantity: 1,
      };
    }
    loadedFiles.push(entry);
    setActiveFileFn(entry.id);
    _renderCatalogFilter();
    _renderFileList();
    _recalcTotals();
    _updateNestItems();
    saveGuestDraft();
  } catch (err) {
    progressBar.classList.add('hidden');
    const msg = err instanceof Error ? err.message : String(err);
    alert(`Ошибка загрузки ${file.name}: ${msg}`);
  }
}

export async function removeFile(
  id: number,
  setActiveFileFn: (id: number) => void,
): Promise<void> {
  const idx = loadedFiles.findIndex(f => f.id === id);
  if (idx < 0) return;
  const target = loadedFiles[idx]!;
  if (authSessionToken && target.remoteId) {
    try {
      await apiPostJSON<{ success: boolean }>('/api/library-files-delete', {
        fileId: target.remoteId,
      }, getAuthHeaders());
    } catch (error) {
      console.error('Delete file failed:', error);
    }
  }
  loadedFiles.splice(idx, 1);

  if (loadedFiles.length === 0) {
    setActiveFileId(-1);
    renderer.clearDocument();
    statusEntities.textContent = '';
    statusVersion.textContent = '';
    _syncWelcomeVisibility();
  } else if (activeFileId === id) {
    setActiveFileFn(loadedFiles[Math.min(idx, loadedFiles.length - 1)]!.id);
  }
  _renderCatalogFilter();
  _renderFileList();
  _recalcTotals();
  _updateNestItems();
}

export async function toggleFileChecked(id: number): Promise<void> {
  const entry = loadedFiles.find(f => f.id === id);
  if (!entry) return;
  entry.checked = !entry.checked;
  if (authSessionToken && entry.remoteId) {
    try {
      await apiPatchJSON<{ success: boolean }>('/api/library-files-update', {
        fileId: entry.remoteId,
        checked: entry.checked,
      }, getAuthHeaders());
    } catch (error) {
      console.error('Toggle file checked failed:', error);
    }
  }
  _renderFileList();
  _recalcTotals();
  _updateNestItems();
  saveGuestDraft();
}
