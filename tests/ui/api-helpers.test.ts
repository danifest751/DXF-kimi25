import { afterEach, describe, expect, it, vi } from 'vitest';
import { apiDeleteJSON, apiPatchJSON, apiPostJSON, arrayBufferToBase64 } from '../../packages/ui-app/src/api.js';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('ui api helpers', () => {
  it('apiPatchJSON uses PATCH and JSON payload', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }));

    const payload = { fileId: 'f1', quantity: 5 };
    const result = await apiPatchJSON<{ success: boolean }>('/api/library-files-update', payload, {
      Authorization: 'Bearer token',
    });

    expect(result.success).toBe(true);
    expect(fetchMock).toHaveBeenCalledWith('/api/library-files-update', expect.objectContaining({
      method: 'PATCH',
      body: JSON.stringify(payload),
      headers: expect.objectContaining({
        'Content-Type': 'application/json',
        Authorization: 'Bearer token',
      }),
    }));
  });

  it('apiDeleteJSON uses DELETE without body', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }));

    await apiDeleteJSON<{ success: boolean }>('/api/library-files-delete', {
      Authorization: 'Bearer token',
    });

    expect(fetchMock).toHaveBeenCalledWith('/api/library-files-delete', expect.objectContaining({
      method: 'DELETE',
      body: undefined,
      headers: expect.objectContaining({
        Authorization: 'Bearer token',
      }),
    }));
  });

  it('apiPostJSON throws response text on HTTP error', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('NOT_FOUND', { status: 404 }));

    await expect(apiPostJSON('/api/library-catalogs', { name: 'A' })).rejects.toThrow('NOT_FOUND');
  });

  it('arrayBufferToBase64 converts bytes correctly', () => {
    const bytes = new Uint8Array([65, 66, 67]); // ABC
    const base64 = arrayBufferToBase64(bytes.buffer);
    expect(base64).toBe('QUJD');
  });
});
