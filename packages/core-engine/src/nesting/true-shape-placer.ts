/**
 * @module core/nesting/true-shape-placer
 * True-shape nesting placement using NFP/IFP (clipper2-js).
 *
 * Algorithm:
 *   1. Sort copies by contour area (largest first).
 *   2. For each copy, try each rotation angle.
 *   3. Compute IFP(rotated item, sheet) — allowed placement boundary.
 *   4. Subtract NFP(placed_i, item) for every already-placed item on current sheet.
 *   5. Pick the bottom-left point of the remaining placement area.
 *   6. If no position found on any existing sheet → open a new sheet.
 */

import type {
  NestingItem,
  NestingResult,
  NestingSheet,
  PlacedItem,
  SheetSize,
  NestingOptions,
  NestingPoint,
} from './index.js';
import {
  computeNFP,
  computeIFP,
  subtractNFPsFromIFP,
  bottomLeftPoint,
  rotatePolygon,
  polyBBox,
  signedArea,
  type Poly2D,
} from './nfp.js';
import { NfpCache } from './nfp-cache.js';

// ─── Helpers ────────────────────────────────────────────────────────────────

function rectPoly(w: number, h: number): Poly2D {
  return [{ x: 0, y: 0 }, { x: w, y: 0 }, { x: w, y: h }, { x: 0, y: h }];
}

function nestingPointsToPoly(pts: readonly NestingPoint[]): Poly2D {
  return pts.map(p => ({ x: p.x, y: p.y }));
}

function polyArea(pts: Poly2D): number {
  return Math.abs(signedArea(pts));
}

/** Contour polygon for an item (uses contour if valid, falls back to bbox rect). */
function itemContour(item: NestingItem): Poly2D {
  if (item.contour && item.contour.length >= 3) {
    return nestingPointsToPoly(item.contour);
  }
  return rectPoly(item.width, item.height);
}

// ─── Per-sheet state ─────────────────────────────────────────────────────────

interface PlacedEntry {
  readonly contour: Poly2D;       // absolute-position contour (translated to x,y)
  readonly originContour: Poly2D; // rotated contour at origin (used as NFP key)
  readonly item: PlacedItem;
  readonly itemId: number;
  readonly angleDeg: number;
}

function translatePoly(poly: Poly2D, dx: number, dy: number): Poly2D {
  return poly.map(p => ({ x: p.x + dx, y: p.y + dy }));
}

// ─── Main placer ─────────────────────────────────────────────────────────────

interface CopyEntry {
  readonly itemId: number;
  readonly name: string;
  readonly contour: Poly2D;
  readonly area: number;
  readonly copyIndex: number;
  /** Original item reference (for fallback bbox). */
  readonly item: NestingItem;
}

interface SheetState {
  readonly placed: PlacedEntry[];
  usedArea: number;
}

export function placeTrueShape(
  items: readonly NestingItem[],
  sheet: SheetSize,
  gap: number,
  options: NestingOptions,
): NestingResult {
  const rotationEnabled = options.rotationEnabled ?? true;
  // For true-shape, default to 4 angles (0,90,180,270); finer step from options
  const stepDeg = options.rotationAngleStepDeg ?? 90;
  const anglesDeg: number[] = [];
  if (rotationEnabled) {
    for (let a = 0; a < 360; a += stepDeg) anglesDeg.push(a);
  } else {
    anglesDeg.push(0);
  }

  const cache = new NfpCache();

  // ── 1. Expand copies ──────────────────────────────────────────────────────
  const copies: CopyEntry[] = [];
  for (const item of items) {
    const contour = itemContour(item);
    const area = polyArea(contour);
    for (let c = 0; c < item.quantity; c++) {
      copies.push({ itemId: item.id, name: item.name, contour, area, copyIndex: c, item });
    }
  }

  // Sort by area descending (largest first → better packing)
  copies.sort((a, b) => b.area - a.area || (b.item.width + b.item.height) - (a.item.width + a.item.height));

  const totalRequired = copies.length;

  // ── 2. Place loop ─────────────────────────────────────────────────────────
  const sheetStates: SheetState[] = [];
  let totalPlaced = 0;

  for (const copy of copies) {
    let placed = false;

    // Try existing sheets first
    for (const state of sheetStates) {
      if (tryPlaceOnSheet(copy, state, sheet, gap, anglesDeg, cache)) {
        totalPlaced++;
        placed = true;
        break;
      }
    }

    // Open new sheet
    if (!placed) {
      const newState: SheetState = { placed: [], usedArea: 0 };
      sheetStates.push(newState);
      if (tryPlaceOnSheet(copy, newState, sheet, gap, anglesDeg, cache)) {
        totalPlaced++;
      }
      // If even a fresh sheet can't fit the item → skip (item too large)
    }
  }

  // ── 3. Build NestingResult ────────────────────────────────────────────────
  const sheetArea = sheet.width * sheet.height;
  let totalFill = 0;
  const nestingSheets: NestingSheet[] = [];
  let cutLengthEstimate = 0;

  for (let i = 0; i < sheetStates.length; i++) {
    const st = sheetStates[i]!;
    const fill = sheetArea > 0 ? (st.usedArea / sheetArea) * 100 : 0;
    totalFill += fill;

    const placedItems = st.placed.map(e => e.item);
    cutLengthEstimate += placedItems.reduce((acc, it) => acc + 2 * (it.width + it.height), 0);

    nestingSheets.push({
      sheetIndex: i,
      placed: placedItems,
      usedArea: st.usedArea,
      fillPercent: Math.round(fill * 10) / 10,
    });
  }

  return {
    sheet,
    gap,
    sheets: nestingSheets,
    totalSheets: nestingSheets.length,
    totalPlaced,
    totalRequired,
    avgFillPercent: nestingSheets.length > 0
      ? Math.round((totalFill / nestingSheets.length) * 10) / 10
      : 0,
    cutLengthEstimate: Math.round(cutLengthEstimate * 100) / 100,
    sharedCutLength: 0,
    cutLengthAfterMerge: Math.round(cutLengthEstimate * 100) / 100,
    pierceEstimate: totalPlaced,
    pierceDelta: 0,
    strategy: 'true_shape',
  };
}

// ─── Per-sheet placement attempt ─────────────────────────────────────────────

function tryPlaceOnSheet(
  copy: CopyEntry,
  state: SheetState,
  sheet: SheetSize,
  gap: number,
  anglesDeg: readonly number[],
  cache: NfpCache,
): boolean {
  let bestPos: { x: number; y: number } | null = null;
  let bestAngle = 0;
  let bestRotated: Poly2D | null = null;

  for (const angle of anglesDeg) {
    // 1. Rotate the item contour
    const rotated = angle === 0 ? copy.contour : rotatePolygon(copy.contour, angle);

    // 2. IFP: allowed origin positions for this rotated item inside the sheet
    const ifp = computeIFP(rotated, sheet, gap);
    if (ifp === null) continue; // item doesn't fit even on empty sheet

    // 3. Collect NFPs of all already-placed items against this rotated item
    const nfps: Poly2D[] = [];
    for (const pe of state.placed) {
      // Cache key includes both the placed item's angle and the orbiting item's angle
      const cacheKeyAngle = pe.angleDeg * 1000 + angle;
      let nfp: Poly2D[] | undefined = cache.get(pe.itemId, copy.itemId, cacheKeyAngle);
      if (nfp === undefined) {
        nfp = computeNFP(pe.originContour, rotated);
        cache.set(pe.itemId, copy.itemId, cacheKeyAngle, nfp);
      }
      // NFP is relative to stationary A's origin → translate to A's absolute position on sheet
      for (const nfpPoly of nfp) {
        nfps.push(translatePoly(nfpPoly, pe.item.x, pe.item.y));
      }
    }

    // 4. Subtract NFPs from IFP to get valid placement area
    const remainder = subtractNFPsFromIFP(ifp, nfps);
    if (remainder.length === 0) continue;

    // 5. Pick bottom-left point
    const pt = bottomLeftPoint(remainder);
    if (pt === null) continue;

    if (
      bestPos === null ||
      pt.y < bestPos.y - 1e-6 ||
      (Math.abs(pt.y - bestPos.y) < 1e-6 && pt.x < bestPos.x - 1e-6)
    ) {
      bestPos = pt;
      bestAngle = angle;
      bestRotated = rotated;
    }
  }

  if (bestPos === null || bestRotated === null) return false;

  // 6. Commit placement
  const bb = polyBBox(bestRotated);
  const norm = ((bestAngle % 180) + 180) % 180;
  const isRotated = Math.abs(norm - 90) < 1;

  const absoluteContour = translatePoly(bestRotated, bestPos.x, bestPos.y);

  const placedItem: PlacedItem = {
    itemId: copy.itemId,
    name: copy.name,
    x: bestPos.x,
    y: bestPos.y,
    width: bb.width,
    height: bb.height,
    rotated: isRotated,
    angleDeg: bestAngle,
    copyIndex: copy.copyIndex,
    contourPts: absoluteContour,
  };

  state.placed.push({
    contour: absoluteContour,
    originContour: bestRotated,
    item: placedItem,
    itemId: copy.itemId,
    angleDeg: bestAngle,
  });

  state.usedArea += polyArea(bestRotated);
  return true;
}
