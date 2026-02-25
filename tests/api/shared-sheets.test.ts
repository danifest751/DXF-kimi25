/** @vitest-environment node */

/**
 * Tests for shared-sheets.ts fixes:
 * - N6: sharedSheetStore capped at 2000 entries (evict oldest)
 * - TTL expiry logic
 * - saveSharedSheet / getSharedSheet / hasSharedSheet
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../packages/api-service/src/supabase-client.js', () => ({
  supabaseEnabled: false,
  supabaseRequest: vi.fn(),
}));

async function freshModule() {
  vi.resetModules();
  vi.mock('../../packages/api-service/src/supabase-client.js', () => ({
    supabaseEnabled: false,
    supabaseRequest: vi.fn(),
  }));
  return import('../../packages/api-service/src/shared-sheets.js');
}

function makeEntry(hash: string, createdAt = Date.now()): import('../../packages/api-service/src/shared-sheets.js').SharedSheet {
  return {
    hash,
    sheetIndex: 0,
    singleResult: {
      sheet: { width: 1000, height: 2000 },
      gap: 5,
      sheets: [],
      totalSheets: 0,
      totalPlaced: 0,
      totalRequired: 0,
      avgFillPercent: 0,
      cutLengthEstimate: 0,
      sharedCutLength: 0,
      cutLengthAfterMerge: 0,
      pierceEstimate: 0,
      pierceDelta: 0,
    },
    createdAt,
  };
}

describe('N6: sharedSheetStore cap at 2000 entries', () => {
  it('does not grow beyond 2000 entries when saving many sheets', async () => {
    const { saveSharedSheet, sharedSheetStore } = await freshModule();
    sharedSheetStore.clear();

    for (let i = 0; i < 2_100; i++) {
      await saveSharedSheet(makeEntry(`${i.toString(16).padStart(8, '0')}`));
    }

    expect(sharedSheetStore.size).toBeLessThanOrEqual(2_000);
  });

  it('evicts oldest entry when at capacity', async () => {
    const { saveSharedSheet, sharedSheetStore } = await freshModule();
    sharedSheetStore.clear();

    // fill exactly to cap
    for (let i = 0; i < 2_000; i++) {
      await saveSharedSheet(makeEntry(`fill${i.toString(16).padStart(4, '0')}`));
    }
    const firstKey = sharedSheetStore.keys().next().value as string;

    // add one more — first entry should be evicted
    await saveSharedSheet(makeEntry('newentry1'));

    expect(sharedSheetStore.has(firstKey)).toBe(false);
    expect(sharedSheetStore.has('newentry1')).toBe(true);
    expect(sharedSheetStore.size).toBe(2_000);
  });

  it('does not evict when updating existing entry', async () => {
    const { saveSharedSheet, sharedSheetStore } = await freshModule();
    sharedSheetStore.clear();

    for (let i = 0; i < 2_000; i++) {
      await saveSharedSheet(makeEntry(`slot${i.toString(16).padStart(4, '0')}`));
    }
    const sizeBeforeUpdate = sharedSheetStore.size;

    // Update existing entry — should not evict anything extra
    await saveSharedSheet(makeEntry('slot0000'));
    expect(sharedSheetStore.size).toBe(sizeBeforeUpdate);
  });
});

describe('saveSharedSheet / getSharedSheet / hasSharedSheet', () => {
  it('saves and retrieves a sheet', async () => {
    const { saveSharedSheet, getSharedSheet, sharedSheetStore } = await freshModule();
    sharedSheetStore.clear();

    const entry = makeEntry('aabbccdd');
    await saveSharedSheet(entry);
    const retrieved = await getSharedSheet('aabbccdd');
    expect(retrieved).not.toBeNull();
    expect(retrieved!.hash).toBe('aabbccdd');
  });

  it('normalizes hash to lowercase', async () => {
    const { saveSharedSheet, getSharedSheet, sharedSheetStore } = await freshModule();
    sharedSheetStore.clear();

    await saveSharedSheet(makeEntry('AABBCCDD'));
    const result = await getSharedSheet('aabbccdd');
    expect(result).not.toBeNull();
  });

  it('returns null for unknown hash', async () => {
    const { getSharedSheet, sharedSheetStore } = await freshModule();
    sharedSheetStore.clear();
    expect(await getSharedSheet('00000000')).toBeNull();
  });

  it('returns null for expired entry', async () => {
    const { saveSharedSheet, getSharedSheet, sharedSheetStore } = await freshModule();
    sharedSheetStore.clear();

    const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
    const expired = makeEntry('deadbeef', Date.now() - SEVEN_DAYS_MS - 1000);
    await saveSharedSheet(expired);

    const result = await getSharedSheet('deadbeef');
    expect(result).toBeNull();
    // Entry should be removed from store
    expect(sharedSheetStore.has('deadbeef')).toBe(false);
  });

  it('hasSharedSheet returns true for existing entry', async () => {
    const { saveSharedSheet, hasSharedSheet, sharedSheetStore } = await freshModule();
    sharedSheetStore.clear();

    await saveSharedSheet(makeEntry('12345678'));
    expect(await hasSharedSheet('12345678')).toBe(true);
  });

  it('hasSharedSheet returns false for expired entry', async () => {
    const { saveSharedSheet, hasSharedSheet, sharedSheetStore } = await freshModule();
    sharedSheetStore.clear();

    const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
    await saveSharedSheet(makeEntry('cafebabe', Date.now() - SEVEN_DAYS_MS - 1));
    expect(await hasSharedSheet('cafebabe')).toBe(false);
  });
});

describe('generateShortHash', () => {
  it('generates 8-char hex string', async () => {
    const { generateShortHash } = await freshModule();
    const hash = generateShortHash();
    expect(hash).toMatch(/^[0-9a-f]{8}$/);
  });

  it('generates unique hashes', async () => {
    const { generateShortHash } = await freshModule();
    const hashes = new Set(Array.from({ length: 20 }, () => generateShortHash()));
    expect(hashes.size).toBeGreaterThan(15);
  });
});

describe('pruneExpiredSheets', () => {
  it('removes expired entries from store', async () => {
    const { saveSharedSheet, pruneExpiredSheets, sharedSheetStore } = await freshModule();
    sharedSheetStore.clear();

    const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
    await saveSharedSheet(makeEntry('expired01', Date.now() - SEVEN_DAYS_MS - 1));
    await saveSharedSheet(makeEntry('expired02', Date.now() - SEVEN_DAYS_MS - 1));
    await saveSharedSheet(makeEntry('fresh001'));

    await pruneExpiredSheets();

    expect(sharedSheetStore.has('expired01')).toBe(false);
    expect(sharedSheetStore.has('expired02')).toBe(false);
    expect(sharedSheetStore.has('fresh001')).toBe(true);
  });
});
