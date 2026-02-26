/**
 * @module sidebar
 * Рендеринг левой панели: список файлов, фильтр каталогов, Drag & Drop.
 */

import { apiPatchJSON, apiPostJSON } from './api.js';
import { t, tx } from './i18n/index.js';
import type { LoadedFile, WorkspaceCatalog } from './types.js';
import {
  loadedFiles, workspaceCatalogs, selectedCatalogIds,
  activeFileId, authSessionToken, renderer,
  UNCATEGORIZED_CATALOG_ID,
} from './state.js';
import {
  fileListEl, fileListEmpty, catalogFilter,
  deleteCatalogModal, dcmName, dcmMove, dcmDelete, dcmCancel,
  statsEl, sidebarFooter, ciPierces, ciLength,
  btnSelectAllFiles, btnAddFiles,
  statusPierces, statusCutLength,
} from './dom.js';
import {
  isFileInSelectedCatalogs, fileCatalogKey,
  selectAllCatalogsForCurrentData, ensureSelectedCatalogsDefaults,
  refreshCatalogSelectionViews, getPreferredUploadCatalogId,
} from './workspace.js';
import { getAuthHeaders, saveGuestDraft } from './auth.js';
import { formatCutLength } from '../../core-engine/src/cutting/index.js';
import type { Point3D } from '../../core-engine/src/types/index.js';

// ─── Callbacks ───────────────────────────────────────────────────────

type VoidFn = () => void;

let _toggleFileChecked: (id: number) => Promise<void> = async () => {};
let _removeFile: (id: number) => Promise<void> = async () => {};
let _setActiveFile: (id: number) => void = () => {};
let _recalcTotals: VoidFn = () => {};
let _updateNestItems: VoidFn = () => {};

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
  dcmName.textContent = catalogName;
  deleteCatalogModal.classList.remove('hidden');
  return new Promise((resolve) => {
    const cleanup = () => {
      deleteCatalogModal.classList.add('hidden');
      dcmMove.removeEventListener('click', onMove);
      dcmDelete.removeEventListener('click', onDelete);
      dcmCancel.removeEventListener('click', onCancel);
      deleteCatalogModal.removeEventListener('click', onOverlay);
    };
    const onMove    = () => { cleanup(); resolve('move_to_uncategorized'); };
    const onDelete  = () => { cleanup(); resolve('delete_files'); };
    const onCancel  = () => { cleanup(); resolve(null); };
    const onOverlay = (e: MouseEvent) => {
      if (e.target === deleteCatalogModal) { cleanup(); resolve(null); }
    };
    dcmMove.addEventListener('click', onMove);
    dcmDelete.addEventListener('click', onDelete);
    dcmCancel.addEventListener('click', onCancel);
    deleteCatalogModal.addEventListener('click', onOverlay);
  });
}

// ─── Upload target hint ───────────────────────────────────────────────

export function updateUploadTargetHint(): void {
  if (!authSessionToken) {
    btnAddFiles.title = t('sidebar.addFiles.title');
    return;
  }
  const catId = getPreferredUploadCatalogId();
  const cat = catId ? workspaceCatalogs.find(c => c.id === catId) : null;
  btnAddFiles.title = cat
    ? tx('sidebar.addFiles.toCatalog', { name: cat.name })
    : t('sidebar.addFiles.uncategorized');
}

// ─── Bulk controls ────────────────────────────────────────────────────

export function updateBulkControlsUi(): void {
  const visibleFiles = loadedFiles.filter((f) => isFileInSelectedCatalogs(f));
  const hasUnchecked = visibleFiles.some((f) => !f.checked);
  btnSelectAllFiles.textContent = hasUnchecked ? t('sidebar.selectAll.select') : t('sidebar.selectAll.deselect');
  btnSelectAllFiles.title = hasUnchecked ? t('sidebar.selectAll.selectTitle') : t('sidebar.selectAll.deselectTitle');
}

// ─── Catalog filter ───────────────────────────────────────────────────

export function renderCatalogFilter(): void {
  catalogFilter.innerHTML = '';

  const isGuest = !authSessionToken;
  if (isGuest || workspaceCatalogs.length === 0) {
    catalogFilter.style.display = 'none';
    return;
  }
  catalogFilter.style.display = '';

  const hasUncategorized = loadedFiles.some((f) => f.catalogId === null);
  const totalCatalogsCount = workspaceCatalogs.length + (hasUncategorized ? 1 : 0);

  const allChip = document.createElement('button');
  allChip.className = 'catalog-chip';
  allChip.textContent = t('sidebar.allCatalogs');
  allChip.classList.toggle('active', totalCatalogsCount > 0 && selectedCatalogIds.size >= totalCatalogsCount);
  allChip.addEventListener('click', () => {
    selectAllCatalogsForCurrentData();
    refreshCatalogSelectionViews();
    updateUploadTargetHint();
  });
  catalogFilter.appendChild(allChip);

  for (const catalog of workspaceCatalogs) {
    const chip = document.createElement('button');
    chip.className = 'catalog-chip';
    chip.textContent = catalog.name;
    chip.classList.toggle('active', selectedCatalogIds.has(catalog.id));
    chip.addEventListener('click', () => {
      if (selectedCatalogIds.has(catalog.id)) {
        selectedCatalogIds.delete(catalog.id);
      } else {
        selectedCatalogIds.add(catalog.id);
      }
      if (selectedCatalogIds.size === 0) selectAllCatalogsForCurrentData();
      refreshCatalogSelectionViews();
      updateUploadTargetHint();
    });
    catalogFilter.appendChild(chip);
  }

  if (hasUncategorized) {
    const uncat = document.createElement('button');
    uncat.className = 'catalog-chip';
    uncat.textContent = t('sidebar.uncategorized');
    uncat.classList.toggle('active', selectedCatalogIds.has(UNCATEGORIZED_CATALOG_ID));
    uncat.addEventListener('click', () => {
      if (selectedCatalogIds.has(UNCATEGORIZED_CATALOG_ID)) {
        selectedCatalogIds.delete(UNCATEGORIZED_CATALOG_ID);
      } else {
        selectedCatalogIds.add(UNCATEGORIZED_CATALOG_ID);
      }
      if (selectedCatalogIds.size === 0) selectAllCatalogsForCurrentData();
      refreshCatalogSelectionViews();
      updateUploadTargetHint();
    });
    catalogFilter.appendChild(uncat);
  }
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
      fileListEl.appendChild(buildCatalogRow(catalog, files));
    }

    for (const f of files) {
      fileListEl.appendChild(buildFileItem(f, isGuest));
    }
  }
}

// ─── Catalog row builder ──────────────────────────────────────────────

function buildCatalogRow(
  catalog: { id: string | null; name: string },
  files: LoadedFile[],
): HTMLDivElement {
  const catalogRow = document.createElement('div');
  catalogRow.className = 'catalog-row';
  const catalogKey = catalog.id ?? UNCATEGORIZED_CATALOG_ID;
  const selected = selectedCatalogIds.has(catalogKey);
  catalogRow.classList.toggle('active', selected);
  catalogRow.title = t('catalog.row.title');

  const catalogActions = catalog.id
    ? `<button class="catalog-btn" title="${t('catalog.rename.title')}"><svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 3a2.83 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/></svg></button>`
      + `<button class="catalog-btn danger" title="${t('catalog.delete.title')}"><svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg></button>`
    : '';

  catalogRow.innerHTML = `
    <input type="checkbox" ${selected ? 'checked' : ''} />
    <span class="catalog-name"></span>
    <span class="catalog-file-count">${files.length}</span>
    ${catalogActions}
  `;
  (catalogRow.querySelector('.catalog-name') as HTMLSpanElement).textContent = catalog.name;

  // Drag-over drop target
  catalogRow.addEventListener('dragover', (de) => {
    if (!de.dataTransfer?.types.includes('application/x-file-id')) return;
    de.preventDefault();
    de.dataTransfer!.dropEffect = 'move';
    catalogRow.classList.add('drag-over');
  });
  catalogRow.addEventListener('dragleave', () => catalogRow.classList.remove('drag-over'));
  catalogRow.addEventListener('drop', (de) => {
    de.preventDefault();
    catalogRow.classList.remove('drag-over');
    const fileIdStr = de.dataTransfer?.getData('application/x-file-id');
    const remoteId  = de.dataTransfer?.getData('application/x-file-remote-id') ?? '';
    if (!fileIdStr) return;
    const fileId = Number(fileIdStr);
    const file = loadedFiles.find(lf => lf.id === fileId);
    if (!file) return;
    const targetCatalogId = catalog.id;
    if (file.catalogId === targetCatalogId) return;

    const oldCatalogId = file.catalogId;
    file.catalogId = targetCatalogId;
    renderCatalogFilter();
    renderFileList();
    _recalcTotals();

    if (remoteId && authSessionToken) {
      void apiPatchJSON<{ success: boolean }>('/api/library-files-update', {
        fileId: remoteId,
        catalogId: targetCatalogId,
      }, getAuthHeaders())
        .catch((err) => {
          console.error('Move file to catalog failed:', err);
          file.catalogId = oldCatalogId;
          renderCatalogFilter();
          renderFileList();
          _recalcTotals();
        });
    }
  });

  // Click to focus catalog
  catalogRow.addEventListener('click', () => {
    const alreadyFocusedOnlyThis = selectedCatalogIds.size === 1 && selectedCatalogIds.has(catalogKey);
    if (alreadyFocusedOnlyThis) {
      selectAllCatalogsForCurrentData();
    } else {
      selectedCatalogIds.clear();
      selectedCatalogIds.add(catalogKey);
    }
    refreshCatalogSelectionViews();
    updateUploadTargetHint();
  });

  const catalogChk = catalogRow.querySelector('input') as HTMLInputElement;
  catalogChk.addEventListener('click', (e) => {
    e.stopPropagation();
    if (catalogChk.checked) selectedCatalogIds.add(catalogKey);
    else selectedCatalogIds.delete(catalogKey);
    if (selectedCatalogIds.size === 0) ensureSelectedCatalogsDefaults();
    refreshCatalogSelectionViews();
    updateUploadTargetHint();
  });

  // Inline rename
  const renameBtn = catalogRow.querySelector('.catalog-btn:not(.danger)') as HTMLButtonElement | null;
  if (renameBtn && catalog.id) {
    renameBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const nameSpan = catalogRow.querySelector('.catalog-name') as HTMLSpanElement | null;
      if (!nameSpan || catalogRow.querySelector('.catalog-name-input')) return;

      const input = document.createElement('input');
      input.className = 'catalog-name-input';
      input.value = catalog.name;
      nameSpan.replaceWith(input);
      input.focus();
      input.select();

      let committed = false;
      const commit = () => {
        if (committed) return;
        committed = true;
        const nextName = input.value.trim();
        const span = document.createElement('span');
        span.className = 'catalog-name';

        if (!nextName || nextName === catalog.name) {
          span.textContent = catalog.name;
          input.replaceWith(span);
          return;
        }

        const cat = workspaceCatalogs.find(c => c.id === catalog.id);
        if (cat) (cat as { name: string }).name = nextName;
        span.textContent = nextName;
        input.replaceWith(span);
        renderCatalogFilter();

        void apiPatchJSON<{ success: boolean }>('/api/library-catalogs-update', {
          catalogId: catalog.id,
          name: nextName,
        }, getAuthHeaders())
          .catch((err) => {
            console.error('Rename catalog failed:', err);
            if (cat) (cat as { name: string }).name = catalog.name;
            renderCatalogFilter();
            renderFileList();
            alert(t('catalog.rename.error', { msg: err instanceof Error ? err.message : String(err) }));
          });
      };

      const revert = () => {
        if (committed) return;
        committed = true;
        const span = document.createElement('span');
        span.className = 'catalog-name';
        span.textContent = catalog.name;
        input.replaceWith(span);
      };

      input.addEventListener('keydown', (ke) => {
        ke.stopPropagation();
        if (ke.key === 'Enter') { ke.preventDefault(); commit(); }
        if (ke.key === 'Escape') { ke.preventDefault(); revert(); }
      });
      input.addEventListener('blur', () => commit());
      input.addEventListener('click', (ce) => ce.stopPropagation());
    });
  }

  // Delete catalog
  const deleteBtn = catalogRow.querySelector('.catalog-btn.danger') as HTMLButtonElement | null;
  if (deleteBtn && catalog.id) {
    deleteBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      void showDeleteCatalogModal(catalog.name).then((mode) => {
        if (!mode) return;

        const catIdx = workspaceCatalogs.findIndex(c => c.id === catalog.id);
        const removedCat = catIdx >= 0 ? workspaceCatalogs.splice(catIdx, 1)[0] : null;
        const affectedFiles: Array<{ file: LoadedFile; oldCatalogId: string | null }> = [];

        if (mode === 'move_to_uncategorized') {
          for (const f of loadedFiles) {
            if (f.catalogId === catalog.id) {
              affectedFiles.push({ file: f, oldCatalogId: f.catalogId });
              f.catalogId = null;
            }
          }
        } else {
          for (let i = loadedFiles.length - 1; i >= 0; i--) {
            if (loadedFiles[i]!.catalogId === catalog.id) {
              affectedFiles.push({ file: loadedFiles[i]!, oldCatalogId: loadedFiles[i]!.catalogId });
              loadedFiles.splice(i, 1);
            }
          }
        }

        selectedCatalogIds.delete(catalog.id!);
        if (selectedCatalogIds.size === 0) ensureSelectedCatalogsDefaults();

        if (loadedFiles.length === 0) {
          renderer.clearDocument();
        } else if (activeFileId >= 0 && !loadedFiles.find(f => f.id === activeFileId)) {
          _setActiveFile(loadedFiles[0]!.id);
        }

        renderCatalogFilter();
        renderFileList();
        _recalcTotals();
        _updateNestItems();

        void apiPostJSON<{ success: boolean }>('/api/library-catalogs-delete', {
          catalogId: catalog.id,
          mode,
        }, getAuthHeaders())
          .catch((err) => {
            console.error('Delete catalog failed:', err);
            if (removedCat && catIdx >= 0) workspaceCatalogs.splice(catIdx, 0, removedCat);
            for (const { file, oldCatalogId } of affectedFiles) {
              file.catalogId = oldCatalogId;
              if (mode === 'delete_files' && !loadedFiles.includes(file)) loadedFiles.push(file);
            }
            renderCatalogFilter();
            renderFileList();
            _recalcTotals();
            _updateNestItems();
            alert(t('catalog.delete.error', { msg: err instanceof Error ? err.message : String(err) }));
          });
      });
    });
  }

  return catalogRow;
}

// ─── File item builder ────────────────────────────────────────────────

function buildFileItem(f: LoadedFile, isGuest: boolean): HTMLDivElement {
  let info: string;
  if (f.loading) {
    info = '…';
  } else if (f.loadError) {
    info = '⚠ ошибка';
  } else {
    const cutLen = f.stats.totalCutLength;
    const lenStr = cutLen >= 1000
      ? (cutLen / 1000).toFixed(2) + 'м'
      : cutLen.toFixed(0) + 'мм';
    info = `${f.stats.totalPierces}p · ${lenStr}`;
  }

  const item = document.createElement('div');
  item.className = `file-item${isGuest ? '' : ' in-catalog'}${f.id === activeFileId ? ' active' : ''}${f.loading ? ' loading' : ''}`;

  if (!isGuest) {
    item.draggable = true;
    item.addEventListener('dragstart', (de) => {
      de.dataTransfer!.effectAllowed = 'move';
      de.dataTransfer!.setData('application/x-file-id', String(f.id));
      de.dataTransfer!.setData('application/x-file-remote-id', f.remoteId);
      item.classList.add('dragging');
    });
    item.addEventListener('dragend', () => item.classList.remove('dragging'));
  }

  item.innerHTML = `
    <input type="checkbox" ${f.checked ? 'checked' : ''} />
    <svg class="file-item-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
    <span class="file-item-name"></span>
    <span class="file-item-info"></span>
    <button class="file-item-remove" title="Удалить">
      <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
    </button>
  `;
  (item.querySelector('.file-item-name') as HTMLSpanElement).textContent = f.name;
  (item.querySelector('.file-item-info') as HTMLSpanElement).textContent = info;

  const chk = item.querySelector('input') as HTMLInputElement;
  chk.addEventListener('click', (e) => { e.stopPropagation(); void _toggleFileChecked(f.id); });

  const removeBtn = item.querySelector('.file-item-remove') as HTMLButtonElement;
  removeBtn.addEventListener('click', (e) => { e.stopPropagation(); void _removeFile(f.id); });

  item.addEventListener('click', () => _setActiveFile(f.id));
  return item;
}

// ─── Recalc totals ────────────────────────────────────────────────────

export function recalcTotals(): void {
  let totalPierces    = 0;
  let totalCutLength  = 0;
  let totalEntities   = 0;

  for (const f of loadedFiles) {
    if (!f.checked || f.loading) continue;
    totalPierces    += f.stats.totalPierces;
    totalCutLength  += f.stats.totalCutLength;
    totalEntities   += f.stats.cuttingEntityCount;
  }

  const cutM = totalCutLength / 1000;
  ciPierces.textContent = String(totalPierces);
  ciLength.textContent  = cutM >= 1 ? cutM.toFixed(2) + t('unit.m') : totalCutLength.toFixed(1) + t('unit.mm');
  sidebarFooter.classList.toggle('visible', loadedFiles.length > 0);

  statusPierces.textContent    = totalPierces   > 0 ? t('status.pierces',   { n: String(totalPierces) }) : '';
  statusCutLength.textContent  = totalCutLength  > 0 ? t('status.cutLength', { len: formatCutLength(totalCutLength) }) : '';

  const checkedCount = loadedFiles.filter(f => f.checked).length;
  statsEl.textContent = loadedFiles.length > 0
    ? t('status.files', { checked: String(checkedCount), total: String(loadedFiles.length) })
    : '';

  updateBulkControlsUi();

  // Pierce points belong to the active file only — the renderer shows one file at a time
  const activeFile = loadedFiles.find(f => f.id === activeFileId);
  const activePiercePoints: Point3D[] = activeFile
    ? activeFile.stats.chains.map(c => c.piercePoint)
    : [];
  renderer.setPiercePoints(activePiercePoints);
}
