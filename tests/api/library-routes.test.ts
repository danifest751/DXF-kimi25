/** @vitest-environment node */

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';

const getAuthSessionByTokenMock = vi.fn();
const isWorkspaceLibraryEnabledMock = vi.fn();
const createWorkspaceCatalogMock = vi.fn();
const renameWorkspaceCatalogMock = vi.fn();
const deleteWorkspaceCatalogMock = vi.fn();
const updateWorkspaceFileMock = vi.fn();
const deleteWorkspaceFileMock = vi.fn();
const setWorkspaceFilesCheckedMock = vi.fn();
const downloadWorkspaceFileMock = vi.fn();

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
}));

vi.mock('../../packages/api-service/src/workspace-library.js', () => ({
  createWorkspaceCatalog: createWorkspaceCatalogMock,
  deleteWorkspaceCatalog: deleteWorkspaceCatalogMock,
  deleteWorkspaceFile: deleteWorkspaceFileMock,
  downloadWorkspaceFile: downloadWorkspaceFileMock,
  isWorkspaceLibraryEnabled: isWorkspaceLibraryEnabledMock,
  listWorkspaceLibrary: vi.fn(),
  renameWorkspaceCatalog: renameWorkspaceCatalogMock,
  setWorkspaceFilesChecked: setWorkspaceFilesCheckedMock,
  updateWorkspaceFile: updateWorkspaceFileMock,
  uploadWorkspaceFile: vi.fn(),
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

  it('updates file quantity through flat alias route', async () => {
    const response = await requestJson('PATCH', '/api/library-files-update', {
      fileId: 'file-1',
      quantity: 11,
    }, 'token-1');

    expect(response.status).toBe(200);
    expect(updateWorkspaceFileMock).toHaveBeenCalledWith('ws-1', 'file-1', { quantity: 11 });
    expect(response.json).toEqual({ success: true });
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
