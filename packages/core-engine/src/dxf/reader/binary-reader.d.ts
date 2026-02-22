/**
 * @module core/dxf/reader/binary-reader
 * Парсер Binary DXF файлов.
 * Binary DXF начинается с сигнатуры "AutoCAD Binary DXF\r\n\x1a\0".
 */
import { type DXFGroup, type DXFSection } from '../../types/index.js';
/** Сигнатура Binary DXF файла */
export declare const BINARY_DXF_SIGNATURE = "AutoCAD Binary DXF\r\n\u001A\0";
/** Длина сигнатуры в байтах */
export declare const BINARY_SIGNATURE_LENGTH = 22;
/**
 * Проверяет, является ли буфер Binary DXF файлом.
 * @param buffer - ArrayBuffer с содержимым файла
 * @returns true если файл начинается с Binary DXF сигнатуры
 */
export declare function isBinaryDXF(buffer: ArrayBuffer): boolean;
/**
 * Парсит Binary DXF буфер в массив пар код-значение.
 * @param buffer - ArrayBuffer с содержимым Binary DXF файла
 * @returns Массив пар код-значение
 * @throws DXFError при ошибке парсинга
 */
export declare function parseBinaryGroups(buffer: ArrayBuffer): DXFGroup[];
/**
 * Полный парсинг Binary DXF буфера в массив секций.
 * @param buffer - ArrayBuffer с содержимым Binary DXF файла
 * @returns Массив секций DXF
 */
export declare function parseBinaryDXF(buffer: ArrayBuffer): DXFSection[];
//# sourceMappingURL=binary-reader.d.ts.map