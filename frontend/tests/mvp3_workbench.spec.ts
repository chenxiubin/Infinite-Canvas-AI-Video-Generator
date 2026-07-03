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
    test.setTimeout(60000);

    // 1. Click Demo button
    const demoBtn = page.locator('button:has-text("Demo 台历素材包")');
    await expect(demoBtn).toBeVisible({ timeout: 5000 });
    await demoBtn.click();
    await page.waitForTimeout(2000);

    // 2. Verify checklist shows ready
    await expect(page.locator('text=ready')).toBeVisible({ timeout: 5000 });

    // 3. Select desk template
    const tplBtn = page.locator('button:has-text("台历默认视频模板")');
    await expect(tplBtn).toBeVisible({ timeout: 3000 });
    await tplBtn.click();

    // 4. Create batch
    const createBatchBtn = page.locator('button:has-text("创建 Batch")');
    await expect(createBatchBtn).toBeEnabled({ timeout: 3000 });
    await createBatchBtn.click();
    await page.waitForTimeout(1000);

    // 5. Generate batch
    const genBtn = page.locator('button:has-text("Generate Batch")');
    await expect(genBtn).toBeVisible({ timeout: 3000 });
    await genBtn.click();
    await page.waitForTimeout(2000);

    // 6. Verify nodes show success
    await expect(page.locator('text=success').first()).toBeVisible({ timeout: 10000 });

    // 7. Merge preview
    const mergeBtn = page.locator('button:has-text("Merge Preview")');
    await expect(mergeBtn).toBeVisible({ timeout: 3000 });
    await mergeBtn.click();
    await page.waitForTimeout(1000);
    await expect(page.locator('text=/mock-previews/')).toBeVisible({ timeout: 5000 });

    // 8. Approve all
    const approveAllBtn = page.locator('button:has-text("Approve All")');
    await expect(approveAllBtn).toBeVisible({ timeout: 3000 });
    await approveAllBtn.click();
    await page.waitForTimeout(500);
    await expect(page.locator('text=approved')).toBeVisible({ timeout: 5000 });

    // 9. Export
    const exportBtn = page.locator('button:has-text("Export")');
    await expect(exportBtn).toBeEnabled({ timeout: 5000 });
    await exportBtn.click();
    await page.waitForTimeout(500);
    await expect(page.locator('text=/mock-exports/')).toBeVisible({ timeout: 5000 });
  });
});
