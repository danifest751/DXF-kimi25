/**
 * @module core/geometry/bbox
 * Вычисление BoundingBox для всех типов DXF-сущностей.
 */
import type { BoundingBox, DXFEntity } from '../types/index.js';
/** Объединяет два bbox */
export declare function mergeBBox(a: BoundingBox, b: BoundingBox): BoundingBox;
/**
 * Вычисляет BoundingBox для любой DXF-сущности.
 * @param entity - Сущность
 * @returns BoundingBox или null
 */
export declare function computeEntityBBox(entity: DXFEntity): BoundingBox | null;
/**
 * Вычисляет bbox для массива сущностей и записывает его в каждую сущность.
 * @param entities - Массив сущностей (мутирует boundingBox)
 * @returns Общий BoundingBox или null
 */
export declare function computeAllBBoxes(entities: DXFEntity[]): BoundingBox | null;
//# sourceMappingURL=bbox.d.ts.map