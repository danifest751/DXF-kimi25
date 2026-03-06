import type { MobileUiController } from './mobile-ui.js';

export function initToolbarViewActions(input: {
  btnOpen: HTMLButtonElement;
  btnWelcomeOpen: HTMLButtonElement;
  btnAddFiles: HTMLButtonElement;
  btnFit: HTMLButtonElement;
  btnInspector: HTMLButtonElement;
  btnGrid: HTMLButtonElement;
  chkPierces: HTMLInputElement;
  pierceToggle: HTMLLabelElement;
  chkDimensions: HTMLInputElement;
  dimToggle: HTMLLabelElement;
  sidebarInspector: HTMLDivElement;
  renderer: import('../../core-engine/src/render/renderer.js').DXFRenderer;
  mobileUi: MobileUiController;
  updateStatusBar: () => void;
  openFileDialog: () => void;
  toggleGrid: () => void;
}): void {
  const {
    btnOpen,
    btnWelcomeOpen,
    btnAddFiles,
    btnFit,
    btnInspector,
    btnGrid,
    chkPierces,
    pierceToggle,
    chkDimensions,
    dimToggle,
    sidebarInspector,
    renderer,
    mobileUi,
    updateStatusBar,
    openFileDialog,
    toggleGrid,
  } = input;

  btnOpen.addEventListener('click', openFileDialog);
  btnWelcomeOpen.addEventListener('click', openFileDialog);
  btnAddFiles.addEventListener('click', openFileDialog);

  btnFit.addEventListener('click', () => {
    renderer.zoomToFit();
    updateStatusBar();
  });

  btnInspector.addEventListener('click', () => {
    if (mobileUi.isMobile()) {
      const isOpen = sidebarInspector.classList.contains('mobile-open');
      mobileUi.closePanels();
      if (!isOpen) mobileUi.openPanel(sidebarInspector);
    } else {
      sidebarInspector.classList.toggle('hidden');
      renderer.resizeToContainer();
    }
  });

  btnGrid.addEventListener('click', toggleGrid);

  chkPierces.addEventListener('change', () => {
    renderer.showPiercePoints = chkPierces.checked;
    pierceToggle.classList.toggle('on', chkPierces.checked);
  });

  chkDimensions.addEventListener('change', () => {
    renderer.showDimensions = chkDimensions.checked;
    dimToggle.classList.toggle('on', chkDimensions.checked);
  });
}
