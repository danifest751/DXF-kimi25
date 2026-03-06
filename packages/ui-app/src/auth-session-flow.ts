import { apiGetJSON, apiPostJSON } from './api.js';

interface SessionMeResponse {
  readonly authenticated: boolean;
  readonly workspaceId: string;
}

export function createAuthSessionFlowController(input: {
  authTokenStorageKey: string;
  cookieSessionToken: string;
  clearAuthSessionState: () => void;
  setAuthSessionState: (token: string, workspaceId: string) => void;
  emitAuthSessionChanged: () => void;
  updateAuthUi: () => void;
  migrateGuestDraftToWorkspace: () => Promise<void>;
  reloadWorkspaceFromServer: () => Promise<void>;
  restoreGuestDraft: () => Promise<void>;
}): {
  clearStoredAuthSession(): void;
  finalizeAuthenticatedSession(workspaceId: string): Promise<void>;
  restoreAuthSession(): Promise<void>;
} {
  const {
    authTokenStorageKey,
    cookieSessionToken,
    clearAuthSessionState,
    setAuthSessionState,
    emitAuthSessionChanged,
    updateAuthUi,
    migrateGuestDraftToWorkspace,
    reloadWorkspaceFromServer,
    restoreGuestDraft,
  } = input;

  async function adoptLegacyToken(savedToken: string): Promise<SessionMeResponse> {
    await apiPostJSON<{ success: boolean; workspaceId: string; expiresAt: string }>(
      '/api/auth-adopt-token',
      {},
      { Authorization: `Bearer ${savedToken}` },
    );
    return apiGetJSON<SessionMeResponse>('/api/auth-me');
  }

  function applyAuthenticatedSession(workspaceId: string): void {
    setAuthSessionState(cookieSessionToken, workspaceId);
    localStorage.removeItem(authTokenStorageKey);
    updateAuthUi();
    emitAuthSessionChanged();
  }

  function clearStoredAuthSession(): void {
    clearAuthSessionState();
    localStorage.removeItem(authTokenStorageKey);
    updateAuthUi();
    emitAuthSessionChanged();
  }

  async function finalizeAuthenticatedSession(workspaceId: string): Promise<void> {
    applyAuthenticatedSession(workspaceId);
    await migrateGuestDraftToWorkspace();
    await reloadWorkspaceFromServer();
  }

  async function restoreGuestSessionFallback(): Promise<void> {
    clearStoredAuthSession();
    await restoreGuestDraft();
  }

  async function restoreAuthSession(): Promise<void> {
    const savedToken = localStorage.getItem(authTokenStorageKey) ?? '';
    try {
      const me = savedToken
        ? await adoptLegacyToken(savedToken)
        : await apiGetJSON<SessionMeResponse>('/api/auth-me');
      if (!me.authenticated) throw new Error('Session rejected');
      await finalizeAuthenticatedSession(me.workspaceId);
    } catch {
      await restoreGuestSessionFallback();
    }
  }

  return {
    clearStoredAuthSession,
    finalizeAuthenticatedSession,
    restoreAuthSession,
  };
}
