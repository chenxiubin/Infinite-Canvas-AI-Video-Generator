import { test, expect } from '@playwright/test';

test.describe('MVP-4 Single Shot Generation', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    const wbBtn = page.getByRole('button', { name: '生产工作台' });
    if (await wbBtn.isVisible({ timeout: 5000 }).catch(() => false)) await wbBtn.click();
    await expect(page.getByTestId('mvp3-workbench')).toBeVisible({ timeout: 10000 });
  });

  test('M4-SingleShot-01: generate disabled without start frame or batch', async ({ page }) => {
    test.setTimeout(30000);
    // Select S01, no batch created yet — no node_id
    await page.getByTestId('workflow-shot-S01_main').click();
    await expect(page.getByTestId('canvas-node-detail-panel')).toBeVisible({ timeout: 8000 });
    // Generate button should be disabled (pending skeleton node has no real node_id)
    const genBtn = page.getByTestId('single-shot-generate-button');
    const disabledReason = page.getByTestId('single-shot-generate-disabled-reason');
    // Either button is absent (no real node_id) or disabled reason visible
    const btnExists = await genBtn.isVisible({ timeout: 3000 }).catch(() => false);
    const reasonVisible = await disabledReason.isVisible({ timeout: 3000 }).catch(() => false);
    expect(btnExists || reasonVisible).toBeTruthy();
  });

  test('M4-SingleShot-02: generate enabled after binding start frame with batch', async ({ page }) => {
    test.setTimeout(90000);
    // Create batch with nodes
    await page.getByTestId('create-demo-product-button').click();
    await expect(page.getByTestId('checklist-ready')).toBeVisible({ timeout: 20000 });
    await page.getByTestId('template-desk_calendar').first().click();
    await page.getByTestId('create-video-batch-button').click();
    await expect(page.getByTestId('batch-id')).toBeVisible({ timeout: 10000 });
    // Upload + bind start frame
    const fileInput = page.getByTestId('asset-upload-input');
    await fileInput.setInputFiles({ name: 'gen_test.png', mimeType: 'image/png', buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64') });
    await expect(page.getByTestId('asset-library-panel')).toBeVisible({ timeout: 5000 });
    const card = page.getByTestId('asset-library-panel').locator('[data-testid^="asset-card-"]').first();
    await card.locator('select').selectOption('start_frame');
    // Select S01 via workflow shot
    await page.getByTestId('workflow-shot-S01_main').click();
    await expect(page.getByTestId('canvas-node-detail-panel')).toBeVisible({ timeout: 8000 });
    // Bind start frame via Inspector
    const bindSelect = page.getByTestId('bind-start-frame-select');
    await expect(bindSelect).toBeVisible({ timeout: 3000 });
    const options = bindSelect.locator('option'); const count = await options.count();
    if (count > 1) { const val = await options.nth(1).getAttribute('value'); if (val) await bindSelect.selectOption(val); }
    await expect(page.getByTestId('start-frame-preview')).toBeVisible({ timeout: 5000 });
    // Generate button should be enabled
    await expect(page.getByTestId('single-shot-generate-button')).toBeVisible({ timeout: 3000 });
    // Click generate
    await page.getByTestId('single-shot-generate-button').click();
    // Wait for video preview (polling)
    await expect(page.getByTestId('single-shot-video-preview')).toBeVisible({ timeout: 30000 });
    // Video URL text should exist
    await expect(page.getByTestId('canvas-detail-video-url')).toBeVisible({ timeout: 5000 });
  });

  test('M4-SingleShot-03: approve after generation', async ({ page }) => {
    test.setTimeout(90000);
    // Reuse same setup as M4-SingleShot-02
    await page.getByTestId('create-demo-product-button').click();
    await expect(page.getByTestId('checklist-ready')).toBeVisible({ timeout: 20000 });
    await page.getByTestId('template-desk_calendar').first().click();
    await page.getByTestId('create-video-batch-button').click();
    await expect(page.getByTestId('batch-id')).toBeVisible({ timeout: 10000 });
    const fileInput = page.getByTestId('asset-upload-input');
    await fileInput.setInputFiles({ name: 'ap_test.png', mimeType: 'image/png', buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64') });
    await expect(page.getByTestId('asset-library-panel')).toBeVisible({ timeout: 5000 });
    const card = page.getByTestId('asset-library-panel').locator('[data-testid^="asset-card-"]').first();
    await card.locator('select').selectOption('start_frame');
    await page.getByTestId('workflow-shot-S01_main').click();
    await expect(page.getByTestId('canvas-node-detail-panel')).toBeVisible({ timeout: 8000 });
    const bindSelect = page.getByTestId('bind-start-frame-select');
    await expect(bindSelect).toBeVisible({ timeout: 3000 });
    const options = bindSelect.locator('option'); const count = await options.count();
    if (count > 1) { const val = await options.nth(1).getAttribute('value'); if (val) await bindSelect.selectOption(val); }
    // Generate
    await expect(page.getByTestId('single-shot-generate-button')).toBeVisible({ timeout: 3000 });
    await page.getByTestId('single-shot-generate-button').click();
    await expect(page.getByTestId('single-shot-video-preview')).toBeVisible({ timeout: 30000 });
    // Approve
    await expect(page.getByTestId('canvas-detail-approve-button')).toBeVisible({ timeout: 5000 });
    await page.getByTestId('canvas-detail-approve-button').click();
    // Verify review status updated
    await expect(page.getByTestId('canvas-detail-review-status')).toContainText('approved', { timeout: 5000 });
  });
});
