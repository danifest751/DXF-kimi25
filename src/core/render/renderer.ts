/**
 * @module core/render/renderer
 * Главный рендерер DXF: управляет камерой, R-tree, слоями, отрисовкой.
 */

import type { Color, Point3D } from '../types/index.js';
import type { NormalizedDocument, FlattenedEntity } from '../normalize/index.js';
import { Camera } from './camera.js';
import { RTree, type RTreeItem } from './rtree.js';
import { renderEntity, type EntityRenderOptions } from './entity-renderer.js';
import { config } from '../config.js';

/** Состояние видимости слоёв */
export type LayerVisibilityMap = Map<string, boolean>;

/** Опции рендерера */
export interface RendererOptions {
  readonly backgroundColor: Color;
  readonly selectionColor: Color;
  readonly hoverColor: Color;
  readonly showGrid: boolean;
  readonly gridSize: number;
  readonly gridColor: Color;
}

const DEFAULT_OPTIONS: RendererOptions = {
  backgroundColor: { r: 15, g: 17, b: 23 },
  selectionColor: { r: 99, g: 102, b: 241 },
  hoverColor: { r: 245, g: 158, b: 11 },
  showGrid: false,
  gridSize: 10,
  gridColor: { r: 60, g: 60, b: 60 },
};

/**
 * Главный класс рендерера.
 */
export class DXFRenderer {
  readonly camera: Camera;
  private canvas: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;
  private doc: NormalizedDocument | null = null;
  private rtree: RTree<number> = new RTree(config.rendering.hitTesting.rTreeMaxChildren);
  private layerVisibility: LayerVisibilityMap = new Map();
  private selectedHandles: Set<string> = new Set();
  private hoveredIndex: number = -1;
  private options: RendererOptions;
  private animFrameId: number = 0;
  private needsRedraw: boolean = true;
  private piercePoints: readonly Point3D[] = [];
  private _showPiercePoints: boolean = false;

  constructor(options?: Partial<RendererOptions>) {
    this.camera = new Camera();
    this.options = { ...DEFAULT_OPTIONS, ...options };
  }

  /**
   * Привязывает рендерер к canvas элементу.
   */
  attach(canvas: HTMLCanvasElement): void {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: false })!;
    this.resizeToContainer();
    this.startRenderLoop();
  }

  /**
   * Отвязывает рендерер.
   */
  detach(): void {
    if (this.animFrameId !== 0) {
      cancelAnimationFrame(this.animFrameId);
      this.animFrameId = 0;
    }
    this.canvas = null;
    this.ctx = null;
  }

  /**
   * Загружает нормализованный документ для отрисовки.
   */
  clearDocument(): void {
    this.doc = null;
    this.rtree = new RTree(config.rendering.hitTesting.rTreeMaxChildren);
    this.layerVisibility.clear();
    this.selectedHandles.clear();
    this.hoveredIndex = -1;
    this.piercePoints = [];
    this.requestRedraw();
  }

  setDocument(doc: NormalizedDocument): void {
    this.doc = doc;

    // Инициализируем видимость слоёв
    this.layerVisibility.clear();
    for (const name of doc.layerNames) {
      const layer = doc.source.layers.get(name);
      this.layerVisibility.set(name, layer?.visible ?? true);
    }

    // Строим R-tree
    this.buildRTree();

    // Подгоняем камеру
    if (doc.totalBBox !== null) {
      this.camera.fitToExtents(doc.totalBBox);
    }

    this.requestRedraw();
  }

  /**
   * Строит R-tree из flatEntities.
   */
  private buildRTree(): void {
    if (this.doc === null) return;

    const items: RTreeItem<number>[] = [];
    for (let i = 0; i < this.doc.flatEntities.length; i++) {
      const fe = this.doc.flatEntities[i]!;
      const bb = fe.entity.boundingBox;
      if (bb !== null && bb !== undefined) {
        items.push({ bbox: bb, data: i });
      }
    }
    this.rtree.load(items);
  }

  /**
   * Подгоняет размер canvas под контейнер.
   */
  resizeToContainer(): void {
    if (this.canvas === null) return;
    const parent = this.canvas.parentElement;
    if (parent !== null) {
      const rect = parent.getBoundingClientRect();
      this.canvas.width = rect.width * devicePixelRatio;
      this.canvas.height = rect.height * devicePixelRatio;
      this.canvas.style.width = `${rect.width}px`;
      this.canvas.style.height = `${rect.height}px`;
    }
    this.camera.setViewport(this.canvas.width, this.canvas.height);
    this.requestRedraw();
  }

  /**
   * Запрашивает перерисовку.
   */
  requestRedraw(): void {
    this.needsRedraw = true;
  }

  /**
   * Главный цикл рендеринга.
   */
  private startRenderLoop(): void {
    const loop = (): void => {
      if (this.needsRedraw) {
        this.needsRedraw = false;
        this.render();
      }
      this.animFrameId = requestAnimationFrame(loop);
    };
    this.animFrameId = requestAnimationFrame(loop);
  }

  /**
   * Отрисовка одного кадра.
   */
  private render(): void {
    const ctx = this.ctx;
    const canvas = this.canvas;
    if (ctx === null || canvas === null) return;

    const w = canvas.width;
    const h = canvas.height;

    // Очистка фона
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    const bg = this.options.backgroundColor;
    ctx.fillStyle = `rgb(${bg.r},${bg.g},${bg.b})`;
    ctx.fillRect(0, 0, w, h);

    if (this.doc === null) return;

    // Сетка
    if (this.options.showGrid) {
      this.renderGrid(ctx);
    }

    // Применяем камеру
    this.camera.applyToContext(ctx);

    // Размер пикселя в мировых единицах
    const pixelSize = 1 / this.camera.zoom;

    // Видимая область
    const visibleBounds = this.camera.getVisibleBounds();
    const viewExtent = Math.max(
      visibleBounds.max.x - visibleBounds.min.x,
      visibleBounds.max.y - visibleBounds.min.y,
    ) * 2;

    const opts: EntityRenderOptions = {
      arcSegments: config.geometry.discretization.arcSegments,
      splineSegments: config.geometry.discretization.splineSegments,
      ellipseSegments: config.geometry.discretization.ellipseSegments,
      pixelSize,
      viewExtent,
    };

    // Получаем индексы видимых сущностей из R-tree
    const visibleIndices = this.rtree.search(visibleBounds);

    // Рисуем сущности
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    for (const idx of visibleIndices) {
      const fe = this.doc.flatEntities[idx]!;

      // Проверяем видимость слоя
      if (!this.isLayerVisible(fe.effectiveLayer)) continue;
      if (!fe.entity.visible) continue;

      // Подсветка выбранных/наведённых
      const isSelected = this.selectedHandles.has(fe.entity.handle);
      const isHovered = idx === this.hoveredIndex;

      if (isSelected || isHovered) {
        ctx.save();
        const color = isSelected ? this.options.selectionColor : this.options.hoverColor;
        const highlighted: FlattenedEntity = {
          ...fe,
          effectiveColor: color,
          effectiveLineWeight: Math.max(fe.effectiveLineWeight, 50), // толще
        };
        renderEntity(ctx, highlighted, opts);
        ctx.restore();
      } else {
        renderEntity(ctx, fe, opts);
      }
    }

    // Маркеры врезок
    if (this._showPiercePoints) {
      this.renderPierceMarkers(ctx);
    }
  }

  /**
   * Рисует сетку.
   */
  private renderGrid(ctx: CanvasRenderingContext2D): void {
    const bounds = this.camera.getVisibleBounds();
    const gridSize = this.options.gridSize;
    const gc = this.options.gridColor;

    this.camera.applyToContext(ctx);
    ctx.strokeStyle = `rgb(${gc.r},${gc.g},${gc.b})`;
    ctx.lineWidth = 1 / this.camera.zoom;

    const startX = Math.floor(bounds.min.x / gridSize) * gridSize;
    const endX = Math.ceil(bounds.max.x / gridSize) * gridSize;
    const startY = Math.floor(bounds.min.y / gridSize) * gridSize;
    const endY = Math.ceil(bounds.max.y / gridSize) * gridSize;

    ctx.beginPath();
    for (let x = startX; x <= endX; x += gridSize) {
      ctx.moveTo(x, bounds.min.y);
      ctx.lineTo(x, bounds.max.y);
    }
    for (let y = startY; y <= endY; y += gridSize) {
      ctx.moveTo(bounds.min.x, y);
      ctx.lineTo(bounds.max.x, y);
    }
    ctx.stroke();
  }

  // ─── Слои ──────────────────────────────────────────────────────────

  isLayerVisible(name: string): boolean {
    return this.layerVisibility.get(name) ?? true;
  }

  setLayerVisibility(name: string, visible: boolean): void {
    this.layerVisibility.set(name, visible);
    this.requestRedraw();
  }

  toggleLayer(name: string): void {
    this.setLayerVisibility(name, !this.isLayerVisible(name));
  }

  getLayerVisibility(): LayerVisibilityMap {
    return new Map(this.layerVisibility);
  }

  // ─── Выделение ─────────────────────────────────────────────────────

  select(handle: string): void {
    this.selectedHandles.add(handle);
    this.requestRedraw();
  }

  deselect(handle: string): void {
    this.selectedHandles.delete(handle);
    this.requestRedraw();
  }

  clearSelection(): void {
    this.selectedHandles.clear();
    this.requestRedraw();
  }

  getSelectedHandles(): Set<string> {
    return new Set(this.selectedHandles);
  }

  // ─── Hit-testing ───────────────────────────────────────────────────

  /**
   * Hit-test по экранным координатам.
   * @returns Индекс FlattenedEntity или -1
   */
  hitTestScreen(screenX: number, screenY: number): number {
    const world = this.camera.screenToWorld(screenX, screenY);
    const tolerance = 5 / this.camera.zoom; // 5 пикселей
    const candidates = this.rtree.hitTest(world.x, world.y, tolerance);
    return candidates.length > 0 ? candidates[0]! : -1;
  }

  /**
   * Получить FlattenedEntity по индексу.
   */
  getEntity(index: number): FlattenedEntity | null {
    if (this.doc === null || index < 0 || index >= this.doc.flatEntities.length) return null;
    return this.doc.flatEntities[index]!;
  }

  /**
   * Устанавливает hovered entity.
   */
  setHovered(index: number): void {
    if (this.hoveredIndex !== index) {
      this.hoveredIndex = index;
      this.requestRedraw();
    }
  }

  // ─── Zoom/Pan ──────────────────────────────────────────────────────

  zoomToFit(): void {
    if (this.doc?.totalBBox) {
      this.camera.fitToExtents(this.doc.totalBBox);
      this.requestRedraw();
    }
  }

  getDocument(): NormalizedDocument | null {
    return this.doc;
  }

  // ─── Маркеры врезок ───────────────────────────────────────────────

  setPiercePoints(points: readonly Point3D[]): void {
    this.piercePoints = points;
    this.requestRedraw();
  }

  get showPiercePoints(): boolean {
    return this._showPiercePoints;
  }

  set showPiercePoints(v: boolean) {
    this._showPiercePoints = v;
    this.requestRedraw();
  }

  private renderPierceMarkers(ctx: CanvasRenderingContext2D): void {
    if (this.piercePoints.length === 0) return;

    const pixelSize = 1 / this.camera.zoom;
    const markerR = 6 * pixelSize;
    const crossR = 10 * pixelSize;

    for (const pt of this.piercePoints) {
      // Зелёный круг с крестом
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, markerR, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(0, 220, 80, 0.7)';
      ctx.fill();
      ctx.strokeStyle = '#00ff55';
      ctx.lineWidth = 1.5 * pixelSize;
      ctx.stroke();

      // Крест
      ctx.beginPath();
      ctx.moveTo(pt.x - crossR, pt.y);
      ctx.lineTo(pt.x + crossR, pt.y);
      ctx.moveTo(pt.x, pt.y - crossR);
      ctx.lineTo(pt.x, pt.y + crossR);
      ctx.strokeStyle = '#00ff55';
      ctx.lineWidth = 1 * pixelSize;
      ctx.stroke();
    }
  }
}
