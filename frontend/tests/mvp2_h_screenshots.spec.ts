import { test, expect } from '@playwright/test';
import * as path from 'path';

const ARTIFACTS_DIR = 'C:/Users/Administrator/.gemini/antigravity/brain/449b48a0-e99e-4d8e-9be7-7c8500ec7136';

test.describe('Capture MVP-2 Group H Verification Screenshots', () => {

  test('Capture Desk Calendar Template and Blank Custom Template Reuse', async ({ page }) => {
    // 1. Load workspace and wait for backend sync
    await page.goto('/');
    await expect(page.locator('div[data-id="S01_main"] .node-title')).toContainText('主图-正面', { timeout: 8000 });

    // 2. Select Desk Calendar Product Line
    const productSelector = page.locator('.product-selector');
    await productSelector.selectOption('desk');
    await page.waitForTimeout(1500);

    // 3. Take screenshot showing Desk Calendar template nodes correctly styled and updated
    await page.screenshot({ path: path.join(ARTIFACTS_DIR, 'h1_desk_calendar_template.png') });

    // 4. Bind asset to S01_main
    await page.locator('div[data-id="S01_main"]').click();
    await page.locator('.asset-card').first().locator('button:has-text("绑定")').click();
    await page.waitForTimeout(500);

    // 5. Fill in custom template name and save
    const nameInput = page.locator('input[placeholder="自定义模板名称"]');
    const saveBtn = page.locator('.save-template-btn');
    const uniqueTemplateName = `Tpl_Screenshot_Test_${Date.now()}`;
    await nameInput.fill(uniqueTemplateName);
    
    page.on('dialog', async (dialog) => {
      await dialog.accept();
    });
    await saveBtn.click();
    await page.waitForTimeout(1000);

    // 6. Select and Load the newly saved custom template from the dropdown list
    const templateSelector = page.locator('.template-selector');
    await expect(templateSelector.locator(`option:has-text("${uniqueTemplateName}")`)).toBeAttached({ timeout: 5000 });
    await templateSelector.selectOption({ label: uniqueTemplateName });
    await page.waitForTimeout(1500);

    // 7. Take screenshot showing S01 node is a blank slot (素材已剥离/空白待绑定) and S06 retains brand asset logo
    await page.screenshot({ path: path.join(ARTIFACTS_DIR, 'h2_saved_template_cloned.png') });

    // 8. Switch to Hanging Calendar product line to verify filtering
    await productSelector.selectOption('hanging');
    await page.waitForTimeout(1000);
    // Take screenshot of filtered dropdown
    await page.screenshot({ path: path.join(ARTIFACTS_DIR, 'h3_product_line_filtered.png') });
  });

});
