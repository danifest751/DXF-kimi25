const DB_NAME = 'dxf_viewer_guest_draft_db';
const STORE_NAME = 'files';

export interface GuestDraftStoredFile {
  readonly id: string;
  readonly name: string;
  readonly checked: boolean;
  readonly quantity: number;
  readonly catalogId: string | null;
}

export interface GuestDraftSnapshotFileInput {
  readonly id?: string;
  readonly name: string;
  readonly base64: string;
  readonly checked: boolean;
  readonly quantity: number;
  readonly catalogId: string | null;
}

interface GuestDraftBlobRecord {
  readonly id: string;
  readonly base64: string;
  readonly updatedAt: number;
}

function hasIndexedDb(): boolean {
  return typeof indexedDB !== 'undefined';
}

export function guestDraftBinaryStorageAvailable(): boolean {
  return hasIndexedDb();
}

function createDraftId(): string {
  const cryptoApi = globalThis.crypto;
  if (cryptoApi && typeof cryptoApi.randomUUID === 'function') {
    return cryptoApi.randomUUID();
  }
  return `draft_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

function openDb(): Promise<IDBDatabase | null> {
  if (!hasIndexedDb()) return Promise.resolve(null);
  return new Promise((resolve) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => resolve(null);
    request.onblocked = () => resolve(null);
  });
}

async function withStore<T>(mode: IDBTransactionMode, action: (store: IDBObjectStore) => Promise<T>): Promise<T | null> {
  const db = await openDb();
  if (!db) return null;
  try {
    const tx = db.transaction(STORE_NAME, mode);
    const store = tx.objectStore(STORE_NAME);
    const result = await action(store);
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
    return result;
  } catch {
    return null;
  } finally {
    db.close();
  }
}

function requestToPromise<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export function loadGuestDraftPointers(storageKey: string): GuestDraftStoredFile[] {
  const raw = localStorage.getItem(storageKey) ?? '';
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as { version?: number; files?: GuestDraftStoredFile[] };
    if (parsed.version !== 2 || !Array.isArray(parsed.files)) return [];
    return parsed.files.filter((file) => {
      return typeof file?.id === 'string'
        && typeof file?.name === 'string'
        && typeof file?.checked === 'boolean'
        && Number.isFinite(file?.quantity)
        && (file?.catalogId === null || typeof file?.catalogId === 'string');
    });
  } catch {
    return [];
  }
}

export function saveGuestDraftPointers(storageKey: string, files: GuestDraftStoredFile[]): void {
  localStorage.setItem(storageKey, JSON.stringify({ version: 2, files }));
}

export async function loadGuestDraftContent(id: string): Promise<string> {
  const result = await withStore('readonly', async (store) => {
    const record = await requestToPromise(store.get(id) as IDBRequest<GuestDraftBlobRecord | undefined>);
    return record?.base64 ?? '';
  });
  return result ?? '';
}

export async function saveGuestDraftSnapshot(storageKey: string, files: GuestDraftSnapshotFileInput[]): Promise<GuestDraftStoredFile[]> {
  const storedFiles: GuestDraftStoredFile[] = files.map((file) => ({
    id: file.id && file.id.length > 0 ? file.id : createDraftId(),
    name: file.name,
    checked: file.checked,
    quantity: Math.max(1, Math.trunc(file.quantity) || 1),
    catalogId: file.catalogId,
  }));
  const activeIds = new Set(storedFiles.map((file) => file.id));

  await withStore('readwrite', async (store) => {
    const existingKeys = await requestToPromise(store.getAllKeys() as IDBRequest<IDBValidKey[]>);
    for (const key of existingKeys) {
      if (typeof key === 'string' && !activeIds.has(key)) {
        await requestToPromise(store.delete(key));
      }
    }
    for (let i = 0; i < files.length; i++) {
      const source = files[i]!;
      const target = storedFiles[i]!;
      await requestToPromise(store.put({
        id: target.id,
        base64: source.base64,
        updatedAt: Date.now(),
      } satisfies GuestDraftBlobRecord));
    }
    return undefined;
  });

  saveGuestDraftPointers(storageKey, storedFiles);
  return storedFiles;
}

export async function clearGuestDraftSnapshot(storageKey: string): Promise<void> {
  localStorage.removeItem(storageKey);
  await withStore('readwrite', async (store) => {
    await requestToPromise(store.clear());
    return undefined;
  });
}
