import { test, expect } from '@playwright/test';
import path from 'node:path';

const DXF_ARROW = path.resolve(__dirname, '../../test-dxf/arrow.dxf');
const DXF_BRACKET = path.resolve(__dirname, '../../test-dxf/l-bracket.dxf');

test.describe('Set Builder sidebar', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
  });

  test('run button disabled when set empty', async ({ page }) => {
    await expect(page.locator('[data-a="run"]')).toBeDisabled();
  });

  test('sheet preset select has 3 options', async ({ page }) => {
    const select = page.locator('[data-a="preset"]');
    await expect(select).toBeVisible();
    await expect(select.locator('option')).toHaveCount(3);
  });

  test('custom sheet width input visible and editable', async ({ page }) => {
    const w = page.locator('[data-a="sheet-custom-w"]');
    await expect(w).toBeVisible();
    await w.fill('800');
    await expect(w).toHaveValue('800');
  });

  test('custom sheet height input visible', async ({ page }) => {
    await expect(page.locator('[data-a="sheet-custom-h"]')).toBeVisible();
  });

  test('add size button visible', async ({ page }) => {
    await expect(page.locator('[data-a="sheet-custom-add"]')).toBeVisible();
  });

  test('two mode buttons exist', async ({ page }) => {
    await expect(page.locator('[data-a="mode"]')).toHaveCount(2);
  });

  test('can click common-line mode', async ({ page }) => {
    const modes = page.locator('[data-a="mode"]');
    await modes.nth(1).click();
    await page.waitForTimeout(200);
    await expect(modes.nth(1)).toBeVisible();
  });

  test('gap input visible and has numeric value', async ({ page }) => {
    const gap = page.locator('[data-a="gap"]');
    await expect(gap).toBeVisible();
    const val = await gap.inputValue();
    expect(val).toMatch(/^\d+$/);
  });

  test('rotation checkbox is checked by default', async ({ page }) => {
    await expect(page.locator('[data-a="rotation"]')).toBeChecked();
  });

  test('rotation step select visible', async ({ page }) => {
    await expect(page.locator('[data-a="rotation-step"]')).toBeVisible();
  });

  test('multi-start checkbox checked by default', async ({ page }) => {
    await expect(page.locator('[data-a="multi-start"]')).toBeChecked();
  });

  test('seed input visible with value 0', async ({ page }) => {
    const seed = page.locator('[data-a="seed"]');
    await expect(seed).toBeVisible();
    await expect(seed).toHaveValue('0');
  });

  test('clear set button visible', async ({ page }) => {
    await expect(page.locator('[data-a="clear-set"]')).toBeVisible();
  });

  test('clear set resets to empty state', async ({ page }) => {
    await page.locator('[data-a="clear-set"]').click();
    await page.waitForTimeout(200);
    await expect(page.locator('[data-a="run"]')).toBeDisabled();
  });

  test('switching tabs works', async ({ page }) => {
    const tabs = page.locator('[data-a="tab"]');
    await tabs.nth(1).click();
    await page.waitForTimeout(200);
    await tabs.nth(0).click();
    await page.waitForTimeout(200);
    await expect(page.locator('[data-a="upload"]')).toBeVisible();
  });

  test('preset rename button visible', async ({ page }) => {
    await expect(page.locator('[data-a="preset-rename"]')).toBeVisible();
  });
});
