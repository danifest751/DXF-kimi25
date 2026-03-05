import { DXFRenderer } from '../../core-engine/src/render/renderer.js';
import type { LoadedFile } from './types.js';

interface ViewportSceneItem {
  readonly id: number;
  readonly fileId: number;
  x: number;
  y: number;
  readonly root: HTMLDivElement;
  readonly canvas: HTMLCanvasElement;
  readonly renderer: DXFRenderer;
}

export interface ViewportSceneController {
  addFileToScene(fileId: number, clientX?: number, clientY?: number): void;
  handleResize(): void;
  isDesktop(): boolean;
}

export function createViewportSceneController(input: {
  container: HTMLDivElement;
  files: LoadedFile[];
}): ViewportSceneController {
  const { container, files } = input;
  const sceneLayer = document.createElement('div');
  sceneLayer.className = 'viewport-scene-layer';
  container.appendChild(sceneLayer);

  let nextSceneItemId = 1;
  let nextSceneZ = 1;
  const sceneItems = new Map<number, ViewportSceneItem>();

  function isDesktop(): boolean {
    return window.innerWidth > 1024;
  }

  function bringToFront(item: ViewportSceneItem): void {
    item.root.style.zIndex = String(++nextSceneZ);
  }

  function setPosition(item: ViewportSceneItem, x: number, y: number): void {
    const maxX = Math.max(0, container.clientWidth - item.root.offsetWidth);
    const maxY = Math.max(0, container.clientHeight - item.root.offsetHeight);
    item.x = Math.min(Math.max(0, x), maxX);
    item.y = Math.min(Math.max(0, y), maxY);
    item.root.style.left = `${item.x}px`;
    item.root.style.top = `${item.y}px`;
  }

  function zoom(item: ViewportSceneItem, factor: number): void {
    const dpr = devicePixelRatio;
    const cx = (item.canvas.clientWidth * dpr) / 2;
    const cy = (item.canvas.clientHeight * dpr) / 2;
    item.renderer.camera.zoomAt(cx, cy, factor);
    item.renderer.requestRedraw();
  }

  function removeItem(item: ViewportSceneItem): void {
    item.renderer.detach();
    item.root.remove();
    sceneItems.delete(item.id);
  }

  function addFileToScene(fileId: number, clientX?: number, clientY?: number): void {
    if (!isDesktop()) return;
    const entry = files.find((file) => file.id === fileId);
    if (!entry || entry.loading || !entry.doc) return;

    const root = document.createElement('div');
    root.className = 'viewport-scene-item';
    root.innerHTML = `
      <div class="viewport-scene-item__header">
        <span class="viewport-scene-item__title"></span>
        <div class="viewport-scene-item__controls">
          <button type="button" class="viewport-scene-item__btn" data-act="zoom-out">−</button>
          <button type="button" class="viewport-scene-item__btn" data-act="zoom-in">+</button>
          <button type="button" class="viewport-scene-item__btn viewport-scene-item__btn--danger" data-act="remove">×</button>
        </div>
      </div>
      <div class="viewport-scene-item__body"><canvas></canvas></div>
    `;
    (root.querySelector('.viewport-scene-item__title') as HTMLSpanElement).textContent = entry.name;
    const canvas = root.querySelector('canvas') as HTMLCanvasElement;
    sceneLayer.appendChild(root);

    const item: ViewportSceneItem = {
      id: nextSceneItemId++,
      fileId,
      x: 0,
      y: 0,
      root,
      canvas,
      renderer: new DXFRenderer(),
    };
    sceneItems.set(item.id, item);
    bringToFront(item);

    if (typeof clientX === 'number' && typeof clientY === 'number') {
      const rect = container.getBoundingClientRect();
      const dropX = clientX - rect.left - root.offsetWidth / 2;
      const dropY = clientY - rect.top - 16;
      setPosition(item, dropX, dropY);
    } else {
      setPosition(item, 24 + (sceneItems.size - 1) * 18, 24 + (sceneItems.size - 1) * 18);
    }

    item.renderer.attach(canvas);
    item.renderer.setDocument(entry.doc);
    item.renderer.showDimensions = false;
    item.renderer.showPiercePoints = false;
    requestAnimationFrame(() => item.renderer.resizeToContainer());

    const header = root.querySelector('.viewport-scene-item__header') as HTMLDivElement;
    const controls = root.querySelector('.viewport-scene-item__controls') as HTMLDivElement;
    let dragging = false;
    let startX = 0;
    let startY = 0;
    let startLeft = 0;
    let startTop = 0;

    const onMove = (event: MouseEvent): void => {
      if (!dragging) return;
      setPosition(item, startLeft + (event.clientX - startX), startTop + (event.clientY - startY));
    };
    const onUp = (): void => {
      dragging = false;
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };

    header.addEventListener('mousedown', (event) => {
      if (event.button !== 0) return;
      event.preventDefault();
      event.stopPropagation();
      bringToFront(item);
      dragging = true;
      startX = event.clientX;
      startY = event.clientY;
      startLeft = item.x;
      startTop = item.y;
      window.addEventListener('mousemove', onMove);
      window.addEventListener('mouseup', onUp);
    });

    controls.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      const target = event.target as HTMLElement;
      const button = target.closest<HTMLButtonElement>('.viewport-scene-item__btn');
      if (!button) return;
      const act = button.dataset.act;
      if (act === 'zoom-in') zoom(item, 1.15);
      if (act === 'zoom-out') zoom(item, 1 / 1.15);
      if (act === 'remove') removeItem(item);
    });

    canvas.addEventListener('wheel', (event) => {
      event.preventDefault();
      event.stopPropagation();
      bringToFront(item);
      zoom(item, event.deltaY < 0 ? 1.15 : 1 / 1.15);
    }, { passive: false });

    root.addEventListener('mousedown', (event) => {
      event.stopPropagation();
      bringToFront(item);
    });
  }

  function handleResize(): void {
    sceneLayer.style.display = isDesktop() ? '' : 'none';
    for (const item of sceneItems.values()) {
      item.renderer.resizeToContainer();
      setPosition(item, item.x, item.y);
    }
  }

  handleResize();

  return {
    addFileToScene,
    handleResize,
    isDesktop,
  };
}
