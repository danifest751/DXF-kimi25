/** @vitest-environment node */

/**
 * Security regression tests covering fixes:
 * - C2/C4: internal secret auth
 * - N1/N5/N7: /api/nest input validation (items, sheet, gap)
 * - P2: /api/auth/telegram/exchange-code rate limiting
 * - P6: /api/nesting/share max sheets
 * - S2: json body size limit
 */

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';

// ─── Mocks ───────────────────────────────────────────────────────────

const getAuthSessionByTokenMock = vi.fn();
const nestItemsMock = vi.fn();
const exchangeCodeMock = vi.fn();
const checkCodeExchangeRateLimitMock = vi.fn();
const pruneExpiredSheetsMock = vi.fn();
const hasSharedSheetMock = vi.fn();
const saveSharedSheetMock = vi.fn();
const generateShortHashMock = vi.fn();
const getSharedSheetMock = vi.fn();

vi.mock('../../packages/core-engine/src/dxf/reader/index.js', () => ({ parseDXF: vi.fn() }));
vi.mock('../../packages/core-engine/src/normalize/index.js', () => ({ normalizeDocument: vi.fn() }));
vi.mock('../../packages/core-engine/src/cutting/index.js', () => ({ computeCuttingStats: vi.fn() }));
vi.mock('../../packages/core-engine/src/nesting/index.js', () => ({
  nestItems: nestItemsMock,
}));
vi.mock('../../packages/core-engine/src/export/index.js', () => ({
  exportNestingToDXF: vi.fn(() => 'DXF'),
  exportNestingToCSV: vi.fn(() => 'CSV'),
  exportCuttingStatsToCSV: vi.fn(() => 'CSV'),
}));
vi.mock('../../packages/pricing/src/index.js', () => ({ calculatePrice: vi.fn() }));
vi.mock('../../packages/bot-service/src/index.js', () => ({
  handleTelegramWebhookUpdate: vi.fn(),
  processBotMessage: vi.fn(),
  setTelegramWebhook: vi.fn(),
}));
vi.mock('../../packages/api-service/src/shared-sheets.js', () => ({
  generateShortHash: generateShortHashMock,
  getSharedSheet: getSharedSheetMock,
  hasSharedSheet: hasSharedSheetMock,
  pruneExpiredSheets: pruneExpiredSheetsMock,
  saveSharedSheet: saveSharedSheetMock,
}));
vi.mock('../../packages/api-service/src/telegram-auth.js', () => ({
  exchangeTelegramLoginCode: exchangeCodeMock,
  getAuthSessionByToken: getAuthSessionByTokenMock,
  checkCodeExchangeRateLimit: checkCodeExchangeRateLimitMock,
}));
vi.mock('../../packages/api-service/src/workspace-library.js', () => ({
  createWorkspaceCatalog: vi.fn(),
  deleteWorkspaceCatalog: vi.fn(),
  deleteWorkspaceFile: vi.fn(),
  downloadWorkspaceFile: vi.fn(),
  isWorkspaceLibraryEnabled: vi.fn(() => false),
  listWorkspaceLibrary: vi.fn(),
  renameWorkspaceCatalog: vi.fn(),
  setWorkspaceFilesChecked: vi.fn(),
  updateWorkspaceFile: vi.fn(),
  uploadWorkspaceFile: vi.fn(),
}));

let server: Server;
let baseUrl = '';

beforeAll(async () => {
  process.env.TELEGRAM_WEBHOOK_AUTO_REGISTER = 'false';
  process.env.TELEGRAM_BOT_TOKEN = '';
  process.env.INTERNAL_API_SECRET = 'test-secret-xyz';

  const mod = await import('../../packages/api-service/src/index.ts');
  server = createServer(mod.default);
  await new Promise<void>((resolve) => server.listen(0, resolve));
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(async () => {
  await new Promise<void>((resolve, reject) =>
    server.close((err) => (err ? reject(err) : resolve())),
  );
  delete process.env.INTERNAL_API_SECRET;
});

beforeEach(() => {
  vi.clearAllMocks();
  checkCodeExchangeRateLimitMock.mockReturnValue(true);
  pruneExpiredSheetsMock.mockResolvedValue(undefined);
  hasSharedSheetMock.mockResolvedValue(false);
  saveSharedSheetMock.mockResolvedValue(undefined);
  getSharedSheetMock.mockResolvedValue(null);
  generateShortHashMock.mockReturnValue('abcd1234');
  getAuthSessionByTokenMock.mockResolvedValue({
    userId: 'u1',
    workspaceId: 'ws-1',
    expiresAt: Date.now() + 60_000,
  });
});

describe('S1: shared sheet DXF filename header sanitization', () => {
  it('uses sanitized hash from stored entry in Content-Disposition', async () => {
    getSharedSheetMock.mockResolvedValue({
      hash: 'ab12cd34',
      sheetIndex: 0,
      singleResult: {
        sheet: { width: 1000, height: 2000 },
        gap: 5,
        sheets: [{ sheetIndex: 0, placed: [], usedArea: 0, fillPercent: 0 }],
        totalSheets: 1,
        totalPlaced: 0,
        totalRequired: 0,
        avgFillPercent: 0,
        cutLengthEstimate: 0,
        sharedCutLength: 0,
        cutLengthAfterMerge: 0,
        pierceEstimate: 0,
        pierceDelta: 0,
      },
      createdAt: Date.now(),
      itemDocs: undefined,
    });

    const response = await fetch(`${baseUrl}/api/nesting/sheet/%22..%2F..%2Fevil`, {
      method: 'GET',
      headers: { 'x-forwarded-for': '10.9.9.9' },
    });

    expect(response.status).toBe(200);
    const cd = response.headers.get('content-disposition') ?? '';
    expect(cd).toContain('sheet_1_ab12cd34.dxf');
    expect(cd).not.toContain('evil');
  });
});

let reqCounter = 0;

async function req(method: string, path: string, body?: unknown, headers: Record<string, string> = {}) {
  // Use a unique IP per request to avoid rate limiter state bleeding between tests
  const uniqueIp = `10.0.${Math.floor(reqCounter / 255)}.${reqCounter % 255}`;
  reqCounter++;
  const r = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
      'x-forwarded-for': uniqueIp,
      ...headers,
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  let json: unknown = null;
  try { json = await r.json(); } catch { /* ignore */ }
  return { status: r.status, json };
}

// ─── C2: /api/bot/message requires internal secret ───────────────────

describe('C2: /api/bot/message internal secret', () => {
  it('returns 401 without secret header', async () => {
    const r = await req('POST', '/api/bot/message', { text: 'hi' });
    expect(r.status).toBe(401);
  });

  it('returns 401 with wrong secret', async () => {
    const r = await req('POST', '/api/bot/message', { text: 'hi' }, { 'x-internal-secret': 'wrong' });
    expect(r.status).toBe(401);
  });

  it('passes with correct secret', async () => {
    const r = await req('POST', '/api/bot/message', { text: 'hi' }, { 'x-internal-secret': 'test-secret-xyz' });
    expect(r.status).toBe(200);
  });
});

// ─── C4: /api/telegram/webhook/register requires internal secret ──────

describe('C4: /api/telegram/webhook/register internal secret', () => {
  it('returns 401 without secret header', async () => {
    const r = await req('POST', '/api/telegram/webhook/register', { url: 'https://example.com' });
    expect(r.status).toBe(401);
  });

  it('returns 401 with wrong secret', async () => {
    const r = await req('POST', '/api/telegram/webhook/register', { url: 'https://example.com' }, { 'x-internal-secret': 'bad' });
    expect(r.status).toBe(401);
  });
});

// ─── N1/N5/N7: /api/nest input validation ────────────────────────────

describe('N1/N5/N7: /api/nest validation', () => {
  const validSheet = { width: 1000, height: 2000 };
  const validItem = { id: 1, name: 'P', width: 100, height: 100, quantity: 1 };

  it('returns 400 when items missing', async () => {
    const r = await req('POST', '/api/nest', { sheet: validSheet });
    expect(r.status).toBe(400);
    expect((r.json as { error: string }).error).toContain('items');
  });

  it('returns 400 when sheet missing', async () => {
    const r = await req('POST', '/api/nest', { items: [validItem] });
    expect(r.status).toBe(400);
  });

  it('returns 400 when items array exceeds 500 (N5)', async () => {
    const items = Array.from({ length: 501 }, (_, i) => ({ id: i, name: `P${i}`, width: 100, height: 100, quantity: 1 }));
    const r = await req('POST', '/api/nest', { items, sheet: validSheet });
    expect(r.status).toBe(400);
    expect((r.json as { error: string }).error).toContain('500');
  });

  it('returns 400 for item with zero width (N1)', async () => {
    const r = await req('POST', '/api/nest', {
      items: [{ id: 1, name: 'P', width: 0, height: 100, quantity: 1 }],
      sheet: validSheet,
    });
    expect(r.status).toBe(400);
    expect((r.json as { error: string }).error).toContain('width');
  });

  it('returns 400 for item with negative height (N1)', async () => {
    const r = await req('POST', '/api/nest', {
      items: [{ id: 1, name: 'P', width: 100, height: -5, quantity: 1 }],
      sheet: validSheet,
    });
    expect(r.status).toBe(400);
  });

  it('returns 400 for item with quantity 0 (N1)', async () => {
    const r = await req('POST', '/api/nest', {
      items: [{ id: 1, name: 'P', width: 100, height: 100, quantity: 0 }],
      sheet: validSheet,
    });
    expect(r.status).toBe(400);
    expect((r.json as { error: string }).error).toContain('quantity');
  });

  it('returns 400 for item with quantity > 10000 (N1)', async () => {
    const r = await req('POST', '/api/nest', {
      items: [{ id: 1, name: 'P', width: 100, height: 100, quantity: 10001 }],
      sheet: validSheet,
    });
    expect(r.status).toBe(400);
    expect((r.json as { error: string }).error).toContain('quantity');
  });

  it('returns 400 for sheet width 0 (N7)', async () => {
    const r = await req('POST', '/api/nest', {
      items: [validItem],
      sheet: { width: 0, height: 1000 },
    });
    expect(r.status).toBe(400);
  });

  it('returns 400 for sheet width > 100000 (N7)', async () => {
    const r = await req('POST', '/api/nest', {
      items: [validItem],
      sheet: { width: 100001, height: 1000 },
    });
    expect(r.status).toBe(400);
  });

  it('clamps gap to 0 if negative and calls nestItems (N7)', async () => {
    nestItemsMock.mockReturnValue({
      sheet: validSheet, gap: 0, sheets: [], totalSheets: 0,
      totalPlaced: 0, totalRequired: 0, avgFillPercent: 0,
      cutLengthEstimate: 0, sharedCutLength: 0, cutLengthAfterMerge: 0,
      pierceEstimate: 0, pierceDelta: 0,
    });
    const r = await req('POST', '/api/nest', {
      items: [validItem],
      sheet: validSheet,
      gap: -100,
    });
    expect(r.status).toBe(200);
    // gap was clamped to 0
    expect(nestItemsMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      0,
      expect.anything(),
    );
  });

  it('clamps gap to 500 if > 500 (N7)', async () => {
    nestItemsMock.mockReturnValue({
      sheet: validSheet, gap: 500, sheets: [], totalSheets: 0,
      totalPlaced: 0, totalRequired: 0, avgFillPercent: 0,
      cutLengthEstimate: 0, sharedCutLength: 0, cutLengthAfterMerge: 0,
      pierceEstimate: 0, pierceDelta: 0,
    });
    const r = await req('POST', '/api/nest', {
      items: [validItem],
      sheet: validSheet,
      gap: 9999,
    });
    expect(r.status).toBe(200);
    expect(nestItemsMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      500,
      expect.anything(),
    );
  });
});

// ─── P2: /api/auth/telegram/exchange-code rate limiting ──────────────

describe('P2: code exchange rate limiting', () => {
  it('returns 429 when rate limit exceeded', async () => {
    checkCodeExchangeRateLimitMock.mockReturnValue(false);
    const r = await req('POST', '/api/auth-telegram-exchange-code', { code: 'ABC123' });
    expect(r.status).toBe(429);
    expect((r.json as { error: string }).error).toContain('Too many');
  });

  it('returns 401 for invalid code when rate limit passes', async () => {
    checkCodeExchangeRateLimitMock.mockReturnValue(true);
    exchangeCodeMock.mockResolvedValue(null);
    const r = await req('POST', '/api/auth-telegram-exchange-code', { code: 'XXXXXX' });
    expect(r.status).toBe(401);
  });

  it('returns session when code is valid', async () => {
    checkCodeExchangeRateLimitMock.mockReturnValue(true);
    exchangeCodeMock.mockResolvedValue({
      sessionToken: 'tok-abc',
      workspaceId: 'ws-1',
      expiresAt: Date.now() + 86400000,
    });
    const r = await req('POST', '/api/auth-telegram-exchange-code', { code: 'ABCDEF' });
    expect(r.status).toBe(200);
    expect((r.json as { sessionToken: string }).sessionToken).toBe('tok-abc');
  });
});

// ─── P6: /api/nesting/share max 50 sheets ────────────────────────────

describe('P6: /api/nesting/share max sheets', () => {
  function makeResult(sheetCount: number) {
    return {
      nestingResult: {
        sheet: { width: 1000, height: 2000 },
        gap: 5,
        sheets: Array.from({ length: sheetCount }, (_, i) => ({
          sheetIndex: i,
          placed: [],
          usedArea: 0,
          fillPercent: 0,
        })),
        totalSheets: sheetCount,
        totalPlaced: 0,
        totalRequired: 0,
        avgFillPercent: 0,
        cutLengthEstimate: 0,
        sharedCutLength: 0,
        cutLengthAfterMerge: 0,
        pierceEstimate: 0,
        pierceDelta: 0,
      },
    };
  }

  it('returns 400 when more than 50 sheets', async () => {
    const r = await req('POST', '/api/nesting-share', makeResult(51));
    expect(r.status).toBe(400);
    expect((r.json as { error: string }).error).toContain('50');
  });

  it('accepts exactly 50 sheets', async () => {
    hasSharedSheetMock.mockResolvedValue(false);
    const r = await req('POST', '/api/nesting-share', makeResult(50));
    expect(r.status).toBe(200);
    expect((r.json as { hashes: string[] }).hashes).toHaveLength(50);
  });

  it('accepts 1 sheet', async () => {
    hasSharedSheetMock.mockResolvedValue(false);
    const r = await req('POST', '/api/nesting-share', makeResult(1));
    expect(r.status).toBe(200);
    expect((r.json as { hashes: string[] }).hashes).toHaveLength(1);
  });
});

// ─── S2: default json body limit is 1mb ──────────────────────────────

describe('S2: default json body size limit', () => {
  it('returns 413 when body exceeds 1mb on non-DXF route', async () => {
    const big = { text: 'x'.repeat(1_100_000) };
    const r = await req('POST', '/api/price', big);
    // express returns 413 for oversized body
    expect(r.status).toBe(413);
  });
});
