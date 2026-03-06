import { apiPatchJSON, apiPostJSON } from './api.js';
import { t, tx } from './i18n/index.js';
import type { LoadedFile } from './types.js';
import {
  loadedFiles,
  workspaceCatalogs,
  selectedCatalogIds,
  activeFileId,
  authSessionToken,
  renderer,
  UNCATEGORIZED_CATALOG_ID,
} from './state.js';
import {
  catalogFilter,
  deleteCatalogModal,
  dcmName,
  dcmMove,
  dcmDelete,
  dcmCancel,
  btnAddFiles,
} from './dom.js';
import {
  selectAllCatalogsForCurrentData,
  ensureSelectedCatalogsDefaults,
  refreshCatalogSelectionViews,
  getPreferredUploadCatalogId,
} from './workspace.js';
import { getAuthHeaders } from './auth.js';

export interface SidebarCatalogsController {
  buildCatalogRow(catalog: { id: string | null; name: string }, files: LoadedFile[]): HTMLDivElement;
  renderCatalogFilter(): void;
  showDeleteCatalogModal(catalogName: string): Promise<'move_to_uncategorized' | 'delete_files' | null>;
  updateUploadTargetHint(): void;
}

export function createSidebarCatalogsController(input: {
  renderFileList: () => void;
  recalcTotals: () => void;
  setActiveFile: (id: number) => void;
  updateNestItems: () => void;
}): SidebarCatalogsController {
  const {
    renderFileList,
    recalcTotals,
    setActiveFile,
    updateNestItems,
  } = input;

  function showDeleteCatalogModal(
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
      const onMove = () => {
        cleanup();
        resolve('move_to_uncategorized');
      };
      const onDelete = () => {
        cleanup();
        resolve('delete_files');
      };
      const onCancel = () => {
        cleanup();
        resolve(null);
      };
      const onOverlay = (event: MouseEvent) => {
        if (event.target === deleteCatalogModal) {
          cleanup();
          resolve(null);
        }
      };
      dcmMove.addEventListener('click', onMove);
      dcmDelete.addEventListener('click', onDelete);
      dcmCancel.addEventListener('click', onCancel);
      deleteCatalogModal.addEventListener('click', onOverlay);
    });
  }

  function updateUploadTargetHint(): void {
    if (!authSessionToken) {
      btnAddFiles.title = t('sidebar.addFiles.title');
      return;
    }
    const catId = getPreferredUploadCatalogId();
    const cat = catId ? workspaceCatalogs.find((catalog) => catalog.id === catId) : null;
    btnAddFiles.title = cat
      ? tx('sidebar.addFiles.toCatalog', { name: cat.name })
      : t('sidebar.addFiles.uncategorized');
  }

  function renderCatalogFilter(): void {
    catalogFilter.innerHTML = '';

    const isGuest = !authSessionToken;
    if (isGuest || workspaceCatalogs.length === 0) {
      catalogFilter.style.display = 'none';
      return;
    }
    catalogFilter.style.display = '';

    const hasUncategorized = loadedFiles.some((file) => file.catalogId === null);
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

    catalogRow.addEventListener('dragover', (event) => {
      if (!event.dataTransfer?.types.includes('application/x-file-id')) return;
      event.preventDefault();
      event.dataTransfer.dropEffect = 'move';
      catalogRow.classList.add('drag-over');
    });
    catalogRow.addEventListener('dragleave', () => catalogRow.classList.remove('drag-over'));
    catalogRow.addEventListener('drop', (event) => {
      event.preventDefault();
      catalogRow.classList.remove('drag-over');
      const fileIdStr = event.dataTransfer?.getData('application/x-file-id');
      const remoteId = event.dataTransfer?.getData('application/x-file-remote-id') ?? '';
      if (!fileIdStr) return;
      const fileId = Number(fileIdStr);
      const file = loadedFiles.find((loadedFile) => loadedFile.id === fileId);
      if (!file) return;
      const targetCatalogId = catalog.id;
      if (file.catalogId === targetCatalogId) return;

      const oldCatalogId = file.catalogId;
      file.catalogId = targetCatalogId;
      renderCatalogFilter();
      renderFileList();
      recalcTotals();

      if (remoteId && authSessionToken) {
        void apiPatchJSON<{ success: boolean }>('/api/library-files-update', {
          fileId: remoteId,
          catalogId: targetCatalogId,
        }, getAuthHeaders()).catch((error) => {
          console.error('Move file to catalog failed:', error);
          file.catalogId = oldCatalogId;
          renderCatalogFilter();
          renderFileList();
          recalcTotals();
        });
      }
    });

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
    catalogChk.addEventListener('click', (event) => {
      event.stopPropagation();
      if (catalogChk.checked) selectedCatalogIds.add(catalogKey);
      else selectedCatalogIds.delete(catalogKey);
      if (selectedCatalogIds.size === 0) ensureSelectedCatalogsDefaults();
      refreshCatalogSelectionViews();
      updateUploadTargetHint();
    });

    const renameBtn = catalogRow.querySelector('.catalog-btn:not(.danger)') as HTMLButtonElement | null;
    if (renameBtn && catalog.id) {
      renameBtn.addEventListener('click', (event) => {
        event.stopPropagation();
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

          const existingCatalog = workspaceCatalogs.find((workspaceCatalog) => workspaceCatalog.id === catalog.id);
          if (existingCatalog) (existingCatalog as { name: string }).name = nextName;
          span.textContent = nextName;
          input.replaceWith(span);
          renderCatalogFilter();

          void apiPatchJSON<{ success: boolean }>('/api/library-catalogs-update', {
            catalogId: catalog.id,
            name: nextName,
          }, getAuthHeaders()).catch((error) => {
            console.error('Rename catalog failed:', error);
            if (existingCatalog) (existingCatalog as { name: string }).name = catalog.name;
            renderCatalogFilter();
            renderFileList();
            alert(t('catalog.rename.error', { msg: error instanceof Error ? error.message : String(error) }));
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

        input.addEventListener('keydown', (keyEvent) => {
          keyEvent.stopPropagation();
          if (keyEvent.key === 'Enter') {
            keyEvent.preventDefault();
            commit();
          }
          if (keyEvent.key === 'Escape') {
            keyEvent.preventDefault();
            revert();
          }
        });
        input.addEventListener('blur', () => commit());
        input.addEventListener('click', (clickEvent) => clickEvent.stopPropagation());
      });
    }

    const deleteBtn = catalogRow.querySelector('.catalog-btn.danger') as HTMLButtonElement | null;
    if (deleteBtn && catalog.id) {
      deleteBtn.addEventListener('click', (event) => {
        event.stopPropagation();
        void showDeleteCatalogModal(catalog.name).then((mode) => {
          if (!mode) return;

          const catIdx = workspaceCatalogs.findIndex((workspaceCatalog) => workspaceCatalog.id === catalog.id);
          const removedCat = catIdx >= 0 ? workspaceCatalogs.splice(catIdx, 1)[0] : null;
          const affectedFiles: Array<{ file: LoadedFile; oldCatalogId: string | null }> = [];

          if (mode === 'move_to_uncategorized') {
            for (const file of loadedFiles) {
              if (file.catalogId === catalog.id) {
                affectedFiles.push({ file, oldCatalogId: file.catalogId });
                file.catalogId = null;
              }
            }
          } else {
            for (let index = loadedFiles.length - 1; index >= 0; index--) {
              if (loadedFiles[index]!.catalogId === catalog.id) {
                affectedFiles.push({ file: loadedFiles[index]!, oldCatalogId: loadedFiles[index]!.catalogId });
                loadedFiles.splice(index, 1);
              }
            }
          }

          selectedCatalogIds.delete(catalog.id);
          if (selectedCatalogIds.size === 0) ensureSelectedCatalogsDefaults();

          if (loadedFiles.length === 0) {
            renderer.clearDocument();
          } else if (activeFileId >= 0 && !loadedFiles.find((file) => file.id === activeFileId)) {
            setActiveFile(loadedFiles[0]!.id);
          }

          renderCatalogFilter();
          renderFileList();
          recalcTotals();
          updateNestItems();

          void apiPostJSON<{ success: boolean }>('/api/library-catalogs-delete', {
            catalogId: catalog.id,
            mode,
          }, getAuthHeaders()).catch((error) => {
            console.error('Delete catalog failed:', error);
            if (removedCat && catIdx >= 0) workspaceCatalogs.splice(catIdx, 0, removedCat);
            for (const { file, oldCatalogId } of affectedFiles) {
              file.catalogId = oldCatalogId;
              if (mode === 'delete_files' && !loadedFiles.includes(file)) loadedFiles.push(file);
            }
            renderCatalogFilter();
            renderFileList();
            recalcTotals();
            updateNestItems();
            alert(t('catalog.delete.error', { msg: error instanceof Error ? error.message : String(error) }));
          });
        });
      });
    }

    return catalogRow;
  }

  return {
    buildCatalogRow,
    renderCatalogFilter,
    showDeleteCatalogModal,
    updateUploadTargetHint,
  };
}
