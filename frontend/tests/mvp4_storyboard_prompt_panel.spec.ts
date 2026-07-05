import { test, expect } from '@playwright/test';

test.describe('MVP-4 Storyboard Prompt Panel', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForTimeout(2000);
    const wbBtn = page.getByRole('button', { name: '生产工作台' });
    if (await wbBtn.isVisible({ timeout: 5000 }).catch(() => false)) await wbBtn.click();
    await expect(page.getByTestId('mvp3-workbench')).toBeVisible({ timeout: 10000 });
  });

  function selectShot(page: any, shotKey: string) {
    return page.getByTestId(`workflow-shot-${shotKey}`).click();
  }

  test('M4-Prompt-01: basic mode fields visible and editable for S01', async ({ page }) => {
    test.setTimeout(30000);
    await selectShot(page, 'S01_main');
    await expect(page.getByTestId('canvas-node-detail-panel')).toBeVisible({ timeout: 8000 });
    for (const f of ['shot_size', 'camera_move', 'lighting_mood', 'motion_intensity', 'defocus_level']) {
      await expect(page.getByTestId(`storyboard-${f}-S01_main`)).toBeVisible({ timeout: 3000 });
    }
    await page.getByTestId('storyboard-camera_move-S01_main').selectOption('推进');
    await expect(page.getByTestId('storyboard-safety_margin-S01_main')).toBeVisible({ timeout: 3000 });
    await page.getByTestId('storyboard-camera_move-S01_main').selectOption('静止');
    await expect(page.getByTestId('storyboard-safety_margin-S01_main')).not.toBeAttached({ timeout: 3000 });
  });

  test('M4-Prompt-02: advanced mode shows textarea and safety suffix checkbox', async ({ page }) => {
    test.setTimeout(30000);
    await selectShot(page, 'S02_detail1');
    await expect(page.getByTestId('canvas-node-detail-panel')).toBeVisible({ timeout: 8000 });
    await page.getByTestId('inspector-mode-advanced-S02_detail1').click();
    await expect(page.getByTestId('storyboard-custom-prompt-S02_detail1')).toBeVisible({ timeout: 3000 });
    await expect(page.getByTestId('storyboard-safety-suffix-S02_detail1')).toBeVisible({ timeout: 3000 });
    await expect(page.getByTestId('storyboard-reset-prompt-S02_detail1')).toBeVisible({ timeout: 3000 });
  });

  test('M4-Prompt-03: custom prompt locks basic fields', async ({ page }) => {
    test.setTimeout(30000);
    await selectShot(page, 'S03_detail2');
    await expect(page.getByTestId('canvas-node-detail-panel')).toBeVisible({ timeout: 8000 });
    await page.getByTestId('inspector-mode-advanced-S03_detail2').click();
    await page.getByTestId('storyboard-custom-prompt-S03_detail2').fill('Custom test prompt');
    await page.getByTestId('inspector-mode-basic-S03_detail2').click();
    await expect(page.getByTestId('storyboard-shot_size-S03_detail2')).toBeDisabled({ timeout: 3000 });
  });

  test('M4-Prompt-04: reset restores standard template', async ({ page }) => {
    test.setTimeout(30000);
    await selectShot(page, 'S04_motion');
    await expect(page.getByTestId('canvas-node-detail-panel')).toBeVisible({ timeout: 8000 });
    await page.getByTestId('inspector-mode-advanced-S04_motion').click();
    await page.getByTestId('storyboard-custom-prompt-S04_motion').fill('Temporary custom');
    await page.getByTestId('storyboard-reset-prompt-S04_motion').click();
    await page.getByTestId('inspector-mode-basic-S04_motion').click();
    await expect(page.getByTestId('storyboard-shot_size-S04_motion')).toBeEnabled({ timeout: 3000 });
  });

  test('M4-Prompt-05: S06 displays as 收尾呼应 with compatible testid', async ({ page }) => {
    test.setTimeout(30000);
    await expect(page.getByTestId('workflow-shot-S06_brand')).toContainText('收尾呼应');
    await expect(page.getByTestId('workflow-shot-S06_brand')).not.toContainText('尾帧-LOGO');
  });

  test('M4-Prompt-06: safety suffix checkbox works independently', async ({ page }) => {
    test.setTimeout(30000);
    await selectShot(page, 'S05_scene');
    await expect(page.getByTestId('canvas-node-detail-panel')).toBeVisible({ timeout: 8000 });
    await page.getByTestId('inspector-mode-advanced-S05_scene').click();
    const cb = page.getByTestId('storyboard-safety-suffix-S05_scene');
    await expect(cb).toBeChecked({ timeout: 3000 });
    await cb.uncheck();
    await expect(cb).not.toBeChecked({ timeout: 2000 });
    await cb.check();
    await expect(cb).toBeChecked({ timeout: 2000 });
  });

  test('M4-Prompt-07: S04 motion shot version panel with primary/backup options', async ({ page }) => {
    test.setTimeout(30000);
    await selectShot(page, 'S04_motion');
    await expect(page.getByTestId('canvas-node-detail-panel')).toBeVisible({ timeout: 8000 });
    const panel = page.getByTestId('motion-shot-version-panel');
    await expect(panel).toBeVisible({ timeout: 8000 });
    await expect(panel).toContainText('主方案：翻页/动作定格');
    await expect(panel).toContainText('备用方案：尺寸参考同框');
  });
});
