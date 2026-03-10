import { test, expect } from '@playwright/test';
import path from 'node:path';

const DXF_ARROW = path.resolve(__dirname, '../../test-dxf/arrow.dxf');

test.describe('Accessibility & robustness', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
  });

  test('all visible buttons have text or title or aria-label', async ({ page }) => {
    const buttons = page.locator('button');
    const count = await buttons.count();
    for (let i = 0; i < count; i++) {
      const btn = buttons.nth(i);
      // Skip aria-hidden buttons (decorative / programmatic triggers)
      const ariaHidden = await btn.getAttribute('aria-hidden');
      if (ariaHidden === 'true') continue;
      const text = (await btn.innerText()).trim();
      const ariaLabel = await btn.getAttribute('aria-label');
      const title = await btn.getAttribute('title');
      const hasName = text.length > 0 || !!ariaLabel || !!title;
      expect(hasName, `Button ${i} has no accessible name`).toBe(true);
    }
  });

  test('file input exists (for upload)', async ({ page }) => {
    await expect(page.locator('input[type="file"]').first()).toBeAttached();
  });

  test('rotation and multi-start checkboxes are checked', async ({ page }) => {
    await expect(page.locator('[data-a="rotation"]')).toBeChecked();
    await expect(page.locator('[data-a="multi-start"]')).toBeChecked();
  });

  test('gap, seed inputs have numeric values', async ({ page }) => {
    const gap = await page.locator('[data-a="gap"]').inputValue();
    const seed = await page.locator('[data-a="seed"]').inputValue();
    expect(gap).toMatch(/^\d+$/);
    expect(seed).toMatch(/^\d+$/);
  });

  test('sheet width/height inputs have non-empty numeric values', async ({ page }) => {
    const w = await page.locator('[data-a="sheet-custom-w"]').inputValue();
    const h = await page.locator('[data-a="sheet-custom-h"]').inputValue();
    expect(w).toMatch(/^\d+$/);
    expect(h).toMatch(/^\d+$/);
  });

  test('upload button is enabled at page start', async ({ page }) => {
    await expect(page.locator('[data-a="upload"]')).toBeEnabled();
  });

  test('run button is disabled at page start', async ({ page }) => {
    await expect(page.locator('[data-a="run"]')).toBeDisabled();
  });

  test('sort-by and sort-dir selects are interactive', async ({ page }) => {
    await page.locator('[data-a="sort-by"]').selectOption({ index: 1 });
    await page.locator('[data-a="sort-dir"]').selectOption({ index: 1 });
    await page.waitForTimeout(200);
    await expect(page.locator('[data-a="run"]')).toBeVisible();
  });

  test('upload triggers no unhandled exceptions', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.locator('input[type="file"]').first().setInputFiles(DXF_ARROW);
    await page.waitForTimeout(1500);
    expect(errors).toHaveLength(0);
  });

  test('tab-key navigation reaches interactive elements', async ({ page }) => {
    for (let i = 0; i < 5; i++) await page.keyboard.press('Tab');
    const focused = await page.evaluate(() => document.activeElement?.tagName);
    expect(['BUTTON', 'INPUT', 'SELECT', 'A', 'TEXTAREA']).toContain(focused);
  });
});
