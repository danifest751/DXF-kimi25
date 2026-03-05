import type { FlattenedEntity } from '../../core-engine/src/normalize/index.js';
import type { Color } from '../../core-engine/src/types/index.js';
import type { DXFRenderer } from '../../core-engine/src/render/renderer.js';

export interface InspectorPanelController {
  clearInspector(): void;
  showInspector(entity: FlattenedEntity): void;
}

export function createInspectorPanelController(input: {
  inspectorContent: HTMLDivElement;
  renderer: DXFRenderer;
  sidebarInspector: HTMLDivElement;
}): InspectorPanelController {
  const { inspectorContent, renderer, sidebarInspector } = input;

  function escHtml(value: string): string {
    return value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function colorStr(color: Color): string {
    return `rgb(${color.r}, ${color.g}, ${color.b})`;
  }

  function showInspector(entity: FlattenedEntity): void {
    sidebarInspector.classList.remove('hidden');
    const source = entity.entity;
    const row = (label: string, value: string) =>
      `<div class="prop-row"><span class="prop-label">${escHtml(label)}</span><span class="prop-value">${escHtml(value)}</span></div>`;
    let html = '';
    html += row('Тип', source.type);
    html += row('Handle', source.handle);
    html += row('Слой', source.layer);
    html += row('Цвет', colorStr(entity.effectiveColor));
    html += row('Тип линии', entity.effectiveLineType);
    if ('start' in source && 'end' in source) {
      const start = source.start as { x: number; y: number };
      const end = source.end as { x: number; y: number };
      html += row('Начало', `${start.x.toFixed(2)}, ${start.y.toFixed(2)}`);
      html += row('Конец', `${end.x.toFixed(2)}, ${end.y.toFixed(2)}`);
    }
    if ('center' in source && 'radius' in source) {
      const center = source.center as { x: number; y: number };
      html += row('Центр', `${center.x.toFixed(2)}, ${center.y.toFixed(2)}`);
      html += row('Радиус', (source as { radius: number }).radius.toFixed(3));
    }
    inspectorContent.innerHTML = html;
    renderer.resizeToContainer();
  }

  function clearInspector(): void {
    inspectorContent.innerHTML = '<p style="color: var(--text-muted); font-size: 12px;">Кликните на объект</p>';
  }

  return {
    clearInspector,
    showInspector,
  };
}
