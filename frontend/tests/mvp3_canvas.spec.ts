import { test, expect } from '@playwright/test';

const shotKeys = ['S01_main','S02_detail1','S03_detail2','S04_motion','S05_scene','S06_brand'];

test.describe('MVP-3 Canvas View', () => {
  test.beforeEach(async ({ page, context }) => {
    await context.clearCookies();
    await page.goto('/', { waitUntil: 'networkidle' });
    await page.waitForTimeout(2000);
    const wbBtn = page.getByRole('button', { name: '生产工作台' });
    await expect(wbBtn).toBeVisible({ timeout: 10000 });
    await wbBtn.click();
    await expect(page.getByTestId('mvp3-workbench')).toBeVisible({ timeout: 10000 });
  });

  async function setupGeneratedBatch(page: any) {
    await page.getByTestId('create-demo-product-button').click();
    await expect(page.getByTestId('checklist-ready')).toBeVisible({ timeout: 20000 });
    await page.getByTestId('template-desk_calendar').first().click();
    await expect(page.getByTestId('create-video-batch-button')).toBeEnabled({ timeout: 5000 });
    await page.getByTestId('create-video-batch-button').click();
    await expect(page.getByTestId('batch-id')).toBeVisible({ timeout: 10000 });
    // Click generate — handleGenerate blocks until all nodes complete (~18s)
    await page.getByTestId('generate-batch-button').click();
  }

  async function switchToCanvas(page: any, checkNodes = true) {
    await page.getByTestId('workbench-tab-canvas').click();
    await expect(page.getByTestId('production-canvas-view')).toBeVisible({ timeout: 8000 });
    if (checkNodes) {
      for (const sk of shotKeys) {
        await expect(page.getByTestId(`shot-control-node-${sk}`)).toBeAttached({ timeout: 5000 });
      }
    }
  }

  test('M3-Canvas: full happy path with export visible', async ({ page }) => {
    test.setTimeout(120000);
    await setupGeneratedBatch(page);
    // Wait for UI state to reflect completion via hidden status spans
    for (const sk of shotKeys) {
      await expect(page.getByTestId(`canvas-node-status-${sk}`)).toContainText('success', { timeout: 60000 });
    }
    await page.getByTestId('workbench-tab-form').click();
    // Approve all before merge (merge requires all required shots approved)
    await page.getByTestId('approve-all-button').click();
    await expect(page.getByTestId('instance-review-status')).toContainText('approved', { timeout: 15000 });
    await expect(page.getByTestId('merge-preview-button')).toBeVisible({ timeout: 5000 });
    await page.getByTestId('merge-preview-button').click();
    await expect(page.getByTestId('draft-preview-url')).toContainText('/mock-previews/', { timeout: 15000 });
    // Re-approve after merge (merge resets review_status to pending)
    await page.getByTestId('approve-all-button').click();
    await expect(page.getByTestId('instance-review-status')).toContainText('approved', { timeout: 15000 });
    await expect(page.getByTestId('export-button')).toBeEnabled({ timeout: 5000 });
    await page.getByTestId('export-button').click();
    await expect(page.getByTestId('final-video-url')).toContainText('/mock-exports/', { timeout: 15000 });

    await page.getByTestId('workbench-tab-canvas').click();
    await expect(page.getByTestId('production-canvas-view')).toBeVisible({ timeout: 5000 });
    await expect(page.getByTestId('canvas-final-video-url')).toContainText('/mock-exports/', { timeout: 10000 });
    await expect(page.getByTestId('canvas-draft-preview-url')).toContainText('/mock-previews/', { timeout: 5000 });
    for (const sk of shotKeys) {
      await expect(page.getByTestId(`canvas-node-review-${sk}`)).toContainText('approved', { timeout: 10000 });
    }
  });

  test('M3-Canvas: pending nodes before generate', async ({ page }) => {
    test.setTimeout(30000);
    await page.getByTestId('create-demo-product-button').click();
    await expect(page.getByTestId('checklist-ready')).toBeVisible({ timeout: 20000 });
    await page.getByTestId('template-desk_calendar').first().click();
    await page.getByTestId('create-video-batch-button').click();
    await expect(page.getByTestId('batch-id')).toBeVisible({ timeout: 10000 });
    await switchToCanvas(page);
    for (const sk of shotKeys) {
      await expect(page.getByTestId(`canvas-node-status-${sk}`)).toContainText('pending', { timeout: 5000 });
    }
  });

  test('M3-Canvas: node detail panel operations', async ({ page }) => {
    test.setTimeout(90000);
    await setupGeneratedBatch(page);
    await switchToCanvas(page);

    // Open S04_motion detail panel via sidebar shot list (nodes may be off-viewport in fixed layout)
    await page.getByTestId('workflow-shot-S04_motion').click();
    await page.waitForTimeout(500);
    await expect(page.getByTestId('canvas-node-detail-panel')).toBeVisible({ timeout: 10000 });

    const panel = page.getByTestId('canvas-node-detail-panel');
    await expect(page.getByTestId('canvas-detail-shot-key')).toContainText('S04_motion');
    await expect(panel).toContainText('bound_asset_role');
    await expect(panel).toContainText('prompt');
    await expect(page.getByTestId('canvas-detail-review-status')).toBeVisible();

    // Reject with empty reason must show error
    await page.getByTestId('canvas-detail-reject-reason').fill('');
    await page.getByTestId('canvas-detail-reject-button').click();
    await expect(page.getByTestId('canvas-detail-error-message')).toBeVisible({ timeout: 5000 });
    await expect(page.getByTestId('canvas-node-review-S04_motion')).not.toContainText('rejected');

    // Approve from detail panel
    await page.getByTestId('canvas-detail-approve-button').click();
    await page.waitForTimeout(1500);
    await expect(page.getByTestId('canvas-node-review-S04_motion')).toContainText('approved', { timeout: 10000 });

    // Reject with reason from detail panel
    await page.getByTestId('workflow-shot-S04_motion').click();
    await page.waitForTimeout(300);
    await page.getByTestId('canvas-detail-reject-reason').fill('test quality issue');
    await page.getByTestId('canvas-detail-reject-button').click();
    await page.waitForTimeout(1500);
    await expect(page.getByTestId('canvas-node-review-S04_motion')).toContainText('rejected', { timeout: 10000 });
  });

  test('M3-Canvas: zoom controls', async ({ page }) => {
    test.setTimeout(30000);
    await page.getByTestId('create-demo-product-button').click();
    await expect(page.getByTestId('checklist-ready')).toBeVisible({ timeout: 20000 });
    await page.getByTestId('template-desk_calendar').first().click();
    await page.getByTestId('create-video-batch-button').click();
    await expect(page.getByTestId('batch-id')).toBeVisible({ timeout: 10000 });
    await switchToCanvas(page);

    await page.getByTestId('canvas-zoom-in').click();
    await expect(page.getByTestId('shot-control-node-S01_main')).toBeAttached({ timeout: 3000 });
    await page.getByTestId('canvas-zoom-out').click();
    await expect(page.getByTestId('shot-control-node-S01_main')).toBeAttached({ timeout: 3000 });
    await page.getByTestId('canvas-reset-view').click();
    await expect(page.getByTestId('shot-control-node-S01_main')).toBeAttached({ timeout: 3000 });
  });

  test('M3-Canvas: empty state when no batch', async ({ page }) => {
    test.setTimeout(30000);
    await page.getByTestId('workbench-tab-canvas').click();
    await expect(page.getByTestId('production-canvas-view')).toBeVisible({ timeout: 5000 });
    await expect(page.getByTestId('production-canvas-view')).toContainText('请先创建 video batch', { timeout: 5000 });
  });
});
