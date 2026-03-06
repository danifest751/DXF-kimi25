import {
  apiGetJSON,
  apiPostJSON,
  apiUploadArrayBuffer,
  apiUploadFormDataJSON,
} from './api.js';
import { getAuthHeaders } from './auth.js';
import type { WorkspaceFileMeta } from './auth.js';
import type { LoadedFile, UICuttingStats } from './types.js';
import { bumpNextFileId } from './state.js';
import { parseDXFInWorker } from '../../core-engine/src/workers/index.js';

interface DirectUploadTicket {
  readonly fileId: string;
  readonly workspaceId: string;
  readonly catalogId: string | null;
  readonly name: string;
  readonly storagePath: string;
  readonly sizeBytes: number;
  readonly checked: boolean;
  readonly quantity: number;
  readonly signedUrl: string;
  readonly token: string;
}

interface DirectUploadInitResponse {
  readonly success: boolean;
  readonly upload: DirectUploadTicket;
}

export async function uploadWorkspaceFileAuthenticated(
  file: File,
  buffer: ArrayBuffer,
  getPreferredUploadCatalogId: () => string | null,
): Promise<WorkspaceFileMeta> {
  const payload = {
    name: file.name,
    sizeBytes: file.size,
    catalogId: getPreferredUploadCatalogId(),
    checked: true,
    quantity: 1,
  };

  try {
    const init = await apiPostJSON<DirectUploadInitResponse>('/api/library-files-direct-upload-init', payload, getAuthHeaders());
    const directUpload = await apiUploadArrayBuffer<{ success: boolean; file: WorkspaceFileMeta }>(
      `/api/library-files-direct-upload/${encodeURIComponent(init.upload.fileId)}`,
      buffer,
      file.type || 'application/dxf',
      {
        ...getAuthHeaders(),
        'x-file-name': init.upload.name,
        'x-file-size': String(init.upload.sizeBytes),
        'x-catalog-id': init.upload.catalogId ?? '',
        'x-file-checked': String(init.upload.checked),
        'x-file-quantity': String(init.upload.quantity),
      },
    );
    return directUpload.file;
  } catch (error) {
    console.warn('Direct upload failed, falling back to multipart upload:', error);
    const formData = new FormData();
    formData.append('file', file, file.name);
    formData.append('catalogId', getPreferredUploadCatalogId() ?? '');
    formData.append('checked', 'true');
    formData.append('quantity', '1');
    const uploadResp = await apiUploadFormDataJSON<{ success: boolean; file: WorkspaceFileMeta }>('/api/library-files-upload', formData, getAuthHeaders());
    return uploadResp.file;
  }
}

export async function loadRemoteWorkspaceFile(
  meta: WorkspaceFileMeta,
  computeStats: (base64: string, doc: LoadedFile['doc']) => Promise<UICuttingStats>,
): Promise<LoadedFile> {
  const dl = await apiGetJSON<{ success: boolean; name: string; base64: string; sizeBytes: number }>(
    `/api/library-files-download?fileId=${encodeURIComponent(meta.id)}`,
    getAuthHeaders(),
  );
  const binStr = atob(dl.base64);
  const bytes = Uint8Array.from(binStr, (char) => char.charCodeAt(0));
  const buffer = bytes.buffer;
  const parsed = await parseDXFInWorker(buffer);
  const stats = await computeStats(dl.base64, parsed.document);
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
