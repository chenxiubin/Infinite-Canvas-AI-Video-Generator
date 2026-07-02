import { test, expect } from '@playwright/test';
import * as path from 'path';

const ARTIFACTS_DIR = 'C:/Users/Administrator/.gemini/antigravity/brain/449b48a0-e99e-4d8e-9be7-7c8500ec7136';

test.describe('Capture MVP-2 Group G Verification Screenshots', () => {

  test('Capture Mismatch Warning and Preflight Panel', async ({ page }) => {
    // 1. Load workspace
    await page.goto('/');
    await page.waitForTimeout(1000);

    // 2. Setup a mismatch (bind detail_1 to S01_main)
    await page.locator('div[data-id="S01_main"]').click();
    await page.locator('.asset-card').nth(1).locator('button:has-text("绑定")').click();
    await page.waitForTimeout(500);

    // 3. Take screenshot of the node card showing mismatch warning badge and yellow border
    await page.screenshot({ path: path.join(ARTIFACTS_DIR, 'g1_mismatch_warning.png') });

    // 4. Click "视频合成" to show the pre-flight panel
    const mergeBtn = page.locator('button:has-text("视频合成")');
    await mergeBtn.click();
    await page.waitForTimeout(500);

    // 5. Take screenshot of the expanded pre-flight panel at the bottom
    await page.screenshot({ path: path.join(ARTIFACTS_DIR, 'g2_preflight_panel.png') });
  });

});
