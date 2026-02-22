/**
 * @module core/render/camera
 * Камера 2D: zoom, pan, rotation.
 * Преобразует мировые координаты в экранные и обратно.
 */
import type { Point2D, BoundingBox } from '../types/index.js';
export declare class Camera {
    /** Масштаб (пикселей на единицу мира) */
    zoom: number;
    /** Смещение в мировых координатах (центр вида) */
    panX: number;
    panY: number;
    /** Поворот в радианах */
    rotation: number;
    /** Размер canvas */
    private _width;
    private _height;
    get width(): number;
    get height(): number;
    setViewport(width: number, height: number): void;
    /**
     * Мировые координаты → экранные.
     */
    worldToScreen(wx: number, wy: number): Point2D;
    /**
     * Экранные координаты → мировые.
     */
    screenToWorld(sx: number, sy: number): Point2D;
    /**
     * Применяет трансформацию камеры к Canvas2D контексту.
     */
    applyToContext(ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D): void;
    /**
     * Подгоняет вид под BoundingBox (fit to extents).
     */
    fitToExtents(bbox: BoundingBox, padding?: number): void;
    /**
     * Zoom к точке экрана (сохраняя позицию под курсором).
     */
    zoomAt(screenX: number, screenY: number, factor: number): void;
    /**
     * Pan на delta экранных пикселей.
     */
    panBy(deltaScreenX: number, deltaScreenY: number): void;
    /**
     * Возвращает видимый прямоугольник в мировых координатах.
     */
    getVisibleBounds(): BoundingBox;
}
//# sourceMappingURL=camera.d.ts.map