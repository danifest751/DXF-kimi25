/**
 * @module api-service
 * HTTP API for DXF Viewer services.
 * Полный API вокруг core-engine.
 */

import express, { type Request, type Response } from 'express';
import cors from 'cors';
import multer from 'multer';
import { parseDXF } from '../../core-engine/src/dxf/reader/index.js';
import { normalizeDocument } from '../../core-engine/src/normalize/index.js';
import { computeCuttingStats } from '../../core-engine/src/cutting/index.js';
import { nestItems } from '../../core-engine/src/nesting/index.js';
import type { NestingItem, NestingResult, SheetSize } from '../../core-engine/src/nesting/index.js';
import { exportNestingToDXF, exportNestingToCSV, exportCuttingStatsToCSV } from '../../core-engine/src/export/index.js';
import { calculatePrice } from '../../pricing/src/index.js';
import { handleTelegramWebhookUpdate, processBotMessage, setTelegramWebhook, type TelegramUpdate } from '../../bot-service/src/index.js';
import { generateShortHash, getSharedSheet, hasSharedSheet, pruneExpiredSheets, saveSharedSheet } from './shared-sheets.js';
import { exchangeTelegramLoginCode, getAuthSessionByToken, checkCodeExchangeRateLimit, revokeAuthSessionByToken } from './telegram-auth.js';
import { supabaseEnabled, supabaseRequest } from './supabase-client.js';
import {
  createSignedWorkspaceFileUpload,
  createWorkspaceCatalog,
  deleteWorkspaceCatalog,
  deleteWorkspaceFile,
  downloadWorkspaceFile,
  finalizeSignedWorkspaceFileUpload,
  getFileMaterials,
  isWorkspaceLibraryEnabled,
  listWorkspaceLibrary,
  renameWorkspaceCatalog,
  setWorkspaceFilesChecked,
  updateWorkspaceFile,
  upsertFileMaterial,
  uploadWorkspaceFile,
  uploadWorkspaceFileBuffer,
  uploadWorkspaceFileBufferWithId,
} from './workspace-library.js';

const app = express();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 200 * 1024 * 1024, files: 1 },
});
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
const AUTH_COOKIE_NAME = 'dxf_auth_session';
const authCookieSameSite = isLocalRuntime ? 'lax' : 'none';

function parseCookies(cookieHeader: string): Record<string, string> {
  const pairs = cookieHeader.split(';');
  const out: Record<string, string> = {};
  for (const pair of pairs) {
    const idx = pair.indexOf('=');
    if (idx <= 0) continue;
    const key = pair.slice(0, idx).trim();
    const value = pair.slice(idx + 1).trim();
    if (!key) continue;
    out[key] = decodeURIComponent(value);
  }
  return out;
}

function getAuthCookieToken(req: Request): string {
  const cookieHeader = req.header('cookie') ?? '';
  if (!cookieHeader) return '';
  return parseCookies(cookieHeader)[AUTH_COOKIE_NAME] ?? '';
}

function setAuthCookie(res: Response, token: string, expiresAt: number): void {
  res.cookie(AUTH_COOKIE_NAME, token, {
    httpOnly: true,
    secure: !isLocalRuntime,
    sameSite: authCookieSameSite,
    expires: new Date(expiresAt),
    path: '/',
  });
}

function clearAuthCookie(res: Response): void {
  res.clearCookie(AUTH_COOKIE_NAME, {
    httpOnly: true,
    secure: !isLocalRuntime,
    sameSite: authCookieSameSite,
    path: '/',
  });
}

function decodeHeaderFileName(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

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
  if (/^http:\/\/localhost(?::\d+)?$/i.test(origin)) return true;
  if (/^http:\/\/127\.0\.0\.1(?::\d+)?$/i.test(origin)) return true;
  // Allow *.vercel.app only in non-production when no explicit list is set
  if (!isLocalRuntime) return false;
  return /^https:\/\/[a-z0-9-]+\.vercel\.app$/i.test(origin);
}

app.use(cors({
  origin: (origin, callback) => {
    if (!origin) {
      callback(null, true);
      return;
    }
    if (allowedOrigins.includes(origin) || isDefaultAllowedOrigin(origin)) {
      callback(null, true);
      return;
    }
    callback(null, false);
  },
  credentials: true,
}));
// Default body limit 1 MB; DXF endpoints override with 50 MB; share endpoint 20 MB for itemDocs
app.use((req, _res, next) => {
  const dxfRoutes = ['/api/parse', '/api/normalize', '/api/cutting-stats', '/api/library/files', '/api/library-files'];
  const isDxf = dxfRoutes.some(r => req.path.startsWith(r));
  const isShare = req.path === '/api/nesting-share' || req.path === '/api/nesting/share';
  express.json({ limit: isDxf ? '50mb' : isShare ? '20mb' : '1mb' })(req, _res, next);
});

// ─── In-memory rate limiter ───────────────────────────────────────────

interface RateLimitState {
  windowStart: number;
  count: number;
}

interface RateLimitRow {
  readonly key: string;
  readonly window_start_ms: number;
  readonly count: number;
  readonly updated_at?: string;
}

const rateLimitStore = new Map<string, RateLimitState>();
const RATE_LIMIT_MAX_ENTRIES = 10_000; // защита от DDoS с уникальных IP
const RATE_LIMITS_TABLE = process.env.SUPABASE_RATE_LIMITS_TABLE?.trim() || 'api_rate_limits';

/**
 * Простой rate limiter (sliding window по IP).
 * @returns true если запрос разрешён, false если лимит превышен
 */
function checkLocalRateLimit(key: string, maxRequests: number, windowMs: number): boolean {
  const now = Date.now();
  const state = rateLimitStore.get(key);
  if (state === undefined || now - state.windowStart > windowMs) {
    if (state === undefined && rateLimitStore.size >= RATE_LIMIT_MAX_ENTRIES) {
      // При переполнении удаляем первую запись
      const firstKey = rateLimitStore.keys().next().value;
      if (firstKey !== undefined) rateLimitStore.delete(firstKey);
    }
    rateLimitStore.set(key, { windowStart: now, count: 1 });
    return true;
  }
  state.count++;
  return state.count <= maxRequests;
}

async function checkRateLimit(key: string, maxRequests: number, windowMs: number): Promise<boolean> {
  if (!supabaseEnabled) return checkLocalRateLimit(key, maxRequests, windowMs);

  const now = Date.now();
  try {
    const params = new URLSearchParams({
      select: 'key,window_start_ms,count,updated_at',
      key: `eq.${key}`,
      limit: '1',
    });
    const currentResp = await supabaseRequest(`/${RATE_LIMITS_TABLE}?${params.toString()}`);
    if (!currentResp?.ok) return checkLocalRateLimit(key, maxRequests, windowMs);

    const rows = await currentResp.json() as RateLimitRow[];
    const current = Array.isArray(rows) && rows.length > 0 ? rows[0]! : null;
    const expired = !current || now - Number(current.window_start_ms) > windowMs;
    const nextCount = expired ? 1 : Number(current.count) + 1;
    const windowStartMs = expired ? now : Number(current.window_start_ms);

    const upsertResp = await supabaseRequest(`/${RATE_LIMITS_TABLE}?on_conflict=key`, {
      method: 'POST',
      headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify([{
        key,
        window_start_ms: windowStartMs,
        count: nextCount,
        updated_at: new Date(now).toISOString(),
      }]),
    });
    if (!upsertResp?.ok) return checkLocalRateLimit(key, maxRequests, windowMs);
    return nextCount <= maxRequests;
  } catch {
    return checkLocalRateLimit(key, maxRequests, windowMs);
  }
}

function getClientIp(req: Request): string {
  const forwarded = req.header('x-forwarded-for');
  if (forwarded) return forwarded.split(',')[0]!.trim();
  return req.socket?.remoteAddress ?? 'unknown';
}

async function heavyRateLimit(req: Request, res: Response, next: () => void): Promise<void> {
  const ip = getClientIp(req);
  if (!await checkRateLimit(`heavy:${ip}`, 10, 60_000)) {
    res.status(429).json({ error: 'Too many requests. Limit: 10 per minute.' });
    return;
  }
  next();
}

async function nestingRateLimit(req: Request, res: Response, next: () => void): Promise<void> {
  const ip = getClientIp(req);
  if (!await checkRateLimit(`nest:${ip}`, 3, 60_000)) {
    res.status(429).json({ error: 'Too many nesting requests. Limit: 3 per minute.' });
    return;
  }
  next();
}

// ─── Validation helpers ───────────────────────────────────────────────

const MAX_DXF_BASE64_LEN = 270_000_000; // ~200MB в base64
const MAX_LIBRARY_FILE_QTY = 10_000;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function validateDxfPayload(req: Request, res: Response): boolean {
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

function toArrayBuffer(buf: Buffer): ArrayBuffer {
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
}

function isValidCatalogIdInput(value: string | null): boolean {
  return value === null || UUID_RE.test(value);
}

function parseQuantityInput(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  const normalized = Math.floor(value);
  if (normalized < 1 || normalized > MAX_LIBRARY_FILE_QTY) return null;
  return normalized;
}

function parseQuantityStringInput(value: string): number | null {
  if (!value) return 1;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return null;
  const normalized = Math.floor(parsed);
  if (normalized < 1 || normalized > MAX_LIBRARY_FILE_QTY) return null;
  return normalized;
}

function parseBooleanStringInput(value: string): boolean | null {
  if (!value) return true;
  if (value === 'true') return true;
  if (value === 'false') return false;
  return null;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasNestingResultShape(value: unknown): value is NestingResult {
  return isPlainObject(value)
    && Array.isArray(value.sheets)
    && isPlainObject(value.sheet);
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
  const cookieToken = getAuthCookieToken(req);
  if (cookieToken) return cookieToken;
  const header = req.header('authorization') ?? req.header('Authorization') ?? '';
  if (header.toLowerCase().startsWith('bearer ')) {
    return header.slice(7).trim();
  }
  const alt = req.header('x-session-token') ?? '';
  return alt.trim();
}

async function requireWorkspaceId(req: Request, res: Response): Promise<string | null> {
  const token = getAuthTokenFromRequest(req);
  if (!token) {
    res.status(401).json({ error: 'Missing session token' });
    return null;
  }

  const session = await getAuthSessionByToken(token);
  if (!session) {
    res.status(401).json({ error: 'Session not found or expired' });
    return null;
  }
  return session.workspaceId;
}

// Health check
app.get(['/health', '/api/health'], (_req: Request, res: Response) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.post(['/api/auth/telegram/exchange-code', '/api/auth-telegram-exchange-code'], async (req: Request, res: Response): Promise<void> => {
  try {
    const ip = getClientIp(req);
    if (!checkCodeExchangeRateLimit(ip)) {
      res.status(429).json({ error: 'Too many code exchange attempts. Try again in 5 minutes.' });
      return;
    }
    if (!await checkRateLimit(`auth-code:${ip}`, 10, 5 * 60_000)) {
      res.status(429).json({ error: 'Too many code exchange attempts. Try again in 5 minutes.' });
      return;
    }

    const code = typeof req.body?.code === 'string' ? req.body.code : '';
    const session = await exchangeTelegramLoginCode(code);
    if (!session) {
      res.status(401).json({ error: 'Invalid or expired code' });
      return;
    }

    setAuthCookie(res, session.sessionToken, session.expiresAt);

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

app.post(['/api/auth/adopt-token', '/api/auth-adopt-token'], async (req: Request, res: Response): Promise<void> => {
  try {
    const header = req.header('authorization') ?? req.header('Authorization') ?? '';
    const token = header.toLowerCase().startsWith('bearer ') ? header.slice(7).trim() : '';
    if (!token) {
      res.status(401).json({ success: false, error: 'Missing session token' });
      return;
    }

    const session = await getAuthSessionByToken(token);
    if (!session) {
      res.status(401).json({ success: false, error: 'Session not found or expired' });
      return;
    }

    setAuthCookie(res, token, session.expiresAt);
    res.json({
      success: true,
      workspaceId: session.workspaceId,
      expiresAt: new Date(session.expiresAt).toISOString(),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    res.status(500).json({ error: 'Auth adopt token failed', details: message });
  }
});

app.post('/api/library-catalogs-delete', async (req: Request, res: Response): Promise<void> => {
  try {
    if (!isWorkspaceLibraryEnabled()) {
      res.status(503).json({ error: 'Workspace library storage is not configured' });
      return;
    }

    const workspaceId = await requireWorkspaceId(req, res);
    if (!workspaceId) return;

    const catalogId = typeof req.body?.catalogId === 'string' ? req.body.catalogId : '';
    const modeRaw = typeof req.body?.mode === 'string' ? req.body.mode : '';
    const mode = modeRaw === 'delete_files' ? 'delete_files' : 'move_to_uncategorized';
    await deleteWorkspaceCatalog(workspaceId, catalogId, mode);
    res.json({ success: true, mode });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    res.status(500).json({ error: 'Delete catalog failed', details: message });
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

app.post(['/api/auth/logout', '/api/auth-logout'], async (req: Request, res: Response): Promise<void> => {
  try {
    const token = getAuthTokenFromRequest(req);
    if (token) {
      await revokeAuthSessionByToken(token);
    }
    clearAuthCookie(res);
    res.json({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    res.status(500).json({ error: 'Auth logout failed', details: message });
  }
});

app.get(['/api/library/tree', '/api/library-tree'], async (req: Request, res: Response): Promise<void> => {
  try {
    if (!isWorkspaceLibraryEnabled()) {
      res.status(503).json({ error: 'Workspace library storage is not configured' });
      return;
    }

    const workspaceId = await requireWorkspaceId(req, res);
    if (!workspaceId) return;

    const data = await listWorkspaceLibrary(workspaceId);
    res.json({ success: true, ...data });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    res.status(500).json({ error: 'Library tree failed', details: message });
  }
});

app.post(['/api/library/catalogs', '/api/library-catalogs'], async (req: Request, res: Response): Promise<void> => {
  try {
    if (!isWorkspaceLibraryEnabled()) {
      res.status(503).json({ error: 'Workspace library storage is not configured' });
      return;
    }

    const workspaceId = await requireWorkspaceId(req, res);
    if (!workspaceId) return;

    const name = typeof req.body?.name === 'string' ? req.body.name : '';
    const catalog = await createWorkspaceCatalog(workspaceId, name);
    res.json({ success: true, catalog });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    res.status(500).json({ error: 'Create catalog failed', details: message });
  }
});

app.patch(['/api/library/catalogs/:catalogId', '/api/library-catalogs/:catalogId', '/api/library-catalogs-update'], async (req: Request, res: Response): Promise<void> => {
  try {
    if (!isWorkspaceLibraryEnabled()) {
      res.status(503).json({ error: 'Workspace library storage is not configured' });
      return;
    }

    const workspaceId = await requireWorkspaceId(req, res);
    if (!workspaceId) return;

    const catalogId = req.params.catalogId ?? (typeof req.body?.catalogId === 'string' ? req.body.catalogId : '');
    const name = typeof req.body?.name === 'string' ? req.body.name : '';
    await renameWorkspaceCatalog(workspaceId, catalogId, name);
    res.json({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    res.status(500).json({ error: 'Rename catalog failed', details: message });
  }
});

app.delete(['/api/library/catalogs/:catalogId', '/api/library-catalogs/:catalogId'], async (req: Request, res: Response): Promise<void> => {
  try {
    if (!isWorkspaceLibraryEnabled()) {
      res.status(503).json({ error: 'Workspace library storage is not configured' });
      return;
    }

    const workspaceId = await requireWorkspaceId(req, res);
    if (!workspaceId) return;

    const catalogId = req.params.catalogId ?? '';
    const modeRaw = typeof req.query?.mode === 'string' ? req.query.mode : '';
    const mode = modeRaw === 'delete_files' ? 'delete_files' : 'move_to_uncategorized';
    await deleteWorkspaceCatalog(workspaceId, catalogId, mode);
    res.json({ success: true, mode });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    res.status(500).json({ error: 'Delete catalog failed', details: message });
  }
});

app.post(['/api/library/files', '/api/library-files'], async (req: Request, res: Response): Promise<void> => {
  try {
    if (!isWorkspaceLibraryEnabled()) {
      res.status(503).json({ error: 'Workspace library storage is not configured' });
      return;
    }

    const workspaceId = await requireWorkspaceId(req, res);
    if (!workspaceId) return;

    const name = typeof req.body?.name === 'string' ? req.body.name : '';
    const base64 = typeof req.body?.base64 === 'string' ? req.body.base64 : '';
    const catalogId = typeof req.body?.catalogId === 'string' ? req.body.catalogId : null;
    const checked = typeof req.body?.checked === 'boolean' ? req.body.checked : true;
    const quantity = parseQuantityInput(typeof req.body?.quantity === 'number' ? req.body.quantity : 1);

    if (!name.trim()) {
      res.status(400).json({ error: 'name is required' });
      return;
    }
    if (!base64) {
      res.status(400).json({ error: 'base64 is required' });
      return;
    }
    if (base64.length > MAX_DXF_BASE64_LEN) {
      res.status(413).json({ error: 'DXF file too large (max 200 MB)' });
      return;
    }
    if (!isValidCatalogIdInput(catalogId)) {
      res.status(400).json({ error: 'catalogId must be a UUID or null' });
      return;
    }
    if (quantity === null) {
      res.status(400).json({ error: `quantity must be an integer between 1 and ${MAX_LIBRARY_FILE_QTY}` });
      return;
    }

    const file = await uploadWorkspaceFile({
      workspaceId,
      name,
      base64,
      catalogId,
      checked,
      quantity,
    });
    res.json({ success: true, file });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    res.status(500).json({ error: 'Upload file failed', details: message });
  }
});

app.post(['/api/library/files/upload', '/api/library-files-upload'], upload.single('file'), async (req: Request, res: Response): Promise<void> => {
  try {
    if (!isWorkspaceLibraryEnabled()) {
      res.status(503).json({ error: 'Workspace library storage is not configured' });
      return;
    }

    const workspaceId = await requireWorkspaceId(req, res);
    if (!workspaceId) return;

    const uploaded = req.file;
    if (!uploaded || !uploaded.buffer || uploaded.buffer.byteLength === 0) {
      res.status(400).json({ error: 'Missing uploaded file' });
      return;
    }

    const catalogIdRaw = typeof req.body?.catalogId === 'string' ? req.body.catalogId.trim() : '';
    const checkedRaw = typeof req.body?.checked === 'string' ? req.body.checked.trim().toLowerCase() : '';
    const quantityRaw = typeof req.body?.quantity === 'string' ? req.body.quantity.trim() : '';
    const checked = parseBooleanStringInput(checkedRaw);
    const quantity = parseQuantityStringInput(quantityRaw);
    if (!uploaded.originalname?.trim()) {
      res.status(400).json({ error: 'Uploaded file name is required' });
      return;
    }
    if (catalogIdRaw.length > 0 && !isValidCatalogIdInput(catalogIdRaw)) {
      res.status(400).json({ error: 'catalogId must be a UUID or empty' });
      return;
    }
    if (checked === null) {
      res.status(400).json({ error: 'checked must be true or false' });
      return;
    }
    if (quantity === null) {
      res.status(400).json({ error: `quantity must be an integer between 1 and ${MAX_LIBRARY_FILE_QTY}` });
      return;
    }
    const file = await uploadWorkspaceFileBuffer({
      workspaceId,
      name: uploaded.originalname || uploaded.fieldname || 'upload.dxf',
      bodyBuffer: uploaded.buffer,
      catalogId: catalogIdRaw.length > 0 ? catalogIdRaw : null,
      checked,
      quantity,
    });
    res.json({ success: true, file });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    res.status(500).json({ error: 'Multipart upload file failed', details: message });
  }
});

app.post(['/api/library/files/direct-upload-init', '/api/library-files-direct-upload-init'], async (req: Request, res: Response): Promise<void> => {
  try {
    if (!isWorkspaceLibraryEnabled()) {
      res.status(503).json({ error: 'Workspace library storage is not configured' });
      return;
    }

    const workspaceId = await requireWorkspaceId(req, res);
    if (!workspaceId) return;

    const name = typeof req.body?.name === 'string' ? req.body.name : '';
    const sizeBytes = typeof req.body?.sizeBytes === 'number' ? req.body.sizeBytes : NaN;
    const catalogId = req.body?.catalogId === null || typeof req.body?.catalogId === 'string' ? req.body.catalogId : null;
    const checked = typeof req.body?.checked === 'boolean' ? req.body.checked : true;
    const quantity = parseQuantityInput(typeof req.body?.quantity === 'number' ? req.body.quantity : 1);

    if (!name.trim()) {
      res.status(400).json({ error: 'name is required' });
      return;
    }
    if (!Number.isFinite(sizeBytes) || sizeBytes < 1) {
      res.status(400).json({ error: 'sizeBytes must be a positive number' });
      return;
    }
    if (!isValidCatalogIdInput(catalogId)) {
      res.status(400).json({ error: 'catalogId must be a UUID or null' });
      return;
    }
    if (quantity === null) {
      res.status(400).json({ error: `quantity must be an integer between 1 and ${MAX_LIBRARY_FILE_QTY}` });
      return;
    }

    const upload = await createSignedWorkspaceFileUpload({
      workspaceId,
      name,
      sizeBytes,
      catalogId,
      checked,
      quantity,
    });
    res.json({ success: true, upload });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    res.status(500).json({ error: 'Direct upload init failed', details: message });
  }
});

app.post(['/api/library/files/direct-upload', '/api/library-files-direct-upload'], upload.single('file'), async (req: Request, res: Response): Promise<void> => {
  try {
    if (!isWorkspaceLibraryEnabled()) {
      res.status(503).json({ error: 'Workspace library storage is not configured' });
      return;
    }

    const workspaceId = await requireWorkspaceId(req, res);
    if (!workspaceId) return;

    const uploaded = req.file;
    if (!uploaded || !uploaded.buffer || uploaded.buffer.byteLength === 0) {
      res.status(400).json({ error: 'Missing uploaded file' });
      return;
    }

    const fileId = typeof req.body?.fileId === 'string' ? req.body.fileId.trim() : '';
    const catalogIdRaw = typeof req.body?.catalogId === 'string' ? req.body.catalogId.trim() : '';
    const checkedRaw = typeof req.body?.checked === 'string' ? req.body.checked.trim().toLowerCase() : '';
    const quantityRaw = typeof req.body?.quantity === 'string' ? req.body.quantity.trim() : '';
    const checked = parseBooleanStringInput(checkedRaw);
    const quantity = parseQuantityStringInput(quantityRaw);

    if (!fileId) {
      res.status(400).json({ error: 'fileId is required' });
      return;
    }
    if (!uploaded.originalname?.trim()) {
      res.status(400).json({ error: 'Uploaded file name is required' });
      return;
    }
    if (catalogIdRaw.length > 0 && !isValidCatalogIdInput(catalogIdRaw)) {
      res.status(400).json({ error: 'catalogId must be a UUID or empty' });
      return;
    }
    if (checked === null) {
      res.status(400).json({ error: 'checked must be true or false' });
      return;
    }
    if (quantity === null) {
      res.status(400).json({ error: `quantity must be an integer between 1 and ${MAX_LIBRARY_FILE_QTY}` });
      return;
    }

    const file = await uploadWorkspaceFileBufferWithId({
      workspaceId,
      fileId,
      name: uploaded.originalname || uploaded.fieldname || 'upload.dxf',
      bodyBuffer: uploaded.buffer,
      catalogId: catalogIdRaw.length > 0 ? catalogIdRaw : null,
      checked,
      quantity,
    });
    res.json({ success: true, file });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    res.status(500).json({ error: 'Multipart direct upload file failed', details: message });
  }
});

app.put(
  [
    '/api/library/files/direct-upload',
    '/api/library-files-direct-upload',
    '/api/library/files/direct-upload/:fileId',
    '/api/library-files-direct-upload/:fileId',
  ],
  express.raw({ type: '*/*', limit: '200mb' }),
  async (req: Request, res: Response): Promise<void> => {
    try {
      if (!isWorkspaceLibraryEnabled()) {
        res.status(503).json({ error: 'Workspace library storage is not configured' });
        return;
      }

      const workspaceId = await requireWorkspaceId(req, res);
      if (!workspaceId) return;

      const fileIdHeader = typeof req.header('x-file-id') === 'string' ? req.header('x-file-id')! : '';
      const fileId = typeof req.params.fileId === 'string' && req.params.fileId.length > 0
        ? req.params.fileId
        : fileIdHeader;
      const nameHeader = typeof req.header('x-file-name') === 'string' ? req.header('x-file-name')! : '';
      const name = decodeHeaderFileName(nameHeader);
      const sizeBytes = Number(req.header('x-file-size') ?? NaN);
      const catalogIdHeader = req.header('x-catalog-id');
      const checkedHeader = req.header('x-file-checked') ?? 'true';
      const quantityHeader = req.header('x-file-quantity') ?? '1';
      const catalogId = catalogIdHeader && catalogIdHeader.trim().length > 0 ? catalogIdHeader : null;
      const checked = parseBooleanStringInput(checkedHeader.trim().toLowerCase());
      const quantity = parseQuantityStringInput(quantityHeader.trim());
      const body = req.body;
      const bodyBuffer = Buffer.isBuffer(body)
        ? body
        : body instanceof Uint8Array
          ? Buffer.from(body)
          : Buffer.alloc(0);

      if (!fileId) {
        res.status(400).json({ error: 'fileId is required' });
        return;
      }
      if (!name.trim()) {
        res.status(400).json({ error: 'x-file-name header is required' });
        return;
      }
      if (!Number.isFinite(sizeBytes) || sizeBytes < 1) {
        res.status(400).json({ error: 'x-file-size header must be a positive number' });
        return;
      }
      if (!isValidCatalogIdInput(catalogId)) {
        res.status(400).json({ error: 'x-catalog-id must be a UUID or empty' });
        return;
      }
      if (checked === null) {
        res.status(400).json({ error: 'x-file-checked must be true or false' });
        return;
      }
      if (quantity === null) {
        res.status(400).json({ error: `x-file-quantity must be an integer between 1 and ${MAX_LIBRARY_FILE_QTY}` });
        return;
      }
      if (bodyBuffer.byteLength === 0) {
        res.status(400).json({ error: 'Missing uploaded file body' });
        return;
      }
      if (bodyBuffer.byteLength !== sizeBytes) {
        res.status(400).json({ error: 'Uploaded file size does not match x-file-size header' });
        return;
      }

      const file = await uploadWorkspaceFileBufferWithId({
        workspaceId,
        fileId,
        name,
        bodyBuffer,
        catalogId,
        checked,
        quantity,
      });
      res.json({ success: true, file });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      res.status(500).json({ error: 'Binary direct upload failed', details: message });
    }
  },
);

app.post(['/api/library/files/direct-upload-complete', '/api/library-files-direct-upload-complete'], async (req: Request, res: Response): Promise<void> => {
  try {
    if (!isWorkspaceLibraryEnabled()) {
      res.status(503).json({ error: 'Workspace library storage is not configured' });
      return;
    }

    const workspaceId = await requireWorkspaceId(req, res);
    if (!workspaceId) return;

    const fileId = typeof req.body?.fileId === 'string' ? req.body.fileId : '';
    const name = typeof req.body?.name === 'string' ? req.body.name : '';
    const sizeBytes = typeof req.body?.sizeBytes === 'number' ? req.body.sizeBytes : NaN;
    const catalogId = req.body?.catalogId === null || typeof req.body?.catalogId === 'string' ? req.body.catalogId : null;
    const checked = typeof req.body?.checked === 'boolean' ? req.body.checked : true;
    const quantity = parseQuantityInput(typeof req.body?.quantity === 'number' ? req.body.quantity : 1);

    if (!fileId) {
      res.status(400).json({ error: 'fileId is required' });
      return;
    }
    if (!name.trim()) {
      res.status(400).json({ error: 'name is required' });
      return;
    }
    if (!Number.isFinite(sizeBytes) || sizeBytes < 1) {
      res.status(400).json({ error: 'sizeBytes must be a positive number' });
      return;
    }
    if (!isValidCatalogIdInput(catalogId)) {
      res.status(400).json({ error: 'catalogId must be a UUID or null' });
      return;
    }
    if (quantity === null) {
      res.status(400).json({ error: `quantity must be an integer between 1 and ${MAX_LIBRARY_FILE_QTY}` });
      return;
    }

    const file = await finalizeSignedWorkspaceFileUpload({
      workspaceId,
      fileId,
      name,
      sizeBytes,
      catalogId,
      checked,
      quantity,
    });
    res.json({ success: true, file });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    res.status(500).json({ error: 'Direct upload finalize failed', details: message });
  }
});

app.patch(['/api/library/files/:fileId', '/api/library-files/:fileId', '/api/library-files-update'], async (req: Request, res: Response): Promise<void> => {
  try {
    if (!isWorkspaceLibraryEnabled()) {
      res.status(503).json({ error: 'Workspace library storage is not configured' });
      return;
    }

    const workspaceId = await requireWorkspaceId(req, res);
    if (!workspaceId) return;

    const fileId = req.params.fileId ?? (typeof req.body?.fileId === 'string' ? req.body.fileId : '');
    if (!fileId) {
      res.status(400).json({ error: 'fileId is required' });
      return;
    }
    const patch: { name?: string; catalogId?: string | null; checked?: boolean; quantity?: number } = {};
    if (typeof req.body?.name === 'string') patch.name = req.body.name;
    if (req.body?.catalogId === null || typeof req.body?.catalogId === 'string') patch.catalogId = req.body.catalogId;
    if (typeof req.body?.checked === 'boolean') patch.checked = req.body.checked;
    if (req.body?.quantity !== undefined) {
      const quantity = parseQuantityInput(req.body.quantity);
      if (quantity === null) {
        res.status(400).json({ error: `quantity must be an integer between 1 and ${MAX_LIBRARY_FILE_QTY}` });
        return;
      }
      patch.quantity = quantity;
    }
    if (patch.catalogId !== undefined && !isValidCatalogIdInput(patch.catalogId)) {
      res.status(400).json({ error: 'catalogId must be a UUID or null' });
      return;
    }
    if (Object.keys(patch).length === 0) {
      res.status(400).json({ error: 'At least one patch field is required' });
      return;
    }

    await updateWorkspaceFile(workspaceId, fileId, patch);
    res.json({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    res.status(500).json({ error: 'Update file failed', details: message });
  }
});

app.delete(['/api/library/files/:fileId', '/api/library-files/:fileId'], async (req: Request, res: Response): Promise<void> => {
  try {
    if (!isWorkspaceLibraryEnabled()) {
      res.status(503).json({ error: 'Workspace library storage is not configured' });
      return;
    }

    const workspaceId = await requireWorkspaceId(req, res);
    if (!workspaceId) return;

    const fileId = req.params.fileId
      ?? (typeof req.query?.fileId === 'string' ? req.query.fileId : '')
      ?? (typeof req.body?.fileId === 'string' ? req.body.fileId : '');
    if (!fileId) {
      res.status(400).json({ error: 'fileId is required' });
      return;
    }
    await deleteWorkspaceFile(workspaceId, fileId);
    res.json({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    res.status(500).json({ error: 'Delete file failed', details: message });
  }
});

app.post('/api/library-files-delete', async (req: Request, res: Response): Promise<void> => {
  try {
    if (!isWorkspaceLibraryEnabled()) {
      res.status(503).json({ error: 'Workspace library storage is not configured' });
      return;
    }

    const workspaceId = await requireWorkspaceId(req, res);
    if (!workspaceId) return;

    const fileId = typeof req.body?.fileId === 'string' ? req.body.fileId : '';
    if (!fileId) {
      res.status(400).json({ error: 'fileId is required' });
      return;
    }
    await deleteWorkspaceFile(workspaceId, fileId);
    res.json({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    res.status(500).json({ error: 'Delete file failed', details: message });
  }
});

app.post(['/api/library/files/check-all', '/api/library-files-check-all'], async (req: Request, res: Response): Promise<void> => {
  try {
    if (!isWorkspaceLibraryEnabled()) {
      res.status(503).json({ error: 'Workspace library storage is not configured' });
      return;
    }

    const workspaceId = await requireWorkspaceId(req, res);
    if (!workspaceId) return;

    const checked = typeof req.body?.checked === 'boolean' ? req.body.checked : true;
    const catalogIds = Array.isArray(req.body?.catalogIds)
      ? (req.body.catalogIds.filter((id: unknown): id is string => typeof id === 'string'))
      : undefined;
    await setWorkspaceFilesChecked(workspaceId, checked, catalogIds);
    res.json({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    res.status(500).json({ error: 'Check-all failed', details: message });
  }
});

app.get(['/api/library/files/:fileId/download', '/api/library-files/:fileId-download', '/api/library-files-download'], async (req: Request, res: Response): Promise<void> => {
  try {
    if (!isWorkspaceLibraryEnabled()) {
      res.status(503).json({ error: 'Workspace library storage is not configured' });
      return;
    }

    const workspaceId = await requireWorkspaceId(req, res);
    if (!workspaceId) return;

    const fileId = req.params.fileId
      ?? (typeof req.query?.fileId === 'string' ? req.query.fileId : '')
      ?? (typeof req.body?.fileId === 'string' ? req.body.fileId : '');
    if (!fileId) {
      res.status(400).json({ error: 'fileId is required' });
      return;
    }
    const file = await downloadWorkspaceFile(workspaceId, fileId);
    res.json({ success: true, ...file });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    res.status(500).json({ error: 'Download file failed', details: message });
  }
});

// Parse DXF file
app.post('/api/parse', heavyRateLimit, async (req: Request, res: Response): Promise<void> => {
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
app.post('/api/normalize', heavyRateLimit, async (req: Request, res: Response): Promise<void> => {
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
app.post('/api/cutting-stats', heavyRateLimit, async (req: Request, res: Response): Promise<void> => {
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
app.post('/api/nest', nestingRateLimit, async (req: Request, res: Response): Promise<void> => {
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

    // N5: limit items array length
    if (params.items.length > 500) {
      res.status(400).json({ error: 'Too many items: maximum 500' });
      return;
    }

    const maybeSheet = params.sheet as { width?: unknown; height?: unknown };
    if (typeof maybeSheet.width !== 'number' || typeof maybeSheet.height !== 'number') {
      res.status(400).json({ error: 'Invalid sheet: width and height must be numbers' });
      return;
    }

    // N7: validate sheet dimensions
    const sheetW = maybeSheet.width as number;
    const sheetH = maybeSheet.height as number;
    if (!Number.isFinite(sheetW) || !Number.isFinite(sheetH) || sheetW <= 0 || sheetH <= 0 || sheetW > 100_000 || sheetH > 100_000) {
      res.status(400).json({ error: 'Invalid sheet: width and height must be positive finite numbers ≤ 100000' });
      return;
    }

    // N1: validate each item
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
    // N7: clamp gap to [0, 500]
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
    const NESTING_TIMEOUT_MS = 30_000; // 30 сек — защита от бесконечного нестинга
    const nestPromise = new Promise<ReturnType<typeof nestItems>>((resolve, reject) => {
      try {
        resolve(nestItems(items, sheet, gap, {
          rotationEnabled,
          rotationAngleStepDeg,
          strategy,
          multiStart,
          seed,
          commonLine,
        }));
      } catch (e) {
        reject(e);
      }
    });
    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('Nesting timeout (30s)')), NESTING_TIMEOUT_MS),
    );
    const result = await Promise.race([nestPromise, timeoutPromise]);

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
app.post('/api/price', heavyRateLimit, async (req: Request, res: Response): Promise<void> => {
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

    const result = calculatePrice({
      cutLength,
      pierces,
      sheets,
      material,
      thickness,
      complexity,
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
app.post('/api/export/dxf', heavyRateLimit, async (req: Request, res: Response): Promise<void> => {
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
app.post('/api/export/csv', heavyRateLimit, async (req: Request, res: Response): Promise<void> => {
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

    // S1: sanitize fileName to prevent header injection
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

// ─── Share nesting sheets (generate hashes) ─────────────────────────

app.post(['/api/nesting/share', '/api/nesting-share'], heavyRateLimit, async (req: Request, res: Response): Promise<void> => {
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

    // P6: limit sheets to prevent loop/store abuse
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

      await saveSharedSheet({
        hash,
        sheetIndex: i,
        singleResult,
        createdAt: Date.now(),
        itemDocs,
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
app.get('/api/nesting/sheet/:hash', heavyRateLimit, async (req: Request, res: Response): Promise<void> => {
  try {
    const { hash } = req.params;
    const entry = await getSharedSheet(hash!);
    if (!entry) {
      res.status(404).json({ error: 'Sheet not found or expired' });
      return;
    }

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
app.get('/api/nesting/sheet/:hash/info', heavyRateLimit, async (req: Request, res: Response): Promise<void> => {
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

// Bot message handler — internal only, protected by shared secret
app.post('/api/bot/message', (req: Request, res: Response, next: () => void): void => {
  const internalSecret = process.env.INTERNAL_API_SECRET?.trim() ?? '';
  if (internalSecret.length > 0) {
    const provided = req.header('x-internal-secret')?.trim() ?? '';
    if (provided !== internalSecret) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }
  }
  next();
}, async (req: Request, res: Response): Promise<void> => {
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
app.post(['/api/telegram/webhook', '/telegram/webhook', '/api/telegram-webhook'], async (req: Request, res: Response): Promise<void> => {
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

// Optional helper route to register webhook URL — internal only
app.post(['/api/telegram/webhook/register', '/telegram/webhook/register', '/api/telegram-webhook-register'], (req: Request, res: Response, next: () => void): void => {
  const internalSecret = process.env.INTERNAL_API_SECRET?.trim() ?? '';
  if (internalSecret.length > 0) {
    const provided = req.header('x-internal-secret')?.trim() ?? '';
    if (provided !== internalSecret) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }
  }
  next();
}, async (req: Request, res: Response): Promise<void> => {
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

// Get all material assignments for the workspace
app.get('/api/file-materials', async (req: Request, res: Response): Promise<void> => {
  try {
    if (!isWorkspaceLibraryEnabled()) {
      res.status(503).json({ error: 'Workspace library storage is not configured' });
      return;
    }
    const workspaceId = await requireWorkspaceId(req, res);
    if (!workspaceId) return;
    const data = await getFileMaterials(workspaceId);
    res.json({ success: true, data });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    res.status(500).json({ error: 'Get file materials failed', details: message });
  }
});

// Upsert material assignment for a file
app.post('/api/file-materials-upsert', async (req: Request, res: Response): Promise<void> => {
  try {
    if (!isWorkspaceLibraryEnabled()) {
      res.status(503).json({ error: 'Workspace library storage is not configured' });
      return;
    }
    const workspaceId = await requireWorkspaceId(req, res);
    if (!workspaceId) return;
    const fileId = typeof req.body?.fileId === 'string' ? req.body.fileId.trim() : '';
    const materialId = typeof req.body?.materialId === 'string' ? req.body.materialId.trim() : '';
    if (!fileId) {
      res.status(400).json({ error: 'fileId is required' });
      return;
    }
    if (!materialId) {
      res.status(400).json({ error: 'materialId is required' });
      return;
    }
    await upsertFileMaterial(workspaceId, fileId, materialId);
    res.json({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    res.status(500).json({ error: 'Upsert file material failed', details: message });
  }
});

export default app;
