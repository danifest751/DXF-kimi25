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
  const pendingStatsRequests = new Map<string, Promise<UICuttingStats>>();
  let statsApiQueue: Promise<void> = Promise.resolve();
  let statsApiCooldownUntil = 0;

  function updateModeBadge(): void {
    modeBadge.textContent = `Mode: cutting ${getCuttingComputeMode().toUpperCase()} | nesting ${getNestingComputeMode().toUpperCase()}`;
  }

  function updateNestingButtonState(): void {
    const panelOpen = !nestingPanel.classList.contains('hidden') || nestingPanel.classList.contains('mobile-open');
    btnNesting.classList.toggle('active', panelOpen || getNestingMode());
  }

  function computeStatsLocally(doc: LoadedFile['doc']): UICuttingStats {
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

  function isRateLimitError(err: unknown): boolean {
    if (!(err instanceof Error)) return false;
    return err.message.includes('429') || err.message.toLowerCase().includes('too many requests');
  }

  function getStatsRequestKey(base64: string): string {
    return `${base64.length}:${base64.slice(0, 64)}:${base64.slice(-64)}`;
  }

  function requestApiCuttingStats(base64: string): Promise<UICuttingStats> {
    const key = getStatsRequestKey(base64);
    const existing = pendingStatsRequests.get(key);
    if (existing) return existing;

    const scheduled = statsApiQueue.then(async () => {
      if (Date.now() < statsApiCooldownUntil) throw new Error('cutting-stats cooldown');
      const response = await apiPostJSON<{ success: boolean; data: UICuttingStats }>('/api/cutting-stats', { base64 });
      setCuttingComputeMode('api');
      updateModeBadge();
      return response.data;
    });

    statsApiQueue = scheduled.then(() => undefined, () => undefined);
    pendingStatsRequests.set(key, scheduled);
    void scheduled.finally(() => {
      pendingStatsRequests.delete(key);
    });
    return scheduled;
  }

  async function computeStatsFromBuffer(base64: string, doc: LoadedFile['doc']): Promise<UICuttingStats> {
    if (Date.now() < statsApiCooldownUntil) {
      return computeStatsLocally(doc);
    }

    try {
      return await requestApiCuttingStats(base64);
    } catch (err) {
      if (isRateLimitError(err)) {
        statsApiCooldownUntil = Date.now() + 15_000;
      }
      return computeStatsLocally(doc);
    }
  }

  return {
    computeStatsFromBuffer,
    updateModeBadge,
    updateNestingButtonState,
  };
}
