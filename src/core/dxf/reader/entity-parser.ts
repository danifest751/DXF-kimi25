/**
 * @module core/dxf/reader/entity-parser
 * Парсер DXF-сущностей из пар код-значение.
 * Преобразует сырые группы в типизированные сущности.
 */

import {
  type DXFGroup,
  type DXFEntity,
  type DXFEntityBase,
  type DXFLineEntity,
  type DXFCircleEntity,
  type DXFArcEntity,
  type DXFEllipseEntity,
  type DXFSplineEntity,
  type DXFPolylineEntity,
  type DXFLWPolylineEntity,
  type DXFPointEntity,
  type DXFSolidEntity,
  type DXFTraceEntity,
  type DXFTextEntity,
  type DXFMTextEntity,
  type DXFHatchEntity,
  type DXFDimensionEntity,
  type DXFInsertEntity,
  type DXFImageEntity,
  type DXFViewportEntity,
  type DXF3DFaceEntity,
  type DXFXLineEntity,
  type DXFRayEntity,
  type DXFLeaderEntity,
  type DXFMLeaderEntity,
  type DXFAttdefEntity,
  type DXFAttribEntity,
  type DXFUnderlayEntity,
  type Point3D,
  type Vector3D,
  type Point2D,
  type Color,
  DXFEntityType,
} from '../../types/index.js';

/** Вспомогательная функция: получить числовое значение из группы */
function getNum(groups: DXFGroup[], code: number, defaultVal: number = 0): number {
  const g = groups.find((g) => g.code === code);
  return g !== undefined ? Number(g.value) : defaultVal;
}

/** Вспомогательная функция: получить строковое значение из группы */
function getStr(groups: DXFGroup[], code: number, defaultVal: string = ''): string {
  const g = groups.find((g) => g.code === code);
  return g !== undefined ? String(g.value) : defaultVal;
}

/** Вспомогательная функция: получить все числовые значения с данным кодом */
function getAllNum(groups: DXFGroup[], code: number): number[] {
  return groups.filter((g) => g.code === code).map((g) => Number(g.value));
}

/** Вспомогательная функция: получить 3D точку из групп */
function getPoint3D(groups: DXFGroup[], xCode: number, yCode: number, zCode: number): Point3D {
  return {
    x: getNum(groups, xCode),
    y: getNum(groups, yCode),
    z: getNum(groups, zCode),
  };
}

/** Вспомогательная функция: получить 3D вектор из групп */
function getVector3D(groups: DXFGroup[], xCode: number, yCode: number, zCode: number): Vector3D {
  return {
    dx: getNum(groups, xCode),
    dy: getNum(groups, yCode),
    dz: getNum(groups, zCode),
  };
}

/** Парсит базовые свойства сущности */
function parseEntityBase(entityType: DXFEntityType, groups: DXFGroup[]): DXFEntityBase {
  const colorIndex = getNum(groups, 62, -1);
  let color: Color | undefined;
  if (colorIndex >= 0 && colorIndex <= 255) {
    color = aciToColor(colorIndex);
  }

  return {
    type: entityType,
    handle: getStr(groups, 5),
    layer: getStr(groups, 8, '0'),
    color,
    lineType: getStr(groups, 6) || undefined,
    lineWeight: getNum(groups, 370, -1) !== -1 ? getNum(groups, 370) : undefined,
    visible: getNum(groups, 60) !== 1,
  };
}

/**
 * Преобразует ACI (AutoCAD Color Index) в RGB.
 * Упрощённая таблица для основных цветов.
 * @param index - ACI индекс (0-255)
 * @returns RGB цвет
 */
export function aciToColor(index: number): Color {
  // Основные 7 цветов AutoCAD
  const basicColors: Color[] = [
    { r: 0, g: 0, b: 0 },       // 0 - BYBLOCK
    { r: 255, g: 0, b: 0 },     // 1 - Red
    { r: 255, g: 255, b: 0 },   // 2 - Yellow
    { r: 0, g: 255, b: 0 },     // 3 - Green
    { r: 0, g: 255, b: 255 },   // 4 - Cyan
    { r: 0, g: 0, b: 255 },     // 5 - Blue
    { r: 255, g: 0, b: 255 },   // 6 - Magenta
    { r: 255, g: 255, b: 255 }, // 7 - White/Black
  ];

  if (index >= 0 && index <= 7) {
    return basicColors[index]!;
  }

  // Для индексов 8-255 используем упрощённую формулу
  if (index >= 8 && index <= 9) {
    const gray = index === 8 ? 128 : 192;
    return { r: gray, g: gray, b: gray };
  }

  // Индексы 10-249: цветовая палитра
  if (index >= 10 && index <= 249) {
    const baseIndex = Math.floor((index - 10) / 10);
    const shade = (index - 10) % 10;
    const hue = (baseIndex * 15) % 360;
    const saturation = shade < 5 ? 1.0 : 0.5;
    const lightness = 0.2 + (shade % 5) * 0.15;
    return hslToRgb(hue, saturation, lightness);
  }

  // Индексы 250-255: оттенки серого
  const grayValues = [33, 66, 99, 132, 165, 198];
  if (index >= 250 && index <= 255) {
    const gray = grayValues[index - 250]!;
    return { r: gray, g: gray, b: gray };
  }

  return { r: 255, g: 255, b: 255 };
}

/** Преобразует HSL в RGB */
function hslToRgb(h: number, s: number, l: number): Color {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;

  let r = 0, g = 0, b = 0;
  if (h < 60) { r = c; g = x; b = 0; }
  else if (h < 120) { r = x; g = c; b = 0; }
  else if (h < 180) { r = 0; g = c; b = x; }
  else if (h < 240) { r = 0; g = x; b = c; }
  else if (h < 300) { r = x; g = 0; b = c; }
  else { r = c; g = 0; b = x; }

  return {
    r: Math.round((r + m) * 255),
    g: Math.round((g + m) * 255),
    b: Math.round((b + m) * 255),
  };
}

// ─── Парсеры отдельных типов сущностей ──────────────────────────────

/** Парсит LINE */
function parseLine(groups: DXFGroup[]): DXFLineEntity {
  return {
    ...parseEntityBase(DXFEntityType.LINE, groups),
    type: DXFEntityType.LINE,
    start: getPoint3D(groups, 10, 20, 30),
    end: getPoint3D(groups, 11, 21, 31),
  };
}

/** Парсит XLINE */
function parseXLine(groups: DXFGroup[]): DXFXLineEntity {
  return {
    ...parseEntityBase(DXFEntityType.XLINE, groups),
    type: DXFEntityType.XLINE,
    basePoint: getPoint3D(groups, 10, 20, 30),
    direction: getVector3D(groups, 11, 21, 31),
  };
}

/** Парсит RAY */
function parseRay(groups: DXFGroup[]): DXFRayEntity {
  return {
    ...parseEntityBase(DXFEntityType.RAY, groups),
    type: DXFEntityType.RAY,
    basePoint: getPoint3D(groups, 10, 20, 30),
    direction: getVector3D(groups, 11, 21, 31),
  };
}

/** Парсит CIRCLE */
function parseCircle(groups: DXFGroup[]): DXFCircleEntity {
  return {
    ...parseEntityBase(DXFEntityType.CIRCLE, groups),
    type: DXFEntityType.CIRCLE,
    center: getPoint3D(groups, 10, 20, 30),
    radius: getNum(groups, 40),
  };
}

/** Парсит ARC */
function parseArc(groups: DXFGroup[]): DXFArcEntity {
  return {
    ...parseEntityBase(DXFEntityType.ARC, groups),
    type: DXFEntityType.ARC,
    center: getPoint3D(groups, 10, 20, 30),
    radius: getNum(groups, 40),
    startAngle: getNum(groups, 50),
    endAngle: getNum(groups, 51),
  };
}

/** Парсит ELLIPSE */
function parseEllipse(groups: DXFGroup[]): DXFEllipseEntity {
  return {
    ...parseEntityBase(DXFEntityType.ELLIPSE, groups),
    type: DXFEntityType.ELLIPSE,
    center: getPoint3D(groups, 10, 20, 30),
    majorAxis: getVector3D(groups, 11, 21, 31),
    minorAxisRatio: getNum(groups, 40),
    startAngle: getNum(groups, 41),
    endAngle: getNum(groups, 42, Math.PI * 2),
  };
}

/** Парсит SPLINE */
function parseSpline(groups: DXFGroup[]): DXFSplineEntity {
  const xCoords = getAllNum(groups, 10);
  const yCoords = getAllNum(groups, 20);
  const zCoords = getAllNum(groups, 30);
  const controlPoints: Point3D[] = xCoords.map((x, i) => ({
    x,
    y: yCoords[i] ?? 0,
    z: zCoords[i] ?? 0,
  }));

  return {
    ...parseEntityBase(DXFEntityType.SPLINE, groups),
    type: DXFEntityType.SPLINE,
    degree: getNum(groups, 71, 3),
    controlPoints,
    knots: getAllNum(groups, 40),
    weights: getAllNum(groups, 41),
    closed: (getNum(groups, 70) & 1) !== 0,
    periodic: (getNum(groups, 70) & 2) !== 0,
  };
}

/** Парсит POLYLINE */
function parsePolyline(groups: DXFGroup[]): DXFPolylineEntity {
  const flags = getNum(groups, 70);
  const xCoords = getAllNum(groups, 10);
  const yCoords = getAllNum(groups, 20);
  const zCoords = getAllNum(groups, 30);
  const vertices: Point3D[] = xCoords.map((x, i) => ({
    x,
    y: yCoords[i] ?? 0,
    z: zCoords[i] ?? 0,
  }));

  return {
    ...parseEntityBase(DXFEntityType.POLYLINE, groups),
    type: DXFEntityType.POLYLINE,
    vertices,
    closed: (flags & 1) !== 0,
    is3D: (flags & 8) !== 0,
    isMesh: (flags & 16) !== 0,
    isPolyface: (flags & 64) !== 0,
  };
}

/** Парсит LWPOLYLINE */
function parseLWPolyline(groups: DXFGroup[]): DXFLWPolylineEntity {
  const xCoords = getAllNum(groups, 10);
  const yCoords = getAllNum(groups, 20);
  const vertices: Point2D[] = xCoords.map((x, i) => ({
    x,
    y: yCoords[i] ?? 0,
  }));

  const bulges = getAllNum(groups, 42);
  const widths = getAllNum(groups, 40);

  return {
    ...parseEntityBase(DXFEntityType.LWPOLYLINE, groups),
    type: DXFEntityType.LWPOLYLINE,
    vertices,
    closed: (getNum(groups, 70) & 1) !== 0,
    constantWidth: getNum(groups, 43) || undefined,
    widths: widths.length > 0 ? widths : undefined,
    bulges: bulges.length > 0 ? bulges : undefined,
  };
}

/** Парсит POINT */
function parsePoint(groups: DXFGroup[]): DXFPointEntity {
  return {
    ...parseEntityBase(DXFEntityType.POINT, groups),
    type: DXFEntityType.POINT,
    location: getPoint3D(groups, 10, 20, 30),
  };
}

/** Парсит SOLID */
function parseSolid(groups: DXFGroup[]): DXFSolidEntity {
  return {
    ...parseEntityBase(DXFEntityType.SOLID, groups),
    type: DXFEntityType.SOLID,
    points: [
      getPoint3D(groups, 10, 20, 30),
      getPoint3D(groups, 11, 21, 31),
      getPoint3D(groups, 12, 22, 32),
      getPoint3D(groups, 13, 23, 33),
    ],
  };
}

/** Парсит TRACE */
function parseTrace(groups: DXFGroup[]): DXFTraceEntity {
  return {
    ...parseEntityBase(DXFEntityType.TRACE, groups),
    type: DXFEntityType.TRACE,
    points: [
      getPoint3D(groups, 10, 20, 30),
      getPoint3D(groups, 11, 21, 31),
      getPoint3D(groups, 12, 22, 32),
      getPoint3D(groups, 13, 23, 33),
    ],
  };
}

/** Парсит TEXT */
function parseText(groups: DXFGroup[]): DXFTextEntity {
  return {
    ...parseEntityBase(DXFEntityType.TEXT, groups),
    type: DXFEntityType.TEXT,
    position: getPoint3D(groups, 10, 20, 30),
    text: getStr(groups, 1),
    height: getNum(groups, 40),
    rotation: getNum(groups, 50),
    style: getStr(groups, 7, 'Standard'),
    alignment: getNum(groups, 72),
    widthFactor: getNum(groups, 41, 1),
    obliqueAngle: getNum(groups, 51),
  };
}

/** Парсит MTEXT */
function parseMText(groups: DXFGroup[]): DXFMTextEntity {
  // MTEXT может иметь текст разбитый на несколько групп с кодом 3 и 1
  const textParts = groups
    .filter((g) => g.code === 3 || g.code === 1)
    .map((g) => String(g.value));
  const fullText = textParts.join('');

  return {
    ...parseEntityBase(DXFEntityType.MTEXT, groups),
    type: DXFEntityType.MTEXT,
    position: getPoint3D(groups, 10, 20, 30),
    text: fullText,
    height: getNum(groups, 40),
    width: getNum(groups, 41),
    attachment: getNum(groups, 71, 1),
    direction: getVector3D(groups, 11, 21, 31),
    style: getStr(groups, 7, 'Standard'),
    lineSpacing: getNum(groups, 44, 1),
    rotation: getNum(groups, 50),
  };
}

/** Парсит HATCH */
function parseHatch(groups: DXFGroup[]): DXFHatchEntity {
  // Упрощённый парсинг HATCH — границы как массив точек
  const xCoords = getAllNum(groups, 10);
  const yCoords = getAllNum(groups, 20);
  const zCoords = getAllNum(groups, 30);
  const boundary: Point3D[] = xCoords.map((x, i) => ({
    x,
    y: yCoords[i] ?? 0,
    z: zCoords[i] ?? 0,
  }));

  return {
    ...parseEntityBase(DXFEntityType.HATCH, groups),
    type: DXFEntityType.HATCH,
    patternName: getStr(groups, 2),
    patternScale: getNum(groups, 41, 1),
    patternAngle: getNum(groups, 52),
    solid: getNum(groups, 70) === 1,
    boundaries: boundary.length > 0 ? [boundary] : [],
  };
}

/** Парсит DIMENSION */
function parseDimension(groups: DXFGroup[]): DXFDimensionEntity {
  return {
    ...parseEntityBase(DXFEntityType.DIMENSION, groups),
    type: DXFEntityType.DIMENSION,
    dimType: getNum(groups, 70),
    definitionPoint: getPoint3D(groups, 10, 20, 30),
    textMidpoint: getPoint3D(groups, 11, 21, 31),
    text: getStr(groups, 1),
    style: getStr(groups, 3, 'Standard'),
  };
}

/** Парсит LEADER */
function parseLeader(groups: DXFGroup[]): DXFLeaderEntity {
  const xCoords = getAllNum(groups, 10);
  const yCoords = getAllNum(groups, 20);
  const zCoords = getAllNum(groups, 30);
  const vertices: Point3D[] = xCoords.map((x, i) => ({
    x,
    y: yCoords[i] ?? 0,
    z: zCoords[i] ?? 0,
  }));

  return {
    ...parseEntityBase(DXFEntityType.LEADER, groups),
    type: DXFEntityType.LEADER,
    vertices,
    annotation: getStr(groups, 1),
    style: getStr(groups, 3, 'Standard'),
  };
}

/** Парсит MLEADER */
function parseMLeader(groups: DXFGroup[]): DXFMLeaderEntity {
  const xCoords = getAllNum(groups, 10);
  const yCoords = getAllNum(groups, 20);
  const zCoords = getAllNum(groups, 30);
  const vertices: Point3D[] = xCoords.map((x, i) => ({
    x,
    y: yCoords[i] ?? 0,
    z: zCoords[i] ?? 0,
  }));

  return {
    ...parseEntityBase(DXFEntityType.MLEADER, groups),
    type: DXFEntityType.MLEADER,
    vertices,
    text: getStr(groups, 1),
    style: getStr(groups, 3, 'Standard'),
  };
}

/** Парсит INSERT */
function parseInsert(groups: DXFGroup[]): DXFInsertEntity {
  return {
    ...parseEntityBase(DXFEntityType.INSERT, groups),
    type: DXFEntityType.INSERT,
    blockName: getStr(groups, 2),
    position: getPoint3D(groups, 10, 20, 30),
    scale: {
      dx: getNum(groups, 41, 1),
      dy: getNum(groups, 42, 1),
      dz: getNum(groups, 43, 1),
    },
    rotation: getNum(groups, 50),
    columnCount: getNum(groups, 70, 1),
    rowCount: getNum(groups, 71, 1),
    columnSpacing: getNum(groups, 44),
    rowSpacing: getNum(groups, 45),
    attributes: [], // Атрибуты парсятся отдельно при обработке SEQEND
  };
}

/** Парсит ATTDEF */
function parseAttdef(groups: DXFGroup[]): DXFAttdefEntity {
  return {
    ...parseEntityBase(DXFEntityType.ATTDEF, groups),
    type: DXFEntityType.ATTDEF,
    tag: getStr(groups, 2),
    prompt: getStr(groups, 3),
    defaultValue: getStr(groups, 1),
    position: getPoint3D(groups, 10, 20, 30),
    height: getNum(groups, 40),
    rotation: getNum(groups, 50),
  };
}

/** Парсит ATTRIB */
function parseAttrib(groups: DXFGroup[]): DXFAttribEntity {
  return {
    ...parseEntityBase(DXFEntityType.ATTRIB, groups),
    type: DXFEntityType.ATTRIB,
    tag: getStr(groups, 2),
    value: getStr(groups, 1),
    position: getPoint3D(groups, 10, 20, 30),
    height: getNum(groups, 40),
    rotation: getNum(groups, 50),
  };
}

/** Парсит 3DFACE */
function parse3DFace(groups: DXFGroup[]): DXF3DFaceEntity {
  const flags = getNum(groups, 70);
  return {
    ...parseEntityBase(DXFEntityType.THREE_D_FACE, groups),
    type: DXFEntityType.THREE_D_FACE,
    points: [
      getPoint3D(groups, 10, 20, 30),
      getPoint3D(groups, 11, 21, 31),
      getPoint3D(groups, 12, 22, 32),
      getPoint3D(groups, 13, 23, 33),
    ],
    edgeVisibility: [
      (flags & 1) === 0,
      (flags & 2) === 0,
      (flags & 4) === 0,
      (flags & 8) === 0,
    ],
  };
}

/** Парсит IMAGE */
function parseImage(groups: DXFGroup[]): DXFImageEntity {
  return {
    ...parseEntityBase(DXFEntityType.IMAGE, groups),
    type: DXFEntityType.IMAGE,
    position: getPoint3D(groups, 10, 20, 30),
    uVector: getVector3D(groups, 11, 21, 31),
    vVector: getVector3D(groups, 12, 22, 32),
    width: getNum(groups, 13),
    height: getNum(groups, 23),
    display: getNum(groups, 70),
    brightness: getNum(groups, 281, 50),
    contrast: getNum(groups, 282, 50),
    fade: getNum(groups, 283),
  };
}

/** Парсит UNDERLAY */
function parseUnderlay(groups: DXFGroup[]): DXFUnderlayEntity {
  const entityName = getStr(groups, 0);
  let underlayType: 'PDF' | 'DWF' | 'DGN' = 'PDF';
  if (entityName.includes('DWF')) underlayType = 'DWF';
  else if (entityName.includes('DGN')) underlayType = 'DGN';

  return {
    ...parseEntityBase(DXFEntityType.UNDERLAY, groups),
    type: DXFEntityType.UNDERLAY,
    filename: getStr(groups, 1),
    position: getPoint3D(groups, 10, 20, 30),
    scale: {
      dx: getNum(groups, 41, 1),
      dy: getNum(groups, 42, 1),
      dz: getNum(groups, 43, 1),
    },
    rotation: getNum(groups, 50),
    underlayType,
  };
}

/** Парсит VIEWPORT */
function parseViewport(groups: DXFGroup[]): DXFViewportEntity {
  return {
    ...parseEntityBase(DXFEntityType.VIEWPORT, groups),
    type: DXFEntityType.VIEWPORT,
    center: getPoint3D(groups, 10, 20, 30),
    width: getNum(groups, 40),
    height: getNum(groups, 41),
    viewDirection: getVector3D(groups, 16, 26, 36),
    viewTarget: getPoint3D(groups, 17, 27, 37),
  };
}

/**
 * Маппинг имён сущностей DXF на типы.
 */
const ENTITY_NAME_MAP: Record<string, DXFEntityType> = {
  'LINE': DXFEntityType.LINE,
  'XLINE': DXFEntityType.XLINE,
  'RAY': DXFEntityType.RAY,
  'CIRCLE': DXFEntityType.CIRCLE,
  'ARC': DXFEntityType.ARC,
  'ELLIPSE': DXFEntityType.ELLIPSE,
  'SPLINE': DXFEntityType.SPLINE,
  'POLYLINE': DXFEntityType.POLYLINE,
  'LWPOLYLINE': DXFEntityType.LWPOLYLINE,
  'POINT': DXFEntityType.POINT,
  'SOLID': DXFEntityType.SOLID,
  'TRACE': DXFEntityType.TRACE,
  'HATCH': DXFEntityType.HATCH,
  'TEXT': DXFEntityType.TEXT,
  'MTEXT': DXFEntityType.MTEXT,
  'DIMENSION': DXFEntityType.DIMENSION,
  'LEADER': DXFEntityType.LEADER,
  'MLEADER': DXFEntityType.MLEADER,
  'MULTILEADER': DXFEntityType.MLEADER,
  'INSERT': DXFEntityType.INSERT,
  'ATTDEF': DXFEntityType.ATTDEF,
  'ATTRIB': DXFEntityType.ATTRIB,
  '3DFACE': DXFEntityType.THREE_D_FACE,
  'IMAGE': DXFEntityType.IMAGE,
  'PDFUNDERLAY': DXFEntityType.UNDERLAY,
  'DWFUNDERLAY': DXFEntityType.UNDERLAY,
  'DGNUNDERLAY': DXFEntityType.UNDERLAY,
  'VIEWPORT': DXFEntityType.VIEWPORT,
};

/**
 * Парсит одну сущность из массива групп.
 * @param entityName - Имя типа сущности (из группы с кодом 0)
 * @param groups - Группы, принадлежащие этой сущности
 * @returns Типизированная сущность или null если тип не поддерживается
 */
export function parseEntity(entityName: string, groups: DXFGroup[]): DXFEntity | null {
  const entityType = ENTITY_NAME_MAP[entityName.toUpperCase()];
  if (entityType === undefined) {
    return null; // Неподдерживаемый тип — пропускаем
  }

  switch (entityType) {
    case DXFEntityType.LINE: return parseLine(groups);
    case DXFEntityType.XLINE: return parseXLine(groups);
    case DXFEntityType.RAY: return parseRay(groups);
    case DXFEntityType.CIRCLE: return parseCircle(groups);
    case DXFEntityType.ARC: return parseArc(groups);
    case DXFEntityType.ELLIPSE: return parseEllipse(groups);
    case DXFEntityType.SPLINE: return parseSpline(groups);
    case DXFEntityType.POLYLINE: return parsePolyline(groups);
    case DXFEntityType.LWPOLYLINE: return parseLWPolyline(groups);
    case DXFEntityType.POINT: return parsePoint(groups);
    case DXFEntityType.SOLID: return parseSolid(groups);
    case DXFEntityType.TRACE: return parseTrace(groups);
    case DXFEntityType.HATCH: return parseHatch(groups);
    case DXFEntityType.TEXT: return parseText(groups);
    case DXFEntityType.MTEXT: return parseMText(groups);
    case DXFEntityType.DIMENSION: return parseDimension(groups);
    case DXFEntityType.LEADER: return parseLeader(groups);
    case DXFEntityType.MLEADER: return parseMLeader(groups);
    case DXFEntityType.INSERT: return parseInsert(groups);
    case DXFEntityType.ATTDEF: return parseAttdef(groups);
    case DXFEntityType.ATTRIB: return parseAttrib(groups);
    case DXFEntityType.THREE_D_FACE: return parse3DFace(groups);
    case DXFEntityType.IMAGE: return parseImage(groups);
    case DXFEntityType.UNDERLAY: return parseUnderlay(groups);
    case DXFEntityType.VIEWPORT: return parseViewport(groups);
    default:
      return null;
  }
}

/**
 * Парсит секцию ENTITIES в массив типизированных сущностей.
 * Разбивает группы на блоки по маркерам (код 0).
 * @param sectionGroups - Группы из секции ENTITIES
 * @returns Массив типизированных сущностей
 */
export function parseEntitiesSection(sectionGroups: readonly DXFGroup[]): DXFEntity[] {
  const entities: DXFEntity[] = [];
  let currentEntityName: string | null = null;
  let currentGroups: DXFGroup[] = [];

  for (const group of sectionGroups) {
    if (group.code === 0) {
      // Завершаем предыдущую сущность
      if (currentEntityName !== null && currentGroups.length > 0) {
        const entity = parseEntity(currentEntityName, currentGroups);
        if (entity !== null) {
          entities.push(entity);
        }
      }
      currentEntityName = String(group.value);
      currentGroups = [];
    } else {
      currentGroups.push(group);
    }
  }

  // Последняя сущность
  if (currentEntityName !== null && currentGroups.length > 0) {
    const entity = parseEntity(currentEntityName, currentGroups);
    if (entity !== null) {
      entities.push(entity);
    }
  }

  return entities;
}
