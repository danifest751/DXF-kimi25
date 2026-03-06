import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock api and blob download so no actual HTTP calls happen
vi.mock('../../packages/ui-app/src/api.js', () => ({
  apiPostJSON: vi.fn(),
  downloadBlob: vi.fn(),
  apiGetJSON: vi.fn(),
  apiPatchJSON: vi.fn(),
  arrayBufferToBase64: vi.fn(() => ''),
}));

// Mock core-engine export so we don't need a full DXF build
vi.mock('../../../core-engine/src/export/index.js', () => ({
  exportNestingToDXF: vi.fn(() => 'DXF_CONTENT'),
}));

vi.mock('../../packages/ui-app/src/state.js', () => ({
  loadedFiles: [],
  workspaceCatalogs: [],
  authSessionToken: '',
  authWorkspaceId: '',
  selectedCatalogIds: new Set(),
  UNCATEGORIZED_CATALOG_ID: '__uncategorized__',
  bumpNextFileId: vi.fn(() => 1),
  setActiveFileId: vi.fn(),
}));

import { exportSheetByIndex } from '../../packages/ui-app/src/set-builder/nesting.js';
import type { NestingResult } from '../../../core-engine/src/nesting/index.js';
import type { ItemDocData } from '../../../core-engine/src/export/index.js';

function makeNestingResult(sheetCount = 2): NestingResult {
  return {
    sheets: Array.from({ length: sheetCount }, (_, i) => ({
      sheetIndex: i,
      placed: [{ itemId: 1, x: 0, y: 0, rotation: 0 }],
      fillPercent: 50,
      unplacedItemIds: [],
    })),
    totalPlaced: sheetCount,
    totalRequired: sheetCount,
    totalSheets: sheetCount,
    avgFillPercent: 50,
    sheet: { width: 1250, height: 2500 },
    gap: 5,
    cutLengthEstimate: 1000,
    sharedCutLength: 0,
    cutLengthAfterMerge: 0,
    pierceEstimate: 10,
    pierceDelta: 0,
    strategy: 'precise',
  } as unknown as NestingResult;
}

describe('exportSheetByIndex', () => {
  let itemDocs: Map<number, ItemDocData>;

  beforeEach(() => {
    itemDocs = new Map();
    vi.clearAllMocks();
  });

  it('returns false for out-of-range sheetIndex (too high)', async () => {
    const result = makeNestingResult(2);
    const ok = await exportSheetByIndex(result, itemDocs, 5);
    expect(ok).toBe(false);
  });

  it('returns false for negative sheetIndex', async () => {
    const result = makeNestingResult(2);
    const ok = await exportSheetByIndex(result, itemDocs, -1);
    expect(ok).toBe(false);
  });

  it('returns true for valid sheetIndex 0', async () => {
    const result = makeNestingResult(2);
    const ok = await exportSheetByIndex(result, itemDocs, 0);
    expect(ok).toBe(true);
  });

  it('returns true for last valid sheet', async () => {
    const result = makeNestingResult(3);
    const ok = await exportSheetByIndex(result, itemDocs, 2);
    expect(ok).toBe(true);
  });

  it('does not throw with empty itemDocs', async () => {
    const result = makeNestingResult(1);
    await expect(exportSheetByIndex(result, new Map(), 0)).resolves.not.toThrow();
  });

  it('calls downloadBlob exactly once for valid export', async () => {
    const { downloadBlob } = await import('../../packages/ui-app/src/api.js');
    const result = makeNestingResult(1);
    await exportSheetByIndex(result, itemDocs, 0);
    expect(downloadBlob).toHaveBeenCalledOnce();
  });

  it('does not call downloadBlob for invalid sheetIndex', async () => {
    const { downloadBlob } = await import('../../packages/ui-app/src/api.js');
    const result = makeNestingResult(1);
    await exportSheetByIndex(result, itemDocs, 99);
    expect(downloadBlob).not.toHaveBeenCalled();
  });
});
