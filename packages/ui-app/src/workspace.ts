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
import { parseDXFInWorker } from '../../core-engine/src/workers/index.js';
import { computeCuttingStats } from '../../core-engine/src/cutting/index.js';

// ─── Callbacks ───────────────────────────────────────────────────────

type VoidFn = () => void;

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
  // base64 → ArrayBuffer без побайтового цикла
  const binStr = atob(dl.base64);
  const bytes = Uint8Array.from(binStr, (c) => c.charCodeAt(0));
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
    sizeBytes: dl.sizeBytes,
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

    // ── Шаг 1: сразу показываем все файлы в списке с loading=true ────────
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

    if (loadedFiles.length > 0) {
      _setActiveFile(loadedFiles[0]!.id);
    } else {
      setActiveFileId(-1);
      renderer.clearDocument();
    }
    _renderCatalogFilter();
    _renderFileList();
    _recalcTotals();
    _updateNestItems();
    _syncWelcomeVisibility();

    // ── Шаг 2: парсим файлы фоново, параллельность CONCURRENCY ───────────
    const CONCURRENCY = 4;
    let nextIdx = 0;
    let active = 0;

    await new Promise<void>((resolve) => {
      function startNext(): void {
        while (active < CONCURRENCY && nextIdx < tree.files.length) {
          const meta = tree.files[nextIdx]!;
          const placeholder = loadedFiles.find((f) => f.remoteId === meta.id);
          nextIdx++;
          active++;

          loadRemoteWorkspaceFile(meta)
            .then((loaded) => {
              if (placeholder) {
                placeholder.doc        = loaded.doc;
                placeholder.stats      = loaded.stats;
                placeholder.loading    = false;
                placeholder.loadError  = undefined;
                // Если это активный файл — рендерим
                if (placeholder.id === loadedFiles[0]?.id) {
                  _setActiveFile(placeholder.id);
                }
                _renderFileList();
                _recalcTotals();
                _updateNestItems();
                window.dispatchEvent(new CustomEvent('dxf-files-updated', { detail: { added: 0 } }));
              }
            })
            .catch((err) => {
              console.warn(`Failed to load file "${meta.name}":`, err);
              if (placeholder) {
                placeholder.loading   = false;
                placeholder.loadError = err instanceof Error ? err.message : String(err);
                _renderFileList();
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
  progressLabel.textContent = tx('workspace.loading', { name: file.name });

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
        sizeBytes: file.size,
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
        sizeBytes: file.size,
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
