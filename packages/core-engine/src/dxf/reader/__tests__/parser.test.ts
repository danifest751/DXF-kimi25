/**
 * @file parser.test.ts
 * Тесты парсера DXF сущностей: POLYLINE+VERTEX, HATCH boundaries,
 * SPLINE fitPoints, LWPOLYLINE bulge bbox, ACI цвета.
 */

import { describe, it, expect } from 'vitest';
import type { DXFGroup } from '../../../types/index.js';
import { DXFEntityType } from '../../../types/index.js';
import { parseEntitiesSection, aciToColor } from '../entity-parser.js';
import type {
  DXFPolylineEntity,
  DXFHatchEntity,
  DXFSplineEntity,
  DXFLWPolylineEntity,
} from '../../../types/index.js';
import { computeEntityBBox } from '../../../geometry/bbox.js';
import { tessellateLWPolyline } from '../../../geometry/curves.js';

// ─── Хелпер: строим DXFGroup[] из пар [code, value] ─────────────────

function g(code: number, value: string | number): DXFGroup {
  return { code, value };
}

// ─── POLYLINE + VERTEX + SEQEND ──────────────────────────────────────

describe('POLYLINE + VERTEX + SEQEND (R12)', () => {
  const groups: DXFGroup[] = [
    // POLYLINE header
    g(0, 'POLYLINE'),
    g(5, 'A1'),
    g(8, '0'),
    g(70, 0),  // open, 2D
    // VERTEX 1
    g(0, 'VERTEX'),
    g(8, '0'),
    g(10, 10), g(20, 20), g(30, 0),
    // VERTEX 2
    g(0, 'VERTEX'),
    g(8, '0'),
    g(10, 30), g(20, 40), g(30, 0),
    // VERTEX 3
    g(0, 'VERTEX'),
    g(8, '0'),
    g(10, 50), g(20, 20), g(30, 0),
    // SEQEND
    g(0, 'SEQEND'),
    g(8, '0'),
  ];

  it('should parse one POLYLINE entity', () => {
    const entities = parseEntitiesSection(groups);
    expect(entities).toHaveLength(1);
    expect(entities[0]!.type).toBe(DXFEntityType.POLYLINE);
  });

  it('should collect all 3 vertices', () => {
    const entities = parseEntitiesSection(groups);
    const poly = entities[0] as DXFPolylineEntity;
    expect(poly.vertices).toHaveLength(3);
  });

  it('should read vertex coordinates correctly', () => {
    const entities = parseEntitiesSection(groups);
    const poly = entities[0] as DXFPolylineEntity;
    expect(poly.vertices[0]).toEqual({ x: 10, y: 20, z: 0 });
    expect(poly.vertices[1]).toEqual({ x: 30, y: 40, z: 0 });
    expect(poly.vertices[2]).toEqual({ x: 50, y: 20, z: 0 });
  });

  it('should parse closed POLYLINE flag', () => {
    const closedGroups: DXFGroup[] = [
      g(0, 'POLYLINE'), g(5, 'B1'), g(8, '0'), g(70, 1), // closed
      g(0, 'VERTEX'), g(8, '0'), g(10, 0), g(20, 0), g(30, 0),
      g(0, 'VERTEX'), g(8, '0'), g(10, 10), g(20, 10), g(30, 0),
      g(0, 'SEQEND'), g(8, '0'),
    ];
    const entities = parseEntitiesSection(closedGroups);
    const poly = entities[0] as DXFPolylineEntity;
    expect(poly.closed).toBe(true);
  });

  it('SEQEND does not appear as a standalone entity', () => {
    const entities = parseEntitiesSection(groups);
    const seqend = entities.find(e => (e as unknown as { type: string }).type === 'SEQEND');
    expect(seqend).toBeUndefined();
  });

  it('VERTEX does not appear as a standalone entity', () => {
    const entities = parseEntitiesSection(groups);
    const vertex = entities.find(e => (e as unknown as { type: string }).type === 'VERTEX');
    expect(vertex).toBeUndefined();
  });

  it('handles multiple POLYLINE entities in sequence', () => {
    const multi: DXFGroup[] = [
      g(0, 'POLYLINE'), g(5, 'C1'), g(8, '0'), g(70, 0),
      g(0, 'VERTEX'), g(8, '0'), g(10, 1), g(20, 2), g(30, 0),
      g(0, 'SEQEND'), g(8, '0'),
      g(0, 'POLYLINE'), g(5, 'C2'), g(8, '0'), g(70, 0),
      g(0, 'VERTEX'), g(8, '0'), g(10, 5), g(20, 6), g(30, 0),
      g(0, 'VERTEX'), g(8, '0'), g(10, 7), g(20, 8), g(30, 0),
      g(0, 'SEQEND'), g(8, '0'),
    ];
    const entities = parseEntitiesSection(multi);
    expect(entities).toHaveLength(2);
    const p1 = entities[0] as DXFPolylineEntity;
    const p2 = entities[1] as DXFPolylineEntity;
    expect(p1.vertices).toHaveLength(1);
    expect(p2.vertices).toHaveLength(2);
  });
});

// ─── HATCH boundary loops ────────────────────────────────────────────

describe('HATCH boundary parser', () => {
  it('parses simple rectangular LINE boundary (edge-based)', () => {
    // HATCH с одним loop, 4 LINE рёбра — квадрат 0,0 → 10,10
    const groups: DXFGroup[] = [
      g(0, 'HATCH'),
      g(5, 'H1'), g(8, '0'),
      g(2, 'SOLID'),    // pattern name
      g(70, 1),         // solid fill
      g(91, 1),         // 1 boundary loop
      // loop 1
      g(92, 1),         // loopType = 1 (edge-based)
      g(93, 4),         // 4 edges
      // edge 1: LINE (0,0)→(10,0)
      g(72, 1), g(10, 0), g(20, 0), g(11, 10), g(21, 0),
      // edge 2: LINE (10,0)→(10,10)
      g(72, 1), g(10, 10), g(20, 0), g(11, 10), g(21, 10),
      // edge 3: LINE (10,10)→(0,10)
      g(72, 1), g(10, 10), g(20, 10), g(11, 0), g(21, 10),
      // edge 4: LINE (0,10)→(0,0)
      g(72, 1), g(10, 0), g(20, 10), g(11, 0), g(21, 0),
    ];
    const entities = parseEntitiesSection(groups);
    expect(entities).toHaveLength(1);
    const hatch = entities[0] as DXFHatchEntity;
    expect(hatch.type).toBe(DXFEntityType.HATCH);
    expect(hatch.boundaries).toHaveLength(1);
    // 4 edges × 2 points = 8 points
    expect(hatch.boundaries[0]!.length).toBe(8);
  });

  it('parses ARC edge boundary', () => {
    const groups: DXFGroup[] = [
      g(0, 'HATCH'),
      g(5, 'H2'), g(8, '0'),
      g(2, 'SOLID'), g(70, 1),
      g(91, 1),
      g(92, 1),   // edge-based
      g(93, 1),   // 1 edge (arc)
      // ARC: center(5,5), r=5, 0→90°, ccw=1
      g(72, 2), g(10, 5), g(20, 5), g(40, 5), g(50, 0), g(51, 90), g(73, 1),
    ];
    const entities = parseEntitiesSection(groups);
    const hatch = entities[0] as DXFHatchEntity;
    expect(hatch.boundaries).toHaveLength(1);
    // tessellateHatchArc с 16 сегментами = 17 точек
    expect(hatch.boundaries[0]!.length).toBe(17);
    // Первая точка ≈ (10, 5) — arc start at 0°, r=5, cx=5
    expect(hatch.boundaries[0]![0]!.x).toBeCloseTo(10, 1);
    expect(hatch.boundaries[0]![0]!.y).toBeCloseTo(5, 1);
  });

  it('parses polyline boundary (loopType & 2)', () => {
    const groups: DXFGroup[] = [
      g(0, 'HATCH'),
      g(5, 'H3'), g(8, '0'),
      g(2, 'ANSI31'), g(70, 0),
      g(91, 1),
      g(92, 2),   // polyline boundary
      g(93, 3),   // 3 vertices
      g(10, 0), g(20, 0),
      g(10, 10), g(20, 0),
      g(10, 5), g(20, 8),
    ];
    const entities = parseEntitiesSection(groups);
    const hatch = entities[0] as DXFHatchEntity;
    expect(hatch.boundaries).toHaveLength(1);
    expect(hatch.boundaries[0]!.length).toBe(3);
    expect(hatch.boundaries[0]![0]).toEqual({ x: 0, y: 0, z: 0 });
    expect(hatch.boundaries[0]![1]).toEqual({ x: 10, y: 0, z: 0 });
  });

  it('falls back to code-10/20 points when no boundary loop marker', () => {
    // старый формат без кода 91
    const groups: DXFGroup[] = [
      g(0, 'HATCH'),
      g(5, 'H4'), g(8, '0'),
      g(2, 'SOLID'), g(70, 1),
      g(10, 0), g(20, 0), g(30, 0),
      g(10, 10), g(20, 0), g(30, 0),
      g(10, 10), g(20, 10), g(30, 0),
    ];
    const entities = parseEntitiesSection(groups);
    const hatch = entities[0] as DXFHatchEntity;
    expect(hatch.boundaries.length).toBeGreaterThan(0);
    expect(hatch.boundaries[0]!.length).toBe(3);
  });

  it('parses solid fill flag correctly', () => {
    const groups: DXFGroup[] = [
      g(0, 'HATCH'), g(5, 'H5'), g(8, '0'),
      g(2, 'SOLID'), g(70, 1), g(91, 0),
    ];
    const entities = parseEntitiesSection(groups);
    const hatch = entities[0] as DXFHatchEntity;
    expect(hatch.solid).toBe(true);
  });
});

// ─── SPLINE fitPoints fallback ────────────────────────────────────────

describe('SPLINE fitPoints fallback', () => {
  it('uses fitPoints (11/21/31) when controlPoints are absent', () => {
    const groups: DXFGroup[] = [
      g(0, 'SPLINE'),
      g(5, 'S1'), g(8, '0'),
      g(70, 0),   // flags: no closed, no periodic
      g(71, 3),   // degree 3
      // NO code 10/20/30 (no control points)
      // fit points: code 11/21/31
      g(11, 0), g(21, 0), g(31, 0),
      g(11, 5), g(21, 5), g(31, 0),
      g(11, 10), g(21, 0), g(31, 0),
    ];
    const entities = parseEntitiesSection(groups);
    expect(entities).toHaveLength(1);
    const spline = entities[0] as DXFSplineEntity;
    expect(spline.type).toBe(DXFEntityType.SPLINE);
    expect(spline.controlPoints).toHaveLength(3);
    expect(spline.controlPoints[0]).toEqual({ x: 0, y: 0, z: 0 });
    expect(spline.controlPoints[1]).toEqual({ x: 5, y: 5, z: 0 });
    expect(spline.controlPoints[2]).toEqual({ x: 10, y: 0, z: 0 });
  });

  it('prefers controlPoints over fitPoints when both present', () => {
    const groups: DXFGroup[] = [
      g(0, 'SPLINE'),
      g(5, 'S2'), g(8, '0'),
      g(70, 0), g(71, 3),
      // control points (code 10/20/30)
      g(10, 1), g(20, 1), g(30, 0),
      g(10, 5), g(20, 9), g(30, 0),
      g(10, 9), g(20, 1), g(30, 0),
      // fit points (code 11/21/31) — should be ignored
      g(11, 99), g(21, 99), g(31, 0),
    ];
    const entities = parseEntitiesSection(groups);
    const spline = entities[0] as DXFSplineEntity;
    expect(spline.controlPoints).toHaveLength(3);
    expect(spline.controlPoints[0]).toEqual({ x: 1, y: 1, z: 0 });
  });

  it('parses closed flag from flags byte', () => {
    const groups: DXFGroup[] = [
      g(0, 'SPLINE'), g(5, 'S3'), g(8, '0'),
      g(70, 1), // closed
      g(71, 3),
      g(10, 0), g(20, 0), g(30, 0),
      g(10, 1), g(20, 1), g(30, 0),
    ];
    const entities = parseEntitiesSection(groups);
    const spline = entities[0] as DXFSplineEntity;
    expect(spline.closed).toBe(true);
    expect(spline.periodic).toBe(false);
  });

  it('parses periodic flag (bit 1)', () => {
    const groups: DXFGroup[] = [
      g(0, 'SPLINE'), g(5, 'S4'), g(8, '0'),
      g(70, 2), // periodic
      g(71, 3),
      g(10, 0), g(20, 0), g(30, 0),
    ];
    const entities = parseEntitiesSection(groups);
    const spline = entities[0] as DXFSplineEntity;
    expect(spline.closed).toBe(false);
    expect(spline.periodic).toBe(true);
  });
});

// ─── LWPOLYLINE bulge bbox ────────────────────────────────────────────

describe('LWPOLYLINE bulge bbox', () => {
  it('straight polyline bbox matches vertex bounds', () => {
    const groups: DXFGroup[] = [
      g(0, 'LWPOLYLINE'),
      g(5, 'L1'), g(8, '0'),
      g(70, 0),
      g(10, 0), g(20, 0),
      g(10, 10), g(20, 0),
      g(10, 10), g(20, 10),
    ];
    const entities = parseEntitiesSection(groups);
    const lw = entities[0] as DXFLWPolylineEntity;
    const bb = computeEntityBBox(lw);
    expect(bb).not.toBeNull();
    expect(bb!.min.x).toBeCloseTo(0);
    expect(bb!.min.y).toBeCloseTo(0);
    expect(bb!.max.x).toBeCloseTo(10);
    expect(bb!.max.y).toBeCloseTo(10);
  });

  it('tessellateLWPolyline produces arc points for bulge=1', () => {
    // Прямой тест тесселяции: (0,0)→(10,0) с bulge=1 → полукруг вверх
    const verts = [{ x: 0, y: 0 }, { x: 10, y: 0 }];
    const pts = tessellateLWPolyline(verts, [1], false, 32);
    const maxY = Math.max(...pts.map(p => p.y));
    // Должна быть точка с y ≈ 5
    expect(maxY).toBeGreaterThan(0.1);
    expect(maxY).toBeCloseTo(5, 0);
  });

  it('bulge=1 (semicircle) bbox extends beyond vertex bounds', () => {
    // Два вертекса (0,0) и (10,0), bulge=1 → полукруг вверх, центр (5,0), r=5
    // Верхняя точка = (5, 5)
    const groups: DXFGroup[] = [
      g(0, 'LWPOLYLINE'),
      g(5, 'L2'), g(8, '0'),
      g(70, 0),
      g(10, 0), g(20, 0),
      g(42, 1),           // bulge=1 (semicircle) на первом сегменте
      g(10, 10), g(20, 0),
    ];
    const entities = parseEntitiesSection(groups);
    const lw = entities[0] as DXFLWPolylineEntity;
    // bulges должен быть [1]
    expect(lw.bulges).toEqual([1]);
    expect(lw.vertices).toHaveLength(2);
    const bb = computeEntityBBox(lw);
    expect(bb).not.toBeNull();
    // bbox должен быть выше y=0 из-за дуги
    expect(bb!.max.y).toBeGreaterThan(0.1);
    // y_max ≈ 5 (радиус полуокружности)
    expect(bb!.max.y).toBeCloseTo(5, 0);
  });

  it('bulge=0 array does not expand bbox', () => {
    const groups: DXFGroup[] = [
      g(0, 'LWPOLYLINE'),
      g(5, 'L3'), g(8, '0'), g(70, 0),
      g(10, 0), g(20, 0),
      g(42, 0),  // no arc
      g(10, 10), g(20, 0),
    ];
    const entities = parseEntitiesSection(groups);
    const lw = entities[0] as DXFLWPolylineEntity;
    const bb = computeEntityBBox(lw);
    expect(bb!.max.y).toBeCloseTo(0, 3);
  });
});

// ─── ACI colour table ─────────────────────────────────────────────────

describe('aciToColor – full 256-entry table', () => {
  it('index 0 = BYBLOCK black', () => {
    const c = aciToColor(0);
    expect(c).toEqual({ r: 0, g: 0, b: 0 });
  });
  it('index 1 = Red', () => {
    const c = aciToColor(1);
    expect(c).toEqual({ r: 255, g: 0, b: 0 });
  });
  it('index 2 = Yellow', () => {
    const c = aciToColor(2);
    expect(c).toEqual({ r: 255, g: 255, b: 0 });
  });
  it('index 3 = Green', () => {
    const c = aciToColor(3);
    expect(c).toEqual({ r: 0, g: 255, b: 0 });
  });
  it('index 4 = Cyan', () => {
    const c = aciToColor(4);
    expect(c).toEqual({ r: 0, g: 255, b: 255 });
  });
  it('index 5 = Blue', () => {
    const c = aciToColor(5);
    expect(c).toEqual({ r: 0, g: 0, b: 255 });
  });
  it('index 6 = Magenta', () => {
    const c = aciToColor(6);
    expect(c).toEqual({ r: 255, g: 0, b: 255 });
  });
  it('index 7 = White', () => {
    const c = aciToColor(7);
    expect(c).toEqual({ r: 255, g: 255, b: 255 });
  });
  it('index 8 = Dark gray', () => {
    const c = aciToColor(8);
    expect(c).toEqual({ r: 128, g: 128, b: 128 });
  });
  it('index 9 = Light gray', () => {
    const c = aciToColor(9);
    expect(c).toEqual({ r: 192, g: 192, b: 192 });
  });
  it('index 30 = orange-ish', () => {
    const c = aciToColor(30);
    expect(c).toEqual({ r: 255, g: 127, b: 0 });
  });
  it('index 250 = dark gray 33', () => {
    const c = aciToColor(250);
    expect(c).toEqual({ r: 33, g: 33, b: 33 });
  });
  it('index 255 = light gray 200', () => {
    const c = aciToColor(255);
    expect(c).toEqual({ r: 200, g: 200, b: 200 });
  });
  it('clamps out-of-range index 300 to 255', () => {
    const c = aciToColor(300);
    expect(c).toEqual({ r: 200, g: 200, b: 200 });
  });
  it('returns white for negative index (BYLAYER fallback)', () => {
    const c = aciToColor(-5);
    expect(c).toEqual({ r: 255, g: 255, b: 255 });
  });
  it('all 256 entries produce valid RGB values', () => {
    for (let i = 0; i < 256; i++) {
      const c = aciToColor(i);
      expect(c.r).toBeGreaterThanOrEqual(0);
      expect(c.r).toBeLessThanOrEqual(255);
      expect(c.g).toBeGreaterThanOrEqual(0);
      expect(c.g).toBeLessThanOrEqual(255);
      expect(c.b).toBeGreaterThanOrEqual(0);
      expect(c.b).toBeLessThanOrEqual(255);
    }
  });
});

// ─── Regression: LINE and CIRCLE still work ──────────────────────────

describe('Regression: basic entities', () => {
  it('parses LINE correctly', () => {
    const groups: DXFGroup[] = [
      g(0, 'LINE'), g(5, 'E1'), g(8, 'layer1'),
      g(10, 5), g(20, 10), g(30, 0),
      g(11, 15), g(21, 20), g(31, 0),
    ];
    const entities = parseEntitiesSection(groups);
    expect(entities).toHaveLength(1);
    expect(entities[0]!.type).toBe(DXFEntityType.LINE);
  });

  it('parses CIRCLE correctly', () => {
    const groups: DXFGroup[] = [
      g(0, 'CIRCLE'), g(5, 'E2'), g(8, '0'),
      g(10, 0), g(20, 0), g(30, 0),
      g(40, 7.5),
    ];
    const entities = parseEntitiesSection(groups);
    expect(entities).toHaveLength(1);
    expect(entities[0]!.type).toBe(DXFEntityType.CIRCLE);
  });

  it('handles mixed entities after POLYLINE', () => {
    const groups: DXFGroup[] = [
      g(0, 'POLYLINE'), g(5, 'P1'), g(8, '0'), g(70, 0),
      g(0, 'VERTEX'), g(8, '0'), g(10, 0), g(20, 0), g(30, 0),
      g(0, 'SEQEND'), g(8, '0'),
      g(0, 'LINE'), g(5, 'L1'), g(8, '0'),
      g(10, 0), g(20, 0), g(30, 0),
      g(11, 10), g(21, 10), g(31, 0),
    ];
    const entities = parseEntitiesSection(groups);
    expect(entities).toHaveLength(2);
    expect(entities[0]!.type).toBe(DXFEntityType.POLYLINE);
    expect(entities[1]!.type).toBe(DXFEntityType.LINE);
  });
});
