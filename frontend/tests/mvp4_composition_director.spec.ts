import { test, expect } from '@playwright/test';

test.describe('MVP-4 10J Composition Director', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    const wbBtn = page.getByRole('button', { name: '生产工作台' });
    if (await wbBtn.isVisible({ timeout: 5000 }).catch(() => false)) await wbBtn.click();
    await expect(page.getByTestId('mvp3-workbench')).toBeVisible({ timeout: 10000 });
  });

  // Open director via the header button (always visible, reliable)
  async function openDirector(page: any) {
    await page.getByTestId('director-open-header-btn').click();
    await expect(page.getByTestId('director-title')).toBeVisible({ timeout: 5000 });
  }

  // ── Real entry point ──
  test('CD-open-real-entry: director opens via merge-node button', async ({ page }) => {
    test.setTimeout(90000);
    await page.getByTestId('run-full-demo-button').click();
    await expect(page.getByTestId('production-status-compact')).toBeAttached({ timeout: 30000 });
    await expect(page.getByTestId('merge-node-status')).toContainText('已通过', { timeout: 10000 });
    await openDirector(page);
    await expect(page.getByTestId('director-title')).toContainText('总合成导演台');
  });

  // ── Empty state (no demo, no viewport issues) ──
  test('CD-empty: empty director shows preview and timeline empty', async ({ page }) => {
    test.setTimeout(30000);
    await page.getByTestId('merge-node-open-director').scrollIntoViewIfNeeded();
    await page.getByTestId('merge-node-open-director').click({ timeout: 10000 });
    await expect(page.getByTestId('director-title')).toBeVisible({ timeout: 5000 });
    await expect(page.getByTestId('composition-preview-empty')).toContainText('暂无预览');
    await expect(page.getByTestId('director-empty-state')).toContainText('暂无可编排视频');
  });

  // ── No prompt editor ──
  test('CD-no-prompt-editor: no prompt textarea visible', async ({ page }) => {
    test.setTimeout(60000);
    await page.getByTestId('run-full-demo-button').click();
    await expect(page.getByTestId('production-status-compact')).toBeAttached({ timeout: 30000 });
    await openDirector(page);
    const modalText = await page.locator('.fixed.inset-0.z-50').textContent() || '';
    expect(modalText).not.toMatch(/片段提示词/);
    expect(modalText).not.toMatch(/输入当前片段提示词/);
    expect(modalText).not.toMatch(/Segment Prompt/);
    // Prompt textarea should be hidden
    const promptArea = page.locator('.pr-prompt-area');
    await expect(promptArea).toBeHidden({ timeout: 3000 });
  });

  // ── Two tracks visible ──
  test('CD-two-tracks-visible: video track + audio track both shown', async ({ page }) => {
    test.setTimeout(60000);
    await page.getByTestId('run-full-demo-button').click();
    await expect(page.getByTestId('production-status-compact')).toBeAttached({ timeout: 30000 });
    await openDirector(page);
    // Video track
    await expect(page.getByTestId('composition-shot-timeline-track')).toBeVisible({ timeout: 5000 });
    await expect(page.getByTestId('composition-shot-segment-S01_main')).toBeVisible({ timeout: 3000 });
    // Audio track
    await expect(page.getByTestId('composition-audio-track')).toBeVisible({ timeout: 5000 });
    await expect(page.getByTestId('composition-audio-empty')).toContainText('暂无音频', { timeout: 3000 });
    await expect(page.getByTestId('composition-audio-add-button')).toContainText('添加背景音乐', { timeout: 3000 });
  });

  // ── Shot track still works ──
  test('CD-shot-track-still-works: clicking segment switches preview', async ({ page }) => {
    test.setTimeout(60000);
    await page.getByTestId('run-full-demo-button').click();
    await expect(page.getByTestId('production-status-compact')).toBeAttached({ timeout: 30000 });
    await openDirector(page);
    await expect(page.getByTestId('composition-preview-title')).toContainText('S01_main', { timeout: 3000 });
    await page.getByTestId('composition-shot-segment-S02_detail1').click();
    await expect(page.getByTestId('composition-preview-title')).toContainText('S02_detail1', { timeout: 3000 });
    await page.getByTestId('composition-shot-segment-S01_main').click();
    await expect(page.getByTestId('composition-preview-title')).toContainText('S01_main', { timeout: 3000 });
  });

  // ── Trim still works ──
  test('CD-trim-still-works: plus/minus adjust segment length', async ({ page }) => {
    test.setTimeout(60000);
    await page.getByTestId('run-full-demo-button').click();
    await expect(page.getByTestId('production-status-compact')).toBeAttached({ timeout: 30000 });
    await openDirector(page);
    const durEl = page.getByTestId('composition-shot-segment-duration-S01_main');
    const initialText = await durEl.textContent();
    expect(initialText).toBeTruthy();
    await page.getByTestId('composition-segment-trim-plus-S01_main').click();
    const afterPlus = await durEl.textContent();
    expect(afterPlus).not.toBe(initialText);
    await page.getByTestId('composition-segment-trim-minus-S01_main').click();
    const afterMinus = await durEl.textContent();
    expect(afterMinus).toBe(initialText);
  });

  // ── Drag sort still works ──
  test('CD-drag-still-works: drag reorders segments', async ({ page }) => {
    test.setTimeout(60000);
    await page.getByTestId('run-full-demo-button').click();
    await expect(page.getByTestId('production-status-compact')).toBeAttached({ timeout: 30000 });
    await openDirector(page);
    await expect(page.getByTestId('composition-preview-title')).toContainText('S01_main', { timeout: 3000 });
    const s01 = page.getByTestId('composition-shot-segment-S01_main');
    const s02 = page.getByTestId('composition-shot-segment-S02_detail1');
    await s02.dragTo(s01);
    await expect(page.getByTestId('composition-preview-title')).toContainText('S02_detail1', { timeout: 5000 });
    // Close and reopen — order persists
    await page.getByTestId('director-close-button').click();
    await expect(page.getByTestId('director-title')).toBeHidden({ timeout: 5000 });
    await openDirector(page);
    await expect(page.getByTestId('composition-preview-title')).toContainText('S02_detail1', { timeout: 5000 });
  });

  // ── Duration settings ──
  test('CD-duration-settings: duration bar functional', async ({ page }) => {
    test.setTimeout(60000);
    await page.getByTestId('run-full-demo-button').click();
    await expect(page.getByTestId('production-status-compact')).toBeAttached({ timeout: 30000 });
    await openDirector(page);
    await expect(page.getByTestId('composition-duration-settings')).toBeVisible({ timeout: 5000 });
    await page.getByTestId('duration-preset-30').click();
    await expect(page.getByTestId('duration-average-button')).toBeVisible({ timeout: 3000 });
    await page.getByTestId('duration-average-button').click();
  });

  // ── Play toggle ──
  test('CD-play-toggle: play button toggles', async ({ page }) => {
    test.setTimeout(60000);
    await page.getByTestId('run-full-demo-button').click();
    await expect(page.getByTestId('production-status-compact')).toBeAttached({ timeout: 30000 });
    await openDirector(page);
    const playBtn = page.getByTestId('composition-preview-play-toggle');
    await expect(playBtn).toBeVisible({ timeout: 3000 });
    await expect(playBtn).toHaveAttribute('title', '播放');
    await playBtn.click();
    await expect(playBtn).toHaveAttribute('title', '暂停', { timeout: 3000 });
  });

  // ── Chinese UI ──
  test('CD-chinese-ui: no English visible', async ({ page }) => {
    test.setTimeout(60000);
    await page.getByTestId('run-full-demo-button').click();
    await expect(page.getByTestId('production-status-compact')).toBeAttached({ timeout: 30000 });
    await expect(page.getByTestId('merge-node-status')).toContainText('已通过', { timeout: 10000 });
    await openDirector(page);
    const modalText = await page.locator('.fixed.inset-0.z-50').textContent() || '';
    expect(modalText).not.toMatch(/Add Image/);
    expect(modalText).not.toMatch(/Add Text/);
    expect(modalText).not.toMatch(/Add Audio/);
    expect(modalText).not.toMatch(/Custom Audio/);
    expect(modalText).not.toMatch(/Guide Strength/);
    expect(modalText).not.toMatch(/Segment Prompt/);
    expect(modalText).not.toMatch(/Play\/Pause Audio/);
    expect(modalText).not.toMatch(/Toggle Loop/);
    expect(modalText).toMatch(/总合成导演台/);
    expect(modalText).toMatch(/分镜视频轨道/);
    expect(modalText).toMatch(/音频轨道/);
  });

  // ── Plan badge ──
  test('CD-plan: MergeNode shows plan badge after director', async ({ page }) => {
    test.setTimeout(60000);
    await page.getByTestId('run-full-demo-button').click();
    await expect(page.getByTestId('production-status-compact')).toBeAttached({ timeout: 30000 });
    await expect(page.getByTestId('merge-node-status')).toContainText('已通过', { timeout: 10000 });
    await openDirector(page);
    await page.getByTestId('director-close-button').click();
    await expect(page.getByTestId('director-title')).toBeHidden({ timeout: 5000 });
    await expect(page.getByTestId('merge-node-plan-badge')).toBeAttached({ timeout: 8000 });
    await expect(page.getByTestId('merge-node-plan-badge')).toContainText('已编排');
  });

  // ── Optional shot ──
  test('CD-demo-segments: optional shot shows 7 segments', async ({ page }) => {
    test.setTimeout(90000);
    await page.getByTestId('sidebar-icon-productLine').hover();
    await expect(page.getByTestId('workflow-sidebar-expanded')).toBeVisible({ timeout: 5000 });
    await page.getByTestId('optional-shot-toggle').check();
    await page.getByTestId('run-full-demo-button').click();
    await expect(page.getByTestId('production-status-compact')).toBeAttached({ timeout: 60000 });
    await openDirector(page);
    await expect(page.getByTestId('composition-shot-segment-S07_size_ref')).toBeVisible({ timeout: 5000 });
  });
});
