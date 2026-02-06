/**
 * @module core/render
 * Рендеринг DXF: камера, R-tree, отрисовка сущностей.
 */

export { Camera } from './camera.js';
export { RTree, type RTreeItem } from './rtree.js';
export { renderEntity, type EntityRenderOptions } from './entity-renderer.js';
export { DXFRenderer, type LayerVisibilityMap, type RendererOptions } from './renderer.js';
