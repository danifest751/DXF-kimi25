import { describe, it, expect, beforeEach, afterEach, beforeAll, afterAll } from 'vitest';
import { computeEntityBBox, mergeBBox, computeAllBBoxes } from '../../src/core/geometry/bbox.js';
import { DXFEntityType } from '../../src/core/types/index.js';
import type {
  DXFLineEntity,
  DXFCircleEntity,
  DXFArcEntity,
  DXFPointEntity,
  DXFSolidEntity,
  DXFLWPolylineEntity,
  DXFTextEntity,
  DXFEntity,
} from '../../src/core/types/index.js';

function makeBase(type: DXFEntityType) {
  return {
    type,
    handle: '1',
    layer: '0',
    visible: true,
  };
}

describe('computeEntityBBox', () => {
  it('LINE bbox covers start and end', () => {
    const e: DXFLineEntity = {
      ...makeBase(DXFEntityType.LINE),
      type: DXFEntityType.LINE,
      start: { x: 0, y: 0, z: 0 },
      end: { x: 10, y: 5, z: 0 },
    };
    const bb = computeEntityBBox(e)!;
    expect(bb.min.x).toBe(0);
    expect(bb.min.y).toBe(0);
    expect(bb.max.x).toBe(10);
    expect(bb.max.y).toBe(5);
  });

  it('CIRCLE bbox is center ± radius', () => {
    const e: DXFCircleEntity = {
      ...makeBase(DXFEntityType.CIRCLE),
      type: DXFEntityType.CIRCLE,
      center: { x: 5, y: 5, z: 0 },
      radius: 3,
    };
    const bb = computeEntityBBox(e)!;
    expect(bb.min.x).toBe(2);
    expect(bb.min.y).toBe(2);
    expect(bb.max.x).toBe(8);
    expect(bb.max.y).toBe(8);
  });

  it('ARC bbox contains arc endpoints', () => {
    const e: DXFArcEntity = {
      ...makeBase(DXFEntityType.ARC),
      type: DXFEntityType.ARC,
      center: { x: 0, y: 0, z: 0 },
      radius: 10,
      startAngle: 0,
      endAngle: 90,
    };
    const bb = computeEntityBBox(e)!;
    expect(bb.min.x).toBeGreaterThanOrEqual(-0.1);
    expect(bb.min.y).toBeGreaterThanOrEqual(-0.1);
    expect(bb.max.x).toBeCloseTo(10, 0);
    expect(bb.max.y).toBeCloseTo(10, 0);
  });

  it('POINT bbox is a single point', () => {
    const e: DXFPointEntity = {
      ...makeBase(DXFEntityType.POINT),
      type: DXFEntityType.POINT,
      location: { x: 7, y: 3, z: 1 },
    };
    const bb = computeEntityBBox(e)!;
    expect(bb.min).toEqual({ x: 7, y: 3, z: 1 });
    expect(bb.max).toEqual({ x: 7, y: 3, z: 1 });
  });

  it('SOLID bbox covers all 4 points', () => {
    const e: DXFSolidEntity = {
      ...makeBase(DXFEntityType.SOLID),
      type: DXFEntityType.SOLID,
      points: [
        { x: 0, y: 0, z: 0 },
        { x: 10, y: 0, z: 0 },
        { x: 0, y: 10, z: 0 },
        { x: 10, y: 10, z: 0 },
      ],
    };
    const bb = computeEntityBBox(e)!;
    expect(bb.min.x).toBe(0);
    expect(bb.max.x).toBe(10);
    expect(bb.max.y).toBe(10);
  });

  it('LWPOLYLINE bbox covers all vertices', () => {
    const e: DXFLWPolylineEntity = {
      ...makeBase(DXFEntityType.LWPOLYLINE),
      type: DXFEntityType.LWPOLYLINE,
      vertices: [{ x: 0, y: 0 }, { x: 5, y: 10 }, { x: 10, y: 5 }],
      closed: false,
    };
    const bb = computeEntityBBox(e)!;
    expect(bb.min.x).toBe(0);
    expect(bb.min.y).toBe(0);
    expect(bb.max.x).toBe(10);
    expect(bb.max.y).toBe(10);
  });

  it('TEXT bbox is non-zero', () => {
    const e: DXFTextEntity = {
      ...makeBase(DXFEntityType.TEXT),
      type: DXFEntityType.TEXT,
      position: { x: 0, y: 0, z: 0 },
      text: 'Hello',
      height: 5,
      rotation: 0,
      style: 'Standard',
      alignment: 0,
      widthFactor: 1,
      obliqueAngle: 0,
    };
    const bb = computeEntityBBox(e)!;
    expect(bb.max.x).toBeGreaterThan(0);
    expect(bb.max.y).toBeGreaterThan(0);
  });
});

describe('mergeBBox', () => {
  it('merges two bboxes', () => {
    const a = { min: { x: 0, y: 0, z: 0 }, max: { x: 5, y: 5, z: 0 } };
    const b = { min: { x: 3, y: 3, z: 0 }, max: { x: 10, y: 10, z: 0 } };
    const m = mergeBBox(a, b);
    expect(m.min).toEqual({ x: 0, y: 0, z: 0 });
    expect(m.max).toEqual({ x: 10, y: 10, z: 0 });
  });
});

describe('computeAllBBoxes', () => {
  it('computes bbox for all entities and returns total', () => {
    const entities: DXFEntity[] = [
      {
        ...makeBase(DXFEntityType.LINE),
        type: DXFEntityType.LINE,
        start: { x: 0, y: 0, z: 0 },
        end: { x: 10, y: 0, z: 0 },
      },
      {
        ...makeBase(DXFEntityType.LINE),
        type: DXFEntityType.LINE,
        start: { x: 0, y: 0, z: 0 },
        end: { x: 0, y: 10, z: 0 },
      },
    ];
    const total = computeAllBBoxes(entities);
    expect(total).not.toBeNull();
    expect(total!.min.x).toBe(0);
    expect(total!.max.x).toBe(10);
    expect(total!.max.y).toBe(10);
    // Каждая сущность должна иметь свой bbox
    expect(entities[0]!.boundingBox).toBeDefined();
    expect(entities[1]!.boundingBox).toBeDefined();
  });

  it('returns null for empty array', () => {
    expect(computeAllBBoxes([])).toBeNull();
  });
});
