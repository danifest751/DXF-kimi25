import { describe, expect, it } from 'vitest';

import { runMockNesting } from '../../packages/ui-app/src/set-builder/mock-nesting.js';
import { createInitialState, setQty } from '../../packages/ui-app/src/set-builder/state.js';

describe('set-builder mock nesting', () => {
  it('returns deterministic sheets for same input', () => {
    const state = createInitialState();
    setQty(state, state.library[0]!.id, 3);
    setQty(state, state.library[1]!.id, 2);
    state.mode = 'commonLine';
    state.sheetPresetId = 'sheet_1250x2500';
    state.gapMm = 7;

    const a = runMockNesting(state);
    const b = runMockNesting(state);

    expect(a).toEqual(b);
    expect(a.sheets.length).toBeGreaterThanOrEqual(2);
    expect(a.sheets.length).toBeLessThanOrEqual(4);
  });

  it('provides sheet cards with bounded utilization and hashes', () => {
    const state = createInitialState();
    setQty(state, state.library[2]!.id, 4);

    const r = runMockNesting(state);
    expect(r.sheets.length).toBeGreaterThan(0);

    for (const sheet of r.sheets) {
      expect(sheet.utilization).toBeGreaterThanOrEqual(14);
      expect(sheet.utilization).toBeLessThanOrEqual(99);
      expect(sheet.partCount).toBeGreaterThan(0);
      expect(sheet.hash).toMatch(/^[0-9a-f]{8}$/);
      expect(sheet.sheetWidth).toBeGreaterThan(0);
      expect(sheet.sheetHeight).toBeGreaterThan(0);
      expect(sheet.placements.length).toBeGreaterThan(0);
    }
  });
});
