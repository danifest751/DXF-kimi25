import { describe, it, expect } from 'vitest';
import {
  computeNFP,
  computeIFP,
  subtractNFPsFromIFP,
  bottomLeftPoint,
  rotatePolygon,
  polyBBox,
  signedArea,
} from '../../packages/core-engine/src/nesting/nfp.js';
import { NfpCache } from '../../packages/core-engine/src/nesting/nfp-cache.js';
import type { Poly2D } from '../../packages/core-engine/src/nesting/nfp.js';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function rect(w: number, h: number): Poly2D {
  return [{ x: 0, y: 0 }, { x: w, y: 0 }, { x: w, y: h }, { x: 0, y: h }];
}

function approxEq(a: number, b: number, eps = 0.5): boolean {
  return Math.abs(a - b) <= eps;
}

// ─── rotatePolygon ────────────────────────────────────────────────────────────

describe('rotatePolygon', () => {
  it('0° rotation returns same bbox', () => {
    const r = rotatePolygon(rect(100, 50), 0);
    const bb = polyBBox(r);
    expect(approxEq(bb.width, 100)).toBe(true);
    expect(approxEq(bb.height, 50)).toBe(true);
  });

  it('90° rotation swaps width and height', () => {
    const r = rotatePolygon(rect(100, 50), 90);
    const bb = polyBBox(r);
    expect(approxEq(bb.width, 50, 1)).toBe(true);
    expect(approxEq(bb.height, 100, 1)).toBe(true);
  });

  it('180° rotation preserves bbox', () => {
    const r = rotatePolygon(rect(100, 50), 180);
    const bb = polyBBox(r);
    expect(approxEq(bb.width, 100, 1)).toBe(true);
    expect(approxEq(bb.height, 50, 1)).toBe(true);
  });

  it('result is translated to origin (min corner at 0,0)', () => {
    const r = rotatePolygon(rect(80, 40), 45);
    const bb = polyBBox(r);
    expect(approxEq(bb.minX, 0, 0.01)).toBe(true);
    expect(approxEq(bb.minY, 0, 0.01)).toBe(true);
  });
});

// ─── signedArea ───────────────────────────────────────────────────────────────

describe('signedArea', () => {
  it('CCW square has positive area', () => {
    expect(signedArea(rect(10, 10))).toBeGreaterThan(0);
  });

  it('CW square has negative area', () => {
    const cw = [{ x: 0, y: 0 }, { x: 0, y: 10 }, { x: 10, y: 10 }, { x: 10, y: 0 }];
    expect(signedArea(cw)).toBeLessThan(0);
  });

  it('area of unit square is 1', () => {
    expect(Math.abs(signedArea(rect(1, 1)))).toBeCloseTo(1, 6);
  });
});

// ─── computeIFP ───────────────────────────────────────────────────────────────

describe('computeIFP', () => {
  it('100×100 item in 1000×2000 sheet, gap=0 → IFP 900×1900', () => {
    const ifp = computeIFP(rect(100, 100), { width: 1000, height: 2000 }, 0)!;
    expect(ifp).not.toBeNull();
    const bb = polyBBox(ifp);
    expect(approxEq(bb.width, 900, 1)).toBe(true);
    expect(approxEq(bb.height, 1900, 1)).toBe(true);
  });

  it('100×100 item in 1000×2000 sheet, gap=5 → IFP 890×1890', () => {
    const ifp = computeIFP(rect(100, 100), { width: 1000, height: 2000 }, 5)!;
    expect(ifp).not.toBeNull();
    const bb = polyBBox(ifp);
    expect(approxEq(bb.width, 890, 1)).toBe(true);
    expect(approxEq(bb.height, 1890, 1)).toBe(true);
  });

  it('returns null when item is larger than sheet', () => {
    expect(computeIFP(rect(1200, 100), { width: 1000, height: 2000 }, 0)).toBeNull();
  });

  it('returns null when gap makes item too large', () => {
    expect(computeIFP(rect(990, 990), { width: 1000, height: 1000 }, 10)).toBeNull();
  });

  it('IFP bottom-left corner is at (gap, gap)', () => {
    const ifp = computeIFP(rect(100, 100), { width: 500, height: 500 }, 5)!;
    const sorted = [...ifp].sort((a, b) => a.y - b.y || a.x - b.x);
    expect(approxEq(sorted[0]!.x, 5, 0.1)).toBe(true);
    expect(approxEq(sorted[0]!.y, 5, 0.1)).toBe(true);
  });
});

// ─── computeNFP ───────────────────────────────────────────────────────────────

describe('computeNFP', () => {
  it('NFP of two unit squares is a 2×2 square (shifted)', () => {
    // A = 1×1 at origin, B = 1×1 at origin
    // NFP should be a 2×2 region centred such that B can orbit A
    const a = rect(1, 1);
    const b = rect(1, 1);
    const nfps = computeNFP(a, b);
    expect(nfps.length).toBeGreaterThan(0);
    // Combined bbox of all NFP paths should span 2×2 (approximately)
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const path of nfps) {
      for (const p of path) {
        if (p.x < minX) minX = p.x;
        if (p.y < minY) minY = p.y;
        if (p.x > maxX) maxX = p.x;
        if (p.y > maxY) maxY = p.y;
      }
    }
    expect(approxEq(maxX - minX, 2, 0.1)).toBe(true);
    expect(approxEq(maxY - minY, 2, 0.1)).toBe(true);
  });

  it('NFP of 100×50 A and 60×30 B gives NFP bbox ≈ 160×80', () => {
    const a = rect(100, 50);
    const b = rect(60, 30);
    const nfps = computeNFP(a, b);
    expect(nfps.length).toBeGreaterThan(0);
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const path of nfps) {
      for (const p of path) {
        if (p.x < minX) minX = p.x;
        if (p.y < minY) minY = p.y;
        if (p.x > maxX) maxX = p.x;
        if (p.y > maxY) maxY = p.y;
      }
    }
    expect(approxEq(maxX - minX, 160, 2)).toBe(true);
    expect(approxEq(maxY - minY, 80, 2)).toBe(true);
  });

  it('returns empty array for degenerate inputs', () => {
    expect(computeNFP([], rect(10, 10))).toHaveLength(0);
    expect(computeNFP(rect(10, 10), [])).toHaveLength(0);
  });
});

// ─── subtractNFPsFromIFP ──────────────────────────────────────────────────────

describe('subtractNFPsFromIFP', () => {
  it('no NFPs: returns IFP unchanged', () => {
    const ifp = rect(500, 500);
    const result = subtractNFPsFromIFP(ifp, []);
    expect(result.length).toBeGreaterThan(0);
    const bb = polyBBox(result[0]!);
    expect(approxEq(bb.width, 500, 1)).toBe(true);
  });

  it('subtracting a small NFP reduces available area', () => {
    const ifp = rect(1000, 1000);
    // NFP covers most of the IFP
    const nfp = rect(900, 900);
    const result = subtractNFPsFromIFP(ifp, [nfp]);
    // Some area should remain
    let totalArea = 0;
    for (const p of result) totalArea += Math.abs(signedArea(p));
    expect(totalArea).toBeGreaterThan(0);
    expect(totalArea).toBeLessThan(1000 * 1000);
  });

  it('fully covered IFP returns empty array', () => {
    const ifp = rect(100, 100);
    const nfp = rect(200, 200); // larger than IFP
    const result = subtractNFPsFromIFP(ifp, [nfp]);
    let totalArea = 0;
    for (const p of result) totalArea += Math.abs(signedArea(p));
    expect(totalArea).toBeCloseTo(0, 0);
  });
});

// ─── bottomLeftPoint ──────────────────────────────────────────────────────────

describe('bottomLeftPoint', () => {
  it('finds the lowest-leftmost point', () => {
    const poly: Poly2D = [
      { x: 10, y: 20 }, { x: 5, y: 5 }, { x: 0, y: 10 },
    ];
    const pt = bottomLeftPoint([poly])!;
    expect(approxEq(pt.x, 5, 0.01)).toBe(true);
    expect(approxEq(pt.y, 5, 0.01)).toBe(true);
  });

  it('returns null for empty input', () => {
    expect(bottomLeftPoint([])).toBeNull();
    expect(bottomLeftPoint([[]])).toBeNull();
  });

  it('among multiple polygons picks global minimum', () => {
    const poly1: Poly2D = [{ x: 10, y: 10 }, { x: 20, y: 10 }, { x: 15, y: 20 }];
    const poly2: Poly2D = [{ x: 3, y: 2 }, { x: 8, y: 2 }, { x: 5, y: 8 }];
    const pt = bottomLeftPoint([poly1, poly2])!;
    expect(approxEq(pt.y, 2, 0.01)).toBe(true);
    expect(approxEq(pt.x, 3, 0.01)).toBe(true);
  });
});

// ─── NfpCache ─────────────────────────────────────────────────────────────────

describe('NfpCache', () => {
  it('stores and retrieves NFP by (idA, idB, angle)', () => {
    const cache = new NfpCache();
    const nfp: Poly2D[] = [[{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 0, y: 1 }]];
    cache.set(1, 2, 0, nfp);
    expect(cache.get(1, 2, 0)).toBe(nfp);
  });

  it('different keys do not collide', () => {
    const cache = new NfpCache();
    cache.set(1, 2, 0, [[{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 0, y: 1 }]]);
    cache.set(1, 2, 90, [[{ x: 5, y: 5 }, { x: 6, y: 5 }, { x: 5, y: 6 }]]);
    expect(cache.get(1, 2, 0)![0]![0]!.x).toBe(0);
    expect(cache.get(1, 2, 90)![0]![0]!.x).toBe(5);
  });

  it('has() returns false for missing key', () => {
    const cache = new NfpCache();
    expect(cache.has(99, 99, 0)).toBe(false);
  });

  it('clear() empties the cache', () => {
    const cache = new NfpCache();
    cache.set(1, 2, 0, []);
    cache.clear();
    expect(cache.size).toBe(0);
  });
});
