import { apiPostJSON, downloadBlob } from '../api.js';
import { loadedFiles } from '../state.js';
import { t } from '../i18n/index.js';
import { nestItems } from '../../../core-engine/src/nesting/index.js';
import type { NestingItem, NestingOptions, NestingResult } from '../../../core-engine/src/nesting/index.js';
import { exportNestingToDXF } from '../../../core-engine/src/export/index.js';
import type { ItemDocData } from '../../../core-engine/src/export/index.js';
import type { SetBuilderState, SheetResult } from './types.js';
import { canRunNesting, getSetRows } from './state.js';
import type { SheetPreset } from './context.js';
import { SHEET_PRESETS } from './mock-data.js';

function yieldFrame(): Promise<void> {
  return new Promise<void>((resolve) => setTimeout(resolve, 0));
}

async function serializeNestingAsync(
  nestingResult: NestingResult,
  itemDocs: Map<number, ItemDocData>,
): Promise<string> {
  await yieldFrame();
  const dxfStr = exportNestingToDXF({ nestingResult, itemDocs });
  return dxfStr;
}

export function getActiveSheetPreset(
  state: SetBuilderState,
  presets: ReadonlyArray<SheetPreset>,
): { w: number; h: number } {
  const p = presets.find((it) => it.id === state.sheetPresetId) ?? presets[0] ?? SHEET_PRESETS[0]!;
  return { w: p.w, h: p.h };
}

export function calcPierceEstimateForSheets(sheets: NestingResult['sheets']): number {
  let total = 0;
  for (const sheet of sheets) {
    for (const p of sheet.placed) {
      const lf = loadedFiles.find((f) => f.id === p.itemId);
      if (lf) total += lf.stats.totalPierces;
    }
  }
  return total;
}

export function buildSetNestingItems(state: SetBuilderState): { items: NestingItem[]; skipped: number } {
  const rows = getSetRows(state).filter((r) => r.set.enabled && r.set.qty > 0);
  let skipped = 0;
  const items: NestingItem[] = [];

  for (const row of rows) {
    if (row.item.sourceFileId === undefined) {
      skipped++;
      continue;
    }
    const lf = loadedFiles.find((f) => f.id === row.item.sourceFileId);
    if (!lf || lf.loading || lf.doc == null) {
      skipped++;
      continue;
    }

    const bb = lf.doc.totalBBox;
    const width = bb ? Math.max(0, Math.abs(bb.max.x - bb.min.x)) : 0;
    const height = bb ? Math.max(0, Math.abs(bb.max.y - bb.min.y)) : 0;
    if (width <= 0 || height <= 0) {
      skipped++;
      continue;
    }

    items.push({
      id: lf.id,
      name: lf.name,
      width,
      height,
      quantity: row.set.qty,
    });
  }

  return { items, skipped };
}

export function buildItemDocsForSet(state: SetBuilderState): Map<number, ItemDocData> {
  const docs = new Map<number, ItemDocData>();
  for (const row of getSetRows(state)) {
    if (!row.set.enabled || row.item.sourceFileId === undefined) continue;
    const lf = loadedFiles.find((f) => f.id === row.item.sourceFileId);
    if (!lf || lf.loading || lf.doc == null || docs.has(lf.id)) continue;
    const bbox = lf.doc.totalBBox ?? { min: { x: 0, y: 0, z: 0 }, max: { x: 0, y: 0, z: 0 } };
    docs.set(lf.id, { flatEntities: lf.doc.flatEntities, bbox });
  }
  return docs;
}

export function createNestingOptions(state: SetBuilderState): NestingOptions {
  const strategy: 'maxrects_bbox' = 'maxrects_bbox';
  const multiStart = state.multiStart;
  return {
    rotationEnabled: state.rotationEnabled,
    rotationAngleStepDeg: state.rotationStepDeg,
    strategy,
    multiStart,
    seed: state.seed,
    commonLine: {
      enabled: state.mode === 'commonLine',
      maxMergeDistanceMm: state.commonLineMaxMergeDistanceMm,
      minSharedLenMm: state.commonLineMinSharedLenMm,
    },
  };
}

export function mapEngineResultToSetBuilder(
  result: NestingResult,
  hashes: readonly string[],
): { sheets: SheetResult[] } {
  return {
    sheets: result.sheets.map((sheet, idx) => ({
      id: `sheet-${sheet.sheetIndex + 1}`,
      utilization: Math.max(0, Math.min(100, Math.round(sheet.fillPercent))),
      partCount: sheet.placed.length,
      hash: hashes[idx] ?? '',
      sheetWidth: Math.max(1, result.sheet.width),
      sheetHeight: Math.max(1, result.sheet.height),
      gap: result.gap,
      placements: sheet.placed.map((p) => ({
        itemId: p.itemId,
        name: p.name,
        x: p.x,
        y: p.y,
        w: p.width,
        h: p.height,
        angleDeg: p.angleDeg,
      })),
    })),
  };
}

export function buildSingleSheetResult(
  lastEngineResult: NestingResult,
  sheetIndex: number,
): NestingResult | null {
  const sheet = lastEngineResult.sheets[sheetIndex];
  if (!sheet) return null;
  return {
    sheet: lastEngineResult.sheet,
    gap: lastEngineResult.gap,
    sheets: [{ ...sheet, sheetIndex: 0 }],
    totalSheets: 1,
    totalPlaced: sheet.placed.length,
    totalRequired: sheet.placed.length,
    avgFillPercent: sheet.fillPercent,
    cutLengthEstimate: lastEngineResult.cutLengthEstimate,
    sharedCutLength: lastEngineResult.sharedCutLength,
    cutLengthAfterMerge: lastEngineResult.cutLengthAfterMerge,
    pierceEstimate: calcPierceEstimateForSheets([sheet]),
    pierceDelta: 0,
    strategy: lastEngineResult.strategy,
  };
}

export async function reshareSheet(
  sheetIdx: number,
  lastEngineResult: NestingResult,
  lastItemDocs: Map<number, ItemDocData>,
  manualPlacements?: readonly { x: number; y: number }[],
): Promise<string> {
  const singleResult = buildSingleSheetResult(lastEngineResult, sheetIdx);
  if (!singleResult) return '';

  // Apply manual placement overrides to the engine result before sharing
  const resultToShare = manualPlacements && manualPlacements.length > 0
    ? {
        ...singleResult,
        sheets: singleResult.sheets.map((s) => ({
          ...s,
          placed: s.placed.map((p, i) => {
            const ov = manualPlacements[i];
            return ov !== undefined ? { ...p, x: ov.x, y: ov.y } : p;
          }),
        })),
      }
    : singleResult;

  try {
    const shareResp = await apiPostJSON<{ success: boolean; hashes: string[] }>('/api/nesting-share', {
      nestingResult: resultToShare,
      itemDocs: Object.fromEntries(lastItemDocs),
    });
    return shareResp.hashes[0] ?? '';
  } catch (err) {
    console.warn('[set-builder] reshareSheet failed:', err);
    return '';
  }
}

export async function exportSheetByIndex(
  lastEngineResult: NestingResult,
  lastItemDocs: Map<number, ItemDocData>,
  sheetIndex: number,
): Promise<boolean> {
  const singleResult = buildSingleSheetResult(lastEngineResult, sheetIndex);
  if (!singleResult) return false;
  const dxfStr = await serializeNestingAsync(singleResult, lastItemDocs);
  const blob = new Blob([dxfStr], { type: 'application/dxf' });
  downloadBlob(blob, `set_builder_sheet_${sheetIndex + 1}.dxf`);
  return true;
}

export async function runNesting(
  state: SetBuilderState,
  sheetPresets: SheetPreset[],
  setLastEngineResult: (r: NestingResult) => void,
  setLastItemDocs: (m: Map<number, ItemDocData>) => void,
  showToast: (msg: string) => void,
  render: () => void,
): Promise<void> {
  // Защита от двойного запуска: если уже выполняется — игнорировать
  if (state.loading) return;
  if (!canRunNesting(state)) return;

  const sheet = getActiveSheetPreset(state, sheetPresets);
  const options = createNestingOptions(state);
  const gap = options.commonLine?.enabled ? 0 : Math.max(0, state.gapMm);

  // Фаза 1: подготовка данных
  state.loading = true;
  state.nestingPhase = 'preparing';
  render();

  const { items, skipped } = buildSetNestingItems(state);

  if (items.length === 0) {
    state.loading = false;
    state.nestingPhase = 'idle';
    render();
    showToast(t('setBuilder.toast.noEligible'));
    return;
  }

  let result: NestingResult | null = null;
  try {
    // Фаза 2: выполнение раскладки
    state.nestingPhase = 'nesting';
    render();

    try {
      const resp = await apiPostJSON<{ success: boolean; data: NestingResult }>('/api/nest', {
        items,
        sheet: { width: sheet.w, height: sheet.h },
        gap,
        rotationEnabled: options.rotationEnabled,
        rotationAngleStepDeg: options.rotationAngleStepDeg,
        strategy: options.strategy,
        multiStart: options.multiStart,
        seed: options.seed,
        commonLine: options.commonLine,
      });
      result = resp.data;
    } catch (apiErr) {
      console.warn('[set-builder] API nesting failed, falling back to local:', apiErr);
      result = nestItems(items, { width: sheet.w, height: sheet.h }, gap, options);
    }

    if (!result) {
      showToast(t('setBuilder.toast.nestingFailed'));
      return;
    }

    const requiredActual = items.reduce((acc, it) => acc + Math.max(0, Math.trunc(it.quantity)), 0);
    const placedActual = result.sheets.reduce((acc, s) => acc + s.placed.length, 0);
    result = { ...result, totalRequired: requiredActual, totalPlaced: placedActual };

    const correctedPierces = calcPierceEstimateForSheets(result.sheets);
    const engineResult = { ...result, pierceEstimate: correctedPierces };
    setLastEngineResult(engineResult);

    const itemDocs = buildItemDocsForSet(state);
    setLastItemDocs(itemDocs);

    // Фаза 3: сохранение хешей
    state.nestingPhase = 'saving';
    render();

    let hashes: string[] = [];
    try {
      const shareResp = await apiPostJSON<{ success: boolean; hashes: string[] }>('/api/nesting-share', {
        nestingResult: result,
        itemDocs: Object.fromEntries(itemDocs),
      });
      hashes = shareResp.hashes;
    } catch (shareErr) {
      console.warn('[set-builder] sharing hashes failed:', shareErr);
    }

    state.results = mapEngineResultToSetBuilder(result, hashes);
    state.activeTab = 'results';
    showToast(
      skipped > 0
        ? `${t('setBuilder.toast.nestingFinished')} (${skipped} ${t('setBuilder.toast.skipped')})`
        : t('setBuilder.toast.nestingFinished'),
    );
  } finally {
    state.loading = false;
    state.nestingPhase = 'idle';
    render();
  }
}
