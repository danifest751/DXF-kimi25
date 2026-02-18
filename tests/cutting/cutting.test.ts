import { describe, it, expect, beforeEach, afterEach, beforeAll, afterAll } from 'vitest';
import { computeCuttingStats, formatCutLength } from '../../src/core/cutting/index.js';
import { DXFEntityType } from '../../src/core/types/index.js';
import type {
  DXFLineEntity,
  DXFCircleEntity,
  DXFArcEntity,
  DXFLWPolylineEntity,
  DXFEntity,
  DXFDocument,
  DXFMetadata,
  BoundingBox,
} from '../../src/core/types/index.js';
import { normalizeDocument } from '../../src/core/normalize/index.js';
import { IDENTITY_MATRIX } from '../../src/core/geometry/math.js';

function makeBase(type: DXFEntityType) {
  return {
    type,
    handle: '1',
    layer: '0',
    visible: true,
  };
}

function makeMinimalDoc(entities: DXFEntity[]): DXFDocument {
  const extents: BoundingBox = { min: { x: 0, y: 0, z: 0 }, max: { x: 100, y: 100, z: 0 } };
  const metadata: DXFMetadata = {
    format: 'ASCII' as any,
    version: 'R12' as any,
    handle: '0',
    units: 0,
    extents,
    entityCount: entities.length,
    layerCount: 1,
    blockCount: 0,
  };
  return {
    metadata,
    layers: new Map([['0', { name: '0', color: { r: 255, g: 255, b: 255 }, lineType: 'Continuous', lineWeight: 0, frozen: false, locked: false, visible: true }]]),
    lineTypes: new Map(),
    textStyles: new Map(),
    dimStyles: new Map(),
    blocks: new Map(),
    entities,
    header: new Map(),
  };
}

describe('computeCuttingStats', () => {
  it('counts LINE pierce and length', () => {
    const line: DXFLineEntity = {
      ...makeBase(DXFEntityType.LINE),
      type: DXFEntityType.LINE,
      start: { x: 0, y: 0, z: 0 },
      end: { x: 100, y: 0, z: 0 },
    };
    const doc = makeMinimalDoc([line]);
    const norm = normalizeDocument(doc);
    const stats = computeCuttingStats(norm);

    expect(stats.totalPierces).toBe(1);
    expect(stats.totalCutLength).toBeCloseTo(100, 1);
    expect(stats.openPaths).toBe(1);
    expect(stats.closedContours).toBe(0);
  });

  it('counts CIRCLE pierce and length = 2πr', () => {
    const circle: DXFCircleEntity = {
      ...makeBase(DXFEntityType.CIRCLE),
      type: DXFEntityType.CIRCLE,
      center: { x: 50, y: 50, z: 0 },
      radius: 10,
    };
    const doc = makeMinimalDoc([circle]);
    const norm = normalizeDocument(doc);
    const stats = computeCuttingStats(norm);

    expect(stats.totalPierces).toBe(1);
    expect(stats.totalCutLength).toBeCloseTo(2 * Math.PI * 10, 0);
    expect(stats.closedContours).toBe(1);
    expect(stats.openPaths).toBe(0);
  });

  it('counts ARC pierce and length', () => {
    const arc: DXFArcEntity = {
      ...makeBase(DXFEntityType.ARC),
      type: DXFEntityType.ARC,
      center: { x: 0, y: 0, z: 0 },
      radius: 10,
      startAngle: 0,
      endAngle: 180,
    };
    const doc = makeMinimalDoc([arc]);
    const norm = normalizeDocument(doc);
    const stats = computeCuttingStats(norm);

    expect(stats.totalPierces).toBe(1);
    // Полукруг: π * r
    expect(stats.totalCutLength).toBeCloseTo(Math.PI * 10, 0);
    expect(stats.openPaths).toBe(1);
  });

  it('counts LWPOLYLINE pierce and length', () => {
    const lwpoly: DXFLWPolylineEntity = {
      ...makeBase(DXFEntityType.LWPOLYLINE),
      type: DXFEntityType.LWPOLYLINE,
      vertices: [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 50 }, { x: 0, y: 50 }],
      closed: true,
    };
    const doc = makeMinimalDoc([lwpoly]);
    const norm = normalizeDocument(doc);
    const stats = computeCuttingStats(norm);

    expect(stats.totalPierces).toBe(1);
    // Периметр: 100 + 50 + 100 + 50 = 300
    expect(stats.totalCutLength).toBeCloseTo(300, 0);
    expect(stats.closedContours).toBe(1);
  });

  it('counts multiple entities correctly', () => {
    const entities: DXFEntity[] = [
      {
        ...makeBase(DXFEntityType.LINE),
        type: DXFEntityType.LINE,
        start: { x: 0, y: 0, z: 0 },
        end: { x: 50, y: 0, z: 0 },
      },
      {
        ...makeBase(DXFEntityType.CIRCLE),
        type: DXFEntityType.CIRCLE,
        center: { x: 50, y: 50, z: 0 },
        radius: 5,
      },
      {
        ...makeBase(DXFEntityType.LINE),
        type: DXFEntityType.LINE,
        start: { x: 10, y: 10, z: 0 },
        end: { x: 30, y: 10, z: 0 },
      },
    ];
    const doc = makeMinimalDoc(entities);
    const norm = normalizeDocument(doc);
    const stats = computeCuttingStats(norm);

    // 2 отдельных LINE (не соединены) + 1 CIRCLE = 3 цепочки
    expect(stats.totalPierces).toBe(3);
    expect(stats.totalCutLength).toBeCloseTo(50 + 2 * Math.PI * 5 + 20, 0);
    expect(stats.chains.length).toBe(3);
  });

  it('ignores non-cutting entities (TEXT, POINT)', () => {
    const entities: DXFEntity[] = [
      {
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
      },
      {
        ...makeBase(DXFEntityType.POINT),
        type: DXFEntityType.POINT,
        location: { x: 10, y: 10, z: 0 },
      },
    ];
    const doc = makeMinimalDoc(entities);
    const norm = normalizeDocument(doc);
    const stats = computeCuttingStats(norm);

    expect(stats.totalPierces).toBe(0);
    expect(stats.totalCutLength).toBe(0);
    expect(stats.chains.length).toBe(0);
  });

  it('provides byLayer breakdown', () => {
    // Линии НЕ соединены (разные координаты) → 2 отдельные цепочки
    const line1: DXFLineEntity = {
      ...makeBase(DXFEntityType.LINE),
      type: DXFEntityType.LINE,
      start: { x: 0, y: 0, z: 0 },
      end: { x: 100, y: 0, z: 0 },
      layer: '0',
    };
    const line2: DXFLineEntity = {
      ...makeBase(DXFEntityType.LINE),
      type: DXFEntityType.LINE,
      start: { x: 200, y: 200, z: 0 },
      end: { x: 250, y: 200, z: 0 },
      layer: 'CUT',
    };
    const doc = makeMinimalDoc([line1, line2]);
    doc.layers.set('CUT', { name: 'CUT', color: { r: 255, g: 0, b: 0 }, lineType: 'Continuous', lineWeight: 0, frozen: false, locked: false, visible: true });
    const norm = normalizeDocument(doc);
    const stats = computeCuttingStats(norm);

    expect(stats.byLayer.size).toBe(2);
    const layer0 = stats.byLayer.get('0');
    expect(layer0).toBeDefined();
    expect(layer0!.pierces).toBe(1);
    expect(layer0!.cutLength).toBeCloseTo(100, 1);
    const layerCut = stats.byLayer.get('CUT');
    expect(layerCut).toBeDefined();
    expect(layerCut!.pierces).toBe(1);
    expect(layerCut!.cutLength).toBeCloseTo(50, 1);
  });

  it('returns empty stats for empty document', () => {
    const doc = makeMinimalDoc([]);
    const norm = normalizeDocument(doc);
    const stats = computeCuttingStats(norm);

    expect(stats.totalPierces).toBe(0);
    expect(stats.totalCutLength).toBe(0);
    expect(stats.chains.length).toBe(0);
  });

  it('chains connected LINE segments into 1 pierce', () => {
    // 3 LINE сегмента, соединённых концами → 1 врезка
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
        start: { x: 10, y: 0, z: 0 },
        end: { x: 10, y: 10, z: 0 },
      },
      {
        ...makeBase(DXFEntityType.LINE),
        type: DXFEntityType.LINE,
        start: { x: 10, y: 10, z: 0 },
        end: { x: 0, y: 10, z: 0 },
      },
    ];
    const doc = makeMinimalDoc(entities);
    const norm = normalizeDocument(doc);
    const stats = computeCuttingStats(norm);

    expect(stats.totalPierces).toBe(1);
    expect(stats.totalCutLength).toBeCloseTo(30, 1);
    expect(stats.cuttingEntityCount).toBe(3);
  });

  it('chains connected segments into closed contour', () => {
    // 4 LINE сегмента образуют замкнутый квадрат → 1 врезка, замкнутый
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
        start: { x: 10, y: 0, z: 0 },
        end: { x: 10, y: 10, z: 0 },
      },
      {
        ...makeBase(DXFEntityType.LINE),
        type: DXFEntityType.LINE,
        start: { x: 10, y: 10, z: 0 },
        end: { x: 0, y: 10, z: 0 },
      },
      {
        ...makeBase(DXFEntityType.LINE),
        type: DXFEntityType.LINE,
        start: { x: 0, y: 10, z: 0 },
        end: { x: 0, y: 0, z: 0 },
      },
    ];
    const doc = makeMinimalDoc(entities);
    const norm = normalizeDocument(doc);
    const stats = computeCuttingStats(norm);

    expect(stats.totalPierces).toBe(1);
    expect(stats.closedContours).toBe(1);
    expect(stats.openPaths).toBe(0);
    expect(stats.totalCutLength).toBeCloseTo(40, 1);
  });

  it('separate contours = separate pierces', () => {
    // Квадрат из 4 LINE + отдельный CIRCLE = 2 врезки
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
        start: { x: 10, y: 0, z: 0 },
        end: { x: 10, y: 10, z: 0 },
      },
      {
        ...makeBase(DXFEntityType.LINE),
        type: DXFEntityType.LINE,
        start: { x: 10, y: 10, z: 0 },
        end: { x: 0, y: 10, z: 0 },
      },
      {
        ...makeBase(DXFEntityType.LINE),
        type: DXFEntityType.LINE,
        start: { x: 0, y: 10, z: 0 },
        end: { x: 0, y: 0, z: 0 },
      },
      {
        ...makeBase(DXFEntityType.CIRCLE),
        type: DXFEntityType.CIRCLE,
        center: { x: 50, y: 50, z: 0 },
        radius: 5,
      },
    ];
    const doc = makeMinimalDoc(entities);
    const norm = normalizeDocument(doc);
    const stats = computeCuttingStats(norm);

    expect(stats.totalPierces).toBe(2);
    expect(stats.closedContours).toBe(2);
  });
});

describe('formatCutLength', () => {
  it('formats in mm', () => {
    expect(formatCutLength(1234.56, 'mm')).toBe('1234.56 мм');
  });

  it('formats in m', () => {
    expect(formatCutLength(1234.56, 'm')).toBe('1.235 м');
  });

  it('defaults to mm', () => {
    expect(formatCutLength(100)).toBe('100.00 мм');
  });
});
