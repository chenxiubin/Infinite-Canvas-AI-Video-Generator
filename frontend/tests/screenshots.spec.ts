import { test, expect } from '@playwright/test';
import * as path from 'path';

const ARTIFACTS_DIR = 'C:/Users/Administrator/.gemini/antigravity/brain/449b48a0-e99e-4d8e-9be7-7c8500ec7136';

test.describe('Capture Verification Screenshots', () => {

  test('Capture Canvas States', async ({ page }) => {
    test.setTimeout(60000);
    // Navigate to production workbench
    await page.goto('/');
    const wbBtn = page.getByRole('button', { name: '生产工作台' });
    if (await wbBtn.isVisible({ timeout: 15000 }).catch(() => false)) await wbBtn.click();
    await expect(page.getByTestId('mvp3-workbench')).toBeVisible({ timeout: 10000 });

    // 1. Capture fixed workflow canvas with shot control nodes
    await page.getByTestId('workbench-tab-canvas').click();
    await expect(page.getByTestId('production-canvas-view')).toBeVisible({ timeout: 8000 });
    await expect(page.getByTestId('shot-control-node-S01_main')).toBeAttached({ timeout: 8000 });
    await page.screenshot({ path: path.join(ARTIFACTS_DIR, 'canvas_initial.png') });

    // 2. Create demo product and batch
    await page.getByTestId('create-demo-product-button').click();
    await expect(page.getByTestId('checklist-ready')).toBeVisible({ timeout: 20000 });
    await page.getByTestId('template-desk_calendar').first().click();
    await page.getByTestId('create-video-batch-button').click();
    await expect(page.getByTestId('batch-id')).toBeVisible({ timeout: 10000 });

    // 3. Generate batch
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

    // 4. Capture canvas with generated nodes (wait for status to sync)
    await page.getByTestId('workbench-tab-canvas').click();
    await expect(page.getByTestId('canvas-node-status-S01_main')).toContainText('success', { timeout: 30000 });
    await page.screenshot({ path: path.join(ARTIFACTS_DIR, 'drawer_selected.png') });

    // 5. Select shot and capture inspector (wait for detail panel)
    await page.getByTestId('workflow-shot-S04_motion').click();
    await expect(page.getByTestId('canvas-node-detail-panel')).toBeVisible({ timeout: 8000 });
    await page.screenshot({ path: path.join(ARTIFACTS_DIR, 'generating_state.png') });

    // 6. Capture canvas with all success nodes
    await page.getByTestId('workbench-tab-canvas').click();
    await expect(page.getByTestId('shot-control-node-S01_main')).toBeAttached({ timeout: 8000 });
    await page.screenshot({ path: path.join(ARTIFACTS_DIR, 'duration_invalid.png') });
  });

});
