import { test, expect } from '@playwright/test';

test.describe('MVP-4 Video Preview Node', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    const wbBtn = page.getByRole('button', { name: '生产工作台' });
    if (await wbBtn.isVisible({ timeout: 5000 }).catch(() => false)) await wbBtn.click();
    await expect(page.getByTestId('mvp3-workbench')).toBeVisible({ timeout: 10000 });
  });

  test('M4-VideoPreview-01: fixed video result node shows current video after demo', async ({ page }) => {
    test.setTimeout(60000);
    await page.getByTestId('run-full-demo-button').click();
    await expect(page.getByTestId('production-status-compact')).toBeAttached({ timeout: 30000 });
    // Fixed video nodes show version labels and approved status
    await expect(page.getByTestId('fixed-video-node-label-S01_main')).toBeAttached({ timeout: 8000 });
    await expect(page.getByTestId('fixed-video-node-status-S01_main')).toContainText('已通过');
    await expect(page.getByTestId('fixed-video-node-label-S02_detail1')).toBeAttached({ timeout: 5000 });
  });

  test('M4-VideoPreview-02: merge node becomes mergeable after all approved', async ({ page }) => {
    test.setTimeout(60000);
    await page.getByTestId('run-full-demo-button').click();
    await expect(page.getByTestId('production-status-compact')).toBeAttached({ timeout: 30000 });
    await expect(page.getByTestId('merge-node-status')).toContainText('已通过');
  });

  test('M4-VideoPreview-03: inspector shows video info for selected shot after demo', async ({ page }) => {
    test.setTimeout(60000);
    await page.getByTestId('run-full-demo-button').click();
    await expect(page.getByTestId('production-status-compact')).toBeAttached({ timeout: 30000 });
    await page.getByTestId('shot-control-node-S01_main').scrollIntoViewIfNeeded();
    await page.getByTestId('shot-control-node-S01_main').click();
    await expect(page.getByTestId('inspector-current-video')).toBeAttached({ timeout: 8000 });
    await expect(page.getByTestId('inspector-current-video')).toContainText('v1');
  });

  test('M4-VideoPreview-04: all fixed video nodes show after demo for each shot', async ({ page }) => {
    test.setTimeout(60000);
    await page.getByTestId('run-full-demo-button').click();
    await expect(page.getByTestId('production-status-compact')).toBeAttached({ timeout: 30000 });
    for (const sk of ['S01_main','S02_detail1','S03_detail2','S04_motion','S05_scene','S06_brand']) {
      await expect(page.getByTestId(`fixed-video-node-label-${sk}`)).toBeAttached({ timeout: 5000 });
    }
  });
});
