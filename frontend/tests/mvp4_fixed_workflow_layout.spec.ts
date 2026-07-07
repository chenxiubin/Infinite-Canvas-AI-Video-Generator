import { test, expect } from '@playwright/test';

test.describe('MVP-4 Fixed Workflow Layout', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    const wbBtn = page.getByRole('button', { name: '生产工作台' });
    if (await wbBtn.isVisible({ timeout: 5000 }).catch(() => false)) await wbBtn.click();
    await expect(page.getByTestId('mvp3-workbench')).toBeVisible({ timeout: 10000 });
  });

  test('M4-FixedLayout-01: desk calendar layout has all layers', async ({ page }) => {
    test.setTimeout(30000);
    // Reference image layer: at least S01 has ref node
    await expect(page.getByTestId('reference-image-node-S01_main-0')).toBeAttached({ timeout: 10000 });
    // Shot control layer
    await expect(page.getByTestId('shot-control-node-S01_main')).toBeAttached({ timeout: 8000 });
    // Video result layer
    await expect(page.getByTestId('fixed-video-node-S01_main')).toBeAttached({ timeout: 8000 });
    // Merge node
    await expect(page.getByTestId('merge-node')).toBeAttached({ timeout: 8000 });
  });

  test('M4-FixedLayout-02: S04 has 2 reference image nodes', async ({ page }) => {
    test.setTimeout(30000);
    await expect(page.getByTestId('reference-image-node-S04_motion-0')).toBeAttached({ timeout: 10000 });
    await expect(page.getByTestId('reference-image-node-S04_motion-1')).toBeAttached({ timeout: 10000 });
  });

  test('M4-FixedLayout-03: switch to wall calendar shows wall layout', async ({ page }) => {
    test.setTimeout(30000);
    await page.getByTestId('product-line-wall-calendar').click();
    await expect(page.getByTestId('current-product-line-label')).toContainText('挂历', { timeout: 5000 });
    await expect(page.getByTestId('shot-control-node-S01_main')).toBeAttached({ timeout: 10000 });
    await expect(page.getByTestId('fixed-video-node-S05_scene')).toBeAttached({ timeout: 8000 });
  });

  test('M4-FixedLayout-04: click shot control node opens Inspector', async ({ page }) => {
    test.setTimeout(30000);
    // Click the canvas shot-control-node directly
    await page.getByTestId('shot-control-node-S01_main').click({ force: true });
    await expect(page.getByTestId('canvas-node-detail-panel')).toBeVisible({ timeout: 8000 });
    await expect(page.getByTestId('canvas-detail-shot-key')).toContainText('S01_main', { timeout: 5000 });
  });
});
