/**
 * @module core
 * Главный экспорт ядра DXF Viewer.
 */

export { config, getTolerance, getAngleTolerance, getArcSegments, getSplineSegments, getEllipseSegments } from './config.js';
export { DXFModel } from './dxf/model/index.js';
export { parseDXF, parseDXFFromString, detectFormat } from './dxf/reader/index.js';
export { normalizeDocument, flattenEntities, resolveColor, resolveLineType, resolveLineWeight } from './normalize/index.js';
export type { NormalizedDocument, FlattenedEntity } from './normalize/index.js';
export { DXFRenderer, Camera, RTree } from './render/index.js';
export { parseDXFInWorker, parseDXFSync } from './workers/index.js';
export type { ParseResult, ParseCallbacks } from './workers/index.js';
export { computeCuttingStats, formatCutLength } from './cutting/index.js';
export type { CuttingStats, ChainInfo, LayerCutStats } from './cutting/index.js';
export { nestItems, SHEET_PRESETS } from './nesting/index.js';
export type { SheetSize, SheetPreset, NestingPoint, NestingItem, PlacedItem, NestingStrategy, NestingOptions, NestingSheet, NestingResult } from './nesting/index.js';
export { exportResults, exportNestingToDXF, exportNestingToCSV, exportCuttingStatsToCSV } from './export/index.js';
export type { ExportFormat, ExportOptions, ExportDXFOptions, ExportCuttingStatsOptions, ExportNestingCSVOptions } from './export/index.js';
