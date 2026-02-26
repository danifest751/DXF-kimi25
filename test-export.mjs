/**
 * Local test: parse DXF → nest → export DXF → check output has real entities
 * Run: node test-export.mjs
 */
import { readFileSync, writeFileSync } from 'fs';
import { parseDXF } from './packages/core-engine/src/dxf/reader/index.js';
import { normalizeDocument } from './packages/core-engine/src/normalize/index.js';
import { nestItems } from './packages/core-engine/src/nesting/index.js';
import { exportNestingToDXF } from './packages/core-engine/src/export/index.js';

const dxfRaw = readFileSync('./test-dxf/l-bracket.dxf', 'utf-8');
const parsed = parseDXF(dxfRaw);
const doc = normalizeDocument(parsed);

console.log('flatEntities count:', doc.flatEntities.length);
console.log('totalBBox:', doc.totalBBox);
for (const fe of doc.flatEntities) {
  console.log(' entity type:', fe.entity.type);
}

const bbox = doc.totalBBox;
if (!bbox) { console.error('No bbox!'); process.exit(1); }

const w = bbox.max.x - bbox.min.x;
const h = bbox.max.y - bbox.min.y;

// Nest 3 copies onto a 500x500 sheet
const items = [{ id: 1, name: 'bracket', width: w, height: h, quantity: 3 }];
const sheet = { width: 500, height: 500 };
const result = nestItems(items, sheet, 5, {});

console.log('\nNesting result:');
console.log('  sheets:', result.sheets.length);
for (const s of result.sheets) {
  console.log('  placed:', s.placed.length, 'items');
  for (const p of s.placed) {
    console.log('    itemId:', p.itemId, 'x:', p.x, 'y:', p.y);
  }
}

// Build itemDocs map
const itemDocs = new Map();
itemDocs.set(1, { flatEntities: doc.flatEntities, bbox });
console.log('\nitemDocs keys:', [...itemDocs.keys()]);

// Export
const dxfOut = exportNestingToDXF({ nestingResult: result, itemDocs });

writeFileSync('./test-output.dxf', dxfOut, 'utf-8');
console.log('\nWrote test-output.dxf');

// Check what entity types are in the output
const lineMatches = (dxfOut.match(/\nLWPOLYLINE\n/g) || []).length;
const lineLines = (dxfOut.match(/\nLINE\n/g) || []).length;
const circles = (dxfOut.match(/\nCIRCLE\n/g) || []).length;
const bboxRects = (dxfOut.match(/SHEET/g) || []).length;
console.log('Output LWPOLYLINE count:', lineMatches);
console.log('Output LINE count:', lineLines);
console.log('Output CIRCLE count:', circles);
console.log('Output SHEET layer refs (bbox fallback):', bboxRects);

if (lineMatches === 0 && lineLines === 0 && circles === 0) {
  console.error('\n❌ FAIL: no real entities in output — only bboxes!');
} else {
  console.log('\n✅ OK: real entities found in output');
}
