/**
 * @module api
 * HTTP helpers for communicating with the DXF Viewer API.
 */

const API_BASE = (import.meta.env.VITE_API_BASE as string | undefined) ?? '';

function withCredentials(init: RequestInit): RequestInit {
  return {
    credentials: 'include',
    ...init,
  };
}

export class ApiError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message);
    this.name = 'ApiError';
  }
}

async function apiRequestJSON<T>(
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
  path: string,
  payload?: unknown,
  headers: Record<string, string> = {},
): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, withCredentials({
    method,
    headers: {
      ...(payload === undefined ? {} : { 'Content-Type': 'application/json' }),
      ...headers,
    },
    body: payload === undefined ? undefined : JSON.stringify(payload),
  }));
  if (!response.ok) {
    const text = await response.text();
    throw new ApiError(response.status, text || `HTTP ${response.status}`);
  }
  return response.json() as Promise<T>;
}

export async function apiPostJSON<T>(path: string, payload: unknown, headers: Record<string, string> = {}): Promise<T> {
  return apiRequestJSON<T>('POST', path, payload, headers);
}

export async function apiGetJSON<T>(path: string, headers: Record<string, string> = {}): Promise<T> {
  return apiRequestJSON<T>('GET', path, undefined, headers);
}

export async function apiPatchJSON<T>(path: string, payload: unknown, headers: Record<string, string> = {}): Promise<T> {
  return apiRequestJSON<T>('PATCH', path, payload, headers);
}

export async function apiDeleteJSON<T>(path: string, headers: Record<string, string> = {}): Promise<T> {
  return apiRequestJSON<T>('DELETE', path, undefined, headers);
}

export async function apiPostBlob(path: string, payload: unknown): Promise<Blob> {
  const response = await fetch(`${API_BASE}${path}`, withCredentials({
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  }));
  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `HTTP ${response.status}`);
  }
  return response.blob();
}

export async function apiUploadFormDataJSON<T>(path: string, formData: FormData, headers: Record<string, string> = {}): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, withCredentials({
    method: 'POST',
    headers,
    body: formData,
  }));
  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `HTTP ${response.status}`);
  }
  return response.json() as Promise<T>;
}

export async function apiUploadArrayBuffer<T>(
  path: string,
  buffer: ArrayBuffer,
  contentType: string,
  headers: Record<string, string> = {},
): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, withCredentials({
    method: 'PUT',
    headers: {
      'Content-Type': contentType,
      ...headers,
    },
    body: buffer,
  }));
  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `HTTP ${response.status}`);
  }
  return response.json() as Promise<T>;
}

export async function apiUploadArrayBufferToSignedUrl(uploadUrl: string, buffer: ArrayBuffer, contentType: string): Promise<void> {
  const response = await fetch(uploadUrl, {
    method: 'PUT',
    headers: {
      'cache-control': 'max-age=3600',
      'content-type': contentType,
      'x-upsert': 'false',
    },
    body: buffer,
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `HTTP ${response.status}`);
  }
}

export function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  const chunkSize = 0x8000;
  let binary = '';

  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode(...chunk);
  }

  return btoa(binary);
}

export function downloadBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
