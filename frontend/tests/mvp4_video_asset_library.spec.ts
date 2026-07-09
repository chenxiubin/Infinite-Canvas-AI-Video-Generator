import { test, expect } from '@playwright/test';

test.describe('MVP-4 10I Video Asset Library', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    const wbBtn = page.getByRole('button', { name: '生产工作台' });
    if (await wbBtn.isVisible({ timeout: 5000 }).catch(() => false)) await wbBtn.click();
    await expect(page.getByTestId('mvp3-workbench')).toBeVisible({ timeout: 10000 });
  });

  test('10I-01: asset panel has image/video tabs', async ({ page }) => {
    test.setTimeout(30000);
    await page.getByTestId('sidebar-icon-assets').hover();
    await expect(page.getByTestId('workflow-sidebar-expanded')).toBeVisible({ timeout: 5000 });
    await expect(page.getByTestId('asset-tab-image')).toBeAttached({ timeout: 3000 });
    await expect(page.getByTestId('asset-tab-video')).toBeAttached({ timeout: 3000 });
  });

  test('10I-02: video tab shows empty state by default', async ({ page }) => {
    test.setTimeout(30000);
    await page.getByTestId('sidebar-icon-assets').hover();
    await page.getByTestId('asset-tab-video').click();
    await expect(page.getByTestId('video-asset-library-panel')).toBeVisible({ timeout: 3000 });
    await expect(page.getByTestId('video-asset-library-panel')).toContainText('暂无视频素材');
  });

  test('10I-03: full demo populates video library with shot groups', async ({ page }) => {
    test.setTimeout(60000);
    // Run full demo
    await page.getByTestId('run-full-demo-button').click();
    // Wait for demo to complete (status bar updates)
    await expect(page.getByTestId('production-status-compact')).toBeAttached({ timeout: 30000 });
    // Check video library
    await page.getByTestId('sidebar-icon-assets').hover();
    await page.getByTestId('asset-tab-video').click();
    await expect(page.getByTestId('video-asset-library-panel')).toBeVisible({ timeout: 5000 });
    // Should have per-shot groups with version entries
    await expect(page.locator('[data-testid^="video-shot-group-"]').first()).toBeAttached({ timeout: 5000 });
    // Current badge should show "当前使用中"
    await expect(page.locator('[data-testid^="video-current-badge-"]').first()).toContainText('当前使用中');
    // Fixed video result nodes should show version labels
    await expect(page.getByTestId('fixed-video-node-label-S01_main')).toBeAttached({ timeout: 5000 });
  });

  test('10I-04: fixed video result node shows version and approved status after demo', async ({ page }) => {
    test.setTimeout(60000);
    await page.getByTestId('run-full-demo-button').click();
    await expect(page.getByTestId('production-status-compact')).toBeAttached({ timeout: 30000 });
    // Check fixed video node shows v1 and approved
    await expect(page.getByTestId('fixed-video-node-label-S01_main')).toBeAttached({ timeout: 8000 });
    await expect(page.getByTestId('fixed-video-node-status-S01_main')).toContainText('已通过');
    // Merge node should be mergeable (all approved)
    await expect(page.getByTestId('merge-node-status')).toContainText('已通过');
  });

  test('10I-05: image tab still works after video tab added', async ({ page }) => {
    test.setTimeout(30000);
    await page.getByTestId('sidebar-icon-assets').hover();
    // Switch to video and back to image
    await page.getByTestId('asset-tab-video').click();
    await page.getByTestId('asset-tab-image').click();
    // Image panel should show empty state
    await expect(page.getByTestId('image-asset-library-panel')).toBeVisible({ timeout: 3000 });
    await expect(page.getByTestId('image-asset-library-panel')).toContainText('暂无图片素材');
  });

  test('10I-06: inspector shows current video info for selected shot', async ({ page }) => {
    test.setTimeout(60000);
    await page.getByTestId('run-full-demo-button').click();
    await expect(page.getByTestId('production-status-compact')).toBeAttached({ timeout: 30000 });
    // Open video library to verify S01_main video exists, then select via inspector
    await page.getByTestId('sidebar-icon-assets').hover();
    await page.getByTestId('asset-tab-video').click();
    await expect(page.getByTestId('video-version-card-S01_main-v1')).toBeAttached({ timeout: 5000 });
    // Select shot node: focus canvas, reset view, click
    await page.locator('.react-flow__pane').click({ position: { x: 400, y: 200 } });
    await page.getByTestId('canvas-reset-view').click();
    await page.locator('.react-flow__pane').waitFor({ state: 'visible', timeout: 3000 });
    await page.getByTestId('shot-control-node-S01_main').scrollIntoViewIfNeeded();
    await page.getByTestId('shot-control-node-S01_main').click({ timeout: 15000 });
    // Inspector should show current video info
    await expect(page.getByTestId('inspector-current-video')).toBeAttached({ timeout: 8000 });
    await expect(page.getByTestId('inspector-current-video')).toContainText('v1');
  });

  test('10I-07: optional size ref shot included in video library when enabled', async ({ page }) => {
    test.setTimeout(60000);
    await page.getByTestId('sidebar-icon-productLine').hover();
    await expect(page.getByTestId('workflow-sidebar-expanded')).toBeVisible({ timeout: 5000 });
    await page.getByTestId('optional-shot-toggle').check();
    await page.getByTestId('run-full-demo-button').click();
    await expect(page.getByTestId('production-status-compact')).toBeAttached({ timeout: 30000 });
    await page.getByTestId('sidebar-icon-assets').hover();
    await page.getByTestId('asset-tab-video').click();
    await expect(page.getByTestId('video-shot-group-S07_size_ref')).toBeAttached({ timeout: 5000 });
    await expect(page.getByTestId('fixed-video-node-label-S07_size_ref')).toBeAttached({ timeout: 5000 });
  });

  test('10I-08: after full demo, merge node shows approved count', async ({ page }) => {
    test.setTimeout(60000);
    await page.getByTestId('run-full-demo-button').click();
    await expect(page.getByTestId('production-status-compact')).toBeAttached({ timeout: 30000 });
    await expect(page.getByTestId('merge-node-status')).toContainText('已通过');
    const statusText = await page.getByTestId('merge-node-status').textContent();
    expect(statusText).toContain('/');
  });

  test('10I-09: demo v1 approved, generate v2 pending, 设为当前 switches back', async ({ page }) => {
    test.setTimeout(120000);
    // Demo → v1 approved current for all 6 shots
    await page.getByTestId('run-full-demo-button').click();
    await expect(page.getByTestId('production-status-compact')).toBeAttached({ timeout: 60000 });

    // Click S01 generate button → creates v2 pending as current
    await page.locator('.react-flow__pane').click({ position: { x: 400, y: 200 } });
    await page.getByTestId('canvas-reset-view').click();
    await page.locator('.react-flow__pane').waitFor({ state: 'visible', timeout: 3000 });
    await page.getByTestId('shot-control-node-S01_main').scrollIntoViewIfNeeded();
    await page.getByTestId('shot-control-generate-S01_main').click({ timeout: 15000 });

    // Open video library in sidebar
    await page.getByTestId('sidebar-icon-assets').hover();
    await page.getByTestId('asset-tab-video').click();
    await expect(page.getByTestId('video-asset-library-panel')).toBeVisible({ timeout: 5000 });

    // Both v1 (demo approved) and v2 (single-gen pending) cards exist
    await expect(page.getByTestId('video-version-card-S01_main-v1')).toBeAttached({ timeout: 5000 });
    await expect(page.getByTestId('video-version-card-S01_main-v2')).toBeAttached({ timeout: 10000 });

    // v2 (pending) is current → badge "当前使用中"
    await expect(page.getByTestId('video-current-badge-S01_main-v2')).toContainText('当前使用中');
    // v1 (approved, not current) → has "设为当前" button
    await expect(page.getByTestId('video-set-current-S01_main-v1')).toBeAttached({ timeout: 5000 });

    // Close sidebar (move mouse to canvas), then check FixedVideoResultNode shows v2 pending
    await page.locator('.react-flow__pane').hover();
    await page.getByTestId('shot-control-node-S01_main').scrollIntoViewIfNeeded();
    await expect(page.getByTestId('fixed-video-node-status-S01_main')).toContainText('待审核');
    await expect(page.getByTestId('fixed-video-node-label-S01_main')).toContainText('v2');

    // Select S01 shot → Inspector shows v2 pending
    await page.getByTestId('shot-control-node-S01_main').click();
    await expect(page.getByTestId('inspector-current-video')).toBeAttached({ timeout: 8000 });
    await expect(page.getByTestId('inspector-current-video')).toContainText('待审');

    // Re-open sidebar, click "设为当前" on v1
    await page.getByTestId('sidebar-icon-assets').hover();
    await page.getByTestId('asset-tab-video').click();
    await expect(page.getByTestId('video-set-current-S01_main-v1')).toBeAttached({ timeout: 5000 });
    await page.getByTestId('video-set-current-S01_main-v1').click();

    // v1 now shows current badge in sidebar
    await expect(page.getByTestId('video-current-badge-S01_main-v1')).toContainText('当前使用中');

    // Close sidebar, check FixedVideoResultNode switches back to v1 approved
    await page.locator('.react-flow__pane').hover();
    await expect(page.getByTestId('fixed-video-node-status-S01_main')).toContainText('已通过');
    await expect(page.getByTestId('fixed-video-node-label-S01_main')).toContainText('v1');

    // Inspector switches back to v1 approved (node still selected from earlier click)
    await expect(page.getByTestId('inspector-current-video')).toContainText('已通过');
  });

  test('10I-10: merge approved after demo, generate pending current, 设为当前 re-enables', async ({ page }) => {
    test.setTimeout(120000);
    // Demo → all 6 shots approved, MergeNode shows all passed
    await page.getByTestId('run-full-demo-button').click();
    await expect(page.getByTestId('production-status-compact')).toBeAttached({ timeout: 60000 });
    await expect(page.getByTestId('merge-node-status')).toContainText('6/6 已通过');

    // Generate v2 pending for S01 → v2 becomes current, v1 becomes history
    await page.locator('.react-flow__pane').click({ position: { x: 400, y: 200 } });
    await page.getByTestId('canvas-reset-view').click();
    await page.getByTestId('shot-control-node-S01_main').scrollIntoViewIfNeeded();
    await page.getByTestId('shot-control-generate-S01_main').click({ timeout: 15000 });

    // Open video library
    await page.getByTestId('sidebar-icon-assets').hover();
    await page.getByTestId('asset-tab-video').click();
    await expect(page.getByTestId('video-asset-library-panel')).toBeVisible({ timeout: 5000 });

    // v2 (pending) is current, v1 (approved) is in history but not current
    await expect(page.getByTestId('video-version-card-S01_main-v2')).toBeAttached({ timeout: 10000 });
    await expect(page.getByTestId('video-current-badge-S01_main-v2')).toContainText('当前使用中');
    // v1 approved is in history, has "设为当前" button — does NOT participate in merge
    await expect(page.getByTestId('video-set-current-S01_main-v1')).toBeAttached({ timeout: 5000 });

    // MergeNode shows partial — S01 v2 pending removes 1 from approved count
    await expect(page.getByTestId('merge-node-status')).toContainText('5/6 已通过');

    // Click "设为当前" on v1 approved to restore full merge readiness
    await page.getByTestId('video-set-current-S01_main-v1').click();

    // v1 is current again
    await expect(page.getByTestId('video-current-badge-S01_main-v1')).toContainText('当前使用中');

    // After restoring approved v1 as current, MergeNode shows all approved again
    await expect(page.getByTestId('merge-node-status')).toContainText('6/6 已通过');
  });
});
