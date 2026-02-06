/**
 * @module core/geometry/curves
 * Тесселяция кривых: дуги, эллипсы, сплайны, bulge-сегменты.
 * Все функции возвращают массив точек (полилинию).
 */

import type { Point2D, Point3D, Vector3D } from '../types/index.js';
import {
  lenVec3,
  DEG2RAD,
  EPSILON,
} from './math.js';

// ─── Дуга (ARC) ────────────────────────────────────────────────────

/**
 * Тесселяция дуги окружности в массив 3D точек.
 * @param center - Центр
 * @param radius - Радиус
 * @param startAngleDeg - Начальный угол в градусах
 * @param endAngleDeg - Конечный угол в градусах
 * @param segments - Количество сегментов
 * @returns Массив точек на дуге
 */
export function tessellateArc(
  center: Point3D,
  radius: number,
  startAngleDeg: number,
  endAngleDeg: number,
  segments: number,
): Point3D[] {
  const startRad = startAngleDeg * DEG2RAD;
  let endRad = endAngleDeg * DEG2RAD;

  // DXF: если endAngle <= startAngle, дуга идёт через 0°
  if (endRad <= startRad + EPSILON) {
    endRad += Math.PI * 2;
  }

  const sweep = endRad - startRad;
  const n = Math.max(2, Math.ceil(segments * Math.abs(sweep) / (Math.PI * 2)));
  const points: Point3D[] = [];

  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const angle = startRad + sweep * t;
    points.push({
      x: center.x + radius * Math.cos(angle),
      y: center.y + radius * Math.sin(angle),
      z: center.z,
    });
  }

  return points;
}

/**
 * Тесселяция полной окружности.
 */
export function tessellateCircle(
  center: Point3D,
  radius: number,
  segments: number,
): Point3D[] {
  const points: Point3D[] = [];
  for (let i = 0; i <= segments; i++) {
    const angle = (i / segments) * Math.PI * 2;
    points.push({
      x: center.x + radius * Math.cos(angle),
      y: center.y + radius * Math.sin(angle),
      z: center.z,
    });
  }
  return points;
}

// ─── Эллипс (ELLIPSE) ──────────────────────────────────────────────

/**
 * Тесселяция эллипса/эллиптической дуги.
 * @param center - Центр
 * @param majorAxis - Вектор большой полуоси
 * @param minorRatio - Отношение малой оси к большой (0..1)
 * @param startAngle - Начальный параметр (радианы, 0 = начало большой оси)
 * @param endAngle - Конечный параметр (радианы)
 * @param segments - Количество сегментов
 * @returns Массив точек
 */
export function tessellateEllipse(
  center: Point3D,
  majorAxis: Vector3D,
  minorRatio: number,
  startAngle: number,
  endAngle: number,
  segments: number,
): Point3D[] {
  const majorLen = lenVec3(majorAxis);
  if (majorLen < EPSILON) return [center];

  // Угол наклона большой оси в плоскости XY
  const rotation = Math.atan2(majorAxis.dy, majorAxis.dx);
  const a = majorLen;
  const b = majorLen * minorRatio;

  let sweep = endAngle - startAngle;
  // Полный эллипс: startAngle=0, endAngle≈2π
  if (Math.abs(sweep) < EPSILON) {
    sweep = Math.PI * 2;
  }
  if (sweep < 0) {
    sweep += Math.PI * 2;
  }

  const n = Math.max(2, Math.ceil(segments * Math.abs(sweep) / (Math.PI * 2)));
  const points: Point3D[] = [];

  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const param = startAngle + sweep * t;
    // Точка на эллипсе в локальных координатах, затем поворот
    const lx = a * Math.cos(param);
    const ly = b * Math.sin(param);
    const cosR = Math.cos(rotation);
    const sinR = Math.sin(rotation);
    points.push({
      x: center.x + lx * cosR - ly * sinR,
      y: center.y + lx * sinR + ly * cosR,
      z: center.z,
    });
  }

  return points;
}

// ─── Сплайн (SPLINE) — NURBS ───────────────────────────────────────

/**
 * Вычисляет базисную функцию B-сплайна (Cox-de Boor).
 */
function basisFunction(i: number, p: number, u: number, knots: readonly number[]): number {
  if (p === 0) {
    return (u >= knots[i]! && u < knots[i + 1]!) ? 1.0 : 0.0;
  }

  const denom1 = knots[i + p]! - knots[i]!;
  const denom2 = knots[i + p + 1]! - knots[i + 1]!;

  let term1 = 0;
  let term2 = 0;

  if (Math.abs(denom1) > EPSILON) {
    term1 = ((u - knots[i]!) / denom1) * basisFunction(i, p - 1, u, knots);
  }
  if (Math.abs(denom2) > EPSILON) {
    term2 = ((knots[i + p + 1]! - u) / denom2) * basisFunction(i + 1, p - 1, u, knots);
  }

  return term1 + term2;
}

/**
 * Тесселяция NURBS-сплайна.
 * @param degree - Степень сплайна
 * @param controlPoints - Контрольные точки
 * @param knots - Узловой вектор
 * @param weights - Веса (пустой массив = равные веса)
 * @param segments - Количество выходных сегментов
 * @returns Массив точек на сплайне
 */
export function tessellateSpline(
  degree: number,
  controlPoints: readonly Point3D[],
  knots: readonly number[],
  weights: readonly number[],
  segments: number,
): Point3D[] {
  const n = controlPoints.length;
  if (n === 0) return [];
  if (n === 1) return [controlPoints[0]!];

  // Если нет узлового вектора — генерируем uniform
  let knotVector = knots;
  if (knotVector.length === 0) {
    knotVector = generateUniformKnots(n, degree);
  }

  // Если нет весов — все единицы
  const w = weights.length === n ? weights : new Array(n).fill(1);

  const uMin = knotVector[degree]!;
  const uMax = knotVector[n]!;
  if (Math.abs(uMax - uMin) < EPSILON) return [controlPoints[0]!];

  const points: Point3D[] = [];
  const numPts = Math.max(2, segments);

  for (let s = 0; s <= numPts; s++) {
    let u = uMin + (s / numPts) * (uMax - uMin);
    // Последняя точка: чуть меньше uMax чтобы basis function работала
    if (s === numPts) u = uMax - EPSILON;

    let sumX = 0, sumY = 0, sumZ = 0, sumW = 0;
    for (let i = 0; i < n; i++) {
      const basis = basisFunction(i, degree, u, knotVector);
      const bw = basis * w[i]!;
      sumX += bw * controlPoints[i]!.x;
      sumY += bw * controlPoints[i]!.y;
      sumZ += bw * controlPoints[i]!.z;
      sumW += bw;
    }

    if (Math.abs(sumW) > EPSILON) {
      points.push({ x: sumX / sumW, y: sumY / sumW, z: sumZ / sumW });
    }
  }

  return points;
}

/**
 * Генерирует uniform узловой вектор.
 */
function generateUniformKnots(numControlPoints: number, degree: number): number[] {
  const numKnots = numControlPoints + degree + 1;
  const knots: number[] = [];
  for (let i = 0; i < numKnots; i++) {
    if (i <= degree) {
      knots.push(0);
    } else if (i >= numKnots - degree - 1) {
      knots.push(1);
    } else {
      knots.push((i - degree) / (numKnots - 2 * degree - 1));
    }
  }
  return knots;
}

// ─── Bulge (LWPOLYLINE) ────────────────────────────────────────────

/**
 * Тесселяция bulge-сегмента между двумя 2D точками.
 * Bulge = tan(θ/4), где θ — центральный угол дуги.
 * Положительный bulge = дуга против часовой стрелки.
 * @param p1 - Начальная точка
 * @param p2 - Конечная точка
 * @param bulge - Значение bulge
 * @param segments - Количество сегментов
 * @returns Массив промежуточных 2D точек (без p1 и p2)
 */
export function tessellateBulge(
  p1: Point2D,
  p2: Point2D,
  bulge: number,
  segments: number,
): Point2D[] {
  if (Math.abs(bulge) < EPSILON) return [];

  const dx = p2.x - p1.x;
  const dy = p2.y - p1.y;
  const chord = Math.sqrt(dx * dx + dy * dy);
  if (chord < EPSILON) return [];

  // Центральный угол
  const theta = 4 * Math.atan(Math.abs(bulge));
  const radius = chord / (2 * Math.sin(theta / 2));

  // Середина хорды
  const mx = (p1.x + p2.x) / 2;
  const my = (p1.y + p2.y) / 2;

  // Нормаль к хорде (единичная)
  const nx = -dy / chord;
  const ny = dx / chord;

  // Расстояние от середины хорды до центра
  const sagitta = radius * (1 - Math.cos(theta / 2));
  const d = radius - sagitta;
  const sign = bulge > 0 ? 1 : -1;

  // Центр дуги
  const cx = mx + sign * d * nx;
  const cy = my + sign * d * ny;

  // Начальный и конечный углы
  const startAngle = Math.atan2(p1.y - cy, p1.x - cx);
  let endAngle = Math.atan2(p2.y - cy, p2.x - cx);

  // Направление обхода
  let sweep = endAngle - startAngle;
  if (bulge > 0) {
    if (sweep < 0) sweep += Math.PI * 2;
  } else {
    if (sweep > 0) sweep -= Math.PI * 2;
  }

  const n = Math.max(1, Math.ceil(segments * Math.abs(sweep) / (Math.PI * 2)));
  const points: Point2D[] = [];

  for (let i = 1; i < n; i++) {
    const t = i / n;
    const angle = startAngle + sweep * t;
    points.push({
      x: cx + radius * Math.cos(angle),
      y: cy + radius * Math.sin(angle),
    });
  }

  return points;
}

/**
 * Тесселяция LWPOLYLINE с учётом bulge.
 * @param vertices - Вершины полилинии
 * @param bulges - Массив bulge значений (по одному на вершину)
 * @param closed - Замкнутая ли полилиния
 * @param segments - Сегменты на дугу
 * @returns Массив 2D точек
 */
export function tessellateLWPolyline(
  vertices: readonly Point2D[],
  bulges: readonly number[] | undefined,
  closed: boolean,
  segments: number,
): Point2D[] {
  if (vertices.length === 0) return [];
  if (vertices.length === 1) return [{ x: vertices[0]!.x, y: vertices[0]!.y }];

  const result: Point2D[] = [];
  const count = closed ? vertices.length : vertices.length - 1;

  for (let i = 0; i < count; i++) {
    const p1 = vertices[i]!;
    const p2 = vertices[(i + 1) % vertices.length]!;
    const bulge = bulges?.[i] ?? 0;

    result.push({ x: p1.x, y: p1.y });

    if (Math.abs(bulge) > EPSILON) {
      const arcPts = tessellateBulge(p1, p2, bulge, segments);
      result.push(...arcPts);
    }
  }

  // Добавляем последнюю точку если не замкнута
  if (!closed) {
    const last = vertices[vertices.length - 1]!;
    result.push({ x: last.x, y: last.y });
  }

  return result;
}
