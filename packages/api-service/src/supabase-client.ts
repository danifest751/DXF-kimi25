const supabaseUrl = process.env.SUPABASE_URL?.trim() ?? '';
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ?? '';

export const supabaseEnabled = supabaseUrl.length > 0 && supabaseServiceRoleKey.length > 0;

const supabaseRestBaseUrl = `${supabaseUrl.replace(/\/$/, '')}/rest/v1`;
export const supabaseStorageBaseUrl = `${supabaseUrl.replace(/\/$/, '')}/storage/v1`;

export async function supabaseRequest(pathWithQuery: string, init: RequestInit = {}): Promise<Response | null> {
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
    console.error('[supabase] rest request failed:', message);
    return null;
  }
}

export async function supabaseStorageRequest(path: string, init: RequestInit = {}): Promise<Response | null> {
  if (!supabaseEnabled) return null;
  try {
    return await fetch(`${supabaseStorageBaseUrl}${path}`, {
      ...init,
      headers: {
        apikey: supabaseServiceRoleKey,
        Authorization: `Bearer ${supabaseServiceRoleKey}`,
        ...(init.headers ?? {}),
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('[supabase] storage request failed:', message);
    return null;
  }
}
