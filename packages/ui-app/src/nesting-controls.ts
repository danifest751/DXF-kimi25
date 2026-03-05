import { SHEET_PRESETS } from '../../core-engine/src/nesting/index.js';
import type { MobileUiController } from './mobile-ui.js';

export function initNestingControls(input: {
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
}): void {
  const {
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
  } = input;

  function updateRotationControls(): void {
    nestRotateStep.disabled = !nestRotateEnabled.checked;
    nestRotateStep.style.opacity = nestRotateEnabled.checked ? '1' : '0.5';
  }

  function updateCommonLineControls(): void {
    const enabled = nestCommonLineEnabled.checked;
    const dist = document.getElementById('nest-commonline-dist') as HTMLInputElement;
    const minLen = document.getElementById('nest-commonline-minlen') as HTMLInputElement;
    const status = document.getElementById('nest-commonline-status') as HTMLDivElement;
    dist.disabled = !enabled;
    minLen.disabled = !enabled;
    dist.style.opacity = enabled ? '1' : '0.5';
    minLen.style.opacity = enabled ? '1' : '0.5';
    status.textContent = enabled ? 'Status: ON (совместный рез включен)' : 'Status: OFF';
    status.style.color = enabled ? '#10b981' : '#f59e0b';
  }

  let applyingModePreset = false;

  function applyNestingModePreset(mode: 'precise' | 'common'): void {
    applyingModePreset = true;
    try {
      nestCommonLineEnabled.checked = mode === 'common';
      updateCommonLineControls();
      setNestModeValue(mode === 'common' ? 'common' : 'precise');
    } finally {
      applyingModePreset = false;
    }
  }

  function syncModeByAdvancedControls(): void {
    if (applyingModePreset) return;
    setNestModeValue(nestCommonLineEnabled.checked ? 'common' : 'precise');
  }

  btnNesting.addEventListener('click', () => {
    if (mobileUi.isMobile()) {
      const isOpen = nestingPanel.classList.contains('mobile-open');
      mobileUi.closePanels();
      if (!isOpen) mobileUi.openPanel(nestingPanel);
    } else {
      nestingPanel.classList.toggle('hidden');
      if (!nestingPanel.classList.contains('hidden')) updateNestItems();
    }
    updateNestingButtonState();
    onResizeRenderer();
  });

  nestPreset.addEventListener('change', () => {
    nestCustomRow.classList.toggle('hidden', nestPreset.value !== 'custom');
    if (nestPreset.value !== 'custom') {
      const preset = SHEET_PRESETS[Number(nestPreset.value)]!;
      (document.getElementById('nest-w') as HTMLInputElement).value = String(preset.size.width);
      (document.getElementById('nest-h') as HTMLInputElement).value = String(preset.size.height);
    }
  });

  updateRotationControls();
  applyNestingModePreset('precise');
  updateCommonLineControls();

  for (const radio of nestModeRadios) {
    radio.addEventListener('change', () => {
      if (applyingModePreset) return;
      const mode = getNestModeValue();
      applyNestingModePreset(mode === 'common' ? 'common' : 'precise');
      autoRerunNesting();
    });
  }

  btnAdvancedToggle.addEventListener('click', () => {
    const isOpen = !nestAdvanced.classList.contains('hidden');
    nestAdvanced.classList.toggle('hidden', isOpen);
    btnAdvancedToggle.classList.toggle('open', !isOpen);
  });

  nestRotateEnabled.addEventListener('change', () => {
    updateRotationControls();
    autoRerunNesting();
  });
  nestRotateStep.addEventListener('change', () => {
    autoRerunNesting();
  });
  (document.getElementById('nest-seed') as HTMLInputElement).addEventListener('change', () => {
    autoRerunNesting();
  });
  nestCommonLineEnabled.addEventListener('change', () => {
    updateCommonLineControls();
    syncModeByAdvancedControls();
    autoRerunNesting();
  });
  (document.getElementById('nest-commonline-dist') as HTMLInputElement).addEventListener('change', () => {
    autoRerunNesting();
  });
  (document.getElementById('nest-commonline-minlen') as HTMLInputElement).addEventListener('change', () => {
    autoRerunNesting();
  });

  btnNestRun.addEventListener('click', () => {
    void runNesting();
  });
  nestClose.addEventListener('click', exitNestingMode);
}
