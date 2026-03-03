import { apiGetJSON, apiPatchJSON, apiPostJSON, downloadBlob } from '../api.js';
import { loadedFiles, workspaceCatalogs, UNCATEGORIZED_CATALOG_ID } from '../state.js';
import { getAuthHeaders, saveGuestDraft } from '../auth.js';
import { t } from '../i18n/index.js';
import { buildContourFromAll, contourAreaMm2 } from '../../../core-engine/src/contour/index.js';
import type { LibraryItem, SetBuilderState } from './types.js';
import { getLibraryItem } from './state.js';

export function mapLoadedCatalogName(catalogId: string | null): string {
  if (catalogId === null || catalogId === UNCATEGORIZED_CATALOG_ID) return t('setBuilder.unnamedCatalog');
  return workspaceCatalogs.find((c) => c.id === catalogId)?.name ?? 'Workspace';
}

export function mapLoadedFileToLibraryItem(sourceId: number, nextLibraryId: number): LibraryItem | null {
  const lf = loadedFiles.find((f) => f.id === sourceId);
  if (!lf || lf.doc == null) return null;

  const bb = lf.doc.totalBBox;
  const w = bb !== null ? Math.max(1, Math.round(bb.max.x - bb.min.x)) : 0;
  const h = bb !== null ? Math.max(1, Math.round(bb.max.y - bb.min.y)) : 0;
  const status = lf.loadError ? 'error' : lf.loading ? 'warn' : 'ok';
  const issues = lf.loadError
    ? [lf.loadError]
    : lf.loading
      ? [t('setBuilder.fileLoading')]
      : [];

  let areaMm2 = 0;
  try {
    const contour = buildContourFromAll(lf.doc.flatEntities);
    if (contour) areaMm2 = Math.round(contourAreaMm2(contour));
  } catch {
    areaMm2 = 0;
  }
  if (areaMm2 === 0 && w > 0 && h > 0) {
    areaMm2 = Math.round(w * h * 0.7);
  }

  return {
    id: nextLibraryId,
    sourceFileId: sourceId,
    name: lf.name,
    catalog: mapLoadedCatalogName(lf.catalogId),
    w,
    h,
    areaMm2,
    pierces: Math.max(0, lf.stats.totalPierces),
    cutLen: Math.max(0, lf.stats.totalCutLength),
    layersCount: lf.doc.layerNames.length,
    status,
    issues,
    thumbVariant: 1000 + sourceId,
  };
}

export function syncLoadedFilesIntoLibrary(state: SetBuilderState): void {
  const loadedIds = new Set<number>(loadedFiles.map((f) => f.id));
  const existingLoadedBySource = new Map<number, LibraryItem>();
  for (const item of state.library) {
    if (item.sourceFileId !== undefined) {
      existingLoadedBySource.set(item.sourceFileId, item);
    }
  }

  state.library = state.library.filter((item) => item.sourceFileId !== undefined && loadedIds.has(item.sourceFileId));

  let nextLibraryId = Math.max(0, ...state.library.map((i) => i.id)) + 1;
  for (const lf of loadedFiles) {
    const existing = existingLoadedBySource.get(lf.id);
    const mapped = mapLoadedFileToLibraryItem(lf.id, existing?.id ?? nextLibraryId);
    if (!mapped) continue;

    if (existing) {
      const idx = state.library.findIndex((i) => i.id === existing.id);
      if (idx >= 0) state.library[idx] = mapped;
    } else {
      state.library.push(mapped);
      nextLibraryId++;
    }
  }

  const availableCatalogs = new Set<string>(['All', t('setBuilder.unnamedCatalog')]);
  for (const item of state.library) availableCatalogs.add(item.catalog);
  for (const c of workspaceCatalogs) availableCatalogs.add(c.name);
  if (!availableCatalogs.has(state.catalogFilter)) {
    state.catalogFilter = 'All';
  }
}

export function getVisibleLibraryItems(state: SetBuilderState): LibraryItem[] {
  const q = state.search.trim().toLowerCase();
  const filtered = state.library.filter((item) => q.length === 0 || item.name.toLowerCase().includes(q));
  const sorted = [...filtered].sort((a, b) => {
    if (state.sortBy === 'name') return a.name.localeCompare(b.name);
    if (state.sortBy === 'pierces') return a.pierces - b.pierces;
    if (state.sortBy === 'cutLen') return a.cutLen - b.cutLen;
    return a.w * a.h - b.w * b.h;
  });
  return state.sortDir === 'asc' ? sorted : sorted.reverse();
}

export async function removeLibraryItem(
  state: SetBuilderState,
  libraryId: number,
  showToast: (msg: string) => void,
): Promise<boolean> {
  const item = getLibraryItem(state, libraryId);
  if (!item) return false;

  if (item.sourceFileId !== undefined) {
    const fileIdx = loadedFiles.findIndex((f) => f.id === item.sourceFileId);
    if (fileIdx >= 0) {
      const target = loadedFiles[fileIdx]!;
      if (target.remoteId) {
        try {
          await apiPostJSON<{ success: boolean }>('/api/library-files-delete', {
            fileId: target.remoteId,
          }, getAuthHeaders());
        } catch {
          showToast(t('setBuilder.toast.itemDeleteFailed'));
          return false;
        }
      }
      loadedFiles.splice(fileIdx, 1);
    }
  }

  const idx = state.library.findIndex((it) => it.id === libraryId);
  if (idx >= 0) state.library.splice(idx, 1);
  state.set.delete(libraryId);
  state.selectedLibraryIds.delete(libraryId);
  if (state.previewLibraryId === libraryId) state.previewLibraryId = null;
  saveGuestDraft();
  return true;
}

export async function moveLibraryItemToCatalogName(
  state: SetBuilderState,
  libraryId: number,
  targetCatalogName: string,
): Promise<boolean> {
  const item = getLibraryItem(state, libraryId);
  if (!item) return false;

  const unnamedCatalogName = t('setBuilder.unnamedCatalog');
  let nextCatalogId: string | null = null;
  let nextCatalogName = unnamedCatalogName;

  if (targetCatalogName !== unnamedCatalogName) {
    const found = workspaceCatalogs.find((c) => c.name === targetCatalogName);
    if (!found) return false;
    nextCatalogId = found.id;
    nextCatalogName = found.name;
  }

  if (item.sourceFileId !== undefined) {
    const lf = loadedFiles.find((f) => f.id === item.sourceFileId);
    if (lf) {
      const prevCatalogId = lf.catalogId;
      if (prevCatalogId === nextCatalogId) return false;
      lf.catalogId = nextCatalogId;
      if (lf.remoteId) {
        try {
          await apiPatchJSON<{ success: boolean }>('/api/library-files-update', {
            fileId: lf.remoteId,
            catalogId: nextCatalogId,
          }, getAuthHeaders());
        } catch {
          lf.catalogId = prevCatalogId;
          return false;
        }
      }
    }
  }

  const libIdx = state.library.findIndex((it) => it.id === libraryId);
  if (libIdx < 0) return false;
  state.library[libIdx] = { ...item, catalog: nextCatalogName };
  saveGuestDraft();
  return true;
}

export async function moveLibraryItemToCatalog(
  state: SetBuilderState,
  libraryId: number,
  showToast: (msg: string) => void,
): Promise<void> {
  const item = getLibraryItem(state, libraryId);
  if (!item) return;

  const unnamedCatalogName = t('setBuilder.unnamedCatalog');
  const options = [unnamedCatalogName, ...workspaceCatalogs.map((c, i) => `${i + 1}: ${c.name}`)].join('\n');
  const raw = prompt(`${t('setBuilder.prompt.moveToCatalog')}\n${options}`, item.catalog);
  if (raw == null) return;

  const val = raw.trim();
  const lower = val.toLowerCase();

  let nextCatalogName = unnamedCatalogName;
  if (!val || lower === unnamedCatalogName.toLowerCase() || lower === '0' || lower === 'uncategorized') {
    nextCatalogName = unnamedCatalogName;
  } else {
    const idx = Number(val);
    if (Number.isFinite(idx) && idx >= 1 && idx <= workspaceCatalogs.length) {
      nextCatalogName = workspaceCatalogs[idx - 1]!.name;
    } else {
      const found = workspaceCatalogs.find((c) => c.name.toLowerCase() === lower);
      if (!found) {
        showToast(t('setBuilder.toast.catalogNotFound'));
        return;
      }
      nextCatalogName = found.name;
    }
  }
  const moved = await moveLibraryItemToCatalogName(state, libraryId, nextCatalogName);
  if (!moved) {
    showToast(t('setBuilder.toast.itemMoveFailed'));
    return;
  }
  showToast(t('setBuilder.toast.itemMoved'));
}

export async function downloadLibraryItemSource(
  state: SetBuilderState,
  libraryId: number,
  showToast: (msg: string) => void,
): Promise<void> {
  const item = getLibraryItem(state, libraryId);
  if (!item || item.sourceFileId === undefined) {
    showToast(t('setBuilder.toast.sourceUnavailable'));
    return;
  }

  const lf = loadedFiles.find((f) => f.id === item.sourceFileId);
  if (!lf) {
    showToast(t('setBuilder.toast.sourceUnavailable'));
    return;
  }

  try {
    if (lf.localBase64) {
      const bin = atob(lf.localBase64);
      const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
      downloadBlob(new Blob([bytes.buffer], { type: 'application/dxf' }), lf.name);
      showToast(t('setBuilder.toast.downloadStarted'));
      return;
    }

    if (!lf.remoteId) {
      showToast(t('setBuilder.toast.sourceUnavailable'));
      return;
    }

    const dl = await apiGetJSON<{ success: boolean; name: string; base64: string; sizeBytes: number }>(
      `/api/library-files-download?fileId=${encodeURIComponent(lf.remoteId)}`,
      getAuthHeaders(),
    );
    const bin = atob(dl.base64);
    const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
    downloadBlob(new Blob([bytes.buffer], { type: 'application/dxf' }), dl.name || lf.name);
    showToast(t('setBuilder.toast.downloadStarted'));
  } catch {
    showToast(t('setBuilder.toast.downloadFailed'));
  }
}

export function getCatalogByFilterName(state: SetBuilderState): { id: string; name: string } | null {
  if (state.catalogFilter === 'All' || state.catalogFilter === t('setBuilder.unnamedCatalog')) return null;
  const found = workspaceCatalogs.find((c) => c.name === state.catalogFilter);
  return found ? { id: found.id, name: found.name } : null;
}

export function getCatalogByName(catalogName: string | null | undefined): { id: string; name: string } | null {
  const name = (catalogName ?? '').trim();
  if (!name || name === 'All' || name === t('setBuilder.unnamedCatalog')) return null;
  const found = workspaceCatalogs.find((c) => c.name === name);
  return found ? { id: found.id, name: found.name } : null;
}

export async function addCatalog(
  state: SetBuilderState,
  authSessionToken: string,
  showToast: (msg: string) => void,
  render: () => void,
): Promise<void> {
  if (!authSessionToken) {
    showToast(t('catalog.add.authRequired'));
    return;
  }
  const name = prompt(t('catalog.add.prompt'))?.trim() ?? '';
  if (!name) return;
  try {
    const resp = await apiPostJSON<{ success: boolean; catalog: { id: string; name: string; workspaceId: string; createdAt: number; updatedAt: number } }>(
      '/api/library-catalogs',
      { name },
      getAuthHeaders(),
    );
    workspaceCatalogs.push(resp.catalog);
    state.catalogFilter = 'All';
    showToast(t('setBuilder.toast.catalogAdded'));
    render();
  } catch {
    showToast(t('setBuilder.toast.catalogOpFailed'));
  }
}

export async function renameCurrentCatalog(
  state: SetBuilderState,
  catalogName: string | undefined,
  showToast: (msg: string) => void,
  render: () => void,
): Promise<void> {
  const current = getCatalogByName(catalogName) ?? getCatalogByFilterName(state);
  if (!current) {
    showToast(t('setBuilder.toast.catalogActionUnavailable'));
    return;
  }
  const nextName = prompt(t('catalog.rename.title'), current.name)?.trim() ?? '';
  if (!nextName || nextName === current.name) return;

  const cat = workspaceCatalogs.find((c) => c.id === current.id);
  if (!cat) return;
  const prevName = cat.name;
  (cat as { name: string }).name = nextName;
  state.catalogFilter = nextName;
  render();

  try {
    await apiPatchJSON<{ success: boolean }>(
      '/api/library-catalogs-update',
      { catalogId: current.id, name: nextName },
      getAuthHeaders(),
    );
    showToast(t('setBuilder.toast.catalogRenamed'));
  } catch {
    (cat as { name: string }).name = prevName;
    state.catalogFilter = prevName;
    showToast(t('setBuilder.toast.catalogOpFailed'));
    render();
  }
}

export async function deleteCurrentCatalog(
  state: SetBuilderState,
  catalogName: string | undefined,
  showToast: (msg: string) => void,
  render: () => void,
): Promise<void> {
  const current = getCatalogByName(catalogName) ?? getCatalogByFilterName(state);
  if (!current) {
    showToast(t('setBuilder.toast.catalogActionUnavailable'));
    return;
  }
  const modeRaw = prompt(t('setBuilder.prompt.deleteCatalogMode'), 'move')?.trim().toLowerCase();
  if (!modeRaw) return;
  const mode: 'move_to_uncategorized' | 'delete_files' = modeRaw === 'delete' ? 'delete_files' : 'move_to_uncategorized';

  const catIdx = workspaceCatalogs.findIndex((c) => c.id === current.id);
  if (catIdx < 0) return;
  const removedCat = workspaceCatalogs.splice(catIdx, 1)[0]!;
  const affected: Array<{ fileId: number; oldCatalogId: string | null }> = [];
  const deletedFiles: Array<{ file: typeof loadedFiles[number]; index: number }> = [];
  const deletedFileIds = new Set<number>();

  if (mode === 'move_to_uncategorized') {
    for (const f of loadedFiles) {
      if (f.catalogId !== current.id) continue;
      affected.push({ fileId: f.id, oldCatalogId: f.catalogId });
      f.catalogId = null;
    }
  } else {
    for (let i = loadedFiles.length - 1; i >= 0; i--) {
      const f = loadedFiles[i]!;
      if (f.catalogId !== current.id) continue;
      affected.push({ fileId: f.id, oldCatalogId: f.catalogId });
      deletedFiles.push({ file: f, index: i });
      deletedFileIds.add(f.id);
      loadedFiles.splice(i, 1);
    }
    state.library = state.library.filter((it) => it.sourceFileId === undefined || !deletedFileIds.has(it.sourceFileId));
    for (const id of deletedFileIds) {
      const lib = state.library.find((it) => it.sourceFileId === id);
      if (lib) {
        state.set.delete(lib.id);
        state.selectedLibraryIds.delete(lib.id);
      }
    }
  }

  state.catalogFilter = 'All';
  saveGuestDraft();
  render();

  try {
    await apiPostJSON<{ success: boolean }>(
      '/api/library-catalogs-delete',
      { catalogId: current.id, mode },
      getAuthHeaders(),
    );
    showToast(t('setBuilder.toast.catalogDeleted'));
  } catch {
    workspaceCatalogs.splice(catIdx, 0, removedCat);
    for (const a of affected) {
      const file = loadedFiles.find((f) => f.id === a.fileId);
      if (file) file.catalogId = a.oldCatalogId;
    }
    if (mode === 'delete_files') {
      deletedFiles.sort((a, b) => a.index - b.index);
      for (const d of deletedFiles) loadedFiles.splice(Math.min(d.index, loadedFiles.length), 0, d.file);
    }
    showToast(t('setBuilder.toast.catalogOpFailed'));
    render();
  }
}
