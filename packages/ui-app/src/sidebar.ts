/**
 * @module sidebar
 * Рендеринг левой панели: список файлов, фильтр каталогов, Drag & Drop.
 */

import { t } from './i18n/index.js';
import type { LoadedFile } from './types.js';
import {
  loadedFiles, workspaceCatalogs,
  authSessionToken,
} from './state.js';
import {
  fileListEl, fileListEmpty,
} from './dom.js';
import { createSidebarCatalogsController } from './sidebar-catalogs.js';
import { createSidebarFileListController } from './sidebar-filelist.js';

// ─── Callbacks ───────────────────────────────────────────────────────

type VoidFn = () => void;

let _toggleFileChecked: (id: number) => Promise<void> = async () => {};
let _removeFile: (id: number) => Promise<void> = async () => {};
let _setActiveFile: (id: number) => void = () => {};
let _recalcTotals: VoidFn = () => {};
let _updateNestItems: VoidFn = () => {};

const sidebarCatalogs = createSidebarCatalogsController({
  renderFileList,
  recalcTotals: () => _recalcTotals(),
  setActiveFile: (id) => _setActiveFile(id),
  updateNestItems: () => _updateNestItems(),
});

const sidebarFileList = createSidebarFileListController({
  removeFile: (id) => _removeFile(id),
  setActiveFile: (id) => _setActiveFile(id),
  toggleFileChecked: (id) => _toggleFileChecked(id),
});

export function initSidebarCallbacks(cbs: {
  toggleFileChecked: (id: number) => Promise<void>;
  removeFile: (id: number) => Promise<void>;
  setActiveFile: (id: number) => void;
  recalcTotals: VoidFn;
  updateNestItems: VoidFn;
}): void {
  _toggleFileChecked = cbs.toggleFileChecked;
  _removeFile        = cbs.removeFile;
  _setActiveFile     = cbs.setActiveFile;
  _recalcTotals      = cbs.recalcTotals;
  _updateNestItems   = cbs.updateNestItems;
}

// ─── Delete catalog modal ─────────────────────────────────────────────

export function showDeleteCatalogModal(
  catalogName: string,
): Promise<'move_to_uncategorized' | 'delete_files' | null> {
  return sidebarCatalogs.showDeleteCatalogModal(catalogName);
}

// ─── Upload target hint ───────────────────────────────────────────────

export function updateUploadTargetHint(): void {
  sidebarCatalogs.updateUploadTargetHint();
}

// ─── Bulk controls ────────────────────────────────────────────────────

export function updateBulkControlsUi(): void {
  sidebarFileList.updateBulkControlsUi();
}

// ─── Catalog filter ───────────────────────────────────────────────────

export function renderCatalogFilter(): void {
  sidebarCatalogs.renderCatalogFilter();
}

// ─── File list ────────────────────────────────────────────────────────

export function renderFileList(): void {
  fileListEl.innerHTML = '';
  fileListEmpty.style.display = loadedFiles.length === 0 ? '' : 'none';
  fileListEl.appendChild(fileListEmpty);

  const isGuest = !authSessionToken;
  const catalogGroups: Array<{ id: string | null; name: string }> = isGuest
    ? [{ id: null, name: '' }]
    : [
        ...workspaceCatalogs.map((c) => ({ id: c.id, name: c.name })),
        { id: null, name: t('sidebar.uncategorized') },
      ];

  for (const catalog of catalogGroups) {
    const files = loadedFiles.filter((f) => isGuest ? true : f.catalogId === catalog.id);
    if (files.length === 0) continue;

    if (!isGuest) {
      fileListEl.appendChild(sidebarCatalogs.buildCatalogRow(catalog, files));
    }

    for (const f of files) {
      fileListEl.appendChild(sidebarFileList.buildFileItem(f, isGuest));
    }
  }
}

// ─── Recalc totals ────────────────────────────────────────────────────

export function recalcTotals(): void {
  sidebarFileList.recalcTotals();
}
