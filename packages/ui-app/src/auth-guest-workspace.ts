import type { ResolvedGuestDraftFile } from './auth-guest-draft-helpers.js';
import type { LoadedFile } from './types.js';

export function resetWorkspaceToGuestState(input: {
  workspaceCatalogs: Array<{ id: string }>;
  selectedCatalogIds: Set<string>;
  loadedFiles: LoadedFile[];
  clearActiveFile: () => void;
  clearRendererDocument: () => void;
  showWelcome: () => void;
}): void {
  const {
    workspaceCatalogs,
    selectedCatalogIds,
    loadedFiles,
    clearActiveFile,
    clearRendererDocument,
    showWelcome,
  } = input;

  workspaceCatalogs.splice(0, workspaceCatalogs.length);
  selectedCatalogIds.clear();
  loadedFiles.splice(0, loadedFiles.length);
  clearActiveFile();
  clearRendererDocument();
  showWelcome();
}

export async function restoreGuestDraftFilesIntoWorkspace(input: {
  guestFiles: ResolvedGuestDraftFile[];
  loadedFiles: LoadedFile[];
  bumpNextFileId: () => number;
  base64ToArrayBuffer: (base64: string) => ArrayBuffer;
  parseDXF: (buffer: ArrayBuffer) => Promise<{ document: LoadedFile['doc'] }>;
  computeStats: (base64: string, doc: LoadedFile['doc']) => Promise<LoadedFile['stats']>;
}): Promise<void> {
  const {
    guestFiles,
    loadedFiles,
    bumpNextFileId,
    base64ToArrayBuffer,
    parseDXF,
    computeStats,
  } = input;

  const MAX_GUEST_FILE_SIZE_B64 = 270_000_000;
  const MAX_GUEST_FILES = 50;
  let restored = 0;

  for (const file of guestFiles) {
    if (restored >= MAX_GUEST_FILES) break;
    if (!file.base64 || file.base64.length > MAX_GUEST_FILE_SIZE_B64) continue;
    restored++;
    const buffer = base64ToArrayBuffer(file.base64);
    const result = await parseDXF(buffer);
    const stats = await computeStats(file.base64, result.document);
    loadedFiles.push({
      id: bumpNextFileId(),
      remoteId: '',
      workspaceId: '',
      catalogId: null,
      guestDraftId: file.id,
      name: file.name,
      localBase64: file.base64,
      doc: result.document,
      stats,
      checked: Boolean(file.checked),
      quantity: Math.max(1, Number(file.quantity) || 1),
    });
  }
}

export async function migrateGuestDraftFilesToWorkspace(input: {
  guestFiles: ResolvedGuestDraftFile[];
  uploadGuestDraftFile: (file: ResolvedGuestDraftFile) => Promise<void>;
}): Promise<void> {
  const { guestFiles, uploadGuestDraftFile } = input;
  const MAX_MIGRATE_FILES = 50;
  let migrated = 0;

  for (const file of guestFiles) {
    if (migrated >= MAX_MIGRATE_FILES) break;
    if (!file.name.toLowerCase().endsWith('.dxf')) continue;
    if (!file.base64) continue;
    migrated++;
    try {
      await uploadGuestDraftFile(file);
    } catch (err) {
      console.warn('Failed to migrate file:', file.name, err instanceof Error ? err.message : String(err));
    }
  }
}
