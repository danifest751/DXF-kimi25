import { loadedFiles } from '../state.js';
import { renderEntity } from '../../../core-engine/src/render/entity-renderer.js';
import type { EntityRenderOptions } from '../../../core-engine/src/render/entity-renderer.js';
import type { SetBuilderState } from './types.js';

export interface ModalCanvasState {
  zoom: number;
  panX: number;
  panY: number;
  baseScale: number;
  cx: number;
  cy: number;
  canvasW: number;
  canvasH: number;
  interactionAttached: boolean;
}

export function createModalCanvasState(): ModalCanvasState {
  return { zoom: 1, panX: 0, panY: 0, baseScale: 1, cx: 0, cy: 0, canvasW: 0, canvasH: 0, interactionAttached: false };
}

export function resetModalCanvasState(cs: ModalCanvasState): void {
  cs.zoom = 1;
  cs.panX = 0;
  cs.panY = 0;
  cs.interactionAttached = false;
}

export function drawModalCanvas(
  ctx: CanvasRenderingContext2D,
  lf: typeof loadedFiles[number],
  cs: ModalCanvasState,
  appState: SetBuilderState,
  cw: number,
  ch: number,
): void {
  ctx.clearRect(0, 0, cw, ch);
  ctx.fillStyle = 'rgba(7, 11, 18, 0.85)';
  ctx.fillRect(0, 0, cw, ch);

  const totalScale = cs.baseScale * cs.zoom;
  const pixelSize = 1 / totalScale;
  const opts: EntityRenderOptions = {
    arcSegments: 32,
    splineSegments: 32,
    ellipseSegments: 32,
    pixelSize,
    viewExtent: Math.max(
      (lf.doc.totalBBox?.max.x ?? 0) - (lf.doc.totalBBox?.min.x ?? 0),
      (lf.doc.totalBBox?.max.y ?? 0) - (lf.doc.totalBBox?.min.y ?? 0),
    ) * 2,
  };

  ctx.save();
  ctx.translate(cw / 2 + cs.panX, ch / 2 + cs.panY);
  ctx.scale(totalScale, -totalScale);
  ctx.translate(-cs.cx, -cs.cy);
  for (const fe of lf.doc.flatEntities) {
    renderEntity(ctx, fe, opts);
  }
  ctx.restore();

  if (appState.previewShowPierces && lf.stats.chains.length > 0) {
    const dotR = Math.max(2, Math.min(10, totalScale * 1.5));
    ctx.save();
    ctx.translate(cw / 2 + cs.panX, ch / 2 + cs.panY);
    ctx.scale(totalScale, -totalScale);
    ctx.translate(-cs.cx, -cs.cy);

    for (const chain of lf.stats.chains) {
      const p = chain.piercePoint;
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.scale(1 / totalScale, -1 / totalScale);

      ctx.beginPath();
      ctx.arc(0, 0, dotR + 2, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(0, 255, 157, 0.25)';
      ctx.fill();

      ctx.beginPath();
      ctx.arc(0, 0, dotR, 0, Math.PI * 2);
      ctx.fillStyle = '#00ff9d';
      ctx.shadowColor = '#00ff9d';
      ctx.shadowBlur = 8;
      ctx.fill();
      ctx.shadowBlur = 0;

      ctx.restore();
    }
    ctx.restore();
  }
}

export function setupModalCanvasInteraction(
  canvas: HTMLCanvasElement,
  lf: typeof loadedFiles[number],
  cs: ModalCanvasState,
  appState: SetBuilderState,
): void {
  if (cs.interactionAttached) return;
  cs.interactionAttached = true;

  let dragging = false;
  let dragStartX = 0;
  let dragStartY = 0;
  let dragStartPanX = 0;
  let dragStartPanY = 0;

  function redraw(): void {
    const ctx = canvas.getContext('2d');
    if (ctx) drawModalCanvas(ctx, lf, cs, appState, canvas.width, canvas.height);
  }

  canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;

    const factor = e.deltaY < 0 ? 1.12 : 1 / 1.12;
    const newZoom = Math.max(0.05, Math.min(200, cs.zoom * factor));

    const ocx = mx - canvas.width / 2;
    const ocy = my - canvas.height / 2;
    const ratio = newZoom / cs.zoom;
    cs.panX = ocx - ratio * (ocx - cs.panX);
    cs.panY = ocy - ratio * (ocy - cs.panY);
    cs.zoom = newZoom;
    redraw();
  }, { passive: false });

  canvas.addEventListener('mousedown', (e) => {
    if (e.button !== 0) return;
    dragging = true;
    dragStartX = e.clientX;
    dragStartY = e.clientY;
    dragStartPanX = cs.panX;
    dragStartPanY = cs.panY;
    canvas.style.cursor = 'grabbing';
  });

  window.addEventListener('mousemove', (e) => {
    if (!dragging) return;
    cs.panX = dragStartPanX + e.clientX - dragStartX;
    cs.panY = dragStartPanY + e.clientY - dragStartY;
    redraw();
  });

  window.addEventListener('mouseup', () => {
    if (!dragging) return;
    dragging = false;
    canvas.style.cursor = 'grab';
  });

  canvas.addEventListener('dblclick', () => {
    cs.zoom = 1;
    cs.panX = 0;
    cs.panY = 0;
    redraw();
  });

  canvas.style.cursor = 'grab';
}

export function applyModalPierceCanvas(
  root: HTMLDivElement,
  cs: ModalCanvasState,
  appState: SetBuilderState,
): void {
  const canvas = root.querySelector<HTMLCanvasElement>('#sb-modal-dxf-canvas');
  if (!canvas) return;
  const sourceFileId = Number(canvas.dataset.sourceId);
  if (!Number.isFinite(sourceFileId) || sourceFileId <= 0) return;

  const lf = loadedFiles.find((f) => f.id === sourceFileId);
  if (!lf || lf.loading || !lf.doc) return;

  const bb = lf.doc.totalBBox;
  const bbW = bb ? Math.max(1e-6, bb.max.x - bb.min.x) : 0;
  const bbH = bb ? Math.max(1e-6, bb.max.y - bb.min.y) : 0;
  if (bbW <= 0 || bbH <= 0) return;

  const container = canvas.parentElement;
  const cw = container ? Math.max(100, container.clientWidth) : 760;
  const ch = container ? Math.max(100, container.clientHeight) : 460;
  canvas.width = cw;
  canvas.height = ch;

  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const pad = Math.max(4, Math.round(Math.min(cw, ch) * 0.06));
  const availW = Math.max(1, cw - pad * 2);
  const availH = Math.max(1, ch - pad * 2);
  cs.baseScale = Math.max(1e-6, Math.min(availW / bbW, availH / bbH));
  cs.cx = bb!.min.x + bbW / 2;
  cs.cy = bb!.min.y + bbH / 2;
  cs.canvasW = cw;
  cs.canvasH = ch;

  drawModalCanvas(ctx, lf, cs, appState, cw, ch);
  setupModalCanvasInteraction(canvas, lf, cs, appState);
}
