import type { NestingResult } from '../../../core-engine/src/nesting/index.js';
import type { ItemDocData } from '../../../core-engine/src/export/index.js';
import type { SetBuilderState, SheetPreset } from './types.js';

export const STORAGE_KEY = 'dxf_set_builder_state_v1';
export const MATERIALS_STORAGE_KEY = 'dxf_set_builder_materials_v1';

export type { SheetPreset };

export interface SetBuilderContext {
  root: HTMLDivElement;
  state: SetBuilderState;
  sheetPresets: SheetPreset[];
  customSheetWidthMm: number;
  customSheetHeightMm: number;
  toastText: string;
  toastTimer: ReturnType<typeof setTimeout> | null;
  lastPickedLibraryId: number | null;
  draggedLibraryId: number | null;
  dragOverCatalogEl: HTMLElement | null;
  lastEngineResult: NestingResult | null;
  lastItemDocs: Map<number, ItemDocData>;
  dxfThumbCache: Map<string, string>;
  render: () => void;
  showToast: (msg: string) => void;
}
