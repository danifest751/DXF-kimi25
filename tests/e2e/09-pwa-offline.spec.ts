import { test, expect } from '@playwright/test';

test.describe('PWA & Service Worker', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
  });

  test('manifest.webmanifest is linked in <head>', async ({ page }) => {
    const manifest = page.locator('link[rel="manifest"]');
    await expect(manifest).toHaveCount(1);
    const href = await manifest.getAttribute('href');
    expect(href).toBeTruthy();
  });

  test('manifest contains correct fields', async ({ page }) => {
    const data = await page.evaluate(async () => {
      const link = document.querySelector('link[rel="manifest"]') as HTMLLinkElement;
      if (!link) return null;
      const resp = await fetch(link.href);
      return resp.json();
    });
    expect(data).toBeTruthy();
    expect(data.name).toContain('DXF');
    expect(data.display).toBe('standalone');
    expect(data.icons).toBeInstanceOf(Array);
    expect(data.icons.length).toBeGreaterThan(0);
  });

  test('Service Worker is registered', async ({ page }) => {
    const swCount = await page.evaluate(async () => {
      const regs = await navigator.serviceWorker.getRegistrations();
      return regs.length;
    });
    expect(swCount).toBeGreaterThan(0);
  });

  test('navigator.onLine is true in normal mode', async ({ page }) => {
    const online = await page.evaluate(() => navigator.onLine);
    expect(online).toBe(true);
  });

  test('offline mode detection works', async ({ page, context }) => {
    await context.setOffline(true);
    const offline = await page.evaluate(() => !navigator.onLine);
    expect(offline).toBe(true);
    await context.setOffline(false);
  });

  test('app still renders in offline mode', async ({ page, context }) => {
    await context.setOffline(true);
    // UI should still be visible (already loaded, SW cached)
    await expect(page.locator('[data-a="run"]')).toBeVisible();
    await context.setOffline(false);
  });

  test('SVG icons are accessible', async ({ page }) => {
    for (const size of ['192', '512']) {
      const resp = await page.request.get(`/icon-${size}.svg`);
      expect(resp.status()).toBe(200);
      const ct = resp.headers()['content-type'] ?? '';
      expect(ct).toContain('svg');
    }
  });
});
