/**
 * @module core/export
 * Модуль экспорта результатов раскладки и статистики резки.
 * Поддерживаемые форматы: DXF, CSV
 */
import type { NestingResult } from '../nesting/index.js';
import type { CuttingStats } from '../cutting/index.js';
/** Опции экспорта в DXF */
export interface ExportDXFOptions {
    readonly nestingResult: NestingResult;
}
/**
 * Экспортирует раскладку в формат DXF.
 * @param options - Опции экспорта
 * @returns DXF файл в виде строки
 */
export declare function exportNestingToDXF(options: ExportDXFOptions): string;
/** Опции экспорта статистики резки */
export interface ExportCuttingStatsOptions {
    readonly stats: CuttingStats;
    readonly fileName?: string;
}
/**
 * Экспортирует статистику резки в формат CSV.
 * @param options - Опции экспорта
 * @returns CSV файл в виде строки
 */
export declare function exportCuttingStatsToCSV(options: ExportCuttingStatsOptions): string;
/** Опции экспорта раскладки в CSV */
export interface ExportNestingCSVOptions {
    readonly nestingResult: NestingResult;
    readonly fileName?: string;
}
/**
 * Экспортирует раскладку в формат CSV.
 * @param options - Опции экспорта
 * @returns CSV файл в виде строки
 */
export declare function exportNestingToCSV(options: ExportNestingCSVOptions): string;
/** Типы экспорта */
export type ExportFormat = 'DXF' | 'CSV';
/** Объединённые опции экспорта */
export interface ExportOptions {
    readonly format: ExportFormat;
    readonly nestingResult?: NestingResult;
    readonly cuttingStats?: CuttingStats;
    readonly fileName: string;
}
/**
 * Экспортирует результаты в указанном формате.
 * @param options - Опции экспорта
 * @returns Файл в виде строки
 */
export declare function exportResults(options: ExportOptions): string;
//# sourceMappingURL=index.d.ts.map