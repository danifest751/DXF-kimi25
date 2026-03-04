import type { FlattenedEntity } from '../../../../core-engine/src/normalize/index.js';
import { DXFEntityType } from '../../../../core-engine/src/types/index.js';
import type { DxfDiagnostics, DxfIssue, EntityTypeEntry, LayerEntry } from './types.js';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function asObj(fe: FlattenedEntity): Record<string, unknown> {
  return fe.entity as unknown as Record<string, unknown>;
}

function countVertices(fe: FlattenedEntity): number {
  const e = asObj(fe);
  if (e['type'] === DXFEntityType.LWPOLYLINE || e['type'] === DXFEntityType.POLYLINE) {
    const pts = e['vertices'] as unknown[];
    return Array.isArray(pts) ? pts.length : 2;
  }
  if (e['type'] === DXFEntityType.SPLINE) {
    const cp = e['controlPoints'] as unknown[];
    return Array.isArray(cp) ? cp.length : 0;
  }
  return 2;
}

function getEntityLength(fe: FlattenedEntity): number {
  const e = asObj(fe);
  const type = e['type'] as string;
  if (type === DXFEntityType.LINE) {
    const s = e['start'] as { x: number; y: number } | undefined;
    const end = e['end'] as { x: number; y: number } | undefined;
    if (!s || !end) return 0;
    return Math.sqrt((end.x - s.x) ** 2 + (end.y - s.y) ** 2);
  }
  if (type === DXFEntityType.ARC) {
    const r = (e['radius'] as number | undefined) ?? 0;
    const start = (e['startAngle'] as number | undefined) ?? 0;
    const endA = (e['endAngle'] as number | undefined) ?? 0;
    let span = endA - start;
    if (span <= 0) span += 360;
    return r * (span * Math.PI / 180);
  }
  return 0;
}

// ─── Основная функция ────────────────────────────────────────────────────────

export function runDiagnostics(
  flatEntities: FlattenedEntity[],
): DxfDiagnostics {
  // ── Inventory ──────────────────────────────────────────────────────────────
  const typeCounts = new Map<string, number>();
  const layerCounts = new Map<string, Set<string>>();
  let totalVertices = 0;

  for (const fe of flatEntities) {
    const type = asObj(fe)['type'] as string ?? 'UNKNOWN';
    typeCounts.set(type, (typeCounts.get(type) ?? 0) + 1);
    totalVertices += countVertices(fe);

    const layer = asObj(fe)['layer'] as string ?? '0';
    if (!layerCounts.has(layer)) layerCounts.set(layer, new Set());
    layerCounts.get(layer)!.add(type);
  }

  const totalEntities = flatEntities.length;
  const entityTypes: EntityTypeEntry[] = [...typeCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([type, count]) => ({
      type,
      count,
      percent: totalEntities > 0 ? Math.round((count / totalEntities) * 100) : 0,
    }));

  const layers: LayerEntry[] = [...layerCounts.entries()]
    .sort((a, b) => {
      const ca = [...a[1]].reduce((s, t) => s + (typeCounts.get(t) ?? 0), 0);
      const cb = [...b[1]].reduce((s, t) => s + (typeCounts.get(t) ?? 0), 0);
      return cb - ca;
    })
    .map(([name, types]) => ({
      name,
      count: [...types].reduce((s, t) => s + (typeCounts.get(t) ?? 0), 0),
      types: [...types],
    }));

  // ── Extents ────────────────────────────────────────────────────────────────
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const fe of flatEntities) {
    const bb = asObj(fe)['boundingBox'] as {
      min: { x: number; y: number };
      max: { x: number; y: number };
    } | null | undefined;
    if (!bb) continue;
    minX = Math.min(minX, bb.min.x);
    minY = Math.min(minY, bb.min.y);
    maxX = Math.max(maxX, bb.max.x);
    maxY = Math.max(maxY, bb.max.y);
  }
  const extentW = isFinite(maxX) ? Math.round(Math.abs(maxX - minX)) : 0;
  const extentH = isFinite(maxY) ? Math.round(Math.abs(maxY - minY)) : 0;

  // ── Issues ─────────────────────────────────────────────────────────────────
  const issues: DxfIssue[] = [];

  // Critical: экстремальные координаты
  if (extentW > 100_000 || extentH > 100_000) {
    issues.push({
      severity: 'critical',
      code: 'EXTREME_EXTENTS',
      message: `Экстремальные габариты: ${extentW} × ${extentH} мм. Вероятно неверный масштаб.`,
      count: 1,
      recommendation: 'Проверьте единицы измерения в INSUNITS.',
    });
  }

  // Critical: нулевые координаты / нет геометрии
  if (totalEntities === 0) {
    issues.push({
      severity: 'critical',
      code: 'EMPTY_FILE',
      message: 'DXF не содержит видимых сущностей.',
      count: 0,
    });
  }

  // Warning: SPLINE / ELLIPSE
  const splineCount = (typeCounts.get(DXFEntityType.SPLINE) ?? 0) + (typeCounts.get(DXFEntityType.ELLIPSE) ?? 0);
  if (splineCount > 0) {
    issues.push({
      severity: 'warning',
      code: 'SPLINE_ELLIPSE',
      message: `SPLINE/ELLIPSE (${splineCount} шт.) — некоторые CAM-системы не поддерживают.`,
      count: splineCount,
      recommendation: 'R8: Конвертировать в ARC/Polyline (lossy, не в MVP).',
    });
  }

  // Warning: дубли (одинаковые LINE в одном слое)
  let dupeCount = 0;
  const lineKeys = new Set<string>();
  for (const fe of flatEntities) {
    const e = asObj(fe);
    if (e['type'] !== DXFEntityType.LINE) continue;
    const s = e['start'] as { x: number; y: number } | undefined;
    const end = e['end'] as { x: number; y: number } | undefined;
    if (!s || !end) continue;
    const key = `${Math.round(s.x * 100)},${Math.round(s.y * 100)},${Math.round(end.x * 100)},${Math.round(end.y * 100)}`;
    const keyRev = `${Math.round(end.x * 100)},${Math.round(end.y * 100)},${Math.round(s.x * 100)},${Math.round(s.y * 100)}`;
    if (lineKeys.has(key) || lineKeys.has(keyRev)) {
      dupeCount++;
    } else {
      lineKeys.add(key);
    }
  }
  if (dupeCount > 0) {
    issues.push({
      severity: 'warning',
      code: 'DUPLICATES',
      message: `Обнаружено ${dupeCount} дублирующихся LINE-сущностей.`,
      count: dupeCount,
      recommendation: 'R4: Удалить дубли.',
    });
  }

  // Warning: микросегменты (len < 0.1 мм)
  let microCount = 0;
  for (const fe of flatEntities) {
    const len = getEntityLength(fe);
    if (len > 0 && len < 0.1) microCount++;
  }
  if (microCount > 0) {
    issues.push({
      severity: 'warning',
      code: 'MICRO_SEGMENTS',
      message: `${microCount} микросегментов длиной < 0.1 мм. Могут вызвать проблемы при резке.`,
      count: microCount,
      recommendation: 'R1: Удалить нулевые сущности.',
    });
  }

  // Warning: нулевые сущности
  let zeroCount = 0;
  for (const fe of flatEntities) {
    const e = asObj(fe);
    const type = e['type'] as string;
    if (type === DXFEntityType.LINE) {
      if (getEntityLength(fe) === 0) zeroCount++;
    } else if (type === DXFEntityType.CIRCLE || type === DXFEntityType.ARC) {
      if ((e['radius'] as number | undefined ?? 0) <= 0) zeroCount++;
    }
  }
  if (zeroCount > 0) {
    issues.push({
      severity: 'warning',
      code: 'ZERO_LENGTH',
      message: `${zeroCount} сущностей нулевой длины/радиуса.`,
      count: zeroCount,
      recommendation: 'R1: Удалить нулевые сущности.',
    });
  }

  // Info: TEXT / MTEXT / DIMENSION
  const annotCount = (typeCounts.get(DXFEntityType.TEXT) ?? 0) +
    (typeCounts.get(DXFEntityType.MTEXT) ?? 0) +
    (typeCounts.get(DXFEntityType.DIMENSION) ?? 0) +
    (typeCounts.get(DXFEntityType.LEADER) ?? 0);
  if (annotCount > 0) {
    issues.push({
      severity: 'info',
      code: 'ANNOTATIONS',
      message: `${annotCount} аннотационных сущностей (TEXT/MTEXT/DIMENSION/LEADER). Не участвуют в резке.`,
      count: annotCount,
      recommendation: 'R2: Удалить аннотации (опционально).',
    });
  }

  // Info: INSERT (блоки)
  const insertCount = typeCounts.get(DXFEntityType.INSERT) ?? 0;
  if (insertCount > 0) {
    issues.push({
      severity: 'info',
      code: 'INSERTS',
      message: `${insertCount} INSERT-блоков. Уже развёрнуты при нормализации.`,
      count: insertCount,
    });
  }

  // Info: HATCH
  const hatchCount = typeCounts.get(DXFEntityType.HATCH) ?? 0;
  if (hatchCount > 0) {
    issues.push({
      severity: 'info',
      code: 'HATCH',
      message: `${hatchCount} HATCH-сущностей. Не участвуют в резке.`,
      count: hatchCount,
      recommendation: 'R2: Удалить штриховки.',
    });
  }

  // ── Health Score ───────────────────────────────────────────────────────────
  let score = 100;
  for (const issue of issues) {
    if (issue.severity === 'critical') score -= 30;
    else if (issue.severity === 'warning') score -= 10;
    else score -= 5;
  }
  const healthScore = Math.max(0, Math.min(100, score));

  return {
    healthScore,
    totalEntities,
    totalVertices,
    layersCount: layerCounts.size,
    extentW,
    extentH,
    entityTypes,
    layers,
    issues,
  };
}
