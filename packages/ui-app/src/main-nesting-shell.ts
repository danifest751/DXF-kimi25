import type { MobileUiController } from './mobile-ui.js';
import { initNestingControls } from './nesting-controls.js';
import { initNestingZoomUi } from './nesting-zoom-ui.js';

export function initMainNestingShell(input: {
  container: HTMLDivElement;
  nestingScroll: HTMLDivElement;
  nestZoomCanvas: HTMLCanvasElement;
  nestZoomPopup: HTMLDivElement;
  btnNesting: HTMLButtonElement;
  nestingPanel: HTMLDivElement;
  nestPreset: HTMLSelectElement;
  nestCustomRow: HTMLDivElement;
  nestRotateEnabled: HTMLInputElement;
  nestRotateStep: HTMLSelectElement;
  nestModeRadios: NodeListOf<HTMLInputElement>;
  btnAdvancedToggle: HTMLButtonElement;
  nestAdvanced: HTMLDivElement;
  nestCommonLineEnabled: HTMLInputElement;
  btnNestRun: HTMLButtonElement;
  nestClose: HTMLButtonElement;
  mobileUi: MobileUiController;
  updateNestItems: () => void;
  updateNestingButtonState: () => void;
  autoRerunNesting: () => void;
  runNesting: () => Promise<void>;
  exitNestingMode: () => void;
  getNestModeValue: () => string;
  setNestModeValue: (value: 'precise' | 'common') => void;
  onResizeRenderer: () => void;
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
    btnNesting,
    nestingPanel,
    nestPreset,
    nestCustomRow,
    nestRotateEnabled,
    nestRotateStep,
    nestModeRadios,
    btnAdvancedToggle,
    nestAdvanced,
    nestCommonLineEnabled,
    btnNestRun,
    nestClose,
    mobileUi,
    updateNestItems,
    updateNestingButtonState,
    autoRerunNesting,
    runNesting,
    exitNestingMode,
    getNestModeValue,
    setNestModeValue,
    onResizeRenderer,
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

  initNestingControls({
    btnNesting,
    nestingPanel,
    nestPreset,
    nestCustomRow,
    nestRotateEnabled,
    nestRotateStep,
    nestModeRadios,
    btnAdvancedToggle,
    nestAdvanced,
    nestCommonLineEnabled,
    btnNestRun,
    nestClose,
    mobileUi,
    updateNestItems,
    updateNestingButtonState,
    autoRerunNesting,
    runNesting,
    exitNestingMode,
    getNestModeValue,
    setNestModeValue,
    onResizeRenderer,
  });

  initNestingZoomUi({
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
  });
}
