/**
 * @module core/cutting
 * Подсчёт параметров лазерной резки:
 * - Количество врезок (pierces) — каждый непрерывный контур/цепочка = 1 врезка
 * - Длина реза (cut length) — суммарная длина всех режущих путей
 *
 * Алгоритм:
 * 1. Извлекаем начальную/конечную точку каждой режущей сущности
 * 2. Объединяем сущности в цепочки (chains) по совпадению конечных точек
 * 3. Каждая цепочка = 1 врезка (pierce)
 * 4. Замкнутые сущности (CIRCLE, closed POLYLINE/LWPOLYLINE/SPLINE/ELLIPSE) = 1 врезка сами по себе
 */
import type { Point3D } from '../types/index.js';
import type { NormalizedDocument } from '../normalize/index.js';
/** Информация об одной цепочке (= 1 врезка) */
export interface ChainInfo {
    readonly chainIndex: number;
    readonly entityIndices: readonly number[];
    readonly cutLength: number;
    readonly isClosed: boolean;
    readonly layer: string;
    /** Точка врезки (начало реза) в мировых координатах */
    readonly piercePoint: Point3D;
}
/** Итоговая статистика резки */
export interface CuttingStats {
    /** Общее количество врезок (= количество цепочек) */
    readonly totalPierces: number;
    /** Общая длина реза (в единицах чертежа) */
    readonly totalCutLength: number;
    /** Детализация по цепочкам */
    readonly chains: readonly ChainInfo[];
    /** Статистика по слоям */
    readonly byLayer: ReadonlyMap<string, LayerCutStats>;
    /** Количество замкнутых контуров */
    readonly closedContours: number;
    /** Количество открытых путей */
    readonly openPaths: number;
    /** Общее количество режущих сущностей */
    readonly cuttingEntityCount: number;
}
/** Статистика резки по слою */
export interface LayerCutStats {
    readonly layerName: string;
    readonly pierces: number;
    readonly cutLength: number;
    readonly entityCount: number;
}
/**
 * Вычисляет параметры лазерной резки для нормализованного документа.
 *
 * Алгоритм:
 * 1. Извлекаем конечные точки каждой режущей сущности
 * 2. Объединяем смежные сущности в цепочки (chains) через Union-Find
 * 3. Каждая цепочка = 1 врезка (pierce)
 * 4. Замкнутые сущности (CIRCLE, closed POLYLINE и т.д.) = 1 врезка
 *
 * @param doc - Нормализованный документ
 * @param layerFilter - Опциональный фильтр слоёв
 * @param tolerance - Допуск совпадения точек (по умолчанию 0.01)
 * @returns Статистика резки
 */
export declare function computeCuttingStats(doc: NormalizedDocument, layerFilter?: ReadonlySet<string>, tolerance?: number): CuttingStats;
/**
 * Форматирует длину реза в удобочитаемый вид.
 * @param length - Длина в единицах чертежа
 * @param units - Единицы ('mm' | 'm')
 * @returns Строка с единицами
 */
export declare function formatCutLength(length: number, units?: 'mm' | 'm'): string;
//# sourceMappingURL=index.d.ts.map