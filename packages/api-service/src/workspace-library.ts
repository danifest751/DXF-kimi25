import crypto from 'node:crypto';
import { supabaseEnabled, supabaseRequest, supabaseStorageRequest } from './supabase-client.js';

export interface WorkspaceCatalog {
  readonly id: string;
  readonly workspaceId: string;
  readonly name: string;
  readonly createdAt: number;
  readonly updatedAt: number;
}

export interface WorkspaceFileMeta {
  readonly id: string;
  readonly workspaceId: string;
  readonly catalogId: string | null;
  readonly name: string;
  readonly storagePath: string;
  readonly sizeBytes: number;
  readonly checked: boolean;
  readonly quantity: number;
  readonly createdAt: number;
  readonly updatedAt: number;
}

interface WorkspaceCatalogRow {
  readonly id: string;
  readonly workspace_id: string;
  readonly name: string;
  readonly created_at: string;
  readonly updated_at: string;
}

interface WorkspaceFileRow {
  readonly id: string;
  readonly workspace_id: string;
  readonly catalog_id: string | null;
  readonly name: string;
  readonly storage_path: string;
  readonly size_bytes: number;
  readonly checked: boolean;
  readonly quantity: number;
  readonly created_at: string;
  readonly updated_at: string;
}

const WORKSPACE_CATALOGS_TABLE = process.env.SUPABASE_WORKSPACE_CATALOGS_TABLE?.trim() || 'workspace_catalogs';
const WORKSPACE_FILES_TABLE = process.env.SUPABASE_WORKSPACE_FILES_TABLE?.trim() || 'workspace_files';
const DXF_FILES_BUCKET = process.env.SUPABASE_DXF_FILES_BUCKET?.trim() || 'dxf-files';


const MAX_FILES_PER_WORKSPACE = 200;
const MAX_CATALOGS_PER_WORKSPACE = 20;

export function isWorkspaceLibraryEnabled(): boolean {
  return supabaseEnabled;
}

async function countRows(table: string, workspaceId: string): Promise<number> {
  const params = new URLSearchParams({
    select: 'id',
    workspace_id: `eq.${workspaceId}`,
  });
  const resp = await supabaseRequest(`/${table}?${params.toString()}`, {
    method: 'HEAD',
    headers: { Prefer: 'count=exact' },
  });
  if (!resp) return 0;
  const countHeader = resp.headers.get('content-range') ?? '';
  const match = countHeader.match(/\/(\d+)$/);
  return match ? Number(match[1]) : 0;
}

function toCatalog(row: WorkspaceCatalogRow): WorkspaceCatalog {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    name: row.name,
    createdAt: Date.parse(row.created_at),
    updatedAt: Date.parse(row.updated_at),
  };
}

function toFileMeta(row: WorkspaceFileRow): WorkspaceFileMeta {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    catalogId: row.catalog_id,
    name: row.name,
    storagePath: row.storage_path,
    sizeBytes: row.size_bytes,
    checked: row.checked,
    quantity: row.quantity,
    createdAt: Date.parse(row.created_at),
    updatedAt: Date.parse(row.updated_at),
  };
}

function encodeStoragePath(path: string): string {
  return path
    .split('/')
    .map((part) => encodeURIComponent(part))
    .join('/');
}


export async function listWorkspaceLibrary(workspaceId: string): Promise<{ catalogs: WorkspaceCatalog[]; files: WorkspaceFileMeta[] }> {
  if (!supabaseEnabled) return { catalogs: [], files: [] };

  const catalogParams = new URLSearchParams({
    select: 'id,workspace_id,name,created_at,updated_at',
    workspace_id: `eq.${workspaceId}`,
    order: 'created_at.asc',
  });
  const fileParams = new URLSearchParams({
    select: 'id,workspace_id,catalog_id,name,storage_path,size_bytes,checked,quantity,created_at,updated_at',
    workspace_id: `eq.${workspaceId}`,
    order: 'created_at.asc',
  });

  const [catalogResp, fileResp] = await Promise.all([
    supabaseRequest(`/${WORKSPACE_CATALOGS_TABLE}?${catalogParams.toString()}`),
    supabaseRequest(`/${WORKSPACE_FILES_TABLE}?${fileParams.toString()}`),
  ]);

  if (!catalogResp?.ok) {
    throw new Error('Failed to load catalogs');
  }
  if (!fileResp?.ok) {
    throw new Error('Failed to load files');
  }

  const catalogRows = await catalogResp.json() as WorkspaceCatalogRow[];
  const fileRows = await fileResp.json() as WorkspaceFileRow[];
  return {
    catalogs: Array.isArray(catalogRows) ? catalogRows.map(toCatalog) : [],
    files: Array.isArray(fileRows) ? fileRows.map(toFileMeta) : [],
  };
}

export async function createWorkspaceCatalog(workspaceId: string, nameInput: string): Promise<WorkspaceCatalog> {
  if (!supabaseEnabled) throw new Error('Workspace library storage is not configured');
  const name = nameInput.trim();
  if (name.length < 1) throw new Error('Catalog name is required');

  const count = await countRows(WORKSPACE_CATALOGS_TABLE, workspaceId);
  if (count >= MAX_CATALOGS_PER_WORKSPACE) {
    throw new Error(`Лимит: максимум ${MAX_CATALOGS_PER_WORKSPACE} каталогов на workspace`);
  }

  const nowIso = new Date().toISOString();
  const row: WorkspaceCatalogRow = {
    id: crypto.randomUUID(),
    workspace_id: workspaceId,
    name,
    created_at: nowIso,
    updated_at: nowIso,
  };

  const response = await supabaseRequest(`/${WORKSPACE_CATALOGS_TABLE}`, {
    method: 'POST',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify([row]),
  });
  if (!response?.ok) throw new Error('Failed to create catalog');

  const rows = await response.json() as WorkspaceCatalogRow[];
  if (!Array.isArray(rows) || rows.length === 0) throw new Error('Create catalog returned empty payload');
  return toCatalog(rows[0]!);
}

export async function renameWorkspaceCatalog(workspaceId: string, catalogId: string, nameInput: string): Promise<void> {
  if (!supabaseEnabled) throw new Error('Workspace library storage is not configured');
  const name = nameInput.trim();
  if (name.length < 1) throw new Error('Catalog name is required');

  const params = new URLSearchParams({
    id: `eq.${catalogId}`,
    workspace_id: `eq.${workspaceId}`,
  });
  const response = await supabaseRequest(`/${WORKSPACE_CATALOGS_TABLE}?${params.toString()}`, {
    method: 'PATCH',
    body: JSON.stringify({ name, updated_at: new Date().toISOString() }),
  });
  if (!response?.ok) throw new Error('Failed to rename catalog');
}

async function deleteStorageByPath(storagePath: string): Promise<void> {
  const response = await supabaseStorageRequest(`/object/${encodeURIComponent(DXF_FILES_BUCKET)}/${encodeStoragePath(storagePath)}`, {
    method: 'DELETE',
  });
  if (!response?.ok && response?.status !== 404) {
    throw new Error('Failed to delete DXF object from storage');
  }
}

export async function deleteWorkspaceCatalog(
  workspaceId: string,
  catalogId: string,
  mode: 'move_to_uncategorized' | 'delete_files',
): Promise<void> {
  if (!supabaseEnabled) throw new Error('Workspace library storage is not configured');

  if (mode === 'delete_files') {
    const fileParams = new URLSearchParams({
      select: 'id,workspace_id,catalog_id,name,storage_path,size_bytes,checked,quantity,created_at,updated_at',
      workspace_id: `eq.${workspaceId}`,
      catalog_id: `eq.${catalogId}`,
    });
    const fileResp = await supabaseRequest(`/${WORKSPACE_FILES_TABLE}?${fileParams.toString()}`);
    if (!fileResp?.ok) throw new Error('Failed to fetch catalog files for deletion');

    const fileRows = await fileResp.json() as WorkspaceFileRow[];
    const files = Array.isArray(fileRows) ? fileRows : [];
    const BATCH = 5;
    for (let i = 0; i < files.length; i += BATCH) {
      await Promise.allSettled(files.slice(i, i + BATCH).map(f => deleteStorageByPath(f.storage_path)));
    }

    const deleteFilesParams = new URLSearchParams({
      workspace_id: `eq.${workspaceId}`,
      catalog_id: `eq.${catalogId}`,
    });
    const deleteFilesResp = await supabaseRequest(`/${WORKSPACE_FILES_TABLE}?${deleteFilesParams.toString()}`, {
      method: 'DELETE',
    });
    if (!deleteFilesResp?.ok) throw new Error('Failed to delete files from catalog');
  } else {
    const moveParams = new URLSearchParams({
      workspace_id: `eq.${workspaceId}`,
      catalog_id: `eq.${catalogId}`,
    });
    const moveResp = await supabaseRequest(`/${WORKSPACE_FILES_TABLE}?${moveParams.toString()}`, {
      method: 'PATCH',
      body: JSON.stringify({ catalog_id: null, updated_at: new Date().toISOString() }),
    });
    if (!moveResp?.ok) throw new Error('Failed to move files from deleted catalog');
  }

  const deleteCatalogParams = new URLSearchParams({
    id: `eq.${catalogId}`,
    workspace_id: `eq.${workspaceId}`,
  });
  const response = await supabaseRequest(`/${WORKSPACE_CATALOGS_TABLE}?${deleteCatalogParams.toString()}`, {
    method: 'DELETE',
  });
  if (!response?.ok) throw new Error('Failed to delete catalog');
}

export async function uploadWorkspaceFile(input: {
  workspaceId: string;
  name: string;
  base64: string;
  catalogId?: string | null;
  checked?: boolean;
  quantity?: number;
}): Promise<WorkspaceFileMeta> {
  if (!supabaseEnabled) throw new Error('Workspace library storage is not configured');

  const { workspaceId } = input;
  const name = input.name.trim();
  if (name.length < 1) throw new Error('File name is required');

  const fileCount = await countRows(WORKSPACE_FILES_TABLE, workspaceId);
  if (fileCount >= MAX_FILES_PER_WORKSPACE) {
    throw new Error(`Лимит: максимум ${MAX_FILES_PER_WORKSPACE} файлов на workspace`);
  }

  const bodyBuffer = Buffer.from(input.base64, 'base64');
  if (bodyBuffer.byteLength === 0) throw new Error('File content is empty');

  const id = crypto.randomUUID();
  const storagePath = `workspace/${workspaceId}/${id}.dxf`;
  const uploadResp = await supabaseStorageRequest(`/object/${encodeURIComponent(DXF_FILES_BUCKET)}/${encodeStoragePath(storagePath)}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/dxf',
      'x-upsert': 'true',
    },
    body: bodyBuffer,
  });
  if (!uploadResp?.ok) throw new Error('Failed to upload DXF to storage');

  const nowIso = new Date().toISOString();
  const row: WorkspaceFileRow = {
    id,
    workspace_id: workspaceId,
    catalog_id: input.catalogId ?? null,
    name,
    storage_path: storagePath,
    size_bytes: bodyBuffer.byteLength,
    checked: input.checked ?? true,
    quantity: Math.max(1, Math.floor(input.quantity ?? 1)),
    created_at: nowIso,
    updated_at: nowIso,
  };

  const rowResp = await supabaseRequest(`/${WORKSPACE_FILES_TABLE}`, {
    method: 'POST',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify([row]),
  });
  if (!rowResp?.ok) {
    await deleteStorageByPath(storagePath);
    throw new Error('Failed to save file metadata');
  }

  const rows = await rowResp.json() as WorkspaceFileRow[];
  if (!Array.isArray(rows) || rows.length === 0) throw new Error('Upload metadata returned empty payload');
  return toFileMeta(rows[0]!);
}

export async function updateWorkspaceFile(
  workspaceId: string,
  fileId: string,
  patch: { name?: string; catalogId?: string | null; checked?: boolean; quantity?: number },
): Promise<void> {
  if (!supabaseEnabled) throw new Error('Workspace library storage is not configured');

  const payload: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (typeof patch.name === 'string') {
    const name = patch.name.trim();
    if (name.length < 1) throw new Error('File name is required');
    payload.name = name;
  }
  if (patch.catalogId !== undefined) {
    payload.catalog_id = patch.catalogId;
  }
  if (typeof patch.checked === 'boolean') {
    payload.checked = patch.checked;
  }
  if (typeof patch.quantity === 'number') {
    payload.quantity = Math.max(1, Math.floor(patch.quantity));
  }

  const params = new URLSearchParams({
    id: `eq.${fileId}`,
    workspace_id: `eq.${workspaceId}`,
  });
  const response = await supabaseRequest(`/${WORKSPACE_FILES_TABLE}?${params.toString()}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
  if (!response?.ok) throw new Error('Failed to update file');
}

export async function deleteWorkspaceFile(workspaceId: string, fileId: string): Promise<void> {
  if (!supabaseEnabled) throw new Error('Workspace library storage is not configured');

  const selectParams = new URLSearchParams({
    select: 'id,workspace_id,catalog_id,name,storage_path,size_bytes,checked,quantity,created_at,updated_at',
    id: `eq.${fileId}`,
    workspace_id: `eq.${workspaceId}`,
    limit: '1',
  });
  const selectResp = await supabaseRequest(`/${WORKSPACE_FILES_TABLE}?${selectParams.toString()}`);
  if (!selectResp?.ok) throw new Error('Failed to find file for deletion');

  const rows = await selectResp.json() as WorkspaceFileRow[];
  if (!Array.isArray(rows) || rows.length === 0) return;
  const row = rows[0]!;

  await deleteStorageByPath(row.storage_path);

  const deleteParams = new URLSearchParams({
    id: `eq.${fileId}`,
    workspace_id: `eq.${workspaceId}`,
  });
  const deleteResp = await supabaseRequest(`/${WORKSPACE_FILES_TABLE}?${deleteParams.toString()}`, {
    method: 'DELETE',
  });
  if (!deleteResp?.ok) throw new Error('Failed to delete file metadata');
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function setWorkspaceFilesChecked(workspaceId: string, checked: boolean, catalogIds?: string[]): Promise<void> {
  if (!supabaseEnabled) throw new Error('Workspace library storage is not configured');

  const params = new URLSearchParams({ workspace_id: `eq.${workspaceId}` });
  if (Array.isArray(catalogIds)) {
    const valid = catalogIds.filter(id => UUID_RE.test(id));
    if (valid.length === 0) return;
    params.set('catalog_id', `in.(${valid.join(',')})`);
  }

  const response = await supabaseRequest(`/${WORKSPACE_FILES_TABLE}?${params.toString()}`, {
    method: 'PATCH',
    body: JSON.stringify({ checked, updated_at: new Date().toISOString() }),
  });
  if (!response?.ok) throw new Error('Failed to update checked state');
}

export async function downloadWorkspaceFile(workspaceId: string, fileId: string): Promise<{ name: string; base64: string; sizeBytes: number }> {
  if (!supabaseEnabled) throw new Error('Workspace library storage is not configured');

  const params = new URLSearchParams({
    select: 'id,workspace_id,catalog_id,name,storage_path,size_bytes,checked,quantity,created_at,updated_at',
    id: `eq.${fileId}`,
    workspace_id: `eq.${workspaceId}`,
    limit: '1',
  });
  const response = await supabaseRequest(`/${WORKSPACE_FILES_TABLE}?${params.toString()}`);
  if (!response?.ok) throw new Error('Failed to load file metadata');

  const rows = await response.json() as WorkspaceFileRow[];
  if (!Array.isArray(rows) || rows.length === 0) {
    throw new Error('File not found');
  }

  const row = rows[0]!;
  const fileResponse = await supabaseStorageRequest(`/object/${encodeURIComponent(DXF_FILES_BUCKET)}/${encodeStoragePath(row.storage_path)}`);
  if (!fileResponse?.ok) throw new Error('Failed to download DXF from storage');

  const arrayBuffer = await fileResponse.arrayBuffer();
  const base64 = Buffer.from(arrayBuffer).toString('base64');
  return {
    name: row.name,
    base64,
    sizeBytes: row.size_bytes,
  };
}
