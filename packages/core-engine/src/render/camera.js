/**
 * @module core/render/camera
 * Камера 2D: zoom, pan, rotation.
 * Преобразует мировые координаты в экранные и обратно.
 */
export class Camera {
    /** Масштаб (пикселей на единицу мира) */
    zoom = 1;
    /** Смещение в мировых координатах (центр вида) */
    panX = 0;
    panY = 0;
    /** Поворот в радианах */
    rotation = 0;
    /** Размер canvas */
    _width = 800;
    _height = 600;
    get width() { return this._width; }
    get height() { return this._height; }
    setViewport(width, height) {
        this._width = width;
        this._height = height;
    }
    /**
     * Мировые координаты → экранные.
     */
    worldToScreen(wx, wy) {
        const cos = Math.cos(this.rotation);
        const sin = Math.sin(this.rotation);
        const dx = wx - this.panX;
        const dy = wy - this.panY;
        const rx = dx * cos + dy * sin;
        const ry = -dx * sin + dy * cos;
        return {
            x: this._width / 2 + rx * this.zoom,
            y: this._height / 2 - ry * this.zoom, // Y инвертирован
        };
    }
    /**
     * Экранные координаты → мировые.
     */
    screenToWorld(sx, sy) {
        const rx = (sx - this._width / 2) / this.zoom;
        const ry = -(sy - this._height / 2) / this.zoom;
        const cos = Math.cos(-this.rotation);
        const sin = Math.sin(-this.rotation);
        return {
            x: this.panX + rx * cos + ry * sin,
            y: this.panY - rx * sin + ry * cos,
        };
    }
    /**
     * Применяет трансформацию камеры к Canvas2D контексту.
     */
    applyToContext(ctx) {
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.translate(this._width / 2, this._height / 2);
        ctx.scale(this.zoom, -this.zoom); // Y инвертирован
        ctx.rotate(-this.rotation);
        ctx.translate(-this.panX, -this.panY);
    }
    /**
     * Подгоняет вид под BoundingBox (fit to extents).
     */
    fitToExtents(bbox, padding = 0.05) {
        const bw = bbox.max.x - bbox.min.x;
        const bh = bbox.max.y - bbox.min.y;
        if (bw <= 0 && bh <= 0)
            return;
        this.panX = bbox.min.x + bw / 2;
        this.panY = bbox.min.y + bh / 2;
        this.rotation = 0;
        const padFactor = 1 + padding * 2;
        const zoomX = this._width / (bw * padFactor || 1);
        const zoomY = this._height / (bh * padFactor || 1);
        this.zoom = Math.min(zoomX, zoomY);
    }
    /**
     * Zoom к точке экрана (сохраняя позицию под курсором).
     */
    zoomAt(screenX, screenY, factor) {
        const worldBefore = this.screenToWorld(screenX, screenY);
        this.zoom *= factor;
        this.zoom = Math.max(1e-6, Math.min(1e8, this.zoom));
        const worldAfter = this.screenToWorld(screenX, screenY);
        this.panX += worldBefore.x - worldAfter.x;
        this.panY += worldBefore.y - worldAfter.y;
    }
    /**
     * Pan на delta экранных пикселей.
     */
    panBy(deltaScreenX, deltaScreenY) {
        this.panX -= deltaScreenX / this.zoom;
        this.panY += deltaScreenY / this.zoom;
    }
    /**
     * Возвращает видимый прямоугольник в мировых координатах.
     */
    getVisibleBounds() {
        const tl = this.screenToWorld(0, 0);
        const tr = this.screenToWorld(this._width, 0);
        const bl = this.screenToWorld(0, this._height);
        const br = this.screenToWorld(this._width, this._height);
        return {
            min: {
                x: Math.min(tl.x, tr.x, bl.x, br.x),
                y: Math.min(tl.y, tr.y, bl.y, br.y),
                z: 0,
            },
            max: {
                x: Math.max(tl.x, tr.x, bl.x, br.x),
                y: Math.max(tl.y, tr.y, bl.y, br.y),
                z: 0,
            },
        };
    }
}
//# sourceMappingURL=camera.js.map