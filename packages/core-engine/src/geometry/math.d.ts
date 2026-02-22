/**
 * @module core/geometry/math
 * Базовая математика: операции с векторами, точками, матрицами 4x4.
 */
import type { Point2D, Point3D, Vector3D, Matrix4x4 } from '../types/index.js';
export declare const EPSILON = 1e-9;
export declare const DEG2RAD: number;
export declare const RAD2DEG: number;
export declare function pt2(x: number, y: number): Point2D;
export declare function addPt2(a: Point2D, b: Point2D): Point2D;
export declare function subPt2(a: Point2D, b: Point2D): Point2D;
export declare function scalePt2(p: Point2D, s: number): Point2D;
export declare function distPt2(a: Point2D, b: Point2D): number;
export declare function lenPt2(p: Point2D): number;
export declare function pt3(x: number, y: number, z: number): Point3D;
export declare function addPt3(a: Point3D, b: Point3D): Point3D;
export declare function subPt3(a: Point3D, b: Point3D): Point3D;
export declare function scalePt3(p: Point3D, s: number): Point3D;
export declare function distPt3(a: Point3D, b: Point3D): number;
export declare function lenPt3(p: Point3D): number;
export declare function normalizePt3(p: Point3D): Point3D;
export declare function dotPt3(a: Point3D, b: Point3D): number;
export declare function crossPt3(a: Point3D, b: Point3D): Point3D;
export declare function vec3(dx: number, dy: number, dz: number): Vector3D;
export declare function vec3ToPoint(v: Vector3D): Point3D;
export declare function pointToVec3(p: Point3D): Vector3D;
export declare function lenVec3(v: Vector3D): number;
export declare function normalizeVec3(v: Vector3D): Vector3D;
export declare const IDENTITY_MATRIX: Matrix4x4;
export declare function mat4Translation(tx: number, ty: number, tz: number): Matrix4x4;
export declare function mat4Scale(sx: number, sy: number, sz: number): Matrix4x4;
export declare function mat4RotationZ(radians: number): Matrix4x4;
export declare function mat4Multiply(a: Matrix4x4, b: Matrix4x4): Matrix4x4;
export declare function mat4TransformPoint(m: Matrix4x4, p: Point3D): Point3D;
/**
 * Строит матрицу трансформации для INSERT:
 * translate(position) * rotateZ(rotation) * scale(sx, sy, sz) * translate(-basePoint)
 */
export declare function buildInsertMatrix(position: Point3D, rotation: number, scaleX: number, scaleY: number, scaleZ: number, basePoint: Point3D): Matrix4x4;
/**
 * Вычисляет OCS→WCS матрицу по вектору нормали (Arbitrary Axis Algorithm).
 * Используется для преобразования координат сущностей с extrusion direction.
 */
export declare function ocsToWcsMatrix(normal: Vector3D): Matrix4x4;
/**
 * Нормализует угол в диапазон [0, 2π).
 */
export declare function normalizeAngle(angle: number): number;
/**
 * Линейная интерполяция.
 */
export declare function lerp(a: number, b: number, t: number): number;
/**
 * Линейная интерполяция 3D точек.
 */
export declare function lerpPt3(a: Point3D, b: Point3D, t: number): Point3D;
/**
 * Clamp значения в диапазон [min, max].
 */
export declare function clamp(value: number, min: number, max: number): number;
//# sourceMappingURL=math.d.ts.map