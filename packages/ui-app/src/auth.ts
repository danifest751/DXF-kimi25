/**
 * @module auth
 * Telegram-аутентификация: вход, выход, восстановление сессии, guest draft.
 */

import { apiGetJSON, apiPostJSON, arrayBufferToBase64 } from './api.js';
import type { LoadedFile, WorkspaceCatalog } from './types.js';
import {
  authSessionToken, authWorkspaceId,
  setAuthSession, clearAuthSession,
  AUTH_TOKEN_STORAGE_KEY, GUEST_DRAFT_STORAGE_KEY,
  UNCATEGORIZED_CATALOG_ID,
  workspaceCatalogs, selectedCatalogIds,
  loadedFiles, activeFileId,
  nextFileId, bumpNextFileId, setActiveFileId,
  renderer,
} from './state.js';
import {
  btnAuthLogin, btnAuthLogout, btnAddCatalog, authWorkspace, welcome,
} from './dom.js';
import { parseDXFInWorker } from '../../core-engine/src/workers/index.js';

// ─── Interfaces ──────────────────────────────────────────────────────

export interface AuthExchangeResponse {
  readonly success: boolean;
  readonly sessionToken: string;
  readonly workspaceId: string;
  readonly expiresAt: string;
}

export interface AuthMeResponse {
  readonly authenticated: boolean;
  readonly userId: string;
  readonly workspaceId: string;
  readonly expiresAt: string;
}

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

export interface WorkspaceFileMeta {
  readonly id: string;
  readonly workspaceId: string;
  readonly catalogId: string | null;
  readonly name: string;
  readonly storagePath: string;
  readonly sizeBytes: number;
  readonly checked: boolean;
  readonly quantity: number;
  readonly createdAt: number;
  readonly updatedAt: number;
}

// ─── Callbacks (заполняются из main.ts после инициализации) ──────────

type VoidFn = () => void;
type AsyncVoidFn = () => Promise<void>;

let _updateAuthUi: VoidFn = () => {};
let _renderCatalogFilter: VoidFn = () => {};
let _renderFileList: VoidFn = () => {};
let _recalcTotals: VoidFn = () => {};
let _updateNestItems: VoidFn = () => {};
let _computeStats: (base64: string, doc: LoadedFile['doc']) => Promise<LoadedFile['stats']> = async () => ({
  totalPierces: 0, totalCutLength: 0, cuttingEntityCount: 0, chains: [],
});
let _setActiveFile: (id: number) => void = () => {};
let _reloadFromServer: AsyncVoidFn = async () => {};

export function initAuthCallbacks(cbs: {
  updateAuthUi: VoidFn;
  renderCatalogFilter: VoidFn;
  renderFileList: VoidFn;
  recalcTotals: VoidFn;
  updateNestItems: VoidFn;
  computeStats: (base64: string, doc: LoadedFile['doc']) => Promise<LoadedFile['stats']>;
  setActiveFile: (id: number) => void;
  reloadFromServer: AsyncVoidFn;
}): void {
  _updateAuthUi        = cbs.updateAuthUi;
  _renderCatalogFilter = cbs.renderCatalogFilter;
  _renderFileList      = cbs.renderFileList;
  _recalcTotals        = cbs.recalcTotals;
  _updateNestItems     = cbs.updateNestItems;
  _computeStats        = cbs.computeStats;
  _setActiveFile       = cbs.setActiveFile;
  _reloadFromServer    = cbs.reloadFromServer;
}

// ─── Helpers ─────────────────────────────────────────────────────────

export function getAuthHeaders(): Record<string, string> {
  return authSessionToken ? { Authorization: `Bearer ${authSessionToken}` } : {};
}

export function showAuthHint(message: string, timeoutMs = 2200): void {
  authWorkspace.textContent = message;
  window.setTimeout(() => _updateAuthUi(), timeoutMs);
}

function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

// ─── Guest draft ─────────────────────────────────────────────────────

export function saveGuestDraft(): void {
  if (authSessionToken) return;
  const files: GuestDraftFile[] = loadedFiles
    .filter((f) => typeof f.localBase64 === 'string' && f.localBase64.length > 0)
    .map((f) => ({
      name: f.name,
      base64: f.localBase64!,
      checked: f.checked,
      quantity: f.quantity,
      catalogId: f.catalogId,
    }));
  const payload: GuestDraftPayload = { version: 1, files };
  localStorage.setItem(GUEST_DRAFT_STORAGE_KEY, JSON.stringify(payload));
}

export function clearGuestDraft(): void {
  localStorage.removeItem(GUEST_DRAFT_STORAGE_KEY);
}

export async function restoreGuestDraft(): Promise<void> {
  const raw = localStorage.getItem(GUEST_DRAFT_STORAGE_KEY) ?? '';
  if (!raw) return;
  try {
    const parsed = JSON.parse(raw) as GuestDraftPayload;
    if (parsed.version !== 1 || !Array.isArray(parsed.files)) return;

    workspaceCatalogs.splice(0, workspaceCatalogs.length);
    selectedCatalogIds.clear();
    loadedFiles.splice(0, loadedFiles.length);

    const MAX_GUEST_FILE_SIZE_B64 = 270_000_000; // ~200 MB
    const MAX_GUEST_FILES = 50;
    let restored = 0;
    for (const file of parsed.files) {
      if (restored >= MAX_GUEST_FILES) break;
      if (!file.base64 || file.base64.length > MAX_GUEST_FILE_SIZE_B64) continue;
      restored++;
      const buffer = base64ToArrayBuffer(file.base64);
      const result = await parseDXFInWorker(buffer);
      const stats = await _computeStats(file.base64, result.document);
      loadedFiles.push({
        id: bumpNextFileId(),
        remoteId: '',
        workspaceId: '',
        catalogId: null,
        name: file.name,
        localBase64: file.base64,
        doc: result.document,
        stats,
        checked: Boolean(file.checked),
        quantity: Math.max(1, Number(file.quantity) || 1),
      });
    }

    if (loadedFiles.length > 0) {
      selectedCatalogIds.add(UNCATEGORIZED_CATALOG_ID);
      _setActiveFile(loadedFiles[0]!.id);
    }

    _renderCatalogFilter();
    _renderFileList();
    _recalcTotals();
    _updateNestItems();
  } catch (error) {
    console.error('Restore guest draft failed:', error);
  }
}

export async function migrateGuestDraftToWorkspace(): Promise<void> {
  if (!authSessionToken) return;
  const raw = localStorage.getItem(GUEST_DRAFT_STORAGE_KEY) ?? '';
  if (!raw) return;

  let parsed: GuestDraftPayload;
  try {
    parsed = JSON.parse(raw) as GuestDraftPayload;
  } catch {
    return;
  }
  if (parsed.version !== 1 || !Array.isArray(parsed.files) || parsed.files.length === 0) {
    clearGuestDraft();
    return;
  }

  const MAX_MIGRATE_FILES = 50;
  let migrated = 0;
  for (const file of parsed.files) {
    if (migrated >= MAX_MIGRATE_FILES) break;
    if (!file.name.toLowerCase().endsWith('.dxf')) continue;
    if (!file.base64) continue;
    migrated++;
    try {
      await apiPostJSON<{ success: boolean; file: WorkspaceFileMeta }>('/api/library-files', {
        name: file.name,
        base64: file.base64,
        catalogId: null,
        checked: Boolean(file.checked),
        quantity: Math.max(1, Number(file.quantity) || 1),
      }, getAuthHeaders());
    } catch (err) {
      console.warn('Failed to migrate file:', file.name, err instanceof Error ? err.message : String(err));
    }
  }
  clearGuestDraft();
}

// ─── Session ─────────────────────────────────────────────────────────

export async function logoutWorkspace(): Promise<void> {
  clearAuthSession();
  localStorage.removeItem(AUTH_TOKEN_STORAGE_KEY);
  _updateAuthUi();

  workspaceCatalogs.splice(0, workspaceCatalogs.length);
  selectedCatalogIds.clear();
  loadedFiles.splice(0, loadedFiles.length);
  setActiveFileId(-1);
  renderer.clearDocument();
  welcome.classList.remove('hidden');

  await restoreGuestDraft();
  _renderCatalogFilter();
  _renderFileList();
  _recalcTotals();
  _updateNestItems();
}

export async function restoreAuthSession(): Promise<void> {
  const savedToken = localStorage.getItem(AUTH_TOKEN_STORAGE_KEY) ?? '';
  if (!savedToken) {
    _updateAuthUi();
    await restoreGuestDraft();
    return;
  }
  try {
    setAuthSession(savedToken, '');
    const me = await apiGetJSON<AuthMeResponse>('/api/auth-me', getAuthHeaders());
    if (!me.authenticated) throw new Error('Session rejected');
    setAuthSession(savedToken, me.workspaceId);
    _updateAuthUi();
    await migrateGuestDraftToWorkspace();
    await _reloadFromServer();
  } catch {
    clearAuthSession();
    localStorage.removeItem(AUTH_TOKEN_STORAGE_KEY);
    _updateAuthUi();
    await restoreGuestDraft();
  }
}

export async function runTelegramLoginFlow(): Promise<void> {
  const code = prompt('Введите код из Telegram бота (/login):')?.trim().toUpperCase() ?? '';
  if (!code) return;
  try {
    const response = await apiPostJSON<AuthExchangeResponse>('/api/auth-telegram-exchange-code', { code });
    setAuthSession(response.sessionToken, response.workspaceId);
    localStorage.setItem(AUTH_TOKEN_STORAGE_KEY, response.sessionToken);
    _updateAuthUi();
    await migrateGuestDraftToWorkspace();
    await _reloadFromServer();
  } catch (error) {
    const details = error instanceof Error ? error.message : String(error);
    showAuthHint('Код неверный или истек');
    console.error('Telegram login failed:', details);
  }
}

// ─── Update Auth UI ───────────────────────────────────────────────────
// (вызывается из updateAuthUi в main.ts, здесь только DOM-обновление)

export function applyAuthUiState(updateUploadTargetHint: VoidFn): void {
  const isAuthenticated = authSessionToken.length > 0 && authWorkspaceId.length > 0;
  if (isAuthenticated) {
    const shortId = authWorkspaceId.length > 12 ? authWorkspaceId.slice(0, 12) + '…' : authWorkspaceId;
    authWorkspace.textContent = `WS: ${shortId}`;
    btnAuthLogin.textContent  = 'Сменить Telegram';
    btnAuthLogin.title        = 'Сменить Telegram-сессию';
    btnAuthLogout.hidden      = false;
    btnAddCatalog.hidden      = false;
    return;
  }
  authWorkspace.textContent = 'Гость';
  btnAuthLogin.textContent  = 'Вход Telegram';
  btnAuthLogin.title        = 'Вход через Telegram код';
  btnAuthLogout.hidden      = true;
  btnAddCatalog.hidden      = true;
  updateUploadTargetHint();
}
