import { test, expect } from '@playwright/test';

test.describe('MVP-4 Review Workflow', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    const wbBtn = page.getByRole('button', { name: '生产工作台' });
    if (await wbBtn.isVisible({ timeout: 5000 }).catch(() => false)) await wbBtn.click();
    await expect(page.getByTestId('mvp3-workbench')).toBeVisible({ timeout: 10000 });
  });

  test('M4-Review-01: generate then approve', async ({ page }) => {
    test.setTimeout(90000);

    // Setup: create demo product, select template, create batch
    await page.getByTestId('create-demo-product-button').click();
    await expect(page.getByTestId('checklist-ready')).toBeVisible({ timeout: 20000 });
    await page.getByTestId('template-desk_calendar').first().click();
    await page.getByTestId('create-video-batch-button').click();
    await expect(page.getByTestId('batch-id')).toBeVisible({ timeout: 10000 });

    // Upload image and assign start_frame role
    const fileInput = page.getByTestId('asset-upload-input');
    await fileInput.setInputFiles({
      name: 'review_ap.png',
      mimeType: 'image/png',
      buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64'),
    });
    await expect(page.getByTestId('asset-library-panel')).toBeVisible({ timeout: 5000 });
    const assetCard = page.getByTestId('asset-library-panel').locator('[data-testid^="asset-card-"]').first();
    await assetCard.locator('select').selectOption('start_frame');

    // Select S01 via workflow shot (avoids React Flow viewport flakiness)
    await page.getByTestId('workflow-shot-S01_main').click();
    await expect(page.getByTestId('canvas-node-detail-panel')).toBeVisible({ timeout: 8000 });

    // Bind start frame via Inspector dropdown
    const bindSelect = page.getByTestId('bind-start-frame-select');
    await expect(bindSelect).toBeVisible({ timeout: 3000 });
    const options = bindSelect.locator('option');
    const count = await options.count();
    if (count > 1) {
      const val = await options.nth(1).getAttribute('value');
      if (val) await bindSelect.selectOption(val);
    }
    await expect(page.getByTestId('start-frame-preview')).toBeVisible({ timeout: 5000 });

    // Click generate
    await expect(page.getByTestId('single-shot-generate-button')).toBeVisible({ timeout: 3000 });
    await page.getByTestId('single-shot-generate-button').click();

    // Wait for video preview (polling-based, no waitForTimeout)
    await expect(page.getByTestId('single-shot-video-preview')).toBeVisible({ timeout: 30000 });

    // Approve
    await expect(page.getByTestId('canvas-detail-approve-button')).toBeVisible({ timeout: 5000 });
    await page.getByTestId('canvas-detail-approve-button').click();

    // Verify review status updated to approved
    await expect(page.getByTestId('canvas-detail-review-status')).toContainText('approved', { timeout: 5000 });
  });

  test('M4-Review-02: reject without reason shows error', async ({ page }) => {
    test.setTimeout(90000);

    // Setup: create demo product, select template, create batch
    await page.getByTestId('create-demo-product-button').click();
    await expect(page.getByTestId('checklist-ready')).toBeVisible({ timeout: 20000 });
    await page.getByTestId('template-desk_calendar').first().click();
    await page.getByTestId('create-video-batch-button').click();
    await expect(page.getByTestId('batch-id')).toBeVisible({ timeout: 10000 });

    // Upload image and assign start_frame role
    const fileInput = page.getByTestId('asset-upload-input');
    await fileInput.setInputFiles({
      name: 'review_rj.png',
      mimeType: 'image/png',
      buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64'),
    });
    await expect(page.getByTestId('asset-library-panel')).toBeVisible({ timeout: 5000 });
    const assetCard = page.getByTestId('asset-library-panel').locator('[data-testid^="asset-card-"]').first();
    await assetCard.locator('select').selectOption('start_frame');

    // Select S01 via workflow shot
    await page.getByTestId('workflow-shot-S01_main').click();
    await expect(page.getByTestId('canvas-node-detail-panel')).toBeVisible({ timeout: 8000 });

    // Bind start frame via Inspector dropdown
    const bindSelect = page.getByTestId('bind-start-frame-select');
    await expect(bindSelect).toBeVisible({ timeout: 3000 });
    const options = bindSelect.locator('option');
    const count = await options.count();
    if (count > 1) {
      const val = await options.nth(1).getAttribute('value');
      if (val) await bindSelect.selectOption(val);
    }
    await expect(page.getByTestId('start-frame-preview')).toBeVisible({ timeout: 5000 });

    // Generate
    await expect(page.getByTestId('single-shot-generate-button')).toBeVisible({ timeout: 3000 });
    await page.getByTestId('single-shot-generate-button').click();
    await expect(page.getByTestId('single-shot-video-preview')).toBeVisible({ timeout: 30000 });

    // Click reject without filling reason
    await expect(page.getByTestId('canvas-detail-reject-button')).toBeVisible({ timeout: 5000 });
    await page.getByTestId('canvas-detail-reject-button').click();

    // Verify error message is shown
    await expect(page.getByTestId('canvas-detail-error-message')).toBeVisible({ timeout: 3000 });
  });

  test('M4-Review-03: fill reason then reject succeeds', async ({ page }) => {
    test.setTimeout(90000);

    // Setup: create demo product, select template, create batch
    await page.getByTestId('create-demo-product-button').click();
    await expect(page.getByTestId('checklist-ready')).toBeVisible({ timeout: 20000 });
    await page.getByTestId('template-desk_calendar').first().click();
    await page.getByTestId('create-video-batch-button').click();
    await expect(page.getByTestId('batch-id')).toBeVisible({ timeout: 10000 });

    // Upload image and assign start_frame role
    const fileInput = page.getByTestId('asset-upload-input');
    await fileInput.setInputFiles({
      name: 'review_rj2.png',
      mimeType: 'image/png',
      buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64'),
    });
    await expect(page.getByTestId('asset-library-panel')).toBeVisible({ timeout: 5000 });
    const assetCard = page.getByTestId('asset-library-panel').locator('[data-testid^="asset-card-"]').first();
    await assetCard.locator('select').selectOption('start_frame');

    // Select S01 via workflow shot
    await page.getByTestId('workflow-shot-S01_main').click();
    await expect(page.getByTestId('canvas-node-detail-panel')).toBeVisible({ timeout: 8000 });

    // Bind start frame via Inspector dropdown
    const bindSelect = page.getByTestId('bind-start-frame-select');
    await expect(bindSelect).toBeVisible({ timeout: 3000 });
    const options = bindSelect.locator('option');
    const count = await options.count();
    if (count > 1) {
      const val = await options.nth(1).getAttribute('value');
      if (val) await bindSelect.selectOption(val);
    }
    await expect(page.getByTestId('start-frame-preview')).toBeVisible({ timeout: 5000 });

    // Generate
    await expect(page.getByTestId('single-shot-generate-button')).toBeVisible({ timeout: 3000 });
    await page.getByTestId('single-shot-generate-button').click();
    await expect(page.getByTestId('single-shot-video-preview')).toBeVisible({ timeout: 30000 });

    // Fill reject reason
    await expect(page.getByTestId('canvas-detail-reject-reason')).toBeVisible({ timeout: 3000 });
    await page.getByTestId('canvas-detail-reject-reason').fill('测试驳回原因');

    // Click reject
    await page.getByTestId('canvas-detail-reject-button').click();

    // Verify review status updated to rejected
    await expect(page.getByTestId('canvas-detail-review-status')).toContainText('rejected', { timeout: 5000 });
  });

  test('M4-Review-04: regenerate after rejection', async ({ page }) => {
    test.setTimeout(90000);

    // Setup: create demo product, select template, create batch
    await page.getByTestId('create-demo-product-button').click();
    await expect(page.getByTestId('checklist-ready')).toBeVisible({ timeout: 20000 });
    await page.getByTestId('template-desk_calendar').first().click();
    await page.getByTestId('create-video-batch-button').click();
    await expect(page.getByTestId('batch-id')).toBeVisible({ timeout: 10000 });

    // Upload image and assign start_frame role
    const fileInput = page.getByTestId('asset-upload-input');
    await fileInput.setInputFiles({
      name: 'review_rg.png',
      mimeType: 'image/png',
      buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64'),
    });
    await expect(page.getByTestId('asset-library-panel')).toBeVisible({ timeout: 5000 });
    const assetCard = page.getByTestId('asset-library-panel').locator('[data-testid^="asset-card-"]').first();
    await assetCard.locator('select').selectOption('start_frame');

    // Select S01 via workflow shot
    await page.getByTestId('workflow-shot-S01_main').click();
    await expect(page.getByTestId('canvas-node-detail-panel')).toBeVisible({ timeout: 8000 });

    // Bind start frame via Inspector dropdown
    const bindSelect = page.getByTestId('bind-start-frame-select');
    await expect(bindSelect).toBeVisible({ timeout: 3000 });
    const options = bindSelect.locator('option');
    const count = await options.count();
    if (count > 1) {
      const val = await options.nth(1).getAttribute('value');
      if (val) await bindSelect.selectOption(val);
    }
    await expect(page.getByTestId('start-frame-preview')).toBeVisible({ timeout: 5000 });

    // Generate first version
    await expect(page.getByTestId('single-shot-generate-button')).toBeVisible({ timeout: 3000 });
    await page.getByTestId('single-shot-generate-button').click();
    await expect(page.getByTestId('single-shot-video-preview')).toBeVisible({ timeout: 30000 });

    // Fill reject reason and reject
    await expect(page.getByTestId('canvas-detail-reject-reason')).toBeVisible({ timeout: 3000 });
    await page.getByTestId('canvas-detail-reject-reason').fill('需重新生成');
    await page.getByTestId('canvas-detail-reject-button').click();
    await expect(page.getByTestId('canvas-detail-review-status')).toContainText('rejected', { timeout: 5000 });

    // Click regenerate button
    await expect(page.getByTestId('single-shot-regenerate-button')).toBeVisible({ timeout: 5000 });
    await page.getByTestId('single-shot-regenerate-button').click();

    // Wait for video preview to reappear after regeneration
    await expect(page.getByTestId('single-shot-video-preview')).toBeVisible({ timeout: 30000 });
  });
});
