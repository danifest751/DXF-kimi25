import { test, expect } from '@playwright/test';

test.describe('Authentication UI', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
  });

  test('lang toggle button is visible', async ({ page }) => {
    await expect(page.locator('[data-a="lang-toggle"]')).toBeVisible();
  });

  test('telegram login button visible', async ({ page }) => {
    await expect(page.locator('[data-a="tg-login"]')).toBeVisible();
  });

  test('close button visible', async ({ page }) => {
    await expect(page.locator('[data-a="close"]')).toBeVisible();
  });

  test('telegram login button click triggers no exceptions', async ({ page }) => {
    const exceptions: string[] = [];
    page.on('pageerror', e => exceptions.push(e.message));
    await page.locator('[data-a="tg-login"]').click();
    await page.waitForTimeout(500);
    expect(exceptions).toHaveLength(0);
  });

  test('close button click triggers no exceptions', async ({ page }) => {
    const exceptions: string[] = [];
    page.on('pageerror', e => exceptions.push(e.message));
    await page.locator('[data-a="close"]').click();
    await page.waitForTimeout(300);
    expect(exceptions).toHaveLength(0);
  });
});
