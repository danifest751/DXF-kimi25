/**
 * @module main
 * Точка входа приложения DXF Viewer.
 * Set-builder — основной интерфейс. Legacy UI удалён.
 */

import './styles/base.css';
import './styles/themes.css';
import './styles/set-builder.css';
import './styles/animations.css';
import './styles/responsive.css';

import { initSentry } from './sentry.js';
import { restoreAuthSession, runTMAAutoLogin } from './auth.js';
import { initSetBuilder } from './set-builder/index.js';
import { setBuilderRoot, btnSetBuilder } from './ui-shell.js';
import { getSettings } from './store/index.js';

async function clearLegacyOfflineCache(): Promise<void> {
  if ('serviceWorker' in navigator) {
    try {
      const registrations = await navigator.serviceWorker.getRegistrations();
      await Promise.all(registrations.map((registration) => registration.unregister()));
    } catch {
      // ignore
    }
  }

  if ('caches' in window) {
    try {
      const keys = await caches.keys();
      await Promise.all(keys.map((key) => caches.delete(key)));
    } catch {
      // ignore
    }
  }
}

initSentry();

// ─── Theme initialization ─────────────────────────────────────────────

function applyTheme(theme: string): void {
  // Remove all theme classes
  document.documentElement.classList.remove('theme-dark', 'theme-light', 'theme-sepia', 'theme-blue');
  // Apply new theme class
  const validThemes = ['dark', 'light', 'sepia', 'blue'];
  const themeClass = validThemes.includes(theme) ? `theme-${theme}` : 'theme-dark';
  document.documentElement.classList.add(themeClass);
}

async function initTheme(): Promise<void> {
  try {
    const settings = await getSettings();
    applyTheme(settings.theme ?? 'dark');
  } catch {
    // Fallback to dark theme on error
    applyTheme('dark');
  }
}

// Apply theme early, before render
void initTheme();

// ─── Boot ─────────────────────────────────────────────────────────────

void clearLegacyOfflineCache();

initSetBuilder(setBuilderRoot, btnSetBuilder);

// If opened as Telegram Mini App — auto-login via initData, else restore stored session
void runTMAAutoLogin().then((isTMA) => {
  if (!isTMA) void restoreAuthSession();
});
