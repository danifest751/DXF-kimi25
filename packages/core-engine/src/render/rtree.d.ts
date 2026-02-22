/**
 * @module core/render/rtree
 * Простой R-tree для пространственной индексации и hit-testing.
 * Оптимизирован для статических данных (bulk-load).
 */
import type { BoundingBox } from '../types/index.js';
/** Элемент R-tree */
export interface RTreeItem<T> {
    readonly bbox: BoundingBox;
    readonly data: T;
}
/**
 * Простой R-tree с bulk-loading (Sort-Tile-Recursive).
 */
export declare class RTree<T> {
    private root;
    private readonly maxChildren;
    constructor(maxChildren?: number);
    /**
     * Загружает все элементы разом (STR bulk-load).
     */
    load(items: RTreeItem<T>[]): void;
    private buildNode;
    private buildUpperLevel;
    /**
     * Поиск всех элементов, пересекающих заданный bbox.
     */
    search(bbox: BoundingBox): T[];
    private searchNode;
    /**
     * Поиск элементов в точке (hit-test).
     * @param x - Мировая координата X
     * @param y - Мировая координата Y
     * @param tolerance - Допуск в мировых единицах
     */
    hitTest(x: number, y: number, tolerance?: number): T[];
    /**
     * Количество элементов.
     */
    get size(): number;
    private countItems;
    /**
     * Очищает дерево.
     */
    clear(): void;
}
//# sourceMappingURL=rtree.d.ts.map