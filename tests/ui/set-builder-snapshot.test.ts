import { describe, it, expect } from 'vitest';
import { snapshotsEqual, type RenderSnapshot } from '../../packages/ui-app/src/set-builder/render.js';

function makeSnapshot(overrides: Partial<RenderSnapshot> = {}): RenderSnapshot {
  return {
    libCount: 3,
    libIds: '1:10:Cat,2:20:Cat,3:30:Cat',
    setSize: 0,
    setIds: '',
    activeTab: 'library',
    search: '',
    sortBy: 'name',
    sortDir: 'asc',
    selectedCount: 0,
    catalogFilter: '',
    mode: 'normal',
    sheetPresetId: 'a4',
    gapMm: 2,
    nestStrategy: 'maxrects_bbox',
    rotationEnabled: true,
    rotationStepDeg: 5,
    multiStart: false,
    seed: 0,
    commonLineMaxMergeDistanceMm: 0.5,
    commonLineMinSharedLenMm: 1,
    nestingPhase: 'idle',
    previewShowPierces: false,
    previewLibraryId: null,
    previewSheetId: null,
    optimizerOpenForId: null,
    materialModalOpenForId: null,
    materialAssignmentsKey: '',
    lastUsedMaterialId: null,
    loading: false,
    resultsId: '',
    resultsSheets: 0,
    openMenuLibraryId: null,
    authToken: 'abc12345',
    locale: 'ru',
    catalogsKey: '',
    loadedFilesKey: '',
    optiPhase: '',
    batchPhase: '',
    ...overrides,
  };
}

describe('snapshotsEqual', () => {
  it('returns true for two identical snapshots', () => {
    expect(snapshotsEqual(makeSnapshot(), makeSnapshot())).toBe(true);
  });

  it('returns false when libCount differs', () => {
    expect(snapshotsEqual(makeSnapshot({ libCount: 3 }), makeSnapshot({ libCount: 4 }))).toBe(false);
  });

  it('returns false when libIds differs', () => {
    expect(snapshotsEqual(makeSnapshot({ libIds: '1:10:A' }), makeSnapshot({ libIds: '1:10:B' }))).toBe(false);
  });

  it('returns false when setSize differs', () => {
    expect(snapshotsEqual(makeSnapshot({ setSize: 0 }), makeSnapshot({ setSize: 1 }))).toBe(false);
  });

  it('returns false when setIds differs', () => {
    expect(snapshotsEqual(makeSnapshot({ setIds: '' }), makeSnapshot({ setIds: '1:2' }))).toBe(false);
  });

  it('returns false when activeTab differs', () => {
    expect(snapshotsEqual(makeSnapshot({ activeTab: 'library' }), makeSnapshot({ activeTab: 'results' }))).toBe(false);
  });

  it('returns false when search differs', () => {
    expect(snapshotsEqual(makeSnapshot({ search: '' }), makeSnapshot({ search: 'bolt' }))).toBe(false);
  });

  it('returns false when sortBy differs', () => {
    expect(snapshotsEqual(makeSnapshot({ sortBy: 'name' }), makeSnapshot({ sortBy: 'area' }))).toBe(false);
  });

  it('returns false when sortDir differs', () => {
    expect(snapshotsEqual(makeSnapshot({ sortDir: 'asc' }), makeSnapshot({ sortDir: 'desc' }))).toBe(false);
  });

  it('returns false when selectedCount differs', () => {
    expect(snapshotsEqual(makeSnapshot({ selectedCount: 0 }), makeSnapshot({ selectedCount: 2 }))).toBe(false);
  });

  it('returns false when catalogFilter differs', () => {
    expect(snapshotsEqual(makeSnapshot({ catalogFilter: '' }), makeSnapshot({ catalogFilter: 'Cat1' }))).toBe(false);
  });

  it('returns false when mode differs', () => {
    expect(snapshotsEqual(makeSnapshot({ mode: 'normal' }), makeSnapshot({ mode: 'commonLine' }))).toBe(false);
  });

  it('returns false when sheetPresetId differs', () => {
    expect(snapshotsEqual(makeSnapshot({ sheetPresetId: 'a4' }), makeSnapshot({ sheetPresetId: 'a3' }))).toBe(false);
  });

  it('returns false when gapMm differs', () => {
    expect(snapshotsEqual(makeSnapshot({ gapMm: 2 }), makeSnapshot({ gapMm: 5 }))).toBe(false);
  });

  it('returns false when nestStrategy differs', () => {
    expect(snapshotsEqual(makeSnapshot({ nestStrategy: 'maxrects_bbox' }), makeSnapshot({ nestStrategy: 'other' }))).toBe(false);
  });

  it('returns false when rotationEnabled differs', () => {
    expect(snapshotsEqual(makeSnapshot({ rotationEnabled: true }), makeSnapshot({ rotationEnabled: false }))).toBe(false);
  });

  it('returns false when rotationStepDeg differs', () => {
    expect(snapshotsEqual(makeSnapshot({ rotationStepDeg: 5 }), makeSnapshot({ rotationStepDeg: 1 }))).toBe(false);
  });

  it('returns false when multiStart differs', () => {
    expect(snapshotsEqual(makeSnapshot({ multiStart: false }), makeSnapshot({ multiStart: true }))).toBe(false);
  });

  it('returns false when seed differs', () => {
    expect(snapshotsEqual(makeSnapshot({ seed: 0 }), makeSnapshot({ seed: 42 }))).toBe(false);
  });

  it('returns false when commonLineMaxMergeDistanceMm differs', () => {
    expect(snapshotsEqual(makeSnapshot({ commonLineMaxMergeDistanceMm: 0.5 }), makeSnapshot({ commonLineMaxMergeDistanceMm: 1.0 }))).toBe(false);
  });

  it('returns false when commonLineMinSharedLenMm differs', () => {
    expect(snapshotsEqual(makeSnapshot({ commonLineMinSharedLenMm: 1 }), makeSnapshot({ commonLineMinSharedLenMm: 2 }))).toBe(false);
  });

  it('returns false when nestingPhase differs', () => {
    expect(snapshotsEqual(makeSnapshot({ nestingPhase: 'idle' }), makeSnapshot({ nestingPhase: 'running' }))).toBe(false);
  });

  it('returns false when previewShowPierces differs', () => {
    expect(snapshotsEqual(makeSnapshot({ previewShowPierces: false }), makeSnapshot({ previewShowPierces: true }))).toBe(false);
  });

  it('returns false when previewLibraryId differs', () => {
    expect(snapshotsEqual(makeSnapshot({ previewLibraryId: null }), makeSnapshot({ previewLibraryId: 5 }))).toBe(false);
  });

  it('returns false when previewSheetId differs', () => {
    expect(snapshotsEqual(makeSnapshot({ previewSheetId: null }), makeSnapshot({ previewSheetId: 'sheet-1' }))).toBe(false);
  });

  it('returns false when optimizerOpenForId differs', () => {
    expect(snapshotsEqual(makeSnapshot({ optimizerOpenForId: null }), makeSnapshot({ optimizerOpenForId: 7 }))).toBe(false);
  });

  it('returns false when materialModalOpenForId differs', () => {
    expect(snapshotsEqual(makeSnapshot({ materialModalOpenForId: null }), makeSnapshot({ materialModalOpenForId: 2 }))).toBe(false);
  });

  it('returns false when materialAssignmentsKey differs', () => {
    expect(snapshotsEqual(makeSnapshot({ materialAssignmentsKey: '' }), makeSnapshot({ materialAssignmentsKey: '1:steel|S355|5' }))).toBe(false);
  });

  it('returns false when lastUsedMaterialId differs', () => {
    expect(snapshotsEqual(makeSnapshot({ lastUsedMaterialId: null }), makeSnapshot({ lastUsedMaterialId: 'steel|S355|5' }))).toBe(false);
  });

  it('returns false when loading differs', () => {
    expect(snapshotsEqual(makeSnapshot({ loading: false }), makeSnapshot({ loading: true }))).toBe(false);
  });

  it('returns false when resultsId differs', () => {
    expect(snapshotsEqual(makeSnapshot({ resultsId: '' }), makeSnapshot({ resultsId: '5:2' }))).toBe(false);
  });

  it('returns false when resultsSheets differs', () => {
    expect(snapshotsEqual(makeSnapshot({ resultsSheets: 0 }), makeSnapshot({ resultsSheets: 3 }))).toBe(false);
  });

  it('returns false when openMenuLibraryId differs', () => {
    expect(snapshotsEqual(makeSnapshot({ openMenuLibraryId: null }), makeSnapshot({ openMenuLibraryId: 3 }))).toBe(false);
  });

  it('returns false when authToken differs', () => {
    expect(snapshotsEqual(makeSnapshot({ authToken: 'abc12345' }), makeSnapshot({ authToken: 'xyz99999' }))).toBe(false);
  });

  it('returns false when locale differs', () => {
    expect(snapshotsEqual(makeSnapshot({ locale: 'ru' }), makeSnapshot({ locale: 'en' }))).toBe(false);
  });

  it('returns false when catalogsKey differs', () => {
    expect(snapshotsEqual(makeSnapshot({ catalogsKey: '' }), makeSnapshot({ catalogsKey: 'cat-1,cat-2' }))).toBe(false);
  });

  it('returns false when loadedFilesKey differs', () => {
    expect(snapshotsEqual(makeSnapshot({ loadedFilesKey: '' }), makeSnapshot({ loadedFilesKey: '1:r,2:l' }))).toBe(false);
  });

  it('returns false when optiPhase differs', () => {
    expect(snapshotsEqual(makeSnapshot({ optiPhase: '' }), makeSnapshot({ optiPhase: 'idle:0:overview:0' }))).toBe(false);
  });

  it('returns false when batchPhase differs', () => {
    expect(snapshotsEqual(makeSnapshot({ batchPhase: '' }), makeSnapshot({ batchPhase: 'running' }))).toBe(false);
  });

  // ── Exhaustiveness guard ────────────────────────────────────────────────────
  // This test MUST FAIL if a new field is added to RenderSnapshot but not to
  // makeSnapshot() above. It acts as a compile-time + runtime safety net.
  it('covers every key in RenderSnapshot (exhaustiveness guard)', () => {
    const base = makeSnapshot();
    const keys = Object.keys(base) as (keyof RenderSnapshot)[];

    const notDetected: string[] = [];
    for (const key of keys) {
      const mutated = makeSnapshot();
      const original = mutated[key];
      if (typeof original === 'boolean') {
        (mutated as Record<string, unknown>)[key] = !original;
      } else if (typeof original === 'number') {
        (mutated as Record<string, unknown>)[key] = original + 1;
      } else if (original === null) {
        (mutated as Record<string, unknown>)[key] = 42;
      } else {
        (mutated as Record<string, unknown>)[key] = String(original) + '_changed';
      }
      if (snapshotsEqual(base, mutated)) {
        notDetected.push(key);
      }
    }
    expect(notDetected).toEqual([]);
  });
});
