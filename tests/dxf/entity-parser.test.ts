import { describe, it, expect } from 'vitest';
import { parseEntity, aciToColor } from '../../packages/core-engine/src/dxf/reader/entity-parser.js';
import { DXFEntityType, DXFFormat } from '../../packages/core-engine/src/types/index.js';
import type { DXFGroup, DXFDocument } from '../../packages/core-engine/src/types/index.js';

// ─── Вспомогательные функции ────────────────────────────────────────

function makeGroup(code: number, value: string | number): DXFGroup {
  return { code, value: String(value) };
}

function makeDocument(): DXFDocument {
  return {
    metadata: {
      version: 'R2018',
      format: DXFFormat.ASCII,
      application: 'Test',
    },
    entities: [],
    layers: new Map(),
    blocks: new Map(),
    lineTypes: new Map(),
    textStyles: new Map(),
    dimStyles: new Map(),
    viewPorts: new Map(),
  };
}

// ─── Тесты aciToColor ───────────────────────────────────────────────

describe('aciToColor', () => {
  it('конвертирует ACI 1 (красный) в RGB', () => {
    const color = aciToColor(1);
    expect(color).toEqual({ r: 255, g: 0, b: 0 });
  });

  it('конвертирует ACI 2 (жёлтый) в RGB', () => {
    const color = aciToColor(2);
    expect(color).toEqual({ r: 255, g: 255, b: 0 });
  });

  it('конвертирует ACI 3 (зелёный) в RGB', () => {
    const color = aciToColor(3);
    expect(color).toEqual({ r: 0, g: 255, b: 0 });
  });

  it('конвертирует ACI 4 (голубой) в RGB', () => {
    const color = aciToColor(4);
    expect(color).toEqual({ r: 0, g: 255, b: 255 });
  });

  it('конвертирует ACI 5 (синий) в RGB', () => {
    const color = aciToColor(5);
    expect(color).toEqual({ r: 0, g: 0, b: 255 });
  });

  it('конвертирует ACI 6 (пурпурный) в RGB', () => {
    const color = aciToColor(6);
    expect(color).toEqual({ r: 255, g: 0, b: 255 });
  });

  it('конвертирует ACI 7 (белый/чёрный) в RGB', () => {
    const color = aciToColor(7);
    expect(color).toEqual({ r: 255, g: 255, b: 255 });
  });

  it('возвращает серый для неизвестных индексов', () => {
    const color = aciToColor(50);
    expect(color).toEqual({ r: 102, g: 102, b: 0 });
  });

  it('возвращает белый для отрицательных индексов', () => {
    const color = aciToColor(-1);
    expect(color).toEqual({ r: 255, g: 255, b: 255 });
  });
});

// ─── Тесты parseEntity: LINE ────────────────────────────────────────

describe('parseEntity: LINE', () => {
  it('парсит LINE сущность', () => {
    const groups: DXFGroup[] = [
      makeGroup(5, '100'),
      makeGroup(8, 'Layer1'),
      makeGroup(62, 1), // красный цвет
      makeGroup(10, 0), // start.x
      makeGroup(20, 0), // start.y
      makeGroup(30, 0), // start.z
      makeGroup(11, 10), // end.x
      makeGroup(21, 10), // end.y
      makeGroup(31, 0), // end.z
    ];

    const entity = parseEntity('LINE', groups);

    expect(entity?.type).toBe(DXFEntityType.LINE);
    expect(entity?.handle).toBe('100');
    expect(entity?.layer).toBe('Layer1');
    expect(entity?.color).toEqual({ r: 255, g: 0, b: 0 });
    expect(entity?.start).toEqual({ x: 0, y: 0, z: 0 });
    expect(entity?.end).toEqual({ x: 10, y: 10, z: 0 });
  });

  it('парсит LINE без цвета (BYLAYER)', () => {
    const groups: DXFGroup[] = [
      makeGroup(5, '101'),
      makeGroup(8, '0'),
      makeGroup(10, 0),
      makeGroup(20, 0),
      makeGroup(30, 0),
      makeGroup(11, 5),
      makeGroup(21, 5),
      makeGroup(31, 0),
    ];

    const entity = parseEntity('LINE', groups);

    expect(entity?.type).toBe(DXFEntityType.LINE);
    expect(entity?.color).toBeUndefined();
  });
});

// ─── Тесты parseEntity: CIRCLE ──────────────────────────────────────

describe('parseEntity: CIRCLE', () => {
  it('парсит CIRCLE сущность', () => {
    const groups: DXFGroup[] = [
      makeGroup(5, '200'),
      makeGroup(8, 'Circles'),
      makeGroup(10, 50), // center.x
      makeGroup(20, 50), // center.y
      makeGroup(30, 0),  // center.z
      makeGroup(40, 25), // radius
    ];

    const entity = parseEntity('CIRCLE', groups);

    expect(entity?.type).toBe(DXFEntityType.CIRCLE);
    expect(entity?.handle).toBe('200');
    expect(entity?.layer).toBe('Circles');
    expect(entity?.center).toEqual({ x: 50, y: 50, z: 0 });
    expect(entity?.radius).toBe(25);
  });
});

// ─── Тесты parseEntity: ARC ─────────────────────────────────────────

describe('parseEntity: ARC', () => {
  it('парсит ARC сущность', () => {
    const groups: DXFGroup[] = [
      makeGroup(5, '300'),
      makeGroup(10, 0), // center.x
      makeGroup(20, 0), // center.y
      makeGroup(30, 0), // center.z
      makeGroup(40, 10), // radius
      makeGroup(50, 0),  // startAngle
      makeGroup(51, 90), // endAngle
    ];

    const entity = parseEntity('ARC', groups);

    expect(entity?.type).toBe(DXFEntityType.ARC);
    expect(entity?.radius).toBe(10);
    expect(entity?.startAngle).toBe(0);
    expect(entity?.endAngle).toBe(90);
  });
});

// ─── Тесты parseEntity: LWPOLYLINE ──────────────────────────────────

describe('parseEntity: LWPOLYLINE', () => {
  it('парсит LWPOLYLINE с вершинами', () => {
    const groups: DXFGroup[] = [
      makeGroup(5, '400'),
      makeGroup(8, 'Polylines'),
      makeGroup(90, 3), // количество вершин
      makeGroup(70, 1), // флаг замкнутости
      makeGroup(10, 0), // vertex.x
      makeGroup(20, 0), // vertex.y
      makeGroup(10, 10), // vertex.x
      makeGroup(20, 0), // vertex.y
      makeGroup(10, 10), // vertex.x
      makeGroup(20, 10), // vertex.y
    ];

    const entity = parseEntity('LWPOLYLINE', groups);

    expect(entity?.type).toBe(DXFEntityType.LWPOLYLINE);
    expect(entity?.vertices).toHaveLength(3);
    expect(entity?.vertices[0]).toEqual({ x: 0, y: 0 });
    expect(entity?.vertices[1]).toEqual({ x: 10, y: 0 });
    expect(entity?.vertices[2]).toEqual({ x: 10, y: 10 });
  });

  it('парсит замкнутую LWPOLYLINE', () => {
    const groups: DXFGroup[] = [
      makeGroup(100, 'AcDbPolyline'),
      makeGroup(90, 2),
      makeGroup(70, 1), // замкнута (flag 1)
      makeGroup(10, 0),
      makeGroup(20, 0),
      makeGroup(10, 10),
      makeGroup(20, 10),
    ];

    const entity = parseEntity('LWPOLYLINE', groups);

    expect(entity?.type).toBe(DXFEntityType.LWPOLYLINE);
    expect(entity?.vertices).toHaveLength(2);
  });

  it('парсит открытую LWPOLYLINE', () => {
    const groups: DXFGroup[] = [
      makeGroup(100, 'AcDbPolyline'),
      makeGroup(90, 2),
      makeGroup(70, 0), // открыта (flag 0)
      makeGroup(10, 0),
      makeGroup(20, 0),
      makeGroup(10, 10),
      makeGroup(20, 10),
    ];

    const entity = parseEntity('LWPOLYLINE', groups);

    expect(entity?.type).toBe(DXFEntityType.LWPOLYLINE);
    expect(entity?.vertices).toHaveLength(2);
  });
});

// ─── Тесты parseEntity: SPLINE ──────────────────────────────────────

describe('parseEntity: SPLINE', () => {
  it('парсит SPLINE с контрольными точками', () => {
    const groups: DXFGroup[] = [
      makeGroup(5, '500'),
      makeGroup(71, 3), // степень
      makeGroup(73, 4), // количество узлов
      makeGroup(74, 2), // количество контрольных точек
      makeGroup(40, 0), // knot[0]
      makeGroup(40, 1), // knot[1]
      makeGroup(40, 2), // knot[2]
      makeGroup(40, 3), // knot[3]
      makeGroup(10, 0), // cp[0].x
      makeGroup(20, 0), // cp[0].y
      makeGroup(30, 0), // cp[0].z
      makeGroup(10, 10), // cp[1].x
      makeGroup(20, 10), // cp[1].y
      makeGroup(30, 0), // cp[1].z
    ];

    const entity = parseEntity('SPLINE', groups);

    expect(entity?.type).toBe(DXFEntityType.SPLINE);
    expect(entity?.degree).toBe(3);
    expect(entity?.knots).toHaveLength(4);
    expect(entity?.controlPoints).toHaveLength(2);
  });
});

// ─── Тесты parseEntity: INSERT ──────────────────────────────────────

describe('parseEntity: INSERT', () => {
  it('парсит INSERT сущность', () => {
    const groups: DXFGroup[] = [
      makeGroup(5, '600'),
      makeGroup(2, 'BLOCK1'), // имя блока
      makeGroup(10, 100), // position.x
      makeGroup(20, 100), // position.y
      makeGroup(30, 0),   // position.z
      makeGroup(41, 2),   // scaleX
      makeGroup(42, 2),   // scaleY
      makeGroup(43, 1),   // scaleZ
      makeGroup(50, 45),  // rotation
    ];

    const entity = parseEntity('INSERT', groups);

    expect(entity?.type).toBe(DXFEntityType.INSERT);
    expect(entity?.blockName).toBe('BLOCK1');
    expect(entity?.position).toEqual({ x: 100, y: 100, z: 0 });
    expect(entity?.scale).toEqual({ dx: 2, dy: 2, dz: 1 });
    expect(entity?.rotation).toBe(45);
  });

  it('парсит INSERT с массивом', () => {
    const groups: DXFGroup[] = [
      makeGroup(2, 'BLOCK1'),
      makeGroup(10, 0),
      makeGroup(20, 0),
      makeGroup(30, 0),
      makeGroup(70, 3), // columnCount
      makeGroup(71, 2), // rowCount
      makeGroup(44, 50), // columnSpacing
      makeGroup(45, 50), // rowSpacing
    ];

    const entity = parseEntity('INSERT', groups);

    expect(entity?.columnCount).toBe(3);
    expect(entity?.rowCount).toBe(2);
    expect(entity?.columnSpacing).toBe(50);
    expect(entity?.rowSpacing).toBe(50);
  });
});

// ─── Тесты parseEntity: TEXT ────────────────────────────────────────

describe('parseEntity: TEXT', () => {
  it('парсит TEXT сущность', () => {
    const groups: DXFGroup[] = [
      makeGroup(100, 'AcDbText'),
      makeGroup(5, '700'),
      makeGroup(1, 'Hello World'), // текст
      makeGroup(10, 0), // insert.x
      makeGroup(20, 0), // insert.y
      makeGroup(30, 0), // insert.z
      makeGroup(40, 10), // height
      makeGroup(41, 1),  // xScale
      makeGroup(50, 0),  // rotation
    ];

    const entity = parseEntity('TEXT', groups);

    expect(entity?.type).toBe(DXFEntityType.TEXT);
    expect(entity?.text).toBe('Hello World');
    expect(entity?.height).toBe(10);
  });
});

// ─── Тесты parseEntity: ELLIPSE ─────────────────────────────────────

describe('parseEntity: ELLIPSE', () => {
  it('парсит ELLIPSE сущность', () => {
    const groups: DXFGroup[] = [
      makeGroup(100, 'AcDbEllipse'),
      makeGroup(5, '800'),
      makeGroup(10, 50), // center.x
      makeGroup(20, 50), // center.y
      makeGroup(30, 0),  // center.z
      makeGroup(11, 25), // majorAxis.x
      makeGroup(21, 0),  // majorAxis.y
      makeGroup(31, 0),  // majorAxis.z
      makeGroup(40, 0.5), // ratio (minor/major)
      makeGroup(41, 0),   // startParam
      makeGroup(42, Math.PI), // endParam
    ];

    const entity = parseEntity('ELLIPSE', groups);

    expect(entity?.type).toBe(DXFEntityType.ELLIPSE);
    expect(entity?.center).toEqual({ x: 50, y: 50, z: 0 });
    expect(entity?.majorAxis).toEqual({ dx: 25, dy: 0, dz: 0 });
  });
});

// ─── Тесты parseEntity: POINT ───────────────────────────────────────

describe('parseEntity: POINT', () => {
  it('парсит POINT сущность', () => {
    const groups: DXFGroup[] = [
      makeGroup(100, 'AcDbPoint'),
      makeGroup(5, '900'),
      makeGroup(10, 15),
      makeGroup(20, 25),
      makeGroup(30, 0),
    ];

    const entity = parseEntity('POINT', groups);

    expect(entity?.type).toBe(DXFEntityType.POINT);
  });
});

// ─── Тесты parseEntity: SOLID ───────────────────────────────────────

describe('parseEntity: SOLID', () => {
  it('парсит SOLID сущность', () => {
    const groups: DXFGroup[] = [
      makeGroup(5, '1000'),
      makeGroup(10, 0), // corner1.x
      makeGroup(20, 0), // corner1.y
      makeGroup(30, 0),
      makeGroup(11, 10), // corner2.x
      makeGroup(21, 0),  // corner2.y
      makeGroup(31, 0),
      makeGroup(12, 10), // corner3.x
      makeGroup(22, 10), // corner3.y
      makeGroup(32, 0),
      makeGroup(13, 0),  // corner4.x
      makeGroup(23, 10), // corner4.y
      makeGroup(33, 0),
    ];

    const entity = parseEntity('SOLID', groups);

    expect(entity?.type).toBe(DXFEntityType.SOLID);
    expect(entity?.points).toHaveLength(4);
  });
});

// ─── Тесты parseEntity: неизвестный тип ─────────────────────────────

describe('parseEntity: неизвестные типы', () => {
  it('возвращает null для неизвестного типа сущности', () => {
    const groups: DXFGroup[] = [
      makeGroup(5, '999'),
    ];

    const entity = parseEntity('UNKNOWN_ENTITY', groups);

    expect(entity).toBeNull();
  });
});

