/**
 * @module thumb-queue
 * Управление очередью рендера DXF-миниатюр.
 * Обрабатывает слоты по одному через setTimeout-цепочку,
 * уступая браузеру управление между рендерами.
 */

import { loadedFiles } from '../state.js';
import { renderDxfThumbDataUrl } from './render.js';

export interface ThumbQueueController {
  stop(): void;
  schedule(): void;
}

export function createThumbQueueController(input: {
  root: HTMLDivElement;
  dxfThumbCache: Map<string, string>;
  isOpen: () => boolean;
}): ThumbQueueController {
  const { root, dxfThumbCache, isOpen } = input;

  let token = 0;
  let timer: ReturnType<typeof setTimeout> | null = null;

  function stop(): void {
    token++;
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
  }

  function replaceSlot(slot: HTMLElement, dataUrl: string, alt: string, imgClass: string): void {
    const img = document.createElement('img');
    img.className = imgClass;
    img.src = dataUrl;
    img.alt = alt;
    img.loading = 'lazy';
    slot.replaceChildren(img);
    slot.dataset.thumbReady = 'true';
  }

  async function processQueue(capturedToken: number): Promise<void> {
    if (capturedToken !== token || !isOpen()) return;
    const slots = Array.from(root.querySelectorAll<HTMLElement>(
      '[data-thumb-slot="true"][data-thumb-ready="false"]',
    ));
    if (slots.length === 0) return;

    let processed = 0;
    for (const slot of slots) {
      if (capturedToken !== token || !slot.isConnected) return;

      const sourceId = Number(slot.dataset.sourceId ?? '0');
      const width    = Number(slot.dataset.thumbWidth  ?? '0');
      const height   = Number(slot.dataset.thumbHeight ?? '0');
      const angleDeg = Number(slot.dataset.thumbAngle  ?? '0');
      const padPx    = Number(slot.dataset.thumbPad    ?? '0');
      const alt      = slot.dataset.thumbAlt      ?? '';
      const imgClass = slot.dataset.thumbImgClass ?? 'sb-thumb-real';

      if (!Number.isFinite(sourceId) || sourceId <= 0 || !Number.isFinite(width) || !Number.isFinite(height)) {
        slot.dataset.thumbReady = 'true';
        continue;
      }

      const sourceExists = loadedFiles.some((f) => f.id === sourceId);
      if (!sourceExists) {
        slot.dataset.thumbReady = 'error';
        continue;
      }

      const dataUrl = renderDxfThumbDataUrl(sourceId, width, height, angleDeg, dxfThumbCache, padPx);
      if (!dataUrl) {
        slot.dataset.thumbReady = 'error';
        continue;
      }

      replaceSlot(slot, dataUrl, alt, imgClass);
      processed++;
      if (processed >= 1) break;
    }

    if (capturedToken !== token || !isOpen()) return;
    if (!root.querySelector('[data-thumb-slot="true"][data-thumb-ready="false"]')) return;
    timer = setTimeout(() => {
      timer = null;
      void processQueue(capturedToken);
    }, 0);
  }

  function schedule(): void {
    stop();
    if (!isOpen()) return;
    const capturedToken = token;
    timer = setTimeout(() => {
      timer = null;
      void processQueue(capturedToken);
    }, 0);
  }

  return { stop, schedule };
}
