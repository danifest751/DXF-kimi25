import { describe, it, expect, beforeEach } from 'vitest';
import {
  resolveColor,
  resolveLineType,
  resolveLineWeight,
  flattenEntities,
  normalizeDocument,
} from '../../src/core/normalize/index.js';
import { DXFEntityType, DXFFormat, DXFVersion } from '../../src/core/types/index.js';
import type { DXFEntity, DXFDocument, DXFLayer, Color, DXFBlock } from '../../src/core/types/index.js';

// ─── Вспомогательные функции ────────────────────────────────────────

function makeLayer(
  name: string,
  color?: Color,
  lineType?: string,
  lineWeight?: number
): DXFLayer {
  return {
    name,
    color: color ?? { r: 255, g: 0, b: 0 },
    lineType: lineType ?? 'Continuous',
    lineWeight: lineWeight ?? 0,
    visible: true,
    frozen: false,
    locked: false,
  };
}

function makeBaseEntity(type: DXFEntityType, overrides?: Partial<DXFEntity>): DXFEntity {
  return {
    type,
    handle: '100',
    layer: '0',
    visible: true,
    ...overrides,
  };
}

function makeDocument(
  entities: DXFEntity[] = [],
  layers: Map<string, DXFLayer> = new Map(),
  blocks: Map<string, DXFBlock> = new Map()
): DXFDocument {
  return {
    metadata: {
      version: DXFVersion.R2018,
      format: DXFFormat.ASCII,
      application: 'Test',
    },
    entities,
    layers,
    blocks,
    lineTypes: new Map(),
    textStyles: new Map(),
    dimStyles: new Map(),
    viewPorts: new Map(),
  };
}

// ─── Тесты resolveColor ─────────────────────────────────────────────

describe('resolveColor', () => {
  it('возвращает цвет сущности, если он задан', () => {
    const entity = makeBaseEntity(DXFEntityType.LINE, {
      color: { r: 100, g: 150, b: 200 },
    });
    const layer = makeLayer('0', { r: 255, g: 0, b: 0 });
    
    const result = resolveColor(entity, layer, undefined);
    
    expect(result).toEqual({ r: 100, g: 150, b: 200 });
  });

  it('возвращает цвет слоя при BYLAYER', () => {
    const entity = makeBaseEntity(DXFEntityType.LINE);
    const layer = makeLayer('0', { r: 0, g: 255, b: 0 });
    
    const result = resolveColor(entity, layer, undefined);
    
    expect(result).toEqual({ r: 0, g: 255, b: 0 });
  });

  it('возвращает цвет родителя при BYBLOCK', () => {
    const entity = makeBaseEntity(DXFEntityType.LINE, {
      color: { r: 0, g: 0, b: 0 },
    });
    const layer = makeLayer('0', { r: 255, g: 0, b: 0 });
    const parentColor = { r: 0, g: 0, b: 255 };
    
    const result = resolveColor(entity, layer, parentColor);
    
    expect(result).toEqual({ r: 0, g: 0, b: 255 });
  });

  it('возвращает цвет слоя при BYBLOCK без родительского цвета', () => {
    const entity = makeBaseEntity(DXFEntityType.LINE, {
      color: { r: 0, g: 0, b: 0 },
    });
    const layer = makeLayer('0', { r: 255, g: 128, b: 64 });
    
    const result = resolveColor(entity, layer, undefined);
    
    expect(result).toEqual({ r: 255, g: 128, b: 64 });
  });

  it('возвращает DEFAULT_COLOR при отсутствии цвета и слоя', () => {
    const entity = makeBaseEntity(DXFEntityType.LINE);
    
    const result = resolveColor(entity, undefined, undefined);
    
    expect(result).toEqual({ r: 255, g: 255, b: 255 });
  });
});

// ─── Тесты resolveLineType ──────────────────────────────────────────

describe('resolveLineType', () => {
  it('возвращает тип линии сущности, если он задан', () => {
    const entity = makeBaseEntity(DXFEntityType.LINE, {
      lineType: 'DASHED',
    });
    const layer = makeLayer('0', undefined, 'Continuous');
    
    const result = resolveLineType(entity, layer);
    
    expect(result).toBe('DASHED');
  });

  it('возвращает тип линии слоя при BYLAYER', () => {
    const entity = makeBaseEntity(DXFEntityType.LINE);
    const layer = makeLayer('0', undefined, 'HIDDEN');
    
    const result = resolveLineType(entity, layer);
    
    expect(result).toBe('HIDDEN');
  });

  it('возвращает BYLAYER как Continuous', () => {
    const entity = makeBaseEntity(DXFEntityType.LINE, {
      lineType: 'BYLAYER',
    });
    const layer = makeLayer('0', undefined, 'CENTER');
    
    const result = resolveLineType(entity, layer);
    
    expect(result).toBe('CENTER');
  });

  it('возвращает Continuous по умолчанию', () => {
    const entity = makeBaseEntity(DXFEntityType.LINE);
    
    const result = resolveLineType(entity, undefined);
    
    expect(result).toBe('Continuous');
  });
});

// ─── Тесты resolveLineWeight ────────────────────────────────────────

describe('resolveLineWeight', () => {
  it('возвращает толщину сущности, если она задана', () => {
    const entity = makeBaseEntity(DXFEntityType.LINE, {
      lineWeight: 25,
    });
    const layer = makeLayer('0', undefined, undefined, 10);
    
    const result = resolveLineWeight(entity, layer);
    
    expect(result).toBe(25);
  });

  it('возвращает толщину слоя при отсутствии у сущности', () => {
    const entity = makeBaseEntity(DXFEntityType.LINE);
    const layer = makeLayer('0', undefined, undefined, 35);
    
    const result = resolveLineWeight(entity, layer);
    
    expect(result).toBe(35);
  });

  it('возвращает 0 по умолчанию', () => {
    const entity = makeBaseEntity(DXFEntityType.LINE);
    
    const result = resolveLineWeight(entity, undefined);
    
    expect(result).toBe(0);
  });
});

// ─── Тесты flattenEntities ──────────────────────────────────────────

describe('flattenEntities', () => {
  it('разворачивает простую сущность без трансформаций', () => {
    const line = makeBaseEntity(DXFEntityType.LINE, {
      start: { x: 0, y: 0, z: 0 },
      end: { x: 10, y: 10, z: 0 },
    });
    const doc = makeDocument([line], new Map([['0', makeLayer('0')]]));
    
    const result = flattenEntities(doc.entities, doc);
    
    expect(result).toHaveLength(1);
    expect(result[0].entity).toBe(line);
    expect(result[0].effectiveLayer).toBe('0');
  });

  it('разрешает цвет сущности при разворачивании', () => {
    const line = makeBaseEntity(DXFEntityType.LINE, {
      color: { r: 50, g: 100, b: 150 },
    });
    const layers = new Map([['0', makeLayer('0', { r: 255, g: 0, b: 0 })]]);
    const doc = makeDocument([line], layers);
    
    const result = flattenEntities(doc.entities, doc);
    
    expect(result[0].effectiveColor).toEqual({ r: 50, g: 100, b: 150 });
  });

  it('разворачивает INSERT с блоком', () => {
    const circle = makeBaseEntity(DXFEntityType.CIRCLE, {
      center: { x: 0, y: 0, z: 0 },
      radius: 5,
    });
    
    const block: DXFBlock = {
      name: 'TEST_BLOCK',
      entities: [circle],
      basePoint: { x: 0, y: 0, z: 0 },
    };
    
    const insert = makeBaseEntity(DXFEntityType.INSERT, {
      blockName: 'TEST_BLOCK',
      position: { x: 10, y: 10, z: 0 },
      rotation: 0,
      scale: { dx: 1, dy: 1, dz: 1 },
      columnCount: 1,
      rowCount: 1,
      columnSpacing: 0,
      rowSpacing: 0,
      attributes: [],
    });
    
    const blocks = new Map([['TEST_BLOCK', block]]);
    const doc = makeDocument([insert], new Map(), blocks);
    
    const result = flattenEntities(doc.entities, doc);
    
    expect(result).toHaveLength(1);
    expect(result[0].entity).toBe(circle);
  });

  it('разворачивает INSERT с массивом (columnCount × rowCount)', () => {
    const line = makeBaseEntity(DXFEntityType.LINE);
    
    const block: DXFBlock = {
      name: 'ARRAY_BLOCK',
      entities: [line],
      basePoint: { x: 0, y: 0, z: 0 },
    };
    
    const insert = makeBaseEntity(DXFEntityType.INSERT, {
      blockName: 'ARRAY_BLOCK',
      position: { x: 0, y: 0, z: 0 },
      rotation: 0,
      scale: { dx: 1, dy: 1, dz: 1 },
      columnCount: 3,
      rowCount: 2,
      columnSpacing: 10,
      rowSpacing: 10,
      attributes: [],
    });
    
    const blocks = new Map([['ARRAY_BLOCK', block]]);
    const doc = makeDocument([insert], new Map(), blocks);
    
    const result = flattenEntities(doc.entities, doc);
    
    expect(result).toHaveLength(6); // 3 × 2
  });

  it('обрабатывает вложенные блоки', () => {
    const innerCircle = makeBaseEntity(DXFEntityType.CIRCLE);
    
    const innerBlock: DXFBlock = {
      name: 'INNER',
      entities: [innerCircle],
      basePoint: { x: 0, y: 0, z: 0 },
    };
    
    const outerInsert = makeBaseEntity(DXFEntityType.INSERT, {
      blockName: 'INNER',
      position: { x: 5, y: 5, z: 0 },
      rotation: 0,
      scale: { dx: 1, dy: 1, dz: 1 },
      columnCount: 1,
      rowCount: 1,
      columnSpacing: 0,
      rowSpacing: 0,
      attributes: [],
    });
    
    const outerBlock: DXFBlock = {
      name: 'OUTER',
      entities: [outerInsert],
      basePoint: { x: 0, y: 0, z: 0 },
    };
    
    const outerInsert2 = makeBaseEntity(DXFEntityType.INSERT, {
      blockName: 'OUTER',
      position: { x: 0, y: 0, z: 0 },
      rotation: 0,
      scale: { dx: 1, dy: 1, dz: 1 },
      columnCount: 1,
      rowCount: 1,
      columnSpacing: 0,
      rowSpacing: 0,
      attributes: [],
    });
    
    const blocks = new Map([
      ['INNER', innerBlock],
      ['OUTER', outerBlock],
    ]);
    const doc = makeDocument([outerInsert2], new Map(), blocks);
    
    const result = flattenEntities(doc.entities, doc);
    
    expect(result).toHaveLength(1);
    expect(result[0].entity).toBe(innerCircle);
  });

  it('возвращает пустой массив при превышении maxDepth', () => {
    const innerCircle = makeBaseEntity(DXFEntityType.CIRCLE);
    
    const innerBlock: DXFBlock = {
      name: 'INNER',
      entities: [innerCircle],
      basePoint: { x: 0, y: 0, z: 0 },
    };
    
    const insert = makeBaseEntity(DXFEntityType.INSERT, {
      blockName: 'INNER',
      position: { x: 0, y: 0, z: 0 },
      rotation: 0,
      scale: { dx: 1, dy: 1, dz: 1 },
      columnCount: 1,
      rowCount: 1,
      columnSpacing: 0,
      rowSpacing: 0,
      attributes: [],
    });
    
    const blocks = new Map([['INNER', innerBlock]]);
    const doc = makeDocument([insert], new Map(), blocks);
    
    const result = flattenEntities(doc.entities, doc, undefined, undefined, 0);
    
    expect(result).toHaveLength(0);
  });
});

// ─── Тесты normalizeDocument ────────────────────────────────────────

describe('normalizeDocument', () => {
  it('нормализует простой документ без INSERT', () => {
    const line = makeBaseEntity(DXFEntityType.LINE, {
      start: { x: 0, y: 0, z: 0 },
      end: { x: 10, y: 10, z: 0 },
    });
    const layers = new Map([['0', makeLayer('0')]]);
    const doc = makeDocument([line], layers);
    
    const result = normalizeDocument(doc);
    
    expect(result.entityCount).toBe(1);
    expect(result.layerNames).toEqual(['0']);
    expect(result.totalBBox).not.toBeNull();
    expect(result.totalBBox!.min.x).toBe(0);
    expect(result.totalBBox!.max.x).toBe(10);
  });

  it('нормализует документ с INSERT', () => {
    const circle = makeBaseEntity(DXFEntityType.CIRCLE, {
      center: { x: 0, y: 0, z: 0 },
      radius: 5,
    });
    
    const block: DXFBlock = {
      name: 'CIRCLE_BLOCK',
      entities: [circle],
      basePoint: { x: 0, y: 0, z: 0 },
    };
    
    const insert = makeBaseEntity(DXFEntityType.INSERT, {
      blockName: 'CIRCLE_BLOCK',
      position: { x: 10, y: 10, z: 0 },
      rotation: 0,
      scale: { dx: 1, dy: 1, dz: 1 },
      columnCount: 1,
      rowCount: 1,
      columnSpacing: 0,
      rowSpacing: 0,
      attributes: [],
    });
    
    const blocks = new Map([['CIRCLE_BLOCK', block]]);
    const doc = makeDocument([insert], new Map(), blocks);
    
    const result = normalizeDocument(doc);
    
    expect(result.entityCount).toBe(1);
    expect(result.flatEntities[0].entity.type).toBe(DXFEntityType.CIRCLE);
  });

  it('вычисляет общий bounding box', () => {
    const line1 = makeBaseEntity(DXFEntityType.LINE, {
      start: { x: 0, y: 0, z: 0 },
      end: { x: 10, y: 10, z: 0 },
    });
    const line2 = makeBaseEntity(DXFEntityType.LINE, {
      start: { x: 20, y: 20, z: 0 },
      end: { x: 30, y: 30, z: 0 },
    });
    const layers = new Map([['0', makeLayer('0')]]);
    const doc = makeDocument([line1, line2], layers);
    
    const result = normalizeDocument(doc);
    
    expect(result.totalBBox).not.toBeNull();
    expect(result.totalBBox!.min.x).toBe(0);
    expect(result.totalBBox!.max.x).toBe(30);
    expect(result.totalBBox!.min.y).toBe(0);
    expect(result.totalBBox!.max.y).toBe(30);
  });

  it('возвращает null bounding box при пустом документе', () => {
    const doc = makeDocument([], new Map());
    
    const result = normalizeDocument(doc);
    
    expect(result.entityCount).toBe(0);
    expect(result.totalBBox).toBeNull();
  });

  it('сортирует имена слоёв', () => {
    const layers = new Map([
      ['Z_LAYER', makeLayer('Z_LAYER')],
      ['A_LAYER', makeLayer('A_LAYER')],
      ['M_LAYER', makeLayer('M_LAYER')],
    ]);
    const doc = makeDocument([], layers);
    
    const result = normalizeDocument(doc);
    
    expect(result.layerNames).toEqual(['A_LAYER', 'M_LAYER', 'Z_LAYER']);
  });
});
