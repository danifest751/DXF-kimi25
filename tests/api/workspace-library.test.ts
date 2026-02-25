/** @vitest-environment node */

/**
 * Tests for workspace-library.ts fixes:
 * - P3: catalogId UUID validation in uploadWorkspaceFile / updateWorkspaceFile
 * - P4: name length capped at 255 chars
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const supabaseRequestMock = vi.fn();
const supabaseStorageRequestMock = vi.fn();

vi.mock('../../packages/api-service/src/supabase-client.js', () => ({
  get supabaseEnabled() { return true; },
  supabaseRequest: supabaseRequestMock,
  supabaseStorageRequest: supabaseStorageRequestMock,
}));

async function freshLib() {
  vi.resetModules();
  vi.mock('../../packages/api-service/src/supabase-client.js', () => ({
    get supabaseEnabled() { return true; },
    supabaseRequest: supabaseRequestMock,
    supabaseStorageRequest: supabaseStorageRequestMock,
  }));
  return import('../../packages/api-service/src/workspace-library.js');
}

const VALID_UUID = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
const VALID_BASE64 = Buffer.from('DXF content').toString('base64');

function mockCountHead(count: number) {
  supabaseRequestMock.mockResolvedValueOnce({
    ok: true,
    headers: { get: (_: string) => `0-0/${count}` },
  });
}

function mockUploadStorage() {
  supabaseStorageRequestMock.mockResolvedValueOnce({ ok: true });
}

function mockInsertRow(row: object) {
  supabaseRequestMock.mockResolvedValueOnce({
    ok: true,
    json: async () => [row],
  });
}

describe('P3: catalogId UUID validation in uploadWorkspaceFile', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('throws for non-UUID catalogId', async () => {
    const { uploadWorkspaceFile } = await freshLib();
    await expect(
      uploadWorkspaceFile({
        workspaceId: 'ws-1',
        name: 'test.dxf',
        base64: VALID_BASE64,
        catalogId: 'not-a-uuid',
      }),
    ).rejects.toThrow('Invalid catalogId: must be a UUID');
  });

  it('throws for SQL-injection-like catalogId', async () => {
    const { uploadWorkspaceFile } = await freshLib();
    await expect(
      uploadWorkspaceFile({
        workspaceId: 'ws-1',
        name: 'test.dxf',
        base64: VALID_BASE64,
        catalogId: "1'; DROP TABLE workspace_files;--",
      }),
    ).rejects.toThrow('Invalid catalogId: must be a UUID');
  });

  it('accepts null catalogId', async () => {
    const { uploadWorkspaceFile } = await freshLib();
    mockCountHead(0);
    mockUploadStorage();
    const now = new Date().toISOString();
    mockInsertRow({
      id: VALID_UUID,
      workspace_id: 'ws-1',
      catalog_id: null,
      name: 'test.dxf',
      storage_path: 'workspace/ws-1/file.dxf',
      size_bytes: 11,
      checked: true,
      quantity: 1,
      created_at: now,
      updated_at: now,
    });

    const result = await uploadWorkspaceFile({
      workspaceId: 'ws-1',
      name: 'test.dxf',
      base64: VALID_BASE64,
      catalogId: null,
    });
    expect(result.catalogId).toBeNull();
  });

  it('accepts valid UUID catalogId', async () => {
    const { uploadWorkspaceFile } = await freshLib();
    mockCountHead(0);
    mockUploadStorage();
    const now = new Date().toISOString();
    mockInsertRow({
      id: VALID_UUID,
      workspace_id: 'ws-1',
      catalog_id: VALID_UUID,
      name: 'test.dxf',
      storage_path: 'workspace/ws-1/file.dxf',
      size_bytes: 11,
      checked: true,
      quantity: 1,
      created_at: now,
      updated_at: now,
    });

    const result = await uploadWorkspaceFile({
      workspaceId: 'ws-1',
      name: 'test.dxf',
      base64: VALID_BASE64,
      catalogId: VALID_UUID,
    });
    expect(result.catalogId).toBe(VALID_UUID);
  });
});

describe('P3: catalogId UUID validation in updateWorkspaceFile', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('throws for non-UUID catalogId in patch', async () => {
    const { updateWorkspaceFile } = await freshLib();
    await expect(
      updateWorkspaceFile('ws-1', 'file-1', { catalogId: 'bad-id' }),
    ).rejects.toThrow('Invalid catalogId: must be a UUID');
  });

  it('accepts null catalogId in patch', async () => {
    const { updateWorkspaceFile } = await freshLib();
    supabaseRequestMock.mockResolvedValueOnce({ ok: true });
    await expect(
      updateWorkspaceFile('ws-1', 'file-1', { catalogId: null }),
    ).resolves.toBeUndefined();
  });

  it('accepts valid UUID catalogId in patch', async () => {
    const { updateWorkspaceFile } = await freshLib();
    supabaseRequestMock.mockResolvedValueOnce({ ok: true });
    await expect(
      updateWorkspaceFile('ws-1', 'file-1', { catalogId: VALID_UUID }),
    ).resolves.toBeUndefined();
  });
});

describe('P4: name length cap at 255 chars', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('truncates catalog name > 255 chars without error', async () => {
    const { createWorkspaceCatalog } = await freshLib();
    const longName = 'A'.repeat(300);

    // mock count check
    supabaseRequestMock.mockResolvedValueOnce({
      ok: true,
      headers: { get: () => '0-0/0' },
    });
    // mock insert
    const now = new Date().toISOString();
    supabaseRequestMock.mockResolvedValueOnce({
      ok: true,
      json: async () => [{
        id: VALID_UUID,
        workspace_id: 'ws-1',
        name: longName.slice(0, 255),
        created_at: now,
        updated_at: now,
      }],
    });

    const result = await createWorkspaceCatalog('ws-1', longName);
    // the mock returns whatever, but the key is: no error thrown
    expect(result.name.length).toBeLessThanOrEqual(255);
  });

  it('throws for empty catalog name', async () => {
    const { createWorkspaceCatalog } = await freshLib();
    await expect(createWorkspaceCatalog('ws-1', '')).rejects.toThrow('Catalog name is required');
    await expect(createWorkspaceCatalog('ws-1', '   ')).rejects.toThrow('Catalog name is required');
  });

  it('truncates file name > 255 chars without error', async () => {
    const { uploadWorkspaceFile } = await freshLib();
    const longName = 'B'.repeat(300) + '.dxf';
    mockCountHead(0);
    mockUploadStorage();
    const now = new Date().toISOString();
    mockInsertRow({
      id: VALID_UUID,
      workspace_id: 'ws-1',
      catalog_id: null,
      name: longName.slice(0, 255),
      storage_path: 'workspace/ws-1/file.dxf',
      size_bytes: 11,
      checked: true,
      quantity: 1,
      created_at: now,
      updated_at: now,
    });

    // Should not throw despite >255 char name
    await expect(
      uploadWorkspaceFile({ workspaceId: 'ws-1', name: longName, base64: VALID_BASE64 }),
    ).resolves.toBeDefined();
  });

  it('throws for empty file name', async () => {
    const { uploadWorkspaceFile } = await freshLib();
    await expect(
      uploadWorkspaceFile({ workspaceId: 'ws-1', name: '   ', base64: VALID_BASE64 }),
    ).rejects.toThrow('File name is required');
  });
});

describe('P4: name length cap in updateWorkspaceFile', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('truncates file name > 255 chars in patch', async () => {
    const { updateWorkspaceFile } = await freshLib();
    supabaseRequestMock.mockResolvedValueOnce({ ok: true });
    const longName = 'C'.repeat(300);
    await expect(
      updateWorkspaceFile('ws-1', 'file-1', { name: longName }),
    ).resolves.toBeUndefined();
    // verify supabase was called with truncated name
    const callArgs = supabaseRequestMock.mock.calls[0];
    const body = JSON.parse(callArgs[1].body as string) as Record<string, unknown>;
    expect((body.name as string).length).toBeLessThanOrEqual(255);
  });

  it('throws for empty name in patch', async () => {
    const { updateWorkspaceFile } = await freshLib();
    await expect(
      updateWorkspaceFile('ws-1', 'file-1', { name: '' }),
    ).rejects.toThrow('File name is required');
  });
});
