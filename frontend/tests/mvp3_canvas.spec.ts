import { test, expect } from '@playwright/test';

test.describe('MVP-3 Canvas View', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForTimeout(2000);
    const wbBtn = page.getByRole('button', { name: '生产工作台' });
    await expect(wbBtn).toBeVisible({ timeout: 10000 });
    await wbBtn.click();
    await expect(page.getByTestId('mvp3-workbench')).toBeVisible({ timeout: 10000 });
  });

  test('M3-Canvas: happy path with node visualization', async ({ page }) => {
    test.setTimeout(90000);

    // Setup: Demo + template + batch + generate (via form)
    await page.getByTestId('create-demo-product-button').click();
    await expect(page.getByTestId('checklist-ready')).toBeVisible({ timeout: 20000 });
    await page.getByTestId('template-desk_calendar').first().click();
    await expect(page.getByTestId('create-video-batch-button')).toBeEnabled({ timeout: 5000 });
    await page.getByTestId('create-video-batch-button').click();
    await expect(page.getByTestId('batch-id')).toBeVisible({ timeout: 10000 });
    await page.getByTestId('generate-batch-button').click();

    // Wait for batch completion via backend poll
    const bidTxt = (await page.getByTestId('batch-id').textContent()) || '';
    const bid = bidTxt.replace('batch_id: ', '').trim();
    const ok = await page.evaluate(async (b) => {
      for (let i = 0; i < 30; i++) {
        const r = await fetch(`/api/v1/video-batches/${b}`);
        if ((await r.json()).status === 'completed') return true;
        await new Promise(res => setTimeout(res, 1000));
      }
      return false;
    }, bid);
    if (!ok) throw new Error('Batch not completed');

    // Switch to canvas view
    await page.getByTestId('workbench-tab-canvas').click();
    await expect(page.getByTestId('production-canvas-view')).toBeVisible({ timeout: 5000 });

    // Verify 6 nodes appear
    for (const sk of ['S01_main','S02_detail1','S03_detail2','S04_motion','S05_scene','S06_brand']) {
      await expect(page.getByTestId(`canvas-node-${sk}`)).toBeVisible({ timeout: 5000 });
    }

    // Verify node statuses show success
    for (const sk of ['S01_main','S02_detail1','S03_detail2','S04_motion','S05_scene','S06_brand']) {
      await expect(page.getByTestId(`canvas-node-status-${sk}`)).toContainText('success', { timeout: 15000 });
    }

    // Click a node to open detail panel
    await page.getByTestId('canvas-node-S01_main').click();
    await expect(page.getByTestId('canvas-node-detail-panel')).toBeVisible({ timeout: 5000 });
    await expect(page.getByTestId('canvas-detail-shot-key')).toContainText('S01_main');
    await expect(page.getByTestId('canvas-detail-status')).toContainText('success');
    await expect(page.getByTestId('canvas-detail-video-url')).not.toBeEmpty();

    // Approve from detail panel
    await page.getByTestId('canvas-detail-approve-button').click();
    await page.waitForTimeout(1500);

    // Switch to form, approve all (need merge preview first)
    await page.getByTestId('workbench-tab-form').click();
    // Generate merge preview then approve all
    await page.getByTestId('merge-preview-button').click();
    await page.waitForTimeout(1000);
    await page.getByTestId('approve-all-button').click();
    await page.waitForTimeout(1000);

    // Switch back to canvas to see updated review status
    await page.getByTestId('workbench-tab-canvas').click();
    await expect(page.getByTestId('production-canvas-view')).toBeVisible({ timeout: 5000 });
    await expect(page.getByTestId('canvas-node-review-S01_main')).toContainText('approved', { timeout: 10000 });
  });

  test('M3-Canvas: node detail panel', async ({ page }) => {
    test.setTimeout(90000);

    // Setup: Demo + template + batch + generate
    await page.getByTestId('create-demo-product-button').click();
    await expect(page.getByTestId('checklist-ready')).toBeVisible({ timeout: 20000 });
    await page.getByTestId('template-desk_calendar').first().click();
    await expect(page.getByTestId('create-video-batch-button')).toBeEnabled({ timeout: 5000 });
    await page.getByTestId('create-video-batch-button').click();
    await expect(page.getByTestId('batch-id')).toBeVisible({ timeout: 10000 });
    await page.getByTestId('generate-batch-button').click();
    const bidTxt = (await page.getByTestId('batch-id').textContent()) || '';
    const bid = bidTxt.replace('batch_id: ', '').trim();
    const ok = await page.evaluate(async (b) => {
      for (let i = 0; i < 30; i++) {
        const r = await fetch(`/api/v1/video-batches/${b}`);
        if ((await r.json()).status === 'completed') return true;
        await new Promise(res => setTimeout(res, 1000));
      }
      return false;
    }, bid);
    if (!ok) throw new Error('Batch not completed');

    // Switch to canvas
    await page.getByTestId('workbench-tab-canvas').click();
    await expect(page.getByTestId('production-canvas-view')).toBeVisible({ timeout: 5000 });

    // Click S04_motion node — wait for React to render detail panel
    await page.getByTestId('canvas-node-S04_motion').click();
    await expect(page.getByTestId('canvas-node-detail-panel')).toBeVisible({ timeout: 10000 });
    await page.waitForTimeout(300);

    // Detail panel assertions
    await expect(page.getByTestId('canvas-detail-shot-key')).toContainText('S04_motion');
    // The status may take a moment to appear in the detail panel
    await expect(page.locator('[data-testid="canvas-detail-status"]')).toBeVisible({ timeout: 10000 });
    await expect(page.getByTestId('canvas-detail-status')).toContainText('success', { timeout: 5000 });
    await expect(page.getByTestId('canvas-detail-review-status')).toBeVisible();
    // Verify asset info and prompt are present
    const panel = page.getByTestId('canvas-node-detail-panel');
    await expect(panel).toContainText('bound_asset_role');
    await expect(panel).toContainText('bound_asset_source');
    await expect(panel).toContainText('prompt');

    // Approve via detail panel
    await page.getByTestId('canvas-detail-approve-button').click();
    await page.waitForTimeout(1500);
    await expect(page.getByTestId('canvas-node-review-S04_motion')).toContainText('approved', { timeout: 10000 });

    // Reject with reason (need to re-open detail panel since data refreshes)
    await page.getByTestId('canvas-node-S04_motion').click();
    await page.getByTestId('canvas-detail-reject-reason').fill('test quality issue');
    await page.getByTestId('canvas-detail-reject-button').click();
    await page.waitForTimeout(1500);
    // After reject, review should show rejected
    await page.getByTestId('canvas-node-S04_motion').click();
    await expect(page.getByTestId('canvas-detail-review-status')).toContainText('rejected', { timeout: 10000 });

    // Verify no error message
    const errEl = page.getByTestId('canvas-detail-error-message');
    expect(await errEl.isVisible().catch(() => false)).toBeFalsy();
  });

  test('M3-Canvas: zoom controls', async ({ page }) => {
    test.setTimeout(30000);

    // Setup: Demo + batch so nodes exist
    await page.getByTestId('create-demo-product-button').click();
    await expect(page.getByTestId('checklist-ready')).toBeVisible({ timeout: 20000 });
    await page.getByTestId('template-desk_calendar').first().click();
    await page.getByTestId('create-video-batch-button').click();
    await expect(page.getByTestId('batch-id')).toBeVisible({ timeout: 10000 });

    // Switch to canvas
    await page.getByTestId('workbench-tab-canvas').click();
    await expect(page.getByTestId('production-canvas-view')).toBeVisible({ timeout: 5000 });
    await expect(page.getByTestId('canvas-node-S01_main')).toBeVisible({ timeout: 5000 });

    // Zoom controls — just verify they're clickable and view stays
    await page.getByTestId('canvas-zoom-in').click();
    await expect(page.getByTestId('canvas-node-S01_main')).toBeVisible({ timeout: 3000 });
    await page.getByTestId('canvas-zoom-out').click();
    await expect(page.getByTestId('canvas-node-S01_main')).toBeVisible({ timeout: 3000 });
    await page.getByTestId('canvas-reset-view').click();
    await expect(page.getByTestId('canvas-node-S01_main')).toBeVisible({ timeout: 3000 });
  });

  test('M3-Canvas: empty state when no batch', async ({ page }) => {
    test.setTimeout(30000);
    await page.getByTestId('workbench-tab-canvas').click();
    await expect(page.getByTestId('production-canvas-view')).toBeVisible({ timeout: 5000 });
    await expect(page.locator('text=请先创建 video batch')).toBeVisible({ timeout: 5000 });
  });
});
