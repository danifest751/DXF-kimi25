/** @vitest-environment node */

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';

const getAuthSessionByTokenMock = vi.fn();
const revokeAuthSessionByTokenMock = vi.fn();
const isWorkspaceLibraryEnabledMock = vi.fn();
const createWorkspaceCatalogMock = vi.fn();
const renameWorkspaceCatalogMock = vi.fn();
const deleteWorkspaceCatalogMock = vi.fn();
const updateWorkspaceFileMock = vi.fn();
const deleteWorkspaceFileMock = vi.fn();
const setWorkspaceFilesCheckedMock = vi.fn();
const downloadWorkspaceFileMock = vi.fn();
const uploadWorkspaceFileBufferMock = vi.fn();
const uploadWorkspaceFileBufferWithIdMock = vi.fn();
const createSignedWorkspaceFileUploadMock = vi.fn();
const finalizeSignedWorkspaceFileUploadMock = vi.fn();

vi.mock('../../packages/core-engine/src/dxf/reader/index.js', () => ({
  parseDXF: vi.fn(),
}));

vi.mock('../../packages/core-engine/src/normalize/index.js', () => ({
  normalizeDocument: vi.fn(),
}));

vi.mock('../../packages/core-engine/src/cutting/index.js', () => ({
  computeCuttingStats: vi.fn(),
}));

vi.mock('../../packages/core-engine/src/nesting/index.js', () => ({
  nestItems: vi.fn(),
}));

vi.mock('../../packages/core-engine/src/export/index.js', () => ({
  exportNestingToDXF: vi.fn(),
  exportNestingToCSV: vi.fn(),
  exportCuttingStatsToCSV: vi.fn(),
}));

vi.mock('../../packages/pricing/src/index.js', () => ({
  calculatePrice: vi.fn(),
}));

vi.mock('../../packages/bot-service/src/index.js', () => ({
  handleTelegramWebhookUpdate: vi.fn(),
  processBotMessage: vi.fn(),
  setTelegramWebhook: vi.fn(),
}));

vi.mock('../../packages/api-service/src/shared-sheets.js', () => ({
  generateShortHash: vi.fn(() => 'abc123'),
  getSharedSheet: vi.fn(),
  hasSharedSheet: vi.fn(),
  pruneExpiredSheets: vi.fn(),
  saveSharedSheet: vi.fn(),
}));

vi.mock('../../packages/api-service/src/telegram-auth.js', () => ({
  exchangeTelegramLoginCode: vi.fn(),
  getAuthSessionByToken: getAuthSessionByTokenMock,
  checkCodeExchangeRateLimit: vi.fn(() => true),
  revokeAuthSessionByToken: revokeAuthSessionByTokenMock,
}));

vi.mock('../../packages/api-service/src/workspace-library.js', () => ({
  createSignedWorkspaceFileUpload: createSignedWorkspaceFileUploadMock,
  createWorkspaceCatalog: createWorkspaceCatalogMock,
  deleteWorkspaceCatalog: deleteWorkspaceCatalogMock,
  deleteWorkspaceFile: deleteWorkspaceFileMock,
  downloadWorkspaceFile: downloadWorkspaceFileMock,
  finalizeSignedWorkspaceFileUpload: finalizeSignedWorkspaceFileUploadMock,
  isWorkspaceLibraryEnabled: isWorkspaceLibraryEnabledMock,
  listWorkspaceLibrary: vi.fn(),
  renameWorkspaceCatalog: renameWorkspaceCatalogMock,
  setWorkspaceFilesChecked: setWorkspaceFilesCheckedMock,
  updateWorkspaceFile: updateWorkspaceFileMock,
  uploadWorkspaceFile: vi.fn(),
  uploadWorkspaceFileBuffer: uploadWorkspaceFileBufferMock,
  uploadWorkspaceFileBufferWithId: uploadWorkspaceFileBufferWithIdMock,
}));

let server: Server;
let baseUrl = '';

beforeAll(async () => {
  process.env.TELEGRAM_WEBHOOK_AUTO_REGISTER = 'false';
  process.env.TELEGRAM_BOT_TOKEN = '';
  process.env.TELEGRAM_WEBHOOK_URL = '';

  const mod = await import('../../packages/api-service/src/index.ts');
  const app = mod.default;

  server = createServer(app);
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const addr = server.address() as AddressInfo;
  baseUrl = `http://127.0.0.1:${addr.port}`;
});

afterAll(async () => {
  await new Promise<void>((resolve, reject) => {
    server.close((err) => (err ? reject(err) : resolve()));
  });
});

beforeEach(() => {
  vi.clearAllMocks();
  isWorkspaceLibraryEnabledMock.mockReturnValue(true);
  getAuthSessionByTokenMock.mockResolvedValue({
    userId: 'u1',
    workspaceId: 'ws-1',
    expiresAt: Date.now() + 60_000,
  });
});

async function requestJson(method: string, path: string, body?: unknown, token?: string) {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      ...(body === undefined ? {} : { 'content-type': 'application/json' }),
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  const text = await response.text();
  let json: unknown = null;
  try {
    json = JSON.parse(text);
  } catch {
    json = null;
  }

  return { status: response.status, text, json };
}

async function requestWithCookie(method: string, path: string, cookie: string, body?: unknown) {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      ...(body === undefined ? {} : { 'content-type': 'application/json' }),
      cookie,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  let json: unknown = null;
  try {
    json = JSON.parse(text);
  } catch {
    json = null;
  }
  return { status: response.status, text, json, headers: response.headers };
}

describe('workspace library routes', () => {
  it('returns 401 for create catalog without auth token', async () => {
    const response = await requestJson('POST', '/api/library-catalogs', { name: 'New catalog' });

    expect(response.status).toBe(401);
    expect(response.json).toEqual({ error: 'Missing session token' });
  });

  it('creates catalog with auth token', async () => {
    createWorkspaceCatalogMock.mockResolvedValue({
      id: 'c1',
      workspaceId: 'ws-1',
      name: 'Laser',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    const response = await requestJson('POST', '/api/library-catalogs', { name: 'Laser' }, 'token-1');

    expect(response.status).toBe(200);
    expect(createWorkspaceCatalogMock).toHaveBeenCalledWith('ws-1', 'Laser');
    expect(response.json).toMatchObject({ success: true, catalog: { id: 'c1', name: 'Laser' } });
  });

  it('accepts auth cookie instead of authorization header', async () => {
    createWorkspaceCatalogMock.mockResolvedValue({
      id: 'c-cookie',
      workspaceId: 'ws-1',
      name: 'Cookie',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    const response = await requestWithCookie('POST', '/api/library-catalogs', 'dxf_auth_session=cookie-token', { name: 'Cookie' });

    expect(response.status).toBe(200);
    expect(getAuthSessionByTokenMock).toHaveBeenCalledWith('cookie-token');
    expect(createWorkspaceCatalogMock).toHaveBeenCalledWith('ws-1', 'Cookie');
  });

  it('revokes session and clears cookie on logout', async () => {
    const response = await requestWithCookie('POST', '/api/auth-logout', 'dxf_auth_session=cookie-token');

    expect(response.status).toBe(200);
    expect(revokeAuthSessionByTokenMock).toHaveBeenCalledWith('cookie-token');
    expect(response.json).toEqual({ success: true });
    expect(response.headers.get('set-cookie') || '').toContain('dxf_auth_session=;');
  });

  it('uploads file through multipart route', async () => {
    const catalogId = '11111111-1111-1111-1111-111111111111';
    uploadWorkspaceFileBufferMock.mockResolvedValue({
      id: 'file-upload-1',
      workspaceId: 'ws-1',
      catalogId,
      name: 'part.dxf',
      storagePath: 'workspace/ws-1/part.dxf',
      sizeBytes: 3,
      checked: true,
      quantity: 2,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    const formData = new FormData();
    formData.append('file', new Blob(['ABC'], { type: 'application/dxf' }), 'part.dxf');
    formData.append('catalogId', catalogId);
    formData.append('checked', 'true');
    formData.append('quantity', '2');

    const response = await fetch(`${baseUrl}/api/library-files-upload`, {
      method: 'POST',
      headers: { authorization: 'Bearer token-1' },
      body: formData,
    });
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(uploadWorkspaceFileBufferMock).toHaveBeenCalledWith(expect.objectContaining({
      workspaceId: 'ws-1',
      name: 'part.dxf',
      catalogId,
      checked: true,
      quantity: 2,
    }));
    expect(json).toMatchObject({ success: true, file: { id: 'file-upload-1', name: 'part.dxf' } });
  });

  it('creates a signed direct upload ticket', async () => {
    createSignedWorkspaceFileUploadMock.mockResolvedValue({
      fileId: 'file-direct-1',
      workspaceId: 'ws-1',
      catalogId: null,
      name: 'part.dxf',
      storagePath: 'workspace/ws-1/file-direct-1.dxf',
      sizeBytes: 3,
      checked: true,
      quantity: 1,
      signedUrl: 'https://example.supabase.co/storage/v1/object/upload/sign/dxf-files/workspace/ws-1/file-direct-1.dxf?token=abc',
      token: 'abc',
    });

    const response = await requestJson('POST', '/api/library-files-direct-upload-init', {
      name: 'part.dxf',
      sizeBytes: 3,
      catalogId: null,
      checked: true,
      quantity: 1,
    }, 'token-1');

    expect(response.status).toBe(200);
    expect(createSignedWorkspaceFileUploadMock).toHaveBeenCalledWith({
      workspaceId: 'ws-1',
      name: 'part.dxf',
      sizeBytes: 3,
      catalogId: null,
      checked: true,
      quantity: 1,
    });
    expect(response.json).toMatchObject({ success: true, upload: { fileId: 'file-direct-1', token: 'abc' } });
  });

  it('uploads file through binary direct upload route', async () => {
    uploadWorkspaceFileBufferWithIdMock.mockResolvedValue({
      id: 'file-direct-1',
      workspaceId: 'ws-1',
      catalogId: null,
      name: 'part.dxf',
      storagePath: 'workspace/ws-1/file-direct-1.dxf',
      sizeBytes: 3,
      checked: true,
      quantity: 1,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    const response = await fetch(`${baseUrl}/api/library-files-direct-upload/file-direct-1`, {
      method: 'PUT',
      headers: {
        authorization: 'Bearer token-1',
        'content-type': 'application/dxf',
        'x-file-name': 'part.dxf',
        'x-file-size': '3',
        'x-catalog-id': '',
        'x-file-checked': 'true',
        'x-file-quantity': '1',
      },
      body: 'ABC',
    });
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(uploadWorkspaceFileBufferWithIdMock).toHaveBeenCalledWith(expect.objectContaining({
      workspaceId: 'ws-1',
      fileId: 'file-direct-1',
      name: 'part.dxf',
      catalogId: null,
      checked: true,
      quantity: 1,
    }));
    expect(json).toMatchObject({ success: true, file: { id: 'file-direct-1', name: 'part.dxf' } });
  });

  it('finalizes a signed direct upload', async () => {
    finalizeSignedWorkspaceFileUploadMock.mockResolvedValue({
      id: 'file-direct-1',
      workspaceId: 'ws-1',
      catalogId: null,
      name: 'part.dxf',
      storagePath: 'workspace/ws-1/file-direct-1.dxf',
      sizeBytes: 3,
      checked: true,
      quantity: 1,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    const response = await requestJson('POST', '/api/library-files-direct-upload-complete', {
      fileId: 'file-direct-1',
      name: 'part.dxf',
      sizeBytes: 3,
      catalogId: null,
      checked: true,
      quantity: 1,
    }, 'token-1');

    expect(response.status).toBe(200);
    expect(finalizeSignedWorkspaceFileUploadMock).toHaveBeenCalledWith({
      workspaceId: 'ws-1',
      fileId: 'file-direct-1',
      name: 'part.dxf',
      sizeBytes: 3,
      catalogId: null,
      checked: true,
      quantity: 1,
    });
    expect(response.json).toMatchObject({ success: true, file: { id: 'file-direct-1', name: 'part.dxf' } });
  });

  it('rejects multipart upload with invalid catalogId', async () => {
    const formData = new FormData();
    formData.append('file', new Blob(['ABC'], { type: 'application/dxf' }), 'part.dxf');
    formData.append('catalogId', 'not-a-uuid');

    const response = await fetch(`${baseUrl}/api/library-files-upload`, {
      method: 'POST',
      headers: { authorization: 'Bearer token-1' },
      body: formData,
    });
    const json = await response.json();

    expect(response.status).toBe(400);
    expect(uploadWorkspaceFileBufferMock).not.toHaveBeenCalled();
    expect(json).toEqual({ error: 'catalogId must be a UUID or empty' });
  });

  it('updates file quantity through flat alias route', async () => {
    const response = await requestJson('PATCH', '/api/library-files-update', {
      fileId: 'file-1',
      quantity: 11,
    }, 'token-1');

    expect(response.status).toBe(200);
    expect(updateWorkspaceFileMock).toHaveBeenCalledWith('ws-1', 'file-1', { quantity: 11 });
    expect(response.json).toEqual({ success: true });
  });

  it('rejects file update with invalid quantity', async () => {
    const response = await requestJson('PATCH', '/api/library-files-update', {
      fileId: 'file-1',
      quantity: 0,
    }, 'token-1');

    expect(response.status).toBe(400);
    expect(updateWorkspaceFileMock).not.toHaveBeenCalled();
    expect(response.json).toEqual({ error: 'quantity must be an integer between 1 and 10000' });
  });

  it('deletes file through flat alias route', async () => {
    const response = await requestJson('POST', '/api/library-files-delete', {
      fileId: 'file-1',
    }, 'token-1');

    expect(response.status).toBe(200);
    expect(deleteWorkspaceFileMock).toHaveBeenCalledWith('ws-1', 'file-1');
    expect(response.json).toEqual({ success: true });
  });

  it('deletes catalog through flat alias route', async () => {
    const response = await requestJson('POST', '/api/library-catalogs-delete', {
      catalogId: 'cat-1',
      mode: 'move_to_uncategorized',
    }, 'token-1');

    expect(response.status).toBe(200);
    expect(deleteWorkspaceCatalogMock).toHaveBeenCalledWith('ws-1', 'cat-1', 'move_to_uncategorized');
    expect(response.json).toEqual({ success: true, mode: 'move_to_uncategorized' });
  });

  it('updates checked flags with check-all route', async () => {
    const response = await requestJson('POST', '/api/library-files-check-all', {
      checked: false,
      catalogIds: ['cat-1', 'cat-2'],
    }, 'token-1');

    expect(response.status).toBe(200);
    expect(setWorkspaceFilesCheckedMock).toHaveBeenCalledWith('ws-1', false, ['cat-1', 'cat-2']);
    expect(response.json).toEqual({ success: true });
  });

  it('downloads file through flat alias route with query fileId', async () => {
    downloadWorkspaceFileMock.mockResolvedValue({
      name: 'part.dxf',
      base64: 'QUJD',
      sizeBytes: 3,
    });

    const response = await requestJson('GET', '/api/library-files-download?fileId=file-42', undefined, 'token-1');

    expect(response.status).toBe(200);
    expect(downloadWorkspaceFileMock).toHaveBeenCalledWith('ws-1', 'file-42');
    expect(response.json).toEqual({ success: true, name: 'part.dxf', base64: 'QUJD', sizeBytes: 3 });
  });

  it('returns 503 when library storage is disabled', async () => {
    isWorkspaceLibraryEnabledMock.mockReturnValue(false);

    const response = await requestJson('POST', '/api/library-catalogs', { name: 'Any' }, 'token-1');

    expect(response.status).toBe(503);
    expect(response.json).toEqual({ error: 'Workspace library storage is not configured' });
  });
});
