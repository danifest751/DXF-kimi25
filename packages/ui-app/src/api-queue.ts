/**
 * @module api-queue
 * Automatic retry with countdown for 429 rate-limit responses.
 *
 * Usage:
 *   const result = await withRateLimitRetry(
 *     () => apiPostJSON('/api/nest', payload),
 *     { onCountdown: (sec) => { state.busyLabel = `Повтор через ${sec}с…`; render(); } },
 *   );
 */

export interface RateLimitRetryOptions {
  /** Called every second during the wait countdown. */
  onCountdown?: (secondsLeft: number, attempt: number) => void;
  /** Called when countdown is done and retry begins. */
  onRetry?: (attempt: number) => void;
  /** Maximum number of attempts (first call + retries). Default: 3 */
  maxAttempts?: number;
  /** Base wait seconds if no Retry-After header. Default: 60 */
  baseDelaySec?: number;
  /** Signal to abort the wait early (e.g. user cancelled nesting). */
  signal?: AbortSignal;
}

export class RateLimitError extends Error {
  constructor(public readonly attempts: number) {
    super(`Rate limit exceeded after ${attempts} attempt(s)`);
    this.name = 'RateLimitError';
  }
}

/**
 * Wraps an async factory function and retries it automatically on 429.
 * Parses Retry-After header when available; falls back to baseDelaySec.
 */
export async function withRateLimitRetry<T>(
  fn: () => Promise<T>,
  opts: RateLimitRetryOptions = {},
): Promise<T> {
  const maxAttempts = opts.maxAttempts ?? 3;
  const baseDelaySec = opts.baseDelaySec ?? 60;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err: unknown) {
      const is429 = isRateLimitError(err);
      if (!is429 || attempt === maxAttempts) throw err;

      const delaySec = extractRetryAfter(err) ?? baseDelaySec;

      // Countdown loop
      for (let sec = delaySec; sec > 0; sec--) {
        if (opts.signal?.aborted) throw new DOMException('Aborted', 'AbortError');
        opts.onCountdown?.(sec, attempt);
        await sleep(1000, opts.signal);
      }

      opts.onRetry?.(attempt + 1);
    }
  }

  // TypeScript needs this even though the loop always throws or returns
  throw new RateLimitError(maxAttempts);
}

function isRateLimitError(err: unknown): boolean {
  if (err == null || typeof err !== 'object') return false;
  const e = err as { status?: number; statusCode?: number };
  return e.status === 429 || e.statusCode === 429;
}

function extractRetryAfter(err: unknown): number | null {
  if (err == null || typeof err !== 'object') return null;
  const e = err as { retryAfter?: number | string; headers?: Headers };
  if (typeof e.retryAfter === 'number') return e.retryAfter;
  if (typeof e.retryAfter === 'string') {
    const n = parseInt(e.retryAfter, 10);
    if (!isNaN(n)) return n;
  }
  // Try to read from response headers if attached
  const ra = e.headers?.get?.('retry-after');
  if (ra) {
    const n = parseInt(ra, 10);
    if (!isNaN(n)) return n;
  }
  return null;
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    if (signal?.aborted) { reject(new DOMException('Aborted', 'AbortError')); return; }
    const id = setTimeout(resolve, ms);
    signal?.addEventListener('abort', () => { clearTimeout(id); reject(new DOMException('Aborted', 'AbortError')); }, { once: true });
  });
}
