import { t } from '../i18n/index.js';
import type { LibraryItem, SetBuilderState } from './types.js';

export function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function fmtLen(mm: number): string {
  return mm >= 1000 ? `${(mm / 1000).toFixed(2)}${t('unit.m')}` : `${mm.toFixed(0)}${t('unit.mm')}`;
}

export function sortMark(state: SetBuilderState, key: 'name' | 'area' | 'pierces' | 'cutLen'): string {
  if (state.sortBy !== key) return '';
  return state.sortDir === 'asc' ? ' ↑' : ' ↓';
}

export function statusLabel(item: LibraryItem): string {
  return item.status === 'ok'
    ? t('setBuilder.status.ok')
    : item.status === 'warn'
      ? t('setBuilder.status.warn')
      : t('setBuilder.status.error');
}

export function thumbSvg(_item: LibraryItem, large = false): string {
  const w = large ? 220 : 84;
  const h = large ? 140 : 56;
  const iconW = large ? 52 : 30;
  const iconH = large ? 62 : 36;
  const iconX = Math.round((w - iconW) / 2);
  const iconY = Math.round((h - iconH) / 2);
  const fold = Math.round(iconW * 0.26);
  return `
    <svg viewBox="0 0 ${w} ${h}" class="sb-thumb-svg" role="img" aria-label="DXF">
      <rect x="4" y="4" width="${w - 8}" height="${h - 8}" rx="7" fill="rgba(12,20,35,0.45)" stroke="rgba(255,255,255,0.12)"/>
      <path d="M${iconX} ${iconY + 2} h${iconW - fold} l${fold} ${fold} v${iconH - fold - 2} a4 4 0 0 1 -4 4 h-${iconW - 4} a4 4 0 0 1 -4 -4 v-${iconH - 2} a4 4 0 0 1 4 -4 z" fill="rgba(20,36,62,0.95)" stroke="rgba(126,198,255,0.8)"/>
      <path d="M${iconX + iconW - fold} ${iconY + 2} v${fold} h${fold}" fill="none" stroke="rgba(126,198,255,0.8)"/>
      <text x="${Math.round(w / 2)}" y="${iconY + iconH - 8}" text-anchor="middle" font-size="${large ? 14 : 9}" font-family="'Segoe UI', sans-serif" font-weight="700" fill="rgba(126,198,255,0.95)">DXF</text>
    </svg>
  `;
}
