import { apiPostJSON } from './api.js';
import type { LoadedFile, UICuttingStats } from './types.js';

export interface MainRuntimeUiController {
  computeStatsFromBuffer(base64: string, doc: LoadedFile['doc']): Promise<UICuttingStats>;
  updateModeBadge(): void;
  updateNestingButtonState(): void;
}

export function createMainRuntimeUiController(input: {
  btnNesting: HTMLButtonElement;
  nestingPanel: HTMLDivElement;
  getCuttingComputeMode: () => string;
  getNestingComputeMode: () => string;
  getNestingMode: () => boolean;
  setCuttingComputeMode: (mode: string) => void;
  computeCuttingStats: (doc: LoadedFile['doc']) => UICuttingStats;
}): MainRuntimeUiController {
  const {
    btnNesting,
    nestingPanel,
    getCuttingComputeMode,
    getNestingComputeMode,
    getNestingMode,
    setCuttingComputeMode,
    computeCuttingStats,
  } = input;

  const modeBadge = document.createElement('div');
  modeBadge.style.cssText = 'position:fixed;right:12px;bottom:12px;padding:6px 10px;border-radius:8px;font:500 11px/1.2 system-ui,sans-serif;color:#e5e7eb;background:rgba(17,24,39,0.85);border:1px solid rgba(229,231,235,0.2);backdrop-filter:blur(4px);z-index:9999';
  if (import.meta.env.DEV) document.body.appendChild(modeBadge);

  function updateModeBadge(): void {
    modeBadge.textContent = `Mode: cutting ${getCuttingComputeMode().toUpperCase()} | nesting ${getNestingComputeMode().toUpperCase()}`;
  }

  function updateNestingButtonState(): void {
    const panelOpen = !nestingPanel.classList.contains('hidden') || nestingPanel.classList.contains('mobile-open');
    btnNesting.classList.toggle('active', panelOpen || getNestingMode());
  }

  async function computeStatsFromBuffer(base64: string, doc: LoadedFile['doc']): Promise<UICuttingStats> {
    try {
      const response = await apiPostJSON<{ success: boolean; data: UICuttingStats }>('/api/cutting-stats', { base64 });
      setCuttingComputeMode('api');
      updateModeBadge();
      return response.data;
    } catch {
      const stats = computeCuttingStats(doc);
      setCuttingComputeMode('local');
      updateModeBadge();
      return {
        totalPierces: stats.totalPierces,
        totalCutLength: stats.totalCutLength,
        cuttingEntityCount: stats.cuttingEntityCount,
        chains: stats.chains,
      };
    }
  }

  return {
    computeStatsFromBuffer,
    updateModeBadge,
    updateNestingButtonState,
  };
}
