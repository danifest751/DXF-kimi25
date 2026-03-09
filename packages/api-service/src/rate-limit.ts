import type { Request, Response } from 'express';
import { supabaseEnabled, supabaseRequest } from './supabase-client.js';
import { getClientIp } from './middleware/auth.js';

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
const RATE_LIMIT_MAX_ENTRIES = 10_000;
const RATE_LIMITS_TABLE = process.env.SUPABASE_RATE_LIMITS_TABLE?.trim() || 'api_rate_limits';

function checkLocalRateLimit(key: string, maxRequests: number, windowMs: number): boolean {
  const now = Date.now();
  const state = rateLimitStore.get(key);
  if (state === undefined || now - state.windowStart > windowMs) {
    if (state === undefined && rateLimitStore.size >= RATE_LIMIT_MAX_ENTRIES) {
      const firstKey = rateLimitStore.keys().next().value;
      if (firstKey !== undefined) rateLimitStore.delete(firstKey);
    }
    rateLimitStore.set(key, { windowStart: now, count: 1 });
    return true;
  }
  state.count++;
  return state.count <= maxRequests;
}

export async function checkRateLimit(key: string, maxRequests: number, windowMs: number): Promise<boolean> {
  if (!supabaseEnabled) return checkLocalRateLimit(key, maxRequests, windowMs);

  if (!checkLocalRateLimit(key, maxRequests, windowMs)) return false;

  const now = Date.now();
  try {
    const upsertResp = await supabaseRequest(`/${RATE_LIMITS_TABLE}?on_conflict=key`, {
      method: 'POST',
      headers: { Prefer: 'resolution=merge-duplicates,return=representation' },
      body: JSON.stringify([{ key, window_start_ms: now, count: 1, updated_at: new Date(now).toISOString() }]),
    });
    if (!upsertResp?.ok) return true;

    const rows = await upsertResp.json() as RateLimitRow[];
    const row = Array.isArray(rows) && rows.length > 0 ? rows[0]! : null;
    if (!row) return true;

    const windowExpired = now - Number(row.window_start_ms) > windowMs;
    const nextCount = windowExpired ? 1 : Number(row.count) + 1;
    const nextWindowStart = windowExpired ? now : Number(row.window_start_ms);

    void supabaseRequest(`/${RATE_LIMITS_TABLE}?on_conflict=key`, {
      method: 'POST',
      headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify([{ key, window_start_ms: nextWindowStart, count: nextCount, updated_at: new Date(now).toISOString() }]),
    });

    return nextCount <= maxRequests;
  } catch {
    return true;
  }
}

export async function heavyRateLimit(req: Request, res: Response, next: () => void): Promise<void> {
  const ip = getClientIp(req);
  if (!await checkRateLimit(`heavy:${ip}`, 10, 60_000)) {
    res.status(429).json({ error: 'Too many requests. Limit: 10 per minute.' });
    return;
  }
  next();
}

export async function nestingRateLimit(req: Request, res: Response, next: () => void): Promise<void> {
  const ip = getClientIp(req);
  if (!await checkRateLimit(`nest:${ip}`, 10, 60_000)) {
    res.status(429).json({ error: 'Too many nesting requests. Limit: 10 per minute.' });
    return;
  }
  next();
}
