/**
 * @module core/nesting/nfp
 * No-Fit Polygon (NFP) and Inner-Fit Polygon (IFP) computation via clipper2-js.
 *
 * NFP(A, B) = set of positions for B's reference point such that B touches but
 * does not overlap A.  Computed as Minkowski sum of A with the reflection of B.
 *
 * IFP(item, sheet) = set of positions for item's reference point (bottom-left)
 * such that item fits entirely inside the sheet (with gap applied).
 *
 * All coordinates are in mm.  Internally we scale ×SCALE to integer µm for
 * Clipper2's integer arithmetic, then scale back.
 */

import {
  Minkowski,
  Clipper64,
  Path64,
  Paths64,
  Point64,
  FillRule,
  ClipType,
} from 'clipper2-js';
import type { NestingPoint, SheetSize } from './index.js';

// ─── Scale factor mm → Clipper2 integer units ──────────────────────────────

const SCALE = 1000; // 1 mm = 1000 units → resolution 0.001 mm

// ─── Type helpers ──────────────────────────────────────────────────────────

export type Poly2D = NestingPoint[]; // alias for clarity

// ─── Converters ────────────────────────────────────────────────────────────

function toPath64(pts: Poly2D): Path64 {
  const path = new Path64();
  for (const p of pts) {
    path.push(new Point64(Math.round(p.x * SCALE), Math.round(p.y * SCALE)));
  }
  return path;
}

function fromPath64(path: Path64): Poly2D {
  const pts: Poly2D = [];
  for (let i = 0; i < path.length; i++) {
    const pt = path[i]!;
    pts.push({ x: pt.x / SCALE, y: pt.y / SCALE });
  }
  return pts;
}

function fromPaths64(paths: Paths64): Poly2D[] {
  const result: Poly2D[] = [];
  for (let i = 0; i < paths.length; i++) {
    const p = fromPath64(paths[i]!);
    if (p.length >= 3) result.push(p);
  }
  return result;
}

// ─── Geometry helpers ──────────────────────────────────────────────────────

/** Centroid of a polygon. */
function centroid(pts: Poly2D): { x: number; y: number } {
  let sx = 0, sy = 0;
  for (const p of pts) { sx += p.x; sy += p.y; }
  return { x: sx / pts.length, y: sy / pts.length };
}

/** Rotate polygon around its centroid by angleDeg. Recentres to (0,0). */
export function rotatePolygon(pts: Poly2D, angleDeg: number): Poly2D {
  if (angleDeg === 0) return pts;
  const rad = (angleDeg * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const c = centroid(pts);

  const rotated = pts.map(p => ({
    x: c.x + (p.x - c.x) * cos - (p.y - c.y) * sin,
    y: c.y + (p.x - c.x) * sin + (p.y - c.y) * cos,
  }));

  // Translate so that min corner is at (0, 0)
  let minX = Infinity, minY = Infinity;
  for (const p of rotated) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
  }
  return rotated.map(p => ({ x: p.x - minX, y: p.y - minY }));
}

/** Bounding box of a polygon. */
export function polyBBox(pts: Poly2D): { width: number; height: number; minX: number; minY: number } {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of pts) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }
  return { width: maxX - minX, height: maxY - minY, minX, minY };
}

/** Signed area (shoelace). Positive = CCW. */
export function signedArea(pts: Poly2D): number {
  let area = 0;
  const n = pts.length;
  for (let i = 0; i < n; i++) {
    const a = pts[i]!;
    const b = pts[(i + 1) % n]!;
    area += a.x * b.y - b.x * a.y;
  }
  return area / 2;
}

/** Ensure polygon is CCW (positive area). Reverses if CW. */
function ensureCCW(pts: Poly2D): Poly2D {
  return signedArea(pts) >= 0 ? pts : [...pts].reverse();
}

// ─── NFP ───────────────────────────────────────────────────────────────────

/**
 * Compute NFP(A, B):
 *   NFP = Minkowski sum of A with the reflection of B.
 *   The result is translated so that B's reference point (0,0) maps to each
 *   valid placement origin for B relative to A.
 *
 * @param stationary  Polygon A (already placed on sheet), CCW, origin-relative.
 * @param orbiting    Polygon B (to be placed), CCW, origin-relative.
 * @returns  Array of NFP polygons (usually one; multiple for concave shapes).
 */
export function computeNFP(stationary: Poly2D, orbiting: Poly2D): Poly2D[] {
  if (stationary.length < 3 || orbiting.length < 3) return [];

  // Reflect B: negate all coordinates
  const reflected = orbiting.map(p => ({ x: -p.x, y: -p.y }));

  const pathA = toPath64(ensureCCW(stationary));
  const pathB = toPath64(ensureCCW(reflected));

  const raw: Paths64 = Minkowski.sum(pathA, pathB, true);

  return fromPaths64(raw);
}

// ─── IFP ───────────────────────────────────────────────────────────────────

/**
 * Compute IFP(item, sheet, gap):
 *   The set of positions (x, y) for item's bottom-left corner such that the
 *   item lies entirely within the sheet, with at least `gap` clearance from
 *   sheet edges.
 *
 *   For a rectangular sheet this is simply:
 *     x ∈ [gap, sheet.width  - itemBBox.width  - gap]
 *     y ∈ [gap, sheet.height - itemBBox.height - gap]
 *
 *   We return this as a rectangle polygon (4 points).
 *   Returns null when the item is larger than the sheet.
 */
export function computeIFP(
  item: Poly2D,
  sheet: SheetSize,
  gap: number,
): Poly2D | null {
  const bb = polyBBox(item);
  const x0 = gap;
  const y0 = gap;
  const x1 = sheet.width - bb.width - gap;
  const y1 = sheet.height - bb.height - gap;

  if (x1 < x0 || y1 < y0) return null; // item doesn't fit

  return [
    { x: x0, y: y0 },
    { x: x1, y: y0 },
    { x: x1, y: y1 },
    { x: x0, y: y1 },
  ];
}

// ─── IFP − NFP (placement remainder) ──────────────────────────────────────

/**
 * Subtract a list of NFP polygons from the IFP to get the valid placement area.
 *
 * @param ifp       Inner-fit polygon (placement boundary).
 * @param nfps      List of NFP polygons to subtract (one per already-placed item).
 * @returns         Remaining valid placement polygons, or [] if no valid position.
 */
export function subtractNFPsFromIFP(ifp: Poly2D, nfps: Poly2D[]): Poly2D[] {
  if (nfps.length === 0) return [ifp];

  const subjPaths = new Paths64();
  subjPaths.push(toPath64(ensureCCW(ifp)));

  const clipPaths = new Paths64();
  for (const nfp of nfps) {
    if (nfp.length >= 3) clipPaths.push(toPath64(ensureCCW(nfp)));
  }

  const c = new Clipper64();
  c.addSubjectPaths(subjPaths);
  c.addClipPaths(clipPaths);

  const solution = new Paths64();
  c.execute(ClipType.Difference, FillRule.NonZero, solution);

  return fromPaths64(solution);
}

// ─── Bottom-left point selection ───────────────────────────────────────────

/**
 * Find the bottom-left point from a set of placement polygons.
 * "Bottom-left" = lowest Y first, then leftmost X.
 *
 * Returns null when polygons array is empty.
 */
export function bottomLeftPoint(polygons: Poly2D[]): { x: number; y: number } | null {
  let best: { x: number; y: number } | null = null;

  for (const poly of polygons) {
    for (const p of poly) {
      if (
        best === null ||
        p.y < best.y - 1e-6 ||
        (Math.abs(p.y - best.y) < 1e-6 && p.x < best.x - 1e-6)
      ) {
        best = { x: p.x, y: p.y };
      }
    }
  }

  return best;
}
