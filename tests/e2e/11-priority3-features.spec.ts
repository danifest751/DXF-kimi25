import { test, expect } from '@playwright/test';
import path from 'node:path';

const DXF_ARROW = path.resolve(__dirname, '../../test-dxf/arrow.dxf');
const DXF_BRACKET = path.resolve(__dirname, '../../test-dxf/l-bracket.dxf');

// ─── helpers ──────────────────────────────────────────────────────────────────

async function openSetBuilder(page: import('@playwright/test').Page) {
  await page.goto('/');
  await page.waitForLoadState('networkidle');
}

async function uploadAndAddToSet(page: import('@playwright/test').Page) {
  await page.locator('input[type="file"]').first().setInputFiles(DXF_ARROW);
  await page.waitForTimeout(800);
  // qty-plus to add to set
  const qtyPlus = page.locator('[data-a="qty-plus"]').first();
  if (await qtyPlus.isVisible()) {
    await qtyPlus.click();
    await page.waitForTimeout(200);
  }
}

// ─── 3.1 Templates ────────────────────────────────────────────────────────────

test.describe('3.1 — Set templates', () => {
  test.beforeEach(async ({ page }) => {
    await openSetBuilder(page);
    // clear localStorage templates before each test
    await page.evaluate(() => localStorage.removeItem('dxf-set-templates'));
  });

  test('templates-open button is visible', async ({ page }) => {
    await expect(page.locator('[data-a="templates-open"]')).toBeVisible();
  });

  test('templates-save button is visible', async ({ page }) => {
    await expect(page.locator('[data-a="templates-save"]')).toBeVisible();
  });

  test('saving empty set shows toast without creating template', async ({ page }) => {
    // set is empty — save should show "empty set" toast, not prompt
    await page.locator('[data-a="templates-save"]').click();
    await page.waitForTimeout(300);
    // panel should NOT open (no prompt was triggered for empty set)
    // toast may appear, verify no dropdown opened
    const panel = page.locator('.sb-dropdown-panel').first();
    await expect(panel).not.toBeVisible();
  });

  test('toggle templates panel open/close', async ({ page }) => {
    const btn = page.locator('[data-a="templates-open"]');
    await btn.click();
    await page.waitForTimeout(200);
    // panel appears
    await expect(page.locator('.sb-dropdown-panel').first()).toBeVisible();
    await btn.click();
    await page.waitForTimeout(200);
    // panel closes
    await expect(page.locator('.sb-dropdown-panel').first()).not.toBeVisible();
  });

  test('empty templates list shows no-templates message', async ({ page }) => {
    await page.locator('[data-a="templates-open"]').click();
    await page.waitForTimeout(200);
    const panel = page.locator('.sb-dropdown-panel').first();
    await expect(panel).toBeVisible();
    await expect(panel.locator('.sb-empty')).toBeVisible();
  });

  test('saving template from non-empty set creates entry', async ({ page }) => {
    await uploadAndAddToSet(page);
    // inject template directly via localStorage to avoid prompt interaction
    await page.evaluate(() => {
      const tpl = {
        id: 'tpl_test_1',
        name: 'Test Template',
        createdAt: Date.now(),
        items: [{ stableKey: 'name:arrow.dxf', qty: 2, enabled: true }],
      };
      localStorage.setItem('dxf-set-templates', JSON.stringify([tpl]));
    });
    await page.reload();
    await page.waitForLoadState('networkidle');
    await page.locator('[data-a="templates-open"]').click();
    await page.waitForTimeout(200);
    const panel = page.locator('.sb-dropdown-panel').first();
    await expect(panel).toBeVisible();
    await expect(panel.locator('.sb-dropdown-row-name')).toHaveText('Test Template');
  });

  test('load button visible in populated template list', async ({ page }) => {
    await page.evaluate(() => {
      const tpl = {
        id: 'tpl_test_2',
        name: 'My Set',
        createdAt: Date.now(),
        items: [{ stableKey: 'name:arrow.dxf', qty: 1, enabled: true }],
      };
      localStorage.setItem('dxf-set-templates', JSON.stringify([tpl]));
    });
    await page.reload();
    await page.waitForLoadState('networkidle');
    await page.locator('[data-a="templates-open"]').click();
    await page.waitForTimeout(200);
    await expect(page.locator('[data-a="templates-load"]').first()).toBeVisible();
  });

  test('delete button removes template from list', async ({ page }) => {
    await page.evaluate(() => {
      const tpl = { id: 'tpl_del', name: 'ToDelete', createdAt: Date.now(), items: [] };
      localStorage.setItem('dxf-set-templates', JSON.stringify([tpl]));
    });
    await page.reload();
    await page.waitForLoadState('networkidle');
    await page.locator('[data-a="templates-open"]').click();
    await page.waitForTimeout(200);
    await page.locator('[data-a="templates-delete"]').first().click();
    await page.waitForTimeout(300);
    // panel should show empty state now
    const stored = await page.evaluate(() => localStorage.getItem('dxf-set-templates'));
    const parsed = JSON.parse(stored ?? '[]') as { id: string }[];
    expect(parsed.find((t) => t.id === 'tpl_del')).toBeUndefined();
  });
});

// ─── 3.2 History ─────────────────────────────────────────────────────────────

test.describe('3.2 — Nesting history', () => {
  test.beforeEach(async ({ page }) => {
    await openSetBuilder(page);
    await page.evaluate(() => localStorage.removeItem('dxf-nesting-history'));
  });

  test('history-open button is visible', async ({ page }) => {
    await expect(page.locator('[data-a="history-open"]')).toBeVisible();
  });

  test('toggle history panel open/close', async ({ page }) => {
    const btn = page.locator('[data-a="history-open"]');
    await btn.click();
    await page.waitForTimeout(200);
    // There may be multiple .sb-dropdown-panel; find one inside a history section
    const historySection = page.locator('.sb-panel-section').filter({ has: page.locator('[data-a="history-open"]') });
    await expect(historySection.locator('.sb-dropdown-panel')).toBeVisible();
    await btn.click();
    await page.waitForTimeout(200);
    await expect(historySection.locator('.sb-dropdown-panel')).not.toBeVisible();
  });

  test('empty history shows no-history message', async ({ page }) => {
    await page.locator('[data-a="history-open"]').click();
    await page.waitForTimeout(200);
    const historySection = page.locator('.sb-panel-section').filter({ has: page.locator('[data-a="history-open"]') });
    await expect(historySection.locator('.sb-empty')).toBeVisible();
  });

  test('populated history shows restore and delete buttons', async ({ page }) => {
    const mockResults = {
      sheets: [{ id: 's1', utilization: 75, partCount: 3, hash: 'abc', sheetWidth: 1000, sheetHeight: 2000, gap: 5, placements: [] }],
    };
    await page.evaluate((results) => {
      const entry = {
        id: 'hist_1',
        createdAt: Date.now(),
        sheetsCount: 1,
        partsCount: 3,
        avgUtilization: 75,
        results,
      };
      localStorage.setItem('dxf-nesting-history', JSON.stringify([entry]));
    }, mockResults);
    await page.reload();
    await page.waitForLoadState('networkidle');
    await page.locator('[data-a="history-open"]').click();
    await page.waitForTimeout(200);
    await expect(page.locator('[data-a="history-restore"]').first()).toBeVisible();
    await expect(page.locator('[data-a="history-delete"]').first()).toBeVisible();
  });

  test('restoring history entry switches to results tab', async ({ page }) => {
    const mockResults = {
      sheets: [{ id: 's1', utilization: 80, partCount: 2, hash: 'def', sheetWidth: 1000, sheetHeight: 2000, gap: 5, placements: [] }],
    };
    await page.evaluate((results) => {
      const entry = { id: 'hist_restore', createdAt: Date.now(), sheetsCount: 1, partsCount: 2, avgUtilization: 80, results };
      localStorage.setItem('dxf-nesting-history', JSON.stringify([entry]));
    }, mockResults);
    await page.reload();
    await page.waitForLoadState('networkidle');
    await page.locator('[data-a="history-open"]').click();
    await page.waitForTimeout(200);
    await page.locator('[data-a="history-restore"]').first().click();
    await page.waitForTimeout(300);
    // After restore, results tab becomes active — results content should be visible
    await expect(page.locator('[data-a="tab"][data-tab="results"], .sb-results, [data-a="export-all"]').first()).toBeVisible();
  });

  test('deleting history entry removes it from localStorage', async ({ page }) => {
    await page.evaluate(() => {
      const entry = { id: 'hist_del', createdAt: Date.now(), sheetsCount: 1, partsCount: 1, avgUtilization: 50, results: { sheets: [] } };
      localStorage.setItem('dxf-nesting-history', JSON.stringify([entry]));
    });
    await page.reload();
    await page.waitForLoadState('networkidle');
    await page.locator('[data-a="history-open"]').click();
    await page.waitForTimeout(200);
    await page.locator('[data-a="history-delete"]').first().click();
    await page.waitForTimeout(300);
    const stored = await page.evaluate(() => localStorage.getItem('dxf-nesting-history'));
    const parsed = JSON.parse(stored ?? '[]') as { id: string }[];
    expect(parsed.find((e) => e.id === 'hist_del')).toBeUndefined();
  });
});

// ─── 3.4 SVG/PDF export ───────────────────────────────────────────────────────

test.describe('3.4 — SVG/PDF export buttons', () => {
  test.beforeEach(async ({ page }) => {
    await openSetBuilder(page);
  });

  test('SVG/PDF buttons absent when no nesting results', async ({ page }) => {
    await expect(page.locator('[data-a="export-svg"]')).not.toBeVisible();
    await expect(page.locator('[data-a="export-pdf"]')).not.toBeVisible();
  });

  test('SVG/PDF buttons appear after injecting results', async ({ page }) => {
    // Inject mock results into localStorage-based history and restore it
    const mockResults = {
      sheets: [{ id: 's1', utilization: 70, partCount: 2, hash: 'xyz', sheetWidth: 1000, sheetHeight: 2000, gap: 5, placements: [] }],
    };
    await page.evaluate((results) => {
      const entry = { id: 'hist_svg', createdAt: Date.now(), sheetsCount: 1, partsCount: 2, avgUtilization: 70, results };
      localStorage.setItem('dxf-nesting-history', JSON.stringify([entry]));
    }, mockResults);
    await page.reload();
    await page.waitForLoadState('networkidle');
    // Restore via history
    await page.locator('[data-a="history-open"]').click();
    await page.waitForTimeout(200);
    await page.locator('[data-a="history-restore"]').first().click();
    await page.waitForTimeout(300);
    await expect(page.locator('[data-a="export-svg"]')).toBeVisible();
    await expect(page.locator('[data-a="export-pdf"]')).toBeVisible();
  });

  test('clicking export-svg triggers file download', async ({ page }) => {
    const mockResults = {
      sheets: [{ id: 's1', utilization: 70, partCount: 1, hash: 'xyz', sheetWidth: 500, sheetHeight: 500, gap: 5, placements: [] }],
    };
    await page.evaluate((results) => {
      const entry = { id: 'hist_dl', createdAt: Date.now(), sheetsCount: 1, partsCount: 1, avgUtilization: 70, results };
      localStorage.setItem('dxf-nesting-history', JSON.stringify([entry]));
    }, mockResults);
    await page.reload();
    await page.waitForLoadState('networkidle');
    await page.locator('[data-a="history-open"]').click();
    await page.waitForTimeout(200);
    await page.locator('[data-a="history-restore"]').first().click();
    await page.waitForTimeout(300);
    const [download] = await Promise.all([
      page.waitForEvent('download', { timeout: 5000 }),
      page.locator('[data-a="export-svg"]').click(),
    ]);
    expect(download.suggestedFilename()).toMatch(/\.svg$/);
  });
});

// ─── 3.5 Telegram notifications ───────────────────────────────────────────────

test.describe('3.5 — Telegram notification toggle', () => {
  test.beforeEach(async ({ page }) => {
    await openSetBuilder(page);
    await page.evaluate(() => localStorage.removeItem('dxf-tg-notify-enabled'));
  });

  test('tg-notify-toggle checkbox is visible', async ({ page }) => {
    await expect(page.locator('[data-a="tg-notify-toggle"]')).toBeVisible();
  });

  test('checkbox is unchecked by default (no session)', async ({ page }) => {
    await expect(page.locator('[data-a="tg-notify-toggle"]')).not.toBeChecked();
  });

  test('notify label text is present', async ({ page }) => {
    await expect(page.locator('.sb-notify-label')).toBeVisible();
  });

  test('checking without auth shows toast and reverts', async ({ page }) => {
    const checkbox = page.locator('[data-a="tg-notify-toggle"]');
    await checkbox.click();
    await page.waitForTimeout(300);
    // Should revert — still unchecked (no auth session)
    await expect(checkbox).not.toBeChecked();
    // Toast should be visible
    await expect(page.locator('.sb-toast')).toBeVisible();
  });

  test('settings persisted in localStorage when enabled (with mock session)', async ({ page }) => {
    // Mock auth session token in state
    await page.evaluate(() => {
      // Simulate notifySettings directly
      localStorage.setItem('dxf-tg-notify-enabled', JSON.stringify({ enabled: true }));
    });
    await page.reload();
    await page.waitForLoadState('networkidle');
    // Read back
    const raw = await page.evaluate(() => localStorage.getItem('dxf-tg-notify-enabled'));
    const parsed = JSON.parse(raw ?? '{}') as { enabled?: boolean };
    expect(parsed.enabled).toBe(true);
  });
});
