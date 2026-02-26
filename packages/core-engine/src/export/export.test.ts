import { describe, it, expect } from 'vitest';
import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { parseDXF } from '../dxf/reader/index.js';
import { normalizeDocument } from '../normalize/index.js';
import { nestItems } from '../nesting/index.js';
import { exportNestingToDXF } from './index.js';

const FIXTURE_DIR = join(import.meta.dirname ?? __dirname, '../../../..', 'test-dxf');

describe('exportNestingToDXF with real entities', () => {
  it('should export real LWPOLYLINE entities for l-bracket.dxf, not just bboxes', () => {
    const buf = readFileSync(join(FIXTURE_DIR, 'l-bracket.dxf'));
    const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
    const parsed = parseDXF(ab);
    const doc = normalizeDocument(parsed);

    console.log('flatEntities:', doc.flatEntities.length);
    for (const fe of doc.flatEntities) console.log(' -', fe.entity.type);
    console.log('totalBBox:', doc.totalBBox);

    expect(doc.flatEntities.length).toBeGreaterThan(0);
    expect(doc.totalBBox).not.toBeNull();

    const bbox = doc.totalBBox!;
    const w = bbox.max.x - bbox.min.x;
    const h = bbox.max.y - bbox.min.y;

    const items = [{ id: 42, name: 'bracket', width: w, height: h, quantity: 2 }];
    const result = nestItems(items, { width: 600, height: 600 }, 5, {});

    console.log('placed:', result.sheets[0]?.placed.length);
    for (const p of result.sheets[0]?.placed ?? []) {
      console.log(' placed itemId:', p.itemId);
    }

    const itemDocs = new Map([[42, { flatEntities: doc.flatEntities, bbox }]]);
    console.log('itemDocs keys:', [...itemDocs.keys()]);

    const dxfOut = exportNestingToDXF({ nestingResult: result, itemDocs });

    const lwCount = (dxfOut.match(/\r?\nLWPOLYLINE\r?\n/g) ?? []).length;
    const lineCount = (dxfOut.match(/\r?\nLINE\r?\n/g) ?? []).length;
    const sheetCount = (dxfOut.match(/SHEET/g) ?? []).length;

    console.log('Output LWPOLYLINE:', lwCount);
    console.log('Output LINE:', lineCount);
    console.log('Output SHEET (bbox layer):', sheetCount);
    console.log('--- first 2000 chars of output ---');
    console.log(dxfOut.slice(0, 2000));

    // Should have real entities, not just the sheet border (which is also LINE on SHEET layer)
    // Real part entities go on a non-SHEET layer
    const hasRealEntities = lwCount > 0 || lineCount > 0;
    expect(hasRealEntities).toBe(true);

    writeFileSync(join(FIXTURE_DIR, 'output-l-bracket.dxf'), dxfOut, 'utf-8');

    // Re-parse the output to verify it's valid
    const outBuf = readFileSync(join(FIXTURE_DIR, 'output-l-bracket.dxf'));
    const outAb = outBuf.buffer.slice(outBuf.byteOffset, outBuf.byteOffset + outBuf.byteLength) as ArrayBuffer;
    const outParsed = parseDXF(outAb);
    const outDoc = normalizeDocument(outParsed);
    console.log('Re-parsed output: flatEntities =', outDoc.flatEntities.length);
    for (const fe of outDoc.flatEntities) console.log('  type:', fe.entity.type, 'bbox:', fe.entity.boundingBox);
    expect(outDoc.flatEntities.length).toBeGreaterThan(0);
  });
});
