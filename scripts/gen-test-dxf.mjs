/**
 * Generates 3 test DXF files for true-shape nesting:
 *   1. star.dxf       — 5-point star (LWPOLYLINE)
 *   2. l-bracket.dxf  — L-shaped bracket (LWPOLYLINE)
 *   3. arrow.dxf      — Arrow / chevron shape (LWPOLYLINE)
 */

import { writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(__dirname, '..', 'test-dxf');
mkdirSync(OUT_DIR, { recursive: true });

// ─── DXF builder helpers ────────────────────────────────────────────────────

function dxf(entities) {
  return [
    '0\nSECTION',
    '2\nHEADER',
    '9\n$ACADVER\n1\nAC1009',
    '0\nENDSEC',
    '0\nSECTION',
    '2\nENTITIES',
    ...entities,
    '0\nENDSEC',
    '0\nEOF',
  ].join('\n');
}

function lwpolyline(pts, closed = true) {
  const lines = [
    '0\nLWPOLYLINE',
    '8\n0',           // layer 0
    `70\n${closed ? 1 : 0}`,  // closed flag
    `90\n${pts.length}`,      // vertex count
  ];
  for (const [x, y] of pts) {
    lines.push(`10\n${x.toFixed(4)}`);
    lines.push(`20\n${y.toFixed(4)}`);
  }
  return lines.join('\n');
}

// ─── 1. 5-point star (outer R=60, inner R=25, centre 0,0) ───────────────────

function starPoints(cx, cy, outerR, innerR, points = 5) {
  const pts = [];
  for (let i = 0; i < points * 2; i++) {
    const r = i % 2 === 0 ? outerR : innerR;
    const angle = (Math.PI / points) * i - Math.PI / 2;
    pts.push([cx + r * Math.cos(angle), cy + r * Math.sin(angle)]);
  }
  return pts;
}

writeFileSync(
  join(OUT_DIR, 'star.dxf'),
  dxf([lwpolyline(starPoints(65, 65, 60, 25, 5))]),
);
console.log('✓ star.dxf');

// ─── 2. L-shaped bracket 120×120 with 70×70 cutout ──────────────────────────

const lBracket = [
  [0,   0  ],
  [120, 0  ],
  [120, 50 ],
  [50,  50 ],
  [50,  120],
  [0,   120],
];

writeFileSync(
  join(OUT_DIR, 'l-bracket.dxf'),
  dxf([lwpolyline(lBracket)]),
);
console.log('✓ l-bracket.dxf');

// ─── 3. Arrow pointing right (asymmetric — tests rotation) ──────────────────

const arrow = [
  [0,   20 ],
  [70,  20 ],
  [70,  0  ],
  [120, 40 ],
  [70,  80 ],
  [70,  60 ],
  [0,   60 ],
];

writeFileSync(
  join(OUT_DIR, 'arrow.dxf'),
  dxf([lwpolyline(arrow)]),
);
console.log('✓ arrow.dxf');

console.log(`\nFiles written to: ${OUT_DIR}`);
