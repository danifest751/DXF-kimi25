/**
 * @module core/nesting/nfp-cache
 * Cache for computed NFP polygons keyed by (itemIdA, itemIdB, angleDeg).
 */

import type { Poly2D } from './nfp.js';

export class NfpCache {
  private readonly _map = new Map<string, Poly2D[]>();

  private static key(idA: number, idB: number, angleDeg: number): string {
    return `${idA}_${idB}_${angleDeg}`;
  }

  get(idA: number, idB: number, angleDeg: number): Poly2D[] | undefined {
    return this._map.get(NfpCache.key(idA, idB, angleDeg));
  }

  set(idA: number, idB: number, angleDeg: number, nfp: Poly2D[]): void {
    this._map.set(NfpCache.key(idA, idB, angleDeg), nfp);
  }

  has(idA: number, idB: number, angleDeg: number): boolean {
    return this._map.has(NfpCache.key(idA, idB, angleDeg));
  }

  clear(): void {
    this._map.clear();
  }

  get size(): number {
    return this._map.size;
  }
}
