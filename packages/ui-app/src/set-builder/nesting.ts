import { apiPostJSON, ApiError, downloadBlob } from '../api.js';
import { loadedFiles } from '../state.js';
import { t } from '../i18n/index.js';
import NestingWorker from '../nesting-worker.js?worker';
import type { NestingWorkerRequest, NestingWorkerResponse } from '../nesting-worker.js';
import type { NestingItem, NestingOptions, NestingResult, NestingSheet } from '../../../core-engine/src/nesting/index.js';

import { exportNestingToDXF } from '../../../core-engine/src/export/index.js';
import type { ItemDocData } from '../../../core-engine/src/export/index.js';
import type { SetBuilderState, SheetResult } from './types.js';
import { canRunNesting, getSetRows } from './state.js';
import type { SheetPreset } from './context.js';
import { SHEET_PRESETS } from './mock-data.js';

function nestItemsViaWorker(
  items: NestingItem[],
  sheet: { width: number; height: number },
  gap: number,
  options: NestingOptions,
): Promise<NestingResult> {
  return new Promise((resolve, reject) => {
    const worker = new NestingWorker();
    worker.onmessage = (e: MessageEvent<NestingWorkerResponse>) => {
      worker.terminate();
      if (e.data.type === 'done') resolve(e.data.result);
      else reject(new Error(e.data.message));
    };
    worker.onerror = (err) => { worker.terminate(); reject(err); };
    const req: NestingWorkerRequest = { items, sheet, gap, options };
    worker.postMessage(req);
  });
}

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

    // Get material assignment for this item
    const assignment = state.materialAssignments.get(row.item.id);
    items.push({
      id: lf.id,
      name: lf.name,
      width,
      height,
      quantity: row.set.qty,
      materialId: assignment?.materialId ?? undefined,
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
      materialId: sheet.materialId ?? null,
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

/**
 * Groups items by materialId, keeping items without materialId in a special 'ungrouped' key.
 */
function groupItemsByMaterial(items: NestingItem[]): Map<string | null, NestingItem[]> {
  const groups = new Map<string | null, NestingItem[]>();
  for (const item of items) {
    const key = item.materialId ?? null;
    let group = groups.get(key);
    if (!group) {
      group = [];
      groups.set(key, group);
    }
    group.push(item);
  }
  return groups;
}

/**
 * Calls the nesting API for a single material group and returns the result.
 */
async function nestGroup(
  items: NestingItem[],
  sheet: { w: number; h: number },
  gap: number,
  options: NestingOptions,
  showToast: (msg: string) => void,
): Promise<NestingResult | null> {
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
    return resp.data;
  } catch (apiErr) {
    if (apiErr instanceof ApiError && apiErr.status === 429) {
      const RETRY_DELAY_SEC = 60;
      for (let sec = RETRY_DELAY_SEC; sec > 0; sec--) {
        showToast(t('setBuilder.toast.rateLimitRetry').replace('{n}', String(sec)));
        await new Promise<void>((res) => setTimeout(res, 1000));
      }
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
        return resp.data;
      } catch (retryErr) {
        console.warn('[set-builder] Retry after 429 failed, falling back to local worker:', retryErr);
        return await nestItemsViaWorker(items, { width: sheet.w, height: sheet.h }, gap, options);
      }
    } else {
      console.warn('[set-builder] API nesting failed, falling back to local worker:', apiErr);
      return await nestItemsViaWorker(items, { width: sheet.w, height: sheet.h }, gap, options);
    }
  }
}

/**
 * Merges multiple NestingResult objects into one, re-indexing sheets.
 */
function mergeNestingResults(results: NestingResult[], totalRequired: number): NestingResult {
  const allSheets: NestingSheet[] = [];
  let totalPlaced = 0;
  let totalCutLength = 0;
  let totalSharedCut = 0;
  let totalCutAfterMerge = 0;
  let sheetIndexOffset = 0;

  for (const result of results) {
    // Re-index sheets with global sheetIndex
    for (const s of result.sheets) {
      allSheets.push({
        ...s,
        sheetIndex: s.sheetIndex + sheetIndexOffset,
      });
    }
    totalPlaced += result.totalPlaced;
    totalCutLength += result.cutLengthEstimate;
    totalSharedCut += result.sharedCutLength;
    totalCutAfterMerge += result.cutLengthAfterMerge;
    sheetIndexOffset += result.sheets.length;
  }

  const totalSheets = allSheets.length;
  const avgFillPercent = totalSheets > 0
    ? results.reduce((acc, r) => acc + r.avgFillPercent * r.sheets.length, 0) / totalSheets
    : 0;

  return {
    sheet: results[0]?.sheet ?? { width: 1250, height: 2500 },
    gap: results[0]?.gap ?? 5,
    sheets: allSheets,
    totalSheets,
    totalPlaced,
    totalRequired,
    avgFillPercent: Math.round(avgFillPercent * 10) / 10,
    cutLengthEstimate: Math.round(totalCutLength * 100) / 100,
    sharedCutLength: Math.round(totalSharedCut * 100) / 100,
    cutLengthAfterMerge: Math.round(totalCutAfterMerge * 100) / 100,
    pierceEstimate: totalPlaced,
    pierceDelta: 0,
    strategy: results[0]?.strategy,
  };
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
  state.manualPlacements.clear();
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

    // Group items by materialId for material-aware nesting
    const groups = groupItemsByMaterial(items);
    const groupResults: NestingResult[] = [];
    const groupRequired: number[] = [];

    for (const [_materialId, groupItems] of groups) {
      if (groupItems.length === 0) continue;

      const groupRequiredCount = groupItems.reduce((acc, it) => acc + Math.max(0, Math.trunc(it.quantity)), 0);
      groupRequired.push(groupRequiredCount);

      const groupResult = await nestGroup(groupItems, { w: sheet.w, h: sheet.h }, gap, options, showToast);
      if (groupResult) {
        groupResults.push(groupResult);
      }
    }

    if (groupResults.length === 0) {
      showToast(t('setBuilder.toast.nestingFailed'));
      return;
    }

    // Merge results from all material groups
    const totalRequired = groupRequired.reduce((acc, n) => acc + n, 0);
    result = mergeNestingResults(groupResults, totalRequired);

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
