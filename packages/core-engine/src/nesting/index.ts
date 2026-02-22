/**
 * @module core/nesting
 * Модуль раскладки деталей на лист металла.
 * Алгоритм: Bottom-Left Fill (BLF) с опциональным поворотом на 90°.
 */

// ─── Типы ───────────────────────────────────────────────────────────

/** Размер листа металла (мм) */
export interface SheetSize {
  readonly width: number;
  readonly height: number;
}

/** Пресет листа */
export interface SheetPreset {
  readonly label: string;
  readonly size: SheetSize;
}

/** Деталь для раскладки */
export interface NestingPoint {
  readonly x: number;
  readonly y: number;
}

/** Деталь для раскладки */
export interface NestingItem {
  readonly id: number;
  readonly name: string;
  readonly width: number;
  readonly height: number;
  readonly quantity: number;
  readonly contour?: readonly NestingPoint[];
}

/** Размещённая деталь на листе */
export interface PlacedItem {
  readonly itemId: number;
  readonly name: string;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly rotated: boolean;
  readonly angleDeg: number;
  readonly copyIndex: number;
}

export type NestingStrategy = 'blf_bbox' | 'maxrects_bbox';

export interface CommonLineOptions {
  readonly enabled?: boolean;
  readonly maxMergeDistanceMm?: number;
  readonly minSharedLenMm?: number;
}

/** Опции раскладки */
export interface NestingOptions {
  readonly rotationEnabled?: boolean;
  readonly rotationAngleStepDeg?: 1 | 2 | 5;
  readonly strategy?: NestingStrategy;
  readonly multiStart?: boolean;
  readonly seed?: number;
  readonly commonLine?: CommonLineOptions;
}

/** Один лист с размещёнными деталями */
export interface NestingSheet {
  readonly sheetIndex: number;
  readonly placed: readonly PlacedItem[];
  readonly usedArea: number;
  readonly fillPercent: number;
}

/** Результат раскладки */
export interface NestingResult {
  readonly sheet: SheetSize;
  readonly gap: number;
  readonly sheets: readonly NestingSheet[];
  readonly totalSheets: number;
  readonly totalPlaced: number;
  readonly totalRequired: number;
  readonly avgFillPercent: number;
  readonly cutLengthEstimate: number;
  readonly sharedCutLength: number;
  readonly cutLengthAfterMerge: number;
  readonly pierceEstimate: number;
  readonly pierceDelta: number;
}

// ─── Пресеты ────────────────────────────────────────────────────────

export const SHEET_PRESETS: readonly SheetPreset[] = [
  { label: '1000 × 2000', size: { width: 1000, height: 2000 } },
  { label: '1250 × 2500', size: { width: 1250, height: 2500 } },
  { label: '1500 × 3000', size: { width: 1500, height: 3000 } },
  { label: '1500 × 6000', size: { width: 1500, height: 6000 } },
  { label: '2000 × 6000', size: { width: 2000, height: 6000 } },
];

// ─── Алгоритм BLF ──────────────────────────────────────────────────

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

function rectangleContour(w: number, h: number): readonly NestingPoint[] {
  return [
    { x: 0, y: 0 },
    { x: w, y: 0 },
    { x: w, y: h },
    { x: 0, y: h },
  ];
}

function normalizeContour(contour: readonly NestingPoint[] | undefined, w: number, h: number): readonly NestingPoint[] {
  if (!Array.isArray(contour) || contour.length < 3) return rectangleContour(w, h);
  const points = contour.filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y));
  if (points.length < 3) return rectangleContour(w, h);
  return points;
}

function rotateTranslatePolygon(
  polygon: readonly NestingPoint[],
  angleDeg: number,
  bboxW: number,
  bboxH: number,
  x: number,
  y: number,
): readonly NestingPoint[] {
  const angleRad = (angleDeg * Math.PI) / 180;
  const c = Math.cos(angleRad);
  const s = Math.sin(angleRad);
  const cx = bboxW / 2;
  const cy = bboxH / 2;

  const rotated = polygon.map((p) => {
    const dx = p.x - cx;
    const dy = p.y - cy;
    return {
      x: dx * c - dy * s + cx,
      y: dx * s + dy * c + cy,
    };
  });

  let minX = Infinity;
  let minY = Infinity;
  for (const p of rotated) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
  }

  const tx = x - minX;
  const ty = y - minY;
  return rotated.map((p) => ({ x: p.x + tx, y: p.y + ty }));
}

function polygonsOverlapSAT(a: readonly NestingPoint[], b: readonly NestingPoint[]): boolean {
  const epsilon = 1e-9;
  const polygons = [a, b];

  for (const poly of polygons) {
    for (let i = 0; i < poly.length; i++) {
      const p1 = poly[i]!;
      const p2 = poly[(i + 1) % poly.length]!;
      const edgeX = p2.x - p1.x;
      const edgeY = p2.y - p1.y;
      const axisX = -edgeY;
      const axisY = edgeX;

      let aMin = Infinity;
      let aMax = -Infinity;
      for (const p of a) {
        const proj = p.x * axisX + p.y * axisY;
        if (proj < aMin) aMin = proj;
        if (proj > aMax) aMax = proj;
      }

      let bMin = Infinity;
      let bMax = -Infinity;
      for (const p of b) {
        const proj = p.x * axisX + p.y * axisY;
        if (proj < bMin) bMin = proj;
        if (proj > bMax) bMax = proj;
      }

      if (aMax <= bMin + epsilon || bMax <= aMin + epsilon) {
        return false;
      }
    }
  }

  return true;
}

function overlapLength(a1: number, a2: number, b1: number, b2: number): number {
  const lo = Math.max(Math.min(a1, a2), Math.min(b1, b2));
  const hi = Math.min(Math.max(a1, a2), Math.max(b1, b2));
  return Math.max(0, hi - lo);
}

function estimateSharedCutForSheet(
  placed: readonly PlacedItem[],
  maxMergeDistanceMm: number,
  minSharedLenMm: number,
): { sharedCutLength: number; mergePairs: number } {
  let shared = 0;
  let mergePairs = 0;

  for (let i = 0; i < placed.length; i++) {
    const a = placed[i]!;
    const aLeft = a.x;
    const aRight = a.x + a.width;
    const aBottom = a.y;
    const aTop = a.y + a.height;

    for (let j = i + 1; j < placed.length; j++) {
      const b = placed[j]!;
      const bLeft = b.x;
      const bRight = b.x + b.width;
      const bBottom = b.y;
      const bTop = b.y + b.height;

      let pairShared = 0;

      const vertTouch = Math.min(
        Math.abs(aRight - bLeft),
        Math.abs(bRight - aLeft),
      );
      if (vertTouch <= maxMergeDistanceMm) {
        const ov = overlapLength(aBottom, aTop, bBottom, bTop);
        if (ov >= minSharedLenMm) pairShared += ov;
      }

      const horTouch = Math.min(
        Math.abs(aTop - bBottom),
        Math.abs(bTop - aBottom),
      );
      if (horTouch <= maxMergeDistanceMm) {
        const ov = overlapLength(aLeft, aRight, bLeft, bRight);
        if (ov >= minSharedLenMm) pairShared += ov;
      }

      if (pairShared > 0) {
        shared += pairShared;
        mergePairs++;
      }
    }
  }

  return { sharedCutLength: shared, mergePairs };
}

/**
 * Bottom-Left Fill: пытается разместить прямоугольник (w×h)
 * в самую нижнюю-левую свободную позицию на листе.
 * Использует список свободных прямоугольников (shelf-like).
 */
class SheetPacker {
  private readonly sheetW: number;
  private readonly sheetH: number;
  private readonly gap: number;
  private readonly anglesDeg: readonly number[];
  private readonly strategy: NestingStrategy;
  private freeRects: Rect[];
  private readonly placedPolygons: NestingPoint[][] = [];
  readonly placed: PlacedItem[] = [];
  usedArea: number = 0;

  constructor(sheet: SheetSize, gap: number, anglesDeg: readonly number[], strategy: NestingStrategy) {
    this.sheetW = sheet.width;
    this.sheetH = sheet.height;
    this.gap = gap;
    this.anglesDeg = anglesDeg;
    this.strategy = strategy;
    this.freeRects = [{ x: 0, y: 0, w: this.sheetW, h: this.sheetH }];
  }

  tryPlace(
    itemId: number,
    name: string,
    w: number,
    h: number,
    copyIndex: number,
    contour: readonly NestingPoint[] | undefined,
  ): boolean {
    const g = this.gap;
    let best: { x: number; y: number; rw: number; rh: number; angleDeg: number } | null = null;

    const baseContour = normalizeContour(contour, w, h);

    for (const angleDeg of this.anglesDeg) {
      const angleRad = (angleDeg * Math.PI) / 180;
      const c = Math.abs(Math.cos(angleRad));
      const s = Math.abs(Math.sin(angleRad));
      const rw = w * c + h * s + g;
      const rh = w * s + h * c + g;
      const pos = this.findBestPosition(rw, rh);
      if (!pos) continue;
      const candidatePolygon = rotateTranslatePolygon(baseContour, angleDeg, w, h, pos.x, pos.y);
      let intersects = false;
      for (const existing of this.placedPolygons) {
        if (polygonsOverlapSAT(candidatePolygon, existing)) {
          intersects = true;
          break;
        }
      }
      if (intersects) continue;
      if (!best || pos.y < best.y || (pos.y === best.y && pos.x < best.x)) {
        best = { x: pos.x, y: pos.y, rw, rh, angleDeg };
      }
    }

    if (!best) return false;

    const norm = ((best.angleDeg % 180) + 180) % 180;
    const rotated = Math.abs(norm - 90) < 1e-9;

    this.placed.push({
      itemId,
      name,
      x: best.x,
      y: best.y,
      width: best.rw - g,
      height: best.rh - g,
      rotated,
      angleDeg: best.angleDeg,
      copyIndex,
    });

    this.placedPolygons.push([...rotateTranslatePolygon(baseContour, best.angleDeg, w, h, best.x, best.y)]);

    this.usedArea += w * h;
    this.splitFreeRects({ x: best.x, y: best.y, w: best.rw, h: best.rh });

    return true;
  }

  private findBestPosition(w: number, h: number): { x: number; y: number } | null {
    if (this.strategy === 'maxrects_bbox') {
      let best: { x: number; y: number; shortSide: number; areaFit: number; longSide: number } | null = null;

      for (const r of this.freeRects) {
        if (w > r.w || h > r.h) continue;
        const dw = r.w - w;
        const dh = r.h - h;
        const shortSide = Math.min(dw, dh);
        const longSide = Math.max(dw, dh);
        const areaFit = r.w * r.h - w * h;
        if (
          best === null
          || shortSide < best.shortSide
          || (shortSide === best.shortSide && areaFit < best.areaFit)
          || (shortSide === best.shortSide && areaFit === best.areaFit && longSide < best.longSide)
          || (shortSide === best.shortSide && areaFit === best.areaFit && longSide === best.longSide
            && (r.y < best.y || (r.y === best.y && r.x < best.x)))
        ) {
          best = { x: r.x, y: r.y, shortSide, areaFit, longSide };
        }
      }

      return best ? { x: best.x, y: best.y } : null;
    }

    let bestX = Infinity;
    let bestY = Infinity;
    let found = false;

    for (const r of this.freeRects) {
      if (w <= r.w && h <= r.h) {
        if (r.y < bestY || (r.y === bestY && r.x < bestX)) {
          bestX = r.x;
          bestY = r.y;
          found = true;
        }
      }
    }

    return found ? { x: bestX, y: bestY } : null;
  }

  private splitFreeRects(used: Rect): void {
    const newFree: Rect[] = [];

    for (const r of this.freeRects) {
      // Если нет пересечения — оставляем как есть
      if (used.x >= r.x + r.w || used.x + used.w <= r.x ||
          used.y >= r.y + r.h || used.y + used.h <= r.y) {
        newFree.push(r);
        continue;
      }

      // Правая часть
      if (used.x + used.w < r.x + r.w) {
        newFree.push({
          x: used.x + used.w,
          y: r.y,
          w: r.x + r.w - (used.x + used.w),
          h: r.h,
        });
      }

      // Левая часть
      if (used.x > r.x) {
        newFree.push({
          x: r.x,
          y: r.y,
          w: used.x - r.x,
          h: r.h,
        });
      }

      // Верхняя часть
      if (used.y + used.h < r.y + r.h) {
        newFree.push({
          x: r.x,
          y: used.y + used.h,
          w: r.w,
          h: r.y + r.h - (used.y + used.h),
        });
      }

      // Нижняя часть
      if (used.y > r.y) {
        newFree.push({
          x: r.x,
          y: r.y,
          w: r.w,
          h: used.y - r.y,
        });
      }
    }

    // Убираем вложенные прямоугольники
    this.freeRects = this.pruneContained(newFree);
  }

  private pruneContained(rects: Rect[]): Rect[] {
    const result: Rect[] = [];
    for (let i = 0; i < rects.length; i++) {
      const a = rects[i]!;
      let contained = false;
      for (let j = 0; j < rects.length; j++) {
        if (i === j) continue;
        const b = rects[j]!;
        if (a.x >= b.x && a.y >= b.y &&
            a.x + a.w <= b.x + b.w && a.y + a.h <= b.y + b.h) {
          contained = true;
          break;
        }
      }
      if (!contained) result.push(a);
    }
    return result;
  }
}

// ─── Главная функция ────────────────────────────────────────────────

/**
 * Раскладывает детали на листы металла.
 */
export function nestItems(
  items: readonly NestingItem[],
  sheet: SheetSize,
  gap: number = 5,
  options: NestingOptions = {},
): NestingResult {
  const rotationEnabled = options.rotationEnabled ?? true;
  const stepRaw = options.rotationAngleStepDeg ?? 2;
  const rotationAngleStepDeg: 1 | 2 | 5 = stepRaw === 1 || stepRaw === 5 ? stepRaw : 2;
  const strategy: NestingStrategy = options.strategy === 'maxrects_bbox' ? 'maxrects_bbox' : 'blf_bbox';
  const multiStart = options.multiStart ?? false;
  const seed = Number.isFinite(options.seed) ? Math.trunc(options.seed as number) : 0;
  const commonLineEnabled = options.commonLine?.enabled ?? false;
  const effectiveGap = commonLineEnabled ? 0 : gap;
  const maxMergeDistanceMm = typeof options.commonLine?.maxMergeDistanceMm === 'number'
    ? Math.max(0, options.commonLine.maxMergeDistanceMm)
    : 0.2;
  const minSharedLenMm = typeof options.commonLine?.minSharedLenMm === 'number'
    ? Math.max(0, options.commonLine.minSharedLenMm)
    : 20;
  const anglesDeg: number[] = rotationEnabled
    ? Array.from({ length: Math.floor(180 / rotationAngleStepDeg) }, (_v, i) => i * rotationAngleStepDeg)
    : [0];

  // Разворачиваем количество в отдельные копии, сортируем по площади (убывание)
  interface CopyEntry {
    itemId: number;
    name: string;
    w: number;
    h: number;
    contour?: readonly NestingPoint[];
    copyIndex: number;
    area: number;
  }

  const copies: CopyEntry[] = [];
  for (const item of items) {
    for (let c = 0; c < item.quantity; c++) {
      copies.push({
        itemId: item.id,
        name: item.name,
        w: item.width,
        h: item.height,
        contour: item.contour,
        copyIndex: c,
        area: item.width * item.height,
      });
    }
  }

  const totalRequired = copies.length;

  function seededRank(copy: CopyEntry): number {
    const w = Math.round(copy.w * 1000);
    const h = Math.round(copy.h * 1000);
    let x = seed ^ Math.imul(copy.itemId + 1, 374761393) ^ Math.imul(copy.copyIndex + 1, 668265263);
    x ^= Math.imul(w + 1, 2246822519);
    x ^= Math.imul(h + 1, 3266489917);
    x ^= x >>> 16;
    x = Math.imul(x, 2246822507);
    x ^= x >>> 13;
    x = Math.imul(x, 3266489909);
    x ^= x >>> 16;
    return x >>> 0;
  }

  type CopyComparator = (a: CopyEntry, b: CopyEntry) => number;

  const byAreaDesc: CopyComparator = (a, b) => b.area - a.area || Math.max(b.w, b.h) - Math.max(a.w, a.h);
  const byMaxSideDesc: CopyComparator = (a, b) => Math.max(b.w, b.h) - Math.max(a.w, a.h) || b.area - a.area;
  const byPerimeterDesc: CopyComparator = (a, b) => (b.w + b.h) - (a.w + a.h) || b.area - a.area;
  const byAreaThenSeed: CopyComparator = (a, b) => byAreaDesc(a, b) || (seededRank(a) - seededRank(b));

  const comparators: CopyComparator[] = [byAreaDesc];
  if (multiStart) {
    comparators.push(byMaxSideDesc, byPerimeterDesc, byAreaThenSeed);
  }

  interface PackedAttempt {
    readonly packers: readonly SheetPacker[];
    readonly totalPlaced: number;
    readonly avgFillPercent: number;
  }

  function runAttempt(compare: CopyComparator): PackedAttempt {
    const ordered = [...copies].sort(compare);
    const packers: SheetPacker[] = [];
    let totalPlaced = 0;

    for (const copy of ordered) {
      let placed = false;

      for (const packer of packers) {
        if (packer.tryPlace(copy.itemId, copy.name, copy.w, copy.h, copy.copyIndex, copy.contour)) {
          placed = true;
          totalPlaced++;
          break;
        }
      }

      if (!placed) {
        const packer = new SheetPacker(sheet, effectiveGap, anglesDeg, strategy);
        if (packer.tryPlace(copy.itemId, copy.name, copy.w, copy.h, copy.copyIndex, copy.contour)) {
          packers.push(packer);
          totalPlaced++;
        }
      }
    }

    const sheetArea = sheet.width * sheet.height;
    const avgFillPercent = packers.length > 0
      ? packers.reduce((acc, p) => acc + (sheetArea > 0 ? (p.usedArea / sheetArea) * 100 : 0), 0) / packers.length
      : 0;

    return { packers, totalPlaced, avgFillPercent };
  }

  function isBetterAttempt(next: PackedAttempt, best: PackedAttempt): boolean {
    if (next.totalPlaced !== best.totalPlaced) return next.totalPlaced > best.totalPlaced;
    if (next.packers.length !== best.packers.length) return next.packers.length < best.packers.length;
    if (next.avgFillPercent !== best.avgFillPercent) return next.avgFillPercent > best.avgFillPercent;
    return false;
  }

  let bestAttempt = runAttempt(comparators[0]!);
  for (let i = 1; i < comparators.length; i++) {
    const nextAttempt = runAttempt(comparators[i]!);
    if (isBetterAttempt(nextAttempt, bestAttempt)) {
      bestAttempt = nextAttempt;
    }
  }

  const packers = bestAttempt.packers;
  const totalPlaced = bestAttempt.totalPlaced;

  const sheets: NestingSheet[] = [];

  const sheetArea = sheet.width * sheet.height;
  let totalFill = 0;
  let cutLengthEstimate = 0;
  let sharedCutLength = 0;
  let mergePairs = 0;

  for (let i = 0; i < packers.length; i++) {
    const p = packers[i]!;
    const fill = sheetArea > 0 ? (p.usedArea / sheetArea) * 100 : 0;
    totalFill += fill;
    cutLengthEstimate += p.placed.reduce((acc, it) => acc + 2 * (it.width + it.height), 0);
    if (commonLineEnabled) {
      const shared = estimateSharedCutForSheet(p.placed, maxMergeDistanceMm, minSharedLenMm);
      sharedCutLength += shared.sharedCutLength;
      mergePairs += shared.mergePairs;
    }
    sheets.push({
      sheetIndex: i,
      placed: p.placed,
      usedArea: p.usedArea,
      fillPercent: Math.round(fill * 10) / 10,
    });
  }

  const cutLengthAfterMerge = Math.max(0, cutLengthEstimate - sharedCutLength);
  const pierceEstimate = totalPlaced;
  const maxPierceSavings = sheets.reduce((acc, s) => acc + Math.max(0, s.placed.length - 1), 0);
  const pierceDelta = commonLineEnabled ? Math.min(maxPierceSavings, mergePairs) : 0;

  return {
    sheet,
    gap: effectiveGap,
    sheets,
    totalSheets: sheets.length,
    totalPlaced,
    totalRequired,
    avgFillPercent: sheets.length > 0
      ? Math.round((totalFill / sheets.length) * 10) / 10
      : 0,
    cutLengthEstimate: Math.round(cutLengthEstimate * 100) / 100,
    sharedCutLength: Math.round(sharedCutLength * 100) / 100,
    cutLengthAfterMerge: Math.round(cutLengthAfterMerge * 100) / 100,
    pierceEstimate,
    pierceDelta,
  };
}
