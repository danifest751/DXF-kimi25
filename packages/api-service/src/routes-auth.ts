import { Router, type Request, type Response } from 'express';
import crypto from 'node:crypto';
import {
  exchangeTelegramLoginCode,
  getAuthSessionByToken,
  checkCodeExchangeRateLimit,
  revokeAuthSessionByToken,
  createSessionForTelegramUser,
} from './telegram-auth.js';
import {
  getAuthTokenFromRequest,
  getClientIp,
  setAuthCookie,
  clearAuthCookie,
} from './middleware/auth.js';
import { checkRateLimit } from './rate-limit.js';

const router = Router();

function validateTelegramInitData(initData: string, botToken: string): { userId: number; username?: string } | null {
  try {
    const params = new URLSearchParams(initData);
    const receivedHash = params.get('hash');
    if (!receivedHash) return null;
    params.delete('hash');

    const dataCheckString = [...params.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${k}=${v}`)
      .join('\n');

    const secretKey = crypto.createHmac('sha256', 'WebAppData').update(botToken).digest();
    const expectedHash = crypto.createHmac('sha256', secretKey).update(dataCheckString).digest('hex');

    if (expectedHash !== receivedHash) return null;

    const authDate = Number(params.get('auth_date') ?? '0');
    if (!Number.isFinite(authDate) || Date.now() / 1000 - authDate > 86400) return null;

    const userStr = params.get('user');
    if (!userStr) return null;
    const user = JSON.parse(userStr) as { id?: number; username?: string };
    if (!user.id || !Number.isFinite(user.id)) return null;

    return { userId: user.id, username: user.username };
  } catch {
    return null;
  }
}

router.post(['/auth/tma-init', '/auth-tma-init'], async (req: Request, res: Response): Promise<void> => {
  try {
    const ip = getClientIp(req);
    if (!await checkRateLimit(`tma-init:${ip}`, 20, 60_000)) {
      res.status(429).json({ error: 'Too many requests. Try again later.' });
      return;
    }

    const initData = typeof req.body?.initData === 'string' ? req.body.initData.trim() : '';
    if (!initData) { res.status(400).json({ error: 'Missing initData' }); return; }

    const botToken = process.env.TELEGRAM_BOT_TOKEN?.trim() ?? '';
    if (!botToken) { res.status(503).json({ error: 'Telegram bot not configured' }); return; }

    const tgUser = validateTelegramInitData(initData, botToken);
    if (!tgUser) { res.status(401).json({ error: 'Invalid or expired initData' }); return; }

    const session = await createSessionForTelegramUser(tgUser.userId);
    setAuthCookie(res, session.sessionToken, session.expiresAt);
    res.json({ success: true, sessionToken: session.sessionToken, workspaceId: session.workspaceId, expiresAt: new Date(session.expiresAt).toISOString() });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    res.status(500).json({ error: 'TMA auth failed', details: message });
  }
});

router.post(['/auth/telegram/exchange-code', '/auth-telegram-exchange-code'], async (req: Request, res: Response): Promise<void> => {
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
    if (!session) { res.status(401).json({ error: 'Invalid or expired code' }); return; }

    setAuthCookie(res, session.sessionToken, session.expiresAt);
    res.json({ success: true, sessionToken: session.sessionToken, workspaceId: session.workspaceId, expiresAt: new Date(session.expiresAt).toISOString() });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    res.status(500).json({ error: 'Auth code exchange failed', details: message });
  }
});

router.post(['/auth/adopt-token', '/auth-adopt-token'], async (req: Request, res: Response): Promise<void> => {
  try {
    const header = req.header('authorization') ?? req.header('Authorization') ?? '';
    const token = header.toLowerCase().startsWith('bearer ') ? header.slice(7).trim() : '';
    if (!token) { res.status(401).json({ success: false, error: 'Missing session token' }); return; }

    const session = await getAuthSessionByToken(token);
    if (!session) { res.status(401).json({ success: false, error: 'Session not found or expired' }); return; }

    setAuthCookie(res, token, session.expiresAt);
    res.json({ success: true, workspaceId: session.workspaceId, expiresAt: new Date(session.expiresAt).toISOString() });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    res.status(500).json({ error: 'Auth adopt token failed', details: message });
  }
});

router.get(['/auth/me', '/auth-me'], async (req: Request, res: Response): Promise<void> => {
  try {
    const token = getAuthTokenFromRequest(req);
    if (!token) { res.status(401).json({ authenticated: false, error: 'Missing session token' }); return; }

    const session = await getAuthSessionByToken(token);
    if (!session) { res.status(401).json({ authenticated: false, error: 'Session not found or expired' }); return; }

    res.json({ authenticated: true, userId: session.userId, workspaceId: session.workspaceId, expiresAt: new Date(session.expiresAt).toISOString() });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    res.status(500).json({ error: 'Auth me failed', details: message });
  }
});

router.post(['/auth/logout', '/auth-logout'], async (req: Request, res: Response): Promise<void> => {
  try {
    const token = getAuthTokenFromRequest(req);
    if (token) await revokeAuthSessionByToken(token);
    clearAuthCookie(res);
    res.json({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    res.status(500).json({ error: 'Auth logout failed', details: message });
  }
});

export default router;
