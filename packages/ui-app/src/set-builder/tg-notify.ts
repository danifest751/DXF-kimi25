import { apiPostJSON } from '../api.js';
import { authSessionToken } from '../state.js';

const NOTIFY_STORAGE_KEY = 'dxf-tg-notify-enabled';

export interface TgNotifySettings {
  enabled: boolean;
}

export function loadNotifySettings(): TgNotifySettings {
  try {
    const raw = localStorage.getItem(NOTIFY_STORAGE_KEY);
    if (!raw) return { enabled: false };
    return JSON.parse(raw) as TgNotifySettings;
  } catch {
    return { enabled: false };
  }
}

export function saveNotifySettings(settings: TgNotifySettings): void {
  localStorage.setItem(NOTIFY_STORAGE_KEY, JSON.stringify(settings));
}

export async function sendNestingDoneNotification(params: {
  sheetsCount: number;
  partsCount: number;
  avgUtilization: number;
}): Promise<void> {
  const settings = loadNotifySettings();
  if (!settings.enabled) return;
  const token = authSessionToken;
  if (!token) return;
  try {
    await apiPostJSON('/api/notify', {
      event: 'nesting_done',
      sheetsCount: params.sheetsCount,
      partsCount: params.partsCount,
      avgUtilization: params.avgUtilization,
    }, { Authorization: `Bearer ${token}` });
  } catch {
    // Notifications are non-critical — silently ignore errors
  }
}

export async function sendFileUploadedNotification(filename: string): Promise<void> {
  const settings = loadNotifySettings();
  if (!settings.enabled) return;
  const token = authSessionToken;
  if (!token) return;
  try {
    await apiPostJSON('/api/notify', {
      event: 'file_uploaded',
      filename,
    }, { Authorization: `Bearer ${token}` });
  } catch {
    // Non-critical
  }
}
