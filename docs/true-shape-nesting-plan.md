# True Shape Nesting — Plan

## Status
- [ ] Phase 1: Contour Extractor
- [ ] Phase 2: NFP Engine (clipper2-js)
- [ ] Phase 3: True Shape Placer
- [ ] Phase 4: UI + Bot

---

## Existing infrastructure (do not break)

| File | What's there |
|---|---|
| `core-engine/src/nesting/index.ts` | `NestingItem.contour?`, `PlacedItem.angleDeg`, strategies `blf_bbox`/`maxrects_bbox` |
| `core-engine/src/geometry/curves.ts` | `tessellateArc`, bulge tessellation, spline tessellation |
| `core-engine/src/geometry/bbox.ts` | polygon area, point-in-polygon, bbox |
| `core-engine/src/normalize/index.ts` | `FlattenedEntity[]` output |

---

## Phase 1 — Contour Extractor

**New file:** `packages/core-engine/src/contour/index.ts`

Goal: `FlattenedEntity[]` → `NestingPoint[]` (outer contour polygon per item)

### Tasks

#### 1.1 Chain LINE segments into closed loops
- Input: `FlattenedEntity[]` where `type === 'LINE'`
- Algorithm: graph walk — connect segments by endpoint proximity (eps = 0.01 mm)
- Output: `Point2D[][]` (each array is a closed loop)

#### 1.2 LWPOLYLINE with bulge → polygon
- Use existing `tessellateArcFromBulge()` from `curves.ts`
- Close the loop if `closed` flag is set

#### 1.3 ARC → points
- Use existing `tessellateArc()` from `curves.ts`
- Segment count: `max(12, arc_length_mm / 2)` (≈2 mm chord error)

#### 1.4 CIRCLE → points
- 36–72 points depending on radius
- Formula: `segments = max(36, Math.round(2 * Math.PI * r / 2))`

#### 1.5 SPLINE → points
- Use existing spline tessellation from `curves.ts`
- Apply Ramer–Douglas–Peucker simplification (eps = 0.1 mm) to reduce point count

#### 1.6 classifyRings — outer vs hole
- Compute signed area (shoelace formula)
- CCW = outer ring, CW = hole
- Nest holes inside their parent ring (point-in-polygon check)

#### 1.7 buildContourForItem(entities) → NestingPoint[]
- Merge all loops from 1.1–1.5
- Classify via 1.6
- Return largest outer ring as the contour
- Translate to origin (minX=0, minY=0)

### Unit tests
`tests/contour/extractor.test.ts`
- Rectangle from 4 LINEs
- Circle
- LWPOLYLINE with bulge (quarter-arc corner)
- Polygon with hole (donut shape)

---

## Phase 2 — NFP Engine

**Dependency:** `clipper2-js` → add to `packages/core-engine/package.json`

**New files:**
- `packages/core-engine/src/nesting/nfp.ts`
- `packages/core-engine/src/nesting/nfp-cache.ts`

### Algorithm: Minkowski Difference via Clipper2

For polygons A (stationary) and B (orbiting):
```
NFP(A, B) = A ⊕ (-B)   [Minkowski sum of A with reflected B]
```
Clipper2 `MinkowskiSum(A, reflectB)` gives this directly.

### Tasks

#### 2.1 Polygon ↔ Clipper2 converters
```ts
polygonToClipperPath(pts: NestingPoint[]): Path64
clipperPathToPolygon(path: Path64): NestingPoint[]
```
Scale factor: ×1000 (mm → µm integers for Clipper2)

#### 2.2 computeNFP(A, B, angleB) → NestingPoint[][]
- Rotate B by `angleB` first
- Reflect B: `reflectB = B.map(p => ({x: -p.x, y: -p.y}))`
- `clipper2.MinkowskiSum(pathA, reflectB)` → NFP paths
- Returns array of polygons (may be multiple for concave shapes)

#### 2.3 computeIFP(item, sheet) → NestingPoint[]
- IFP = rectangle shrunk by item's bbox
- `{ x: 0..sheet.width - item.bbox.width, y: 0..sheet.height - item.bbox.height }`
- For true shape: inflate sheet inward by half-gap, then Minkowski difference with item contour

#### 2.4 rotatePolygon(poly, angleDeg) → NestingPoint[]
- Rotate around centroid
- Recenter to (0, 0)

#### 2.5 NfpCache
```ts
type CacheKey = `${itemIdA}_${itemIdB}_${angleDeg}`
class NfpCache {
  get(a, b, angle): NestingPoint[][] | undefined
  set(a, b, angle, nfp): void
}
```

#### 2.6 Unit tests
`tests/nesting/nfp.test.ts`
- NFP of two unit squares at 0° → should be 2×2 square shifted by (-1,-1)
- NFP with rotation 90°
- IFP of 100×100 item in 1000×2000 sheet

---

## Phase 3 — True Shape Placer

**New file:** `packages/core-engine/src/nesting/true-shape-placer.ts`

**Changes to existing:** `nesting/index.ts` — add `'true_shape'` to `NestingStrategy`

### Placement Algorithm

```
sort items by contour area DESC (largest first)
for each item:
  best = null
  for each rotation angle in [0, 90, 180, 270] (configurable):
    rotated_contour = rotatePolygon(item.contour, angle)
    ifp = computeIFP(rotated_contour, sheet)
    for each already_placed item P:
      nfp = NfpCache.get(P, item, angle) ?? computeNFP(P.contour, rotated_contour)
      ifp = clipper2.Difference(ifp, nfp)
    if ifp is empty → skip this rotation
    position = bottomLeftPoint(ifp)
    if best is null or position.y < best.position.y:
      best = { angle, position }
  if best is null → open new sheet, retry
  place item at best.position with best.angle
```

### Tasks

#### 3.1 bottomLeftPoint(polygon) → Point2D
- Lowest Y, then leftmost X among all vertices of NFP remainder

#### 3.2 placeTrueShape(items, sheet, gap, options) → NestingResult
- Full placement loop
- Multi-sheet support

#### 3.3 Integration in nestItems()
```ts
if (options.strategy === 'true_shape') {
  return placeTrueShape(items, sheet, gap, options);
}
```

#### 3.4 Metrics reuse
- Reuse existing `cutLengthEstimate`, `pierceEstimate` calculations

#### 3.5 Benchmark target
- 20 parts × 4 angles < 2 seconds
- Profile NFP cache hit rate

#### 3.6 Unit + integration tests
- 5 L-shapes on 1000×2000 sheet — check fill% > bbox result
- Regression: bbox strategies still work identically

---

## Phase 4 — UI + Bot

### 4.1 NestingOptions type
```ts
export type NestingStrategy = 'blf_bbox' | 'maxrects_bbox' | 'true_shape';
```

### 4.2 nesting-panel.ts
- Add button/toggle «Контурная» alongside Fast/Precise/Common-line
- Show warning if parts > 50: «может занять несколько секунд»
- i18n keys: `nestingModeContour`, `nestingModeContourWarning`

### 4.3 bot-service i18n
- Add to `ru.ts`: `modeContour: 'Контурная'`, `btnModeContour`
- Add to `en.ts`: `modeContour: 'True shape'`

### 4.4 E2E test
`tests/api/nesting.test.ts` — POST `/api/nest` with `strategy: 'true_shape'`

---

## Risk Register

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| clipper2 MinkowskiSum inaccurate for concave shapes | Medium | High | Test with L/T/U shapes early; fallback to bbox if contour has < 4 points |
| Performance: NFP × angles × items = O(n²·r) | High | Medium | NfpCache + limit default angles to 4; warn UI if n > 50 |
| LINE chain snapping failures | Low | Medium | eps = 0.01 mm; log unclosed chains as warnings |
| Spline point explosion | Low | Low | RDP simplification before passing to NFP |
| Holes in parts (e.g. bolt holes) | Low | Low | Phase 1 classifies holes; NFP only uses outer ring for placement |
