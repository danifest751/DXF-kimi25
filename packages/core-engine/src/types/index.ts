/**
 * @module core/types
 * Базовые типы для DXF Viewer.
 * Все публичные интерфейсы и перечисления проекта.
 */

// ─── Форматы и версии DXF ───────────────────────────────────────────

/** Формат DXF файла */
export enum DXFFormat {
  ASCII = 'ASCII',
  BINARY = 'BINARY',
}

/** Версия DXF */
export enum DXFVersion {
  R12 = 'R12',
  R2000 = '2000',
  R2004 = '2004',
  R2007 = '2007',
  R2010 = '2010',
  R2013 = '2013',
  R2018 = '2018',
  R2021 = '2021',
}

// ─── Типы сущностей ─────────────────────────────────────────────────

/** Перечисление всех поддерживаемых типов DXF-сущностей */
export enum DXFEntityType {
  LINE = 'LINE',
  XLINE = 'XLINE',
  RAY = 'RAY',
  CIRCLE = 'CIRCLE',
  ARC = 'ARC',
  ELLIPSE = 'ELLIPSE',
  SPLINE = 'SPLINE',
  POLYLINE = 'POLYLINE',
  LWPOLYLINE = 'LWPOLYLINE',
  POINT = 'POINT',
  SOLID = 'SOLID',
  TRACE = 'TRACE',
  HATCH = 'HATCH',
  TEXT = 'TEXT',
  MTEXT = 'MTEXT',
  DIMENSION = 'DIMENSION',
  LEADER = 'LEADER',
  MLEADER = 'MLEADER',
  INSERT = 'INSERT',
  ATTDEF = 'ATTDEF',
  ATTRIB = 'ATTRIB',
  THREE_D_FACE = '3DFACE',
  POLYFACE = 'POLYFACE',
  MESH = 'MESH',
  SURFACE = 'SURFACE',
  BODY = 'BODY',
  IMAGE = 'IMAGE',
  UNDERLAY = 'UNDERLAY',
  TOLERANCE = 'TOLERANCE',
  TABLE = 'TABLE',
  VIEWPORT = 'VIEWPORT',
}

// ─── Геометрические примитивы ───────────────────────────────────────

/** 2D точка */
export interface Point2D {
  readonly x: number;
  readonly y: number;
}

/** 3D точка */
export interface Point3D {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

/** 2D вектор */
export interface Vector2D {
  readonly dx: number;
  readonly dy: number;
}

/** 3D вектор */
export interface Vector3D {
  readonly dx: number;
  readonly dy: number;
  readonly dz: number;
}

/** Ограничивающий прямоугольник (AABB) */
export interface BoundingBox {
  readonly min: Point3D;
  readonly max: Point3D;
}

// ─── Цвет и стили ───────────────────────────────────────────────────

/** RGB(A) цвет */
export interface Color {
  readonly r: number; // 0-255
  readonly g: number; // 0-255
  readonly b: number; // 0-255
  readonly a?: number; // 0-1
}

/** Тип линии */
export interface LineType {
  readonly name: string;
  readonly description: string;
  readonly pattern: readonly number[]; // Dash pattern
  readonly scale: number;
}

/** Слой DXF */
export interface DXFLayer {
  readonly name: string;
  readonly color: Color;
  readonly lineType: string;
  readonly lineWeight: number;
  readonly frozen: boolean;
  readonly locked: boolean;
  readonly visible: boolean;
}

/** Стиль текста */
export interface TextStyle {
  readonly name: string;
  readonly font: string;
  readonly height: number;
  readonly width: number;
  readonly obliqueAngle: number;
}

/** Стиль размеров */
export interface DimStyle {
  readonly name: string;
  readonly arrowSize: number;
  readonly textHeight: number;
  readonly extensionLineOffset: number;
}

// ─── DXF группы и секции ────────────────────────────────────────────

/** Код группы DXF (0-1071) */
export type GroupCode = number;

/** Значение группы DXF */
export type DXFValue = string | number | boolean;

/** Пара код-значение DXF */
export interface DXFGroup {
  readonly code: GroupCode;
  readonly value: DXFValue;
}

/** Секция DXF файла */
export interface DXFSection {
  readonly name: string;
  readonly groups: readonly DXFGroup[];
}

/** Блок DXF */
export interface DXFBlock {
  readonly name: string;
  readonly basePoint: Point3D;
  readonly entities: readonly DXFEntity[];
  readonly endBlk: Point3D;
}

// ─── Сущности DXF ──────────────────────────────────────────────────

/** Базовый интерфейс DXF-сущности */
export interface DXFEntityBase {
  readonly type: DXFEntityType;
  readonly handle: string;
  readonly layer: string;
  readonly color?: Color;
  readonly lineType?: string;
  readonly lineWeight?: number;
  readonly visible: boolean;
  boundingBox?: BoundingBox;
}

/** LINE */
export interface DXFLineEntity extends DXFEntityBase {
  readonly type: DXFEntityType.LINE;
  readonly start: Point3D;
  readonly end: Point3D;
}

/** XLINE */
export interface DXFXLineEntity extends DXFEntityBase {
  readonly type: DXFEntityType.XLINE;
  readonly basePoint: Point3D;
  readonly direction: Vector3D;
}

/** RAY */
export interface DXFRayEntity extends DXFEntityBase {
  readonly type: DXFEntityType.RAY;
  readonly basePoint: Point3D;
  readonly direction: Vector3D;
}

/** CIRCLE */
export interface DXFCircleEntity extends DXFEntityBase {
  readonly type: DXFEntityType.CIRCLE;
  readonly center: Point3D;
  readonly radius: number;
}

/** ARC */
export interface DXFArcEntity extends DXFEntityBase {
  readonly type: DXFEntityType.ARC;
  readonly center: Point3D;
  readonly radius: number;
  readonly startAngle: number;
  readonly endAngle: number;
}

/** ELLIPSE */
export interface DXFEllipseEntity extends DXFEntityBase {
  readonly type: DXFEntityType.ELLIPSE;
  readonly center: Point3D;
  readonly majorAxis: Vector3D;
  readonly minorAxisRatio: number;
  readonly startAngle: number;
  readonly endAngle: number;
}

/** SPLINE */
export interface DXFSplineEntity extends DXFEntityBase {
  readonly type: DXFEntityType.SPLINE;
  readonly degree: number;
  readonly controlPoints: readonly Point3D[];
  readonly knots: readonly number[];
  readonly weights: readonly number[];
  readonly closed: boolean;
  readonly periodic: boolean;
}

/** POLYLINE */
export interface DXFPolylineEntity extends DXFEntityBase {
  readonly type: DXFEntityType.POLYLINE;
  readonly vertices: readonly Point3D[];
  readonly closed: boolean;
  readonly is3D: boolean;
  readonly isMesh: boolean;
  readonly isPolyface: boolean;
}

/** LWPOLYLINE */
export interface DXFLWPolylineEntity extends DXFEntityBase {
  readonly type: DXFEntityType.LWPOLYLINE;
  readonly vertices: readonly Point2D[];
  readonly closed: boolean;
  readonly constantWidth?: number;
  readonly widths?: readonly number[];
  readonly bulges?: readonly number[];
}

/** POINT */
export interface DXFPointEntity extends DXFEntityBase {
  readonly type: DXFEntityType.POINT;
  readonly location: Point3D;
}

/** SOLID */
export interface DXFSolidEntity extends DXFEntityBase {
  readonly type: DXFEntityType.SOLID;
  readonly points: readonly [Point3D, Point3D, Point3D, Point3D];
}

/** TRACE */
export interface DXFTraceEntity extends DXFEntityBase {
  readonly type: DXFEntityType.TRACE;
  readonly points: readonly [Point3D, Point3D, Point3D, Point3D];
}

/** TEXT */
export interface DXFTextEntity extends DXFEntityBase {
  readonly type: DXFEntityType.TEXT;
  readonly position: Point3D;
  readonly text: string;
  readonly height: number;
  readonly rotation: number;
  readonly style: string;
  readonly alignment: number;
  readonly widthFactor: number;
  readonly obliqueAngle: number;
}

/** MTEXT */
export interface DXFMTextEntity extends DXFEntityBase {
  readonly type: DXFEntityType.MTEXT;
  readonly position: Point3D;
  readonly text: string;
  readonly height: number;
  readonly width: number;
  readonly attachment: number;
  readonly direction: Vector3D;
  readonly style: string;
  readonly lineSpacing: number;
  readonly rotation: number;
}

/** HATCH */
export interface DXFHatchEntity extends DXFEntityBase {
  readonly type: DXFEntityType.HATCH;
  readonly patternName: string;
  readonly patternScale: number;
  readonly patternAngle: number;
  readonly solid: boolean;
  readonly boundaries: readonly (readonly Point3D[])[];
}

/** DIMENSION */
export interface DXFDimensionEntity extends DXFEntityBase {
  readonly type: DXFEntityType.DIMENSION;
  readonly dimType: number;
  readonly definitionPoint: Point3D;
  readonly textMidpoint: Point3D;
  readonly text: string;
  readonly style: string;
}

/** LEADER */
export interface DXFLeaderEntity extends DXFEntityBase {
  readonly type: DXFEntityType.LEADER;
  readonly vertices: readonly Point3D[];
  readonly annotation: string;
  readonly style: string;
}

/** MLEADER */
export interface DXFMLeaderEntity extends DXFEntityBase {
  readonly type: DXFEntityType.MLEADER;
  readonly vertices: readonly Point3D[];
  readonly text: string;
  readonly style: string;
}

/** INSERT (вставка блока) */
export interface DXFInsertEntity extends DXFEntityBase {
  readonly type: DXFEntityType.INSERT;
  readonly blockName: string;
  readonly position: Point3D;
  readonly scale: Vector3D;
  readonly rotation: number;
  readonly columnCount: number;
  readonly rowCount: number;
  readonly columnSpacing: number;
  readonly rowSpacing: number;
  readonly attributes: readonly DXFAttribEntity[];
}

/** ATTDEF */
export interface DXFAttdefEntity extends DXFEntityBase {
  readonly type: DXFEntityType.ATTDEF;
  readonly tag: string;
  readonly prompt: string;
  readonly defaultValue: string;
  readonly position: Point3D;
  readonly height: number;
  readonly rotation: number;
}

/** ATTRIB */
export interface DXFAttribEntity extends DXFEntityBase {
  readonly type: DXFEntityType.ATTRIB;
  readonly tag: string;
  readonly value: string;
  readonly position: Point3D;
  readonly height: number;
  readonly rotation: number;
}

/** 3DFACE */
export interface DXF3DFaceEntity extends DXFEntityBase {
  readonly type: DXFEntityType.THREE_D_FACE;
  readonly points: readonly [Point3D, Point3D, Point3D, Point3D];
  readonly edgeVisibility: readonly [boolean, boolean, boolean, boolean];
}

/** IMAGE */
export interface DXFImageEntity extends DXFEntityBase {
  readonly type: DXFEntityType.IMAGE;
  readonly position: Point3D;
  readonly uVector: Vector3D;
  readonly vVector: Vector3D;
  readonly width: number;
  readonly height: number;
  readonly display: number;
  readonly brightness: number;
  readonly contrast: number;
  readonly fade: number;
}

/** UNDERLAY */
export interface DXFUnderlayEntity extends DXFEntityBase {
  readonly type: DXFEntityType.UNDERLAY;
  readonly filename: string;
  readonly position: Point3D;
  readonly scale: Vector3D;
  readonly rotation: number;
  readonly underlayType: 'PDF' | 'DWF' | 'DGN';
}

/** VIEWPORT */
export interface DXFViewportEntity extends DXFEntityBase {
  readonly type: DXFEntityType.VIEWPORT;
  readonly center: Point3D;
  readonly width: number;
  readonly height: number;
  readonly viewDirection: Vector3D;
  readonly viewTarget: Point3D;
}

/** Объединённый тип всех DXF-сущностей */
export type DXFEntity =
  | DXFLineEntity
  | DXFXLineEntity
  | DXFRayEntity
  | DXFCircleEntity
  | DXFArcEntity
  | DXFEllipseEntity
  | DXFSplineEntity
  | DXFPolylineEntity
  | DXFLWPolylineEntity
  | DXFPointEntity
  | DXFSolidEntity
  | DXFTraceEntity
  | DXFTextEntity
  | DXFMTextEntity
  | DXFHatchEntity
  | DXFDimensionEntity
  | DXFLeaderEntity
  | DXFMLeaderEntity
  | DXFInsertEntity
  | DXFAttdefEntity
  | DXFAttribEntity
  | DXF3DFaceEntity
  | DXFImageEntity
  | DXFUnderlayEntity
  | DXFViewportEntity;

// ─── Модель документа ───────────────────────────────────────────────

/** Метаданные DXF файла */
export interface DXFMetadata {
  readonly format: DXFFormat;
  readonly version: DXFVersion;
  readonly handle: string;
  readonly units: number;
  readonly extents: BoundingBox;
  readonly entityCount: number;
  readonly layerCount: number;
  readonly blockCount: number;
}

/** Полная модель DXF документа */
export interface DXFDocument {
  readonly metadata: DXFMetadata;
  readonly layers: Map<string, DXFLayer>;
  readonly lineTypes: Map<string, LineType>;
  readonly textStyles: Map<string, TextStyle>;
  readonly dimStyles: Map<string, DimStyle>;
  readonly blocks: Map<string, DXFBlock>;
  readonly entities: readonly DXFEntity[];
  readonly header: Map<string, DXFValue>;
}

// ─── Рендеринг ──────────────────────────────────────────────────────

/** 4x4 матрица трансформации (column-major) */
export type Matrix4x4 = readonly [
  number, number, number, number,
  number, number, number, number,
  number, number, number, number,
  number, number, number, number,
];

/** Контекст рендеринга */
export interface RenderContext {
  readonly canvas: HTMLCanvasElement | OffscreenCanvas;
  readonly ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
  readonly width: number;
  readonly height: number;
  readonly transform: Matrix4x4;
  readonly zoom: number;
  readonly pan: Point2D;
}

/** Состояние камеры */
export interface CameraState {
  zoom: number;
  pan: Point2D;
  rotation: number;
  center: Point2D;
}

/** Состояние выделения */
export interface SelectionState {
  readonly selectedEntities: Set<string>;
  readonly hoveredEntity: string | null;
}

/** Видимость слоёв */
export interface LayerVisibility {
  readonly [layerName: string]: boolean;
}

// ─── Настройки приложения ───────────────────────────────────────────

/** Тема оформления */
export type Theme = 'light' | 'dark' | 'sepia' | 'blue';

/** Настройки приложения */
export interface AppSettings {
  readonly theme: Theme;
  readonly defaultZoom: number;
  readonly showGrid: boolean;
  readonly showAxes: boolean;
  readonly antialiasing: boolean;
  readonly maxFileSize: number;
  readonly recentFiles: readonly string[];
}

// ─── Ошибки ─────────────────────────────────────────────────────────

/** Коды ошибок */
export enum ErrorCode {
  INVALID_FILE_FORMAT = 'INVALID_FILE_FORMAT',
  UNSUPPORTED_VERSION = 'UNSUPPORTED_VERSION',
  PARSE_ERROR = 'PARSE_ERROR',
  ENTITY_ERROR = 'ENTITY_ERROR',
  RENDER_ERROR = 'RENDER_ERROR',
  MEMORY_ERROR = 'MEMORY_ERROR',
  WORKER_ERROR = 'WORKER_ERROR',
}

/** Типизированная ошибка DXF */
export class DXFError extends Error {
  public readonly code: ErrorCode;
  public readonly suggestion?: string;

  constructor(code: ErrorCode, message: string, suggestion?: string) {
    super(message);
    this.name = 'DXFError';
    this.code = code;
    this.suggestion = suggestion;
  }
}

// ─── Worker сообщения ───────────────────────────────────────────────

/** Типы сообщений Worker */
export enum WorkerMessageType {
  PARSE_START = 'PARSE_START',
  PARSE_PROGRESS = 'PARSE_PROGRESS',
  PARSE_COMPLETE = 'PARSE_COMPLETE',
  PARSE_ERROR = 'PARSE_ERROR',
  RENDER_START = 'RENDER_START',
  RENDER_PROGRESS = 'RENDER_PROGRESS',
  RENDER_COMPLETE = 'RENDER_COMPLETE',
  RENDER_ERROR = 'RENDER_ERROR',
}

/** Обёртка сообщения Worker */
export interface WorkerMessage<T = unknown> {
  readonly type: WorkerMessageType;
  readonly data: T;
  readonly timestamp: number;
}

/** Прогресс парсинга */
export interface ParseProgress {
  readonly bytesProcessed: number;
  readonly totalBytes: number;
  readonly entitiesParsed: number;
  readonly currentSection: string;
}

/** Прогресс рендеринга */
export interface RenderProgress {
  readonly entitiesRendered: number;
  readonly totalEntities: number;
  readonly currentLayer: string;
}

// ─── IndexedDB схема ────────────────────────────────────────────────

/** Запись настроек в IndexedDB */
export interface SettingsRecord {
  readonly key: string;
  readonly value: AppSettings;
}

/** Запись недавнего файла в IndexedDB */
export interface RecentFileRecord {
  readonly id: string;
  readonly name: string;
  readonly path: string;
  readonly lastOpened: number;
  readonly size: number;
}

/** Схема IndexedDB */
export interface DBSchema {
  readonly settings: SettingsRecord;
  readonly recentFiles: RecentFileRecord;
}

// ─── Конфигурация приложения ────────────────────────────────────────

/** Конфигурация дискретизации кривых */
export interface DiscretizationConfig {
  readonly arcSegments: number;
  readonly splineSegments: number;
  readonly ellipseSegments: number;
}

/** Конфигурация ротации */
export interface RotationConfig {
  readonly stepDegrees: number;
  readonly maxRotations: number;
}

/** Конфигурация геометрии */
export interface GeometryConfig {
  readonly tolerance: number;
  readonly angleTolerance: number;
  readonly discretization: DiscretizationConfig;
  readonly rotation: RotationConfig;
}

/** Конфигурация Canvas */
export interface CanvasConfig {
  readonly maxCanvasSize: number;
  readonly offscreenCanvas: boolean;
}

/** Конфигурация hit-testing */
export interface HitTestConfig {
  readonly rTreeMaxChildren: number;
  readonly rTreeMinChildren: number;
}

/** Конфигурация текста */
export interface TextConfig {
  readonly defaultFont: string;
  readonly fontSizeScale: number;
}

/** Конфигурация рендеринга */
export interface RenderingConfig {
  readonly canvas: CanvasConfig;
  readonly hitTesting: HitTestConfig;
  readonly text: TextConfig;
}

/** Конфигурация IndexedDB */
export interface IndexedDBConfig {
  readonly name: string;
  readonly version: number;
  readonly stores: {
    readonly settings: string;
    readonly recentFiles: string;
  };
}

/** Конфигурация хранилища */
export interface StorageConfig {
  readonly indexedDB: IndexedDBConfig;
}

/** Конфигурация Worker */
export interface WorkerConfig {
  readonly chunkSize: number;
  readonly maxWorkers: number;
}

/** Конфигурация DXF */
export interface DXFConfig {
  readonly supportedVersions: readonly string[];
  readonly encoding: string;
  readonly binaryEncoding: string;
}

/** Конфигурация приложения */
export interface AppConfig {
  readonly name: string;
  readonly version: string;
  readonly maxFileSize: number;
  readonly maxEntities: number;
  readonly targetFPS: number;
}

/** Полная конфигурация */
export interface Config {
  readonly app: AppConfig;
  readonly dxf: DXFConfig;
  readonly geometry: GeometryConfig;
  readonly rendering: RenderingConfig;
  readonly storage: StorageConfig;
  readonly worker: WorkerConfig;
}
