import { createInitialLibrary } from './mock-data.js';
import { SHEET_PRESETS } from './mock-data.js';
import type { LibraryItem, MaterialAssignment, SetBuilderState, SetItem } from './types.js';
import { calcWeightKg, findMaterial } from './materials.js';

export function createInitialState(): SetBuilderState {
  return {
    library: createInitialLibrary(),
    set: new Map(),
    selectedLibraryIds: new Set(),
    search: '',
    catalogFilter: 'All',
    sheetPresetId: SHEET_PRESETS[0]!.id,
    gapMm: 5,
    mode: 'normal',
    nestStrategy: 'maxrects_bbox',
    rotationEnabled: true,
    rotationStepDeg: 2,
    multiStart: true,
    seed: 0,
    commonLineMaxMergeDistanceMm: 0.2,
    commonLineMinSharedLenMm: 20,
    sortBy: 'name',
    sortDir: 'asc',
    activeTab: 'library',
    open: true,
    loading: false,
    nestingPhase: 'idle',
    previewLibraryId: null,
    previewSheetId: null,
    previewShowPierces: false,
    openMenuLibraryId: null,
    results: null,
    materialAssignments: new Map(),
    lastUsedMaterialId: null,
    materialModalOpenForId: null,
    optimizerOpenForId: null,
    isCacheLoaded: false,
    collapsedCatalogs: new Set(),
  };
}

export function getLibraryItem(state: SetBuilderState, id: number): LibraryItem | null {
  return state.library.find((item) => item.id === id) ?? null;
}

export function getSetItem(state: SetBuilderState, libraryId: number): SetItem | null {
  return state.set.get(libraryId) ?? null;
}

export function upsertSetItem(state: SetBuilderState, libraryId: number, qtyDelta = 1): void {
  const prev = state.set.get(libraryId);
  if (!prev) {
    state.set.set(libraryId, { libraryId, qty: Math.max(1, qtyDelta), enabled: true });
    return;
  }
  prev.qty = Math.max(1, prev.qty + qtyDelta);
}

export function setQty(state: SetBuilderState, libraryId: number, qty: number): void {
  if (qty <= 0) {
    state.set.delete(libraryId);
    return;
  }
  const prev = state.set.get(libraryId);
  if (!prev) {
    state.set.set(libraryId, { libraryId, qty, enabled: true });
    return;
  }
  prev.qty = qty;
}

export function removeFromSet(state: SetBuilderState, libraryId: number): void {
  state.set.delete(libraryId);
}

export function getFilteredLibrary(state: SetBuilderState): LibraryItem[] {
  const q = state.search.trim().toLowerCase();
  const filtered = state.library.filter((item) => {
    const inCatalog = state.catalogFilter === 'All' || item.catalog === state.catalogFilter;
    const inSearch = q.length === 0 || item.name.toLowerCase().includes(q);
    return inCatalog && inSearch;
  });

  const sorted = [...filtered].sort((a, b) => {
    if (state.sortBy === 'name') {
      return a.name.localeCompare(b.name);
    }
    if (state.sortBy === 'pierces') {
      return a.pierces - b.pierces;
    }
    if (state.sortBy === 'cutLen') {
      return a.cutLen - b.cutLen;
    }
    const areaA = a.w * a.h;
    const areaB = b.w * b.h;
    return areaA - areaB;
  });

  return state.sortDir === 'asc' ? sorted : sorted.reverse();
}

export function getSetRows(state: SetBuilderState): Array<{ item: LibraryItem; set: SetItem }> {
  const rows: Array<{ item: LibraryItem; set: SetItem }> = [];
  for (const setEntry of state.set.values()) {
    const item = getLibraryItem(state, setEntry.libraryId);
    if (item) rows.push({ item, set: setEntry });
  }
  return rows;
}

export function getMaterialAssignment(state: SetBuilderState, libraryId: number): MaterialAssignment | null {
  return state.materialAssignments.get(libraryId) ?? null;
}

export function getTotals(state: SetBuilderState): {
  enabledParts: number;
  qtySum: number;
  piercesSum: number;
  cutLenSum: number;
  totalWeightKg: number | null;
} {
  let enabledParts = 0;
  let qtySum = 0;
  let piercesSum = 0;
  let cutLenSum = 0;
  let totalWeightKg = 0;
  let hasAnyMaterial = false;

  for (const row of getSetRows(state)) {
    if (!row.set.enabled) continue;
    enabledParts++;
    qtySum += row.set.qty;
    piercesSum += row.item.pierces * row.set.qty;
    cutLenSum += row.item.cutLen * row.set.qty;

    const assignment = getMaterialAssignment(state, row.item.id);
    if (assignment && row.item.areaMm2 > 0) {
      const mat = findMaterial(assignment.materialId);
      if (mat) {
        hasAnyMaterial = true;
        totalWeightKg += calcWeightKg(row.item.areaMm2, mat.thicknessMm, mat.densityKgM3) * row.set.qty;
      }
    }
  }

  return { enabledParts, qtySum, piercesSum, cutLenSum, totalWeightKg: hasAnyMaterial ? totalWeightKg : null };
}

export function getAggregatedIssues(state: SetBuilderState): Array<{ issue: string; count: number }> {
  const issueCounter = new Map<string, number>();
  for (const row of getSetRows(state)) {
    if (!row.set.enabled) continue;
    for (const issue of row.item.issues) {
      issueCounter.set(issue, (issueCounter.get(issue) ?? 0) + 1);
    }
  }
  return [...issueCounter.entries()].map(([issue, count]) => ({ issue, count }));
}

export function canRunNesting(state: SetBuilderState): boolean {
  return getTotals(state).qtySum > 0 && !state.loading;
}
