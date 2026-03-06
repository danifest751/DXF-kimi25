import {
  guestDraftBinaryStorageAvailable,
  loadGuestDraftContent,
  loadGuestDraftPointers,
  saveGuestDraftSnapshot,
} from './guest-draft-storage.js';

export interface GuestDraftFile {
  readonly name: string;
  readonly base64: string;
  readonly checked: boolean;
  readonly quantity: number;
  readonly catalogId: string | null;
}

export interface GuestDraftPayload {
  readonly version: 1;
  readonly files: GuestDraftFile[];
}

interface GuestDraftStoredFile {
  readonly id: string;
  readonly name: string;
  readonly checked: boolean;
  readonly quantity: number;
  readonly catalogId: string | null;
}

export interface ResolvedGuestDraftFile extends GuestDraftStoredFile {
  readonly base64: string;
}

export function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

export function base64ToBlob(base64: string, type = 'application/dxf'): Blob {
  return new Blob([base64ToArrayBuffer(base64)], { type });
}

export function saveLegacyGuestDraft(storageKey: string, files: GuestDraftFile[]): void {
  const payload: GuestDraftPayload = { version: 1, files };
  localStorage.setItem(storageKey, JSON.stringify(payload));
}

export function saveLegacyGuestDraftSnapshot(storageKey: string, snapshot: Array<{
  name: string;
  base64: string;
  checked: boolean;
  quantity: number;
  catalogId: string | null;
}>): void {
  saveLegacyGuestDraft(storageKey, snapshot.map((file) => ({
    name: file.name,
    base64: file.base64,
    checked: file.checked,
    quantity: file.quantity,
    catalogId: file.catalogId,
  })));
}

export async function loadGuestDraftFiles(storageKey: string): Promise<ResolvedGuestDraftFile[]> {
  const storedFiles = loadGuestDraftPointers(storageKey);
  if (storedFiles.length > 0) {
    const resolved: ResolvedGuestDraftFile[] = [];
    for (const file of storedFiles) {
      const base64 = await loadGuestDraftContent(file.id);
      if (!base64) continue;
      resolved.push({ ...file, base64 });
    }
    return resolved;
  }

  const raw = localStorage.getItem(storageKey) ?? '';
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as GuestDraftPayload;
    if (parsed.version !== 1 || !Array.isArray(parsed.files)) return [];
    const legacyFiles = parsed.files.filter((file) => typeof file?.base64 === 'string' && file.base64.length > 0);
    if (!guestDraftBinaryStorageAvailable()) {
      return legacyFiles.map((file, index) => ({ id: `legacy_${index}`, ...file }));
    }
    const migrated = await saveGuestDraftSnapshot(storageKey, legacyFiles.map((file) => ({
      name: file.name,
      base64: file.base64,
      checked: Boolean(file.checked),
      quantity: Math.max(1, Number(file.quantity) || 1),
      catalogId: file.catalogId,
    })));
    return migrated.map((file, index) => ({ ...file, base64: legacyFiles[index]!.base64 }));
  } catch {
    return [];
  }
}
