import { describe, it, expect, beforeEach, afterEach, beforeAll, afterAll } from 'vitest';
import {
  pt2, addPt2, subPt2, scalePt2, distPt2, lenPt2,
  pt3, addPt3, subPt3, scalePt3, distPt3, lenPt3,
  normalizePt3, dotPt3, crossPt3,
  vec3, lenVec3, normalizeVec3,
  IDENTITY_MATRIX,
  mat4Translation, mat4Scale, mat4RotationZ,
  mat4Multiply, mat4TransformPoint,
  buildInsertMatrix, ocsToWcsMatrix,
  normalizeAngle, lerp, lerpPt3, clamp,
  DEG2RAD, RAD2DEG, EPSILON,
} from '../../packages/core-engine/src/geometry/math.js';

describe('Point2D operations', () => {
  it('pt2 creates a 2D point', () => {
    const p = pt2(3, 4);
    expect(p.x).toBe(3);
    expect(p.y).toBe(4);
  });

  it('addPt2 adds two points', () => {
    const r = addPt2(pt2(1, 2), pt2(3, 4));
    expect(r.x).toBe(4);
    expect(r.y).toBe(6);
  });

  it('subPt2 subtracts two points', () => {
    const r = subPt2(pt2(5, 7), pt2(2, 3));
    expect(r.x).toBe(3);
    expect(r.y).toBe(4);
  });

  it('scalePt2 scales a point', () => {
    const r = scalePt2(pt2(3, 4), 2);
    expect(r.x).toBe(6);
    expect(r.y).toBe(8);
  });

  it('distPt2 computes distance', () => {
    expect(distPt2(pt2(0, 0), pt2(3, 4))).toBeCloseTo(5);
  });

  it('lenPt2 computes length', () => {
    expect(lenPt2(pt2(3, 4))).toBeCloseTo(5);
  });
});

describe('Point3D operations', () => {
  it('pt3 creates a 3D point', () => {
    const p = pt3(1, 2, 3);
    expect(p).toEqual({ x: 1, y: 2, z: 3 });
  });

  it('addPt3/subPt3/scalePt3', () => {
    const a = pt3(1, 2, 3);
    const b = pt3(4, 5, 6);
    expect(addPt3(a, b)).toEqual({ x: 5, y: 7, z: 9 });
    expect(subPt3(b, a)).toEqual({ x: 3, y: 3, z: 3 });
    expect(scalePt3(a, 2)).toEqual({ x: 2, y: 4, z: 6 });
  });

  it('distPt3 computes 3D distance', () => {
    expect(distPt3(pt3(0, 0, 0), pt3(1, 2, 2))).toBeCloseTo(3);
  });

  it('lenPt3 computes 3D length', () => {
    expect(lenPt3(pt3(1, 2, 2))).toBeCloseTo(3);
  });

  it('normalizePt3 normalizes a vector', () => {
    const n = normalizePt3(pt3(0, 0, 5));
    expect(n.x).toBeCloseTo(0);
    expect(n.y).toBeCloseTo(0);
    expect(n.z).toBeCloseTo(1);
  });

  it('normalizePt3 handles zero vector', () => {
    const n = normalizePt3(pt3(0, 0, 0));
    expect(n).toEqual({ x: 0, y: 0, z: 0 });
  });

  it('dotPt3 computes dot product', () => {
    expect(dotPt3(pt3(1, 0, 0), pt3(0, 1, 0))).toBe(0);
    expect(dotPt3(pt3(1, 2, 3), pt3(4, 5, 6))).toBe(32);
  });

  it('crossPt3 computes cross product', () => {
    const c = crossPt3(pt3(1, 0, 0), pt3(0, 1, 0));
    expect(c).toEqual({ x: 0, y: 0, z: 1 });
  });
});

describe('Vector3D operations', () => {
  it('vec3 creates a vector', () => {
    expect(vec3(1, 2, 3)).toEqual({ dx: 1, dy: 2, dz: 3 });
  });

  it('lenVec3 computes length', () => {
    expect(lenVec3(vec3(3, 4, 0))).toBeCloseTo(5);
  });

  it('normalizeVec3 normalizes', () => {
    const n = normalizeVec3(vec3(0, 0, 10));
    expect(n.dx).toBeCloseTo(0);
    expect(n.dy).toBeCloseTo(0);
    expect(n.dz).toBeCloseTo(1);
  });
});

describe('Matrix4x4 operations', () => {
  it('IDENTITY_MATRIX does not change point', () => {
    const p = mat4TransformPoint(IDENTITY_MATRIX, pt3(5, 10, 15));
    expect(p).toEqual({ x: 5, y: 10, z: 15 });
  });

  it('mat4Translation translates point', () => {
    const m = mat4Translation(10, 20, 30);
    const p = mat4TransformPoint(m, pt3(1, 2, 3));
    expect(p.x).toBeCloseTo(11);
    expect(p.y).toBeCloseTo(22);
    expect(p.z).toBeCloseTo(33);
  });

  it('mat4Scale scales point', () => {
    const m = mat4Scale(2, 3, 4);
    const p = mat4TransformPoint(m, pt3(1, 1, 1));
    expect(p).toEqual({ x: 2, y: 3, z: 4 });
  });

  it('mat4RotationZ rotates 90 degrees', () => {
    const m = mat4RotationZ(Math.PI / 2);
    const p = mat4TransformPoint(m, pt3(1, 0, 0));
    expect(p.x).toBeCloseTo(0);
    expect(p.y).toBeCloseTo(1);
    expect(p.z).toBeCloseTo(0);
  });

  it('mat4Multiply combines transforms', () => {
    const t = mat4Translation(5, 0, 0);
    const s = mat4Scale(2, 2, 2);
    const m = mat4Multiply(t, s);
    const p = mat4TransformPoint(m, pt3(1, 0, 0));
    expect(p.x).toBeCloseTo(7); // 1*2 + 5
    expect(p.y).toBeCloseTo(0);
  });

  it('buildInsertMatrix applies translation, rotation, scale', () => {
    const m = buildInsertMatrix(
      pt3(10, 20, 0), // position
      0,               // rotation
      2, 2, 1,         // scale
      pt3(0, 0, 0),    // basePoint
    );
    const p = mat4TransformPoint(m, pt3(5, 5, 0));
    expect(p.x).toBeCloseTo(20); // 5*2 + 10
    expect(p.y).toBeCloseTo(30); // 5*2 + 20
  });

  it('ocsToWcsMatrix returns identity-like for Z normal', () => {
    const m = ocsToWcsMatrix(vec3(0, 0, 1));
    const p = mat4TransformPoint(m, pt3(1, 0, 0));
    // X axis should map to X
    expect(p.x).toBeCloseTo(1, 4);
    expect(p.y).toBeCloseTo(0, 4);
    expect(p.z).toBeCloseTo(0, 4);
  });
});

describe('Utility functions', () => {
  it('normalizeAngle wraps negative angles', () => {
    expect(normalizeAngle(-Math.PI / 2)).toBeCloseTo(3 * Math.PI / 2);
  });

  it('normalizeAngle wraps large angles', () => {
    expect(normalizeAngle(5 * Math.PI)).toBeCloseTo(Math.PI);
  });

  it('lerp interpolates', () => {
    expect(lerp(0, 10, 0.5)).toBe(5);
    expect(lerp(0, 10, 0)).toBe(0);
    expect(lerp(0, 10, 1)).toBe(10);
  });

  it('lerpPt3 interpolates 3D points', () => {
    const r = lerpPt3(pt3(0, 0, 0), pt3(10, 20, 30), 0.5);
    expect(r).toEqual({ x: 5, y: 10, z: 15 });
  });

  it('clamp clamps values', () => {
    expect(clamp(5, 0, 10)).toBe(5);
    expect(clamp(-1, 0, 10)).toBe(0);
    expect(clamp(15, 0, 10)).toBe(10);
  });

  it('DEG2RAD and RAD2DEG are inverses', () => {
    expect(180 * DEG2RAD).toBeCloseTo(Math.PI);
    expect(Math.PI * RAD2DEG).toBeCloseTo(180);
  });
});

