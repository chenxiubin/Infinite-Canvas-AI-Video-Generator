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
    if (!ok) throw new Error('Batch did not complete');
    return bid;
  }

  async function switchToCanvas(page: any, checkNodes = true) {
    await page.getByTestId('workbench-tab-canvas').click();
    await expect(page.getByTestId('production-canvas-view')).toBeVisible({ timeout: 8000 });
    if (checkNodes) {
      for (const sk of shotKeys) {
        await expect(page.getByTestId(`canvas-node-${sk}`)).toBeVisible({ timeout: 5000 });
      }
    }
  }

  test('M3-Canvas: full happy path with export visible', async ({ page }) => {
    test.setTimeout(120000);
    await setupGeneratedBatch(page);
    await switchToCanvas(page);

    for (const sk of shotKeys) {
      await expect(page.getByTestId(`canvas-node-status-${sk}`)).toContainText('success', { timeout: 15000 });
    }

    await page.getByTestId('workbench-tab-form').click();
    await expect(page.getByTestId('merge-preview-button')).toBeVisible({ timeout: 5000 });
    await page.getByTestId('merge-preview-button').click();
    await page.waitForTimeout(1000);
    await page.getByTestId('approve-all-button').click();
    await page.waitForTimeout(1000);
    await expect(page.getByTestId('export-button')).toBeEnabled({ timeout: 5000 });
    await page.getByTestId('export-button').click();
    await page.waitForTimeout(1000);

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

  test('M3-Canvas: zoom controls', async ({ page }) => {
    test.setTimeout(30000);
    await page.getByTestId('create-demo-product-button').click();
    await expect(page.getByTestId('checklist-ready')).toBeVisible({ timeout: 20000 });
    await page.getByTestId('template-desk_calendar').first().click();
    await page.getByTestId('create-video-batch-button').click();
    await expect(page.getByTestId('batch-id')).toBeVisible({ timeout: 10000 });
    await switchToCanvas(page);

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
    await expect(page.getByTestId('production-canvas-view')).toContainText('请先创建 video batch', { timeout: 5000 });
  });
});
