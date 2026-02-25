/**
 * @module core/render/batch-renderer
 * Батчинг рендера: группировка сущностей по strokeStyle+lineWidth
 * для минимизации state changes в Canvas2D API.
 *
 * Вместо N×beginPath→stroke делаем M×(beginPath+N_paths→stroke),
 * где M = кол-во уникальных стилей (обычно 5-20 в реальных DXF).
 */

import type { Color, Matrix4x4 } from '../types/index.js';
import { DXFEntityType } from '../types/index.js';
import type {
  DXFLineEntity,
  DXFXLineEntity,
  DXFRayEntity,
  DXFCircleEntity,
  DXFArcEntity,
  DXFEllipseEntity,
  DXFSplineEntity,
  DXFPolylineEntity,
  DXFLWPolylineEntity,
  DXFLeaderEntity,
  DXFMLeaderEntity,
} from '../types/index.js';
import {
  tessellateCircle,
  tessellateArc,
  tessellateEllipse,
  tessellateSpline,
  mat4TransformPoint,
  IDENTITY_MATRIX,
} from '../geometry/index.js';
import type { FlattenedEntity } from '../normalize/index.js';
import type { TessellationCache } from './tessellation-cache.js';

type Ctx = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

/** Описание одного batch-стиля */
interface BatchStyle {
  strokeStyle: string;
  lineWidth: number;
}

/** Ключ батча: строка "rrr,ggg,bbb|lw" */
function batchKey(color: Color, lineWidth: number): string {
  return `${color.r},${color.g},${color.b}|${lineWidth.toFixed(4)}`;
}

function colorToCSS(c: Color): string {
  if (c.a !== undefined && c.a < 1) return `rgba(${c.r},${c.g},${c.b},${c.a})`;
  return `rgb(${c.r},${c.g},${c.b})`;
}

function tx(m: Matrix4x4, x: number, y: number, z: number = 0): { x: number; y: number } {
  if (m === IDENTITY_MATRIX) return { x, y };
  const p = mat4TransformPoint(m, { x, y, z });
  return { x: p.x, y: p.y };
}

// ─── Добавление path в текущий контекст (без beginPath/stroke) ───────

function addLinePath(ctx: Ctx, e: DXFLineEntity, m: Matrix4x4): void {
  const s = tx(m, e.start.x, e.start.y, e.start.z);
  const en = tx(m, e.end.x, e.end.y, e.end.z);
  ctx.moveTo(s.x, s.y);
  ctx.lineTo(en.x, en.y);
}

function addXLinePath(ctx: Ctx, e: DXFXLineEntity, m: Matrix4x4, extent: number): void {
  const p1 = tx(m, e.basePoint.x - e.direction.dx * extent, e.basePoint.y - e.direction.dy * extent);
  const p2 = tx(m, e.basePoint.x + e.direction.dx * extent, e.basePoint.y + e.direction.dy * extent);
  ctx.moveTo(p1.x, p1.y);
  ctx.lineTo(p2.x, p2.y);
}

function addRayPath(ctx: Ctx, e: DXFRayEntity, m: Matrix4x4, extent: number): void {
  const p1 = tx(m, e.basePoint.x, e.basePoint.y, e.basePoint.z);
  const p2 = tx(m, e.basePoint.x + e.direction.dx * extent, e.basePoint.y + e.direction.dy * extent);
  ctx.moveTo(p1.x, p1.y);
  ctx.lineTo(p2.x, p2.y);
}

function addFloat32Path(ctx: Ctx, buf: Float32Array, m: Matrix4x4, closed: boolean): void {
  const count = buf.length / 2;
  if (count < 2) return;
  const p0 = tx(m, buf[0]!, buf[1]!);
  ctx.moveTo(p0.x, p0.y);
  let prevX = p0.x;
  let prevY = p0.y;
  for (let i = 1; i < count; i++) {
    const p = tx(m, buf[i * 2]!, buf[i * 2 + 1]!);
    const dx = p.x - prevX;
    const dy = p.y - prevY;
    if (dx * dx + dy * dy < 0.25) continue;
    ctx.lineTo(p.x, p.y);
    prevX = p.x;
    prevY = p.y;
  }
  if (closed) ctx.closePath();
}

function addPolylinePath(ctx: Ctx, pts: readonly { x: number; y: number; z: number }[], m: Matrix4x4, closed: boolean): void {
  if (pts.length < 2) return;
  const p0 = tx(m, pts[0]!.x, pts[0]!.y, pts[0]!.z);
  ctx.moveTo(p0.x, p0.y);
  for (let i = 1; i < pts.length; i++) {
    const p = tx(m, pts[i]!.x, pts[i]!.y, pts[i]!.z);
    ctx.lineTo(p.x, p.y);
  }
  if (closed) ctx.closePath();
}

function addCirclePath(ctx: Ctx, e: DXFCircleEntity, m: Matrix4x4, segments: number, cached?: Float32Array): void {
  if (cached !== undefined) { addFloat32Path(ctx, cached, m, true); return; }
  const pts = tessellateCircle(e.center, e.radius, segments);
  addPolylinePath(ctx, pts, m, true);
}

function addArcPath(ctx: Ctx, e: DXFArcEntity, m: Matrix4x4, segments: number, cached?: Float32Array): void {
  if (cached !== undefined) { addFloat32Path(ctx, cached, m, false); return; }
  const pts = tessellateArc(e.center, e.radius, e.startAngle, e.endAngle, segments);
  addPolylinePath(ctx, pts, m, false);
}

function addEllipsePath(ctx: Ctx, e: DXFEllipseEntity, m: Matrix4x4, segments: number, cached?: Float32Array, cachedClosed?: boolean): void {
  if (cached !== undefined) { addFloat32Path(ctx, cached, m, cachedClosed ?? false); return; }
  const pts = tessellateEllipse(e.center, e.majorAxis, e.minorAxisRatio, e.startAngle, e.endAngle, segments);
  const isFull = Math.abs(e.endAngle - e.startAngle) >= Math.PI * 2 - 0.001;
  addPolylinePath(ctx, pts, m, isFull);
}

function addSplinePath(ctx: Ctx, e: DXFSplineEntity, m: Matrix4x4, segments: number, cached?: Float32Array): void {
  if (cached !== undefined) { addFloat32Path(ctx, cached, m, e.closed); return; }
  const pts = tessellateSpline(e.degree, e.controlPoints, e.knots, e.weights, segments);
  addPolylinePath(ctx, pts, m, e.closed);
}

function addLWPolylinePath(ctx: Ctx, e: DXFLWPolylineEntity, m: Matrix4x4, cached?: Float32Array): void {
  if (cached !== undefined) { addFloat32Path(ctx, cached, m, e.closed); return; }
  const verts = e.vertices;
  if (verts.length < 2) return;
  const p0 = tx(m, verts[0]!.x, verts[0]!.y);
  ctx.moveTo(p0.x, p0.y);
  for (let i = 1; i < verts.length; i++) {
    const p = tx(m, verts[i]!.x, verts[i]!.y);
    ctx.lineTo(p.x, p.y);
  }
  if (e.closed) ctx.closePath();
}

function addPolylineEntityPath(ctx: Ctx, e: DXFPolylineEntity, m: Matrix4x4): void {
  addPolylinePath(ctx, e.vertices, m, e.closed);
}

function addLeaderPath(ctx: Ctx, e: DXFLeaderEntity, m: Matrix4x4): void {
  addPolylinePath(ctx, e.vertices, m, false);
}

function addMLeaderPath(ctx: Ctx, e: DXFMLeaderEntity, m: Matrix4x4): void {
  addPolylinePath(ctx, e.vertices, m, false);
}

// ─── Публичные интерфейсы ────────────────────────────────────────────

export interface BatchRenderOptions {
  readonly arcSegments: number;
  readonly splineSegments: number;
  readonly ellipseSegments: number;
  readonly pixelSize: number;
  readonly viewExtent: number;
  readonly tessCache: TessellationCache;
}

/**
 * Добавляет stroke-path сущности в текущий открытый path ctx.
 * Вызывается внутри beginPath/stroke пары для батчинга.
 * @returns true если путь был добавлен, false если сущность не поддерживает батчинг (text, hatch, fill)
 */
export function addEntityPath(
  ctx: Ctx,
  fe: FlattenedEntity,
  entityIndex: number,
  opts: BatchRenderOptions,
): boolean {
  const e = fe.entity;
  const m = fe.transform;
  const cached = opts.tessCache.get(entityIndex);
  const cachedClosed = opts.tessCache.isClosed(entityIndex);

  switch (e.type) {
    case DXFEntityType.LINE:
      addLinePath(ctx, e, m);
      return true;
    case DXFEntityType.XLINE:
      addXLinePath(ctx, e, m, opts.viewExtent);
      return true;
    case DXFEntityType.RAY:
      addRayPath(ctx, e, m, opts.viewExtent);
      return true;
    case DXFEntityType.CIRCLE:
      addCirclePath(ctx, e, m, opts.arcSegments, cached);
      return true;
    case DXFEntityType.ARC:
      addArcPath(ctx, e, m, opts.arcSegments, cached);
      return true;
    case DXFEntityType.ELLIPSE:
      addEllipsePath(ctx, e, m, opts.ellipseSegments, cached, cachedClosed);
      return true;
    case DXFEntityType.SPLINE:
      addSplinePath(ctx, e, m, opts.splineSegments, cached);
      return true;
    case DXFEntityType.POLYLINE:
      addPolylineEntityPath(ctx, e, m);
      return true;
    case DXFEntityType.LWPOLYLINE:
      addLWPolylinePath(ctx, e, m, cached);
      return true;
    case DXFEntityType.LEADER:
      addLeaderPath(ctx, e, m);
      return true;
    case DXFEntityType.MLEADER:
      addMLeaderPath(ctx, e, m);
      return true;
    default:
      return false;
  }
}

/**
 * Вычисляет стиль батча для сущности.
 */
export function entityBatchStyle(fe: FlattenedEntity, pixelSize: number): BatchStyle {
  const c = fe.effectiveColor;
  const lw = fe.effectiveLineWeight;
  return {
    strokeStyle: colorToCSS(c),
    lineWidth: lw > 0 ? Math.max(pixelSize, lw / 100) : pixelSize,
  };
}

/**
 * Вычисляет ключ батча.
 */
export function entityBatchKey(fe: FlattenedEntity, pixelSize: number): string {
  const lw = fe.effectiveLineWeight;
  const lineWidth = lw > 0 ? Math.max(pixelSize, lw / 100) : pixelSize;
  return batchKey(fe.effectiveColor, lineWidth);
}
