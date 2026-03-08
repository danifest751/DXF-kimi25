export type ItemStatus = 'ok' | 'warn' | 'error';
export type NestingPhase = 'idle' | 'preparing' | 'nesting' | 'saving';
export type SetBuilderTab = 'library' | 'results' | 'nesting';
export type NestMode = 'normal' | 'commonLine';
export type SetBuilderNestingStrategy = 'maxrects_bbox' | 'true_shape';
export type LibrarySortBy = 'name' | 'area' | 'pierces' | 'cutLen';
export type LibrarySortDir = 'asc' | 'desc';

export interface LibraryItem {
  readonly id: number;
  readonly sourceFileId?: number;
  readonly remoteId?: string;
  readonly name: string;
  readonly catalog: string;
  readonly w: number;
  readonly h: number;
  readonly areaMm2: number;
  readonly pierces: number;
  readonly cutLen: number;
  readonly layersCount: number;
  readonly status: ItemStatus;
  readonly issues: readonly string[];
  readonly thumbVariant: number;
}

export interface MaterialAssignment {
  readonly materialId: string;
  readonly appliedAt: number;
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
  readonly sheetWidth: number;
  readonly sheetHeight: number;
  readonly gap: number;
  readonly placements: readonly {
    itemId: number;
    name: string;
    x: number;
    y: number;
    w: number;
    h: number;
    angleDeg: number;
  }[];
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
  sortBy: LibrarySortBy;
  sortDir: LibrarySortDir;
  activeTab: SetBuilderTab;
  open: boolean;
  loading: boolean;
  nestingPhase: NestingPhase;
  previewLibraryId: number | null;
  previewSheetId: string | null;
  previewShowPierces: boolean;
  openMenuLibraryId: number | null;
  results: NestingResults | null;
  materialAssignments: Map<number, MaterialAssignment>;
  lastUsedMaterialId: string | null;
  materialModalOpenForId: number | null;
  optimizerOpenForId: number | null;
  isCacheLoaded: boolean;
  collapsedCatalogs: Set<string>;
  uploadingCount: number;
  busyLabel: string;
}
