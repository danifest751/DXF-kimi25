/**
 * @module routes-dxf
 * DXF parse / normalize / cutting-stats / nesting / price / export / share routes.
 * Extracted from api-service/index.ts to keep the main file manageable.
 */

import type { Router, Request, Response } from 'express';
import { parseDXF } from '../../core-engine/src/dxf/reader/index.js';
import { normalizeDocument } from '../../core-engine/src/normalize/index.js';
import { computeCuttingStats } from '../../core-engine/src/cutting/index.js';
import { nestItems } from '../../core-engine/src/nesting/index.js';
import type { NestingItem, NestingResult, SheetSize } from '../../core-engine/src/nesting/index.js';
import { exportNestingToDXF, exportNestingToCSV, exportCuttingStatsToCSV } from '../../core-engine/src/export/index.js';
import { calculatePrice } from '../../pricing/src/index.js';
import { generateShortHash, getSharedSheet, hasSharedSheet, pruneExpiredSheets, saveSharedSheet } from './shared-sheets.js';

// ─── Validation helpers (shared with index.ts via re-export) ──────────

export const MAX_DXF_BASE64_LEN = 270_000_000;

export function validateDxfPayload(req: Request, res: Response): boolean {
  const body = req.body as { base64?: string; text?: string };
  const b64len = typeof body?.base64 === 'string' ? body.base64.length : 0;
  const textlen = typeof body?.text === 'string' ? body.text.length : 0;
  if (b64len === 0 && textlen === 0) {
    res.status(400).json({ error: 'Provide DXF via body.base64 or body.text' });
    return false;
  }
  if (b64len > MAX_DXF_BASE64_LEN) {
    res.status(413).json({ error: 'DXF file too large (max 200 MB)' });
    return false;
  }
  return true;
}

export function toArrayBuffer(buf: Buffer): ArrayBuffer {
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
}

export function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function hasNestingResultShape(value: unknown): value is NestingResult {
  return isPlainObject(value)
    && Array.isArray((value as Record<string, unknown>).sheets)
    && isPlainObject((value as Record<string, unknown>).sheet);
}

export function getBufferFromRequest(req: Request): Buffer | null {
  const body = req.body as { base64?: string; text?: string };
  if (typeof body?.base64 === 'string' && body.base64.length > 0) {
    return Buffer.from(body.base64, 'base64');
  }
  if (typeof body?.text === 'string' && body.text.length > 0) {
    return Buffer.from(body.text, 'utf-8');
  }
  return null;
}

// ─── Route registration ───────────────────────────────────────────────

export function registerDxfRoutes(
  router: Router,
  heavyRateLimit: (req: Request, res: Response, next: () => void) => Promise<void>,
  nestingRateLimit: (req: Request, res: Response, next: () => void) => Promise<void>,
): void {

  // Parse DXF file
  router.post('/api/parse', heavyRateLimit, async (req: Request, res: Response): Promise<void> => {
    try {
      if (!validateDxfPayload(req, res)) return;
      const buffer = getBufferFromRequest(req);
      if (!buffer) return;

      const doc = parseDXF(toArrayBuffer(buffer));
      const normalized = normalizeDocument(doc);

      res.json({
        success: true,
        data: {
          metadata: doc.metadata,
          entities: doc.entities.length,
          layers: doc.layers.size,
          blocks: doc.blocks.size,
          normalizedEntityCount: normalized.entityCount,
          bbox: normalized.totalBBox,
        },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      res.status(500).json({ error: 'Parse failed', details: message });
    }
  });

  // Normalize DXF (summary)
  router.post('/api/normalize', heavyRateLimit, async (req: Request, res: Response): Promise<void> => {
    try {
      if (!validateDxfPayload(req, res)) return;
      const buffer = getBufferFromRequest(req);
      if (!buffer) return;

      const doc = parseDXF(toArrayBuffer(buffer));
      const normalized = normalizeDocument(doc);

      res.json({
        success: true,
        data: {
          entityCount: normalized.entityCount,
          layerNames: normalized.layerNames,
          totalBBox: normalized.totalBBox,
        },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      res.status(500).json({ error: 'Normalize failed', details: message });
    }
  });

  // Cutting stats from DXF
  router.post('/api/cutting-stats', heavyRateLimit, async (req: Request, res: Response): Promise<void> => {
    try {
      if (!validateDxfPayload(req, res)) return;
      const buffer = getBufferFromRequest(req);
      if (!buffer) return;

      const doc = parseDXF(toArrayBuffer(buffer));
      const normalized = normalizeDocument(doc);
      const layerFilterArray = Array.isArray(req.body?.layerFilter) ? req.body.layerFilter : null;
      const layerFilter = layerFilterArray ? new Set<string>(layerFilterArray as string[]) : undefined;
      const tolerance = typeof req.body?.tolerance === 'number' ? req.body.tolerance : undefined;
      const stats = computeCuttingStats(normalized, layerFilter, tolerance);

      res.json({
        success: true,
        data: {
          totalPierces: stats.totalPierces,
          totalCutLength: stats.totalCutLength,
          closedContours: stats.closedContours,
          openPaths: stats.openPaths,
          cuttingEntityCount: stats.cuttingEntityCount,
          byLayer: Array.from(stats.byLayer.values()),
          chains: stats.chains,
        },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      res.status(500).json({ error: 'Cutting stats failed', details: message });
    }
  });

  // Nesting
  router.post('/api/nest', nestingRateLimit, async (req: Request, res: Response): Promise<void> => {
    try {
      const params = req.body as {
        items?: unknown;
        sheet?: unknown;
        gap?: unknown;
        rotationEnabled?: unknown;
        rotationAngleStepDeg?: unknown;
        strategy?: unknown;
        multiStart?: unknown;
        seed?: unknown;
        commonLine?: unknown;
      } | undefined;

      if (!params || !Array.isArray(params.items) || typeof params.sheet !== 'object' || params.sheet === null) {
        res.status(400).json({ error: 'Invalid params: items and sheet are required' });
        return;
      }
      if (params.items.length > 500) {
        res.status(400).json({ error: 'Too many items: maximum 500' });
        return;
      }

      const maybeSheet = params.sheet as { width?: unknown; height?: unknown };
      if (typeof maybeSheet.width !== 'number' || typeof maybeSheet.height !== 'number') {
        res.status(400).json({ error: 'Invalid sheet: width and height must be numbers' });
        return;
      }

      const sheetW = maybeSheet.width as number;
      const sheetH = maybeSheet.height as number;
      if (!Number.isFinite(sheetW) || !Number.isFinite(sheetH) || sheetW <= 0 || sheetH <= 0 || sheetW > 100_000 || sheetH > 100_000) {
        res.status(400).json({ error: 'Invalid sheet: width and height must be positive finite numbers ≤ 100000' });
        return;
      }

      for (const item of params.items as unknown[]) {
        const it = item as Record<string, unknown>;
        const w = typeof it.width === 'number' ? it.width : NaN;
        const h = typeof it.height === 'number' ? it.height : NaN;
        const q = typeof it.quantity === 'number' ? it.quantity : 1;
        if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0 || w > 100_000 || h > 100_000) {
          res.status(400).json({ error: 'Invalid item: width and height must be positive finite numbers ≤ 100000' });
          return;
        }
        if (!Number.isFinite(q) || q < 1 || q > 10_000) {
          res.status(400).json({ error: 'Invalid item: quantity must be between 1 and 10000' });
          return;
        }
      }

      const items = params.items as readonly NestingItem[];
      const sheet = params.sheet as SheetSize;
      const rawGap = typeof params.gap === 'number' ? params.gap : 5;
      const gap = Number.isFinite(rawGap) ? Math.max(0, Math.min(500, rawGap)) : 5;
      const rotationEnabled = typeof params.rotationEnabled === 'boolean' ? params.rotationEnabled : true;
      const rawStep = params.rotationAngleStepDeg;
      const rotationAngleStepDeg: 1 | 2 | 5 = rawStep === 1 || rawStep === 5 ? rawStep : 2;
      const strategy = params.strategy === 'true_shape' ? 'true_shape' : params.strategy === 'maxrects_bbox' ? 'maxrects_bbox' : 'blf_bbox';
      const multiStart = typeof params.multiStart === 'boolean' ? params.multiStart : false;
      const seed = typeof params.seed === 'number' && Number.isFinite(params.seed) ? Math.trunc(params.seed) : 0;
      const commonLineInput = (typeof params.commonLine === 'object' && params.commonLine !== null)
        ? (params.commonLine as { enabled?: unknown; maxMergeDistanceMm?: unknown; minSharedLenMm?: unknown })
        : null;
      const commonLine = {
        enabled: typeof commonLineInput?.enabled === 'boolean' ? commonLineInput.enabled : false,
        maxMergeDistanceMm: typeof commonLineInput?.maxMergeDistanceMm === 'number' ? commonLineInput.maxMergeDistanceMm : 0.2,
        minSharedLenMm: typeof commonLineInput?.minSharedLenMm === 'number' ? commonLineInput.minSharedLenMm : 20,
      };

      const NESTING_TIMEOUT_MS = 30_000;
      const nestPromise = new Promise<ReturnType<typeof nestItems>>((resolve, reject) => {
        try {
          resolve(nestItems(items, sheet, gap, { rotationEnabled, rotationAngleStepDeg, strategy, multiStart, seed, commonLine }));
        } catch (e) { reject(e); }
      });
      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Nesting timeout (30s)')), NESTING_TIMEOUT_MS),
      );
      const result = await Promise.race([nestPromise, timeoutPromise]);

      res.json({ success: true, data: result });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      res.status(500).json({ error: 'Nesting failed', details: message });
    }
  });

  // Calculate price
  router.post('/api/price', heavyRateLimit, async (req: Request, res: Response): Promise<void> => {
    try {
      const params = req.body as Record<string, unknown>;
      const cutLength = typeof params.cutLength === 'number' ? params.cutLength : NaN;
      const pierces = typeof params.pierces === 'number' ? params.pierces : NaN;
      if (!Number.isFinite(cutLength) || !Number.isFinite(pierces) || cutLength < 0 || pierces < 0) {
        res.status(400).json({ error: 'Invalid params: cutLength and pierces must be finite non-negative numbers' });
        return;
      }
      const sheets = typeof params.sheets === 'number' && Number.isFinite(params.sheets) ? params.sheets : 1;
      const thickness = typeof params.thickness === 'number' && Number.isFinite(params.thickness) ? params.thickness : 1;
      const complexity = typeof params.complexity === 'number' && Number.isFinite(params.complexity) ? params.complexity : 1.0;
      const material = typeof params.material === 'string' ? params.material : 'steel';
      const result = calculatePrice({ cutLength, pierces, sheets, material, thickness, complexity });
      res.json({ success: true, data: result });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      res.status(500).json({ error: 'Price calculation failed', details: message });
    }
  });

  // Export nesting to DXF
  router.post('/api/export/dxf', heavyRateLimit, async (req: Request, res: Response): Promise<void> => {
    try {
      const { nestingResult } = req.body as { nestingResult?: unknown };
      if (!hasNestingResultShape(nestingResult)) {
        res.status(400).json({ error: 'nestingResult with sheet and sheets is required' });
        return;
      }
      const dxf = exportNestingToDXF({ nestingResult: nestingResult as any });
      res.setHeader('Content-Type', 'application/dxf');
      res.setHeader('Content-Disposition', 'attachment; filename="nesting.dxf"');
      res.send(dxf);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      res.status(500).json({ error: 'DXF export failed', details: message });
    }
  });

  // Export CSV (nesting or cutting stats)
  router.post('/api/export/csv', heavyRateLimit, async (req: Request, res: Response): Promise<void> => {
    try {
      const { nestingResult, cuttingStats, fileName = 'export' } = req.body as {
        nestingResult?: unknown;
        cuttingStats?: unknown;
        fileName?: string;
      };
      if (nestingResult !== undefined && !hasNestingResultShape(nestingResult)) {
        res.status(400).json({ error: 'nestingResult with sheet and sheets is required' });
        return;
      }
      if (cuttingStats !== undefined && !isPlainObject(cuttingStats)) {
        res.status(400).json({ error: 'cuttingStats must be an object' });
        return;
      }
      let csv: string;
      if (nestingResult) {
        csv = exportNestingToCSV({ nestingResult: nestingResult as any, fileName });
      } else if (cuttingStats) {
        csv = exportCuttingStatsToCSV({ stats: cuttingStats as any, fileName });
      } else {
        res.status(400).json({ error: 'Provide nestingResult or cuttingStats' });
        return;
      }
      const safeFileName = (typeof fileName === 'string' ? fileName : 'export')
        .replace(/["\\/\r\n]/g, '_')
        .slice(0, 100);
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${safeFileName}.csv"`);
      res.send(csv);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      res.status(500).json({ error: 'CSV export failed', details: message });
    }
  });

  // Share nesting sheets (generate hashes)
  router.post(['/api/nesting/share', '/api/nesting-share'], heavyRateLimit, async (req: Request, res: Response): Promise<void> => {
    try {
      await pruneExpiredSheets();
      const { nestingResult, itemDocs: itemDocsRaw } = req.body as { nestingResult?: NestingResult; itemDocs?: Record<number, unknown> };
      if (!hasNestingResultShape(nestingResult)) {
        res.status(400).json({ error: 'nestingResult with sheet and sheets is required' });
        return;
      }
      if (itemDocsRaw !== undefined && !isPlainObject(itemDocsRaw)) {
        res.status(400).json({ error: 'itemDocs must be an object when provided' });
        return;
      }
      const itemDocs = itemDocsRaw as Record<number, import('../../core-engine/src/export/index.js').ItemDocData> | undefined;
      const MAX_SHAREABLE_SHEETS = 50;
      if (nestingResult.sheets.length > MAX_SHAREABLE_SHEETS) {
        res.status(400).json({ error: `Too many sheets: maximum ${MAX_SHAREABLE_SHEETS}` });
        return;
      }
      const hashes: string[] = [];
      for (let i = 0; i < nestingResult.sheets.length; i++) {
        const sheet = nestingResult.sheets[i]!;
        let hash = generateShortHash();
        while (await hasSharedSheet(hash)) hash = generateShortHash();
        const singleResult: NestingResult = {
          sheet: nestingResult.sheet,
          gap: nestingResult.gap,
          sheets: [{ ...sheet, sheetIndex: 0 }],
          totalSheets: 1,
          totalPlaced: sheet.placed.length,
          totalRequired: sheet.placed.length,
          avgFillPercent: sheet.fillPercent,
          cutLengthEstimate: nestingResult.cutLengthEstimate,
          sharedCutLength: nestingResult.sharedCutLength,
          cutLengthAfterMerge: nestingResult.cutLengthAfterMerge,
          pierceEstimate: sheet.placed.length,
          pierceDelta: 0,
        };
        await saveSharedSheet({ hash, sheetIndex: i, singleResult, createdAt: Date.now(), itemDocs });
        hashes.push(hash);
      }
      res.json({ success: true, hashes });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      res.status(500).json({ error: 'Share failed', details: message });
    }
  });

  // Get shared sheet DXF by hash
  router.get('/api/nesting/sheet/:hash', heavyRateLimit, async (req: Request, res: Response): Promise<void> => {
    try {
      const { hash } = req.params;
      const entry = await getSharedSheet(hash!);
      if (!entry) { res.status(404).json({ error: 'Sheet not found or expired' }); return; }
      const itemDocsMap = entry.itemDocs
        ? new Map(Object.entries(entry.itemDocs).map(([k, v]) => [Number(k), v] as const))
        : undefined;
      const dxf = exportNestingToDXF({ nestingResult: entry.singleResult, itemDocs: itemDocsMap });
      const safeHash = entry.hash.replace(/[^0-9a-f]/gi, '').slice(0, 8) || 'unknown';
      res.setHeader('Content-Type', 'application/dxf');
      res.setHeader('Content-Disposition', `attachment; filename="sheet_${entry.sheetIndex + 1}_${safeHash}.dxf"`);
      res.send(dxf);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      res.status(500).json({ error: 'DXF export failed', details: message });
    }
  });

  // Get shared sheet info (JSON) by hash
  router.get('/api/nesting/sheet/:hash/info', heavyRateLimit, async (req: Request, res: Response): Promise<void> => {
    try {
      const { hash } = req.params;
      const entry = await getSharedSheet(hash!);
      if (!entry) { res.status(404).json({ error: 'Sheet not found or expired' }); return; }
      const s = entry.singleResult;
      res.json({ hash, sheetIndex: entry.sheetIndex, sheetSize: s.sheet, placedCount: s.totalPlaced, fillPercent: s.avgFillPercent });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      res.status(500).json({ error: 'Sheet info failed', details: message });
    }
  });
}
