/**
 * @module core/config
 * Загрузка и валидация конфигурации из config.json.
 * Все «магические числа» вынесены в конфиг.
 */

import type { Config } from './types/index.js';
import configData from '../config.json';

/** Загруженная конфигурация приложения */
export const config: Config = configData as Config;

/**
 * Получить значение допуска геометрии
 * @returns tolerance из конфигурации
 */
export function getTolerance(): number {
  return config.geometry.tolerance;
}

/**
 * Получить значение углового допуска
 * @returns angleTolerance из конфигурации
 */
export function getAngleTolerance(): number {
  return config.geometry.angleTolerance;
}

/**
 * Получить количество сегментов для дискретизации дуги
 * @returns arcSegments из конфигурации
 */
export function getArcSegments(): number {
  return config.geometry.discretization.arcSegments;
}

/**
 * Получить количество сегментов для дискретизации сплайна
 * @returns splineSegments из конфигурации
 */
export function getSplineSegments(): number {
  return config.geometry.discretization.splineSegments;
}

/**
 * Получить количество сегментов для дискретизации эллипса
 * @returns ellipseSegments из конфигурации
 */
export function getEllipseSegments(): number {
  return config.geometry.discretization.ellipseSegments;
}
