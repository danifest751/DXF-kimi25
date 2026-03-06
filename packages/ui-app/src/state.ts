/**
 * @module state
 * Глобальное изменяемое состояние приложения.
 * Все модули читают/пишут состояние через этот модуль.
 */

import type { LoadedFile, WorkspaceCatalog } from './types.js';

// ─── Файлы ───────────────────────────────────────────────────────────

export const loadedFiles: LoadedFile[] = [];
export let nextFileId = 1;
export let activeFileId: number = -1;

export function bumpNextFileId(): number { return nextFileId++; }
export function setActiveFileId(id: number): void { activeFileId = id; }

// ─── Каталоги ────────────────────────────────────────────────────────

export const workspaceCatalogs: WorkspaceCatalog[] = [];
export const selectedCatalogIds = new Set<string>();
export const UNCATEGORIZED_CATALOG_ID = '__uncategorized__';

// ─── Аутентификация ──────────────────────────────────────────────────

export const AUTH_TOKEN_STORAGE_KEY   = 'dxf_viewer_auth_session_token';
export const GUEST_DRAFT_STORAGE_KEY  = 'dxf_viewer_guest_draft_v1';

export let authSessionToken = '';
export let authWorkspaceId  = '';

export function setAuthSession(token: string, workspaceId: string): void {
  authSessionToken = token;
  authWorkspaceId  = workspaceId;
}

export function clearAuthSession(): void {
  authSessionToken = '';
  authWorkspaceId  = '';
}
