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
 * Полная таблица AutoCAD Color Index (ACI) 0–255 → RGB.
 * Источник: официальная спецификация AutoCAD DXF (Autodesk).
 * Индекс 0 = BYBLOCK (чёрный), 256 = BYLAYER (не в этой таблице).
 */
// prettier-ignore
const ACI_TABLE: readonly [number, number, number][] = [
  [  0,   0,   0], // 0  BYBLOCK
  [255,   0,   0], // 1  Red
  [255, 255,   0], // 2  Yellow
  [  0, 255,   0], // 3  Green
  [  0, 255, 255], // 4  Cyan
  [  0,   0, 255], // 5  Blue
  [255,   0, 255], // 6  Magenta
  [255, 255, 255], // 7  White
  [128, 128, 128], // 8  Dark gray
  [192, 192, 192], // 9  Light gray
  [255,   0,   0], // 10
  [255, 127, 127], // 11
  [165,   0,   0], // 12
  [165,  82,  82], // 13
  [127,   0,   0], // 14
  [127,  63,  63], // 15
  [ 76,   0,   0], // 16
  [ 76,  38,  38], // 17
  [ 38,   0,   0], // 18
  [ 38,  19,  19], // 19
  [255,  63,   0], // 20
  [255, 159, 127], // 21
  [165,  41,   0], // 22
  [165, 103,  82], // 23
  [127,  31,   0], // 24
  [127,  79,  63], // 25
  [ 76,  19,   0], // 26
  [ 76,  47,  38], // 27
  [ 38,   9,   0], // 28
  [ 38,  24,  19], // 29
  [255, 127,   0], // 30
  [255, 191, 127], // 31
  [165,  82,   0], // 32
  [165, 124,  82], // 33
  [127,  63,   0], // 34
  [127,  95,  63], // 35
  [ 76,  38,   0], // 36
  [ 76,  57,  38], // 37
  [ 38,  19,   0], // 38
  [ 38,  28,  19], // 39
  [255, 191,   0], // 40
  [255, 223, 127], // 41
  [165, 124,   0], // 42
  [165, 145,  82], // 43
  [127,  95,   0], // 44
  [127, 111,  63], // 45
  [ 76,  57,   0], // 46
  [ 76,  66,  38], // 47
  [ 38,  28,   0], // 48
  [ 38,  33,  19], // 49
  [255, 255,   0], // 50
  [255, 255, 127], // 51
  [165, 165,   0], // 52
  [165, 165,  82], // 53
  [127, 127,   0], // 54
  [127, 127,  63], // 55
  [ 76,  76,   0], // 56
  [ 76,  76,  38], // 57
  [ 38,  38,   0], // 58
  [ 38,  38,  19], // 59
  [191, 255,   0], // 60
  [223, 255, 127], // 61
  [124, 165,   0], // 62
  [145, 165,  82], // 63
  [ 95, 127,   0], // 64
  [111, 127,  63], // 65
  [ 57,  76,   0], // 66
  [ 66,  76,  38], // 67
  [ 28,  38,   0], // 68
  [ 33,  38,  19], // 69
  [127, 255,   0], // 70
  [191, 255, 127], // 71
  [ 82, 165,   0], // 72
  [124, 165,  82], // 73
  [ 63, 127,   0], // 74
  [ 95, 127,  63], // 75
  [ 38,  76,   0], // 76
  [ 57,  76,  38], // 77
  [ 19,  38,   0], // 78
  [ 28,  38,  19], // 79
  [ 63, 255,   0], // 80
  [159, 255, 127], // 81
  [ 41, 165,   0], // 82
  [103, 165,  82], // 83
  [ 31, 127,   0], // 84
  [ 79, 127,  63], // 85
  [ 19,  76,   0], // 86
  [ 47,  76,  38], // 87
  [  9,  38,   0], // 88
  [ 24,  38,  19], // 89
  [  0, 255,   0], // 90
  [127, 255, 127], // 91
  [  0, 165,   0], // 92
  [ 82, 165,  82], // 93
  [  0, 127,   0], // 94
  [ 63, 127,  63], // 95
  [  0,  76,   0], // 96
  [ 38,  76,  38], // 97
  [  0,  38,   0], // 98
  [ 19,  38,  19], // 99
  [  0, 255,  63], // 100
  [127, 255, 159], // 101
  [  0, 165,  41], // 102
  [ 82, 165, 103], // 103
  [  0, 127,  31], // 104
  [ 63, 127,  79], // 105
  [  0,  76,  19], // 106
  [ 38,  76,  47], // 107
  [  0,  38,   9], // 108
  [ 19,  38,  24], // 109
  [  0, 255, 127], // 110
  [127, 255, 191], // 111
  [  0, 165,  82], // 112
  [ 82, 165, 124], // 113
  [  0, 127,  63], // 114
  [ 63, 127,  95], // 115
  [  0,  76,  38], // 116
  [ 38,  76,  57], // 117
  [  0,  38,  19], // 118
  [ 19,  38,  28], // 119
  [  0, 255, 191], // 120
  [127, 255, 223], // 121
  [  0, 165, 124], // 122
  [ 82, 165, 145], // 123
  [  0, 127,  95], // 124
  [ 63, 127, 111], // 125
  [  0,  76,  57], // 126
  [ 38,  76,  66], // 127
  [  0,  38,  28], // 128
  [ 19,  38,  33], // 129
  [  0, 255, 255], // 130
  [127, 255, 255], // 131
  [  0, 165, 165], // 132
  [ 82, 165, 165], // 133
  [  0, 127, 127], // 134
  [ 63, 127, 127], // 135
  [  0,  76,  76], // 136
  [ 38,  76,  76], // 137
  [  0,  38,  38], // 138
  [ 19,  38,  38], // 139
  [  0, 191, 255], // 140
  [127, 223, 255], // 141
  [  0, 124, 165], // 142
  [ 82, 145, 165], // 143
  [  0,  95, 127], // 144
  [ 63, 111, 127], // 145
  [  0,  57,  76], // 146
  [ 38,  66,  76], // 147
  [  0,  28,  38], // 148
  [ 19,  33,  38], // 149
  [  0, 127, 255], // 150
  [127, 191, 255], // 151
  [  0,  82, 165], // 152
  [ 82, 124, 165], // 153
  [  0,  63, 127], // 154
  [ 63,  95, 127], // 155
  [  0,  38,  76], // 156
  [ 38,  57,  76], // 157
  [  0,  19,  38], // 158
  [ 19,  28,  38], // 159
  [  0,  63, 255], // 160
  [127, 159, 255], // 161
  [  0,  41, 165], // 162
  [ 82, 103, 165], // 163
  [  0,  31, 127], // 164
  [ 63,  79, 127], // 165
  [  0,  19,  76], // 166
  [ 38,  47,  76], // 167
  [  0,   9,  38], // 168
  [ 19,  24,  38], // 169
  [  0,   0, 255], // 170
  [127, 127, 255], // 171
  [  0,   0, 165], // 172
  [ 82,  82, 165], // 173
  [  0,   0, 127], // 174
  [ 63,  63, 127], // 175
  [  0,   0,  76], // 176
  [ 38,  38,  76], // 177
  [  0,   0,  38], // 178
  [ 19,  19,  38], // 179
  [ 63,   0, 255], // 180
  [159, 127, 255], // 181
  [ 41,   0, 165], // 182
  [103,  82, 165], // 183
  [ 31,   0, 127], // 184
  [ 79,  63, 127], // 185
  [ 19,   0,  76], // 186
  [ 47,  38,  76], // 187
  [  9,   0,  38], // 188
  [ 24,  19,  38], // 189
  [127,   0, 255], // 190
  [191, 127, 255], // 191
  [ 82,   0, 165], // 192
  [124,  82, 165], // 193
  [ 63,   0, 127], // 194
  [ 95,  63, 127], // 195
  [ 38,   0,  76], // 196
  [ 57,  38,  76], // 197
  [ 19,   0,  38], // 198
  [ 28,  19,  38], // 199
  [191,   0, 255], // 200
  [223, 127, 255], // 201
  [124,   0, 165], // 202
  [145,  82, 165], // 203
  [ 95,   0, 127], // 204
  [111,  63, 127], // 205
  [ 57,   0,  76], // 206
  [ 66,  38,  76], // 207
  [ 28,   0,  38], // 208
  [ 33,  19,  38], // 209
  [255,   0, 255], // 210
  [255, 127, 255], // 211
  [165,   0, 165], // 212
  [165,  82, 165], // 213
  [127,   0, 127], // 214
  [127,  63, 127], // 215
  [ 76,   0,  76], // 216
  [ 76,  38,  76], // 217
  [ 38,   0,  38], // 218
  [ 38,  19,  38], // 219
  [255,   0, 191], // 220
  [255, 127, 223], // 221
  [165,   0, 124], // 222
  [165,  82, 145], // 223
  [127,   0,  95], // 224
  [127,  63, 111], // 225
  [ 76,   0,  57], // 226
  [ 76,  38,  66], // 227
  [ 38,   0,  28], // 228
  [ 38,  19,  33], // 229
  [255,   0, 127], // 230
  [255, 127, 191], // 231
  [165,   0,  82], // 232
  [165,  82, 124], // 233
  [127,   0,  63], // 234
  [127,  63,  95], // 235
  [ 76,   0,  38], // 236
  [ 76,  38,  57], // 237
  [ 38,   0,  19], // 238
  [ 38,  19,  28], // 239
  [255,   0,  63], // 240
  [255, 127, 159], // 241
  [165,   0,  41], // 242
  [165,  82, 103], // 243
  [127,   0,  31], // 244
  [127,  63,  79], // 245
  [ 76,   0,  19], // 246
  [ 76,  38,  47], // 247
  [ 38,   0,   9], // 248
  [ 38,  19,  24], // 249
  [ 33,  33,  33], // 250
  [ 66,  66,  66], // 251
  [100, 100, 100], // 252
  [133, 133, 133], // 253
  [166, 166, 166], // 254
  [200, 200, 200], // 255
];

/**
 * Преобразует ACI (AutoCAD Color Index) в RGB.
 * Использует полную официальную таблицу AutoCAD (256 значений).
 * @param index - ACI индекс (0-255)
 * @returns RGB цвет
 */
export function aciToColor(index: number): Color {
  const i = Math.max(0, Math.min(255, Math.trunc(index)));
  const entry = ACI_TABLE[i]!;
  return { r: entry[0], g: entry[1], b: entry[2] };
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
  const flags = getNum(groups, 70);
  // Контрольные точки: code 10/20/30
  const cpX = getAllNum(groups, 10);
  const cpY = getAllNum(groups, 20);
  const cpZ = getAllNum(groups, 30);
  let controlPoints: Point3D[] = cpX.map((x, i) => ({
    x,
    y: cpY[i] ?? 0,
    z: cpZ[i] ?? 0,
  }));

  // Fit-точки: code 11/21/31 — используются как fallback если нет контрольных
  if (controlPoints.length === 0) {
    const fpX = getAllNum(groups, 11);
    const fpY = getAllNum(groups, 21);
    const fpZ = getAllNum(groups, 31);
    controlPoints = fpX.map((x, i) => ({
      x,
      y: fpY[i] ?? 0,
      z: fpZ[i] ?? 0,
    }));
  }

  return {
    ...parseEntityBase(DXFEntityType.SPLINE, groups),
    type: DXFEntityType.SPLINE,
    degree: getNum(groups, 71, 3),
    controlPoints,
    knots: getAllNum(groups, 40),
    weights: getAllNum(groups, 41),
    closed: (flags & 1) !== 0,
    periodic: (flags & 2) !== 0,
  };
}

/** Парсит POLYLINE (заголовок; вершины приходят снаружи через vertices) */
export function parsePolylineHeader(groups: DXFGroup[]): DXFPolylineEntity {
  const flags = getNum(groups, 70);
  return {
    ...parseEntityBase(DXFEntityType.POLYLINE, groups),
    type: DXFEntityType.POLYLINE,
    vertices: [], // будут заполнены VERTEX-сущностями в parseEntitiesSection
    closed: (flags & 1) !== 0,
    is3D: (flags & 8) !== 0,
    isMesh: (flags & 16) !== 0,
    isPolyface: (flags & 64) !== 0,
  };
}

/** Парсит одну VERTEX-сущность (R12) */
function parseVertex(groups: DXFGroup[]): Point3D {
  return getPoint3D(groups, 10, 20, 30);
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

/**
 * Тесселирует дугу в массив 3D точек для использования в контуре HATCH.
 */
function tessellateHatchArc(
  cx: number, cy: number, r: number,
  startDeg: number, endDeg: number, ccw: boolean,
  segments: number,
): Point3D[] {
  const startRad = (startDeg * Math.PI) / 180;
  let endRad = (endDeg * Math.PI) / 180;
  if (ccw) {
    if (endRad <= startRad) endRad += Math.PI * 2;
  } else {
    if (endRad >= startRad) endRad -= Math.PI * 2;
  }
  const pts: Point3D[] = [];
  const step = (endRad - startRad) / segments;
  for (let i = 0; i <= segments; i++) {
    const a = startRad + step * i;
    pts.push({ x: cx + r * Math.cos(a), y: cy + r * Math.sin(a), z: 0 });
  }
  return pts;
}

/**
 * Парсит HATCH — полноценный парсер boundary loops.
 * Поддерживает LINE, ARC, ELLIPSE, SPLINE рёбра.
 * Структура: 91 = число loops → [92 (тип) → 93 (число рёбер) → рёбра]
 */
function parseHatch(groups: DXFGroup[]): DXFHatchEntity {
  const boundaries: Point3D[][] = [];
  const numLoops = getNum(groups, 91, 0);

  if (numLoops > 0) {
    // Полноценный парсинг через индексы групп
    let i = 0;
    const grps = groups as DXFGroup[];

    // Найти начало первого loop (код 91)
    while (i < grps.length && grps[i]!.code !== 91) i++;
    if (i < grps.length) i++; // пропускаем саму группу 91

    for (let loop = 0; loop < numLoops; loop++) {
      // Пропускаем до кода 92 (тип loop)
      while (i < grps.length && grps[i]!.code !== 92) i++;
      if (i >= grps.length) break;
      const loopType = Number(grps[i]!.value);
      i++;

      const isPolylineBoundary = (loopType & 2) !== 0;
      const boundary: Point3D[] = [];

      if (isPolylineBoundary) {
        // Полилинейная граница: код 93 = число вершин, потом 10/20 пары
        while (i < grps.length && grps[i]!.code !== 93) i++;
        if (i >= grps.length) break;
        const numVerts = Number(grps[i]!.value);
        i++;
        for (let v = 0; v < numVerts; v++) {
          let x = 0, y = 0;
          while (i < grps.length) {
            const c = grps[i]!.code;
            if (c === 10) { x = Number(grps[i]!.value); i++; }
            else if (c === 20) { y = Number(grps[i]!.value); i++; break; }
            else break;
          }
          boundary.push({ x, y, z: 0 });
        }
      } else {
        // Edge-based boundary: код 93 = число рёбер
        while (i < grps.length && grps[i]!.code !== 93) i++;
        if (i >= grps.length) break;
        const numEdges = Number(grps[i]!.value);
        i++;

        for (let e = 0; e < numEdges; e++) {
          // Код 72 = тип ребра: 1=LINE, 2=ARC, 3=ELLIPSE, 4=SPLINE
          while (i < grps.length && grps[i]!.code !== 72) i++;
          if (i >= grps.length) break;
          const edgeType = Number(grps[i]!.value);
          i++;

          if (edgeType === 1) {
            // LINE: 10/20=start, 11/21=end
            let x1 = 0, y1 = 0, x2 = 0, y2 = 0;
            const end = Math.min(i + 8, grps.length);
            for (let j = i; j < end; j++) {
              const c = grps[j]!.code;
              if (c === 10) x1 = Number(grps[j]!.value);
              else if (c === 20) y1 = Number(grps[j]!.value);
              else if (c === 11) x2 = Number(grps[j]!.value);
              else if (c === 21) { y2 = Number(grps[j]!.value); i = j + 1; break; }
            }
            boundary.push({ x: x1, y: y1, z: 0 });
            boundary.push({ x: x2, y: y2, z: 0 });
          } else if (edgeType === 2) {
            // ARC: 10/20=center, 40=radius, 50=startAngle, 51=endAngle, 73=ccw
            let cx = 0, cy = 0, r = 1, startDeg = 0, endDeg = 360, ccw = true;
            const end = Math.min(i + 12, grps.length);
            for (let j = i; j < end; j++) {
              const c = grps[j]!.code;
              if (c === 10) cx = Number(grps[j]!.value);
              else if (c === 20) cy = Number(grps[j]!.value);
              else if (c === 40) r = Number(grps[j]!.value);
              else if (c === 50) startDeg = Number(grps[j]!.value);
              else if (c === 51) endDeg = Number(grps[j]!.value);
              else if (c === 73) { ccw = Number(grps[j]!.value) !== 0; i = j + 1; break; }
            }
            const pts = tessellateHatchArc(cx, cy, r, startDeg, endDeg, ccw, 16);
            boundary.push(...pts);
          } else if (edgeType === 3) {
            // ELLIPSE: 10/20=center, 11/21=majorEnd, 40=minorRatio, 50/51=startEnd, 73=ccw
            let cx = 0, cy = 0, mx = 1, my = 0, ratio = 1;
            let startParam = 0, endParam = Math.PI * 2;
            const end = Math.min(i + 16, grps.length);
            for (let j = i; j < end; j++) {
              const c = grps[j]!.code;
              if (c === 10) cx = Number(grps[j]!.value);
              else if (c === 20) cy = Number(grps[j]!.value);
              else if (c === 11) mx = Number(grps[j]!.value);
              else if (c === 21) my = Number(grps[j]!.value);
              else if (c === 40) ratio = Number(grps[j]!.value);
              else if (c === 50) startParam = (Number(grps[j]!.value) * Math.PI) / 180;
              else if (c === 51) endParam = (Number(grps[j]!.value) * Math.PI) / 180;
              else if (c === 73) { i = j + 1; break; }
            }
            const majorLen = Math.hypot(mx, my);
            const minorLen = majorLen * ratio;
            const axisAngle = Math.atan2(my, mx);
            const step = (endParam - startParam) / 16;
            for (let k = 0; k <= 16; k++) {
              const t = startParam + step * k;
              const ex = cx + Math.cos(axisAngle) * majorLen * Math.cos(t) - Math.sin(axisAngle) * minorLen * Math.sin(t);
              const ey = cy + Math.sin(axisAngle) * majorLen * Math.cos(t) + Math.cos(axisAngle) * minorLen * Math.sin(t);
              boundary.push({ x: ex, y: ey, z: 0 });
            }
          } else if (edgeType === 4) {
            // SPLINE: 94=degree, 73=rational, 74=periodic, 95=nKnots, 96=nCtrl
            // 40=knots, 10/20=controlPoints, 42=weights
            let degree = 3;
            let nKnots = 0, nCtrl = 0;
            const knots: number[] = [];
            const ctrlX: number[] = [], ctrlY: number[] = [];
            const weights: number[] = [];
            const end = Math.min(i + 200, grps.length);
            for (let j = i; j < end; j++) {
              const c = grps[j]!.code;
              if (c === 94) degree = Number(grps[j]!.value);
              else if (c === 95) nKnots = Number(grps[j]!.value);
              else if (c === 96) nCtrl = Number(grps[j]!.value);
              else if (c === 40) knots.push(Number(grps[j]!.value));
              else if (c === 10) ctrlX.push(Number(grps[j]!.value));
              else if (c === 20) ctrlY.push(Number(grps[j]!.value));
              else if (c === 42) weights.push(Number(grps[j]!.value));
              else if (c === 72 || c === 97) { i = j; break; } // следующее ребро
            }
            if (nKnots > 0 && knots.length >= nKnots) knots.length = nKnots;
            if (nCtrl > 0 && ctrlX.length >= nCtrl) { ctrlX.length = nCtrl; ctrlY.length = nCtrl; }
            const ctrlPts = ctrlX.map((x, k) => ({ x, y: ctrlY[k] ?? 0, z: 0 }));
            // Простая линейная аппроксимация контрольных точек сплайна для bbox
            for (const pt of ctrlPts) boundary.push(pt);
          }
        }
      }

      if (boundary.length > 0) boundaries.push(boundary);

      // Пропускаем до следующего loop или конца данных о границах
      // Код 97 = число source boundary объектов (пропускаем)
      while (i < grps.length && grps[i]!.code === 97) {
        const count = Number(grps[i]!.value);
        i += 1 + count;
      }
    }
  }

  // Fallback: если boundary не удалось распарсить — берём все code 10/20
  if (boundaries.length === 0) {
    const xCoords = getAllNum(groups, 10);
    const yCoords = getAllNum(groups, 20);
    const fallback: Point3D[] = xCoords.map((x, idx) => ({
      x, y: yCoords[idx] ?? 0, z: 0,
    }));
    if (fallback.length > 0) boundaries.push(fallback);
  }

  return {
    ...parseEntityBase(DXFEntityType.HATCH, groups),
    type: DXFEntityType.HATCH,
    patternName: getStr(groups, 2),
    patternScale: getNum(groups, 41, 1),
    patternAngle: getNum(groups, 52),
    solid: getNum(groups, 70) === 1,
    boundaries,
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
    case DXFEntityType.POLYLINE: return parsePolylineHeader(groups);
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

  // Текущий открытый POLYLINE (R12: вершины идут как отдельные VERTEX до SEQEND)
  let openPolyline: DXFPolylineEntity | null = null;

  const flushCurrent = (): void => {
    if (currentEntityName === null || currentGroups.length === 0) return;

    const name = currentEntityName;

    if (name === 'VERTEX' && openPolyline !== null) {
      // Добавляем вершину в открытый POLYLINE
      const pt = parseVertex(currentGroups);
      (openPolyline.vertices as Point3D[]).push(pt);
    } else if (name === 'SEQEND') {
      // Закрываем POLYLINE — он уже в entities
      openPolyline = null;
    } else {
      const entity = parseEntity(name, currentGroups);
      if (entity !== null) {
        entities.push(entity);
        if (entity.type === DXFEntityType.POLYLINE) {
          openPolyline = entity as DXFPolylineEntity;
        } else {
          openPolyline = null;
        }
      }
    }
  };

  for (const group of sectionGroups) {
    if (group.code === 0) {
      flushCurrent();
      currentEntityName = String(group.value);
      currentGroups = [];
    } else {
      currentGroups.push(group);
    }
  }

  flushCurrent();

  return entities;
}
