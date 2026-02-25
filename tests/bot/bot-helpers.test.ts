/** @vitest-environment node */

/**
 * Bot helper logic tests:
 * - N9: hash lookup limited to 5 per message
 * - P5: bot nesting timeout via Promise.race
 * - N8: guest draft file count limit (logic replica)
 * - parseSheetSizeText: input validation
 */

import { describe, it, expect, vi } from 'vitest';

// ─── N9: hash limit replica ───────────────────────────────────────────

/**
 * Replica of hash extraction logic from bot-service/src/index.ts:
 *   const uniqueHashes = [...new Set(hashes.map(h => h.toLowerCase()))].slice(0, 5);
 */
function extractHashes(text: string): string[] {
  const hashPattern = /\b[0-9a-f]{8}\b/gi;
  const hashes = text.match(hashPattern);
  if (!hashes || hashes.length === 0) return [];
  return [...new Set(hashes.map((h) => h.toLowerCase()))].slice(0, 5);
}

describe('N9: bot hash extraction limited to 5', () => {
  it('extracts single hash', () => {
    expect(extractHashes('Send me aabbccdd')).toEqual(['aabbccdd']);
  });

  it('deduplicates identical hashes', () => {
    expect(extractHashes('aabbccdd aabbccdd aabbccdd')).toEqual(['aabbccdd']);
  });

  it('limits to 5 unique hashes even if more present', () => {
    const text = 'aabbccdd 11223344 55667788 99aabbcc ddeeff00 01234567 89abcdef';
    const result = extractHashes(text);
    expect(result.length).toBe(5);
  });

  it('normalises to lowercase', () => {
    const result = extractHashes('AABBCCDD');
    expect(result).toEqual(['aabbccdd']);
  });

  it('does not match 7-char or 9-char strings', () => {
    expect(extractHashes('aabbccd')).toEqual([]);  // 7 chars
    expect(extractHashes('aabbccdde')).toEqual([]); // 9 chars
  });

  it('does not match non-hex 8-char strings', () => {
    expect(extractHashes('xyzxyzxy')).toEqual([]);
  });

  it('returns empty array when no hashes found', () => {
    expect(extractHashes('hello world')).toEqual([]);
    expect(extractHashes('')).toEqual([]);
  });

  it('exactly 5 unique hashes returns all 5', () => {
    const text = 'aabbccdd 11223344 55667788 99aabbcc ddeeff00';
    expect(extractHashes(text)).toHaveLength(5);
  });
});

// ─── P5: bot nesting timeout via Promise.race ─────────────────────────

describe('P5: nesting timeout via Promise.race', () => {
  it('resolves immediately when nesting completes fast', async () => {
    vi.useFakeTimers();

    const fastNest = Promise.resolve({ totalSheets: 1 });
    const timeout = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('Nesting timeout (25s)')), 25_000),
    );

    const result = await Promise.race([fastNest, timeout]);
    expect((result as { totalSheets: number }).totalSheets).toBe(1);

    vi.useRealTimers();
  });

  it('rejects with timeout error when nesting hangs', async () => {
    vi.useFakeTimers();

    const hangingNest = new Promise<never>(() => { /* never resolves */ });
    const timeout = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('Nesting timeout (25s)')), 25_000),
    );

    const racePromise = Promise.race([hangingNest, timeout]);

    // Advance time past timeout
    vi.advanceTimersByTime(25_001);

    await expect(racePromise).rejects.toThrow('Nesting timeout (25s)');

    vi.useRealTimers();
  });

  it('timeout fires at exactly 25s, not before', async () => {
    vi.useFakeTimers();

    let timedOut = false;
    const hangingNest = new Promise<never>(() => { /* never resolves */ });
    const timeout = new Promise<never>((_, reject) =>
      setTimeout(() => {
        timedOut = true;
        reject(new Error('Nesting timeout (25s)'));
      }, 25_000),
    );

    const race = Promise.race([hangingNest, timeout]).catch(() => {});

    vi.advanceTimersByTime(24_999);
    // Not yet timed out
    expect(timedOut).toBe(false);

    vi.advanceTimersByTime(2);
    await race;
    expect(timedOut).toBe(true);

    vi.useRealTimers();
  });
});

// ─── parseSheetSizeText replica (bot input validation) ────────────────

interface SheetSize { width: number; height: number }

function parseSheetSizeText(text: string): SheetSize | null {
  const normalized = text.trim().toLowerCase().replace('х', 'x').replace('*', 'x');
  const match = normalized.match(/^(\d{2,5})\s*x\s*(\d{2,5})$/);
  if (!match) return null;
  const width = Number(match[1]);
  const height = Number(match[2]);
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    return null;
  }
  return { width, height };
}

describe('parseSheetSizeText — bot sheet size input', () => {
  it('parses standard format 1000x2000', () => {
    expect(parseSheetSizeText('1000x2000')).toEqual({ width: 1000, height: 2000 });
  });

  it('parses with spaces 1500 x 3000', () => {
    expect(parseSheetSizeText('1500 x 3000')).toEqual({ width: 1500, height: 3000 });
  });

  it('parses with asterisk 1000*2000', () => {
    expect(parseSheetSizeText('1000*2000')).toEqual({ width: 1000, height: 2000 });
  });

  it('parses Cyrillic х as x', () => {
    expect(parseSheetSizeText('1000х2000')).toEqual({ width: 1000, height: 2000 });
  });

  it('returns null for single number', () => {
    expect(parseSheetSizeText('1000')).toBeNull();
  });

  it('returns null for too short numbers (1 digit)', () => {
    expect(parseSheetSizeText('1x2000')).toBeNull();
  });

  it('returns null for too long numbers (6 digits)', () => {
    expect(parseSheetSizeText('100000x2000')).toBeNull();
  });

  it('returns null for non-numeric input', () => {
    expect(parseSheetSizeText('AxB')).toBeNull();
  });

  it('returns null for empty string', () => {
    expect(parseSheetSizeText('')).toBeNull();
  });

  it('is case-insensitive (uppercase X)', () => {
    expect(parseSheetSizeText('1000X2000')).toEqual({ width: 1000, height: 2000 });
  });
});

// ─── N8: guest draft file count limit (logic replica) ─────────────────

describe('N8: restoreGuestDraft file count limit', () => {
  interface GuestFile { base64: string; name: string; checked: boolean; quantity: number }

  /**
   * Replica of the limiting logic in restoreGuestDraft from auth.ts:
   *   const MAX_GUEST_FILES = 50;
   *   let restored = 0;
   *   for (const file of parsed.files) {
   *     if (restored >= MAX_GUEST_FILES) break;
   *     ...
   *     restored++;
   *   }
   */
  function countRestoredFiles(files: GuestFile[], maxFiles = 50): number {
    const MAX_GUEST_FILE_SIZE_B64 = 270_000_000;
    let restored = 0;
    for (const file of files) {
      if (restored >= maxFiles) break;
      if (!file.base64 || file.base64.length > MAX_GUEST_FILE_SIZE_B64) continue;
      restored++;
    }
    return restored;
  }

  it('restores up to 50 files', () => {
    const files = Array.from({ length: 50 }, (_, i) => ({
      base64: 'AAAA',
      name: `f${i}.dxf`,
      checked: true,
      quantity: 1,
    }));
    expect(countRestoredFiles(files)).toBe(50);
  });

  it('stops at 50 when more than 50 files present', () => {
    const files = Array.from({ length: 100 }, (_, i) => ({
      base64: 'AAAA',
      name: `f${i}.dxf`,
      checked: true,
      quantity: 1,
    }));
    expect(countRestoredFiles(files)).toBe(50);
  });

  it('skips files with empty base64', () => {
    const files = [
      { base64: '', name: 'empty.dxf', checked: true, quantity: 1 },
      { base64: 'AAAA', name: 'good.dxf', checked: true, quantity: 1 },
    ];
    expect(countRestoredFiles(files)).toBe(1);
  });

  it('skips files exceeding max size', () => {
    const files = [
      { base64: 'x'.repeat(270_000_001), name: 'big.dxf', checked: true, quantity: 1 },
      { base64: 'AAAA', name: 'small.dxf', checked: true, quantity: 1 },
    ];
    expect(countRestoredFiles(files)).toBe(1);
  });

  it('handles empty files array', () => {
    expect(countRestoredFiles([])).toBe(0);
  });
});
