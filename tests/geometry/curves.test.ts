import { describe, it, expect, beforeEach, afterEach, beforeAll, afterAll } from 'vitest';
import {
  tessellateArc,
  tessellateCircle,
  tessellateEllipse,
  tessellateSpline,
  tessellateBulge,
  tessellateLWPolyline,
} from '../../packages/core-engine/src/geometry/curves.js';

describe('tessellateArc', () => {
  it('returns correct number of points', () => {
    const pts = tessellateArc({ x: 0, y: 0, z: 0 }, 10, 0, 90, 32);
    // 90° = 1/4 окружности, ~8 сегментов + 1
    expect(pts.length).toBeGreaterThanOrEqual(3);
    expect(pts.length).toBeLessThanOrEqual(33);
  });

  it('first and last points are on the arc', () => {
    const pts = tessellateArc({ x: 0, y: 0, z: 0 }, 10, 0, 90, 64);
    // Первая точка: (10, 0)
    expect(pts[0]!.x).toBeCloseTo(10, 3);
    expect(pts[0]!.y).toBeCloseTo(0, 3);
    // Последняя точка: (0, 10)
    const last = pts[pts.length - 1]!;
    expect(last.x).toBeCloseTo(0, 3);
    expect(last.y).toBeCloseTo(10, 3);
  });

  it('handles wrap-around (endAngle < startAngle)', () => {
    const pts = tessellateArc({ x: 0, y: 0, z: 0 }, 5, 350, 10, 32);
    expect(pts.length).toBeGreaterThanOrEqual(2);
    // Все точки на расстоянии radius от центра
    for (const p of pts) {
      const d = Math.sqrt(p.x * p.x + p.y * p.y);
      expect(d).toBeCloseTo(5, 2);
    }
  });

  it('preserves z coordinate', () => {
    const pts = tessellateArc({ x: 0, y: 0, z: 5 }, 10, 0, 180, 16);
    for (const p of pts) {
      expect(p.z).toBe(5);
    }
  });
});

describe('tessellateCircle', () => {
  it('returns segments+1 points', () => {
    const pts = tessellateCircle({ x: 0, y: 0, z: 0 }, 10, 32);
    expect(pts.length).toBe(33);
  });

  it('first and last points coincide (closed)', () => {
    const pts = tessellateCircle({ x: 0, y: 0, z: 0 }, 10, 32);
    expect(pts[0]!.x).toBeCloseTo(pts[pts.length - 1]!.x, 5);
    expect(pts[0]!.y).toBeCloseTo(pts[pts.length - 1]!.y, 5);
  });

  it('all points are at radius distance from center', () => {
    const center = { x: 5, y: 5, z: 0 };
    const pts = tessellateCircle(center, 7, 64);
    for (const p of pts) {
      const d = Math.sqrt((p.x - center.x) ** 2 + (p.y - center.y) ** 2);
      expect(d).toBeCloseTo(7, 5);
    }
  });
});

describe('tessellateEllipse', () => {
  it('returns correct number of points for full ellipse', () => {
    const pts = tessellateEllipse(
      { x: 0, y: 0, z: 0 },
      { dx: 10, dy: 0, dz: 0 },
      0.5,
      0, Math.PI * 2,
      32,
    );
    expect(pts.length).toBe(33);
  });

  it('points lie on the ellipse', () => {
    const a = 10;
    const ratio = 0.5;
    const b = a * ratio;
    const pts = tessellateEllipse(
      { x: 0, y: 0, z: 0 },
      { dx: a, dy: 0, dz: 0 },
      ratio,
      0, Math.PI * 2,
      64,
    );
    for (const p of pts) {
      // Ellipse equation: (x/a)^2 + (y/b)^2 ≈ 1
      const val = (p.x / a) ** 2 + (p.y / b) ** 2;
      expect(val).toBeCloseTo(1, 2);
    }
  });

  it('handles partial ellipse arc', () => {
    const pts = tessellateEllipse(
      { x: 0, y: 0, z: 0 },
      { dx: 10, dy: 0, dz: 0 },
      0.5,
      0, Math.PI,
      32,
    );
    expect(pts.length).toBeGreaterThanOrEqual(3);
    // Все точки в верхней полуплоскости (y >= -epsilon)
    for (const p of pts) {
      expect(p.y).toBeGreaterThanOrEqual(-0.1);
    }
  });
});

describe('tessellateSpline', () => {
  it('returns points for a simple cubic spline', () => {
    const controlPoints = [
      { x: 0, y: 0, z: 0 },
      { x: 1, y: 2, z: 0 },
      { x: 3, y: 2, z: 0 },
      { x: 4, y: 0, z: 0 },
    ];
    const pts = tessellateSpline(3, controlPoints, [], [], 32);
    expect(pts.length).toBeGreaterThanOrEqual(2);
  });

  it('returns single point for single control point', () => {
    const pts = tessellateSpline(3, [{ x: 5, y: 5, z: 0 }], [], [], 32);
    expect(pts.length).toBe(1);
    expect(pts[0]).toEqual({ x: 5, y: 5, z: 0 });
  });

  it('returns empty for no control points', () => {
    const pts = tessellateSpline(3, [], [], [], 32);
    expect(pts.length).toBe(0);
  });

  it('spline passes near control points', () => {
    const controlPoints = [
      { x: 0, y: 0, z: 0 },
      { x: 5, y: 5, z: 0 },
      { x: 10, y: 0, z: 0 },
    ];
    const pts = tessellateSpline(2, controlPoints, [], [], 64);
    // Первая точка ≈ первая контрольная
    expect(pts[0]!.x).toBeCloseTo(0, 1);
    expect(pts[0]!.y).toBeCloseTo(0, 1);
  });
});

describe('tessellateBulge', () => {
  it('returns empty for zero bulge', () => {
    const pts = tessellateBulge({ x: 0, y: 0 }, { x: 10, y: 0 }, 0, 32);
    expect(pts.length).toBe(0);
  });

  it('returns arc points for non-zero bulge', () => {
    const pts = tessellateBulge({ x: 0, y: 0 }, { x: 10, y: 0 }, 1, 32);
    expect(pts.length).toBeGreaterThan(0);
    // Bulge=1 → полукруг, все точки на расстоянии radius=5 от центра (5,?)
    // Точки должны отклоняться от прямой линии
    const maxAbsY = Math.max(...pts.map(p => Math.abs(p.y)));
    expect(maxAbsY).toBeGreaterThan(1);
  });

  it('negative bulge produces arc in opposite direction', () => {
    const ptsPos = tessellateBulge({ x: 0, y: 0 }, { x: 10, y: 0 }, 1, 32);
    const ptsNeg = tessellateBulge({ x: 0, y: 0 }, { x: 10, y: 0 }, -1, 32);
    expect(ptsNeg.length).toBeGreaterThan(0);
    // Положительный и отрицательный bulge дают дуги в противоположных направлениях
    const avgYPos = ptsPos.reduce((s, p) => s + p.y, 0) / ptsPos.length;
    const avgYNeg = ptsNeg.reduce((s, p) => s + p.y, 0) / ptsNeg.length;
    expect(avgYPos * avgYNeg).toBeLessThan(0); // разные знаки
  });
});

describe('tessellateLWPolyline', () => {
  it('returns vertices for straight polyline', () => {
    const vertices = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }];
    const pts = tessellateLWPolyline(vertices, undefined, false, 32);
    expect(pts.length).toBe(3);
    expect(pts[0]).toEqual({ x: 0, y: 0 });
    expect(pts[2]).toEqual({ x: 10, y: 10 });
  });

  it('handles closed polyline', () => {
    const vertices = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }];
    const pts = tessellateLWPolyline(vertices, undefined, true, 32);
    // Closed: 3 вершины, без последней (она замыкается)
    expect(pts.length).toBe(3);
  });

  it('handles bulge segments', () => {
    const vertices = [{ x: 0, y: 0 }, { x: 10, y: 0 }];
    const bulges = [1, 0]; // Полукруг на первом сегменте
    const pts = tessellateLWPolyline(vertices, bulges, false, 32);
    expect(pts.length).toBeGreaterThan(2);
  });

  it('returns empty for empty input', () => {
    const pts = tessellateLWPolyline([], undefined, false, 32);
    expect(pts.length).toBe(0);
  });

  it('returns single point for single vertex', () => {
    const pts = tessellateLWPolyline([{ x: 5, y: 5 }], undefined, false, 32);
    expect(pts.length).toBe(1);
  });
});

