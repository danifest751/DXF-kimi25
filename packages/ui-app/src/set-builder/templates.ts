import type { SetBuilderState } from './types.js';
import { loadedFiles } from '../state.js';

const TEMPLATES_STORAGE_KEY = 'dxf-set-templates';

export interface SetTemplate {
  id: string;
  name: string;
  createdAt: number;
  items: Array<{ stableKey: string; qty: number; enabled: boolean }>;
}

function getStableKeyFromLibraryItem(item: import('./types.js').LibraryItem): string | null {
  // prefer remoteId (stable across sessions), fallback to name
  if (item.remoteId) return item.remoteId;
  if (item.name) return `name:${item.name}`;
  // last resort: try via loadedFiles
  if (item.sourceFileId !== undefined) {
    const lf = loadedFiles.find((f) => f.id === item.sourceFileId);
    if (lf) return lf.remoteId ?? `name:${lf.name}`;
  }
  return null;
}

export function loadTemplates(): SetTemplate[] {
  try {
    const raw = localStorage.getItem(TEMPLATES_STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as SetTemplate[];
  } catch {
    return [];
  }
}

function saveTemplates(templates: SetTemplate[]): void {
  localStorage.setItem(TEMPLATES_STORAGE_KEY, JSON.stringify(templates));
}

export function saveSetAsTemplate(state: SetBuilderState, name: string): SetTemplate | null {
  if (state.set.size === 0) return null;
  const items: SetTemplate['items'] = [];
  for (const s of state.set.values()) {
    const item = state.library.find((it) => it.id === s.libraryId);
    if (!item) continue;
    const stableKey = getStableKeyFromLibraryItem(item);
    if (!stableKey) continue;
    items.push({ stableKey, qty: s.qty, enabled: s.enabled });
  }
  if (items.length === 0) return null;
  const template: SetTemplate = {
    id: `tpl_${Date.now()}`,
    name: name.trim() || `Шаблон ${new Date().toLocaleDateString()}`,
    createdAt: Date.now(),
    items,
  };
  const templates = loadTemplates();
  templates.unshift(template);
  saveTemplates(templates);
  return template;
}

export function applyTemplate(state: SetBuilderState, templateId: string): boolean {
  const templates = loadTemplates();
  const tpl = templates.find((t) => t.id === templateId);
  if (!tpl) return false;

  const keyMap = new Map<string, number>();
  for (const item of state.library) {
    // prefer remoteId, fallback to name-based key (matches how saveSetAsTemplate builds stableKey)
    if (item.remoteId) {
      keyMap.set(item.remoteId, item.id);
    } else {
      keyMap.set(`name:${item.name}`, item.id);
    }
    // also try via loadedFiles for extra coverage when available
    if (item.sourceFileId !== undefined) {
      const lf = loadedFiles.find((f) => f.id === item.sourceFileId);
      if (lf) {
        const lfKey = lf.remoteId ?? `name:${lf.name}`;
        if (!keyMap.has(lfKey)) keyMap.set(lfKey, item.id);
      }
    }
  }

  let applied = 0;
  for (const row of tpl.items) {
    const libraryId = keyMap.get(row.stableKey);
    if (libraryId === undefined) continue;
    state.set.set(libraryId, { libraryId, qty: row.qty, enabled: row.enabled });
    applied++;
  }
  return applied > 0;
}

export function deleteTemplate(templateId: string): void {
  const templates = loadTemplates().filter((t) => t.id !== templateId);
  saveTemplates(templates);
}
