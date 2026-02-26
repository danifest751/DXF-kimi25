/**
 * Web Worker for true_shape nesting computation.
 * Runs nestItems() off the main thread to prevent UI freeze.
 */

import { nestItems } from '@core/nesting/index.js';
import type { NestingItem, NestingOptions, SheetSize } from '@core/nesting/index.js';

export interface NestingWorkerRequest {
  items: readonly NestingItem[];
  sheet: SheetSize;
  gap: number;
  options: NestingOptions;
}

self.onmessage = (e: MessageEvent<NestingWorkerRequest>) => {
  const { items, sheet, gap, options } = e.data;
  try {
    const result = nestItems(items, sheet, gap, options);
    self.postMessage({ ok: true, result });
  } catch (err) {
    self.postMessage({ ok: false, error: err instanceof Error ? err.message : String(err) });
  }
};
