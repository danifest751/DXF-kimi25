import { describe, it, expect } from 'vitest';
import { snapshotsEqual, type RenderSnapshot } from '../../packages/ui-app/src/set-builder/render.js';

function makeSnapshot(overrides: Partial<RenderSnapshot> = {}): RenderSnapshot {
  return {
    libCount: 3,
    libIds: '1:10,2:20,3:30',
    activeTab: 'library',
    search: '',
    sortBy: 'name',
    sortDir: 'asc',
    previewLibraryId: null,
    previewSheetId: null,
    optimizerOpenForId: null,
    materialModalOpenForId: null,
    loading: false,
    resultsId: '',
    openMenuLibraryId: null,
    authToken: 'abc12345',
    locale: 'ru',
    batchPhase: '',
    ...overrides,
  };
}

describe('snapshotsEqual', () => {
  it('returns true for two identical snapshots', () => {
    const a = makeSnapshot();
    const b = makeSnapshot();
    expect(snapshotsEqual(a, b)).toBe(true);
  });

  it('returns false when libCount differs', () => {
    expect(snapshotsEqual(makeSnapshot({ libCount: 3 }), makeSnapshot({ libCount: 4 }))).toBe(false);
  });

  it('returns false when libIds differs', () => {
    expect(snapshotsEqual(makeSnapshot({ libIds: '1:10' }), makeSnapshot({ libIds: '1:11' }))).toBe(false);
  });

  it('returns false when activeTab differs', () => {
    expect(snapshotsEqual(makeSnapshot({ activeTab: 'library' }), makeSnapshot({ activeTab: 'results' }))).toBe(false);
  });

  it('returns false when search differs', () => {
    expect(snapshotsEqual(makeSnapshot({ search: '' }), makeSnapshot({ search: 'bolt' }))).toBe(false);
  });

  it('returns false when sortBy differs', () => {
    expect(snapshotsEqual(makeSnapshot({ sortBy: 'name' }), makeSnapshot({ sortBy: 'date' }))).toBe(false);
  });

  it('returns false when sortDir differs', () => {
    expect(snapshotsEqual(makeSnapshot({ sortDir: 'asc' }), makeSnapshot({ sortDir: 'desc' }))).toBe(false);
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

  it('returns false when loading differs', () => {
    expect(snapshotsEqual(makeSnapshot({ loading: false }), makeSnapshot({ loading: true }))).toBe(false);
  });

  it('returns false when resultsId differs', () => {
    expect(snapshotsEqual(makeSnapshot({ resultsId: '' }), makeSnapshot({ resultsId: '5:2' }))).toBe(false);
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

  it('returns false when batchPhase differs', () => {
    expect(snapshotsEqual(makeSnapshot({ batchPhase: '' }), makeSnapshot({ batchPhase: 'running' }))).toBe(false);
  });

  it('covers every key in RenderSnapshot (exhaustiveness guard)', () => {
    const base = makeSnapshot();
    const keys = Object.keys(base) as (keyof RenderSnapshot)[];

    // Every key must be tested: mutating it must produce false
    const notDetected: string[] = [];
    for (const key of keys) {
      const mutated = makeSnapshot();
      // Flip the value to something different
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
