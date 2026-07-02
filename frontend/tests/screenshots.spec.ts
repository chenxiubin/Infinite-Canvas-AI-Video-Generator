import { test, expect } from '@playwright/test';
import * as path from 'path';

const ARTIFACTS_DIR = 'C:/Users/Administrator/.gemini/antigravity/brain/449b48a0-e99e-4d8e-9be7-7c8500ec7136';

test.describe('Capture Verification Screenshots', () => {

  test('Capture Canvas States', async ({ page }) => {
    // 1. Initial State (Shows E1 variable vs fixed, E2 AI node pink, and grid)
    await page.goto('/');
    await page.waitForTimeout(2000); // Allow nodes to render and position
    await page.screenshot({ path: path.join(ARTIFACTS_DIR, 'canvas_initial.png') });

    // 2. Select S01 and Open Drawer (Shows D1 preset options, D2 text lock switch)
    const s01 = page.locator('div[data-id="S01_main"]');
    await s01.click();
    await page.waitForTimeout(500);
    await page.screenshot({ path: path.join(ARTIFACTS_DIR, 'drawer_selected.png') });

    // 3. Trigger S01 Generation (Shows A2 generating marquee border)
    // Bind first asset first
    await page.locator('.asset-card').first().locator('button:has-text("绑定")').click();
    // Click generate
    await s01.locator('button:has-text("生成")').click();
    await page.waitForTimeout(500); // Allow generating animation to start
    await page.screenshot({ path: path.join(ARTIFACTS_DIR, 'generating_state.png') });

    // 4. Duration Over-limit warning (Shows B2 duration block and red value)
    // Drag slider to 5s on S01
    await page.locator('div[data-id="S01_main"]').click();
    const slider = page.locator('input[type="range"]');
    await slider.fill('5');
    
    // Drag slider to 5s on S02
    await page.locator('div[data-id="S02_detail1"]').click();
    await slider.fill('5');

    // Drag slider to 5s on S03
    await page.locator('div[data-id="S03_detail2"]').click();
    await slider.fill('5');

    // Drag slider to 5s on S04
    await page.locator('div[data-id="S04_motion"]').click();
    await slider.fill('5');

    // Drag slider to 5s on S05
    await page.locator('div[data-id="S05_scene"]').click();
    await slider.fill('5');

    // Drag slider to 5s on S06
    await page.locator('div[data-id="S06_brand"]').click();
    await slider.fill('5');
    
    await page.waitForTimeout(500);
    await page.screenshot({ path: path.join(ARTIFACTS_DIR, 'duration_invalid.png') });
  });
  
});
