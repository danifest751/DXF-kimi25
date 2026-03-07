import { apiGetJSON, apiPostJSON } from '../api.js';
import { authSessionToken, loadedFiles } from '../state.js';
import { getAuthHeaders } from '../auth.js';
import type { SetBuilderState } from './types.js';
import { SHEET_PRESETS } from './mock-data.js';
import { STORAGE_KEY, MATERIALS_STORAGE_KEY } from './context.js';
import type { SheetPreset } from './context.js';

/**
 * Возвращает стабильный ключ для элемента сета:
 * - remoteId (UUID Supabase) для авторизованных файлов
 * - "name:<имя файла>" для гостевых файлов
 * Этот ключ не зависит от эфемерного числового libraryId.
 */
function getStableKey(sourceFileId: number): string | null {
  const lf = loadedFiles.find((f) => f.id === sourceFileId);
  if (!lf) return null;
  if (lf.remoteId) return lf.remoteId;
  return `name:${lf.name}`;
}

/**
 * Строит Map stableKey → libraryId за один проход O(n).
 */
function buildStableKeyMap(state: SetBuilderState): Map<string, number> {
  const map = new Map<string, number>();
  const lfById = new Map(loadedFiles.map((f) => [f.id, f]));
  for (const item of state.library) {
    if (item.sourceFileId === undefined) continue;
    const lf = lfById.get(item.sourceFileId);
    if (!lf) continue;
    const key = lf.remoteId ?? `name:${lf.name}`;
    map.set(key, item.id);
  }
  return map;
}

/**
 * По стабильному ключу находит libraryId в текущей библиотеке.
 * Принимает кэш-Map построенный через buildStableKeyMap для O(1) lookups.
 */
function resolveLibraryId(map: Map<string, number>, stableKey: string): number | null {
  return map.get(stableKey) ?? null;
}

export function hydrateState(
  state: SetBuilderState,
  _sheetPresets: SheetPreset[],
  setSheetPresets: (p: SheetPreset[]) => void,
  setCustomW: (v: number) => void,
  setCustomH: (v: number) => void,
): void {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return;
  try {
    const parsed = JSON.parse(raw) as {
      search?: string;
      catalogFilter?: string;
      sheetPresetId?: string;
      gapMm?: number;
      mode?: 'normal' | 'commonLine';
      nestStrategy?: 'maxrects_bbox' | 'true_shape';
      rotationEnabled?: boolean;
      rotationStepDeg?: 1 | 2 | 5;
      multiStart?: boolean;
      seed?: number;
      commonLineMaxMergeDistanceMm?: number;
      commonLineMinSharedLenMm?: number;
      sortBy?: 'name' | 'area' | 'pierces' | 'cutLen';
      sortDir?: 'asc' | 'desc';
      activeTab?: 'library' | 'results';
      customSheetPresets?: Array<{ id: string; label: string; w: number; h: number }>;
      customSheetWidthMm?: number;
      customSheetHeightMm?: number;
      set?: Array<{ stableKey?: string; libraryId?: number; qty: number; enabled: boolean }>;
    };
    state.search = typeof parsed.search === 'string' ? parsed.search : '';
    state.catalogFilter = typeof parsed.catalogFilter === 'string' ? parsed.catalogFilter : 'All';
    state.sheetPresetId = typeof parsed.sheetPresetId === 'string' ? parsed.sheetPresetId : state.sheetPresetId;
    state.gapMm = Number.isFinite(parsed.gapMm) ? Math.max(0, parsed.gapMm ?? 0) : 5;
    state.mode = parsed.mode === 'commonLine' ? 'commonLine' : 'normal';
    state.nestStrategy = 'maxrects_bbox';
    state.rotationEnabled = parsed.rotationEnabled !== false;
    state.rotationStepDeg = parsed.rotationStepDeg === 1 || parsed.rotationStepDeg === 5 ? parsed.rotationStepDeg : 2;
    state.multiStart = parsed.multiStart !== false;
    state.seed = Number.isFinite(parsed.seed) ? Math.trunc(parsed.seed ?? 0) : 0;
    state.commonLineMaxMergeDistanceMm = Number.isFinite(parsed.commonLineMaxMergeDistanceMm)
      ? Math.max(0, parsed.commonLineMaxMergeDistanceMm ?? 0)
      : 0.2;
    state.commonLineMinSharedLenMm = Number.isFinite(parsed.commonLineMinSharedLenMm)
      ? Math.max(0, parsed.commonLineMinSharedLenMm ?? 0)
      : 20;
    state.sortBy = parsed.sortBy === 'area' || parsed.sortBy === 'pierces' || parsed.sortBy === 'cutLen' ? parsed.sortBy : 'name';
    state.sortDir = parsed.sortDir === 'desc' ? 'desc' : 'asc';
    state.activeTab = 'library';

    const customPresets = (parsed.customSheetPresets ?? []).filter((p) => {
      return typeof p.id === 'string'
        && p.id.startsWith('custom_')
        && typeof p.label === 'string'
        && Number.isFinite(p.w)
        && Number.isFinite(p.h)
        && p.w > 0
        && p.h > 0;
    });
    const nextPresets = [...SHEET_PRESETS, ...customPresets.map((p) => ({ id: p.id, label: p.label, w: p.w, h: p.h }))];
    setSheetPresets(nextPresets);

    if (Number.isFinite(parsed.customSheetWidthMm)) setCustomW(Math.max(1, Math.round(parsed.customSheetWidthMm ?? 1)));
    if (Number.isFinite(parsed.customSheetHeightMm)) setCustomH(Math.max(1, Math.round(parsed.customSheetHeightMm ?? 1)));

    if (!nextPresets.some((p) => p.id === state.sheetPresetId)) {
      state.sheetPresetId = nextPresets[0]?.id ?? SHEET_PRESETS[0]!.id;
    }
    state.set.clear();
    for (const row of parsed.set ?? []) {
      if (!Number.isFinite(row.qty) || row.qty <= 0) continue;
      const qty = Math.max(1, Math.round(row.qty));
      const enabled = row.enabled !== false;

      if (row.stableKey) {
        // Новый формат: stableKey → резолвим в libraryId после загрузки библиотеки
        // Сохраняем во временную структуру; применяем в applyPendingSet()
        _pendingSet.set(row.stableKey, { qty, enabled });
      } else if (Number.isFinite(row.libraryId) && row.libraryId !== undefined) {
        // Обратная совместимость: старый формат с libraryId
        state.set.set(row.libraryId!, {
          libraryId: row.libraryId!,
          qty,
          enabled,
        });
      }
    }
  } catch {
    // ignore malformed persisted state
  }
}

/** Временное хранилище pending-сета до появления библиотеки */
const _pendingSet = new Map<string, { qty: number; enabled: boolean }>();

/**
 * Вызывается после syncLoadedFilesIntoLibrary — резолвит stableKey → libraryId
 * и применяет к state.set. Безопасно вызывать многократно.
 */
export function applyPendingSet(state: SetBuilderState): void {
  if (_pendingSet.size === 0) return;
  const keyMap = buildStableKeyMap(state);
  for (const [stableKey, { qty, enabled }] of _pendingSet) {
    const libraryId = resolveLibraryId(keyMap, stableKey);
    if (libraryId === null) continue;
    _pendingSet.delete(stableKey);
    if (!state.set.has(libraryId)) {
      state.set.set(libraryId, { libraryId, qty, enabled });
    }
  }
}

export function persistState(
  state: SetBuilderState,
  sheetPresets: SheetPreset[],
  customSheetWidthMm: number,
  customSheetHeightMm: number,
): void {
  const customSheetPresets = sheetPresets
    .filter((p) => p.id.startsWith('custom_'))
    .map((p) => ({ id: p.id, label: p.label, w: p.w, h: p.h }));
  const payload = {
    search: state.search,
    catalogFilter: state.catalogFilter,
    sheetPresetId: state.sheetPresetId,
    gapMm: state.gapMm,
    mode: state.mode,
    nestStrategy: state.nestStrategy,
    rotationEnabled: state.rotationEnabled,
    rotationStepDeg: state.rotationStepDeg,
    multiStart: state.multiStart,
    seed: state.seed,
    commonLineMaxMergeDistanceMm: state.commonLineMaxMergeDistanceMm,
    commonLineMinSharedLenMm: state.commonLineMinSharedLenMm,
    sortBy: state.sortBy,
    sortDir: state.sortDir,
    customSheetPresets,
    customSheetWidthMm,
    customSheetHeightMm,
    // Сериализуем сет по stableKey (remoteId или name:filename) вместо libraryId
    set: [...state.set.values()].map((s) => {
      const stableKey = getStableKey(s.libraryId);
      return { stableKey: stableKey ?? undefined, libraryId: s.libraryId, qty: s.qty, enabled: s.enabled };
    }),
  };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
}

/**
 * Сохраняет материалы по stableKey (remoteId или name:filename), не по libraryId.
 */
export function saveMaterials(state: SetBuilderState): void {
  const obj: Record<string, string> = {};
  for (const [libId, a] of state.materialAssignments) {
    const item = state.library.find((it) => it.id === libId);
    if (!item || item.sourceFileId === undefined) continue;
    const stableKey = getStableKey(item.sourceFileId);
    if (!stableKey) continue;
    obj[stableKey] = a.materialId;
  }
  localStorage.setItem(MATERIALS_STORAGE_KEY, JSON.stringify(obj));
}

/** Временное хранилище pending-материалов до появления библиотеки */
const _pendingMaterials = new Map<string, string>();

/**
 * Загружает материалы из localStorage по stableKey.
 * Резолвинг в libraryId происходит в applyPendingMaterials() после загрузки библиотеки.
 */
export function loadMaterials(state: SetBuilderState): void {
  try {
    const raw = localStorage.getItem(MATERIALS_STORAGE_KEY);
    if (!raw) return;
    const obj = JSON.parse(raw) as Record<string, string>;
    _pendingMaterials.clear();
    state.materialAssignments.clear();
    for (const [key, materialId] of Object.entries(obj)) {
      if (typeof materialId !== 'string' || materialId.length === 0) continue;
      _pendingMaterials.set(key, materialId);
    }
    // Сразу пытаемся применить (на случай если библиотека уже есть)
    applyPendingMaterials(state);
  } catch {
    // ignore
  }
}

/**
 * Вызывается после syncLoadedFilesIntoLibrary — резолвит stableKey → libraryId
 * для материалов из localStorage.
 */
export function applyPendingMaterials(state: SetBuilderState): void {
  if (_pendingMaterials.size === 0) return;
  const keyMap = buildStableKeyMap(state);
  for (const [stableKey, materialId] of _pendingMaterials) {
    const libraryId = resolveLibraryId(keyMap, stableKey);
    if (libraryId === null) continue;
    _pendingMaterials.delete(stableKey);
    if (!state.materialAssignments.has(libraryId)) {
      state.materialAssignments.set(libraryId, { materialId, appliedAt: 0 });
    }
  }
}

export async function loadMaterialsFromServer(state: SetBuilderState): Promise<void> {
  if (!authSessionToken) return;
  try {
    const resp = await apiGetJSON<{ success: boolean; data: Array<{ fileId: string; materialId: string }> }>(
      '/api/file-materials',
      getAuthHeaders(),
    );
    if (!resp.success || !Array.isArray(resp.data)) return;
    for (const entry of resp.data) {
      const lf = loadedFiles.find((f) => f.remoteId === entry.fileId);
      if (!lf) continue;
      const lib = state.library.find((it) => it.sourceFileId === lf.id);
      if (!lib) continue;
      state.materialAssignments.set(lib.id, { materialId: entry.materialId, appliedAt: 0 });
    }
  } catch {
    // silently fall back to localStorage data
  }
}

export async function syncMaterialsToServer(
  state: SetBuilderState,
  libraryIds: number[],
  materialId: string,
): Promise<void> {
  if (!authSessionToken) return;
  for (const libId of libraryIds) {
    const item = state.library.find((it) => it.id === libId);
    if (!item || item.sourceFileId === undefined) continue;
    const lf = loadedFiles.find((f) => f.id === item.sourceFileId);
    if (!lf?.remoteId) continue;
    try {
      await apiPostJSON<{ success: boolean }>('/api/file-materials-upsert', { fileId: lf.remoteId, materialId }, getAuthHeaders());
    } catch (err) {
      console.error('[material-sync] upsert failed:', err);
    }
  }
}

/**
 * Мигрирует гостевые материалы из localStorage на сервер после логина.
 * Вызывается после migrateGuestDraftToWorkspace() + _reloadFromServer().
 */
export async function migrateGuestMaterialsToServer(): Promise<void> {
  if (!authSessionToken) return;
  // Прочитаем localStorage напрямую, т.к. state.materialAssignments уже перезаписан с сервера
  const raw = localStorage.getItem(MATERIALS_STORAGE_KEY);
  if (!raw) return;
  try {
    const obj = JSON.parse(raw) as Record<string, string>;
    for (const [stableKey, materialId] of Object.entries(obj)) {
      if (!stableKey.startsWith('name:')) continue; // только гостевые (name:filename)
      const fileName = stableKey.slice(5);
      // Ищем загруженный файл по имени, у которого теперь есть remoteId
      const lf = loadedFiles.find((f) => f.name === fileName && f.remoteId);
      if (!lf) continue;
      try {
        await apiPostJSON<{ success: boolean }>('/api/file-materials-upsert', { fileId: lf.remoteId, materialId }, getAuthHeaders());
      } catch (err) {
        console.warn('[material-migrate] upsert failed:', err);
      }
    }
  } catch {
    // ignore
  }
}
