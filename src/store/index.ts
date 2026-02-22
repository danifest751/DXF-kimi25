/**
 * @module store
 * IndexedDB хранилище для настроек и недавних файлов.
 */

import { openDB, type IDBPDatabase } from 'idb';
import type { AppSettings, RecentFileRecord } from '../../packages/core-engine/src/types/index.js';

const DB_NAME = 'dxf-viewer-db';
const DB_VERSION = 1;
const SETTINGS_STORE = 'settings';
const RECENT_FILES_STORE = 'recentFiles';

let dbPromise: Promise<IDBPDatabase> | null = null;

function getDB(): Promise<IDBPDatabase> {
  if (dbPromise === null) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains(SETTINGS_STORE)) {
          db.createObjectStore(SETTINGS_STORE, { keyPath: 'key' });
        }
        if (!db.objectStoreNames.contains(RECENT_FILES_STORE)) {
          db.createObjectStore(RECENT_FILES_STORE, { keyPath: 'id' });
        }
      },
    });
  }
  return dbPromise;
}

// ─── Настройки ──────────────────────────────────────────────────────

const DEFAULT_SETTINGS: AppSettings = {
  theme: 'dark',
  defaultZoom: 1,
  showGrid: false,
  showAxes: true,
  antialiasing: true,
  maxFileSize: 200 * 1024 * 1024,
  recentFiles: [],
};

export async function getSettings(): Promise<AppSettings> {
  const db = await getDB();
  const record = await db.get(SETTINGS_STORE, 'app-settings');
  if (record !== undefined) {
    return record.value as AppSettings;
  }
  return DEFAULT_SETTINGS;
}

export async function saveSettings(settings: Partial<AppSettings>): Promise<void> {
  const db = await getDB();
  const current = await getSettings();
  const merged = { ...current, ...settings };
  await db.put(SETTINGS_STORE, { key: 'app-settings', value: merged });
}

// ─── Недавние файлы ─────────────────────────────────────────────────

export async function getRecentFiles(): Promise<RecentFileRecord[]> {
  const db = await getDB();
  const all = await db.getAll(RECENT_FILES_STORE);
  return (all as RecentFileRecord[]).sort((a, b) => b.lastOpened - a.lastOpened);
}

export async function addRecentFile(file: RecentFileRecord): Promise<void> {
  const db = await getDB();
  await db.put(RECENT_FILES_STORE, file);
}

export async function removeRecentFile(id: string): Promise<void> {
  const db = await getDB();
  await db.delete(RECENT_FILES_STORE, id);
}

export async function clearRecentFiles(): Promise<void> {
  const db = await getDB();
  await db.clear(RECENT_FILES_STORE);
}
