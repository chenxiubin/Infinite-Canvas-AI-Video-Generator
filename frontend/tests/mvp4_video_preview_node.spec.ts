import { test, expect } from '@playwright/test';

test.describe('MVP-4 Video Preview Node', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    const wbBtn = page.getByRole('button', { name: '生产工作台' });
    if (await wbBtn.isVisible({ timeout: 5000 }).catch(() => false)) await wbBtn.click();
    await expect(page.getByTestId('mvp3-workbench')).toBeVisible({ timeout: 10000 });
  });

  test('M4-VideoPreview-01: video preview node appears after generating S01', async ({ page }) => {
    test.setTimeout(90000);

    // Create demo product, select template, create batch
    await page.getByTestId('create-demo-product-button').click();
    await expect(page.getByTestId('checklist-ready')).toBeVisible({ timeout: 20000 });
    await page.getByTestId('template-desk_calendar').first().click();
    await page.getByTestId('create-video-batch-button').click();
    await expect(page.getByTestId('batch-id')).toBeVisible({ timeout: 10000 });

    // Upload image and set role to start_frame
    const fileInput = page.getByTestId('asset-upload-input');
    await fileInput.setInputFiles({
      name: 'vp01.png',
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

    // Generate S01 (single shot)
    await expect(page.getByTestId('single-shot-generate-button')).toBeVisible({ timeout: 3000 });
    await page.getByTestId('single-shot-generate-button').click();

    // Wait for video preview node to appear (proves generation succeeded)
    await expect(page.getByTestId('video-preview-node-S01_main')).toBeAttached({ timeout: 30000 });
    await expect(page.getByTestId('video-preview-node-status-S01_main')).toBeAttached({ timeout: 8000 });
  });

  test('M4-VideoPreview-02: clicking video preview node opens inspector with shot details', async ({ page }) => {
    test.setTimeout(90000);

    // Setup: create batch, bind start frame, generate S01
    await page.getByTestId('create-demo-product-button').click();
    await expect(page.getByTestId('checklist-ready')).toBeVisible({ timeout: 20000 });
    await page.getByTestId('template-desk_calendar').first().click();
    await page.getByTestId('create-video-batch-button').click();
    await expect(page.getByTestId('batch-id')).toBeVisible({ timeout: 10000 });

    const fileInput = page.getByTestId('asset-upload-input');
    await fileInput.setInputFiles({
      name: 'vp02.png',
      mimeType: 'image/png',
      buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64'),
    });
    await expect(page.getByTestId('asset-library-panel')).toBeVisible({ timeout: 5000 });
    const assetCard = page.getByTestId('asset-library-panel').locator('[data-testid^="asset-card-"]').first();
    await assetCard.locator('select').selectOption('start_frame');

    await page.getByTestId('workflow-shot-S01_main').click();
    await expect(page.getByTestId('canvas-node-detail-panel')).toBeVisible({ timeout: 8000 });

    const bindSelect = page.getByTestId('bind-start-frame-select');
    await expect(bindSelect).toBeVisible({ timeout: 3000 });
    const options = bindSelect.locator('option');
    const count = await options.count();
    if (count > 1) {
      const val = await options.nth(1).getAttribute('value');
      if (val) await bindSelect.selectOption(val);
    }
    await expect(page.getByTestId('start-frame-preview')).toBeVisible({ timeout: 5000 });

    await expect(page.getByTestId('single-shot-generate-button')).toBeVisible({ timeout: 3000 });
    await page.getByTestId('single-shot-generate-button').click();

    // Poll batch completion via page.evaluate + fetch
    const batchId = (await page.getByTestId('batch-id').textContent() || '').replace('batch_id: ', '').trim();
    await page.evaluate(async (bid) => {
      for (let i = 0; i < 30; i++) {
        const r = await fetch(`/api/v1/video-batches/${bid}`);
        if ((await r.json()).status === 'completed') return true;
        await new Promise(res => setTimeout(res, 1000));
      }
      return false;
    }, batchId);

    // Click open-inspector button on the video preview node
    await page.getByTestId('video-preview-node-open-inspector-S01_main').click();

    // Assert inspector shows S01_main details and video preview
    await expect(page.getByTestId('canvas-detail-shot-key')).toContainText('S01_main', { timeout: 5000 });
    await expect(page.getByTestId('single-shot-video-preview')).toBeVisible({ timeout: 5000 });
  });

  test('M4-VideoPreview-03: review status syncs to video preview node after approve', async ({ page }) => {
    test.setTimeout(90000);

    // Setup: create batch, bind start frame, generate S01
    await page.getByTestId('create-demo-product-button').click();
    await expect(page.getByTestId('checklist-ready')).toBeVisible({ timeout: 20000 });
    await page.getByTestId('template-desk_calendar').first().click();
    await page.getByTestId('create-video-batch-button').click();
    await expect(page.getByTestId('batch-id')).toBeVisible({ timeout: 10000 });

    const fileInput = page.getByTestId('asset-upload-input');
    await fileInput.setInputFiles({
      name: 'vp03.png',
      mimeType: 'image/png',
      buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64'),
    });
    await expect(page.getByTestId('asset-library-panel')).toBeVisible({ timeout: 5000 });
    const assetCard = page.getByTestId('asset-library-panel').locator('[data-testid^="asset-card-"]').first();
    await assetCard.locator('select').selectOption('start_frame');

    await page.getByTestId('workflow-shot-S01_main').click();
    await expect(page.getByTestId('canvas-node-detail-panel')).toBeVisible({ timeout: 8000 });

    const bindSelect = page.getByTestId('bind-start-frame-select');
    await expect(bindSelect).toBeVisible({ timeout: 3000 });
    const options = bindSelect.locator('option');
    const count = await options.count();
    if (count > 1) {
      const val = await options.nth(1).getAttribute('value');
      if (val) await bindSelect.selectOption(val);
    }
    await expect(page.getByTestId('start-frame-preview')).toBeVisible({ timeout: 5000 });

    await expect(page.getByTestId('single-shot-generate-button')).toBeVisible({ timeout: 3000 });
    await page.getByTestId('single-shot-generate-button').click();

    // Poll batch completion via page.evaluate + fetch
    const batchId = (await page.getByTestId('batch-id').textContent() || '').replace('batch_id: ', '').trim();
    await page.evaluate(async (bid) => {
      for (let i = 0; i < 30; i++) {
        const r = await fetch(`/api/v1/video-batches/${bid}`);
        if ((await r.json()).status === 'completed') return true;
        await new Promise(res => setTimeout(res, 1000));
      }
      return false;
    }, batchId);

    // Approve via inspector
    await expect(page.getByTestId('canvas-detail-approve-button')).toBeVisible({ timeout: 5000 });
    await page.getByTestId('canvas-detail-approve-button').click();

    // Assert video preview node review badge shows approved status
    // The VideoPreviewNode renders "已通过" for approved status
    await expect(page.getByTestId('video-preview-node-review-S01_main')).toBeVisible({ timeout: 5000 });
    await expect(page.getByTestId('video-preview-node-review-S01_main')).toContainText('已通过', { timeout: 5000 });
  });
});
