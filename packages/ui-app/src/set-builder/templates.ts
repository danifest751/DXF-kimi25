import type { SetBuilderState } from './types.js';
import { loadedFiles } from '../state.js';

const TEMPLATES_STORAGE_KEY = 'dxf-set-templates';

export interface SetTemplate {
  id: string;
  name: string;
  createdAt: number;
  items: Array<{ stableKey: string; qty: number; enabled: boolean }>;
}

function getStableKey(sourceFileId: number): string | null {
  const lf = loadedFiles.find((f) => f.id === sourceFileId);
  if (!lf) return null;
  if (lf.remoteId) return lf.remoteId;
  return `name:${lf.name}`;
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
    if (!item || item.sourceFileId === undefined) continue;
    const stableKey = getStableKey(item.sourceFileId);
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
    if (item.sourceFileId === undefined) continue;
    const lf = loadedFiles.find((f) => f.id === item.sourceFileId);
    if (!lf) continue;
    const key = lf.remoteId ?? `name:${lf.name}`;
    keyMap.set(key, item.id);
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
