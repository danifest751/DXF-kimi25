import { DXFEntityType } from '../../../../core-engine/src/types/index.js';
import type { FlattenedEntity } from '../../../../core-engine/src/normalize/index.js';
import type { OptimizationPlan, RuleApplied } from './types.js';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function asObj(fe: FlattenedEntity): Record<string, unknown> {
  return fe.entity as unknown as Record<string, unknown>;
}

type Pt = { x: number; y: number };

function ptDist(a: Pt, b: Pt): number {
  return Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2);
}

function lineLength(fe: FlattenedEntity): number {
  const e = asObj(fe);
  const s = e['start'] as Pt | undefined;
  const end = e['end'] as Pt | undefined;
  if (!s || !end) return 0;
  return ptDist(s, end);
}

function lineKey(fe: FlattenedEntity, eps: number): string {
  const e = asObj(fe);
  const s = e['start'] as Pt | undefined;
  const end = e['end'] as Pt | undefined;
  if (!s || !end) return '';
  const f = 1 / eps;
  const sx = Math.round(s.x * f);
  const sy = Math.round(s.y * f);
  const ex = Math.round(end.x * f);
  const ey = Math.round(end.y * f);
  // canonical: smaller point first
  if (sx < ex || (sx === ex && sy <= ey)) return `${sx},${sy},${ex},${ey}`;
  return `${ex},${ey},${sx},${sy}`;
}

// ─── R1: Remove Zero-Length Entities ─────────────────────────────────────────

export function applyR1(entities: FlattenedEntity[]): { result: FlattenedEntity[]; affected: number } {
  let affected = 0;
  const result = entities.filter((fe) => {
    const e = asObj(fe);
    const type = e['type'] as string;
    if (type === DXFEntityType.LINE) {
      if (lineLength(fe) === 0) { affected++; return false; }
    } else if (type === DXFEntityType.CIRCLE || type === DXFEntityType.ARC) {
      if (((e['radius'] as number | undefined) ?? 0) <= 0) { affected++; return false; }
    } else if (type === DXFEntityType.LWPOLYLINE || type === DXFEntityType.POLYLINE) {
      const pts = e['vertices'] as unknown[] | undefined;
      if (Array.isArray(pts) && pts.length <= 1) { affected++; return false; }
    }
    return true;
  });
  return { result, affected };
}

// ─── R4: De-duplicate Identical Entities ─────────────────────────────────────

export function applyR4(entities: FlattenedEntity[], eps: number): { result: FlattenedEntity[]; affected: number } {
  let affected = 0;
  const seen = new Set<string>();
  const result = entities.filter((fe) => {
    const e = asObj(fe);
    const type = e['type'] as string;
    if (type !== DXFEntityType.LINE) return true; // только LINE для MVP
    const key = lineKey(fe, eps);
    if (!key) return true;
    if (seen.has(key)) { affected++; return false; }
    seen.add(key);
    return true;
  });
  return { result, affected };
}

// ─── R5: Merge Collinear Segments ────────────────────────────────────────────

function angle(fe: FlattenedEntity): number {
  const e = asObj(fe);
  const s = e['start'] as Pt | undefined;
  const end = e['end'] as Pt | undefined;
  if (!s || !end) return 0;
  return Math.atan2(end.y - s.y, end.x - s.x);
}

function normalizeAngle(a: number): number {
  // bring to [0, PI)
  let r = a % Math.PI;
  if (r < 0) r += Math.PI;
  return r;
}

export function applyR5(
  entities: FlattenedEntity[],
  eps: number,
): { result: FlattenedEntity[]; affected: number } {
  const angleTol = 0.1 * Math.PI / 180; // 0.1°
  let affected = 0;

  // Separate lines from rest
  const lines = entities.filter((fe) => asObj(fe)['type'] === DXFEntityType.LINE);
  const nonLines = entities.filter((fe) => asObj(fe)['type'] !== DXFEntityType.LINE);

  if (lines.length < 2) return { result: entities, affected: 0 };

  // Group lines by normalised angle
  const angleGroups = new Map<string, FlattenedEntity[]>();
  for (const fe of lines) {
    const a = normalizeAngle(angle(fe));
    const key = Math.round(a / angleTol).toString();
    if (!angleGroups.has(key)) angleGroups.set(key, []);
    angleGroups.get(key)!.push(fe);
  }

  const merged: FlattenedEntity[] = [];

  for (const group of angleGroups.values()) {
    if (group.length === 1) { merged.push(group[0]!); continue; }

    // Build adjacency: if endpoint of one ≈ startpoint of other, merge
    const used = new Set<number>();

    for (let i = 0; i < group.length; i++) {
      if (used.has(i)) continue;
      let curFe = group[i]!;
      let curE = asObj(curFe);
      let curStart = curE['start'] as Pt;
      let curEnd = curE['end'] as Pt;
      let mergedAny = false;

      let changed = true;
      while (changed) {
        changed = false;
        for (let j = 0; j < group.length; j++) {
          if (i === j || used.has(j)) continue;
          const otherE = asObj(group[j]!);
          const os = otherE['start'] as Pt;
          const oe = otherE['end'] as Pt;

          if (ptDist(curEnd, os) <= eps) {
            curEnd = oe;
            used.add(j);
            mergedAny = true;
            changed = true;
            affected++;
          } else if (ptDist(curEnd, oe) <= eps) {
            curEnd = os;
            used.add(j);
            mergedAny = true;
            changed = true;
            affected++;
          } else if (ptDist(curStart, oe) <= eps) {
            curStart = os;
            used.add(j);
            mergedAny = true;
            changed = true;
            affected++;
          } else if (ptDist(curStart, os) <= eps) {
            curStart = oe;
            used.add(j);
            mergedAny = true;
            changed = true;
            affected++;
          }
        }
      }

      if (mergedAny) {
        // Build a new synthetic FlattenedEntity with merged endpoints
        const newEntity = {
          ...curFe,
          entity: {
            ...(curFe.entity as object),
            start: curStart,
            end: curEnd,
          },
        } as FlattenedEntity;
        merged.push(newEntity);
        used.add(i);
      } else {
        merged.push(curFe);
        used.add(i);
      }
    }
  }

  return { result: [...nonLines, ...merged], affected };
}

// ─── R6: Join Connected Primitives into Polyline ──────────────────────────────

export function applyR6(
  entities: FlattenedEntity[],
  eps: number,
): { result: FlattenedEntity[]; affected: number } {
  let affected = 0;

  const lines = entities.filter((fe) => asObj(fe)['type'] === DXFEntityType.LINE);
  const nonLines = entities.filter((fe) => asObj(fe)['type'] !== DXFEntityType.LINE);

  if (lines.length < 2) return { result: entities, affected: 0 };

  // Build chains of connected LINE segments
  const used = new Set<number>();
  const chains: FlattenedEntity[][] = [];

  for (let i = 0; i < lines.length; i++) {
    if (used.has(i)) continue;
    const chain: FlattenedEntity[] = [lines[i]!];
    used.add(i);

    let changed = true;
    while (changed) {
      changed = false;
      const lastE = asObj(chain[chain.length - 1]!);
      const chainEnd = lastE['end'] as Pt;
      const firstE = asObj(chain[0]!);
      const chainStart = firstE['start'] as Pt;

      for (let j = 0; j < lines.length; j++) {
        if (used.has(j)) continue;
        const je = asObj(lines[j]!);
        const js = je['start'] as Pt;
        const je2 = je['end'] as Pt;

        if (ptDist(chainEnd, js) <= eps) {
          chain.push(lines[j]!);
          used.add(j);
          changed = true;
        } else if (ptDist(chainEnd, je2) <= eps) {
          // reverse the line
          const rev = {
            ...lines[j]!,
            entity: { ...(lines[j]!.entity as object), start: je2, end: js },
          } as FlattenedEntity;
          chain.push(rev);
          used.add(j);
          changed = true;
        } else if (ptDist(chainStart, je2) <= eps) {
          chain.unshift(lines[j]!);
          used.add(j);
          changed = true;
        } else if (ptDist(chainStart, js) <= eps) {
          const rev = {
            ...lines[j]!,
            entity: { ...(lines[j]!.entity as object), start: js, end: je2 },
          } as FlattenedEntity;
          chain.unshift(rev);
          used.add(j);
          changed = true;
        }
      }
    }

    chains.push(chain);
  }

  // Convert chains of 2+ lines into synthetic LWPOLYLINE FlattenedEntities
  const result: FlattenedEntity[] = [...nonLines];
  for (const chain of chains) {
    if (chain.length < 2) {
      result.push(chain[0]!);
      continue;
    }

    // Build vertices array from chain
    const vertices: Pt[] = [];
    for (let k = 0; k < chain.length; k++) {
      const e = asObj(chain[k]!);
      if (k === 0) {
        vertices.push(e['start'] as Pt);
      }
      vertices.push(e['end'] as Pt);
    }

    const first = chain[0]!;
    const lastPt = vertices[vertices.length - 1]!;
    const firstPt = vertices[0]!;
    const closed = ptDist(firstPt, lastPt) <= eps;

    const polylineEntity = {
      ...(first.entity as object),
      type: DXFEntityType.LWPOLYLINE,
      vertices,
      closed,
    };

    result.push({
      ...first,
      entity: polylineEntity,
    } as unknown as FlattenedEntity);

    affected += chain.length - 1; // merged N lines into 1 polyline
  }

  return { result, affected };
}

// ─── Pipeline ─────────────────────────────────────────────────────────────────

export interface PipelineResult {
  entities: FlattenedEntity[];
  rulesApplied: RuleApplied[];
}

export function runOptimizationPipeline(
  entities: FlattenedEntity[],
  plan: OptimizationPlan,
): PipelineResult {
  const rulesApplied: RuleApplied[] = [];
  let current = [...entities];
  const eps = plan.epsilonMm;

  if (plan.enabled.has('R1')) {
    const r = applyR1(current);
    current = r.result;
    if (r.affected > 0) rulesApplied.push({ ruleId: 'R1', affected: r.affected });
  }

  if (plan.enabled.has('R4')) {
    const r = applyR4(current, eps);
    current = r.result;
    if (r.affected > 0) rulesApplied.push({ ruleId: 'R4', affected: r.affected });
  }

  if (plan.enabled.has('R5')) {
    const r = applyR5(current, eps);
    current = r.result;
    if (r.affected > 0) rulesApplied.push({ ruleId: 'R5', affected: r.affected });
  }

  if (plan.enabled.has('R6')) {
    const r = applyR6(current, eps);
    current = r.result;
    if (r.affected > 0) rulesApplied.push({ ruleId: 'R6', affected: r.affected });
  }

  return { entities: current, rulesApplied };
}
