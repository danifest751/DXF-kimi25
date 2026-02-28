import { describe, expect, it } from 'vitest';

import {
  canRunNesting,
  createInitialState,
  getAggregatedIssues,
  getFilteredLibrary,
  getTotals,
  removeFromSet,
  setQty,
  upsertSetItem,
} from '../../packages/ui-app/src/set-builder/state.js';

describe('set-builder state selectors', () => {
  it('filters by search and catalog, then applies sorting', () => {
    const state = createInitialState();
    state.catalogFilter = 'Kitchen';
    state.search = 'panel';
    state.sortBy = 'pierces';
    state.sortDir = 'desc';

    const result = getFilteredLibrary(state);
    expect(result.length).toBeGreaterThan(0);
    expect(result.every((r) => r.catalog === 'Kitchen')).toBe(true);
    expect(result.every((r) => r.name.toLowerCase().includes('panel'))).toBe(true);

    for (let i = 1; i < result.length; i++) {
      expect(result[i - 1]!.pierces).toBeGreaterThanOrEqual(result[i]!.pierces);
    }
  });

  it('sorts by area in both directions', () => {
    const state = createInitialState();
    state.catalogFilter = 'All';
    state.search = '';
    state.sortBy = 'area';
    state.sortDir = 'asc';

    const asc = getFilteredLibrary(state);
    for (let i = 1; i < asc.length; i++) {
      const prevArea = asc[i - 1]!.w * asc[i - 1]!.h;
      const nextArea = asc[i]!.w * asc[i]!.h;
      expect(prevArea).toBeLessThanOrEqual(nextArea);
    }

    state.sortDir = 'desc';
    const desc = getFilteredLibrary(state);
    for (let i = 1; i < desc.length; i++) {
      const prevArea = desc[i - 1]!.w * desc[i - 1]!.h;
      const nextArea = desc[i]!.w * desc[i]!.h;
      expect(prevArea).toBeGreaterThanOrEqual(nextArea);
    }
  });

  it('computes totals and run eligibility using enabled set rows only', () => {
    const state = createInitialState();
    const a = state.library[0]!;
    const b = state.library[1]!;

    setQty(state, a.id, 2);
    setQty(state, b.id, 3);

    const bSet = state.set.get(b.id)!;
    bSet.enabled = false;

    const totals = getTotals(state);
    expect(totals.enabledParts).toBe(1);
    expect(totals.qtySum).toBe(2);
    expect(totals.piercesSum).toBe(a.pierces * 2);
    expect(totals.cutLenSum).toBe(a.cutLen * 2);
    expect(canRunNesting(state)).toBe(true);

    state.set.get(a.id)!.enabled = false;
    expect(canRunNesting(state)).toBe(false);
  });

  it('aggregates issues only from enabled rows', () => {
    const state = createInitialState();
    const withIssue = state.library.find((l) => l.issues.length > 0)!;
    const withIssue2 = state.library.filter((l) => l.issues.length > 0)[1]!;

    setQty(state, withIssue.id, 1);
    setQty(state, withIssue2.id, 1);
    state.set.get(withIssue2.id)!.enabled = false;

    const issues = getAggregatedIssues(state);
    expect(issues.length).toBeGreaterThan(0);
    expect(issues.some((i) => i.issue === withIssue.issues[0])).toBe(true);
    expect(issues.some((i) => i.issue === withIssue2.issues[0])).toBe(false);
  });

  it('supports upsert, setQty and remove', () => {
    const state = createInitialState();
    const id = state.library[2]!.id;

    upsertSetItem(state, id, 1);
    expect(state.set.get(id)?.qty).toBe(1);

    upsertSetItem(state, id, 2);
    expect(state.set.get(id)?.qty).toBe(3);

    setQty(state, id, 5);
    expect(state.set.get(id)?.qty).toBe(5);

    removeFromSet(state, id);
    expect(state.set.has(id)).toBe(false);
  });
});
