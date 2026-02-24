import crypto from 'node:crypto';

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

const supabaseUrl = process.env.SUPABASE_URL?.trim() ?? '';
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ?? '';
const supabaseEnabled = supabaseUrl.length > 0 && supabaseServiceRoleKey.length > 0;
const supabaseRestBaseUrl = `${supabaseUrl.replace(/\/$/, '')}/rest/v1`;

const loginCodes = new Map<string, LoginCodeEntry>();
const usersByTelegram = new Map<string, AppUserEntry>();
const sessionsByTokenHash = new Map<string, AppSessionEntry>();

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

function createWorkspaceId(): string {
  return `ws_${crypto.randomBytes(6).toString('hex')}`;
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

async function supabaseRequest(pathWithQuery: string, init: RequestInit = {}): Promise<Response | null> {
  if (!supabaseEnabled) return null;
  try {
    return await fetch(`${supabaseRestBaseUrl}${pathWithQuery}`, {
      ...init,
      headers: {
        apikey: supabaseServiceRoleKey,
        Authorization: `Bearer ${supabaseServiceRoleKey}`,
        'Content-Type': 'application/json',
        ...(init.headers ?? {}),
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('[telegram-auth] supabase request failed:', message);
    return null;
  }
}

async function saveLoginCode(entry: LoginCodeEntry): Promise<void> {
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
    id: crypto.randomUUID(),
    telegramUserId,
    workspaceId: createWorkspaceId(),
    createdAt: Date.now(),
  };
  usersByTelegram.set(telegramUserId, newUser);

  if (supabaseEnabled) {
    const response = await supabaseRequest(`/${APP_USERS_TABLE}?on_conflict=telegram_user_id`, {
      method: 'POST',
      headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify([toUserRow(newUser)]),
    });
    if (!response?.ok) {
      console.error('[telegram-auth] failed to create user');
    }
  }

  return newUser;
}

async function saveSession(entry: AppSessionEntry): Promise<void> {
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
