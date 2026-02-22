/**
 * @module core/render/renderer
 * Главный рендерер DXF: управляет камерой, R-tree, слоями, отрисовкой.
 */
import type { Color, Point3D } from '../types/index.js';
import type { NormalizedDocument, FlattenedEntity } from '../normalize/index.js';
import { Camera } from './camera.js';
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
/**
 * Главный класс рендерера.
 */
export declare class DXFRenderer {
    readonly camera: Camera;
    private canvas;
    private ctx;
    private doc;
    private rtree;
    private layerVisibility;
    private selectedHandles;
    private hoveredIndex;
    private options;
    private animFrameId;
    private needsRedraw;
    private piercePoints;
    private _showPiercePoints;
    constructor(options?: Partial<RendererOptions>);
    /**
     * Привязывает рендерер к canvas элементу.
     */
    attach(canvas: HTMLCanvasElement): void;
    /**
     * Отвязывает рендерер.
     */
    detach(): void;
    /**
     * Загружает нормализованный документ для отрисовки.
     */
    clearDocument(): void;
    setDocument(doc: NormalizedDocument): void;
    /**
     * Строит R-tree из flatEntities.
     */
    private buildRTree;
    /**
     * Подгоняет размер canvas под контейнер.
     */
    resizeToContainer(): void;
    /**
     * Запрашивает перерисовку.
     */
    requestRedraw(): void;
    /**
     * Главный цикл рендеринга.
     */
    private startRenderLoop;
    /**
     * Отрисовка одного кадра.
     */
    private render;
    /**
     * Рисует сетку.
     */
    private renderGrid;
    isLayerVisible(name: string): boolean;
    setLayerVisibility(name: string, visible: boolean): void;
    toggleLayer(name: string): void;
    getLayerVisibility(): LayerVisibilityMap;
    select(handle: string): void;
    deselect(handle: string): void;
    clearSelection(): void;
    getSelectedHandles(): Set<string>;
    /**
     * Hit-test по экранным координатам.
     * @returns Индекс FlattenedEntity или -1
     */
    hitTestScreen(screenX: number, screenY: number): number;
    /**
     * Получить FlattenedEntity по индексу.
     */
    getEntity(index: number): FlattenedEntity | null;
    /**
     * Устанавливает hovered entity.
     */
    setHovered(index: number): void;
    zoomToFit(): void;
    getDocument(): NormalizedDocument | null;
    setPiercePoints(points: readonly Point3D[]): void;
    get showPiercePoints(): boolean;
    set showPiercePoints(v: boolean);
    private renderPierceMarkers;
}
//# sourceMappingURL=renderer.d.ts.map