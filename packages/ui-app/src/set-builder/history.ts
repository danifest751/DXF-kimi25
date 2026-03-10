import type { NestingResults } from './types.js';

const HISTORY_STORAGE_KEY = 'dxf-nesting-history';
const MAX_HISTORY = 20;

export interface HistoryEntry {
  id: string;
  createdAt: number;
  sheetsCount: number;
  partsCount: number;
  avgUtilization: number;
  results: NestingResults;
}

export function loadHistory(): HistoryEntry[] {
  try {
    const raw = localStorage.getItem(HISTORY_STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as HistoryEntry[];
  } catch {
    return [];
  }
}

function saveHistory(entries: HistoryEntry[]): void {
  localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(entries));
}

export function pushToHistory(results: NestingResults): HistoryEntry {
  const entry: HistoryEntry = {
    id: `hist_${Date.now()}`,
    createdAt: Date.now(),
    sheetsCount: results.sheets.length,
    partsCount: results.sheets.reduce((sum, s) => sum + s.partCount, 0),
    avgUtilization: Math.round(
      results.sheets.reduce((sum, s) => sum + s.utilization, 0) / Math.max(1, results.sheets.length),
    ),
    results,
  };
  const entries = loadHistory();
  entries.unshift(entry);
  if (entries.length > MAX_HISTORY) entries.length = MAX_HISTORY;
  saveHistory(entries);
  return entry;
}

export function deleteHistoryEntry(id: string): void {
  const entries = loadHistory().filter((e) => e.id !== id);
  saveHistory(entries);
}

export function clearHistory(): void {
  localStorage.removeItem(HISTORY_STORAGE_KEY);
}
