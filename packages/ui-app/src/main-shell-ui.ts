import { applyLocale, getLocale, onLocaleChange, setLocale } from './i18n/index.js';

export function initMainShellUi(input: {
  container: HTMLDivElement;
  applyAuthUiState: (updateUploadTargetHint: () => void) => void;
  updateUploadTargetHint: () => void;
  updateBulkControlsUi: () => void;
  onResizeRenderer: () => void;
  onResizeViewport: () => void;
}): void {
  const {
    container,
    applyAuthUiState,
    updateUploadTargetHint,
    updateBulkControlsUi,
    onResizeRenderer,
    onResizeViewport,
  } = input;

  applyLocale();

  const btnLangToggle = document.getElementById('btn-lang-toggle') as HTMLButtonElement | null;
  btnLangToggle?.addEventListener('click', () => {
    setLocale(getLocale() === 'ru' ? 'en' : 'ru');
  });

  onLocaleChange(() => {
    applyAuthUiState(updateUploadTargetHint);
    updateBulkControlsUi();
  });

  new ResizeObserver(() => {
    onResizeRenderer();
    onResizeViewport();
  }).observe(container);
}
