/**
 * @module core/normalize
 * Нормализация DXF документа:
 * - Разрешение BYLAYER/BYBLOCK цветов, типов линий, толщин
 * - Разворачивание INSERT (вложенные блоки, атрибуты, трансформации)
 * - Вычисление bounding box для всех сущностей
 */
import type { DXFDocument, DXFEntity, DXFLayer, Color, BoundingBox } from '../types/index.js';
import type { Matrix4x4 } from '../types/index.js';
/**
 * Разрешает эффективный цвет сущности с учётом BYLAYER и BYBLOCK.
 * @param entity - Сущность
 * @param layer - Слой сущности
 * @param parentColor - Цвет родительского блока (для BYBLOCK)
 * @returns Разрешённый цвет
 */
export declare function resolveColor(entity: DXFEntity, layer: DXFLayer | undefined, parentColor: Color | undefined): Color;
/**
 * Разрешает эффективный тип линии.
 */
export declare function resolveLineType(entity: DXFEntity, layer: DXFLayer | undefined): string;
/**
 * Разрешает эффективную толщину линии.
 */
export declare function resolveLineWeight(entity: DXFEntity, layer: DXFLayer | undefined): number;
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
export declare function flattenEntities(entities: readonly DXFEntity[], doc: DXFDocument, parentTransform?: Matrix4x4, parentColor?: Color | undefined, maxDepth?: number): FlattenedEntity[];
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
export declare function normalizeDocument(doc: DXFDocument): NormalizedDocument;
//# sourceMappingURL=index.d.ts.map