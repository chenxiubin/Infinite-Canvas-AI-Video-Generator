import { test, expect } from '@playwright/test';
import * as path from 'path';

const ARTIFACTS_DIR = 'C:/Users/Administrator/.gemini/antigravity/brain/449b48a0-e99e-4d8e-9be7-7c8500ec7136';

test.describe('Capture MVP-2 Group H Verification Screenshots', () => {

  test('Capture Desk Calendar Template and Blank Custom Template Reuse', async ({ page }) => {
    test.setTimeout(60000);
    // Navigate to production workbench
    await page.goto('/');
    const wbBtn = page.getByRole('button', { name: '生产工作台' });
    if (await wbBtn.isVisible({ timeout: 15000 }).catch(() => false)) await wbBtn.click();
    await expect(page.getByTestId('mvp3-workbench')).toBeVisible({ timeout: 10000 });

    // 1. Capture workbench canvas (default desk calendar product line)
    await page.getByTestId('workbench-tab-canvas').click();
    await expect(page.getByTestId('production-canvas-view')).toBeVisible({ timeout: 8000 });
    await expect(page.getByTestId('shot-control-node-S01_main')).toBeAttached({ timeout: 8000 });
    await page.screenshot({ path: path.join(ARTIFACTS_DIR, 'h1_desk_calendar_template.png') });

    // 2. Create demo product + batch
    await page.getByTestId('create-demo-product-button').click();
    await expect(page.getByTestId('checklist-ready')).toBeVisible({ timeout: 20000 });
    await page.getByTestId('template-desk_calendar').first().click();
    await page.getByTestId('create-video-batch-button').click();
    await expect(page.getByTestId('batch-id')).toBeVisible({ timeout: 10000 });

    // 3. Capture canvas with real batch data
    await page.getByTestId('workbench-tab-canvas').click();
    await expect(page.getByTestId('shot-control-node-S01_main')).toBeAttached({ timeout: 8000 });
    await page.screenshot({ path: path.join(ARTIFACTS_DIR, 'h2_saved_template_cloned.png') });

    // 4. Switch to wall calendar and capture
    await page.getByTestId('workbench-tab-form').click();
    const wallSel = page.getByTestId('product-line-wall_calendar');
    if (await wallSel.isVisible({ timeout: 3000 }).catch(() => false)) {
      await wallSel.click();
    }
    await page.getByTestId('workbench-tab-canvas').click();
    await expect(page.getByTestId('shot-control-node-S01_main')).toBeAttached({ timeout: 8000 });
    await page.screenshot({ path: path.join(ARTIFACTS_DIR, 'h3_product_line_filtered.png') });
  });

});
