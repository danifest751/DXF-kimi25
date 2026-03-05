import crypto from 'node:crypto';
import { supabaseEnabled, supabaseRequest } from './supabase-client.js';

interface LoginCodeEntry {
  readonly code: string;
  readonly telegramUserId: string;
  readonly telegramChatId: string;
  readonly createdAt: number;
  readonly expiresAt: number;
  readonly usedAt: number | null;
}

interface AppUserEntry {
  readonly id: string;
  readonly telegramUserId: string;
  readonly workspaceId: string;
  readonly createdAt: number;
}

interface AppSessionEntry {
  readonly tokenHash: string;
  readonly userId: string;
  readonly workspaceId: string;
  readonly createdAt: number;
  readonly expiresAt: number;
}

interface LoginCodeRow {
  readonly code: string;
  readonly telegram_user_id: string;
  readonly telegram_chat_id: string;
  readonly created_at: string;
  readonly expires_at: string;
  readonly used_at: string | null;
}

interface AppUserRow {
  readonly id: string;
  readonly telegram_user_id: string;
  readonly workspace_id: string;
  readonly created_at: string;
}

interface AppSessionRow {
  readonly token_hash: string;
  readonly user_id: string;
  readonly workspace_id: string;
  readonly created_at: string;
  readonly expires_at: string;
}

const LOGIN_CODE_TTL_MS = 5 * 60 * 1000;
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

const LOGIN_CODES_TABLE = process.env.SUPABASE_TELEGRAM_AUTH_CODES_TABLE?.trim() || 'telegram_auth_codes';
const APP_USERS_TABLE = process.env.SUPABASE_APP_USERS_TABLE?.trim() || 'app_users';
const APP_SESSIONS_TABLE = process.env.SUPABASE_APP_SESSIONS_TABLE?.trim() || 'app_sessions';


const loginCodes = new Map<string, LoginCodeEntry>();
const usersByTelegram = new Map<string, AppUserEntry>();
const sessionsByTokenHash = new Map<string, AppSessionEntry>();

// P1: caps to prevent OOM under DDoS with unique codes/tokens
const LOGIN_CODES_MAX = 5_000;
const SESSIONS_MAX = 20_000;
const USERS_MAX = 50_000;

// P2: brute-force protection for code exchange (per IP)
const codeExchangeAttempts = new Map<string, { count: number; windowStart: number }>();
const CODE_EXCHANGE_MAX = 10; // per 5 min per IP
const CODE_EXCHANGE_WINDOW_MS = 5 * 60 * 1000;

export function checkCodeExchangeRateLimit(ip: string): boolean {
  const now = Date.now();
  const state = codeExchangeAttempts.get(ip);
  if (!state || now - state.windowStart > CODE_EXCHANGE_WINDOW_MS) {
    if (!state && codeExchangeAttempts.size >= 10_000) {
      const first = codeExchangeAttempts.keys().next().value;
      if (first !== undefined) codeExchangeAttempts.delete(first);
    }
    codeExchangeAttempts.set(ip, { count: 1, windowStart: now });
    return true;
  }
  state.count++;
  return state.count <= CODE_EXCHANGE_MAX;
}

function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function generateLoginCode(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) {
    const index = crypto.randomInt(0, alphabet.length);
    code += alphabet[index];
  }
  return code;
}

function createSessionToken(): string {
  return crypto.randomBytes(24).toString('hex');
}

function stableHex(input: string, length: number): string {
  return crypto.createHash('sha256').update(input).digest('hex').slice(0, length);
}

function createStableUserId(telegramUserId: string): string {
  return `u_${stableHex(`user:${telegramUserId}`, 20)}`;
}

function createStableWorkspaceId(telegramUserId: string): string {
  return `ws_${stableHex(`workspace:${telegramUserId}`, 16)}`;
}

function toLoginCodeRow(entry: LoginCodeEntry): LoginCodeRow {
  return {
    code: entry.code,
    telegram_user_id: entry.telegramUserId,
    telegram_chat_id: entry.telegramChatId,
    created_at: new Date(entry.createdAt).toISOString(),
    expires_at: new Date(entry.expiresAt).toISOString(),
    used_at: entry.usedAt ? new Date(entry.usedAt).toISOString() : null,
  };
}

function fromLoginCodeRow(row: LoginCodeRow): LoginCodeEntry {
  return {
    code: row.code,
    telegramUserId: row.telegram_user_id,
    telegramChatId: row.telegram_chat_id,
    createdAt: Date.parse(row.created_at),
    expiresAt: Date.parse(row.expires_at),
    usedAt: row.used_at ? Date.parse(row.used_at) : null,
  };
}

function toUserRow(entry: AppUserEntry): AppUserRow {
  return {
    id: entry.id,
    telegram_user_id: entry.telegramUserId,
    workspace_id: entry.workspaceId,
    created_at: new Date(entry.createdAt).toISOString(),
  };
}

function fromUserRow(row: AppUserRow): AppUserEntry {
  return {
    id: row.id,
    telegramUserId: row.telegram_user_id,
    workspaceId: row.workspace_id,
    createdAt: Date.parse(row.created_at),
  };
}

function toSessionRow(entry: AppSessionEntry): AppSessionRow {
  return {
    token_hash: entry.tokenHash,
    user_id: entry.userId,
    workspace_id: entry.workspaceId,
    created_at: new Date(entry.createdAt).toISOString(),
    expires_at: new Date(entry.expiresAt).toISOString(),
  };
}

function fromSessionRow(row: AppSessionRow): AppSessionEntry {
  return {
    tokenHash: row.token_hash,
    userId: row.user_id,
    workspaceId: row.workspace_id,
    createdAt: Date.parse(row.created_at),
    expiresAt: Date.parse(row.expires_at),
  };
}


async function saveLoginCode(entry: LoginCodeEntry): Promise<void> {
  // P1: evict oldest if at capacity
  if (!loginCodes.has(entry.code) && loginCodes.size >= LOGIN_CODES_MAX) {
    const first = loginCodes.keys().next().value;
    if (first !== undefined) loginCodes.delete(first);
  }
  loginCodes.set(entry.code, entry);
  if (!supabaseEnabled) return;

  const response = await supabaseRequest(`/${LOGIN_CODES_TABLE}?on_conflict=code`, {
    method: 'POST',
    headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify([toLoginCodeRow(entry)]),
  });
  if (!response?.ok) {
    console.error('[telegram-auth] failed to save login code');
  }
}

async function loadLoginCode(code: string): Promise<LoginCodeEntry | null> {
  const cached = loginCodes.get(code);
  if (cached) return cached;
  if (!supabaseEnabled) return null;

  const params = new URLSearchParams({
    select: 'code,telegram_user_id,telegram_chat_id,created_at,expires_at,used_at',
    code: `eq.${code}`,
    limit: '1',
  });
  const response = await supabaseRequest(`/${LOGIN_CODES_TABLE}?${params.toString()}`);
  if (!response?.ok) {
    console.error('[telegram-auth] failed to load login code');
    return null;
  }

  const rows = await response.json() as LoginCodeRow[];
  if (!Array.isArray(rows) || rows.length === 0) return null;
  const entry = fromLoginCodeRow(rows[0]!);
  loginCodes.set(code, entry);
  return entry;
}

async function markLoginCodeUsed(code: string, usedAt: number): Promise<void> {
  const current = await loadLoginCode(code);
  if (!current) return;

  const next: LoginCodeEntry = { ...current, usedAt };
  loginCodes.set(code, next);

  if (!supabaseEnabled) return;
  const params = new URLSearchParams({ code: `eq.${code}` });
  const response = await supabaseRequest(`/${LOGIN_CODES_TABLE}?${params.toString()}`, {
    method: 'PATCH',
    body: JSON.stringify({ used_at: new Date(usedAt).toISOString() }),
  });
  if (!response?.ok) {
    console.error('[telegram-auth] failed to mark login code used');
  }
}

async function getOrCreateUserByTelegramId(telegramUserId: string): Promise<AppUserEntry> {
  const cached = usersByTelegram.get(telegramUserId);
  if (cached) return cached;

  if (supabaseEnabled) {
    const params = new URLSearchParams({
      select: 'id,telegram_user_id,workspace_id,created_at',
      telegram_user_id: `eq.${telegramUserId}`,
      limit: '1',
    });
    const response = await supabaseRequest(`/${APP_USERS_TABLE}?${params.toString()}`);
    if (response?.ok) {
      const rows = await response.json() as AppUserRow[];
      if (Array.isArray(rows) && rows.length > 0) {
        const user = fromUserRow(rows[0]!);
        usersByTelegram.set(telegramUserId, user);
        return user;
      }
    }
  }

  const newUser: AppUserEntry = {
    id: createStableUserId(telegramUserId),
    telegramUserId,
    workspaceId: createStableWorkspaceId(telegramUserId),
    createdAt: Date.now(),
  };
  // P1: evict oldest if at capacity
  if (!usersByTelegram.has(telegramUserId) && usersByTelegram.size >= USERS_MAX) {
    const first = usersByTelegram.keys().next().value;
    if (first !== undefined) usersByTelegram.delete(first);
  }
  usersByTelegram.set(telegramUserId, newUser);

  if (supabaseEnabled) {
    const response = await supabaseRequest(`/${APP_USERS_TABLE}?on_conflict=telegram_user_id`, {
      method: 'POST',
      headers: { Prefer: 'resolution=ignore-duplicates,return=minimal' },
      body: JSON.stringify([toUserRow(newUser)]),
    });
    if (!response?.ok) {
      console.error('[telegram-auth] failed to create user');
    } else {
      const params = new URLSearchParams({
        select: 'id,telegram_user_id,workspace_id,created_at',
        telegram_user_id: `eq.${telegramUserId}`,
        limit: '1',
      });
      const reread = await supabaseRequest(`/${APP_USERS_TABLE}?${params.toString()}`);
      if (reread?.ok) {
        const rows = await reread.json() as AppUserRow[];
        if (Array.isArray(rows) && rows.length > 0) {
          const persisted = fromUserRow(rows[0]!);
          usersByTelegram.set(telegramUserId, persisted);
          return persisted;
        }
      }
    }
  }

  return newUser;
}

async function saveSession(entry: AppSessionEntry): Promise<void> {
  // P1: evict oldest if at capacity
  if (!sessionsByTokenHash.has(entry.tokenHash) && sessionsByTokenHash.size >= SESSIONS_MAX) {
    const first = sessionsByTokenHash.keys().next().value;
    if (first !== undefined) sessionsByTokenHash.delete(first);
  }
  sessionsByTokenHash.set(entry.tokenHash, entry);
  if (!supabaseEnabled) return;

  const response = await supabaseRequest(`/${APP_SESSIONS_TABLE}?on_conflict=token_hash`, {
    method: 'POST',
    headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify([toSessionRow(entry)]),
  });
  if (!response?.ok) {
    console.error('[telegram-auth] failed to save session');
  }
}

async function loadSessionByTokenHash(tokenHash: string): Promise<AppSessionEntry | null> {
  const cached = sessionsByTokenHash.get(tokenHash);
  if (cached) return cached;
  if (!supabaseEnabled) return null;

  const params = new URLSearchParams({
    select: 'token_hash,user_id,workspace_id,created_at,expires_at',
    token_hash: `eq.${tokenHash}`,
    limit: '1',
  });
  const response = await supabaseRequest(`/${APP_SESSIONS_TABLE}?${params.toString()}`);
  if (!response?.ok) {
    console.error('[telegram-auth] failed to load session');
    return null;
  }

  const rows = await response.json() as AppSessionRow[];
  if (!Array.isArray(rows) || rows.length === 0) return null;
  const entry = fromSessionRow(rows[0]!);
  sessionsByTokenHash.set(tokenHash, entry);
  return entry;
}

let lastSupabasePruneAt = 0;
const SUPABASE_PRUNE_INTERVAL_MS = 10 * 60 * 1000;

function pruneLocalMaps(now = Date.now()): void {
  for (const [code, entry] of loginCodes) {
    if (entry.expiresAt <= now || entry.usedAt !== null) {
      loginCodes.delete(code);
    }
  }
  for (const [tokenHash, entry] of sessionsByTokenHash) {
    if (entry.expiresAt <= now) {
      sessionsByTokenHash.delete(tokenHash);
    }
  }

  if (supabaseEnabled && now - lastSupabasePruneAt > SUPABASE_PRUNE_INTERVAL_MS) {
    lastSupabasePruneAt = now;
    void pruneSupabaseExpired(now);
  }
}

async function pruneSupabaseExpired(now: number): Promise<void> {
  const nowIso = new Date(now).toISOString();
  try {
    await supabaseRequest(`/${LOGIN_CODES_TABLE}?expires_at=lt.${nowIso}`, { method: 'DELETE' });
    await supabaseRequest(`/${APP_SESSIONS_TABLE}?expires_at=lt.${nowIso}`, { method: 'DELETE' });
  } catch (err) {
    console.error('[telegram-auth] prune expired rows failed:', err);
  }
}

export async function createTelegramLoginCode(telegramUserIdInput: number | string, telegramChatIdInput: number | string): Promise<{ code: string; expiresAt: number }> {
  pruneLocalMaps();
  const code = generateLoginCode();
  const now = Date.now();
  const entry: LoginCodeEntry = {
    code,
    telegramUserId: String(telegramUserIdInput),
    telegramChatId: String(telegramChatIdInput),
    createdAt: now,
    expiresAt: now + LOGIN_CODE_TTL_MS,
    usedAt: null,
  };
  await saveLoginCode(entry);
  return { code: entry.code, expiresAt: entry.expiresAt };
}

export async function exchangeTelegramLoginCode(codeInput: string): Promise<{ sessionToken: string; workspaceId: string; expiresAt: number } | null> {
  pruneLocalMaps();
  const normalizedCode = codeInput.trim().toUpperCase();
  if (!/^[A-Z0-9]{6}$/.test(normalizedCode)) return null;

  const codeEntry = await loadLoginCode(normalizedCode);
  if (!codeEntry) return null;

  const now = Date.now();
  if (codeEntry.usedAt !== null || codeEntry.expiresAt <= now) return null;

  await markLoginCodeUsed(normalizedCode, now);

  const user = await getOrCreateUserByTelegramId(codeEntry.telegramUserId);
  const sessionToken = createSessionToken();
  const tokenHash = hashToken(sessionToken);
  const expiresAt = now + SESSION_TTL_MS;

  await saveSession({
    tokenHash,
    userId: user.id,
    workspaceId: user.workspaceId,
    createdAt: now,
    expiresAt,
  });

  return {
    sessionToken,
    workspaceId: user.workspaceId,
    expiresAt,
  };
}

export async function getAuthSessionByToken(tokenInput: string): Promise<{ userId: string; workspaceId: string; expiresAt: number } | null> {
  pruneLocalMaps();
  const token = tokenInput.trim();
  if (token.length === 0) return null;

  const tokenHash = hashToken(token);
  const session = await loadSessionByTokenHash(tokenHash);
  if (!session) return null;

  if (session.expiresAt <= Date.now()) {
    sessionsByTokenHash.delete(tokenHash);
    return null;
  }

  return {
    userId: session.userId,
    workspaceId: session.workspaceId,
    expiresAt: session.expiresAt,
  };
}

export async function revokeAuthSessionByToken(tokenInput: string): Promise<void> {
  pruneLocalMaps();
  const token = tokenInput.trim();
  if (token.length === 0) return;

  const tokenHash = hashToken(token);
  sessionsByTokenHash.delete(tokenHash);
  if (!supabaseEnabled) return;

  const params = new URLSearchParams({ token_hash: `eq.${tokenHash}` });
  const response = await supabaseRequest(`/${APP_SESSIONS_TABLE}?${params.toString()}`, {
    method: 'DELETE',
  });
  if (!response?.ok) {
    console.error('[telegram-auth] failed to revoke session');
  }
}
