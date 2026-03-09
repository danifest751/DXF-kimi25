import type { Request, Response } from 'express';
import { getAuthSessionByToken } from '../telegram-auth.js';

export const AUTH_COOKIE_NAME = 'dxf_auth_session';

const isLocalRuntime = process.env.VERCEL !== '1' && process.env.NODE_ENV !== 'production';
export const authCookieSameSite: 'lax' | 'none' = isLocalRuntime ? 'lax' : 'none';

export { isLocalRuntime };

export function parseCookies(cookieHeader: string): Record<string, string> {
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

export function getAuthCookieToken(req: Request): string {
  const cookieHeader = req.header('cookie') ?? '';
  if (!cookieHeader) return '';
  return parseCookies(cookieHeader)[AUTH_COOKIE_NAME] ?? '';
}

export function setAuthCookie(res: Response, token: string, expiresAt: number): void {
  res.cookie(AUTH_COOKIE_NAME, token, {
    httpOnly: true,
    secure: !isLocalRuntime,
    sameSite: authCookieSameSite,
    expires: new Date(expiresAt),
    path: '/',
  });
}

export function clearAuthCookie(res: Response): void {
  res.clearCookie(AUTH_COOKIE_NAME, {
    httpOnly: true,
    secure: !isLocalRuntime,
    sameSite: authCookieSameSite,
    path: '/',
  });
}

export function getAuthTokenFromRequest(req: Request): string {
  const cookieToken = getAuthCookieToken(req);
  if (cookieToken) return cookieToken;
  const header = req.header('authorization') ?? '';
  if (header.toLowerCase().startsWith('bearer ')) {
    return header.slice(7).trim();
  }
  const alt = req.header('x-session-token') ?? '';
  return alt.trim();
}

export function getClientIp(req: Request): string {
  const forwarded = req.header('x-forwarded-for');
  if (forwarded) return forwarded.split(',')[0]!.trim();
  return req.socket?.remoteAddress ?? 'unknown';
}

export async function requireWorkspaceId(req: Request, res: Response): Promise<string | null> {
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
