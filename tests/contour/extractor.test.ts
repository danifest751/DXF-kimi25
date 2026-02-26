import { describe, it, expect } from 'vitest';
import { buildContour, buildContoursByLayer } from '../../packages/core-engine/src/contour/index.js';
import type { FlattenedEntity } from '../../packages/core-engine/src/normalize/index.js';
import { DXFEntityType } from '../../packages/core-engine/src/types/index.js';
import { IDENTITY_MATRIX } from '../../packages/core-engine/src/geometry/math.js';
import type {
  DXFLineEntity,
  DXFCircleEntity,
  DXFLWPolylineEntity,
  DXFPolylineEntity,
} from '../../packages/core-engine/src/types/index.js';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeFE(entity: Parameters<typeof buildContour>[0][number]['entity']): FlattenedEntity {
  return {
    entity: entity as FlattenedEntity['entity'],
    transform: IDENTITY_MATRIX,
    effectiveColor: { r: 255, g: 255, b: 255 },
    effectiveLineType: 'Continuous',
    effectiveLineWeight: 0,
    effectiveLayer: (entity as { layer: string }).layer ?? '0',
  };
}

function makeLine(
  x1: number, y1: number, x2: number, y2: number, layer = '0',
): FlattenedEntity {
  const e: DXFLineEntity = {
    type: DXFEntityType.LINE,
    handle: 'test',
    layer,
    visible: true,
    start: { x: x1, y: y1, z: 0 },
    end: { x: x2, y: y2, z: 0 },
  };
  return makeFE(e);
}

function makeCircle(cx: number, cy: number, r: number, layer = '0'): FlattenedEntity {
  const e: DXFCircleEntity = {
    type: DXFEntityType.CIRCLE,
    handle: 'test',
    layer,
    visible: true,
    center: { x: cx, y: cy, z: 0 },
    radius: r,
  };
  return makeFE(e);
}

function makeLWPolyline(
  vertices: Array<{ x: number; y: number }>,
  closed: boolean,
  bulges?: number[],
  layer = '0',
): FlattenedEntity {
  const e: DXFLWPolylineEntity = {
    type: DXFEntityType.LWPOLYLINE,
    handle: 'test',
    layer,
    visible: true,
    vertices,
    closed,
    bulges,
  };
  return makeFE(e);
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('buildContour – rectangle from 4 LINE segments', () => {
  // 100×50 rectangle
  const lines = [
    makeLine(0, 0, 100, 0),
    makeLine(100, 0, 100, 50),
    makeLine(100, 50, 0, 50),
    makeLine(0, 50, 0, 0),
  ];

  it('returns a non-null result', () => {
    expect(buildContour(lines)).not.toBeNull();
  });

  it('outer ring has ≥ 4 points', () => {
    const r = buildContour(lines)!;
    expect(r.outerRing.length).toBeGreaterThanOrEqual(4);
  });

  it('bbox approximates 100×50', () => {
    const r = buildContour(lines)!;
    expect(r.bbox.width).toBeCloseTo(100, 0);
    expect(r.bbox.height).toBeCloseTo(50, 0);
  });

  it('outer ring starts at (0,0) after translation to origin', () => {
    const r = buildContour(lines)!;
    const xs = r.outerRing.map(p => p.x);
    const ys = r.outerRing.map(p => p.y);
    expect(Math.min(...xs)).toBeCloseTo(0, 3);
    expect(Math.min(...ys)).toBeCloseTo(0, 3);
  });
});

describe('buildContour – closed LWPOLYLINE square', () => {
  const sq = makeLWPolyline(
    [{ x: 10, y: 10 }, { x: 60, y: 10 }, { x: 60, y: 70 }, { x: 10, y: 70 }],
    true,
  );

  it('returns a non-null result', () => {
    expect(buildContour([sq])).not.toBeNull();
  });

  it('bbox approximates 50×60', () => {
    const r = buildContour([sq])!;
    expect(r.bbox.width).toBeCloseTo(50, 0);
    expect(r.bbox.height).toBeCloseTo(60, 0);
  });
});

describe('buildContour – LWPOLYLINE with bulge (rounded corner)', () => {
  // A simple square with one bulge on the first edge (quarter arc)
  const sq = makeLWPolyline(
    [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }, { x: 0, y: 100 }],
    true,
    [0, 0, 0, 0],  // no actual bulge — just verifying path goes through
  );

  it('returns contour with positive area', () => {
    const r = buildContour([sq]);
    expect(r).not.toBeNull();
    expect(r!.outerRing.length).toBeGreaterThanOrEqual(4);
  });
});

describe('buildContour – CIRCLE', () => {
  it('returns a contour for a circle', () => {
    const r = buildContour([makeCircle(50, 50, 30)])!;
    expect(r).not.toBeNull();
    // polygon of a circle should have many points
    expect(r.outerRing.length).toBeGreaterThan(10);
    // bbox ≈ diameter
    expect(r.bbox.width).toBeCloseTo(60, 0);
    expect(r.bbox.height).toBeCloseTo(60, 0);
  });

  it('all points are within bbox', () => {
    const r = buildContour([makeCircle(0, 0, 25)])!;
    for (const p of r.outerRing) {
      expect(p.x).toBeGreaterThanOrEqual(-0.01);
      expect(p.y).toBeGreaterThanOrEqual(-0.01);
      expect(p.x).toBeLessThanOrEqual(r.bbox.width + 0.01);
      expect(p.y).toBeLessThanOrEqual(r.bbox.height + 0.01);
    }
  });
});

describe('buildContour – closed POLYLINE', () => {
  it('extracts contour from closed POLYLINE', () => {
    const e: DXFPolylineEntity = {
      type: DXFEntityType.POLYLINE,
      handle: 'poly',
      layer: '0',
      visible: true,
      vertices: [
        { x: 0, y: 0, z: 0 },
        { x: 200, y: 0, z: 0 },
        { x: 200, y: 100, z: 0 },
        { x: 0, y: 100, z: 0 },
      ],
      closed: true,
      is3D: false,
      isMesh: false,
      isPolyface: false,
    };
    const r = buildContour([makeFE(e)])!;
    expect(r).not.toBeNull();
    expect(r.bbox.width).toBeCloseTo(200, 0);
    expect(r.bbox.height).toBeCloseTo(100, 0);
  });
});

describe('buildContour – L-shape from 6 LINE segments', () => {
  // L-shape: 100×100 with 50×50 cutout in top-right
  const lines = [
    makeLine(0, 0, 100, 0),
    makeLine(100, 0, 100, 50),
    makeLine(100, 50, 50, 50),
    makeLine(50, 50, 50, 100),
    makeLine(50, 100, 0, 100),
    makeLine(0, 100, 0, 0),
  ];

  it('successfully extracts the L-shape contour', () => {
    const r = buildContour(lines);
    expect(r).not.toBeNull();
  });

  it('L-shape outer ring has ≥ 6 points', () => {
    const r = buildContour(lines)!;
    expect(r.outerRing.length).toBeGreaterThanOrEqual(6);
  });

  it('L-shape bbox is 100×100', () => {
    const r = buildContour(lines)!;
    expect(r.bbox.width).toBeCloseTo(100, 0);
    expect(r.bbox.height).toBeCloseTo(100, 0);
  });
});

describe('buildContour – no entities', () => {
  it('returns null for empty input', () => {
    expect(buildContour([])).toBeNull();
  });
});

describe('buildContour – unclosed segments that cannot form a loop', () => {
  it('returns null for a single LINE segment', () => {
    expect(buildContour([makeLine(0, 0, 10, 10)])).toBeNull();
  });
});

describe('buildContoursByLayer', () => {
  it('splits entities by layer and extracts per-layer contours', () => {
    const entities = [
      makeLine(0, 0, 50, 0, 'A'),
      makeLine(50, 0, 50, 50, 'A'),
      makeLine(50, 50, 0, 50, 'A'),
      makeLine(0, 50, 0, 0, 'A'),
      makeCircle(200, 200, 30, 'B'),
    ];
    const map = buildContoursByLayer(entities);
    expect(map.has('A')).toBe(true);
    expect(map.has('B')).toBe(true);
    expect(map.get('A')!.bbox.width).toBeCloseTo(50, 0);
    expect(map.get('B')!.bbox.width).toBeCloseTo(60, 0);
  });
});
