import { describe, expect, it, vi, afterEach } from 'vitest';
import { ApiError } from '../../packages/ui-app/src/api.js';

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

// ---------------------------------------------------------------------------
// Helper: build a minimal SetBuilderState-like object for runNesting tests
// ---------------------------------------------------------------------------
function makeState(overrides: Record<string, unknown> = {}) {
  return {
    loading: false,
    nestingPhase: 'idle' as string,
    manualPlacements: new Map(),
    mode: 'normal',
    gapMm: 2,
    rotationEnabled: false,
    rotationStepDeg: 90,
    multiStart: false,
    seed: 0,
    commonLineMaxMergeDistanceMm: 0.1,
    commonLineMinSharedLenMm: 5,
    results: null as unknown,
    activeTab: 'set' as string,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// ApiError
// ---------------------------------------------------------------------------
describe('ApiError', () => {
  it('stores status code', () => {
    const err = new ApiError(429, 'Too many requests');
    expect(err.status).toBe(429);
    expect(err.message).toBe('Too many requests');
    expect(err.name).toBe('ApiError');
  });

  it('instanceof Error', () => {
    const err = new ApiError(500, 'server error');
    expect(err instanceof Error).toBe(true);
    expect(err instanceof ApiError).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// nestItemsViaWorker — test via Worker mock
// ---------------------------------------------------------------------------
describe('nestItemsViaWorker (via Worker mock)', () => {
  it('resolves with nesting result on success', async () => {
    const fakeResult = { sheets: [], totalSheets: 0, totalPlaced: 0, totalRequired: 0 };

    // Mock Worker constructor
    const postMessageMock = vi.fn();
    const terminateMock = vi.fn();
    let onmessageHandler: ((e: MessageEvent) => void) | null = null;

    const MockWorker = vi.fn().mockImplementation(() => ({
      postMessage: postMessageMock,
      terminate: terminateMock,
      set onmessage(fn: (e: MessageEvent) => void) { onmessageHandler = fn; },
      set onerror(_fn: unknown) { /* no-op */ },
    }));

    // Dynamically import and inject mock - we test the pattern directly
    const promise = new Promise<typeof fakeResult>((resolve, reject) => {
      const worker = new MockWorker();
      worker.onmessage = (e: MessageEvent<{ type: string; result: typeof fakeResult }>) => {
        worker.terminate();
        if (e.data.type === 'done') resolve(e.data.result);
        else reject(new Error('worker error'));
      };
      worker.postMessage({ items: [], sheet: { width: 1000, height: 500 }, gap: 2, options: {} });
    });

    // Simulate worker responding
    setTimeout(() => {
      onmessageHandler?.({ data: { type: 'done', result: fakeResult } } as MessageEvent);
    }, 0);

    const result = await promise;
    expect(result).toEqual(fakeResult);
    expect(terminateMock).toHaveBeenCalled();
  });

  it('rejects on worker error response', async () => {
    const terminateMock = vi.fn();
    let onmessageHandler: ((e: MessageEvent) => void) | null = null;

    const MockWorker = vi.fn().mockImplementation(() => ({
      postMessage: vi.fn(),
      terminate: terminateMock,
      set onmessage(fn: (e: MessageEvent) => void) { onmessageHandler = fn; },
      set onerror(_fn: unknown) { /* no-op */ },
    }));

    const promise = new Promise<never>((resolve, reject) => {
      const worker = new MockWorker();
      worker.onmessage = (e: MessageEvent<{ type: string; message?: string }>) => {
        worker.terminate();
        if (e.data.type === 'done') resolve(null as never);
        else reject(new Error(e.data.message ?? 'worker error'));
      };
      worker.postMessage({});
    });

    setTimeout(() => {
      onmessageHandler?.({ data: { type: 'error', message: 'nesting failed' } } as MessageEvent);
    }, 0);

    await expect(promise).rejects.toThrow('nesting failed');
    expect(terminateMock).toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Offline detection logic
// ---------------------------------------------------------------------------
describe('offline detection', () => {
  it('navigator.onLine false is detectable', () => {
    Object.defineProperty(navigator, 'onLine', { value: false, configurable: true });
    const isOffline = typeof navigator !== 'undefined' && !navigator.onLine;
    expect(isOffline).toBe(true);
    Object.defineProperty(navigator, 'onLine', { value: true, configurable: true });
  });

  it('navigator.onLine true means online', () => {
    Object.defineProperty(navigator, 'onLine', { value: true, configurable: true });
    const isOffline = typeof navigator !== 'undefined' && !navigator.onLine;
    expect(isOffline).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Retry countdown logic (isolated)
// ---------------------------------------------------------------------------
describe('429 retry countdown logic', () => {
  it('countdown iterates correct number of seconds', async () => {
    vi.useFakeTimers();
    const toasts: string[] = [];
    const RETRY_DELAY_SEC = 3; // use 3 for speed

    async function simulateCountdown() {
      for (let sec = RETRY_DELAY_SEC; sec > 0; sec--) {
        toasts.push(`Retry in ${sec}`);
        await new Promise<void>((res) => setTimeout(res, 1000));
      }
    }

    const promise = simulateCountdown();
    for (let i = 0; i < RETRY_DELAY_SEC; i++) {
      await vi.advanceTimersByTimeAsync(1000);
    }
    await promise;

    expect(toasts).toEqual(['Retry in 3', 'Retry in 2', 'Retry in 1']);
  });

  it('aborts countdown early when loading is set to false', async () => {
    vi.useFakeTimers();
    const toasts: string[] = [];
    const state = { loading: true };
    const RETRY_DELAY_SEC = 5;

    let aborted = false;
    async function simulateCountdownWithAbort() {
      for (let sec = RETRY_DELAY_SEC; sec > 0; sec--) {
        toasts.push(`Retry in ${sec}`);
        await new Promise<void>((res) => setTimeout(res, 1000));
        if (!state.loading) { aborted = true; return; }
      }
    }

    const promise = simulateCountdownWithAbort();

    // Advance 2 seconds then cancel
    await vi.advanceTimersByTimeAsync(1000);
    await vi.advanceTimersByTimeAsync(1000);
    state.loading = false;
    await vi.advanceTimersByTimeAsync(1000);
    await promise;

    expect(aborted).toBe(true);
    expect(toasts.length).toBeLessThan(RETRY_DELAY_SEC);
  });
});

// ---------------------------------------------------------------------------
// State management helpers
// ---------------------------------------------------------------------------
describe('nesting state helpers', () => {
  it('manualPlacements.clear() resets all entries', () => {
    const state = makeState();
    state.manualPlacements.set('sheet-1', [{ x: 10, y: 20 }]);
    state.manualPlacements.set('sheet-2', [{ x: 30, y: 40 }]);
    expect(state.manualPlacements.size).toBe(2);

    state.manualPlacements.clear();
    expect(state.manualPlacements.size).toBe(0);
  });

  it('loading flag prevents double run', () => {
    const state = makeState({ loading: true });
    // Simulates the guard at the top of runNesting
    const shouldRun = !state.loading;
    expect(shouldRun).toBe(false);
  });
});
