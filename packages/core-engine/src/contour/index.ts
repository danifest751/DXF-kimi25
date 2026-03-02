/**
 * @module core/contour
 * Extracts closed 2-D polygons from FlattenedEntity arrays.
 *
 * Pipeline:
 *   FlattenedEntity[]
 *     → raw loops (per entity type)
 *     → chain LINE segments into closed loops
 *     → classify outer ring vs holes (winding)
 *     → simplify with Ramer-Douglas-Peucker
 *     → translate to origin
 *     → NestingPoint[] (largest outer ring)
 */

import type { Point3D } from '../types/index.js';
import { DXFEntityType } from '../types/index.js';
import type {
  DXFLineEntity,
  DXFCircleEntity,
  DXFArcEntity,
  DXFEllipseEntity,
  DXFSplineEntity,
  DXFPolylineEntity,
  DXFLWPolylineEntity,
  DXFSolidEntity,
} from '../types/index.js';
import type { FlattenedEntity } from '../normalize/index.js';
import type { NestingPoint } from '../nesting/index.js';
import {
  tessellateArc,
  tessellateCircle,
  tessellateEllipse,
  tessellateSpline,
  tessellateLWPolyline,
} from '../geometry/curves.js';
import { mat4TransformPoint } from '../geometry/math.js';

// ─── Constants ─────────────────────────────────────────────────────────────

/** Snap tolerance in mm: endpoints closer than this are considered identical */
const SNAP_EPS = 0.01;

/** Curve discretisation: chord error target ≈ 0.5 mm → adequate segments */
const ARC_SEGMENTS = 72;
const SPLINE_SEGMENTS = 64;

/** RDP simplification tolerance in mm */
const RDP_EPS = 0.1;

// ─── Internal types ─────────────────────────────────────────────────────────

type Pt = { x: number; y: number };

// ─── Geometry helpers ───────────────────────────────────────────────────────

function dist2(a: Pt, b: Pt): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return dx * dx + dy * dy;
}

/** Apply a Matrix4x4 transform to a 2-D point (ignores Z). */
function transformPt(fe: FlattenedEntity, p: Point3D): Pt {
  const t = mat4TransformPoint(fe.transform, p);
  return { x: t.x, y: t.y };
}

/** Signed area via shoelace formula. Positive = CCW (standard math), negative = CW. */
function signedArea(ring: Pt[]): number {
  let area = 0;
  const n = ring.length;
  for (let i = 0; i < n; i++) {
    const a = ring[i]!;
    const b = ring[(i + 1) % n]!;
    area += a.x * b.y - b.x * a.y;
  }
  return area / 2;
}

/** Point-in-polygon (ray casting). */
function pointInPolygon(pt: Pt, ring: Pt[]): boolean {
  let inside = false;
  const n = ring.length;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const xi = ring[i]!.x, yi = ring[i]!.y;
    const xj = ring[j]!.x, yj = ring[j]!.y;
    if (((yi > pt.y) !== (yj > pt.y)) && pt.x < ((xj - xi) * (pt.y - yi)) / (yj - yi) + xi) {
      inside = !inside;
    }
  }
  return inside;
}

// ─── Ramer-Douglas-Peucker ──────────────────────────────────────────────────

function rdpReduce(pts: Pt[], eps: number): Pt[] {
  if (pts.length <= 2) return pts;
  const epsSquared = eps * eps;

  function perpendicularDist2(p: Pt, a: Pt, b: Pt): number {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const lenSq = dx * dx + dy * dy;
    if (lenSq < 1e-18) return dist2(p, a);
    const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / lenSq));
    const px = a.x + t * dx - p.x;
    const py = a.y + t * dy - p.y;
    return px * px + py * py;
  }

  function rdp(start: number, end: number, result: boolean[]): void {
    let maxD2 = 0;
    let maxIdx = start;
    for (let i = start + 1; i < end; i++) {
      const d2 = perpendicularDist2(pts[i]!, pts[start]!, pts[end]!);
      if (d2 > maxD2) { maxD2 = d2; maxIdx = i; }
    }
    if (maxD2 > epsSquared) {
      rdp(start, maxIdx, result);
      result[maxIdx] = true;
      rdp(maxIdx, end, result);
    }
  }

  const keep = new Array<boolean>(pts.length).fill(false);
  keep[0] = true;
  keep[pts.length - 1] = true;
  rdp(0, pts.length - 1, keep);
  return pts.filter((_, i) => keep[i]);
}

// ─── Loop extraction per entity type ───────────────────────────────────────

/**
 * Extract zero or more open/closed point-arrays from a single FlattenedEntity.
 * Each returned array is a polyline; closed flag is returned separately.
 */
function entityToLoops(fe: FlattenedEntity): Array<{ pts: Pt[]; closed: boolean }> {
  const e = fe.entity;

  switch (e.type) {

    case DXFEntityType.LINE: {
      const le = e as DXFLineEntity;
      return [{ pts: [transformPt(fe, le.start), transformPt(fe, le.end)], closed: false }];
    }

    case DXFEntityType.LWPOLYLINE: {
      const lw = e as DXFLWPolylineEntity;
      const pts2d = tessellateLWPolyline(lw.vertices, lw.bulges, lw.closed, ARC_SEGMENTS);
      const pts = pts2d.map(p => {
        const p3: Point3D = { x: p.x, y: p.y, z: 0 };
        return transformPt(fe, p3);
      });
      if (pts.length < 2) return [];
      return [{ pts, closed: lw.closed }];
    }

    case DXFEntityType.POLYLINE: {
      const pl = e as DXFPolylineEntity;
      if (pl.is3D || pl.isMesh || pl.isPolyface) return [];
      const pts = pl.vertices.map(v => transformPt(fe, v));
      if (pts.length < 2) return [];
      return [{ pts, closed: pl.closed }];
    }

    case DXFEntityType.CIRCLE: {
      const ci = e as DXFCircleEntity;
      const segs = Math.max(ARC_SEGMENTS, Math.round((2 * Math.PI * ci.radius) / 0.5));
      const raw = tessellateCircle(ci.center, ci.radius, segs);
      const pts = raw.map(p => transformPt(fe, p));
      return [{ pts, closed: true }];
    }

    case DXFEntityType.ARC: {
      const ar = e as DXFArcEntity;
      const raw = tessellateArc(ar.center, ar.radius, ar.startAngle, ar.endAngle, ARC_SEGMENTS);
      const pts = raw.map(p => transformPt(fe, p));
      if (pts.length < 2) return [];
      // ARC is open — will be chained with other segments
      return [{ pts, closed: false }];
    }

    case DXFEntityType.ELLIPSE: {
      const el = e as DXFEllipseEntity;
      const raw = tessellateEllipse(
        el.center, el.majorAxis, el.minorAxisRatio,
        el.startAngle, el.endAngle, ARC_SEGMENTS,
      );
      const pts = raw.map(p => transformPt(fe, p));
      if (pts.length < 2) return [];
      const isFullEllipse = Math.abs(el.endAngle - el.startAngle) < 0.01
        || Math.abs(Math.abs(el.endAngle - el.startAngle) - Math.PI * 2) < 0.01;
      return [{ pts, closed: isFullEllipse }];
    }

    case DXFEntityType.SPLINE: {
      const sp = e as DXFSplineEntity;
      const raw = tessellateSpline(sp.degree, sp.controlPoints, sp.knots, sp.weights, SPLINE_SEGMENTS);
      const pts = raw.map(p => transformPt(fe, p));
      if (pts.length < 2) return [];
      return [{ pts, closed: sp.closed || sp.periodic }];
    }

    case DXFEntityType.SOLID: {
      const so = e as DXFSolidEntity;
      const pts = so.points.map(p => transformPt(fe, p));
      return [{ pts, closed: true }];
    }

    default:
      return [];
  }
}

// ─── LINE chaining ──────────────────────────────────────────────────────────

interface Segment { a: Pt; b: Pt }

/** Chain a set of open 2-segment polylines into closed loops using endpoint snapping. */
function chainSegmentsToLoops(segments: Segment[]): Pt[][] {
  if (segments.length === 0) return [];

  // adjacency list: each segment can be traversed forward or backward
  // We use a union-find-like greedy chain builder.

  // Convert to edge list with start/end
  type Edge = { a: Pt; b: Pt; used: boolean };
  const edges: Edge[] = segments.map(s => ({ a: s.a, b: s.b, used: false }));

  function snapEq(p: Pt, q: Pt): boolean {
    return dist2(p, q) <= SNAP_EPS * SNAP_EPS;
  }

  const loops: Pt[][] = [];

  for (let startIdx = 0; startIdx < edges.length; startIdx++) {
    if (edges[startIdx]!.used) continue;

    const chain: Pt[] = [edges[startIdx]!.a, edges[startIdx]!.b];
    edges[startIdx]!.used = true;

    // Extend chain forward
    let extended = true;
    while (extended) {
      extended = false;
      const tail = chain[chain.length - 1]!;
      for (let i = 0; i < edges.length; i++) {
        if (edges[i]!.used) continue;
        if (snapEq(edges[i]!.a, tail)) {
          chain.push(edges[i]!.b);
          edges[i]!.used = true;
          extended = true;
          break;
        }
        if (snapEq(edges[i]!.b, tail)) {
          chain.push(edges[i]!.a);
          edges[i]!.used = true;
          extended = true;
          break;
        }
      }
    }

    // Check if closed
    if (chain.length >= 4 && snapEq(chain[0]!, chain[chain.length - 1]!)) {
      chain.pop(); // remove duplicate closing point
      loops.push(chain);
    }
    // Open chains with ≥ 2 pts are discarded (can't form a contour alone)
  }

  return loops;
}

// ─── Ring classification ────────────────────────────────────────────────────

interface Ring {
  pts: Pt[];
  area: number; // signed; CCW > 0
  isOuter: boolean;
}

function classifyRings(rawLoops: Pt[][]): Ring[] {
  const rings: Ring[] = rawLoops
    .filter(l => l.length >= 3)
    .map(pts => {
      const area = signedArea(pts);
      return { pts, area, isOuter: area > 0 };
    });

  // Ensure outer rings are CCW (positive area), holes are CW.
  // In DXF the winding is not always consistent — use absolute area
  // and containment to determine outer vs hole.
  // Single ring: always treat as outer regardless of winding.
  if (rings.length <= 1) {
    if (rings.length === 1) rings[0]!.isOuter = true;
    return rings;
  }

  // Sort descending by absolute area
  rings.sort((a, b) => Math.abs(b.area) - Math.abs(a.area));

  // Re-classify: a ring is outer if it is not contained inside a larger ring.
  // Simple rule: the largest ring is always outer.
  for (let i = 1; i < rings.length; i++) {
    const testPt = rings[i]!.pts[0]!;
    let insideCount = 0;
    for (let j = 0; j < i; j++) {
      if (pointInPolygon(testPt, rings[j]!.pts)) insideCount++;
    }
    // If inside an odd number of larger rings → it's a hole
    rings[i]!.isOuter = (insideCount % 2 === 0);
  }

  return rings;
}

// ─── Translate to origin ────────────────────────────────────────────────────

function translateToOrigin(pts: Pt[]): Pt[] {
  if (pts.length === 0) return pts;
  let minX = Infinity, minY = Infinity;
  for (const p of pts) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
  }
  return pts.map(p => ({ x: p.x - minX, y: p.y - minY }));
}

// ─── Public API ─────────────────────────────────────────────────────────────

export interface ContourResult {
  /** Outer contour polygon, translated to (0,0), simplified. */
  readonly outerRing: NestingPoint[];
  /** Hole polygons (optional, for future use). */
  readonly holes: NestingPoint[][];
  /** Bounding box of the outer ring. */
  readonly bbox: { width: number; height: number };
}

/**
 * Build the contour polygon for a group of FlattenedEntity objects that
 * together describe one part (e.g. all entities on the same layer / block).
 *
 * Returns null when no valid closed contour can be extracted.
 */
export function buildContour(entities: readonly FlattenedEntity[]): ContourResult | null {
  // 1. Extract raw loops and open segments per entity
  const closedLoops: Pt[][] = [];
  const openSegments: Segment[] = [];

  for (const fe of entities) {
    const loops = entityToLoops(fe);
    for (const { pts, closed } of loops) {
      if (pts.length < 2) continue;
      if (closed) {
        if (pts.length >= 3) closedLoops.push(pts);
      } else if (pts.length === 2) {
        // Simple segment — add to chaining pool
        openSegments.push({ a: pts[0]!, b: pts[1]! });
      } else {
        // Multi-point open polyline — add all internal segments
        for (let i = 0; i < pts.length - 1; i++) {
          openSegments.push({ a: pts[i]!, b: pts[i + 1]! });
        }
      }
    }
  }

  // 2. Chain open segments into closed loops
  const chainedLoops = chainSegmentsToLoops(openSegments);

  // 3. Merge all loops
  const allLoops = [...closedLoops, ...chainedLoops];
  if (allLoops.length === 0) return null;

  // 4. Classify rings
  const rings = classifyRings(allLoops);
  if (rings.length === 0) return null;

  // 5. Pick the largest outer ring as the primary contour
  const outerRings = rings.filter(r => r.isOuter);
  if (outerRings.length === 0) return null;

  // Sort by absolute area descending → largest first
  outerRings.sort((a, b) => Math.abs(b.area) - Math.abs(a.area));
  const primaryRing = outerRings[0]!;

  // 6. Collect holes that belong to the primary ring
  const holes: Pt[][] = rings
    .filter(r => !r.isOuter && pointInPolygon(r.pts[0]!, primaryRing.pts))
    .map(r => r.pts);

  // 7. Simplify with RDP
  const simplified = rdpReduce(primaryRing.pts, RDP_EPS);
  if (simplified.length < 3) return null;

  const simplifiedHoles = holes
    .map(h => rdpReduce(h, RDP_EPS))
    .filter(h => h.length >= 3);

  // 8. Translate to origin
  const translated = translateToOrigin(simplified);
  const translatedHoles = simplifiedHoles.map(h => translateToOrigin(h));

  // 9. Compute bbox
  let maxX = 0, maxY = 0;
  for (const p of translated) {
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }

  return {
    outerRing: translated,
    holes: translatedHoles,
    bbox: { width: maxX, height: maxY },
  };
}

/**
 * Returns the absolute area of a polygon ring in mm².
 * Uses the shoelace formula. Works for both CW and CCW winding.
 */
export function polygonAreaMm2(ring: readonly { x: number; y: number }[]): number {
  return Math.abs(signedArea(ring as Pt[]));
}

/**
 * Returns the net area of a contour (outer ring minus holes) in mm².
 */
export function contourAreaMm2(contour: ContourResult): number {
  const outer = polygonAreaMm2(contour.outerRing);
  const holesArea = contour.holes.reduce((sum, h) => sum + polygonAreaMm2(h), 0);
  return Math.max(0, outer - holesArea);
}

/**
 * Build a contour for ALL entities in a flat list (treated as one part).
 * Convenience wrapper for the single-part case (e.g. whole DXF file = one part).
 */
export function buildContourFromAll(entities: readonly FlattenedEntity[]): ContourResult | null {
  return buildContour(entities);
}

/**
 * Group FlattenedEntity[] by layer name and extract one contour per layer.
 * Layers with no valid contour are omitted.
 */
export function buildContoursByLayer(
  entities: readonly FlattenedEntity[],
): Map<string, ContourResult> {
  const byLayer = new Map<string, FlattenedEntity[]>();
  for (const fe of entities) {
    const layer = fe.effectiveLayer;
    if (!byLayer.has(layer)) byLayer.set(layer, []);
    byLayer.get(layer)!.push(fe);
  }

  const result = new Map<string, ContourResult>();
  for (const [layer, fes] of byLayer) {
    const contour = buildContour(fes);
    if (contour !== null) result.set(layer, contour);
  }
  return result;
}
