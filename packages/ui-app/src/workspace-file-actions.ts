import { apiPatchJSON, apiPostJSON, arrayBufferToBase64 } from './api.js';
import type { WorkspaceFileMeta } from './auth.js';
import { tx } from './i18n/index.js';
import type { LoadedFile } from './types.js';
import { parseDXFInWorker } from '../../core-engine/src/workers/index.js';

export interface WorkspaceFileActionsController {
  loadSingleFile(file: File, setActiveFileFn: (id: number) => void): Promise<void>;
  removeFile(id: number, setActiveFileFn: (id: number) => void): Promise<void>;
  toggleFileChecked(id: number): Promise<void>;
}

export function createWorkspaceFileActionsController(input: {
  progressBar: HTMLDivElement;
  progressFill: HTMLDivElement;
  progressLabel: HTMLSpanElement;
  getAuthSessionToken: () => string;
  getAuthHeaders: () => Record<string, string>;
  getPreferredUploadCatalogId: () => string | null;
  uploadWorkspaceFileAuthenticated: (
    file: File,
    buffer: ArrayBuffer,
    getPreferredUploadCatalogId: () => string | null,
  ) => Promise<WorkspaceFileMeta>;
  loadedFiles: LoadedFile[];
  getActiveFileId: () => number;
  bumpNextFileId: () => number;
  computeStats: (base64: string, doc: LoadedFile['doc']) => Promise<LoadedFile['stats']>;
  setActiveFileId: (id: number) => void;
  clearRendererDocument: () => void;
  clearStatusBar: () => void;
  refreshCatalogSelectionViews: () => void;
  refreshFileMetrics: () => void;
  syncWelcomeVisibility: () => void;
  saveGuestDraft: () => void;
}): WorkspaceFileActionsController {
  const {
    progressBar,
    progressFill,
    progressLabel,
    getAuthSessionToken,
    getAuthHeaders,
    getPreferredUploadCatalogId,
    uploadWorkspaceFileAuthenticated,
    loadedFiles,
    getActiveFileId,
    bumpNextFileId,
    computeStats,
    setActiveFileId,
    clearRendererDocument,
    clearStatusBar,
    refreshCatalogSelectionViews,
    refreshFileMetrics,
    syncWelcomeVisibility,
    saveGuestDraft,
  } = input;

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
    base64: string,
    doc: LoadedFile['doc'],
    stats: LoadedFile['stats'],
  ): Promise<LoadedFile> {
    if (getAuthSessionToken()) {
      const uploadedFile = await uploadWorkspaceFileAuthenticated(file, getPreferredUploadCatalogId);
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
    if (!getAuthSessionToken() || !remoteId) return;
    try {
      await apiPostJSON<{ success: boolean }>('/api/library-files-delete', {
        fileId: remoteId,
      }, getAuthHeaders());
    } catch (error) {
      console.error('Delete file failed:', error);
    }
  }

  async function persistRemoteFileChecked(entry: LoadedFile): Promise<void> {
    if (!getAuthSessionToken() || !entry.remoteId) return;
    try {
      await apiPatchJSON<{ success: boolean }>('/api/library-files-update', {
        fileId: entry.remoteId,
        checked: entry.checked,
      }, getAuthHeaders());
    } catch (error) {
      console.error('Toggle file checked failed:', error);
    }
  }

  async function loadSingleFile(file: File, setActiveFileFn: (id: number) => void): Promise<void> {
    beginWorkspaceLoadProgress(file.name);

    try {
      const buffer = await file.arrayBuffer();
      const base64 = arrayBufferToBase64(buffer);
      const result = await parseDXFInWorker(buffer, {
        onProgress(progress) {
          updateWorkspaceLoadProgress(progress.bytesProcessed, progress.totalBytes);
        },
      });

      completeWorkspaceLoadProgress();

      const stats = await computeStats(base64, result.document);
      const entry = await createLoadedWorkspaceEntry(file, base64, result.document, stats);
      loadedFiles.push(entry);
      setActiveFileFn(entry.id);
      refreshCatalogSelectionViews();
      saveGuestDraft();
      window.dispatchEvent(new CustomEvent('dxf-files-updated', { detail: { added: 1, batchDone: true } }));
      window.dispatchEvent(new CustomEvent('dxf-file-ready', { detail: { fileId: entry.id } }));
    } catch (error) {
      failWorkspaceLoadProgress();
      const msg = error instanceof Error ? error.message : String(error);
      alert(tx('workspace.loadError', { name: file.name, msg }));
    }
  }

  async function removeFile(id: number, setActiveFileFn: (id: number) => void): Promise<void> {
    const idx = loadedFiles.findIndex((file) => file.id === id);
    if (idx < 0) return;
    const target = loadedFiles[idx]!;
    await deleteRemoteWorkspaceFile(target.remoteId);
    loadedFiles.splice(idx, 1);

    if (loadedFiles.length === 0) {
      setActiveFileId(-1);
      clearRendererDocument();
      clearStatusBar();
      syncWelcomeVisibility();
    } else if (getActiveFileId() === id) {
      setActiveFileFn(loadedFiles[Math.min(idx, loadedFiles.length - 1)]!.id);
    }
    refreshCatalogSelectionViews();
  }

  async function toggleFileChecked(id: number): Promise<void> {
    const entry = loadedFiles.find((file) => file.id === id);
    if (!entry) return;
    entry.checked = !entry.checked;
    await persistRemoteFileChecked(entry);
    refreshFileMetrics();
    saveGuestDraft();
  }

  return {
    loadSingleFile,
    removeFile,
    toggleFileChecked,
  };
}
