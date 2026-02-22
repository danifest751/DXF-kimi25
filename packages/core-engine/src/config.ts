/**
 * @module core/config
 * Загрузка и валидация конфигурации из config.json.
 * Все «магические числа» вынесены в конфиг.
 */

import type { Config } from './types/index.js';

/** Загруженная конфигурация приложения */
export const config: Config = {
  app: {
    name: 'DXF Viewer',
    version: '0.1.0',
    maxFileSize: 209715200,
    maxEntities: 1000000,
    targetFPS: 30,
  },
  dxf: {
    supportedVersions: ['R12', '2000', '2004', '2007', '2010', '2013', '2018', '2021'],
    encoding: 'UTF-8',
    binaryEncoding: 'binary',
  },
  geometry: {
    tolerance: 1e-9,
    angleTolerance: 1e-6,
    discretization: {
      arcSegments: 32,
      splineSegments: 64,
      ellipseSegments: 32,
    },
    rotation: {
      stepDegrees: 15,
      maxRotations: 24,
    },
  },
  rendering: {
    canvas: {
      maxCanvasSize: 8192,
      offscreenCanvas: true,
    },
    hitTesting: {
      rTreeMaxChildren: 16,
      rTreeMinChildren: 4,
    },
    text: {
      defaultFont: 'sans-serif',
      fontSizeScale: 1,
    },
  },
  storage: {
    indexedDB: {
      name: 'dxf-viewer-db',
      version: 1,
      stores: {
        settings: 'settings',
        recentFiles: 'recentFiles',
      },
    },
  },
  worker: {
    chunkSize: 1048576,
    maxWorkers: 4,
  },
};

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
