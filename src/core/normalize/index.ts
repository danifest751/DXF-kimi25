/**
 * @module core/normalize
 * Нормализация DXF документа:
 * - Разрешение BYLAYER/BYBLOCK цветов, типов линий, толщин
 * - Разворачивание INSERT (вложенные блоки, атрибуты, трансформации)
 * - Вычисление bounding box для всех сущностей
 */

import type {
  DXFDocument,
  DXFEntity,
  DXFInsertEntity,
  DXFLayer,
  Color,
  Point3D,
  BoundingBox,
} from '../types/index.js';
import { DXFEntityType } from '../types/index.js';
import {
  buildInsertMatrix,
  mat4TransformPoint,
  mat4Multiply,
  computeAllBBoxes,
  mergeBBox,
  IDENTITY_MATRIX,
} from '../geometry/index.js';
import type { Matrix4x4 } from '../types/index.js';

// ─── Цвет по умолчанию ─────────────────────────────────────────────

const DEFAULT_COLOR: Color = { r: 255, g: 255, b: 255 };

// ─── Разрешение цвета ──────────────────────────────────────────────

/**
 * Разрешает эффективный цвет сущности с учётом BYLAYER и BYBLOCK.
 * @param entity - Сущность
 * @param layer - Слой сущности
 * @param parentColor - Цвет родительского блока (для BYBLOCK)
 * @returns Разрешённый цвет
 */
export function resolveColor(
  entity: DXFEntity,
  layer: DXFLayer | undefined,
  parentColor: Color | undefined,
): Color {
  if (entity.color !== undefined) {
    // Проверяем BYBLOCK (цвет r=0,g=0,b=0 с индексом 0)
    if (entity.color.r === 0 && entity.color.g === 0 && entity.color.b === 0) {
      return parentColor ?? layer?.color ?? DEFAULT_COLOR;
    }
    return entity.color;
  }
  // BYLAYER
  return layer?.color ?? DEFAULT_COLOR;
}

/**
 * Разрешает эффективный тип линии.
 */
export function resolveLineType(
  entity: DXFEntity,
  layer: DXFLayer | undefined,
): string {
  if (entity.lineType !== undefined && entity.lineType !== 'BYLAYER' && entity.lineType !== 'BYBLOCK') {
    return entity.lineType;
  }
  return layer?.lineType ?? 'Continuous';
}

/**
 * Разрешает эффективную толщину линии.
 */
export function resolveLineWeight(
  entity: DXFEntity,
  layer: DXFLayer | undefined,
): number {
  if (entity.lineWeight !== undefined && entity.lineWeight >= 0) {
    return entity.lineWeight;
  }
  return layer?.lineWeight ?? 0;
}

// ─── Разворачивание INSERT ──────────────────────────────────────────

/** Результат разворачивания — плоский массив сущностей с трансформациями */
export interface FlattenedEntity {
  readonly entity: DXFEntity;
  readonly transform: Matrix4x4;
  readonly effectiveColor: Color;
  readonly effectiveLineType: string;
  readonly effectiveLineWeight: number;
  readonly effectiveLayer: string;
}

/**
 * Разворачивает INSERT-сущности рекурсивно, применяя трансформации.
 * @param entities - Массив сущностей
 * @param doc - Документ DXF
 * @param parentTransform - Родительская матрица трансформации
 * @param parentColor - Цвет родительского блока
 * @param maxDepth - Максимальная глубина вложенности (защита от рекурсии)
 * @returns Плоский массив сущностей
 */
export function flattenEntities(
  entities: readonly DXFEntity[],
  doc: DXFDocument,
  parentTransform: Matrix4x4 = IDENTITY_MATRIX,
  parentColor: Color | undefined = undefined,
  maxDepth: number = 32,
): FlattenedEntity[] {
  if (maxDepth <= 0) return [];

  const result: FlattenedEntity[] = [];

  for (const entity of entities) {
    const layer = doc.layers.get(entity.layer);

    if (entity.type === DXFEntityType.INSERT) {
      const insert = entity as DXFInsertEntity;
      const block = doc.blocks.get(insert.blockName);
      if (block === undefined) continue;

      // Обрабатываем массив INSERT (columnCount × rowCount)
      for (let row = 0; row < insert.rowCount; row++) {
        for (let col = 0; col < insert.columnCount; col++) {
          const offsetX = col * insert.columnSpacing;
          const offsetY = row * insert.rowSpacing;
          const pos: Point3D = {
            x: insert.position.x + offsetX,
            y: insert.position.y + offsetY,
            z: insert.position.z,
          };

          const insertMatrix = buildInsertMatrix(
            pos,
            insert.rotation,
            insert.scale.dx,
            insert.scale.dy,
            insert.scale.dz,
            block.basePoint,
          );

          const combinedTransform = mat4Multiply(parentTransform, insertMatrix);
          const insertColor = resolveColor(entity, layer, parentColor);

          // Рекурсивно разворачиваем содержимое блока
          const nested = flattenEntities(
            block.entities,
            doc,
            combinedTransform,
            insertColor,
            maxDepth - 1,
          );
          result.push(...nested);
        }
      }

      // Атрибуты INSERT
      for (const attrib of insert.attributes) {
        result.push({
          entity: attrib,
          transform: parentTransform,
          effectiveColor: resolveColor(attrib, layer, parentColor),
          effectiveLineType: resolveLineType(attrib, layer),
          effectiveLineWeight: resolveLineWeight(attrib, layer),
          effectiveLayer: attrib.layer,
        });
      }
    } else {
      result.push({
        entity,
        transform: parentTransform,
        effectiveColor: resolveColor(entity, layer, parentColor),
        effectiveLineType: resolveLineType(entity, layer),
        effectiveLineWeight: resolveLineWeight(entity, layer),
        effectiveLayer: entity.layer,
      });
    }
  }

  return result;
}

// ─── Полная нормализация документа ──────────────────────────────────

/** Результат нормализации */
export interface NormalizedDocument {
  readonly source: DXFDocument;
  readonly flatEntities: readonly FlattenedEntity[];
  readonly totalBBox: BoundingBox | null;
  readonly layerNames: readonly string[];
  readonly entityCount: number;
}

/**
 * Полная нормализация DXF документа.
 * 1. Вычисляет bounding box для всех сущностей
 * 2. Разворачивает INSERT-ы
 * 3. Разрешает цвета/стили
 * @param doc - Исходный DXF документ
 * @returns Нормализованный документ
 */
export function normalizeDocument(doc: DXFDocument): NormalizedDocument {
  // 1. Вычисляем bbox для всех сущностей (мутирует entity.boundingBox)
  computeAllBBoxes(doc.entities as DXFEntity[]);

  // Также вычисляем bbox для сущностей внутри блоков
  for (const block of doc.blocks.values()) {
    computeAllBBoxes(block.entities as DXFEntity[]);
  }

  // 2. Разворачиваем INSERT-ы
  const flatEntities = flattenEntities(doc.entities, doc);

  // 3. Вычисляем общий bbox
  let totalBBox: BoundingBox | null = null;
  for (const fe of flatEntities) {
    const bb = fe.entity.boundingBox;
    if (bb !== null && bb !== undefined) {
      // Трансформируем bbox
      const transformedBB = transformBBox(bb, fe.transform);
      totalBBox = totalBBox === null ? transformedBB : mergeBBox(totalBBox, transformedBB);
    }
  }

  // 4. Собираем имена слоёв
  const layerNames = Array.from(doc.layers.keys()).sort();

  return {
    source: doc,
    flatEntities,
    totalBBox,
    layerNames,
    entityCount: flatEntities.length,
  };
}

/**
 * Трансформирует BoundingBox матрицей (берёт 8 углов куба и пересчитывает).
 */
function transformBBox(bb: BoundingBox, transform: Matrix4x4): BoundingBox {
  // Если матрица единичная — возвращаем как есть
  if (transform === IDENTITY_MATRIX) return bb;

  const corners: Point3D[] = [
    { x: bb.min.x, y: bb.min.y, z: bb.min.z },
    { x: bb.max.x, y: bb.min.y, z: bb.min.z },
    { x: bb.min.x, y: bb.max.y, z: bb.min.z },
    { x: bb.max.x, y: bb.max.y, z: bb.min.z },
    { x: bb.min.x, y: bb.min.y, z: bb.max.z },
    { x: bb.max.x, y: bb.min.y, z: bb.max.z },
    { x: bb.min.x, y: bb.max.y, z: bb.max.z },
    { x: bb.max.x, y: bb.max.y, z: bb.max.z },
  ];

  const transformed = corners.map((c) => mat4TransformPoint(transform, c));
  let minX = Infinity, minY = Infinity, minZ = Infinity;
  let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;

  for (const p of transformed) {
    minX = Math.min(minX, p.x);
    minY = Math.min(minY, p.y);
    minZ = Math.min(minZ, p.z);
    maxX = Math.max(maxX, p.x);
    maxY = Math.max(maxY, p.y);
    maxZ = Math.max(maxZ, p.z);
  }

  return {
    min: { x: minX, y: minY, z: minZ },
    max: { x: maxX, y: maxY, z: maxZ },
  };
}
