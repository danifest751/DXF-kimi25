/**
 * @module api-service
 * HTTP API for DXF Viewer services.
 * Полный API вокруг core-engine.
 */

import express, { type Request, type Response } from 'express';
import cors from 'cors';
import { parseDXF } from '../../core-engine/src/dxf/reader/index.js';
import { normalizeDocument } from '../../core-engine/src/normalize/index.js';
import { computeCuttingStats } from '../../core-engine/src/cutting/index.js';
import { nestItems } from '../../core-engine/src/nesting/index.js';
import type { NestingItem, NestingResult, SheetSize } from '../../core-engine/src/nesting/index.js';
import { exportNestingToDXF, exportNestingToCSV, exportCuttingStatsToCSV } from '../../core-engine/src/export/index.js';
import { calculatePrice } from '../../pricing/src/index.js';
import { handleTelegramWebhookUpdate, processBotMessage, setTelegramWebhook, type TelegramUpdate } from '../../bot-service/src/index.js';
import { generateShortHash, getSharedSheet, hasSharedSheet, pruneExpiredSheets, saveSharedSheet } from './shared-sheets.js';
import { exchangeTelegramLoginCode, getAuthSessionByToken } from './telegram-auth.js';

const app = express();
const allowedOrigins = (process.env.ALLOWED_ORIGINS ?? '')
  .split(',')
  .map((s) => s.trim())
  .filter((s) => s.length > 0);

const telegramBotToken = process.env.TELEGRAM_BOT_TOKEN?.trim() ?? '';
const telegramWebhookUrl = process.env.TELEGRAM_WEBHOOK_URL?.trim() ?? '';
const telegramWebhookSecret = process.env.TELEGRAM_WEBHOOK_SECRET?.trim() ?? '';
const telegramAutoRegisterWebhookRaw = (process.env.TELEGRAM_WEBHOOK_AUTO_REGISTER ?? '').trim().toLowerCase();
const isLocalRuntime = process.env.VERCEL !== '1' && process.env.NODE_ENV !== 'production';
const telegramAutoRegisterWebhook = telegramAutoRegisterWebhookRaw.length > 0
  ? telegramAutoRegisterWebhookRaw !== 'false'
  : !isLocalRuntime;
let telegramWebhookRegistrationStarted = false;

function ensureTelegramWebhookRegistrationOnStartup(): void {
  if (telegramWebhookRegistrationStarted) return;
  if (!telegramAutoRegisterWebhook) return;
  if (telegramBotToken.length === 0 || telegramWebhookUrl.length === 0) return;

  telegramWebhookRegistrationStarted = true;
  void setTelegramWebhook(telegramBotToken, telegramWebhookUrl, telegramWebhookSecret)
    .then(() => {
      console.log(`[Telegram] webhook registered: ${telegramWebhookUrl}`);
    })
    .catch((error) => {
      const message = error instanceof Error ? error.message : String(error);
      console.error('[Telegram] webhook auto-registration failed:', message);
    });
}

ensureTelegramWebhookRegistrationOnStartup();

function isDefaultAllowedOrigin(origin: string): boolean {
  return /^https:\/\/[a-z0-9-]+\.vercel\.app$/i.test(origin)
    || /^http:\/\/localhost(?::\d+)?$/i.test(origin)
    || /^http:\/\/127\.0\.0\.1(?::\d+)?$/i.test(origin);
}

app.use(cors({
  origin: (origin, callback) => {
    if (!origin) {
      callback(null, true);
      return;
    }
    if (allowedOrigins.length === 0 || allowedOrigins.includes(origin) || isDefaultAllowedOrigin(origin)) {
      callback(null, true);
      return;
    }
    callback(null, false);
  },
}));
app.use(express.json({ limit: '50mb' }));

function toArrayBuffer(buf: Buffer): ArrayBuffer {
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
}

function getBufferFromRequest(req: Request): Buffer | null {
  const body = req.body as { base64?: string; text?: string };
  if (typeof body?.base64 === 'string' && body.base64.length > 0) {
    return Buffer.from(body.base64, 'base64');
  }
  if (typeof body?.text === 'string' && body.text.length > 0) {
    return Buffer.from(body.text, 'utf-8');
  }
  return null;
}

function getAuthTokenFromRequest(req: Request): string {
  const header = req.header('authorization') ?? req.header('Authorization') ?? '';
  if (header.toLowerCase().startsWith('bearer ')) {
    return header.slice(7).trim();
  }
  const alt = req.header('x-session-token') ?? '';
  return alt.trim();
}

// Health check
app.get(['/health', '/api/health'], (_req: Request, res: Response) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.post(['/api/auth/telegram/exchange-code', '/api/auth-telegram-exchange-code'], async (req: Request, res: Response): Promise<void> => {
  try {
    const code = typeof req.body?.code === 'string' ? req.body.code : '';
    const session = await exchangeTelegramLoginCode(code);
    if (!session) {
      res.status(401).json({ error: 'Invalid or expired code' });
      return;
    }

    res.json({
      success: true,
      sessionToken: session.sessionToken,
      workspaceId: session.workspaceId,
      expiresAt: new Date(session.expiresAt).toISOString(),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    res.status(500).json({ error: 'Auth code exchange failed', details: message });
  }
});

app.get(['/api/auth/me', '/api/auth-me'], async (req: Request, res: Response): Promise<void> => {
  try {
    const token = getAuthTokenFromRequest(req);
    if (!token) {
      res.status(401).json({ authenticated: false, error: 'Missing session token' });
      return;
    }

    const session = await getAuthSessionByToken(token);
    if (!session) {
      res.status(401).json({ authenticated: false, error: 'Session not found or expired' });
      return;
    }

    res.json({
      authenticated: true,
      userId: session.userId,
      workspaceId: session.workspaceId,
      expiresAt: new Date(session.expiresAt).toISOString(),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    res.status(500).json({ error: 'Auth me failed', details: message });
  }
});

// Parse DXF file
app.post('/api/parse', async (req: Request, res: Response): Promise<void> => {
  try {
    const buffer = getBufferFromRequest(req);
    if (!buffer) {
      res.status(400).json({ error: 'Provide DXF via body.base64/body.text' });
      return;
    }

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
app.post('/api/normalize', async (req: Request, res: Response): Promise<void> => {
  try {
    const buffer = getBufferFromRequest(req);
    if (!buffer) {
      res.status(400).json({ error: 'Provide DXF via body.base64/body.text' });
      return;
    }

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
app.post('/api/cutting-stats', async (req: Request, res: Response): Promise<void> => {
  try {
    const buffer = getBufferFromRequest(req);
    if (!buffer) {
      res.status(400).json({ error: 'Provide DXF via body.base64/body.text' });
      return;
    }

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
app.post('/api/nest', async (req: Request, res: Response): Promise<void> => {
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

    const maybeSheet = params.sheet as { width?: unknown; height?: unknown };
    if (typeof maybeSheet.width !== 'number' || typeof maybeSheet.height !== 'number') {
      res.status(400).json({ error: 'Invalid sheet: width and height must be numbers' });
      return;
    }

    const items = params.items as readonly NestingItem[];
    const sheet = params.sheet as SheetSize;
    const gap = typeof params.gap === 'number' ? params.gap : 5;
    const rotationEnabled = typeof params.rotationEnabled === 'boolean' ? params.rotationEnabled : true;
    const rawStep = params.rotationAngleStepDeg;
    const rotationAngleStepDeg: 1 | 2 | 5 = rawStep === 1 || rawStep === 5 ? rawStep : 2;
    const strategy = params.strategy === 'maxrects_bbox' ? 'maxrects_bbox' : 'blf_bbox';
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
    const result = nestItems(items, sheet, gap, {
      rotationEnabled,
      rotationAngleStepDeg,
      strategy,
      multiStart,
      seed,
      commonLine,
    });

    res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    res.status(500).json({ error: 'Nesting failed', details: message });
  }
});

// Calculate price
app.post('/api/price', async (req: Request, res: Response): Promise<void> => {
  try {
    const params = req.body;

    if (!params.cutLength || !params.pierces) {
      res.status(400).json({ error: 'Invalid params: cutLength and pierces are required' });
      return;
    }

    const result = calculatePrice({
      cutLength: params.cutLength,
      pierces: params.pierces,
      sheets: params.sheets || 1,
      material: params.material || 'steel',
      thickness: params.thickness || 1,
      complexity: params.complexity || 1.0,
    });

    res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    res.status(500).json({ error: 'Price calculation failed', details: message });
  }
});

// Export nesting to DXF
app.post('/api/export/dxf', async (req: Request, res: Response): Promise<void> => {
  try {
    const { nestingResult } = req.body as { nestingResult?: unknown };
    if (!nestingResult) {
      res.status(400).json({ error: 'nestingResult is required' });
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
app.post('/api/export/csv', async (req: Request, res: Response): Promise<void> => {
  try {
    const { nestingResult, cuttingStats, fileName = 'export' } = req.body as {
      nestingResult?: unknown;
      cuttingStats?: unknown;
      fileName?: string;
    };

    let csv: string;
    if (nestingResult) {
      csv = exportNestingToCSV({ nestingResult: nestingResult as any, fileName });
    } else if (cuttingStats) {
      csv = exportCuttingStatsToCSV({ stats: cuttingStats as any, fileName });
    } else {
      res.status(400).json({ error: 'Provide nestingResult or cuttingStats' });
      return;
    }

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}.csv"`);
    res.send(csv);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    res.status(500).json({ error: 'CSV export failed', details: message });
  }
});

// ─── Share nesting sheets (generate hashes) ─────────────────────────

app.post('/api/nesting/share', async (req: Request, res: Response): Promise<void> => {
  try {
    await pruneExpiredSheets();
    const { nestingResult } = req.body as { nestingResult?: NestingResult };
    if (!nestingResult || !nestingResult.sheets) {
      res.status(400).json({ error: 'nestingResult is required' });
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

      await saveSharedSheet({
        hash,
        sheetIndex: i,
        singleResult,
        createdAt: Date.now(),
      });
      hashes.push(hash);
    }

    res.json({ success: true, hashes });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    res.status(500).json({ error: 'Share failed', details: message });
  }
});

// Get shared sheet DXF by hash
app.get('/api/nesting/sheet/:hash', async (req: Request, res: Response): Promise<void> => {
  try {
    const { hash } = req.params;
    const entry = await getSharedSheet(hash!);
    if (!entry) {
      res.status(404).json({ error: 'Sheet not found or expired' });
      return;
    }

    const dxf = exportNestingToDXF({ nestingResult: entry.singleResult });
    res.setHeader('Content-Type', 'application/dxf');
    res.setHeader('Content-Disposition', `attachment; filename="sheet_${entry.sheetIndex + 1}_${hash}.dxf"`);
    res.send(dxf);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    res.status(500).json({ error: 'DXF export failed', details: message });
  }
});

// Get shared sheet info (JSON) by hash
app.get('/api/nesting/sheet/:hash/info', async (req: Request, res: Response): Promise<void> => {
  try {
    const { hash } = req.params;
    const entry = await getSharedSheet(hash!);
    if (!entry) {
      res.status(404).json({ error: 'Sheet not found or expired' });
      return;
    }
    const s = entry.singleResult;
    res.json({
      hash,
      sheetIndex: entry.sheetIndex,
      sheetSize: s.sheet,
      placedCount: s.totalPlaced,
      fillPercent: s.avgFillPercent,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    res.status(500).json({ error: 'Sheet info failed', details: message });
  }
});

// Bot message handler (stub)
app.post('/api/bot/message', async (req: Request, res: Response): Promise<void> => {
  try {
    const { chatId, text, attachments } = req.body;

    const result = await processBotMessage({
      chatId,
      text,
      attachments,
    });

    res.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    res.status(500).json({ error: 'Bot processing failed', details: message });
  }
});

// Telegram webhook endpoint (Vercel/serverless-friendly)
app.post(['/api/telegram/webhook', '/telegram/webhook'], async (req: Request, res: Response): Promise<void> => {
  try {
    const expectedSecret = process.env.TELEGRAM_WEBHOOK_SECRET?.trim() ?? '';
    if (expectedSecret.length > 0) {
      const receivedSecret = req.header('x-telegram-bot-api-secret-token')?.trim() ?? '';
      if (receivedSecret !== expectedSecret) {
        res.status(401).json({ error: 'Invalid webhook secret' });
        return;
      }
    }

    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    if (!botToken) {
      res.status(500).json({ error: 'TELEGRAM_BOT_TOKEN is not configured' });
      return;
    }

    await handleTelegramWebhookUpdate(req.body as TelegramUpdate, botToken);
    res.status(200).json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    res.status(500).json({ error: 'Telegram webhook failed', details: message });
  }
});

// Optional helper route to register webhook URL in Telegram
app.post(['/api/telegram/webhook/register', '/telegram/webhook/register'], async (req: Request, res: Response): Promise<void> => {
  try {
    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    if (!botToken) {
      res.status(500).json({ error: 'TELEGRAM_BOT_TOKEN is not configured' });
      return;
    }

    const explicitUrl = typeof req.body?.url === 'string' ? req.body.url.trim() : '';
    const webhookUrl = explicitUrl || process.env.TELEGRAM_WEBHOOK_URL?.trim() || '';
    if (!webhookUrl) {
      res.status(400).json({ error: 'Provide webhook URL via body.url or TELEGRAM_WEBHOOK_URL' });
      return;
    }

    const secret = process.env.TELEGRAM_WEBHOOK_SECRET?.trim() ?? '';
    await setTelegramWebhook(botToken, webhookUrl, secret);
    res.json({ success: true, webhookUrl, secretEnabled: secret.length > 0 });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    res.status(500).json({ error: 'Telegram webhook registration failed', details: message });
  }
});

export default app;
