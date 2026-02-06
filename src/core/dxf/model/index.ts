/**
 * @module core/dxf/model
 * Модель DXF документа — обёртка над DXFDocument с удобными методами доступа.
 */

import {
  type DXFDocument,
  type DXFEntity,
  type DXFLayer,
  type DXFBlock,
  type DXFEntityType,
  type BoundingBox,
  type Color,
} from '../../types/index.js';

/**
 * Обёртка над DXFDocument с удобными методами запросов.
 */
export class DXFModel {
  private readonly doc: DXFDocument;

  constructor(doc: DXFDocument) {
    this.doc = doc;
  }

  /** Получить исходный документ */
  get document(): DXFDocument {
    return this.doc;
  }

  /** Получить все сущности */
  get entities(): readonly DXFEntity[] {
    return this.doc.entities;
  }

  /** Получить количество сущностей */
  get entityCount(): number {
    return this.doc.entities.length;
  }

  /** Получить все слои */
  get layers(): Map<string, DXFLayer> {
    return this.doc.layers;
  }

  /** Получить имена всех слоёв */
  get layerNames(): string[] {
    return Array.from(this.doc.layers.keys());
  }

  /** Получить все блоки */
  get blocks(): Map<string, DXFBlock> {
    return this.doc.blocks;
  }

  /** Получить экстенты документа */
  get extents(): BoundingBox {
    return this.doc.metadata.extents;
  }

  /**
   * Получить сущности по типу.
   * @param type - Тип сущности
   * @returns Массив сущностей данного типа
   */
  getEntitiesByType(type: DXFEntityType): DXFEntity[] {
    return this.doc.entities.filter((e) => e.type === type);
  }

  /**
   * Получить сущности по слою.
   * @param layerName - Имя слоя
   * @returns Массив сущностей на данном слое
   */
  getEntitiesByLayer(layerName: string): DXFEntity[] {
    return this.doc.entities.filter((e) => e.layer === layerName);
  }

  /**
   * Получить сущность по handle.
   * @param handle - Handle сущности
   * @returns Сущность или undefined
   */
  getEntityByHandle(handle: string): DXFEntity | undefined {
    return this.doc.entities.find((e) => e.handle === handle);
  }

  /**
   * Получить слой по имени.
   * @param name - Имя слоя
   * @returns Слой или undefined
   */
  getLayer(name: string): DXFLayer | undefined {
    return this.doc.layers.get(name);
  }

  /**
   * Получить блок по имени.
   * @param name - Имя блока
   * @returns Блок или undefined
   */
  getBlock(name: string): DXFBlock | undefined {
    return this.doc.blocks.get(name);
  }

  /**
   * Получить видимые сущности (с учётом видимости слоёв).
   * @returns Массив видимых сущностей
   */
  getVisibleEntities(): DXFEntity[] {
    return this.doc.entities.filter((e) => {
      if (!e.visible) return false;
      const layer = this.doc.layers.get(e.layer);
      if (layer !== undefined && (!layer.visible || layer.frozen)) return false;
      return true;
    });
  }

  /**
   * Вычисляет ограничивающий прямоугольник для всех сущностей.
   * @returns BoundingBox или null если нет сущностей
   */
  computeBoundingBox(): BoundingBox | null {
    if (this.doc.entities.length === 0) return null;

    let minX = Infinity, minY = Infinity, minZ = Infinity;
    let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;

    for (const entity of this.doc.entities) {
      const bb = entity.boundingBox;
      if (bb !== undefined) {
        minX = Math.min(minX, bb.min.x);
        minY = Math.min(minY, bb.min.y);
        minZ = Math.min(minZ, bb.min.z);
        maxX = Math.max(maxX, bb.max.x);
        maxY = Math.max(maxY, bb.max.y);
        maxZ = Math.max(maxZ, bb.max.z);
      }
    }

    if (!isFinite(minX)) return null;

    return {
      min: { x: minX, y: minY, z: minZ },
      max: { x: maxX, y: maxY, z: maxZ },
    };
  }

  /**
   * Получить эффективный цвет сущности (с учётом BYLAYER/BYBLOCK).
   * @param entity - Сущность
   * @returns Цвет
   */
  getEffectiveColor(entity: DXFEntity): Color {
    if (entity.color !== undefined) {
      return entity.color;
    }
    // BYLAYER
    const layer = this.doc.layers.get(entity.layer);
    if (layer !== undefined) {
      return layer.color;
    }
    // Цвет по умолчанию — белый
    return { r: 255, g: 255, b: 255 };
  }
}
