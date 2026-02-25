/**
 * @module shared-sheets
 * In-memory store for shared nesting sheets (hash → single-sheet NestingResult).
 * Extracted to avoid circular imports between api-service and bot-service.
 */

import crypto from 'node:crypto';
import type { NestingResult } from '../../core-engine/src/nesting/index.js';
import { supabaseEnabled, supabaseRequest } from './supabase-client.js';

export interface SharedSheet {
  readonly hash: string;
  readonly sheetIndex: number;
  readonly singleResult: NestingResult;
  readonly createdAt: number;
}

interface SharedSheetRow {
  readonly hash: string;
  readonly sheet_index: number;
  readonly single_result: NestingResult;
  readonly created_at: string;
}

const SHARED_SHEET_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
const SHARED_SHEETS_TABLE = process.env.SUPABASE_SHARED_SHEETS_TABLE?.trim() || 'shared_sheets';

export const sharedSheetStore = new Map<string, SharedSheet>();

export function generateShortHash(): string {
  return crypto.randomBytes(4).toString('hex'); // 8 hex chars
}

function isExpired(entry: SharedSheet, now = Date.now()): boolean {
  return now - entry.createdAt > SHARED_SHEET_TTL_MS;
}

function fromRow(row: SharedSheetRow): SharedSheet {
  return {
    hash: row.hash,
    sheetIndex: row.sheet_index,
    singleResult: row.single_result,
    createdAt: Date.parse(row.created_at),
  };
}

function toRow(entry: SharedSheet): SharedSheetRow {
  return {
    hash: entry.hash,
    sheet_index: entry.sheetIndex,
    single_result: entry.singleResult,
    created_at: new Date(entry.createdAt).toISOString(),
  };
}

async function removeFromDb(hash: string): Promise<void> {
  if (!supabaseEnabled) return;
  const params = new URLSearchParams({ hash: `eq.${hash}` });
  const response = await supabaseRequest(`/${SHARED_SHEETS_TABLE}?${params.toString()}`, {
    method: 'DELETE',
  });
  if (!response?.ok) {
    console.error('[shared-sheets] supabase delete failed');
  }
}

async function loadFromDb(hash: string): Promise<SharedSheet | null> {
  if (!supabaseEnabled) return null;

  const params = new URLSearchParams({
    select: 'hash,sheet_index,single_result,created_at',
    hash: `eq.${hash}`,
    limit: '1',
  });
  const response = await supabaseRequest(`/${SHARED_SHEETS_TABLE}?${params.toString()}`);
  if (!response?.ok) {
    console.error('[shared-sheets] supabase read failed');
    return null;
  }

  const rows = await response.json() as SharedSheetRow[];
  if (!Array.isArray(rows) || rows.length === 0) return null;
  return fromRow(rows[0]!);
}

export async function pruneExpiredSheets(): Promise<void> {
  const now = Date.now();
  for (const [hash, entry] of sharedSheetStore) {
    if (isExpired(entry, now)) {
      sharedSheetStore.delete(hash);
    }
  }

  if (!supabaseEnabled) return;

  const cutoffIso = new Date(now - SHARED_SHEET_TTL_MS).toISOString();
  const params = new URLSearchParams({ created_at: `lt.${cutoffIso}` });
  const response = await supabaseRequest(`/${SHARED_SHEETS_TABLE}?${params.toString()}`, {
    method: 'DELETE',
  });
  if (!response?.ok) {
    console.error('[shared-sheets] supabase prune failed');
  }
}

export async function hasSharedSheet(hash: string): Promise<boolean> {
  const normalizedHash = hash.toLowerCase();
  const cached = sharedSheetStore.get(normalizedHash);
  if (cached) {
    if (isExpired(cached)) {
      sharedSheetStore.delete(normalizedHash);
      await removeFromDb(normalizedHash);
      return false;
    }
    return true;
  }

  const entry = await loadFromDb(normalizedHash);
  if (!entry) return false;
  if (isExpired(entry)) {
    await removeFromDb(normalizedHash);
    return false;
  }

  sharedSheetStore.set(normalizedHash, entry);
  return true;
}

export async function saveSharedSheet(entry: SharedSheet): Promise<void> {
  const normalizedEntry: SharedSheet = {
    ...entry,
    hash: entry.hash.toLowerCase(),
  };
  sharedSheetStore.set(normalizedEntry.hash, normalizedEntry);

  if (!supabaseEnabled) return;

  const response = await supabaseRequest(`/${SHARED_SHEETS_TABLE}?on_conflict=hash`, {
    method: 'POST',
    headers: {
      Prefer: 'resolution=merge-duplicates,return=minimal',
    },
    body: JSON.stringify([toRow(normalizedEntry)]),
  });
  if (!response?.ok) {
    console.error('[shared-sheets] supabase upsert failed');
  }
}

export async function getSharedSheet(hash: string): Promise<SharedSheet | null> {
  const normalizedHash = hash.toLowerCase();
  const cached = sharedSheetStore.get(normalizedHash);
  if (cached) {
    if (isExpired(cached)) {
      sharedSheetStore.delete(normalizedHash);
      await removeFromDb(normalizedHash);
      return null;
    }
    return cached;
  }

  const entry = await loadFromDb(normalizedHash);
  if (!entry) return null;
  if (isExpired(entry)) {
    await removeFromDb(normalizedHash);
    return null;
  }

  sharedSheetStore.set(normalizedHash, entry);
  return entry;
}
