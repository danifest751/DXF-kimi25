import { SHEET_PRESETS } from './mock-data.js';
import { getSetRows, getTotals } from './state.js';
import type { SetBuilderState, SheetResult, NestingResults } from './types.js';

function hashString(input: string): string {
  let h1 = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h1 ^= input.charCodeAt(i);
    h1 = (h1 * 0x01000193) >>> 0;
  }
  return `${h1.toString(16).padStart(8, '0')}`;
}

export function runMockNesting(state: SetBuilderState): NestingResults {
  const preset = SHEET_PRESETS.find((p) => p.id === state.sheetPresetId) ?? SHEET_PRESETS[0]!;
  const rows = getSetRows(state).filter((r) => r.set.enabled && r.set.qty > 0);
  const totals = getTotals(state);
  const totalArea = rows.reduce((acc, r) => acc + r.item.w * r.item.h * r.set.qty, 0);
  const sheetArea = Math.max(1, preset.w * preset.h);
  const estimatedSheets = Math.ceil(totalArea / sheetArea) || 1;
  const sheetCount = Math.min(4, Math.max(2, estimatedSheets));

  const base = `${preset.id}|${state.mode}|${state.gapMm}|${totals.qtySum}|${totals.piercesSum}|${Math.round(totals.cutLenSum)}`;

  const sheets: SheetResult[] = [];
  for (let i = 0; i < sheetCount; i++) {
    const partCount = Math.max(1, Math.round(totals.qtySum / sheetCount + (i % 2 === 0 ? 1 : 0)));
    const utilRaw = totalArea / (sheetArea * sheetCount);
    const utilization = Math.min(99, Math.max(14, Math.round((utilRaw * 100 + i * 6) % 100)));
    const hash = hashString(`${base}|${i}`);
    const blocks = Array.from({ length: Math.min(8, partCount) }, (_, bi) => ({
      x: 10 + (bi % 4) * 22,
      y: 10 + Math.floor(bi / 4) * 22,
      w: 14 + ((i + bi * 3) % 10),
      h: 10 + ((i * 2 + bi) % 8),
    }));

    sheets.push({
      id: `sheet-${i + 1}`,
      utilization,
      partCount,
      hash,
      blocks,
    });
  }

  return { sheets };
}
