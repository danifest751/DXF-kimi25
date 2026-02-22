/**
 * @module core/config
 * Загрузка и валидация конфигурации из config.json.
 * Все «магические числа» вынесены в конфиг.
 */
import configData from '../config.json';
/** Загруженная конфигурация приложения */
export const config = configData;
/**
 * Получить значение допуска геометрии
 * @returns tolerance из конфигурации
 */
export function getTolerance() {
    return config.geometry.tolerance;
}
/**
 * Получить значение углового допуска
 * @returns angleTolerance из конфигурации
 */
export function getAngleTolerance() {
    return config.geometry.angleTolerance;
}
/**
 * Получить количество сегментов для дискретизации дуги
 * @returns arcSegments из конфигурации
 */
export function getArcSegments() {
    return config.geometry.discretization.arcSegments;
}
/**
 * Получить количество сегментов для дискретизации сплайна
 * @returns splineSegments из конфигурации
 */
export function getSplineSegments() {
    return config.geometry.discretization.splineSegments;
}
/**
 * Получить количество сегментов для дискретизации эллипса
 * @returns ellipseSegments из конфигурации
 */
export function getEllipseSegments() {
    return config.geometry.discretization.ellipseSegments;
}
//# sourceMappingURL=config.js.map