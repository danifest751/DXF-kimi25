/**
 * @module core/dxf/reader
 * Главный модуль чтения DXF файлов.
 * Определяет формат (ASCII/Binary) и делегирует парсинг.
 */
import { type DXFDocument, DXFFormat } from '../../types/index.js';
export { parseAsciiDXF } from './ascii-reader.js';
export { parseBinaryDXF, isBinaryDXF } from './binary-reader.js';
export { parseEntity, parseEntitiesSection, aciToColor } from './entity-parser.js';
export { parseHeaderSection, parseTablesSection, parseBlocksSection, extractMetadata, } from './section-parser.js';
/**
 * Определяет формат DXF файла.
 * @param buffer - ArrayBuffer с содержимым файла
 * @returns Формат файла
 */
export declare function detectFormat(buffer: ArrayBuffer): DXFFormat;
/**
 * Парсит DXF файл из ArrayBuffer в полную модель документа.
 * Автоматически определяет формат (ASCII/Binary).
 * @param buffer - ArrayBuffer с содержимым файла
 * @returns Полная модель DXF документа
 * @throws DXFError при ошибке парсинга
 */
export declare function parseDXF(buffer: ArrayBuffer): DXFDocument;
/**
 * Парсит DXF файл из строки (только ASCII).
 * @param text - Текст DXF файла
 * @returns Полная модель DXF документа
 * @throws DXFError при ошибке парсинга
 */
export declare function parseDXFFromString(text: string): DXFDocument;
//# sourceMappingURL=index.d.ts.map