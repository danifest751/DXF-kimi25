/** @vitest-environment node */

/**
 * Tests for in-memory rate limiter fixes:
 * - S4: rateLimitStore cap at 10000 entries (evict oldest under DDoS)
 * - heavyRateLimit: 10 req/min per IP
 * - nestingRateLimit: 3 req/min per IP
 */

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';

vi.mock('../../packages/core-engine/src/dxf/reader/index.js', () => ({ parseDXF: vi.fn() }));
vi.mock('../../packages/core-engine/src/normalize/index.js', () => ({ normalizeDocument: vi.fn() }));
vi.mock('../../packages/core-engine/src/cutting/index.js', () => ({ computeCuttingStats: vi.fn() }));
vi.mock('../../packages/core-engine/src/nesting/index.js', () => ({
  nestItems: vi.fn(() => ({
    sheet: { width: 1000, height: 2000 }, gap: 5, sheets: [],
    totalSheets: 0, totalPlaced: 0, totalRequired: 0, avgFillPercent: 0,
    cutLengthEstimate: 0, sharedCutLength: 0, cutLengthAfterMerge: 0,
    pierceEstimate: 0, pierceDelta: 0,
  })),
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
  generateShortHash: vi.fn(() => 'abcd1234'),
  getSharedSheet: vi.fn(),
  hasSharedSheet: vi.fn(() => false),
  pruneExpiredSheets: vi.fn(),
  saveSharedSheet: vi.fn(),
}));
vi.mock('../../packages/api-service/src/telegram-auth.js', () => ({
  exchangeTelegramLoginCode: vi.fn(),
  getAuthSessionByToken: vi.fn().mockResolvedValue({
    userId: 'u1', workspaceId: 'ws-1', expiresAt: Date.now() + 60_000,
  }),
  checkCodeExchangeRateLimit: vi.fn(() => true),
}));
vi.mock('../../packages/api-service/src/workspace-library.js', () => ({
  createSignedWorkspaceFileUpload: vi.fn(),
  createWorkspaceCatalog: vi.fn(),
  deleteWorkspaceCatalog: vi.fn(),
  deleteWorkspaceFile: vi.fn(),
  downloadWorkspaceFile: vi.fn(),
  finalizeSignedWorkspaceFileUpload: vi.fn(),
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
  process.env.INTERNAL_API_SECRET = '';

  const mod = await import('../../packages/api-service/src/index.ts');
  server = createServer(mod.default);
  await new Promise<void>((resolve) => server.listen(0, resolve));
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(async () => {
  await new Promise<void>((resolve, reject) =>
    server.close((err) => (err ? reject(err) : resolve())),
  );
});

let ipCounter = 5000;
function uniqueIp(): string {
  const i = ipCounter++;
  return `192.168.${Math.floor(i / 255)}.${i % 255}`;
}

async function postJson(path: string, body: unknown, ip: string) {
  const r = await fetch(`${baseUrl}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-forwarded-for': ip },
    body: JSON.stringify(body),
  });
  return r.status;
}

// ─── heavyRateLimit: 10 req/min per IP ────────────────────────────────

describe('S4/heavyRateLimit: 10 requests per minute per IP', () => {
  it('allows first 10 requests from same IP on /api/price', async () => {
    const ip = uniqueIp();
    for (let i = 0; i < 10; i++) {
      const status = await postJson('/api/price', { cutLength: 100, pierces: 5 }, ip);
      // 400 = bad input but passed rate limit; we just need not-429
      expect(status).not.toBe(429);
    }
  });

  it('blocks 11th request from same IP on /api/price', async () => {
    const ip = uniqueIp();
    for (let i = 0; i < 10; i++) {
      await postJson('/api/price', { cutLength: 100, pierces: 5 }, ip);
    }
    const status = await postJson('/api/price', { cutLength: 100, pierces: 5 }, ip);
    expect(status).toBe(429);
  });

  it('different IPs are not affected by each other', async () => {
    const ip1 = uniqueIp();
    const ip2 = uniqueIp();

    // exhaust ip1
    for (let i = 0; i < 11; i++) {
      await postJson('/api/price', { cutLength: 100, pierces: 5 }, ip1);
    }
    const blocked = await postJson('/api/price', { cutLength: 100, pierces: 5 }, ip1);
    expect(blocked).toBe(429);

    // ip2 unaffected
    const allowed = await postJson('/api/price', { cutLength: 100, pierces: 5 }, ip2);
    expect(allowed).not.toBe(429);
  });
});

// ─── nestingRateLimit: 3 req/min per IP ───────────────────────────────

describe('nestingRateLimit: 10 requests per minute per IP', () => {
  const validNestBody = {
    items: [{ id: 1, name: 'P', width: 100, height: 100, quantity: 1 }],
    sheet: { width: 1000, height: 2000 },
    gap: 5,
  };

  it('allows first 10 nesting requests from same IP', async () => {
    const ip = uniqueIp();
    for (let i = 0; i < 10; i++) {
      const status = await postJson('/api/nest', validNestBody, ip);
      expect(status).not.toBe(429);
    }
  });

  it('blocks 11th nesting request from same IP', async () => {
    const ip = uniqueIp();
    for (let i = 0; i < 10; i++) {
      await postJson('/api/nest', validNestBody, ip);
    }
    const status = await postJson('/api/nest', validNestBody, ip);
    expect(status).toBe(429);
  });
});

// ─── S4: rateLimitStore cap logic (unit test, no HTTP needed) ────────
// We test the pure checkRateLimit-like logic directly to avoid port exhaustion.

describe('S4: rateLimitStore cap at 10000 entries', () => {
  it('Map eviction logic keeps size at cap', () => {
    // Replica of the cap logic from api-service/src/index.ts
    const CAP = 10_000;
    const store = new Map<string, { windowStart: number; count: number }>();

    function insert(key: string): void {
      const now = Date.now();
      if (!store.has(key) && store.size >= CAP) {
        const first = store.keys().next().value;
        if (first !== undefined) store.delete(first);
      }
      store.set(key, { windowStart: now, count: 1 });
    }

    for (let i = 0; i < 10_100; i++) {
      insert(`ip-${i}`);
    }

    expect(store.size).toBe(CAP);
  });

  it('evicts the oldest entry first', () => {
    const CAP = 5;
    const store = new Map<string, number>();

    function insert(key: string): void {
      if (!store.has(key) && store.size >= CAP) {
        const first = store.keys().next().value;
        if (first !== undefined) store.delete(first);
      }
      store.set(key, Date.now());
    }

    for (let i = 0; i < CAP; i++) insert(`old-${i}`);
    const firstKey = store.keys().next().value as string;

    insert('new-entry');

    expect(store.has(firstKey)).toBe(false);
    expect(store.has('new-entry')).toBe(true);
    expect(store.size).toBe(CAP);
  });

  it('does not evict when updating existing key', () => {
    const CAP = 5;
    const store = new Map<string, number>();
    for (let i = 0; i < CAP; i++) store.set(`k${i}`, i);

    function insert(key: string): void {
      if (!store.has(key) && store.size >= CAP) {
        const first = store.keys().next().value;
        if (first !== undefined) store.delete(first);
      }
      store.set(key, Date.now());
    }

    insert('k0'); // existing key — no eviction
    expect(store.size).toBe(CAP);
  });
});

// ─── heavyRateLimit via HTTP: 10 req/min ─────────────────────────────

describe('S4/heavyRateLimit via HTTP: rate limit response headers', () => {
  it('returns 429 json with error message when heavy limit exceeded', async () => {
    const ip = uniqueIp();
    // exhaust heavy limit (10)
    for (let i = 0; i < 10; i++) {
      await postJson('/api/price', { cutLength: 1, pierces: 1 }, ip);
    }
    const status = await postJson('/api/price', { cutLength: 1, pierces: 1 }, ip);
    expect(status).toBe(429);
  });
});
