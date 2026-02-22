/**
 * @module core/config
 * Загрузка и валидация конфигурации из config.json.
 * Все «магические числа» вынесены в конфиг.
 */
import type { Config } from './types/index.js';
/** Загруженная конфигурация приложения */
export declare const config: Config;
/**
 * Получить значение допуска геометрии
 * @returns tolerance из конфигурации
 */
export declare function getTolerance(): number;
/**
 * Получить значение углового допуска
 * @returns angleTolerance из конфигурации
 */
export declare function getAngleTolerance(): number;
/**
 * Получить количество сегментов для дискретизации дуги
 * @returns arcSegments из конфигурации
 */
export declare function getArcSegments(): number;
/**
 * Получить количество сегментов для дискретизации сплайна
 * @returns splineSegments из конфигурации
 */
export declare function getSplineSegments(): number;
/**
 * Получить количество сегментов для дискретизации эллипса
 * @returns ellipseSegments из конфигурации
 */
export declare function getEllipseSegments(): number;
//# sourceMappingURL=config.d.ts.map