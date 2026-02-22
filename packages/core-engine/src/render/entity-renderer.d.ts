/**
 * @module core/render/entity-renderer
 * Отрисовка каждого типа DXF-сущности на Canvas2D.
 */
import type { FlattenedEntity } from '../normalize/index.js';
type Ctx = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
export interface EntityRenderOptions {
    readonly arcSegments: number;
    readonly splineSegments: number;
    readonly ellipseSegments: number;
    readonly pixelSize: number;
    readonly viewExtent: number;
}
/**
 * Рисует одну FlattenedEntity на Canvas2D.
 */
export declare function renderEntity(ctx: Ctx, fe: FlattenedEntity, opts: EntityRenderOptions): void;
export {};
//# sourceMappingURL=entity-renderer.d.ts.map