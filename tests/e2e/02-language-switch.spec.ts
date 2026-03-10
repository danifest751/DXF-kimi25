import { test, expect } from '@playwright/test';

test.describe('Language switch RU/EN', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
  });

  test('lang toggle button is clickable', async ({ page }) => {
    const btn = page.locator('[data-a="lang-toggle"]');
    await expect(btn).toBeVisible();
    const textBefore = await btn.innerText();
    await btn.click();
    await page.waitForTimeout(300);
    const textAfter = await btn.innerText();
    expect(textAfter).not.toBe(textBefore);
  });

  test('switching lang changes run button text', async ({ page }) => {
    const runBtnBefore = await page.locator('[data-a="run"]').innerText();
    await page.locator('[data-a="lang-toggle"]').click();
    await page.waitForTimeout(300);
    const runBtnAfter = await page.locator('[data-a="run"]').innerText();
    expect(runBtnAfter).not.toBe(runBtnBefore);
  });

  test('switching back to original lang restores text', async ({ page }) => {
    const original = await page.locator('[data-a="run"]').innerText();
    await page.locator('[data-a="lang-toggle"]').click();
    await page.waitForTimeout(200);
    await page.locator('[data-a="lang-toggle"]').click();
    await page.waitForTimeout(200);
    const restored = await page.locator('[data-a="run"]').innerText();
    expect(restored).toBe(original);
  });

  test('two tabs exist after lang switch', async ({ page }) => {
    await page.locator('[data-a="lang-toggle"]').click();
    await page.waitForTimeout(200);
    const count = await page.locator('[data-a="tab"]').count();
    expect(count).toBeGreaterThanOrEqual(2);
  });
});
