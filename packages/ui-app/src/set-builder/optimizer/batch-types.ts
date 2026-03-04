import type { OptimizationPlan, RuleId } from './types.js';

export function createDefaultPlan(): OptimizationPlan {
  return { enabled: new Set<RuleId>(['R1', 'R4', 'R5', 'R6']), epsilonMm: 0.01 };
}

// ─── Per-file entry ───────────────────────────────────────────────────────────

export type BatchFileStatus = 'pending' | 'analyzing' | 'queued' | 'running' | 'done' | 'skipped' | 'error';

export interface BatchFileEntry {
  readonly libraryId: number;
  readonly sourceFileId: number;
  readonly name: string;
  readonly catalog: string;
  readonly fileSizeBytes: number;
  enabled: boolean;
  status: BatchFileStatus;
  beforeEntities: number | null;
  afterEntities: number | null;
  savedEntities: number | null;
  optimizedDxf: string | null;
  error: string | null;
}

// ─── Overall batch state ──────────────────────────────────────────────────────

export type BatchPhase = 'idle' | 'analyzing' | 'running' | 'done';

export interface BatchOptimizerState {
  catalogName: string | null;
  allCatalogs: boolean;
  entries: BatchFileEntry[];
  plan: OptimizationPlan;
  phase: BatchPhase;
  processedCount: number;
  totalCount: number;
  aborted: boolean;
}

// ─── Factory ──────────────────────────────────────────────────────────────────

export function createBatchState(
  catalogName: string | null,
  plan: OptimizationPlan,
): BatchOptimizerState {
  return {
    catalogName,
    allCatalogs: catalogName === null,
    entries: [],
    plan,
    phase: 'idle',
    processedCount: 0,
    totalCount: 0,
    aborted: false,
  };
}
