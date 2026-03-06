import { t, tx } from './i18n/index.js';
import type { LoadedFile } from './types.js';
import { loadedFiles, activeFileId, renderer } from './state.js';
import {
  statsEl,
  sidebarFooter,
  ciPierces,
  ciLength,
  btnSelectAllFiles,
  statusPierces,
  statusCutLength,
} from './dom.js';
import { isFileInSelectedCatalogs } from './workspace.js';
import { formatCutLength } from '../../core-engine/src/cutting/index.js';
import type { Point3D } from '../../core-engine/src/types/index.js';

export interface SidebarFileListController {
  buildFileItem(file: LoadedFile, isGuest: boolean): HTMLDivElement;
  recalcTotals(): void;
  updateBulkControlsUi(): void;
}

export function createSidebarFileListController(input: {
  removeFile: (id: number) => Promise<void>;
  setActiveFile: (id: number) => void;
  toggleFileChecked: (id: number) => Promise<void>;
}): SidebarFileListController {
  const {
    removeFile,
    setActiveFile,
    toggleFileChecked,
  } = input;

  function updateBulkControlsUi(): void {
    const visibleFiles = loadedFiles.filter((file) => isFileInSelectedCatalogs(file));
    const hasUnchecked = visibleFiles.some((file) => !file.checked);
    btnSelectAllFiles.textContent = hasUnchecked ? t('sidebar.selectAll.select') : t('sidebar.selectAll.deselect');
    btnSelectAllFiles.title = hasUnchecked ? t('sidebar.selectAll.selectTitle') : t('sidebar.selectAll.deselectTitle');
  }

  function buildFileItem(file: LoadedFile, isGuest: boolean): HTMLDivElement {
    let info: string;
    if (file.loading) {
      info = '…';
    } else if (file.loadError) {
      info = '⚠ ошибка';
    } else {
      const cutLen = file.stats.totalCutLength;
      const lenStr = cutLen >= 1000
        ? (cutLen / 1000).toFixed(2) + 'м'
        : cutLen.toFixed(0) + 'мм';
      info = `${file.stats.totalPierces}p · ${lenStr}`;
    }

    const item = document.createElement('div');
    item.className = `file-item${isGuest ? '' : ' in-catalog'}${file.id === activeFileId ? ' active' : ''}${file.loading ? ' loading' : ''}`;

    item.draggable = true;
    item.addEventListener('dragstart', (event) => {
      event.dataTransfer!.effectAllowed = 'copyMove';
      event.dataTransfer!.setData('application/x-file-id', String(file.id));
      if (!isGuest && file.remoteId) event.dataTransfer!.setData('application/x-file-remote-id', file.remoteId);
      item.classList.add('dragging');
    });
    item.addEventListener('dragend', () => item.classList.remove('dragging'));

    item.innerHTML = `
      <input type="checkbox" ${file.checked ? 'checked' : ''} />
      <svg class="file-item-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
      <span class="file-item-name"></span>
      <span class="file-item-info"></span>
      <button class="file-item-remove" title="Удалить">
        <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
      </button>
    `;
    (item.querySelector('.file-item-name') as HTMLSpanElement).textContent = file.name;
    (item.querySelector('.file-item-info') as HTMLSpanElement).textContent = info;

    const checkbox = item.querySelector('input') as HTMLInputElement;
    checkbox.addEventListener('click', (event) => {
      event.stopPropagation();
      void toggleFileChecked(file.id);
    });

    const removeBtn = item.querySelector('.file-item-remove') as HTMLButtonElement;
    removeBtn.addEventListener('click', (event) => {
      event.stopPropagation();
      void removeFile(file.id);
    });

    item.addEventListener('click', () => setActiveFile(file.id));
    return item;
  }

  function recalcTotals(): void {
    let totalPierces = 0;
    let totalCutLength = 0;

    for (const file of loadedFiles) {
      if (!file.checked || file.loading) continue;
      totalPierces += file.stats.totalPierces;
      totalCutLength += file.stats.totalCutLength;
    }

    const cutM = totalCutLength / 1000;
    ciPierces.textContent = String(totalPierces);
    ciLength.textContent = cutM >= 1 ? cutM.toFixed(2) + t('unit.m') : totalCutLength.toFixed(1) + t('unit.mm');
    sidebarFooter.classList.toggle('visible', loadedFiles.length > 0);

    statusPierces.textContent = totalPierces > 0 ? tx('status.pierces', { n: String(totalPierces) }) : '';
    statusCutLength.textContent = totalCutLength > 0 ? tx('status.cutLength', { len: formatCutLength(totalCutLength) }) : '';

    const checkedCount = loadedFiles.filter((file) => file.checked).length;
    statsEl.textContent = loadedFiles.length > 0
      ? tx('status.files', { checked: String(checkedCount), total: String(loadedFiles.length) })
      : '';

    updateBulkControlsUi();

    const activeFile = loadedFiles.find((file) => file.id === activeFileId);
    const activePiercePoints: Point3D[] = activeFile
      ? activeFile.stats.chains.map((chain) => chain.piercePoint)
      : [];
    renderer.setPiercePoints(activePiercePoints);
  }

  return {
    buildFileItem,
    recalcTotals,
    updateBulkControlsUi,
  };
}
