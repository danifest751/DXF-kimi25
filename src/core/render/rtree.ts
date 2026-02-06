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

/** Узел R-tree */
interface RTreeNode<T> {
  bbox: BoundingBox;
  children: RTreeNode<T>[];
  items: RTreeItem<T>[];
  isLeaf: boolean;
}

/**
 * Проверяет пересечение двух AABB (2D, игнорируем Z).
 */
function bboxIntersects2D(a: BoundingBox, b: BoundingBox): boolean {
  return a.min.x <= b.max.x && a.max.x >= b.min.x &&
         a.min.y <= b.max.y && a.max.y >= b.min.y;
}

/**
 * Объединяет два bbox.
 */
function unionBBox(a: BoundingBox, b: BoundingBox): BoundingBox {
  return {
    min: {
      x: Math.min(a.min.x, b.min.x),
      y: Math.min(a.min.y, b.min.y),
      z: Math.min(a.min.z, b.min.z),
    },
    max: {
      x: Math.max(a.max.x, b.max.x),
      y: Math.max(a.max.y, b.max.y),
      z: Math.max(a.max.z, b.max.z),
    },
  };
}

/**
 * Простой R-tree с bulk-loading (Sort-Tile-Recursive).
 */
export class RTree<T> {
  private root: RTreeNode<T> | null = null;
  private readonly maxChildren: number;

  constructor(maxChildren: number = 16) {
    this.maxChildren = maxChildren;
  }

  /**
   * Загружает все элементы разом (STR bulk-load).
   */
  load(items: RTreeItem<T>[]): void {
    if (items.length === 0) {
      this.root = null;
      return;
    }
    this.root = this.buildNode(items);
  }

  private buildNode(items: RTreeItem<T>[]): RTreeNode<T> {
    if (items.length <= this.maxChildren) {
      // Лист
      let bbox = items[0]!.bbox;
      for (let i = 1; i < items.length; i++) {
        bbox = unionBBox(bbox, items[i]!.bbox);
      }
      return { bbox, children: [], items, isLeaf: true };
    }

    // STR: сортируем по X, разбиваем на полосы, в каждой сортируем по Y
    const numSlices = Math.ceil(Math.sqrt(items.length / this.maxChildren));
    const sliceSize = Math.ceil(items.length / numSlices);

    // Сортируем по центру X
    const sorted = items.slice().sort((a, b) => {
      const acx = (a.bbox.min.x + a.bbox.max.x) / 2;
      const bcx = (b.bbox.min.x + b.bbox.max.x) / 2;
      return acx - bcx;
    });

    const childNodes: RTreeNode<T>[] = [];

    for (let i = 0; i < sorted.length; i += sliceSize) {
      const slice = sorted.slice(i, i + sliceSize);
      // Сортируем полосу по центру Y
      slice.sort((a, b) => {
        const acy = (a.bbox.min.y + a.bbox.max.y) / 2;
        const bcy = (b.bbox.min.y + b.bbox.max.y) / 2;
        return acy - bcy;
      });

      // Разбиваем полосу на группы
      for (let j = 0; j < slice.length; j += this.maxChildren) {
        const group = slice.slice(j, j + this.maxChildren);
        let groupBBox = group[0]!.bbox;
        for (let k = 1; k < group.length; k++) {
          groupBBox = unionBBox(groupBBox, group[k]!.bbox);
        }
        childNodes.push({ bbox: groupBBox, children: [], items: group, isLeaf: true });
      }
    }

    // Если слишком много дочерних узлов — строим ещё уровень
    if (childNodes.length <= this.maxChildren) {
      let bbox = childNodes[0]!.bbox;
      for (let i = 1; i < childNodes.length; i++) {
        bbox = unionBBox(bbox, childNodes[i]!.bbox);
      }
      return { bbox, children: childNodes, items: [], isLeaf: false };
    }

    // Рекурсивно строим верхние уровни
    return this.buildUpperLevel(childNodes);
  }

  private buildUpperLevel(nodes: RTreeNode<T>[]): RTreeNode<T> {
    if (nodes.length <= this.maxChildren) {
      let bbox = nodes[0]!.bbox;
      for (let i = 1; i < nodes.length; i++) {
        bbox = unionBBox(bbox, nodes[i]!.bbox);
      }
      return { bbox, children: nodes, items: [], isLeaf: false };
    }

    const numSlices = Math.ceil(Math.sqrt(nodes.length / this.maxChildren));
    const sliceSize = Math.ceil(nodes.length / numSlices);

    const sorted = nodes.slice().sort((a, b) => {
      const acx = (a.bbox.min.x + a.bbox.max.x) / 2;
      const bcx = (b.bbox.min.x + b.bbox.max.x) / 2;
      return acx - bcx;
    });

    const parentNodes: RTreeNode<T>[] = [];

    for (let i = 0; i < sorted.length; i += sliceSize) {
      const slice = sorted.slice(i, i + sliceSize);
      slice.sort((a, b) => {
        const acy = (a.bbox.min.y + a.bbox.max.y) / 2;
        const bcy = (b.bbox.min.y + b.bbox.max.y) / 2;
        return acy - bcy;
      });

      for (let j = 0; j < slice.length; j += this.maxChildren) {
        const group = slice.slice(j, j + this.maxChildren);
        let groupBBox = group[0]!.bbox;
        for (let k = 1; k < group.length; k++) {
          groupBBox = unionBBox(groupBBox, group[k]!.bbox);
        }
        parentNodes.push({ bbox: groupBBox, children: group, items: [], isLeaf: false });
      }
    }

    return this.buildUpperLevel(parentNodes);
  }

  /**
   * Поиск всех элементов, пересекающих заданный bbox.
   */
  search(bbox: BoundingBox): T[] {
    const results: T[] = [];
    if (this.root !== null) {
      this.searchNode(this.root, bbox, results);
    }
    return results;
  }

  private searchNode(node: RTreeNode<T>, bbox: BoundingBox, results: T[]): void {
    if (!bboxIntersects2D(node.bbox, bbox)) return;

    if (node.isLeaf) {
      for (const item of node.items) {
        if (bboxIntersects2D(item.bbox, bbox)) {
          results.push(item.data);
        }
      }
    } else {
      for (const child of node.children) {
        this.searchNode(child, bbox, results);
      }
    }
  }

  /**
   * Поиск элементов в точке (hit-test).
   * @param x - Мировая координата X
   * @param y - Мировая координата Y
   * @param tolerance - Допуск в мировых единицах
   */
  hitTest(x: number, y: number, tolerance: number = 0): T[] {
    const bbox: BoundingBox = {
      min: { x: x - tolerance, y: y - tolerance, z: -Infinity },
      max: { x: x + tolerance, y: y + tolerance, z: Infinity },
    };
    return this.search(bbox);
  }

  /**
   * Количество элементов.
   */
  get size(): number {
    if (this.root === null) return 0;
    return this.countItems(this.root);
  }

  private countItems(node: RTreeNode<T>): number {
    if (node.isLeaf) return node.items.length;
    let count = 0;
    for (const child of node.children) {
      count += this.countItems(child);
    }
    return count;
  }

  /**
   * Очищает дерево.
   */
  clear(): void {
    this.root = null;
  }
}
