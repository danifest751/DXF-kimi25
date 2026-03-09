/**
 * @module api-service
 * HTTP API for DXF Viewer services.
 * Полный API вокруг core-engine.
 */

import { initSentry, sentryRequestHandler } from './sentry.js';
import express, { type Request, type Response } from 'express';
import cors from 'cors';
import { setTelegramWebhook } from '../../bot-service/src/index.js';
import { registerDxfRoutes } from './routes-dxf.js';
import { isLocalRuntime } from './middleware/auth.js';
import { heavyRateLimit, nestingRateLimit } from './rate-limit.js';
import routesAuth from './routes-auth.js';
import routesWorkspace from './routes-workspace.js';
import routesTelegram from './routes-telegram.js';

initSentry();

const app = express();

const allowedOrigins = (process.env.ALLOWED_ORIGINS ?? '')
  .split(',')
  .map((s) => s.trim())
  .filter((s) => s.length > 0);

const telegramBotToken = process.env.TELEGRAM_BOT_TOKEN?.trim() ?? '';
const telegramWebhookUrl = process.env.TELEGRAM_WEBHOOK_URL?.trim() ?? '';
const telegramWebhookSecret = process.env.TELEGRAM_WEBHOOK_SECRET?.trim() ?? '';
const telegramAutoRegisterWebhookRaw = (process.env.TELEGRAM_WEBHOOK_AUTO_REGISTER ?? '').trim().toLowerCase();
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
    .then(() => { console.log(`[Telegram] webhook registered: ${telegramWebhookUrl}`); })
    .catch((error) => { console.error('[Telegram] webhook auto-registration failed:', error instanceof Error ? error.message : String(error)); });
}

ensureTelegramWebhookRegistrationOnStartup();

function isDefaultAllowedOrigin(origin: string): boolean {
  if (/^http:\/\/localhost(?::\d+)?$/i.test(origin)) return true;
  if (/^http:\/\/127\.0\.0\.1(?::\d+)?$/i.test(origin)) return true;
  if (!isLocalRuntime) return false;
  return /^https:\/\/[a-z0-9-]+\.vercel\.app$/i.test(origin);
}

app.use(cors({
  origin: (origin, callback) => {
    if (!origin) { callback(null, true); return; }
    if (allowedOrigins.includes(origin) || isDefaultAllowedOrigin(origin)) { callback(null, true); return; }
    callback(null, false);
  },
  credentials: true,
}));

// Default body limit 1 MB; DXF endpoints override with 50 MB; share endpoint 20 MB
app.use((req, _res, next) => {
  const dxfRoutes = ['/api/parse', '/api/normalize', '/api/cutting-stats', '/api/library/files', '/api/library-files'];
  const isDxf = dxfRoutes.some(r => req.path.startsWith(r));
  const isShare = req.path === '/api/nesting-share' || req.path === '/api/nesting/share';
  express.json({ limit: isDxf ? '50mb' : isShare ? '20mb' : '1mb' })(req, _res, next);
});

// ─── Health check ─────────────────────────────────────────────────────
app.get(['/health', '/api/health'], (_req: Request, res: Response) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ─── Route modules ────────────────────────────────────────────────────
app.use('/api', routesAuth);
app.use('/api', routesWorkspace);
app.use('/api', routesTelegram);

// ─── DXF / nesting / price / export / share routes ───────────────────
registerDxfRoutes(app, heavyRateLimit, nestingRateLimit);

// ─── Sentry error handler (must be last) ─────────────────────────────
app.use(sentryRequestHandler());

export default app;
