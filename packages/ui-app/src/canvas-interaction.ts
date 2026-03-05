import type { DXFRenderer } from '../../core-engine/src/render/renderer.js';
import type { InspectorPanelController } from './inspector-panel.js';

export function createCanvasInteractionController(input: {
  canvas: HTMLCanvasElement;
  renderer: DXFRenderer;
  inspectorPanel: InspectorPanelController;
  statusCoords: HTMLElement;
  updateStatusBar: () => void;
  getZoomPanning: () => boolean;
  getZoomPanStartX: () => number;
  getZoomPanStartY: () => number;
  getHoveredSheet: () => number;
  renderZoomSheet: (sheetIndex: number) => void;
  setZoomPanX: (value: number) => void;
  setZoomPanY: (value: number) => void;
  setZoomPanning: (value: boolean) => void;
}): void {
  const {
    canvas,
    renderer,
    inspectorPanel,
    statusCoords,
    updateStatusBar,
    getZoomPanning,
    getZoomPanStartX,
    getZoomPanStartY,
    getHoveredSheet,
    renderZoomSheet,
    setZoomPanX,
    setZoomPanY,
    setZoomPanning,
  } = input;

  let isPanning = false;
  let lastMouseX = 0;
  let lastMouseY = 0;

  canvas.addEventListener('wheel', (event) => {
    event.preventDefault();
    const factor = event.deltaY < 0 ? 1.15 : 1 / 1.15;
    const rect = canvas.getBoundingClientRect();
    renderer.camera.zoomAt(
      (event.clientX - rect.left) * devicePixelRatio,
      (event.clientY - rect.top) * devicePixelRatio,
      factor,
    );
    renderer.requestRedraw();
    updateStatusBar();
  }, { passive: false });

  canvas.addEventListener('mousedown', (event) => {
    if (event.button === 1 || (event.button === 0 && event.shiftKey)) {
      isPanning = true;
      lastMouseX = event.clientX;
      lastMouseY = event.clientY;
      canvas.style.cursor = 'grabbing';
    } else if (event.button === 0) {
      const rect = canvas.getBoundingClientRect();
      const sx = (event.clientX - rect.left) * devicePixelRatio;
      const sy = (event.clientY - rect.top) * devicePixelRatio;
      const idx = renderer.hitTestScreen(sx, sy);
      renderer.clearSelection();
      if (idx >= 0) {
        const entity = renderer.getEntity(idx);
        if (entity) {
          renderer.select(entity.entity.handle);
          inspectorPanel.showInspector(entity);
        }
      } else {
        inspectorPanel.clearInspector();
      }
    }
  });

  window.addEventListener('mousemove', (event) => {
    if (isPanning) {
      renderer.camera.panBy(
        (event.clientX - lastMouseX) * devicePixelRatio,
        (event.clientY - lastMouseY) * devicePixelRatio,
      );
      renderer.requestRedraw();
      lastMouseX = event.clientX;
      lastMouseY = event.clientY;
      updateStatusBar();
    }

    const rect = canvas.getBoundingClientRect();
    const sx = (event.clientX - rect.left) * devicePixelRatio;
    const sy = (event.clientY - rect.top) * devicePixelRatio;
    const world = renderer.camera.screenToWorld(sx, sy);
    statusCoords.textContent = `X: ${world.x.toFixed(2)}  Y: ${world.y.toFixed(2)}`;

    if (!isPanning) {
      const idx = renderer.hitTestScreen(sx, sy);
      renderer.setHovered(idx, sx, sy);
      canvas.style.cursor = idx >= 0 ? 'pointer' : 'default';
    }

    if (getZoomPanning()) {
      setZoomPanX(event.clientX - getZoomPanStartX());
      setZoomPanY(event.clientY - getZoomPanStartY());
      const hoveredSheet = getHoveredSheet();
      if (hoveredSheet >= 0) {
        renderZoomSheet(hoveredSheet);
      }
    }
  });

  window.addEventListener('mouseup', () => {
    isPanning = false;
    canvas.style.cursor = 'default';
    setZoomPanning(false);
  });
}
