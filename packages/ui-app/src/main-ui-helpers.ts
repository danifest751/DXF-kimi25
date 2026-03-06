import type { DXFRenderer } from '../../core-engine/src/render/renderer.js';
import type { LoadedFile } from './types.js';

export interface MainUiHelpersController {
  setActiveFile(id: number): void;
  syncWelcomeVisibility(): void;
  updateAuthUi(): void;
  updateStatusBar(): void;
}

export function createMainUiHelpersController(input: {
  welcome: HTMLDivElement;
  renderer: DXFRenderer;
  statusZoom: HTMLSpanElement;
  statusEntities: HTMLSpanElement;
  statusVersion: HTMLSpanElement;
  loadedFiles: LoadedFile[];
  renderFileList: () => void;
  setActiveFileId: (id: number) => void;
  updateUploadTargetHint: () => void;
  applyAuthUiState: (updateUploadTargetHint: () => void) => void;
}): MainUiHelpersController {
  const {
    welcome,
    renderer,
    statusZoom,
    statusEntities,
    statusVersion,
    loadedFiles,
    renderFileList,
    setActiveFileId,
    updateUploadTargetHint,
    applyAuthUiState,
  } = input;

  function updateAuthUi(): void {
    applyAuthUiState(updateUploadTargetHint);
  }

  function updateStatusBar(): void {
    statusZoom.textContent = `${(renderer.camera.zoom * 100).toFixed(0)}%`;
  }

  function syncWelcomeVisibility(): void {
    welcome.classList.toggle('hidden', loadedFiles.length > 0);
  }

  function setActiveFile(id: number): void {
    setActiveFileId(id);
    const entry = loadedFiles.find((file) => file.id === id);
    if (!entry) return;
    syncWelcomeVisibility();
    if (entry.loading || entry.doc == null) {
      renderer.clearDocument();
      statusEntities.textContent = '…';
      statusVersion.textContent = '';
      renderFileList();
      return;
    }
    renderer.setDocument(entry.doc);
    renderer.setPiercePoints(entry.stats.chains.map((chain) => chain.piercePoint));
    updateStatusBar();
    statusEntities.textContent = `${entry.doc.entityCount} obj`;
    statusVersion.textContent = entry.doc.source.metadata.version;
    renderFileList();
  }

  return {
    setActiveFile,
    syncWelcomeVisibility,
    updateAuthUi,
    updateStatusBar,
  };
}
