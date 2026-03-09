import express, { Router, type Request, type Response } from 'express';
import multer from 'multer';
import {
  createSignedWorkspaceFileUpload,
  createWorkspaceCatalog,
  deleteWorkspaceCatalog,
  deleteWorkspaceFile,
  downloadWorkspaceFile,
  finalizeSignedWorkspaceFileUpload,
  getFileMaterials,
  isWorkspaceLibraryEnabled,
  listWorkspaceLibrary,
  renameWorkspaceCatalog,
  setWorkspaceFilesChecked,
  updateWorkspaceFile,
  upsertFileMaterial,
  uploadWorkspaceFile,
  uploadWorkspaceFileBuffer,
  uploadWorkspaceFileBufferWithId,
} from './workspace-library.js';
import { requireWorkspaceId } from './middleware/auth.js';
import { MAX_DXF_BASE64_LEN } from './routes-dxf.js';

const router = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 200 * 1024 * 1024, files: 1 },
});

const MAX_LIBRARY_FILE_QTY = 10_000;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isValidCatalogIdInput(value: string | null): boolean {
  return value === null || UUID_RE.test(value);
}

function parseQuantityInput(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  const normalized = Math.floor(value);
  if (normalized < 1 || normalized > MAX_LIBRARY_FILE_QTY) return null;
  return normalized;
}

function parseQuantityStringInput(value: string): number | null {
  if (!value) return 1;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return null;
  const normalized = Math.floor(parsed);
  if (normalized < 1 || normalized > MAX_LIBRARY_FILE_QTY) return null;
  return normalized;
}

function parseBooleanStringInput(value: string): boolean | null {
  if (!value) return true;
  if (value === 'true') return true;
  if (value === 'false') return false;
  return null;
}

function decodeHeaderFileName(value: string): string {
  try { return decodeURIComponent(value); } catch { return value; }
}

function normalizeUploadedFileName(formValue: unknown, originalName: string | undefined, fallbackName: string): string {
  if (typeof formValue === 'string' && formValue.trim().length > 0) {
    try { return decodeURIComponent(formValue).trim(); } catch { return formValue.trim(); }
  }
  if (typeof originalName === 'string' && originalName.trim().length > 0) {
    try {
      const decoded = Buffer.from(originalName, 'latin1').toString('utf8').trim();
      if (decoded.length > 0) return decoded;
    } catch {}
    return originalName.trim();
  }
  return fallbackName;
}

function libRequired(res: Response): boolean {
  if (!isWorkspaceLibraryEnabled()) {
    res.status(503).json({ error: 'Workspace library storage is not configured' });
    return false;
  }
  return true;
}

// ─── Catalog routes ───────────────────────────────────────────────────

router.get(['/library/tree', '/library-tree'], async (req: Request, res: Response): Promise<void> => {
  try {
    if (!libRequired(res)) return;
    const workspaceId = await requireWorkspaceId(req, res);
    if (!workspaceId) return;
    const data = await listWorkspaceLibrary(workspaceId);
    res.json({ success: true, ...data });
  } catch (error) {
    res.status(500).json({ error: 'Library tree failed', details: error instanceof Error ? error.message : 'Unknown error' });
  }
});

router.post(['/library/catalogs', '/library-catalogs'], async (req: Request, res: Response): Promise<void> => {
  try {
    if (!libRequired(res)) return;
    const workspaceId = await requireWorkspaceId(req, res);
    if (!workspaceId) return;
    const name = typeof req.body?.name === 'string' ? req.body.name : '';
    const catalog = await createWorkspaceCatalog(workspaceId, name);
    res.json({ success: true, catalog });
  } catch (error) {
    res.status(500).json({ error: 'Create catalog failed', details: error instanceof Error ? error.message : 'Unknown error' });
  }
});

router.patch(['/library/catalogs/:catalogId', '/library-catalogs/:catalogId', '/library-catalogs-update'], async (req: Request, res: Response): Promise<void> => {
  try {
    if (!libRequired(res)) return;
    const workspaceId = await requireWorkspaceId(req, res);
    if (!workspaceId) return;
    const catalogId = req.params.catalogId ?? (typeof req.body?.catalogId === 'string' ? req.body.catalogId : '');
    const name = typeof req.body?.name === 'string' ? req.body.name : '';
    await renameWorkspaceCatalog(workspaceId, catalogId, name);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Rename catalog failed', details: error instanceof Error ? error.message : 'Unknown error' });
  }
});

router.delete(['/library/catalogs/:catalogId', '/library-catalogs/:catalogId'], async (req: Request, res: Response): Promise<void> => {
  try {
    if (!libRequired(res)) return;
    const workspaceId = await requireWorkspaceId(req, res);
    if (!workspaceId) return;
    const catalogId = req.params.catalogId ?? '';
    const modeRaw = typeof req.query?.mode === 'string' ? req.query.mode : '';
    const mode = modeRaw === 'delete_files' ? 'delete_files' : 'move_to_uncategorized';
    await deleteWorkspaceCatalog(workspaceId, catalogId, mode);
    res.json({ success: true, mode });
  } catch (error) {
    res.status(500).json({ error: 'Delete catalog failed', details: error instanceof Error ? error.message : 'Unknown error' });
  }
});

router.post('/library-catalogs-delete', async (req: Request, res: Response): Promise<void> => {
  try {
    if (!libRequired(res)) return;
    const workspaceId = await requireWorkspaceId(req, res);
    if (!workspaceId) return;
    const catalogId = typeof req.body?.catalogId === 'string' ? req.body.catalogId : '';
    const modeRaw = typeof req.body?.mode === 'string' ? req.body.mode : '';
    const mode = modeRaw === 'delete_files' ? 'delete_files' : 'move_to_uncategorized';
    await deleteWorkspaceCatalog(workspaceId, catalogId, mode);
    res.json({ success: true, mode });
  } catch (error) {
    res.status(500).json({ error: 'Delete catalog failed', details: error instanceof Error ? error.message : 'Unknown error' });
  }
});

// ─── File routes ──────────────────────────────────────────────────────

router.post(['/library/files', '/library-files'], async (req: Request, res: Response): Promise<void> => {
  try {
    if (!libRequired(res)) return;
    const workspaceId = await requireWorkspaceId(req, res);
    if (!workspaceId) return;
    const name = typeof req.body?.name === 'string' ? req.body.name : '';
    const base64 = typeof req.body?.base64 === 'string' ? req.body.base64 : '';
    const catalogId = typeof req.body?.catalogId === 'string' ? req.body.catalogId : null;
    const checked = typeof req.body?.checked === 'boolean' ? req.body.checked : true;
    const quantity = parseQuantityInput(typeof req.body?.quantity === 'number' ? req.body.quantity : 1);
    if (!name.trim()) { res.status(400).json({ error: 'name is required' }); return; }
    if (!base64) { res.status(400).json({ error: 'base64 is required' }); return; }
    if (base64.length > MAX_DXF_BASE64_LEN) { res.status(413).json({ error: 'DXF file too large (max 200 MB)' }); return; }
    if (!isValidCatalogIdInput(catalogId)) { res.status(400).json({ error: 'catalogId must be a UUID or null' }); return; }
    if (quantity === null) { res.status(400).json({ error: `quantity must be an integer between 1 and ${MAX_LIBRARY_FILE_QTY}` }); return; }
    const file = await uploadWorkspaceFile({ workspaceId, name, base64, catalogId, checked, quantity });
    res.json({ success: true, file });
  } catch (error) {
    res.status(500).json({ error: 'Upload file failed', details: error instanceof Error ? error.message : 'Unknown error' });
  }
});

router.post(['/library/files/upload', '/library-files-upload'], upload.single('file'), async (req: Request, res: Response): Promise<void> => {
  try {
    if (!libRequired(res)) return;
    const workspaceId = await requireWorkspaceId(req, res);
    if (!workspaceId) return;
    const uploaded = req.file;
    if (!uploaded || !uploaded.buffer || uploaded.buffer.byteLength === 0) { res.status(400).json({ error: 'Missing uploaded file' }); return; }
    const catalogIdRaw = typeof req.body?.catalogId === 'string' ? req.body.catalogId.trim() : '';
    const checkedRaw = typeof req.body?.checked === 'string' ? req.body.checked.trim().toLowerCase() : '';
    const quantityRaw = typeof req.body?.quantity === 'string' ? req.body.quantity.trim() : '';
    const normalizedFileName = normalizeUploadedFileName(req.body?.fileName, uploaded.originalname, uploaded.fieldname || 'upload.dxf');
    const checked = parseBooleanStringInput(checkedRaw);
    const quantity = parseQuantityStringInput(quantityRaw);
    if (!normalizedFileName) { res.status(400).json({ error: 'Uploaded file name is required' }); return; }
    if (catalogIdRaw.length > 0 && !isValidCatalogIdInput(catalogIdRaw)) { res.status(400).json({ error: 'catalogId must be a UUID or empty' }); return; }
    if (checked === null) { res.status(400).json({ error: 'checked must be true or false' }); return; }
    if (quantity === null) { res.status(400).json({ error: `quantity must be an integer between 1 and ${MAX_LIBRARY_FILE_QTY}` }); return; }
    const file = await uploadWorkspaceFileBuffer({ workspaceId, name: normalizedFileName, bodyBuffer: uploaded.buffer, catalogId: catalogIdRaw.length > 0 ? catalogIdRaw : null, checked, quantity });
    res.json({ success: true, file });
  } catch (error) {
    res.status(500).json({ error: 'Multipart upload file failed', details: error instanceof Error ? error.message : 'Unknown error' });
  }
});

router.post(['/library/files/direct-upload-init', '/library-files-direct-upload-init'], async (req: Request, res: Response): Promise<void> => {
  try {
    if (!libRequired(res)) return;
    const workspaceId = await requireWorkspaceId(req, res);
    if (!workspaceId) return;
    const name = typeof req.body?.name === 'string' ? req.body.name : '';
    const sizeBytes = typeof req.body?.sizeBytes === 'number' ? req.body.sizeBytes : NaN;
    const catalogId = req.body?.catalogId === null || typeof req.body?.catalogId === 'string' ? req.body.catalogId : null;
    const checked = typeof req.body?.checked === 'boolean' ? req.body.checked : true;
    const quantity = parseQuantityInput(typeof req.body?.quantity === 'number' ? req.body.quantity : 1);
    if (!name.trim()) { res.status(400).json({ error: 'name is required' }); return; }
    if (!Number.isFinite(sizeBytes) || sizeBytes < 1) { res.status(400).json({ error: 'sizeBytes must be a positive number' }); return; }
    if (!isValidCatalogIdInput(catalogId)) { res.status(400).json({ error: 'catalogId must be a UUID or null' }); return; }
    if (quantity === null) { res.status(400).json({ error: `quantity must be an integer between 1 and ${MAX_LIBRARY_FILE_QTY}` }); return; }
    const result = await createSignedWorkspaceFileUpload({ workspaceId, name, sizeBytes, catalogId, checked, quantity });
    res.json({ success: true, upload: result });
  } catch (error) {
    res.status(500).json({ error: 'Direct upload init failed', details: error instanceof Error ? error.message : 'Unknown error' });
  }
});

router.post(['/library/files/direct-upload', '/library-files-direct-upload'], upload.single('file'), async (req: Request, res: Response): Promise<void> => {
  try {
    if (!libRequired(res)) return;
    const workspaceId = await requireWorkspaceId(req, res);
    if (!workspaceId) return;
    const uploaded = req.file;
    if (!uploaded || !uploaded.buffer || uploaded.buffer.byteLength === 0) { res.status(400).json({ error: 'Missing uploaded file' }); return; }
    const fileId = typeof req.body?.fileId === 'string' ? req.body.fileId.trim() : '';
    const catalogIdRaw = typeof req.body?.catalogId === 'string' ? req.body.catalogId.trim() : '';
    const checkedRaw = typeof req.body?.checked === 'string' ? req.body.checked.trim().toLowerCase() : '';
    const quantityRaw = typeof req.body?.quantity === 'string' ? req.body.quantity.trim() : '';
    const normalizedFileName = normalizeUploadedFileName(req.body?.fileName, uploaded.originalname, uploaded.fieldname || 'upload.dxf');
    const checked = parseBooleanStringInput(checkedRaw);
    const quantity = parseQuantityStringInput(quantityRaw);
    if (!fileId) { res.status(400).json({ error: 'fileId is required' }); return; }
    if (!normalizedFileName) { res.status(400).json({ error: 'Uploaded file name is required' }); return; }
    if (catalogIdRaw.length > 0 && !isValidCatalogIdInput(catalogIdRaw)) { res.status(400).json({ error: 'catalogId must be a UUID or empty' }); return; }
    if (checked === null) { res.status(400).json({ error: 'checked must be true or false' }); return; }
    if (quantity === null) { res.status(400).json({ error: `quantity must be an integer between 1 and ${MAX_LIBRARY_FILE_QTY}` }); return; }
    const file = await uploadWorkspaceFileBufferWithId({ workspaceId, fileId, name: normalizedFileName, bodyBuffer: uploaded.buffer, catalogId: catalogIdRaw.length > 0 ? catalogIdRaw : null, checked, quantity });
    res.json({ success: true, file });
  } catch (error) {
    res.status(500).json({ error: 'Multipart direct upload file failed', details: error instanceof Error ? error.message : 'Unknown error' });
  }
});

router.put(
  ['/library/files/direct-upload', '/library-files-direct-upload', '/library/files/direct-upload/:fileId', '/library-files-direct-upload/:fileId'],
  express.raw({ type: '*/*', limit: '200mb' }),
  async (req: Request, res: Response): Promise<void> => {
    try {
      if (!libRequired(res)) return;
      const workspaceId = await requireWorkspaceId(req, res);
      if (!workspaceId) return;
      const fileIdHeader = typeof req.header('x-file-id') === 'string' ? req.header('x-file-id')! : '';
      const fileId = typeof req.params.fileId === 'string' && req.params.fileId.length > 0 ? req.params.fileId : fileIdHeader;
      const name = decodeHeaderFileName(typeof req.header('x-file-name') === 'string' ? req.header('x-file-name')! : '');
      const sizeBytes = Number(req.header('x-file-size') ?? NaN);
      const catalogIdHeader = req.header('x-catalog-id');
      const checkedHeader = req.header('x-file-checked') ?? 'true';
      const quantityHeader = req.header('x-file-quantity') ?? '1';
      const catalogId = catalogIdHeader && catalogIdHeader.trim().length > 0 ? catalogIdHeader : null;
      const checked = parseBooleanStringInput(checkedHeader.trim().toLowerCase());
      const quantity = parseQuantityStringInput(quantityHeader.trim());
      const body = req.body;
      const bodyBuffer = Buffer.isBuffer(body) ? body : body instanceof Uint8Array ? Buffer.from(body) : Buffer.alloc(0);
      if (!fileId) { res.status(400).json({ error: 'fileId is required' }); return; }
      if (!name.trim()) { res.status(400).json({ error: 'x-file-name header is required' }); return; }
      if (!Number.isFinite(sizeBytes) || sizeBytes < 1) { res.status(400).json({ error: 'x-file-size header must be a positive number' }); return; }
      if (!isValidCatalogIdInput(catalogId)) { res.status(400).json({ error: 'x-catalog-id must be a UUID or empty' }); return; }
      if (checked === null) { res.status(400).json({ error: 'x-file-checked must be true or false' }); return; }
      if (quantity === null) { res.status(400).json({ error: `x-file-quantity must be an integer between 1 and ${MAX_LIBRARY_FILE_QTY}` }); return; }
      if (bodyBuffer.byteLength === 0) { res.status(400).json({ error: 'Missing uploaded file body' }); return; }
      if (bodyBuffer.byteLength !== sizeBytes) { res.status(400).json({ error: 'Uploaded file size does not match x-file-size header' }); return; }
      const file = await uploadWorkspaceFileBufferWithId({ workspaceId, fileId, name, bodyBuffer, catalogId, checked, quantity });
      res.json({ success: true, file });
    } catch (error) {
      res.status(500).json({ error: 'Binary direct upload failed', details: error instanceof Error ? error.message : 'Unknown error' });
    }
  },
);

router.post(['/library/files/direct-upload-complete', '/library-files-direct-upload-complete'], async (req: Request, res: Response): Promise<void> => {
  try {
    if (!libRequired(res)) return;
    const workspaceId = await requireWorkspaceId(req, res);
    if (!workspaceId) return;
    const fileId = typeof req.body?.fileId === 'string' ? req.body.fileId : '';
    const name = typeof req.body?.name === 'string' ? req.body.name : '';
    const sizeBytes = typeof req.body?.sizeBytes === 'number' ? req.body.sizeBytes : NaN;
    const catalogId = req.body?.catalogId === null || typeof req.body?.catalogId === 'string' ? req.body.catalogId : null;
    const checked = typeof req.body?.checked === 'boolean' ? req.body.checked : true;
    const quantity = parseQuantityInput(typeof req.body?.quantity === 'number' ? req.body.quantity : 1);
    if (!fileId) { res.status(400).json({ error: 'fileId is required' }); return; }
    if (!name.trim()) { res.status(400).json({ error: 'name is required' }); return; }
    if (!Number.isFinite(sizeBytes) || sizeBytes < 1) { res.status(400).json({ error: 'sizeBytes must be a positive number' }); return; }
    if (!isValidCatalogIdInput(catalogId)) { res.status(400).json({ error: 'catalogId must be a UUID or null' }); return; }
    if (quantity === null) { res.status(400).json({ error: `quantity must be an integer between 1 and ${MAX_LIBRARY_FILE_QTY}` }); return; }
    const file = await finalizeSignedWorkspaceFileUpload({ workspaceId, fileId, name, sizeBytes, catalogId, checked, quantity });
    res.json({ success: true, file });
  } catch (error) {
    res.status(500).json({ error: 'Direct upload finalize failed', details: error instanceof Error ? error.message : 'Unknown error' });
  }
});

router.patch(['/library/files/:fileId', '/library-files/:fileId', '/library-files-update'], async (req: Request, res: Response): Promise<void> => {
  try {
    if (!libRequired(res)) return;
    const workspaceId = await requireWorkspaceId(req, res);
    if (!workspaceId) return;
    const fileId = req.params.fileId ?? (typeof req.body?.fileId === 'string' ? req.body.fileId : '');
    if (!fileId) { res.status(400).json({ error: 'fileId is required' }); return; }
    const patch: { name?: string; catalogId?: string | null; checked?: boolean; quantity?: number } = {};
    if (typeof req.body?.name === 'string') patch.name = req.body.name;
    if (req.body?.catalogId === null || typeof req.body?.catalogId === 'string') patch.catalogId = req.body.catalogId;
    if (typeof req.body?.checked === 'boolean') patch.checked = req.body.checked;
    if (req.body?.quantity !== undefined) {
      const quantity = parseQuantityInput(req.body.quantity);
      if (quantity === null) { res.status(400).json({ error: `quantity must be an integer between 1 and ${MAX_LIBRARY_FILE_QTY}` }); return; }
      patch.quantity = quantity;
    }
    if (patch.catalogId !== undefined && !isValidCatalogIdInput(patch.catalogId)) { res.status(400).json({ error: 'catalogId must be a UUID or null' }); return; }
    if (Object.keys(patch).length === 0) { res.status(400).json({ error: 'At least one patch field is required' }); return; }
    await updateWorkspaceFile(workspaceId, fileId, patch);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Update file failed', details: error instanceof Error ? error.message : 'Unknown error' });
  }
});

router.delete(['/library/files/:fileId', '/library-files/:fileId'], async (req: Request, res: Response): Promise<void> => {
  try {
    if (!libRequired(res)) return;
    const workspaceId = await requireWorkspaceId(req, res);
    if (!workspaceId) return;
    const fileId = req.params.fileId ?? (typeof req.query?.fileId === 'string' ? req.query.fileId : '') ?? (typeof req.body?.fileId === 'string' ? req.body.fileId : '');
    if (!fileId) { res.status(400).json({ error: 'fileId is required' }); return; }
    await deleteWorkspaceFile(workspaceId, fileId);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Delete file failed', details: error instanceof Error ? error.message : 'Unknown error' });
  }
});

router.post('/library-files-delete', async (req: Request, res: Response): Promise<void> => {
  try {
    if (!libRequired(res)) return;
    const workspaceId = await requireWorkspaceId(req, res);
    if (!workspaceId) return;
    const fileId = typeof req.body?.fileId === 'string' ? req.body.fileId : '';
    if (!fileId) { res.status(400).json({ error: 'fileId is required' }); return; }
    await deleteWorkspaceFile(workspaceId, fileId);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Delete file failed', details: error instanceof Error ? error.message : 'Unknown error' });
  }
});

router.post(['/library/files/check-all', '/library-files-check-all'], async (req: Request, res: Response): Promise<void> => {
  try {
    if (!libRequired(res)) return;
    const workspaceId = await requireWorkspaceId(req, res);
    if (!workspaceId) return;
    const checked = typeof req.body?.checked === 'boolean' ? req.body.checked : true;
    const catalogIds = Array.isArray(req.body?.catalogIds) ? (req.body.catalogIds.filter((id: unknown): id is string => typeof id === 'string')) : undefined;
    await setWorkspaceFilesChecked(workspaceId, checked, catalogIds);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Check-all failed', details: error instanceof Error ? error.message : 'Unknown error' });
  }
});

router.get(['/library/files/:fileId/download', '/library-files/:fileId-download', '/library-files-download'], async (req: Request, res: Response): Promise<void> => {
  try {
    if (!libRequired(res)) return;
    const workspaceId = await requireWorkspaceId(req, res);
    if (!workspaceId) return;
    const fileId = req.params.fileId ?? (typeof req.query?.fileId === 'string' ? req.query.fileId : '') ?? (typeof req.body?.fileId === 'string' ? req.body.fileId : '');
    if (!fileId) { res.status(400).json({ error: 'fileId is required' }); return; }
    const file = await downloadWorkspaceFile(workspaceId, fileId);
    res.json({ success: true, ...file });
  } catch (error) {
    res.status(500).json({ error: 'Download file failed', details: error instanceof Error ? error.message : 'Unknown error' });
  }
});

// ─── Materials routes ─────────────────────────────────────────────────

router.get('/file-materials', async (req: Request, res: Response): Promise<void> => {
  try {
    if (!libRequired(res)) return;
    const workspaceId = await requireWorkspaceId(req, res);
    if (!workspaceId) return;
    const data = await getFileMaterials(workspaceId);
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ error: 'Get file materials failed', details: error instanceof Error ? error.message : 'Unknown error' });
  }
});

router.post('/file-materials-upsert', async (req: Request, res: Response): Promise<void> => {
  try {
    if (!libRequired(res)) return;
    const workspaceId = await requireWorkspaceId(req, res);
    if (!workspaceId) return;
    const fileId = typeof req.body?.fileId === 'string' ? req.body.fileId.trim() : '';
    const materialId = typeof req.body?.materialId === 'string' ? req.body.materialId.trim() : '';
    if (!fileId) { res.status(400).json({ error: 'fileId is required' }); return; }
    if (!materialId) { res.status(400).json({ error: 'materialId is required' }); return; }
    await upsertFileMaterial(workspaceId, fileId, materialId);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Upsert file material failed', details: error instanceof Error ? error.message : 'Unknown error' });
  }
});

export default router;
