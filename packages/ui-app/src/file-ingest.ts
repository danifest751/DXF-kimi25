import type { LoadedFile } from './types.js';
import type { ViewportSceneController } from './viewport-scene.js';

export interface FileIngestController {
  addFiles(files: File[], options?: { placeInScene?: boolean; dropClientX?: number; dropClientY?: number }): Promise<void>;
  openFileDialog(): void;
}

export function createFileIngestController(input: {
  container: HTMLDivElement;
  dropOverlay: HTMLDivElement;
  fileInput: HTMLInputElement;
  files: LoadedFile[];
  loadSingleFile: (file: File, setActiveFile: (id: number) => void) => Promise<void>;
  setActiveFile: (id: number) => void;
  syncWelcomeVisibility: () => void;
  viewportScene: ViewportSceneController;
}): FileIngestController {
  const {
    container,
    dropOverlay,
    fileInput,
    files,
    loadSingleFile,
    setActiveFile,
    syncWelcomeVisibility,
    viewportScene,
  } = input;

  const MAX_FILE_SIZE_BYTES = 200 * 1024 * 1024;
  let dragDepth = 0;

  function openFileDialog(): void {
    fileInput.click();
  }

  async function addFiles(
    addedFiles: File[],
    options?: { placeInScene?: boolean; dropClientX?: number; dropClientY?: number },
  ): Promise<void> {
    const beforeTotal = files.length;
    syncWelcomeVisibility();
    const pendingSceneAdds: Array<{ fileId: number; x: number; y: number }> = [];
    for (const file of addedFiles) {
      if (!file.name.toLowerCase().endsWith('.dxf')) continue;
      if (file.size > MAX_FILE_SIZE_BYTES) {
        alert(`Файл "${file.name}" слишком большой (${(file.size / 1024 / 1024).toFixed(1)} MB). Максимальный размер: 200 MB.`);
        continue;
      }
      const before = files.length;
      await loadSingleFile(file, setActiveFile);
      if (options?.placeInScene && files.length > before) {
        const fileId = files[files.length - 1]!.id;
        pendingSceneAdds.push({ fileId, x: 40 + pendingSceneAdds.length * 20, y: 40 + pendingSceneAdds.length * 20 });
      }
    }
    for (const entry of pendingSceneAdds) {
      const offset = pendingSceneAdds.indexOf(entry) * 20;
      const baseX = options?.dropClientX ?? container.getBoundingClientRect().left + entry.x;
      const baseY = options?.dropClientY ?? container.getBoundingClientRect().top + entry.y;
      viewportScene.addFileToScene(entry.fileId, baseX + offset, baseY + offset);
    }
    const added = files.length - beforeTotal;
    if (added > 0) {
      window.dispatchEvent(new CustomEvent('dxf-files-updated', { detail: { added } }));
    }
  }

  fileInput.addEventListener('change', () => {
    const nextFiles = fileInput.files;
    if (nextFiles && nextFiles.length > 0) {
      void addFiles(Array.from(nextFiles));
    }
    fileInput.value = '';
  });

  container.addEventListener('dragenter', (event) => {
    event.preventDefault();
    dragDepth++;
    dropOverlay.classList.add('active');
  });

  container.addEventListener('dragover', (event) => {
    event.preventDefault();
  });

  container.addEventListener('dragleave', () => {
    if (--dragDepth <= 0) {
      dragDepth = 0;
      dropOverlay.classList.remove('active');
    }
  });

  container.addEventListener('drop', (event) => {
    event.preventDefault();
    dragDepth = 0;
    dropOverlay.classList.remove('active');

    const fileIdRaw = event.dataTransfer?.getData('application/x-file-id') ?? '';
    if (fileIdRaw) {
      const fileId = Number(fileIdRaw);
      if (Number.isFinite(fileId)) {
        viewportScene.addFileToScene(fileId, event.clientX, event.clientY);
      }
      return;
    }

    if (event.dataTransfer?.files) {
      const dxfs = Array.from(event.dataTransfer.files).filter((file) => file.name.toLowerCase().endsWith('.dxf'));
      if (dxfs.length > 0) {
        void addFiles(dxfs, viewportScene.isDesktop()
          ? { placeInScene: true, dropClientX: event.clientX, dropClientY: event.clientY }
          : undefined);
      }
    }
  });

  return {
    addFiles,
    openFileDialog,
  };
}
