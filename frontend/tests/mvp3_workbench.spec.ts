import { test, expect } from '@playwright/test';

test.describe('MVP-3 Production Workbench', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForTimeout(1000);
    // Navigate to the workbench
    const wbBtn = page.locator('button:has-text("生产工作台")');
    if (await wbBtn.isVisible()) {
      await wbBtn.click();
    }
    await page.waitForTimeout(500);
  });

  test('M3-Happy: complete desk calendar production chain', async ({ page }) => {
    test.setTimeout(90000);

    // 1. Click Demo button and wait for product creation
    const demoBtn = page.locator('button:has-text("Demo 台历素材包")');
    await expect(demoBtn).toBeVisible({ timeout: 10000 });
    await demoBtn.click();
    await page.waitForTimeout(3000);

    // 2. Verify product_id is shown (means product was created)
    await expect(page.locator('text=product_id:')).toBeVisible({ timeout: 10000 });

    // 3. Select desk template
    const tplBtn = page.locator('button:has-text("台历默认视频模板")');
    await expect(tplBtn).toBeVisible({ timeout: 5000 });
    await tplBtn.click();

    // 4. Create batch — button should be enabled after template selected + checklist ready
    const createBatchBtn = page.locator('button:has-text("创建 Batch")');
    await expect(createBatchBtn).toBeEnabled({ timeout: 10000 });
    await createBatchBtn.click();
    await page.waitForTimeout(1500);

    // 5. Verify batch_id is shown
    await expect(page.locator('text=batch_id:')).toBeVisible({ timeout: 5000 });

    // 6. Generate batch
    const genBtn = page.locator('button:has-text("Generate Batch")');
    await expect(genBtn).toBeVisible({ timeout: 5000 });
    await genBtn.click();
    await page.waitForTimeout(5000);

    // 7. Verify node status section appears with success badges
    await expect(page.locator('text=S01_main')).toBeVisible({ timeout: 10000 });

    // 8. Merge preview
    const mergeBtn = page.locator('button:has-text("Merge Preview")');
    await expect(mergeBtn).toBeVisible({ timeout: 5000 });
    await mergeBtn.click();
    await page.waitForTimeout(1000);
    await expect(page.locator('text=/mock-previews/')).toBeVisible({ timeout: 10000 });

    // 9. Approve all
    const approveAllBtn = page.locator('button:has-text("Approve All")');
    await expect(approveAllBtn).toBeVisible({ timeout: 5000 });
    await approveAllBtn.click();
    await page.waitForTimeout(1000);

    // 10. Export
    const exportBtn = page.locator('button:has-text("Export")');
    await expect(exportBtn).toBeEnabled({ timeout: 10000 });
    await exportBtn.click();
    await page.waitForTimeout(500);
    await expect(page.locator('text=/mock-exports/')).toBeVisible({ timeout: 5000 });
  });
});
