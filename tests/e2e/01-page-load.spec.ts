import { test, expect } from '@playwright/test';

test.describe('Page load & basic structure', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
  });

  test('page title contains DXF', async ({ page }) => {
    await expect(page).toHaveTitle(/DXF/);
  });

  test('logo text visible in header', async ({ page }) => {
    await expect(page.locator('body')).toContainText('DXF');
  });

  test('lang toggle button visible', async ({ page }) => {
    await expect(page.locator('[data-a="lang-toggle"]')).toBeVisible();
  });

  test('telegram login button visible', async ({ page }) => {
    await expect(page.locator('[data-a="tg-login"]')).toBeVisible();
  });

  test('close button visible', async ({ page }) => {
    await expect(page.locator('[data-a="close"]')).toBeVisible();
  });

  test('two tab buttons exist', async ({ page }) => {
    // There are 2 visible tab buttons in the main toolbar (may be duplicated in DOM)
    const tabs = page.locator('[data-a="tab"]');
    const count = await tabs.count();
    expect(count).toBeGreaterThanOrEqual(2);
  });

  test('upload button visible', async ({ page }) => {
    await expect(page.locator('[data-a="upload"]')).toBeVisible();
  });

  test('run nesting button visible', async ({ page }) => {
    await expect(page.locator('[data-a="run"]')).toBeVisible();
  });

  test('run nesting button disabled when set empty', async ({ page }) => {
    await expect(page.locator('[data-a="run"]')).toBeDisabled();
  });

  test('drop zone hint visible', async ({ page }) => {
    await expect(page.locator('body')).toContainText('Перетащите DXF файл сюда');
  });

  test('PWA manifest is linked', async ({ page }) => {
    await expect(page.locator('link[rel="manifest"]')).toHaveCount(1);
  });

  test('no unhandled JS exceptions on load', async ({ page }) => {
    const exceptions: string[] = [];
    page.on('pageerror', e => exceptions.push(e.message));
    await page.goto('/');
    await page.waitForTimeout(600);
    expect(exceptions).toHaveLength(0);
  });
});
