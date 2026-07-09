import { test, expect } from '@playwright/test';

test.describe('MVP-4 10K-1 APIMart Model Settings', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    const wbBtn = page.getByRole('button', { name: '生产工作台' });
    if (await wbBtn.isVisible({ timeout: 5000 }).catch(() => false)) await wbBtn.click();
    await expect(page.getByTestId('mvp3-workbench')).toBeVisible({ timeout: 10000 });
  });

  async function openSettings(page: any) {
    await page.getByTestId('model-settings-button').click();
    await expect(page.getByTestId('model-settings-panel')).toBeVisible({ timeout: 5000 });
  }

  async function closeSettings(page: any) {
    await page.getByTestId('model-settings-panel-title').locator('..').locator('button').last().click();
    // Panel should close
  }

  // ── Header location tests ──
  test('K1-header-01: model-settings-button is in the WorkbenchHeader', async ({ page }) => {
    test.setTimeout(30000);
    const header = page.getByTestId('workbench-header');
    const btn = header.getByTestId('model-settings-button');
    await expect(btn).toBeAttached({ timeout: 3000 });
  });

  test('K1-header-02: only one model-settings-button exists', async ({ page }) => {
    test.setTimeout(30000);
    await expect(page.getByTestId('model-settings-button')).toHaveCount(1);
  });

  test('K1-header-03: button is in header, not status bar', async ({ page }) => {
    test.setTimeout(30000);
    const headerBtn = page.getByTestId('workbench-header').getByTestId('model-settings-button');
    await expect(headerBtn).toBeAttached({ timeout: 3000 });
  });

  test('K1-header-04: default displays Mock', async ({ page }) => {
    test.setTimeout(30000);
    await expect(page.getByTestId('model-settings-button')).toContainText('Mock 演示');
  });

  test('K1-header-05: switch APIMart without key shows not configured', async ({ page }) => {
    test.setTimeout(30000);
    await openSettings(page);
    await page.getByTestId('model-provider-apimart').click();
    await closeSettings(page);
    await expect(page.getByTestId('model-settings-button')).toContainText('APIMart · 未配置 Key');
  });

  test('K1-header-06: Chinese model name in header', async ({ page }) => {
    test.setTimeout(30000);
    await openSettings(page);
    await page.getByTestId('model-provider-apimart').click();
    await page.getByTestId('apimart-api-key-input').fill('sk-test-key-12345678');
    await page.getByTestId('apimart-save-key').click();
    await closeSettings(page);
    // Default model is doubao-seedance-1-5-pro → Chinese name
    await expect(page.getByTestId('model-settings-button')).toContainText('豆包 Seedance 1.5 Pro');
    await expect(page.getByTestId('model-settings-button')).not.toContainText('doubao-seedance-1-5-pro');
  });

  test('K1-header-07: no old model-adapter-header-select', async ({ page }) => {
    test.setTimeout(30000);
    await expect(page.getByTestId('model-adapter-header-select')).toBeHidden({ timeout: 3000 });
  });

  // ── Core settings tests ──
  test('K1-04: switch to APIMart shows key input', async ({ page }) => {
    test.setTimeout(30000);
    await openSettings(page);
    await page.getByTestId('model-provider-apimart').click();
    await expect(page.getByTestId('apimart-api-key-input')).toBeVisible({ timeout: 3000 });
  });

  test('K1-05: API key input supports typing and show/hide', async ({ page }) => {
    test.setTimeout(30000);
    await openSettings(page);
    await page.getByTestId('model-provider-apimart').click();
    const input = page.getByTestId('apimart-api-key-input');
    await input.fill('sk-test-key-12345678');
    await expect(input).toHaveAttribute('type', 'password');
    await page.getByTestId('apimart-api-key-toggle-visibility').click();
    await expect(input).toHaveAttribute('type', 'text');
  });

  test('K1-06: save key shows mask in UI', async ({ page }) => {
    test.setTimeout(30000);
    await openSettings(page);
    await page.getByTestId('model-provider-apimart').click();
    await page.getByTestId('apimart-api-key-input').fill('sk-test-key-12345678');
    await page.getByTestId('apimart-save-key').click();
    // Mask should appear in the panel text
    const panelText = await page.getByTestId('model-settings-panel').textContent();
    expect(panelText).toContain('sk-****5678');
    // Full key should NOT be visible
    expect(panelText).not.toContain('sk-test-key-12345678');
  });

  test('K1-07: clear key removes mask and empties input', async ({ page }) => {
    test.setTimeout(30000);
    await openSettings(page);
    await page.getByTestId('model-provider-apimart').click();
    await page.getByTestId('apimart-api-key-input').fill('sk-test-key-12345678');
    await page.getByTestId('apimart-save-key').click();
    await page.getByTestId('apimart-clear-key').click();
    // Input should be empty after clear
    await expect(page.getByTestId('apimart-api-key-input')).toHaveValue('');
    // Mask should no longer appear
    const panelText = await page.getByTestId('model-settings-panel').textContent();
    expect(panelText).not.toContain('sk-****');
  });

  test('K1-08: test connection shows status without evaluate', async ({ page }) => {
    test.setTimeout(30000);
    await page.route('**/models', route => route.abort('failed'));
    await openSettings(page);
    await page.getByTestId('model-provider-apimart').click();
    await page.getByTestId('apimart-api-key-input').fill('sk-test-key-12345678');
    await page.getByTestId('apimart-save-key').click();
    await page.getByTestId('apimart-test-connection').click();
    await expect(page.getByTestId('apimart-connection-status')).toBeAttached({ timeout: 15000 });
    const statusText = await page.getByTestId('apimart-connection-status').textContent();
    expect(statusText).toBeTruthy();
  });

  test('K1-09: video model list shows builtin models', async ({ page }) => {
    test.setTimeout(30000);
    await openSettings(page);
    await page.getByTestId('model-provider-apimart').click();
    await expect(page.getByTestId('apimart-model-card-doubao-seedance-1-5-pro')).toBeAttached({ timeout: 5000 });
    await expect(page.getByTestId('apimart-model-card-sora-2')).toBeAttached({ timeout: 3000 });
  });

  test('K1-10: model card shows cost and capabilities', async ({ page }) => {
    test.setTimeout(30000);
    await openSettings(page);
    await page.getByTestId('model-provider-apimart').click();
    const card = page.getByTestId('apimart-model-card-doubao-seedance-1-5-pro');
    await expect(card).toContainText('豆包 Seedance 1.5 Pro');
    await expect(card).toContainText('中成本');
    await expect(card).toContainText('首帧');
  });

  test('K1-11: select model updates selection state', async ({ page }) => {
    test.setTimeout(30000);
    await openSettings(page);
    await page.getByTestId('model-provider-apimart').click();
    await page.getByTestId('apimart-select-model-sora-2').click();
    await expect(page.getByTestId('apimart-select-model-sora-2')).toContainText('已选择');
  });

  test('K1-12: default params persist after reopen', async ({ page }) => {
    test.setTimeout(30000);
    await openSettings(page);
    await page.getByTestId('model-provider-apimart').click();
    await page.getByTestId('apimart-default-duration').selectOption('8');
    await closeSettings(page);
    await openSettings(page);
    await page.getByTestId('model-provider-apimart').click();
    await expect(page.getByTestId('apimart-default-duration')).toHaveValue('8');
  });

  test('K1-13: generate stores payload summary without apiKey', async ({ page }) => {
    test.setTimeout(90000);
    // Setup APIMart with key and duration=8
    await openSettings(page);
    await page.getByTestId('model-provider-apimart').click();
    await page.getByTestId('apimart-api-key-input').fill('sk-test-payload-key');
    await page.getByTestId('apimart-save-key').click();
    await page.getByTestId('apimart-default-duration').selectOption('8');
    await closeSettings(page);

    // Run demo
    await page.getByTestId('run-full-demo-button').click();
    await expect(page.getByTestId('production-status-compact')).toBeAttached({ timeout: 30000 });
    await expect(page.getByTestId('merge-node-status')).toContainText('已通过', { timeout: 10000 });

    // Generate S01 via canvas button with viewport fix
    await page.getByTestId('canvas-reset-view').click();
    await page.getByTestId('shot-control-node-S01_main').scrollIntoViewIfNeeded();
    await page.getByTestId('shot-control-generate-S01_main').click({ timeout: 15000 });

    // Wait for v2 to appear
    await page.getByTestId('sidebar-icon-assets').hover();
    await page.getByTestId('asset-tab-video').click();
    await expect(page.getByTestId('video-version-card-S01_main-v2')).toBeAttached({ timeout: 10000 });

    // Read payload summary from hidden test div
    const summary = page.getByTestId('last-generate-payload-summary');
    await expect(summary).toBeAttached({ timeout: 5000 });
    const summaryText = await summary.textContent();
    expect(summaryText).toContain('provider:apimart');
    expect(summaryText).toContain('model:doubao-seedance-1-5-pro');
    expect(summaryText).toContain('duration:8s');
    expect(summaryText).toContain('resolution:720p');
    expect(summaryText).toContain('aspectRatio:3:4');
    expect(summaryText).toContain('audio:false');
    // MUST NOT contain apiKey
    expect(summaryText).not.toContain('sk-test-payload-key');
    expect(summaryText).not.toContain('apiKey');
  });

  test('K1-14: settings survive page reload', async ({ page }) => {
    test.setTimeout(30000);
    await openSettings(page);
    await page.getByTestId('model-provider-apimart').click();
    await page.getByTestId('apimart-api-key-input').fill('sk-test-survive-reload');
    await page.getByTestId('apimart-save-key').click();
    await page.getByTestId('apimart-default-duration').selectOption('10');
    // Reload and verify through UI
    await page.reload();
    await expect(page.getByTestId('mvp3-workbench')).toBeVisible({ timeout: 10000 });
    await expect(page.getByTestId('model-settings-button')).toContainText('APIMart', { timeout: 5000 });
    await openSettings(page);
    await page.getByTestId('model-provider-apimart').click();
    await expect(page.getByTestId('apimart-default-duration')).toHaveValue('10');
    const panelText = await page.getByTestId('model-settings-panel').textContent();
    expect(panelText).toContain('sk-****load');
  });

  test('K1-15: api key is masked in UI', async ({ page }) => {
    test.setTimeout(30000);
    await openSettings(page);
    await page.getByTestId('model-provider-apimart').click();
    await page.getByTestId('apimart-api-key-input').fill('sk-abcdefghijklmnop12345678');
    await page.getByTestId('apimart-save-key').click();
    const modalText = await page.locator('.fixed.inset-0.z-50').textContent() || '';
    expect(modalText).not.toContain('sk-abcdefghijklmnop12345678');
    expect(modalText).toContain('sk-****5678');
  });
});
