import { nestItems } from '../../core-engine/src/nesting/index.js';
import type { NestingItem, NestingOptions, NestingResult } from '../../core-engine/src/nesting/index.js';

export interface NestingWorkerRequest {
  items: NestingItem[];
  sheet: { width: number; height: number };
  gap: number;
  options: NestingOptions;
}

export type NestingWorkerResponse =
  | { type: 'done'; result: NestingResult }
  | { type: 'error'; message: string };

self.onmessage = (e: MessageEvent<NestingWorkerRequest>) => {
  try {
    const { items, sheet, gap, options } = e.data;
    const result = nestItems(items, sheet, gap, options);
    const response: NestingWorkerResponse = { type: 'done', result };
    self.postMessage(response);
  } catch (err) {
    const response: NestingWorkerResponse = {
      type: 'error',
      message: err instanceof Error ? err.message : String(err),
    };
    self.postMessage(response);
  }
};
