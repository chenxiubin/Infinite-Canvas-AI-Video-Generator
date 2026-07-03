import { test, expect } from '@playwright/test';

test.describe('MVP-3 Demo Flow', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForTimeout(2000);
    const wbBtn = page.getByRole('button', { name: '生产工作台' });
    await expect(wbBtn).toBeVisible({ timeout: 10000 });
    await wbBtn.click();
    await expect(page.getByTestId('mvp3-workbench')).toBeVisible({ timeout: 10000 });
  });

  test('M3-Demo: full demo flow', async ({ page }) => {
    test.setTimeout(60000);

    // Click one-click demo
    await page.getByTestId('run-full-demo-button').click();

    // Wait for demo complete message
    await expect(page.getByTestId('demo-complete-message')).toBeVisible({ timeout: 30000 });

    // Verify demo step log has entries
    const log = page.getByTestId('demo-step-log');
    await expect(log).toContainText('product created');
    await expect(log).toContainText('mock export completed');

    // Verify status summary cards
    await expect(page.getByTestId('summary-product-status')).toContainText('ready');
    await expect(page.getByTestId('summary-template-status')).toContainText('selected');
    await expect(page.getByTestId('summary-node-status')).toContainText('6/6 success');
    await expect(page.getByTestId('summary-review-status')).toContainText('approved');
    await expect(page.getByTestId('summary-export-status')).toContainText('success');

    // Verify final_video_url visible
    await expect(page.getByTestId('final-video-url')).toContainText('/mock-exports/', { timeout: 10000 });
  });

  test('M3-Demo: canvas after full demo', async ({ page }) => {
    test.setTimeout(60000);

    await page.getByTestId('run-full-demo-button').click();
    await expect(page.getByTestId('demo-complete-message')).toBeVisible({ timeout: 30000 });

    // Switch to canvas
    await page.getByTestId('workbench-tab-canvas').click();
    await expect(page.getByTestId('production-canvas-view')).toBeVisible({ timeout: 8000 });

    // Verify canvas shows success nodes and export URL
    for (const sk of ['S01_main','S02_detail1','S03_detail2','S04_motion','S05_scene','S06_brand']) {
      await expect(page.getByTestId(`canvas-node-status-${sk}`)).toContainText('success', { timeout: 10000 });
    }
    await expect(page.getByTestId('canvas-final-video-url')).toContainText('/mock-exports/', { timeout: 10000 });
    await expect(page.getByTestId('canvas-draft-preview-url')).toContainText('/mock-previews/', { timeout: 5000 });
  });

  test('M3-Demo: reset local state', async ({ page }) => {
    test.setTimeout(30000);

    await page.getByTestId('run-full-demo-button').click();
    await expect(page.getByTestId('demo-complete-message')).toBeVisible({ timeout: 30000 });

    // Click reset
    await page.getByTestId('reset-current-state-button').click();

    // Verify state is cleared
    await expect(page.getByTestId('product-id')).not.toBeVisible();
    await expect(page.getByTestId('batch-id')).not.toBeVisible();
    await expect(page.getByTestId('final-video-url')).not.toBeVisible();
    await expect(page.getByTestId('summary-product-status')).toContainText('未创建');
  });
});
