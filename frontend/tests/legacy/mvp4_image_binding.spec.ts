import { test, expect } from '@playwright/test';

test.describe('MVP-4 Image Binding', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForTimeout(2000);
    const wbBtn = page.getByRole('button', { name: '生产工作台' });
    if (await wbBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
      await wbBtn.click();
    }
    await expect(page.getByTestId('mvp3-workbench')).toBeVisible({ timeout: 10000 });
  });

  test('M4-Bind-01: upload image and assign role', async ({ page }) => {
    test.setTimeout(30000);
    const fileInput = page.getByTestId('asset-upload-input');
    await fileInput.setInputFiles({
      name: 'test_start.png',
      mimeType: 'image/png',
      buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64'),
    });
    const panel = page.getByTestId('asset-library-panel');
    await expect(panel).toBeVisible({ timeout: 5000 });
    await expect(panel).toContainText('test_start.png');
    const assetCard = panel.locator('[data-testid^="asset-card-"]').first();
    await expect(assetCard).toBeVisible();
    await assetCard.locator('select').selectOption('start_frame');
  });

  test('M4-Bind-02: bind image as start frame on S01_main and verify canvas thumbnail', async ({ page }) => {
    test.setTimeout(90000);

    // Setup: create demo product + batch so nodes appear on canvas
    await page.getByTestId('create-demo-product-button').click();
    await expect(page.getByTestId('checklist-ready')).toBeVisible({ timeout: 20000 });
    await page.getByTestId('template-desk_calendar').first().click();
    await page.getByTestId('create-video-batch-button').click();
    await expect(page.getByTestId('batch-id')).toBeVisible({ timeout: 10000 });

    // Upload image and set role to start_frame
    const fileInput = page.getByTestId('asset-upload-input');
    await fileInput.setInputFiles({
      name: 'sframe.png',
      mimeType: 'image/png',
      buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64'),
    });
    await expect(page.getByTestId('asset-library-panel')).toBeVisible({ timeout: 5000 });
    const assetCard = page.getByTestId('asset-library-panel').locator('[data-testid^="asset-card-"]').first();
    await assetCard.locator('select').selectOption('start_frame');

    // Switch to canvas, select S01_main via sidebar shot list to open inspector
    await page.getByTestId('workbench-tab-canvas').click();
    await expect(page.getByTestId('shot-control-node-S01_main')).toBeAttached({ timeout: 15000 });
    await page.getByTestId('workflow-shot-S01_main').click();
    await expect(page.getByTestId('canvas-node-detail-panel')).toBeVisible({ timeout: 8000 });

    // Warning visible before binding
    await expect(page.getByTestId('frame-binding-warning')).toBeVisible({ timeout: 3000 });

    // Bind start frame via select
    const bindSelect = page.getByTestId('bind-start-frame-select');
    await expect(bindSelect).toBeVisible({ timeout: 3000 });
    const options = bindSelect.locator('option');
    const count = await options.count();
    if (count > 1) {
      const val = await options.nth(1).getAttribute('value');
      if (val) await bindSelect.selectOption(val);
    }

    // Verify binding success in inspector
    await expect(page.getByTestId('start-frame-preview')).toBeVisible({ timeout: 5000 });
    await expect(page.getByTestId('start-frame-preview')).toContainText('首帧已绑定');
    await expect(page.getByTestId('frame-binding-warning')).not.toBeVisible({ timeout: 3000 });

    // Verify shot control node generate button is enabled (has node_id + start frame bound)
    const genBtn = page.getByTestId('shot-control-generate-S01_main');
    await expect(genBtn).toBeEnabled({ timeout: 5000 });
  });

  test('M4-Bind-03: missing start frame shows warning in empty state', async ({ page }) => {
    test.setTimeout(30000);
    // Without any product/batch, select S02_detail1 via sidebar to open inspector
    await page.getByTestId('workbench-tab-canvas').click();
    await expect(page.getByTestId('shot-control-node-S02_detail1')).toBeAttached({ timeout: 15000 });
    await page.getByTestId('workflow-shot-S02_detail1').click();
    // Frame binding section should show warning in inspector
    await expect(page.getByTestId('frame-binding-warning')).toBeVisible({ timeout: 5000 });
    // Shot control node status should show disabled reason
    const statusSpan = page.getByTestId('shot-control-status-S02_detail1');
    await expect(statusSpan).toBeAttached();
    // Status text should contain a disabled reason (either missing batch or missing start frame)
    const statusText = await statusSpan.textContent();
    expect(statusText && (statusText.includes('批次') || statusText.includes('首帧'))).toBeTruthy();
  });
});
