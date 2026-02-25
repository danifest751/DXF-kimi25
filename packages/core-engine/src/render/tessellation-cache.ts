/**
 * @module core/render/tessellation-cache
 * Предварительно вычисляет геометрию кривых (arc, circle, ellipse, spline, lwpolyline)
 * один раз при загрузке документа и хранит как Float32Array (xy-пары).
 * Рендерер читает кэш вместо повторных тригонометрических вычислений.
 */

import { DXFEntityType } from '../types/index.js';
import {
  tessellateArc,
  tessellateCircle,
  tessellateEllipse,
  tessellateSpline,
  tessellateLWPolyline,
} from '../geometry/index.js';
import type { FlattenedEntity } from '../normalize/index.js';

/** Ключ кэша: индекс FlattenedEntity в массиве doc.flatEntities */
type CacheKey = number;

/**
 * Кэш тесселяции кривых.
 * Хранит предвычисленные xy-пары точек для каждой кривой.
 * Для линий/полигонов кэш не используется — они рендерятся напрямую.
 */
export class TessellationCache {
  /** Float32Array: [x0, y0, x1, y1, ...] для каждой кривой */
  private readonly cache = new Map<CacheKey, Float32Array>();
  /** true если ломаная замкнута (нужно closePath) */
  private readonly closedFlags = new Map<CacheKey, boolean>();

  /**
   * Строит кэш для всех кривых в документе.
   * @param flatEntities - Плоский массив сущностей
   * @param arcSegments - Кол-во сегментов для дуг/окружностей
   * @param splineSegments - Кол-во сегментов для сплайнов
   * @param ellipseSegments - Кол-во сегментов для эллипсов
   */
  build(
    flatEntities: readonly FlattenedEntity[],
    arcSegments: number,
    splineSegments: number,
    ellipseSegments: number,
  ): void {
    this.cache.clear();
    this.closedFlags.clear();

    for (let i = 0; i < flatEntities.length; i++) {
      const fe = flatEntities[i]!;
      const e = fe.entity;

      switch (e.type) {
        case DXFEntityType.CIRCLE: {
          const pts = tessellateCircle(e.center, e.radius, arcSegments);
          this.cache.set(i, pointsToFloat32(pts));
          this.closedFlags.set(i, true);
          break;
        }
        case DXFEntityType.ARC: {
          const pts = tessellateArc(e.center, e.radius, e.startAngle, e.endAngle, arcSegments);
          this.cache.set(i, pointsToFloat32(pts));
          this.closedFlags.set(i, false);
          break;
        }
        case DXFEntityType.ELLIPSE: {
          const pts = tessellateEllipse(
            e.center, e.majorAxis, e.minorAxisRatio,
            e.startAngle, e.endAngle, ellipseSegments,
          );
          const isFull = Math.abs(e.endAngle - e.startAngle) >= Math.PI * 2 - 0.001;
          this.cache.set(i, pointsToFloat32(pts));
          this.closedFlags.set(i, isFull);
          break;
        }
        case DXFEntityType.SPLINE: {
          const pts = tessellateSpline(
            e.degree, e.controlPoints, e.knots, e.weights, splineSegments,
          );
          this.cache.set(i, pointsToFloat32(pts));
          this.closedFlags.set(i, e.closed);
          break;
        }
        case DXFEntityType.LWPOLYLINE: {
          const hasBulge = e.bulges !== undefined && e.bulges.some((b) => b !== 0);
          if (hasBulge) {
            const pts = tessellateLWPolyline(e.vertices, e.bulges, e.closed, arcSegments);
            this.cache.set(i, points2DToFloat32(pts));
            this.closedFlags.set(i, e.closed);
          }
          break;
        }
      }
    }
  }

  /** Возвращает кэшированные точки или undefined если не кэшировано */
  get(index: CacheKey): Float32Array | undefined {
    return this.cache.get(index);
  }

  /** Возвращает флаг замкнутости */
  isClosed(index: CacheKey): boolean {
    return this.closedFlags.get(index) ?? false;
  }

  /** Очищает кэш */
  clear(): void {
    this.cache.clear();
    this.closedFlags.clear();
  }

  get size(): number {
    return this.cache.size;
  }
}

// ─── Хелперы конвертации ─────────────────────────────────────────────

function pointsToFloat32(pts: readonly { x: number; y: number; z: number }[]): Float32Array {
  const buf = new Float32Array(pts.length * 2);
  for (let i = 0; i < pts.length; i++) {
    buf[i * 2] = pts[i]!.x;
    buf[i * 2 + 1] = pts[i]!.y;
  }
  return buf;
}

function points2DToFloat32(pts: readonly { x: number; y: number }[]): Float32Array {
  const buf = new Float32Array(pts.length * 2);
  for (let i = 0; i < pts.length; i++) {
    buf[i * 2] = pts[i]!.x;
    buf[i * 2 + 1] = pts[i]!.y;
  }
  return buf;
}
