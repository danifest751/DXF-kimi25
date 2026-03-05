export interface MobileUiController {
  closePanels(): void;
  isMobile(): boolean;
  openPanel(panel: HTMLElement): void;
  toggleShortcutsDialog(show?: boolean): void;
}

export function createMobileUiController(input: {
  mobileBackdrop: HTMLDivElement;
  sidebarFiles: HTMLElement;
  sidebarInspector: HTMLElement;
  nestingPanel: HTMLElement;
  shortcutsOverlay: HTMLDivElement;
  shortcutsClose: HTMLButtonElement;
  updateNestingButtonState: () => void;
  onOpenFileDialog: () => void;
  onZoomToFit: () => void;
  onToggleGrid: () => void;
  onExitNesting: () => void;
  onClearSelection: () => void;
  getNestingMode: () => boolean;
}): MobileUiController {
  const {
    mobileBackdrop,
    sidebarFiles,
    sidebarInspector,
    nestingPanel,
    shortcutsOverlay,
    shortcutsClose,
    updateNestingButtonState,
    onOpenFileDialog,
    onZoomToFit,
    onToggleGrid,
    onExitNesting,
    onClearSelection,
    getNestingMode,
  } = input;

  function isMobile(): boolean {
    return window.innerWidth <= 768;
  }

  function closePanels(): void {
    sidebarFiles.classList.remove('mobile-open');
    sidebarInspector.classList.remove('mobile-open');
    nestingPanel.classList.remove('mobile-open');
    mobileBackdrop.classList.remove('active');
    updateNestingButtonState();
  }

  function openPanel(panel: HTMLElement): void {
    closePanels();
    panel.classList.add('mobile-open');
    mobileBackdrop.classList.add('active');
    updateNestingButtonState();
  }

  function toggleShortcutsDialog(show?: boolean): void {
    const visible = show ?? shortcutsOverlay.classList.contains('hidden');
    shortcutsOverlay.classList.toggle('hidden', !visible);
  }

  mobileBackdrop.addEventListener('click', closePanels);
  document.querySelector('.toolbar .logo')?.addEventListener('click', () => {
    if (!isMobile()) return;
    const isOpen = sidebarFiles.classList.contains('mobile-open');
    closePanels();
    if (!isOpen) openPanel(sidebarFiles);
  });
  window.addEventListener('resize', () => {
    if (!isMobile()) closePanels();
  });

  shortcutsClose.addEventListener('click', () => toggleShortcutsDialog(false));
  shortcutsOverlay.addEventListener('click', (event) => {
    if (event.target === shortcutsOverlay) toggleShortcutsDialog(false);
  });

  window.addEventListener('keydown', (event) => {
    const tag = (event.target as HTMLElement).tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
    if ((event.ctrlKey || event.metaKey) && event.key === 'o') {
      event.preventDefault();
      onOpenFileDialog();
      return;
    }
    if (event.key === 'f' || event.key === 'F') {
      onZoomToFit();
    }
    if (event.key === 'Escape') {
      if (!shortcutsOverlay.classList.contains('hidden')) {
        toggleShortcutsDialog(false);
        return;
      }
      if (isMobile() && mobileBackdrop.classList.contains('active')) {
        closePanels();
        return;
      }
      if (getNestingMode()) {
        onExitNesting();
      } else {
        onClearSelection();
      }
    }
    if (event.key === 'g' || event.key === 'G') {
      onToggleGrid();
    }
    if (event.key === '?') {
      toggleShortcutsDialog();
    }
  });

  return {
    closePanels,
    isMobile,
    openPanel,
    toggleShortcutsDialog,
  };
}
