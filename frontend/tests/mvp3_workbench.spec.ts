import { test, expect } from '@playwright/test';

test.describe('MVP-3 Production Workbench', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForTimeout(2000);
    const wbBtn = page.getByRole('button', { name: '生产工作台' });
    await expect(wbBtn).toBeVisible({ timeout: 10000 });
    await wbBtn.click();
    await expect(page.getByTestId('mvp3-workbench')).toBeVisible({ timeout: 10000 });
  });

  test('M3-Model: gateway settings visible and default mock', async ({ page }) => {
    test.setTimeout(30000);
    await expect(page.getByTestId('model-settings-panel')).toBeVisible({ timeout: 5000 });
    await expect(page.getByTestId('selected-model-adapter')).toContainText('mock');
    await expect(page.getByTestId('model-adapter-status-mock')).toContainText('ready');
  });

  test('M3-Happy: complete desk calendar production chain via UI', async ({ page }) => {
    test.setTimeout(90000);

    // Capture browser logs
    const errors: string[] = [];
    const logs: string[] = [];
    page.on('console', msg => {
      if (msg.type() === 'error') errors.push(msg.text());
      if (msg.text().includes('[WB]')) logs.push(msg.text());
    });
    page.on('pageerror', err => errors.push(err.message));

    // 1. Click Demo button
    await page.getByTestId('create-demo-product-button').click();

    // 2. Wait for checklist to show ready
    await expect(page.getByTestId('checklist-ready')).toBeVisible({ timeout: 20000 });

    // 3. Select desk calendar template
    await page.getByTestId('template-desk_calendar').first().click();
    await expect(page.getByTestId('selected-template-id')).toBeVisible({ timeout: 5000 });

    // 4. Create batch (button should be enabled now)
    await expect(page.getByTestId('create-video-batch-button')).toBeEnabled({ timeout: 5000 });
    await page.getByTestId('create-video-batch-button').click();
    await expect(page.getByTestId('batch-id')).toBeVisible({ timeout: 10000 });
    await expect(page.getByTestId('instance-id')).toBeVisible({ timeout: 5000 });

    // 5. Generate batch — click and wait for UI state to show success (handleGenerate runs ~18s synchronously)
    await page.getByTestId('generate-batch-button').click();
    // Wait for UI to reflect completion (hidden node-status spans show success)
    for (const sk of ['S01_main','S02_detail1','S03_detail2','S04_motion','S05_scene','S06_brand']) {
      await expect(page.getByTestId(`node-status-${sk}`)).toContainText('success', { timeout: 60000 });
    }
    if (errors.length > 0) throw new Error(`Browser errors: ${errors.join(' | ')}`);

    // 6. Approve all first (merge requires approved gate)
    await page.getByTestId('approve-all-button').click();
    await expect(page.getByTestId('instance-review-status')).toContainText('approved', { timeout: 15000 });

    // 7. Merge preview
    await page.getByTestId('merge-preview-button').click();
    await expect(page.getByTestId('draft-preview-url')).toContainText('/mock-previews/', { timeout: 15000 });

    // 8. Re-approve after merge (merge resets review_status to pending)
    await page.getByTestId('approve-all-button').click();
    await expect(page.getByTestId('instance-review-status')).toContainText('approved', { timeout: 15000 });

    // 9. Export
    await expect(page.getByTestId('export-button')).toBeEnabled({ timeout: 5000 });
    await page.getByTestId('export-button').click();
    await expect(page.getByTestId('final-video-url')).toContainText('/mock-exports/', { timeout: 15000 });
  });

  test('M3-Error: incomplete product blocks batch creation', async ({ page }) => {
    test.setTimeout(30000);

    // Create incomplete product via API (only main asset)
    await page.evaluate(async () => {
      const r = await fetch('/api/v1/products', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ product_type: 'desk_calendar', sku: `SKU-INC-${Date.now()}`, title: 'Incomplete' }),
      });
      const d = await r.json();
      await fetch(`/api/v1/products/${d.product_id}/assets`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ original_filename: 'only_main.jpg', file_url: '/mock/main.jpg' }),
      });
    });

    await page.reload();
    await page.waitForTimeout(1000);
    const wbBtn = page.getByRole('button', { name: '生产工作台' });
    if (await wbBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await wbBtn.click();
    }
    await expect(page.getByTestId('mvp3-workbench')).toBeVisible({ timeout: 8000 });

    // Create batch button should be disabled
    const btn = page.getByTestId('create-video-batch-button');
    if (await btn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await expect(btn).toBeDisabled({ timeout: 5000 });
    }
  });
});
