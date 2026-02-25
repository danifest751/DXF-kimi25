/**
 * @module state
 * Глобальное изменяемое состояние приложения.
 * Все модули читают/пишут состояние через этот модуль.
 */

import type { LoadedFile, WorkspaceCatalog, ComputeMode } from './types.js';
import type { NestingResult, NestingOptions } from '../../core-engine/src/nesting/index.js';
import { DXFRenderer } from '../../core-engine/src/render/renderer.js';
import { canvas } from './dom.js';

// ─── Renderer ────────────────────────────────────────────────────────

export const renderer = new DXFRenderer();
renderer.attach(canvas);

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

// ─── Режимы вычисления ───────────────────────────────────────────────

export let cuttingComputeMode: ComputeMode  = 'api';
export let nestingComputeMode: ComputeMode  = 'api';

export function setCuttingComputeMode(m: ComputeMode): void { cuttingComputeMode = m; }
export function setNestingComputeMode(m: ComputeMode): void { nestingComputeMode = m; }

// ─── Nesting ─────────────────────────────────────────────────────────

export let nestingMode        = false;
export let currentNestResult: NestingResult | null = null;
export let lastNestingOptions: NestingOptions | null = null;
export let nestCellRects: { x: number; y: number; w: number; h: number; si: number }[] = [];
export let nestSheetHashes: string[] = [];
export let nestHoveredSheet   = -1;

export function setNestingMode(v: boolean): void            { nestingMode = v; }
export function setCurrentNestResult(r: NestingResult | null): void { currentNestResult = r; }
export function setLastNestingOptions(o: NestingOptions | null): void { lastNestingOptions = o; }
export function setNestCellRects(rects: typeof nestCellRects): void { nestCellRects = rects; }
export function setNestSheetHashes(h: string[]): void       { nestSheetHashes = h; }
export function setNestHoveredSheet(i: number): void        { nestHoveredSheet = i; }

// ─── UI состояние ────────────────────────────────────────────────────

export let showGrid = false;
export function setShowGrid(v: boolean): void { showGrid = v; }
