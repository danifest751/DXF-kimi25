import { test, expect } from '@playwright/test';
import path from 'node:path';

const DXF_ARROW = path.resolve(__dirname, '../../test-dxf/arrow.dxf');
const DXF_BRACKET = path.resolve(__dirname, '../../test-dxf/l-bracket.dxf');
const DXF_STAR = path.resolve(__dirname, '../../test-dxf/star.dxf');

test.describe('DXF file upload', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
  });

  test('upload button is visible', async ({ page }) => {
    await expect(page.locator('[data-a="upload"]')).toBeVisible();
  });

  test('file input element exists', async ({ page }) => {
    await expect(page.locator('input[type="file"]').first()).toBeAttached();
  });

  test('upload single DXF — file appears in library', async ({ page }) => {
    await page.locator('input[type="file"]').first().setInputFiles(DXF_ARROW);
    await expect(page.locator('body')).toContainText('arrow', { timeout: 5000 });
  });

  test('upload multiple DXF files — all appear', async ({ page }) => {
    await page.locator('input[type="file"]').first().setInputFiles([DXF_ARROW, DXF_BRACKET, DXF_STAR]);
    await expect(page.locator('body')).toContainText('arrow', { timeout: 5000 });
    await expect(page.locator('body')).toContainText('l-bracket', { timeout: 5000 });
    await expect(page.locator('body')).toContainText('star', { timeout: 5000 });
  });

  test('after upload file list is not empty', async ({ page }) => {
    await page.locator('input[type="file"]').first().setInputFiles(DXF_ARROW);
    await page.waitForTimeout(800);
    // "Нет элементов" message should disappear
    const emptyMsg = page.locator('body');
    await expect(emptyMsg).not.toContainText('Нет элементов для текущих фильтров', { timeout: 5000 });
  });

  test('upload triggers no pageerror', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.locator('input[type="file"]').first().setInputFiles([DXF_ARROW, DXF_STAR]);
    await page.waitForTimeout(1500);
    expect(errors).toHaveLength(0);
  });

  test('upload two files — both visible simultaneously', async ({ page }) => {
    await page.locator('input[type="file"]').first().setInputFiles([DXF_ARROW, DXF_BRACKET]);
    await expect(page.locator('body')).toContainText('arrow', { timeout: 5000 });
    await expect(page.locator('body')).toContainText('l-bracket', { timeout: 5000 });
  });
});
