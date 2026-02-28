export type ItemStatus = 'ok' | 'warn' | 'error';
export type LayoutMode = 'gallery' | 'table';
export type SetBuilderTab = 'set' | 'results';
export type NestMode = 'normal' | 'commonLine';
export type SetBuilderNestingStrategy = 'maxrects_bbox' | 'true_shape';
export type LibrarySortBy = 'name' | 'area' | 'pierces' | 'cutLen';
export type LibrarySortDir = 'asc' | 'desc';

export interface LibraryItem {
  readonly id: number;
  readonly sourceFileId?: number;
  readonly name: string;
  readonly catalog: string;
  readonly w: number;
  readonly h: number;
  readonly pierces: number;
  readonly cutLen: number;
  readonly layersCount: number;
  readonly status: ItemStatus;
  readonly issues: readonly string[];
  readonly thumbVariant: number;
}

export interface SetItem {
  readonly libraryId: number;
  qty: number;
  enabled: boolean;
}

export interface SheetPreset {
  readonly id: string;
  readonly label: string;
  readonly w: number;
  readonly h: number;
  readonly isCoil?: boolean;
}

export interface SheetResult {
  readonly id: string;
  readonly utilization: number;
  readonly partCount: number;
  readonly hash: string;
  readonly blocks: readonly { x: number; y: number; w: number; h: number }[];
}

export interface NestingResults {
  readonly sheets: readonly SheetResult[];
}

export interface SetBuilderState {
  library: LibraryItem[];
  set: Map<number, SetItem>;
  selectedLibraryIds: Set<number>;
  search: string;
  catalogFilter: string;
  sheetPresetId: string;
  gapMm: number;
  mode: NestMode;
  nestStrategy: SetBuilderNestingStrategy;
  rotationEnabled: boolean;
  rotationStepDeg: 1 | 2 | 5;
  multiStart: boolean;
  seed: number;
  commonLineMaxMergeDistanceMm: number;
  commonLineMinSharedLenMm: number;
  layout: LayoutMode;
  sortBy: LibrarySortBy;
  sortDir: LibrarySortDir;
  activeTab: SetBuilderTab;
  open: boolean;
  loading: boolean;
  previewLibraryId: number | null;
  previewSheetId: string | null;
  openMenuLibraryId: number | null;
  results: NestingResults | null;
}
