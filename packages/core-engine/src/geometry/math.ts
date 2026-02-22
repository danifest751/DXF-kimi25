/**
 * @module core/geometry/math
 * Базовая математика: операции с векторами, точками, матрицами 4x4.
 */

import type { Point2D, Point3D, Vector3D, Matrix4x4 } from '../types/index.js';

// ─── Константы ──────────────────────────────────────────────────────

export const EPSILON = 1e-9;
export const DEG2RAD = Math.PI / 180;
export const RAD2DEG = 180 / Math.PI;

// ─── Point2D ────────────────────────────────────────────────────────

export function pt2(x: number, y: number): Point2D {
  return { x, y };
}

export function addPt2(a: Point2D, b: Point2D): Point2D {
  return { x: a.x + b.x, y: a.y + b.y };
}

export function subPt2(a: Point2D, b: Point2D): Point2D {
  return { x: a.x - b.x, y: a.y - b.y };
}

export function scalePt2(p: Point2D, s: number): Point2D {
  return { x: p.x * s, y: p.y * s };
}

export function distPt2(a: Point2D, b: Point2D): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.sqrt(dx * dx + dy * dy);
}

export function lenPt2(p: Point2D): number {
  return Math.sqrt(p.x * p.x + p.y * p.y);
}

// ─── Point3D ────────────────────────────────────────────────────────

export function pt3(x: number, y: number, z: number): Point3D {
  return { x, y, z };
}

export function addPt3(a: Point3D, b: Point3D): Point3D {
  return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z };
}

export function subPt3(a: Point3D, b: Point3D): Point3D {
  return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
}

export function scalePt3(p: Point3D, s: number): Point3D {
  return { x: p.x * s, y: p.y * s, z: p.z * s };
}

export function distPt3(a: Point3D, b: Point3D): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  const dz = a.z - b.z;
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

export function lenPt3(p: Point3D): number {
  return Math.sqrt(p.x * p.x + p.y * p.y + p.z * p.z);
}

export function normalizePt3(p: Point3D): Point3D {
  const l = lenPt3(p);
  if (l < EPSILON) return { x: 0, y: 0, z: 0 };
  return { x: p.x / l, y: p.y / l, z: p.z / l };
}

export function dotPt3(a: Point3D, b: Point3D): number {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

export function crossPt3(a: Point3D, b: Point3D): Point3D {
  return {
    x: a.y * b.z - a.z * b.y,
    y: a.z * b.x - a.x * b.z,
    z: a.x * b.y - a.y * b.x,
  };
}

// ─── Vector3D ───────────────────────────────────────────────────────

export function vec3(dx: number, dy: number, dz: number): Vector3D {
  return { dx, dy, dz };
}

export function vec3ToPoint(v: Vector3D): Point3D {
  return { x: v.dx, y: v.dy, z: v.dz };
}

export function pointToVec3(p: Point3D): Vector3D {
  return { dx: p.x, dy: p.y, dz: p.z };
}

export function lenVec3(v: Vector3D): number {
  return Math.sqrt(v.dx * v.dx + v.dy * v.dy + v.dz * v.dz);
}

export function normalizeVec3(v: Vector3D): Vector3D {
  const l = lenVec3(v);
  if (l < EPSILON) return { dx: 0, dy: 0, dz: 0 };
  return { dx: v.dx / l, dy: v.dy / l, dz: v.dz / l };
}

// ─── Matrix4x4 (column-major) ──────────────────────────────────────

export const IDENTITY_MATRIX: Matrix4x4 = [
  1, 0, 0, 0,
  0, 1, 0, 0,
  0, 0, 1, 0,
  0, 0, 0, 1,
];

export function mat4Translation(tx: number, ty: number, tz: number): Matrix4x4 {
  return [
    1, 0, 0, 0,
    0, 1, 0, 0,
    0, 0, 1, 0,
    tx, ty, tz, 1,
  ];
}

export function mat4Scale(sx: number, sy: number, sz: number): Matrix4x4 {
  return [
    sx, 0, 0, 0,
    0, sy, 0, 0,
    0, 0, sz, 0,
    0, 0, 0, 1,
  ];
}

export function mat4RotationZ(radians: number): Matrix4x4 {
  const c = Math.cos(radians);
  const s = Math.sin(radians);
  return [
    c, s, 0, 0,
    -s, c, 0, 0,
    0, 0, 1, 0,
    0, 0, 0, 1,
  ];
}

export function mat4Multiply(a: Matrix4x4, b: Matrix4x4): Matrix4x4 {
  const r = new Array<number>(16);
  for (let col = 0; col < 4; col++) {
    for (let row = 0; row < 4; row++) {
      let sum = 0;
      for (let k = 0; k < 4; k++) {
        sum += a[k * 4 + row]! * b[col * 4 + k]!;
      }
      r[col * 4 + row] = sum;
    }
  }
  return r as unknown as Matrix4x4;
}

export function mat4TransformPoint(m: Matrix4x4, p: Point3D): Point3D {
  return {
    x: m[0]! * p.x + m[4]! * p.y + m[8]! * p.z + m[12]!,
    y: m[1]! * p.x + m[5]! * p.y + m[9]! * p.z + m[13]!,
    z: m[2]! * p.x + m[6]! * p.y + m[10]! * p.z + m[14]!,
  };
}

/**
 * Строит матрицу трансформации для INSERT:
 * translate(position) * rotateZ(rotation) * scale(sx, sy, sz) * translate(-basePoint)
 */
export function buildInsertMatrix(
  position: Point3D,
  rotation: number,
  scaleX: number,
  scaleY: number,
  scaleZ: number,
  basePoint: Point3D,
): Matrix4x4 {
  const t1 = mat4Translation(-basePoint.x, -basePoint.y, -basePoint.z);
  const s = mat4Scale(scaleX, scaleY, scaleZ);
  const r = mat4RotationZ(rotation * DEG2RAD);
  const t2 = mat4Translation(position.x, position.y, position.z);
  return mat4Multiply(t2, mat4Multiply(r, mat4Multiply(s, t1)));
}

/**
 * Вычисляет OCS→WCS матрицу по вектору нормали (Arbitrary Axis Algorithm).
 * Используется для преобразования координат сущностей с extrusion direction.
 */
export function ocsToWcsMatrix(normal: Vector3D): Matrix4x4 {
  const n = normalizeVec3(normal);
  const nPt = vec3ToPoint(n);

  // Arbitrary Axis Algorithm (DXF spec)
  let ax: Point3D;
  if (Math.abs(nPt.x) < 1 / 64 && Math.abs(nPt.y) < 1 / 64) {
    ax = normalizePt3(crossPt3({ x: 0, y: 1, z: 0 }, nPt));
  } else {
    ax = normalizePt3(crossPt3({ x: 0, y: 0, z: 1 }, nPt));
  }
  const ay = normalizePt3(crossPt3(nPt, ax));

  return [
    ax.x, ax.y, ax.z, 0,
    ay.x, ay.y, ay.z, 0,
    nPt.x, nPt.y, nPt.z, 0,
    0, 0, 0, 1,
  ];
}

/**
 * Нормализует угол в диапазон [0, 2π).
 */
export function normalizeAngle(angle: number): number {
  const TWO_PI = Math.PI * 2;
  let a = angle % TWO_PI;
  if (a < 0) a += TWO_PI;
  return a;
}

/**
 * Линейная интерполяция.
 */
export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/**
 * Линейная интерполяция 3D точек.
 */
export function lerpPt3(a: Point3D, b: Point3D, t: number): Point3D {
  return {
    x: lerp(a.x, b.x, t),
    y: lerp(a.y, b.y, t),
    z: lerp(a.z, b.z, t),
  };
}

/**
 * Clamp значения в диапазон [min, max].
 */
export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
