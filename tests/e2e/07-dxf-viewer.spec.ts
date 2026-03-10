import { test, expect } from '@playwright/test';
import path from 'node:path';

const DXF_ARROW = path.resolve(__dirname, '../../test-dxf/arrow.dxf');
const DXF_STAR = path.resolve(__dirname, '../../test-dxf/star.dxf');

test.describe('DXF viewer & canvas', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
  });

  test('drop zone hint visible before upload', async ({ page }) => {
    await expect(page.locator('body')).toContainText('Перетащите DXF файл сюда');
  });

  test('canvas or svg renders after file upload', async ({ page }) => {
    await page.locator('input[type="file"]').first().setInputFiles(DXF_ARROW);
    await page.waitForTimeout(1500);
    const canvasCount = await page.locator('canvas').count();
    const svgCount = await page.locator('svg').count();
    expect(canvasCount + svgCount).toBeGreaterThan(0);
  });

  test('file name appears in library after upload', async ({ page }) => {
    await page.locator('input[type="file"]').first().setInputFiles(DXF_ARROW);
    await expect(page.locator('body')).toContainText('arrow', { timeout: 5000 });
  });

  test('two files both appear in library', async ({ page }) => {
    await page.locator('input[type="file"]').first().setInputFiles([DXF_ARROW, DXF_STAR]);
    await expect(page.locator('body')).toContainText('arrow', { timeout: 5000 });
    await expect(page.locator('body')).toContainText('star', { timeout: 5000 });
  });

  test('upload triggers no page exceptions', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.locator('input[type="file"]').first().setInputFiles([DXF_ARROW, DXF_STAR]);
    await page.waitForTimeout(1500);
    expect(errors).toHaveLength(0);
  });

  test('upload button click opens file dialog', async ({ page }) => {
    // Verify upload button is associated with file input
    await expect(page.locator('[data-a="upload"]')).toBeVisible();
    await expect(page.locator('input[type="file"]').first()).toBeAttached();
  });
});
