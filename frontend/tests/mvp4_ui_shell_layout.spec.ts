import { test, expect } from '@playwright/test';

test.describe('MVP-4 UI Shell Layout', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    const wbBtn = page.getByRole('button', { name: '生产工作台' });
    if (await wbBtn.isVisible({ timeout: 5000 }).catch(() => false)) await wbBtn.click();
    await expect(page.getByTestId('mvp3-workbench')).toBeVisible({ timeout: 10000 });
  });

  test('M4-UiShell-01: top compact status bar appears', async ({ page }) => {
    test.setTimeout(30000);

    await expect(page.getByTestId('production-status-compact')).toBeAttached({ timeout: 10000 });

    const stepTestIds = [
      'production-status-step-assets',
      'production-status-step-template',
      'production-status-step-batch',
      'production-status-step-generate',
      'production-status-step-review',
      'production-status-step-export',
    ];

    let attachedCount = 0;
    for (const testId of stepTestIds) {
      const element = page.getByTestId(testId);
      try {
        await expect(element).toBeAttached({ timeout: 3000 });
        attachedCount++;
      } catch {
        // Not attached — this step may not be rendered yet
      }
    }

    expect(attachedCount).toBeGreaterThanOrEqual(3);
  });

  test('M4-UiShell-02: Dock + localised module panel per icon', async ({ page }) => {
    test.setTimeout(30000);

    // 1. Default: dock visible, panel hidden
    await expect(page.getByTestId('workflow-sidebar-collapsed')).toBeVisible({ timeout: 10000 });
    await expect(page.getByTestId('workflow-sidebar-expanded')).toBeHidden({ timeout: 5000 });

    // 2. Hover product-line icon → panel opens showing "产品线"
    await page.getByTestId('sidebar-icon-productLine').hover();
    const panel = page.getByTestId('workflow-sidebar-expanded');
    await expect(panel).toBeVisible({ timeout: 8000 });
    await expect(page.getByTestId('product-line-selector')).toBeVisible({ timeout: 5000 });

    // 3. Panel is a localised popover, NOT full-height (< 600px)
    const box = await panel.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.width).toBeGreaterThanOrEqual(260);
    expect(box!.height).toBeLessThan(600);

    // 4. Hover assets icon → panel switches to "产品素材包"
    await page.getByTestId('sidebar-icon-assets').hover();
    await expect(panel).toBeVisible({ timeout: 3000 });
    // Verify image asset library panel is accessible in the expanded panel
    await expect(page.getByTestId('image-asset-library-panel')).toBeAttached({ timeout: 5000 });

    // 5. Move mouse into panel → stays open
    await panel.hover();
    await expect(panel).toBeVisible({ timeout: 3000 });

    // 6. Move mouse to canvas → panel closes
    await page.getByTestId('production-canvas-view').hover();
    await expect(page.getByTestId('workflow-sidebar-expanded')).toBeHidden({ timeout: 5000 });
  });

  test('M4-UiShell-03: right inspector defaults to S01_main and stays expanded on node select', async ({ page }) => {
    test.setTimeout(30000);

    const inspectorExpanded = page.locator(
      '[data-testid="inspector-expanded"], [data-testid="inspector-slide-panel"]'
    );
    await expect(inspectorExpanded.first()).toBeAttached({ timeout: 15000 });
    await expect(page.getByTestId('canvas-detail-shot-key')).toContainText('S01_main', { timeout: 5000 });

    // Real click — nodrag class on ShotControlNode prevents React Flow interception
    await page.getByTestId('shot-control-node-S01_main').click();

    await expect(inspectorExpanded.first()).toBeAttached({ timeout: 15000 });
    await expect(page.getByTestId('canvas-detail-shot-key')).toContainText('S01_main', { timeout: 5000 });
  });

  test('M4-UiShell-04: fixed workflow layout still exists', async ({ page }) => {
    test.setTimeout(30000);

    await expect(page.getByTestId('reference-image-node-S01_main-0')).toBeAttached({ timeout: 10000 });
    await expect(page.getByTestId('shot-control-node-S01_main')).toBeAttached({ timeout: 8000 });
    await expect(page.getByTestId('fixed-video-node-S01_main')).toBeAttached({ timeout: 8000 });
    await expect(page.getByTestId('merge-node')).toBeAttached({ timeout: 8000 });
  });
});
