import { test, expect } from '@playwright/test';

test.describe('MVP-4 Review Workflow', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    const wbBtn = page.getByRole('button', { name: '生产工作台' });
    if (await wbBtn.isVisible({ timeout: 5000 }).catch(() => false)) await wbBtn.click();
    await expect(page.getByTestId('mvp3-workbench')).toBeVisible({ timeout: 10000 });
    // Run full demo — creates nodes with status=success and review_status=approved.
    // Demo also populates videoAssetsByShot + currentVideoByShot, so
    // inspector-current-video (not single-shot-video-preview) is rendered.
    await page.getByTestId('run-full-demo-button').click();
    await expect(page.getByTestId('production-status-compact')).toBeAttached({ timeout: 30000 });
    await expect(page.getByTestId('merge-node-status')).toContainText('已通过', { timeout: 10000 });
    // S01_main is selected by default
    await expect(page.getByTestId('canvas-detail-shot-key')).toContainText('S01_main', { timeout: 8000 });
  });

  test('M4-Review-01: reject, regenerate, then approve', async ({ page }) => {
    test.setTimeout(60000);

    // Step 1: reject with reason → node review_status = rejected
    await expect(page.getByTestId('canvas-detail-reject-reason')).toBeVisible({ timeout: 5000 });
    await page.getByTestId('canvas-detail-reject-reason').fill('测试驳回原因');
    await page.getByTestId('canvas-detail-reject-button').click();
    await expect(page.getByTestId('canvas-detail-review-status')).toContainText('rejected', { timeout: 5000 });

    // Step 2: regenerate → node review_status resets to pending (handleRegenerateShot),
    // inspector-current-video still shows the current library entry
    await expect(page.getByTestId('single-shot-regenerate-button')).toBeVisible({ timeout: 5000 });
    await page.getByTestId('single-shot-regenerate-button').click();
    await expect(page.getByTestId('inspector-current-video')).toBeVisible({ timeout: 30000 });
    await expect(page.getByTestId('canvas-detail-review-status')).toContainText('pending', { timeout: 5000 });

    // Step 3: approve → review_status = approved
    await expect(page.getByTestId('canvas-detail-approve-button')).toBeVisible({ timeout: 5000 });
    await page.getByTestId('canvas-detail-approve-button').click();
    await expect(page.getByTestId('canvas-detail-review-status')).toContainText('approved', { timeout: 5000 });
  });

  test('M4-Review-02: reject without reason shows error', async ({ page }) => {
    test.setTimeout(60000);
    // Click reject without filling reason — must show error
    await expect(page.getByTestId('canvas-detail-reject-button')).toBeVisible({ timeout: 5000 });
    await page.getByTestId('canvas-detail-reject-button').click();
    await expect(page.getByTestId('canvas-detail-error-message')).toBeVisible({ timeout: 3000 });
    // Review status should NOT change (reject was blocked by validation)
    await expect(page.getByTestId('canvas-detail-review-status')).toContainText('approved', { timeout: 3000 });
  });

  test('M4-Review-03: fill reason then reject succeeds', async ({ page }) => {
    test.setTimeout(60000);
    // Fill reject reason and click reject
    await expect(page.getByTestId('canvas-detail-reject-reason')).toBeVisible({ timeout: 3000 });
    await page.getByTestId('canvas-detail-reject-reason').fill('测试原因');
    await page.getByTestId('canvas-detail-reject-button').click();
    await expect(page.getByTestId('canvas-detail-review-status')).toContainText('rejected', { timeout: 5000 });
    // Rejected reason should be visible in the Inspector
    await expect(page.getByTestId('single-shot-rejected-reason')).toBeVisible({ timeout: 3000 });
  });

  test('M4-Review-04: regenerate after rejection produces pending node', async ({ page }) => {
    test.setTimeout(60000);

    // Reject with reason → review_status = rejected
    await expect(page.getByTestId('canvas-detail-reject-reason')).toBeVisible({ timeout: 3000 });
    await page.getByTestId('canvas-detail-reject-reason').fill('需重新生成');
    await page.getByTestId('canvas-detail-reject-button').click();
    await expect(page.getByTestId('canvas-detail-review-status')).toContainText('rejected', { timeout: 5000 });

    // Regenerate button appears after rejection
    await expect(page.getByTestId('single-shot-regenerate-button')).toBeVisible({ timeout: 5000 });
    await page.getByTestId('single-shot-regenerate-button').click();

    // After regenerate: inspector-current-video is visible, review_status is pending,
    // and the rejected reason is cleared.
    await expect(page.getByTestId('inspector-current-video')).toBeVisible({ timeout: 30000 });
    await expect(page.getByTestId('single-shot-rejected-reason')).not.toBeVisible({ timeout: 3000 });
    await expect(page.getByTestId('canvas-detail-review-status')).toContainText('pending', { timeout: 5000 });
  });
});
