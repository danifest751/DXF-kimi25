/**
 * @module auth
 * Telegram-аутентификация: вход, выход, восстановление сессии, guest draft.
 */

import { apiGetJSON, apiPostJSON, apiUploadFormDataJSON } from './api.js';
import {
  clearGuestDraftSnapshot,
  guestDraftBinaryStorageAvailable,
  saveGuestDraftSnapshot,
} from './guest-draft-storage.js';
import {
  base64ToArrayBuffer,
  base64ToBlob,
  loadGuestDraftFiles,
  type ResolvedGuestDraftFile,
  saveLegacyGuestDraft,
} from './auth-guest-draft-helpers.js';
import { t } from './i18n/index.js';
import type { LoadedFile } from './types.js';
import {
  authSessionToken, authWorkspaceId,
  setAuthSession, clearAuthSession,
  AUTH_TOKEN_STORAGE_KEY, GUEST_DRAFT_STORAGE_KEY,
  UNCATEGORIZED_CATALOG_ID,
  workspaceCatalogs, selectedCatalogIds,
  loadedFiles, bumpNextFileId, setActiveFileId,
  renderer,
} from './state.js';
import {
  btnAuthLogin, btnAuthLogout, btnAddCatalog, authWorkspace, welcome,
} from './dom.js';
import { createAuthUiBridgeController } from './auth-ui-bridge.js';
import { parseDXFInWorker } from '../../core-engine/src/workers/index.js';

export const AUTH_SESSION_EVENT = 'dxf-auth-session-changed';
const COOKIE_SESSION_TOKEN = '__cookie_session__';

function emitAuthSessionChanged(): void {
  window.dispatchEvent(new Event(AUTH_SESSION_EVENT));
}

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

const authUiBridge = createAuthUiBridgeController({
  computeStats: async () => ({
    totalPierces: 0, totalCutLength: 0, cuttingEntityCount: 0, chains: [],
  }),
});

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
  authUiBridge.init(cbs);
}

// ─── Helpers ─────────────────────────────────────────────────────────

export function getAuthHeaders(): Record<string, string> {
  return authSessionToken && authSessionToken !== COOKIE_SESSION_TOKEN
    ? { Authorization: `Bearer ${authSessionToken}` }
    : {};
}

export function showAuthHint(message: string, timeoutMs = 2200): void {
  authWorkspace.textContent = message;
  window.setTimeout(() => authUiBridge.updateAuthUi(), timeoutMs);
}

function toLegacyGuestDraftFiles(snapshot: Array<{
  name: string;
  base64: string;
  checked: boolean;
  quantity: number;
  catalogId: string | null;
}>): Array<{
  name: string;
  base64: string;
  checked: boolean;
  quantity: number;
  catalogId: string | null;
}> {
  return snapshot.map((file) => ({
    name: file.name,
    base64: file.base64,
    checked: file.checked,
    quantity: file.quantity,
    catalogId: file.catalogId,
  }));
}

function saveLegacyGuestDraftSnapshot(snapshot: Array<{
  name: string;
  base64: string;
  checked: boolean;
  quantity: number;
  catalogId: string | null;
}>): void {
  saveLegacyGuestDraft(GUEST_DRAFT_STORAGE_KEY, toLegacyGuestDraftFiles(snapshot));
}

function resetWorkspaceToGuestState(): void {
  workspaceCatalogs.splice(0, workspaceCatalogs.length);
  selectedCatalogIds.clear();
  loadedFiles.splice(0, loadedFiles.length);
  setActiveFileId(-1);
  renderer.clearDocument();
  welcome.classList.remove('hidden');
}

async function restoreGuestDraftFilesIntoWorkspace(guestFiles: ResolvedGuestDraftFile[]): Promise<void> {
  const MAX_GUEST_FILE_SIZE_B64 = 270_000_000;
  const MAX_GUEST_FILES = 50;
  let restored = 0;

  for (const file of guestFiles) {
    if (restored >= MAX_GUEST_FILES) break;
    if (!file.base64 || file.base64.length > MAX_GUEST_FILE_SIZE_B64) continue;
    restored++;
    const buffer = base64ToArrayBuffer(file.base64);
    const result = await parseDXFInWorker(buffer);
    const stats = await authUiBridge.computeStats(file.base64, result.document);
    loadedFiles.push({
      id: bumpNextFileId(),
      remoteId: '',
      workspaceId: '',
      catalogId: null,
      guestDraftId: file.id,
      name: file.name,
      localBase64: file.base64,
      doc: result.document,
      stats,
      checked: Boolean(file.checked),
      quantity: Math.max(1, Number(file.quantity) || 1),
    });
  }
}

async function migrateGuestDraftFilesToWorkspace(guestFiles: ResolvedGuestDraftFile[]): Promise<void> {
  const MAX_MIGRATE_FILES = 50;
  let migrated = 0;

  for (const file of guestFiles) {
    if (migrated >= MAX_MIGRATE_FILES) break;
    if (!file.name.toLowerCase().endsWith('.dxf')) continue;
    if (!file.base64) continue;
    migrated++;
    try {
      const formData = new FormData();
      formData.append('file', base64ToBlob(file.base64), file.name);
      formData.append('catalogId', '');
      formData.append('checked', String(Boolean(file.checked)));
      formData.append('quantity', String(Math.max(1, Number(file.quantity) || 1)));
      await apiUploadFormDataJSON<{ success: boolean; file: WorkspaceFileMeta }>('/api/library-files-upload', formData, getAuthHeaders());
    } catch (err) {
      console.warn('Failed to migrate file:', file.name, err instanceof Error ? err.message : String(err));
    }
  }
}

// ─── Guest draft ─────────────────────────────────────────────────────

export function saveGuestDraft(): void {
  if (authSessionToken) return;
  const guestFiles = loadedFiles.filter((f) => typeof f.localBase64 === 'string' && f.localBase64.length > 0);
  const snapshot = guestFiles.map((f) => ({
    id: f.guestDraftId,
    name: f.name,
    base64: f.localBase64!,
    checked: f.checked,
    quantity: f.quantity,
    catalogId: f.catalogId,
  }));
  if (!guestDraftBinaryStorageAvailable()) {
    saveLegacyGuestDraftSnapshot(snapshot);
    return;
  }
  void saveGuestDraftSnapshot(GUEST_DRAFT_STORAGE_KEY, snapshot)
    .then((storedFiles) => {
      storedFiles.forEach((file, index) => {
        const target = guestFiles[index];
        if (target) target.guestDraftId = file.id;
      });
    })
    .catch(() => {
      saveLegacyGuestDraftSnapshot(snapshot);
    });
}

export async function clearGuestDraft(): Promise<void> {
  await clearGuestDraftSnapshot(GUEST_DRAFT_STORAGE_KEY);
}

export async function restoreGuestDraft(): Promise<void> {
  try {
    const guestFiles = await loadGuestDraftFiles(GUEST_DRAFT_STORAGE_KEY);
    if (guestFiles.length === 0) return;

    resetWorkspaceToGuestState();
    await restoreGuestDraftFilesIntoWorkspace(guestFiles);

    if (loadedFiles.length > 0) {
      selectedCatalogIds.add(UNCATEGORIZED_CATALOG_ID);
      authUiBridge.setActiveFile(loadedFiles[0]!.id);
    }

    authUiBridge.refreshWorkspaceViews();
  } catch (error) {
    console.error('Restore guest draft failed:', error);
  }
}

export async function migrateGuestDraftToWorkspace(): Promise<void> {
  if (!authSessionToken) return;
  const guestFiles = await loadGuestDraftFiles(GUEST_DRAFT_STORAGE_KEY);
  if (guestFiles.length === 0) {
    await clearGuestDraft();
    return;
  }

  await migrateGuestDraftFilesToWorkspace(guestFiles);
  await clearGuestDraft();
}

async function adoptLegacyToken(savedToken: string): Promise<AuthMeResponse> {
  await apiPostJSON<{ success: boolean; workspaceId: string; expiresAt: string }>(
    '/api/auth-adopt-token',
    {},
    { Authorization: `Bearer ${savedToken}` },
  );
  return apiGetJSON<AuthMeResponse>('/api/auth-me');
}

function applyAuthenticatedSession(workspaceId: string): void {
  setAuthSession(COOKIE_SESSION_TOKEN, workspaceId);
  localStorage.removeItem(AUTH_TOKEN_STORAGE_KEY);
  authUiBridge.updateAuthUi();
  emitAuthSessionChanged();
}

function clearStoredAuthSession(): void {
  clearAuthSession();
  localStorage.removeItem(AUTH_TOKEN_STORAGE_KEY);
  authUiBridge.updateAuthUi();
  emitAuthSessionChanged();
}

async function finalizeAuthenticatedSession(workspaceId: string): Promise<void> {
  applyAuthenticatedSession(workspaceId);
  await migrateGuestDraftToWorkspace();
  await authUiBridge.reloadFromServer();
}

async function restoreGuestSessionFallback(): Promise<void> {
  clearStoredAuthSession();
  await restoreGuestDraft();
}

// ─── Session ─────────────────────────────────────────────────────────

export async function logoutWorkspace(): Promise<void> {
  try {
    await apiPostJSON<{ success: boolean }>('/api/auth-logout', {}, getAuthHeaders());
  } catch (error) {
    console.warn('Server logout failed:', error instanceof Error ? error.message : String(error));
  }
  clearStoredAuthSession();

  resetWorkspaceToGuestState();

  await restoreGuestDraft();
  authUiBridge.refreshWorkspaceViews();
}

export async function restoreAuthSession(): Promise<void> {
  const savedToken = localStorage.getItem(AUTH_TOKEN_STORAGE_KEY) ?? '';
  try {
    const me = savedToken
      ? await adoptLegacyToken(savedToken)
      : await apiGetJSON<AuthMeResponse>('/api/auth-me');
    if (!me.authenticated) throw new Error('Session rejected');
    await finalizeAuthenticatedSession(me.workspaceId);
  } catch {
    await restoreGuestSessionFallback();
  }
}

export async function runTelegramLoginFlow(): Promise<void> {
  const code = prompt(t('auth.login.prompt'))?.trim().toUpperCase() ?? '';
  if (!code) return;
  try {
    const response = await apiPostJSON<AuthExchangeResponse>('/api/auth-telegram-exchange-code', { code });
    await finalizeAuthenticatedSession(response.workspaceId);
  } catch (error) {
    const details = error instanceof Error ? error.message : String(error);
    showAuthHint(t('auth.codeInvalid'));
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
    btnAuthLogin.textContent  = t('auth.changeAccount');
    btnAuthLogin.title        = t('auth.changeAccount.title');
    btnAuthLogout.hidden      = false;
    btnAddCatalog.hidden      = false;
    return;
  }
  authWorkspace.textContent = t('toolbar.guest');
  btnAuthLogin.textContent  = t('toolbar.login');
  btnAuthLogin.title        = t('toolbar.login.title');
  btnAuthLogout.hidden      = true;
  btnAddCatalog.hidden      = true;
  updateUploadTargetHint();
}
