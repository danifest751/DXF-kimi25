/**
 * @module core/workers
 * Менеджер Web Worker для парсинга DXF.
 */
import type { ParseProgress } from '../types/index.js';
import type { NormalizedDocument } from '../normalize/index.js';
export interface ParseResult {
    readonly document: NormalizedDocument;
}
export interface ParseCallbacks {
    onProgress?: (progress: ParseProgress) => void;
    onComplete?: (result: ParseResult) => void;
    onError?: (error: string) => void;
}
/**
 * Парсит DXF файл в Web Worker.
 * @param buffer - ArrayBuffer с содержимым файла
 * @param callbacks - Колбэки прогресса/завершения/ошибки
 * @returns Promise с результатом парсинга
 */
export declare function parseDXFInWorker(buffer: ArrayBuffer, callbacks?: ParseCallbacks): Promise<ParseResult>;
/**
 * Синхронный парсинг DXF (без воркера, для малых файлов или fallback).
 */
export declare function parseDXFSync(buffer: ArrayBuffer): Promise<ParseResult>;
//# sourceMappingURL=index.d.ts.map