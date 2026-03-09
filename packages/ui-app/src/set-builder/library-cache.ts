/**
 * @module library-cache
 * Локальный кэш библиотеки в localStorage.
 * Позволяет мгновенно показать список файлов при открытии,
 * пока в фоне идёт верификация с сервером.
 *
 * Кэш хранит только метаданные LibraryItem (без геометрии).
 * Привязан к authToken — при смене пользователя используется другой слот.
 * Стабильный ключ каждой записи — remoteId файла (UUID Supabase).
 */

import { loadedFiles } from '../state.js';
import type { LibraryItem, SetBuilderState } from './types.js';

const CACHE_KEY_PREFIX = 'dxf_lib_cache_v2_';

interface CachedLibraryItem {
  remoteId: string;
  name: string;
  catalog: string;
  w: number;
  h: number;
  areaMm2: number;
  pierces: number;
  cutLen: number;
  layersCount: number;
  status: LibraryItem['status'];
  issues: readonly string[];
  thumbVariant: number;
}

interface LibraryCachePayload {
  savedAt: number;
  items: CachedLibraryItem[];
}

function cacheKey(tokenPrefix: string): string {
  return CACHE_KEY_PREFIX + tokenPrefix;
}

/**
 * Сохраняет текущую библиотеку в localStorage.
 * Вызывать после каждого успешного reloadWorkspaceLibraryFromServer.
 */
export function saveLibraryCache(state: SetBuilderState, authToken: string): void {
  if (!authToken) return;
  const items: CachedLibraryItem[] = [];
  for (const item of state.library) {
    if (item.sourceFileId === undefined) continue;
    const lf = loadedFiles.find((f) => f.id === item.sourceFileId);
    if (!lf?.remoteId) continue; // кэшируем только авторизованные файлы
    if (lf.loading || lf.doc == null) continue; // пропускаем незагруженные
    items.push({
      remoteId: lf.remoteId,
      name: item.name,
      catalog: item.catalog,
      w: item.w,
      h: item.h,
      areaMm2: item.areaMm2,
      pierces: item.pierces,
      cutLen: item.cutLen,
      layersCount: item.layersCount,
      status: item.status,
      issues: [...item.issues],
      thumbVariant: item.thumbVariant,
    });
  }
  const payload: LibraryCachePayload = { savedAt: Date.now(), items };
  try {
    localStorage.setItem(cacheKey(authToken.slice(0, 16)), JSON.stringify(payload));
  } catch {
    // quota exceeded — ignore
  }
}

/**
 * Загружает кэш в state.library с временными числовыми id.
 * Возвращает количество загруженных элементов (0 если кэша нет).
 *
 * id в кэшированных элементах — отрицательные числа, чтобы не конфликтовать
 * с реальными libraryId которые всегда > 0.
 */
export function loadLibraryCache(state: SetBuilderState, authToken: string): number {
  if (!authToken) return 0;
  try {
    const raw = localStorage.getItem(cacheKey(authToken.slice(0, 16)));
    if (!raw) return 0;
    const payload = JSON.parse(raw) as LibraryCachePayload;
    if (!Array.isArray(payload.items) || payload.items.length === 0) return 0;

    const cacheItems: LibraryItem[] = payload.items.map((ci, idx) => ({
      id: -(idx + 1), // временные отрицательные id
      sourceFileId: undefined,
      remoteId: ci.remoteId,
      name: ci.name,
      catalog: ci.catalog,
      w: ci.w,
      h: ci.h,
      areaMm2: ci.areaMm2,
      pierces: ci.pierces,
      cutLen: ci.cutLen,
      layersCount: ci.layersCount,
      status: ci.status,
      issues: ci.issues,
      thumbVariant: ci.thumbVariant,
    }));

    state.library = cacheItems;
    state.isCacheLoaded = true;
    return cacheItems.length;
  } catch {
    return 0;
  }
}

/**
 * Удаляет кэш для данного токена (при logout).
 */
export function clearLibraryCache(authToken: string): void {
  if (!authToken) return;
  localStorage.removeItem(cacheKey(authToken.slice(0, 16)));
}
