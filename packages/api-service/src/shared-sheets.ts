/**
 * @module shared-sheets
 * In-memory store for shared nesting sheets (hash → single-sheet NestingResult).
 * Extracted to avoid circular imports between api-service and bot-service.
 */

import crypto from 'node:crypto';
import type { NestingResult } from '../../core-engine/src/nesting/index.js';

export interface SharedSheet {
  readonly hash: string;
  readonly sheetIndex: number;
  readonly singleResult: NestingResult;
  readonly createdAt: number;
}

const SHARED_SHEET_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

export const sharedSheetStore = new Map<string, SharedSheet>();

export function generateShortHash(): string {
  return crypto.randomBytes(4).toString('hex'); // 8 hex chars
}

export function pruneExpiredSheets(): void {
  const now = Date.now();
  for (const [hash, entry] of sharedSheetStore) {
    if (now - entry.createdAt > SHARED_SHEET_TTL_MS) {
      sharedSheetStore.delete(hash);
    }
  }
}
