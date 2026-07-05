import { test, expect } from '@playwright/test';

test.describe('MVP-4 Product Line Profile', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForTimeout(2000);
    const wbBtn = page.getByRole('button', { name: '生产工作台' });
    if (await wbBtn.isVisible({ timeout: 5000 }).catch(() => false)) await wbBtn.click();
    await expect(page.getByTestId('mvp3-workbench')).toBeVisible({ timeout: 10000 });
  });

  test('M4-PL-01: default is desk calendar with correct material requirements', async ({ page }) => {
    test.setTimeout(30000);
    await expect(page.getByTestId('current-product-line-label')).toContainText('台历');
    await expect(page.getByTestId('product-line-selector')).toBeVisible();
    await expect(page.getByTestId('material-requirement-S03')).toContainText('底座');
    await expect(page.getByTestId('material-requirement-S05')).toContainText('书桌');
  });

  test('M4-PL-02: switch to wall calendar changes material requirements', async ({ page }) => {
    test.setTimeout(30000);
    await page.getByTestId('product-line-wall-calendar').click();
    await expect(page.getByTestId('current-product-line-label')).toContainText('挂历');
    await expect(page.getByTestId('material-requirement-S03')).toContainText('挂绳');
    await expect(page.getByTestId('material-requirement-S05')).toContainText('客厅');
  });

  test('M4-PL-03: switch back to desk calendar restores original', async ({ page }) => {
    test.setTimeout(30000);
    await page.getByTestId('product-line-wall-calendar').click();
    await page.getByTestId('product-line-desk-calendar').click();
    await expect(page.getByTestId('current-product-line-label')).toContainText('台历');
    await expect(page.getByTestId('material-requirement-S03')).toContainText('底座');
  });

  test('M4-PL-05: custom prompt protected when switching product line', async ({ page }) => {
    test.setTimeout(40000);
    // Customize S03 prompt on desk calendar
    await page.getByTestId('workflow-shot-S03_detail2').click();
    await expect(page.getByTestId('canvas-node-detail-panel')).toBeVisible({ timeout: 8000 });
    await page.getByTestId('inspector-mode-advanced-S03_detail2').click();
    await page.getByTestId('storyboard-custom-prompt-S03_detail2').fill('自定义台历结构测试提示词');
    // Switch to wall calendar
    await page.getByTestId('product-line-wall-calendar').click();
    // Verify custom prompt preserved
    await page.getByTestId('workflow-shot-S03_detail2').click();
    await expect(page.getByTestId('canvas-node-detail-panel')).toBeVisible({ timeout: 8000 });
    const ta = page.getByTestId('storyboard-custom-prompt-S03_detail2');
    await expect(ta).toHaveValue('自定义台历结构测试提示词');
    // Verify protection warning
    await expect(page.getByTestId('custom-prompt-product-line-protection-warning')).toBeVisible({ timeout: 3000 });
    await expect(page.getByTestId('custom-prompt-product-line-protection-warning')).toContainText('切换产品线未自动覆盖提示词');
    // Reset to standard template
    await page.getByTestId('storyboard-reset-prompt-S03_detail2').click();
    // Verify warning disappears and default prompt changes to wall calendar direction
    await expect(page.getByTestId('custom-prompt-product-line-protection-warning')).not.toBeAttached({ timeout: 3000 });
    await page.getByTestId('inspector-mode-advanced-S03_detail2').click();
    await expect(page.getByTestId('storyboard-custom-prompt-S03_detail2')).not.toContainText('自定义台历结构测试提示词', { timeout: 3000 });
  });

  test('M4-PL-04: S04 backup shows extra material requirement', async ({ page }) => {
    test.setTimeout(30000);
    // Select S04 and switch to backup
    await page.getByTestId('workflow-shot-S04_motion').click();
    await expect(page.getByTestId('canvas-node-detail-panel')).toBeVisible({ timeout: 8000 });
    const sel = page.getByTestId('motion-shot-version-panel').locator('select');
    await sel.selectOption('backup');
    // Verify desk calendar backup hint
    await expect(page.getByTestId('material-requirement-S04-backup')).toContainText('桌面参照物');
    // Switch to wall calendar
    await page.getByTestId('product-line-wall-calendar').click();
    await expect(page.getByTestId('material-requirement-S04-backup')).toContainText('门框');
  });
});
