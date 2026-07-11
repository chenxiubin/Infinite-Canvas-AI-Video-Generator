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

  test('K1-13: generate stores payload summary without apiKey', async ({ page, request }) => {
    test.setTimeout(90000);
    // Mock APIMart for successful generation
    await page.route('**/api.apimart.ai/**', async (route) => {
      const url = route.request().url();
      let body = '{}';
      if (url.includes('/uploads')) body = JSON.stringify({ url: 'https://mock.apimart.ai/img.png' });
      else if (url.includes('/generations')) body = JSON.stringify({ task_id: 'task_mock_payload' });
      else body = JSON.stringify({ status: 'completed', progress: 100, result: { video_url: 'https://mock.apimart.ai/video.mp4' } });
      await route.fulfill({ status: 200, contentType: 'application/json', body });
    });
    // Setup APIMart with key and duration=8
    await openSettings(page);
    await page.getByTestId('model-provider-apimart').click();
    await page.getByTestId('apimart-api-key-input').fill('sk-test-payload-key');
    await page.getByTestId('apimart-save-key').click();
    await page.getByTestId('apimart-default-duration').selectOption('8');
    await closeSettings(page);

    // API batch setup
    const sku2 = 'K1x-'+Date.now(); const prod2 = await request.post('/api/v1/products',{data:{product_type:'desk_calendar',sku:sku2,title:'K1 '+sku2}});
    const pid2 = (await prod2.json()).product_id;
    for(const r2 of['main','detail1','detail2','scene','brand']){await request.post('/api/v1/products/'+pid2+'/assets',{data:{original_filename:sku2+'_'+r2+'.jpg',file_url:'/mock/'+sku2+'_'+r2+'.jpg'}});}
    const pd2=await request.get('/api/v1/products/'+pid2);for(const a2 of((await pd2.json()).assets||[])){if(a2.role_key&&a2.role_key!=='unrecognized')await request.put('/api/v1/products/'+pid2+'/assets/'+a2.asset_id+'/role',{data:{role_key:a2.role_key}});}
    const tmpl2=await request.get('/api/v1/video-templates?product_type=desk_calendar');const tid2=(await tmpl2.json()).templates[0].template_id;
    const batchResp2 = await request.post('/api/v1/video-batches',{data:{template_id:tid2,product_ids:[pid2]}});
    const iid2 = (await batchResp2.json()).instances[0].instance_id;
    await page.goto('about:blank');
    await page.goto(`/#instance=${iid2}`);
    await expect(page.getByTestId('mvp3-workbench')).toBeVisible({timeout:10000});
    const s01Node = page.getByTestId('shot-control-node-S01_main');
    await s01Node.scrollIntoViewIfNeeded();
    await expect(s01Node).toBeVisible({ timeout: 15000 });
    await expect(page.getByTestId('canvas-detail-shot-key')).toContainText('S01_main', { timeout: 8000 });
    await expect(page.getByTestId('inspector-generate-shot-S01_main')).toBeVisible({ timeout: 15000 });
    await page.getByTestId('inspector-generate-shot-S01_main').click();
    await expect(page.getByTestId('inspector-current-video')).toBeVisible({ timeout: 30000 });

    // Verify v1 exists
    await page.getByTestId('sidebar-icon-assets').hover();
    await page.getByTestId('asset-tab-video').click();
    await expect(page.getByTestId('video-version-card-S01_main-v1')).toBeAttached({ timeout: 10000 });

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
