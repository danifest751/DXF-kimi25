import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
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

    expect(doc.flatEntities.length).toBeGreaterThan(0);
    expect(doc.totalBBox).not.toBeNull();

    const bbox = doc.totalBBox!;
    const w = bbox.max.x - bbox.min.x;
    const h = bbox.max.y - bbox.min.y;

    const items = [{ id: 42, name: 'bracket', width: w, height: h, quantity: 2 }];
    const result = nestItems(items, { width: 600, height: 600 }, 5, {});
    const itemDocs = new Map([[42, { flatEntities: doc.flatEntities, bbox }]]);
    const dxfOut = exportNestingToDXF({ nestingResult: result, itemDocs });

    const lwCount = (dxfOut.match(/\r?\nLWPOLYLINE\r?\n/g) ?? []).length;
    const lineCount = (dxfOut.match(/\r?\nLINE\r?\n/g) ?? []).length;
    expect(lwCount > 0 || lineCount > 0).toBe(true);
  });
});
