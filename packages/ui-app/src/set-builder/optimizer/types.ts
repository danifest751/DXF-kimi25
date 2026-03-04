import type { FlattenedEntity } from '../../../../core-engine/src/normalize/index.js';
import type { DXFDocument } from '../../../../core-engine/src/types/index.js';

// ─── Диагностика ────────────────────────────────────────────────────────────

export type IssueSeverity = 'critical' | 'warning' | 'info';

export interface DxfIssue {
  readonly severity: IssueSeverity;
  readonly code: string;
  readonly message: string;
  readonly count: number;
  readonly recommendation?: string;
}

export interface EntityTypeEntry {
  readonly type: string;
  readonly count: number;
  readonly percent: number;
}

export interface LayerEntry {
  readonly name: string;
  readonly count: number;
  readonly types: string[];
}

export interface DxfDiagnostics {
  readonly healthScore: number;
  readonly totalEntities: number;
  readonly totalVertices: number;
  readonly layersCount: number;
  readonly extentW: number;
  readonly extentH: number;
  readonly entityTypes: EntityTypeEntry[];
  readonly layers: LayerEntry[];
  readonly issues: DxfIssue[];
}

// ─── Правила оптимизации ─────────────────────────────────────────────────────

export type RuleId = 'R1' | 'R4' | 'R5' | 'R6';

export interface OptimizationRule {
  readonly id: RuleId;
  readonly nameKey: string;
  readonly descKey: string;
  readonly safe: boolean;
  readonly defaultEnabled: boolean;
}

export interface OptimizationPlan {
  enabled: Set<RuleId>;
  epsilonMm: number;
}

// ─── Результат ───────────────────────────────────────────────────────────────

export interface RuleApplied {
  readonly ruleId: RuleId;
  readonly affected: number;
}

export interface OptimizationResult {
  readonly beforeEntities: number;
  readonly afterEntities: number;
  readonly rulesApplied: RuleApplied[];
  readonly optimizedDxf: string;
  readonly reportJson: string;
  readonly fileName: string;
}

// ─── State внутри optimizer ───────────────────────────────────────────────────

export type OptimizerTab = 'overview' | 'preview' | 'inventory' | 'issues' | 'optimize';
export type OptimizerPhase = 'idle' | 'analyzing' | 'optimizing' | 'done';

export interface OptimizerState {
  activeTab: OptimizerTab;
  plan: OptimizationPlan;
  diagnostics: DxfDiagnostics | null;
  result: OptimizationResult | null;
  running: boolean;
  phase: OptimizerPhase;
}

export function createOptimizerState(): OptimizerState {
  return {
    activeTab: 'overview',
    plan: {
      enabled: new Set<RuleId>(['R1', 'R4', 'R5', 'R6']),
      epsilonMm: 0.01,
    },
    diagnostics: null,
    result: null,
    running: false,
    phase: 'idle',
  };
}

// ─── Константы правил ─────────────────────────────────────────────────────────

export const OPTIMIZATION_RULES: OptimizationRule[] = [
  { id: 'R1', nameKey: 'optimizer.rule.R1.name', descKey: 'optimizer.rule.R1.desc', safe: true, defaultEnabled: true },
  { id: 'R4', nameKey: 'optimizer.rule.R4.name', descKey: 'optimizer.rule.R4.desc', safe: true, defaultEnabled: true },
  { id: 'R5', nameKey: 'optimizer.rule.R5.name', descKey: 'optimizer.rule.R5.desc', safe: true, defaultEnabled: true },
  { id: 'R6', nameKey: 'optimizer.rule.R6.name', descKey: 'optimizer.rule.R6.desc', safe: true, defaultEnabled: true },
];

// ─── Input для optimizer ──────────────────────────────────────────────────────

export interface OptimizerInput {
  readonly flatEntities: FlattenedEntity[];
  readonly sourceDoc: DXFDocument;
  readonly fileName: string;
}
