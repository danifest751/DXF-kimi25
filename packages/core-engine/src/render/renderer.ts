/**
 * @module core/render/renderer
 * Главный рендерер DXF: управляет камерой, R-tree, слоями, отрисовкой.
 */

import type { Color, Point3D } from '../types/index.js';
import type { NormalizedDocument, FlattenedEntity } from '../normalize/index.js';
import { Camera } from './camera.js';
import { RTree, type RTreeItem } from './rtree.js';
import { renderEntity, type EntityRenderOptions } from './entity-renderer.js';
import { TessellationCache } from './tessellation-cache.js';
import { addEntityPath, entityBatchKey, entityBatchStyle, type BatchRenderOptions } from './batch-renderer.js';
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
  // Overlay canvas для selection/hover — не перерисовывает основную геометрию
  private overlayCanvas: HTMLCanvasElement | null = null;
  private overlayCtx: CanvasRenderingContext2D | null = null;
  private needsOverlayRedraw: boolean = false;
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
  private tessCache: TessellationCache = new TessellationCache();
  // Переиспользуемый объект opts для hot loop (без spread на каждую итерацию)
  private readonly _batchOpts: BatchRenderOptions = {
    arcSegments: config.geometry.discretization.arcSegments,
    splineSegments: config.geometry.discretization.splineSegments,
    ellipseSegments: config.geometry.discretization.ellipseSegments,
    pixelSize: 1,
    viewExtent: 1000,
    tessCache: this.tessCache,
  };
  // Кэш последней viewport-трансформации для skip-rebuild оптимизации
  private _lastRenderZoom: number = 0;
  private _lastRenderPanX: number = 0;
  private _lastRenderPanY: number = 0;
  private _cachedVisibleIndices: number[] = [];
  // Кэш devicePixelRatio
  private _dpr: number = typeof devicePixelRatio !== 'undefined' ? devicePixelRatio : 1;

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

    // Создаём overlay canvas поверх основного
    this.overlayCanvas = document.createElement('canvas');
    this.overlayCanvas.style.position = 'absolute';
    this.overlayCanvas.style.top = '0';
    this.overlayCanvas.style.left = '0';
    this.overlayCanvas.style.pointerEvents = 'none';
    this.overlayCtx = this.overlayCanvas.getContext('2d', { alpha: true })!;
    // Вставляем overlay сразу после основного canvas
    canvas.parentElement?.appendChild(this.overlayCanvas);
    // Убеждаемся что родитель имеет position для overlay
    if (canvas.parentElement) {
      const pos = window.getComputedStyle(canvas.parentElement).position;
      if (pos === 'static') canvas.parentElement.style.position = 'relative';
    }

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
    this.overlayCanvas?.parentElement?.removeChild(this.overlayCanvas);
    this.overlayCanvas = null;
    this.overlayCtx = null;
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
    this.tessCache.clear();
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

    // Строим кэш тесселяции кривых через requestIdleCallback чтобы не блокировать UI
    const buildCache = (): void => {
      this.tessCache.build(
        doc.flatEntities,
        config.geometry.discretization.arcSegments,
        config.geometry.discretization.splineSegments,
        config.geometry.discretization.ellipseSegments,
      );
      this.requestRedraw();
    };
    if (typeof requestIdleCallback !== 'undefined') {
      requestIdleCallback(buildCache, { timeout: 500 });
    } else {
      buildCache();
    }

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
    this._dpr = typeof devicePixelRatio !== 'undefined' ? devicePixelRatio : 1;
    const parent = this.canvas.parentElement;
    if (parent !== null) {
      const rect = parent.getBoundingClientRect();
      const w = rect.width * this._dpr;
      const h = rect.height * this._dpr;
      this.canvas.width = w;
      this.canvas.height = h;
      this.canvas.style.width = `${rect.width}px`;
      this.canvas.style.height = `${rect.height}px`;
      // Синхронизируем overlay
      if (this.overlayCanvas !== null) {
        this.overlayCanvas.width = w;
        this.overlayCanvas.height = h;
        this.overlayCanvas.style.width = `${rect.width}px`;
        this.overlayCanvas.style.height = `${rect.height}px`;
      }
    }
    this.camera.setViewport(this.canvas.width, this.canvas.height);
    // Сбрасываем кэш трансформации при resize
    this._lastRenderZoom = 0;
    this.requestRedraw();
  }

  /**
   * Запрашивает перерисовку.
   */
  requestRedraw(): void {
    this.needsRedraw = true;
  }

  private requestOverlayRedraw(): void {
    this.needsOverlayRedraw = true;
  }

  /**
   * Главный цикл рендеринга.
   */
  private startRenderLoop(): void {
    const loop = (): void => {
      if (this.needsRedraw) {
        this.needsRedraw = false;
        this.render();
        // После перерисовки основного canvas overlay тоже обновляем
        this.needsOverlayRedraw = true;
      }
      if (this.needsOverlayRedraw) {
        this.needsOverlayRedraw = false;
        this.renderOverlay();
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

    // Обновляем переиспользуемый объект opts (без аллокации)
    (this._batchOpts as { pixelSize: number }).pixelSize = pixelSize;
    (this._batchOpts as { viewExtent: number }).viewExtent = viewExtent;
    (this._batchOpts as { tessCache: TessellationCache }).tessCache = this.tessCache;
    const batchOpts = this._batchOpts;

    // R-tree search: используем кэш если камера не двигалась
    const camZoom = this.camera.zoom;
    const camPanX = this.camera.panX;
    const camPanY = this.camera.panY;
    const cameraUnchanged = (
      camZoom === this._lastRenderZoom &&
      camPanX === this._lastRenderPanX &&
      camPanY === this._lastRenderPanY
    );
    if (!cameraUnchanged) {
      this._cachedVisibleIndices = this.rtree.search(visibleBounds);
      this._lastRenderZoom = camZoom;
      this._lastRenderPanX = camPanX;
      this._lastRenderPanY = camPanY;
    }
    const visibleIndices = this._cachedVisibleIndices;

    // ─── Группируем по batch key (цвет + толщина) ────────────────────
    const batches = new Map<string, Array<[number, FlattenedEntity]>>();
    const fallbackOpts = batchOpts as unknown as Omit<EntityRenderOptions, 'entityIndex'>;

    for (const idx of visibleIndices) {
      const fe = this.doc.flatEntities[idx]!;
      if (!this.isLayerVisible(fe.effectiveLayer)) continue;
      if (!fe.entity.visible) continue;
      // Выделенные/hovered рендерятся в overlay — пропускаем здесь
      if (this.selectedHandles.has(fe.entity.handle)) continue;
      if (idx === this.hoveredIndex) continue;

      const key = entityBatchKey(fe, pixelSize);
      let batch = batches.get(key);
      if (batch === undefined) { batch = []; batches.set(key, batch); }
      batch.push([idx, fe]);
    }

    // ─── Batch render ────────────────────────────────────────────────
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    for (const batch of batches.values()) {
      if (batch.length === 0) continue;

      const style = entityBatchStyle(batch[0]![1], pixelSize);
      ctx.strokeStyle = style.strokeStyle;
      ctx.lineWidth = style.lineWidth;
      ctx.fillStyle = style.strokeStyle;

      const fallbackQueue: Array<[number, FlattenedEntity]> = [];
      ctx.beginPath();
      for (const [idx, fe] of batch) {
        const added = addEntityPath(ctx, fe, idx, batchOpts);
        if (!added) fallbackQueue.push([idx, fe]);
      }
      ctx.stroke();

      for (const [idx, fe] of fallbackQueue) {
        const opts: EntityRenderOptions = { ...fallbackOpts, entityIndex: idx };
        renderEntity(ctx, fe, opts);
      }
    }

    // Маркеры врезок рисуем на основном canvas
    if (this._showPiercePoints) {
      this.renderPierceMarkers(ctx);
    }
  }

  /**
   * Рендер overlay — только selection/hover поверх основного canvas.
   * Вызывается отдельно, не перерисовывает геометрию.
   */
  private renderOverlay(): void {
    const ctx = this.overlayCtx;
    const canvas = this.overlayCanvas;
    if (ctx === null || canvas === null || this.doc === null) return;

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const hasSelection = this.selectedHandles.size > 0;
    const hasHover = this.hoveredIndex >= 0;
    if (!hasSelection && !hasHover) return;

    this.camera.applyToContext(ctx);

    const pixelSize = 1 / this.camera.zoom;
    const visibleBounds = this.camera.getVisibleBounds();
    const viewExtent = Math.max(
      visibleBounds.max.x - visibleBounds.min.x,
      visibleBounds.max.y - visibleBounds.min.y,
    ) * 2;

    const batchOpts: BatchRenderOptions = {
      arcSegments: config.geometry.discretization.arcSegments,
      splineSegments: config.geometry.discretization.splineSegments,
      ellipseSegments: config.geometry.discretization.ellipseSegments,
      pixelSize,
      viewExtent,
      tessCache: this.tessCache,
    };

    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    // Hover
    if (hasHover) {
      const fe = this.doc.flatEntities[this.hoveredIndex];
      if (fe !== undefined && this.isLayerVisible(fe.effectiveLayer) && fe.entity.visible) {
        const hovered: FlattenedEntity = {
          ...fe,
          effectiveColor: this.options.hoverColor,
          effectiveLineWeight: Math.max(fe.effectiveLineWeight, 50),
        };
        ctx.strokeStyle = `rgb(${this.options.hoverColor.r},${this.options.hoverColor.g},${this.options.hoverColor.b})`;
        ctx.lineWidth = hovered.effectiveLineWeight > 0
          ? Math.max(pixelSize, hovered.effectiveLineWeight / 100) : pixelSize;
        ctx.fillStyle = ctx.strokeStyle;
        ctx.beginPath();
        const added = addEntityPath(ctx, hovered, this.hoveredIndex, batchOpts);
        ctx.stroke();
        if (!added) {
          const opts: EntityRenderOptions = { ...batchOpts, entityIndex: this.hoveredIndex };
          renderEntity(ctx, hovered, opts);
        }
      }
    }

    // Selection
    if (hasSelection) {
      const selColor = this.options.selectionColor;
      const visibleIndices = this.rtree.search(visibleBounds);
      // Батч selected сущностей одним цветом
      ctx.strokeStyle = `rgb(${selColor.r},${selColor.g},${selColor.b})`;
      ctx.lineWidth = pixelSize * 2;
      ctx.fillStyle = ctx.strokeStyle;
      const fallbackQueue: Array<[number, FlattenedEntity]> = [];
      ctx.beginPath();
      for (const idx of visibleIndices) {
        const fe = this.doc.flatEntities[idx]!;
        if (!this.selectedHandles.has(fe.entity.handle)) continue;
        if (!this.isLayerVisible(fe.effectiveLayer) || !fe.entity.visible) continue;
        const sel: FlattenedEntity = { ...fe, effectiveColor: selColor };
        const added = addEntityPath(ctx, sel, idx, batchOpts);
        if (!added) fallbackQueue.push([idx, sel]);
      }
      ctx.stroke();
      for (const [idx, fe] of fallbackQueue) {
        const opts: EntityRenderOptions = { ...batchOpts, entityIndex: idx };
        renderEntity(ctx, fe, opts);
      }
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
    this.requestOverlayRedraw();
  }

  deselect(handle: string): void {
    this.selectedHandles.delete(handle);
    this.requestOverlayRedraw();
  }

  clearSelection(): void {
    this.selectedHandles.clear();
    this.requestOverlayRedraw();
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
      this.requestOverlayRedraw();
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
