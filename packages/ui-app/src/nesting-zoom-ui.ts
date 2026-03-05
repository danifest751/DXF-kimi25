export function initNestingZoomUi(input: {
  container: HTMLDivElement;
  nestingScroll: HTMLDivElement;
  nestZoomCanvas: HTMLCanvasElement;
  nestZoomPopup: HTMLDivElement;
  isNestingMode: () => boolean;
  getCurrentNestResult: () => unknown;
  getNestCellRects: () => Array<{ x: number; y: number; w: number; h: number; si: number }>;
  getHoveredSheet: () => number;
  setHoveredSheet: (value: number) => void;
  getZoomLevel: () => number;
  getZoomPanX: () => number;
  getZoomPanY: () => number;
  getZoomHideTimer: () => ReturnType<typeof setTimeout> | null;
  isZoomPopupLocked: () => boolean;
  renderAllNestingSheets: () => void;
  applyZoomWheel: (deltaY: number) => void;
  renderZoomSheet: (sheetIndex: number) => void;
  showZoomPopup: (sheetIndex: number, clientX: number, clientY: number) => void;
  hideZoomPopup: () => void;
  scheduleHideZoomPopup: () => void;
  positionPopup: (clientX: number, clientY: number) => void;
  setZoomLevel: (value: number) => void;
  setZoomPanX: (value: number) => void;
  setZoomPanY: (value: number) => void;
  setZoomPopupLocked: (value: boolean) => void;
  setZoomPanning: (value: boolean) => void;
  setZoomPanStartX: (value: number) => void;
  setZoomPanStartY: (value: number) => void;
  setZoomHideTimer: (value: ReturnType<typeof setTimeout> | null) => void;
}): void {
  const {
    container,
    nestingScroll,
    nestZoomCanvas,
    nestZoomPopup,
    isNestingMode,
    getCurrentNestResult,
    getNestCellRects,
    getHoveredSheet,
    setHoveredSheet,
    getZoomLevel,
    getZoomPanX,
    getZoomPanY,
    getZoomHideTimer,
    isZoomPopupLocked,
    renderAllNestingSheets,
    applyZoomWheel,
    renderZoomSheet,
    showZoomPopup,
    hideZoomPopup,
    scheduleHideZoomPopup,
    positionPopup,
    setZoomLevel,
    setZoomPanX,
    setZoomPanY,
    setZoomPopupLocked,
    setZoomPanning,
    setZoomPanStartX,
    setZoomPanStartY,
    setZoomHideTimer,
  } = input;

  new ResizeObserver(() => {
    if (isNestingMode()) renderAllNestingSheets();
  }).observe(container);

  nestingScroll.addEventListener('wheel', (event) => {
    if (getHoveredSheet() < 0 && !nestZoomPopup.classList.contains('visible')) return;
    event.preventDefault();
    applyZoomWheel(event.deltaY);
  }, { passive: false });

  nestZoomCanvas.addEventListener('wheel', (event) => {
    event.preventDefault();
    event.stopPropagation();
    const hoveredSheet = getHoveredSheet();
    if (hoveredSheet < 0) return;
    const rect = nestZoomCanvas.getBoundingClientRect();
    const mx = event.clientX - rect.left;
    const my = event.clientY - rect.top;
    const oldZoom = getZoomLevel();
    const factor = event.deltaY < 0 ? 1.15 : 1 / 1.15;
    const newZoom = Math.max(0.5, Math.min(20, oldZoom * factor));
    setZoomLevel(newZoom);
    const ratio = newZoom / oldZoom;
    setZoomPanX(mx - (mx - getZoomPanX()) * ratio);
    setZoomPanY(my - (my - getZoomPanY()) * ratio);
    setZoomPopupLocked(true);
    renderZoomSheet(hoveredSheet);
  }, { passive: false });

  nestZoomCanvas.addEventListener('mousedown', (event) => {
    if (event.button !== 0) return;
    setZoomPanning(true);
    setZoomPanStartX(event.clientX - getZoomPanX());
    setZoomPanStartY(event.clientY - getZoomPanY());
    setZoomPopupLocked(true);
  });

  nestZoomPopup.addEventListener('mouseenter', () => {
    const hideTimer = getZoomHideTimer();
    if (hideTimer) {
      clearTimeout(hideTimer);
      setZoomHideTimer(null);
    }
    setZoomPopupLocked(true);
  });

  nestZoomPopup.addEventListener('mouseleave', () => {
    setZoomPopupLocked(false);
    setZoomPanning(false);
    hideZoomPopup();
  });

  nestZoomCanvas.addEventListener('dblclick', () => {
    setZoomLevel(1);
    setZoomPanX(0);
    setZoomPanY(0);
    const hoveredSheet = getHoveredSheet();
    if (hoveredSheet >= 0) {
      renderZoomSheet(hoveredSheet);
    }
  });

  nestingScroll.addEventListener('mousemove', (event) => {
    if (!getCurrentNestResult() || getNestCellRects().length === 0) {
      setZoomPopupLocked(false);
      scheduleHideZoomPopup();
      return;
    }

    const rect = nestingScroll.getBoundingClientRect();
    const mx = event.clientX - rect.left + nestingScroll.scrollLeft;
    const my = event.clientY - rect.top + nestingScroll.scrollTop;

    let found = -1;
    for (const cell of getNestCellRects()) {
      if (mx >= cell.x && mx <= cell.x + cell.w && my >= cell.y && my <= cell.y + cell.h) {
        found = cell.si;
        break;
      }
    }

    if (found >= 0) {
      const hideTimer = getZoomHideTimer();
      if (hideTimer) {
        clearTimeout(hideTimer);
        setZoomHideTimer(null);
      }
      if (getHoveredSheet() !== found) {
        setZoomPopupLocked(false);
        setHoveredSheet(found);
        showZoomPopup(found, event.clientX, event.clientY);
      } else if (!isZoomPopupLocked()) {
        positionPopup(event.clientX, event.clientY);
      }
    } else if (!isZoomPopupLocked()) {
      scheduleHideZoomPopup();
    }
  });

  nestingScroll.addEventListener('mouseleave', () => {
    if (!isZoomPopupLocked()) scheduleHideZoomPopup();
  });
}
