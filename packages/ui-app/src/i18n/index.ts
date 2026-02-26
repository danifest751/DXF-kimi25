import { ru, type TranslationKey } from './locales/ru.js';
import { en } from './locales/en.js';

export type { TranslationKey };
export type Locale = 'ru' | 'en';

const STORAGE_KEY = 'dxf-locale';

const locales: Record<Locale, Record<TranslationKey, string>> = { ru, en };

let _locale: Locale = detectLocale();

function detectLocale(): Locale {
  const stored = localStorage.getItem(STORAGE_KEY) as Locale | null;
  if (stored && stored in locales) return stored;
  const nav = navigator.language.slice(0, 2).toLowerCase();
  return nav === 'ru' ? 'ru' : 'en';
}

/** Translate a key to the current locale string. */
export function t(key: TranslationKey): string {
  return locales[_locale][key] ?? locales['ru'][key] ?? key;
}

/** Get active locale. */
export function getLocale(): Locale {
  return _locale;
}

/** Switch locale and persist, then re-apply to DOM. */
export function setLocale(locale: Locale): void {
  _locale = locale;
  localStorage.setItem(STORAGE_KEY, locale);
  applyLocale();
}

/**
 * Walk the DOM and replace textContent / title / placeholder
 * for elements with data-i18n attributes.
 *
 * data-i18n="key"            → sets textContent
 * data-i18n-title="key"      → sets title attribute
 * data-i18n-placeholder="key"→ sets placeholder attribute
 */
export function applyLocale(): void {
  document.documentElement.lang = _locale;

  for (const el of document.querySelectorAll<HTMLElement>('[data-i18n]')) {
    const key = el.dataset.i18n as TranslationKey;
    if (key) el.textContent = t(key);
  }

  for (const el of document.querySelectorAll<HTMLElement>('[data-i18n-title]')) {
    const key = el.dataset.i18nTitle as TranslationKey;
    if (key) el.title = t(key);
  }

  for (const el of document.querySelectorAll<HTMLInputElement>('[data-i18n-placeholder]')) {
    const key = el.dataset.i18nPlaceholder as TranslationKey;
    if (key) el.placeholder = t(key);
  }

  // Update language toggle button label if present
  const btn = document.getElementById('btn-lang-toggle');
  if (btn) btn.textContent = _locale === 'ru' ? 'EN' : 'RU';
}
