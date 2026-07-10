import { test, expect } from '@playwright/test';

test.describe('MVP-4 Storyboard Prompt Panel', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    const wbBtn = page.getByRole('button', { name: '生产工作台' });
    if (await wbBtn.isVisible({ timeout: 5000 }).catch(() => false)) await wbBtn.click();
    await expect(page.getByTestId('mvp3-workbench')).toBeVisible({ timeout: 10000 });
    // Create full demo so shot-control-node-* canvas elements exist for shot selection.
    // Does NOT use sidebar hover; does NOT use force / waitForTimeout / dispatchEvent / page.evaluate.
    await page.getByTestId('run-full-demo-button').click();
    await expect(page.getByTestId('production-status-compact')).toBeAttached({ timeout: 30000 });
    await expect(page.getByTestId('merge-node-status')).toContainText('已通过', { timeout: 10000 });
  });

  // Select a shot via canvas node click — same pattern as K2 focusShotInInspector fallback.
  async function selectShot(page: any, shotKey: string) {
    const shotKeyLabel = page.getByTestId('canvas-detail-shot-key');
    const selectedShot = await shotKeyLabel.textContent().catch(() => '');
    if (!selectedShot?.includes(shotKey)) {
      await page.getByTestId('canvas-reset-view').click();
      await expect(page.getByTestId(`shot-control-node-${shotKey}`)).toBeVisible({ timeout: 10000 });
      await page.getByTestId(`shot-control-node-${shotKey}`).click();
    }
    await expect(shotKeyLabel).toContainText(shotKey, { timeout: 8000 });
  }

  test('M4-Prompt-01: basic mode fields visible and editable for S01', async ({ page }) => {
    test.setTimeout(60000);
    // S01_main is selected by default — verify Inspector is showing it
    await expect(page.getByTestId('canvas-detail-shot-key')).toContainText('S01_main', { timeout: 8000 });
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
    test.setTimeout(60000);
    await selectShot(page, 'S02_detail1');
    await expect(page.getByTestId('canvas-node-detail-panel')).toBeVisible({ timeout: 8000 });
    await page.getByTestId('inspector-mode-advanced-S02_detail1').click();
    await expect(page.getByTestId('storyboard-custom-prompt-S02_detail1')).toBeVisible({ timeout: 3000 });
    await expect(page.getByTestId('storyboard-safety-suffix-S02_detail1')).toBeVisible({ timeout: 3000 });
    await expect(page.getByTestId('storyboard-reset-prompt-S02_detail1')).toBeVisible({ timeout: 3000 });
  });

  test('M4-Prompt-03: custom prompt locks basic fields', async ({ page }) => {
    test.setTimeout(60000);
    await selectShot(page, 'S03_detail2');
    await expect(page.getByTestId('canvas-node-detail-panel')).toBeVisible({ timeout: 8000 });
    await page.getByTestId('inspector-mode-advanced-S03_detail2').click();
    await page.getByTestId('storyboard-custom-prompt-S03_detail2').fill('Custom test prompt');
    await page.getByTestId('inspector-mode-basic-S03_detail2').click();
    await expect(page.getByTestId('storyboard-shot_size-S03_detail2')).toBeDisabled({ timeout: 3000 });
  });

  test('M4-Prompt-04: reset restores standard template', async ({ page }) => {
    test.setTimeout(60000);
    await selectShot(page, 'S04_motion');
    await expect(page.getByTestId('canvas-node-detail-panel')).toBeVisible({ timeout: 8000 });
    await page.getByTestId('inspector-mode-advanced-S04_motion').click();
    await page.getByTestId('storyboard-custom-prompt-S04_motion').fill('Temporary custom');
    await page.getByTestId('storyboard-reset-prompt-S04_motion').click();
    await page.getByTestId('inspector-mode-basic-S04_motion').click();
    await expect(page.getByTestId('storyboard-shot_size-S04_motion')).toBeEnabled({ timeout: 3000 });
  });

  test('M4-Prompt-05: S06 brand shot not labeled as 尾帧', async ({ page }) => {
    test.setTimeout(60000);
    // Select S06_brand via canvas node — verify its name is not the deprecated '尾帧-LOGO'
    await selectShot(page, 'S06_brand');
    await expect(page.getByTestId('canvas-node-detail-panel')).toBeVisible({ timeout: 8000 });
    await expect(page.getByTestId('canvas-detail-shot-key')).toContainText('S06_brand');
    // The Inspector panel content must not reference the old '尾帧-LOGO' label
    const panelText = await page.getByTestId('canvas-node-detail-panel').textContent();
    expect(panelText).not.toContain('尾帧-LOGO');
  });

  test('M4-Prompt-06: safety suffix checkbox works independently', async ({ page }) => {
    test.setTimeout(60000);
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
});
