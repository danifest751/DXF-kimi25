import { test, expect } from '@playwright/test';
import path from 'node:path';

const DXF_ARROW = path.resolve(__dirname, '../../test-dxf/arrow.dxf');
const DXF_BRACKET = path.resolve(__dirname, '../../test-dxf/l-bracket.dxf');
const DXF_STAR = path.resolve(__dirname, '../../test-dxf/star.dxf');

test.describe('Nesting run (local worker fallback)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
  });

  test('run button disabled after upload with zero qty', async ({ page }) => {
    await page.locator('input[type="file"]').first().setInputFiles(DXF_ARROW);
    await page.waitForTimeout(600);
    await expect(page.locator('[data-a="run"]')).toBeDisabled();
  });

  test('gap input change is reflected', async ({ page }) => {
    const gap = page.locator('[data-a="gap"]');
    await gap.fill('10');
    await expect(gap).toHaveValue('10');
  });

  test('seed input change is reflected', async ({ page }) => {
    const seed = page.locator('[data-a="seed"]');
    await seed.fill('42');
    await expect(seed).toHaveValue('42');
  });

  test('common-line mode switch and back', async ({ page }) => {
    const modes = page.locator('[data-a="mode"]');
    await modes.nth(1).click(); // common-line
    await page.waitForTimeout(200);
    await modes.nth(0).click(); // normal
    await page.waitForTimeout(200);
    await expect(page.locator('[data-a="run"]')).toBeVisible();
  });

  test('sheet preset select is interactive and has 3 options', async ({ page }) => {
    const select = page.locator('[data-a="preset"]');
    await expect(select).toBeVisible();
    const opts = await select.locator('option').count();
    expect(opts).toBe(3);
    // Can change selection
    await select.selectOption({ index: 1 });
    await page.waitForTimeout(200);
    const selected = await select.inputValue();
    expect(selected).toBeTruthy();
  });

  test('clear set button resets to empty', async ({ page }) => {
    await page.locator('input[type="file"]').first().setInputFiles(DXF_ARROW);
    await page.waitForTimeout(500);
    await page.locator('[data-a="clear-set"]').click();
    await page.waitForTimeout(200);
    await expect(page.locator('[data-a="run"]')).toBeDisabled();
  });

  test('rotation step options: 1, 2, 5 degrees', async ({ page }) => {
    const select = page.locator('[data-a="rotation-step"]');
    await expect(select.locator('option')).toHaveCount(3);
  });

  test('upload 3 files triggers no page exceptions', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.locator('input[type="file"]').first().setInputFiles([DXF_ARROW, DXF_BRACKET, DXF_STAR]);
    await page.waitForTimeout(2000);
    expect(errors).toHaveLength(0);
  });
});
