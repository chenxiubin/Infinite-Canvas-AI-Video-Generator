import { test, expect } from '@playwright/test';

test.describe('MVP-4 Storyboard Prompt Panel', () => {
  // Create product + batch WITHOUT generating videos.
  // Storyboard panel needs shot nodes on canvas only, no video generation needed.
  async function setupWorkflow(page: any, request: any) {
    const sku = 'SP-' + Date.now();
    const prod = await request.post('/api/v1/products', { data: { product_type: 'desk_calendar', sku, title: 'SP ' + sku } });
    const pid = (await prod.json()).product_id;
    for (const r of ['main','detail1','detail2','scene','brand']) {
      await request.post(`/api/v1/products/${pid}/assets`, { data: { original_filename: `${sku}_${r}.jpg`, file_url: `/mock/${sku}_${r}.jpg` } });
    }
    const pd = await request.get(`/api/v1/products/${pid}`);
    for (const a of ((await pd.json()).assets || [])) {
      if (a.role_key && a.role_key !== 'unrecognized') {
        await request.put(`/api/v1/products/${pid}/assets/${a.asset_id}/role`, { data: { role_key: a.role_key } });
      }
    }
    const tmpl = await request.get('/api/v1/video-templates?product_type=desk_calendar');
    const tid = (await tmpl.json()).templates[0].template_id;
    const batchResp = await request.post('/api/v1/video-batches', { data: { template_id: tid, product_ids: [pid] } });
    const iid = (await batchResp.json()).instances[0].instance_id;
    await page.goto(`/#instance=${iid}`);
    await expect(page.getByTestId('mvp3-workbench')).toBeVisible({ timeout: 10000 });
    await expect(page.getByTestId('shot-control-node-S01_main')).toBeVisible({ timeout: 15000 });
  }

  async function selectShot(page: any, shotKey: string) {
    const shotKeyLabel = page.getByTestId('canvas-detail-shot-key');
    const selectedShot = await shotKeyLabel.textContent().catch(() => '');
    if (!selectedShot?.includes(shotKey)) {
      await page.getByTestId('canvas-reset-view').click();
      const node = page.getByTestId(`shot-control-node-${shotKey}`);
      await node.scrollIntoViewIfNeeded();
      await expect(node).toBeVisible({ timeout: 10000 });
      await node.click();
    }
    await expect(shotKeyLabel).toContainText(shotKey, { timeout: 8000 });
  }

  test('M4-Prompt-01: basic mode fields visible and editable for S01', async ({ page, request }) => {
    test.setTimeout(60000);
    await setupWorkflow(page, request);
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

  test('M4-Prompt-02: advanced mode shows textarea and safety suffix checkbox', async ({ page, request }) => {
    test.setTimeout(60000);
    await setupWorkflow(page, request);
    await selectShot(page, 'S02_detail1');
    await expect(page.getByTestId('canvas-node-detail-panel')).toBeVisible({ timeout: 8000 });
    await page.getByTestId('inspector-mode-advanced-S02_detail1').click();
    await expect(page.getByTestId('storyboard-custom-prompt-S02_detail1')).toBeVisible({ timeout: 3000 });
    await expect(page.getByTestId('storyboard-safety-suffix-S02_detail1')).toBeVisible({ timeout: 3000 });
    await expect(page.getByTestId('storyboard-reset-prompt-S02_detail1')).toBeVisible({ timeout: 3000 });
  });

  test('M4-Prompt-03: custom prompt locks basic fields', async ({ page, request }) => {
    test.setTimeout(60000);
    await setupWorkflow(page, request);
    await selectShot(page, 'S03_detail2');
    await expect(page.getByTestId('canvas-node-detail-panel')).toBeVisible({ timeout: 8000 });
    await page.getByTestId('inspector-mode-advanced-S03_detail2').click();
    await page.getByTestId('storyboard-custom-prompt-S03_detail2').fill('Custom test prompt');
    await page.getByTestId('inspector-mode-basic-S03_detail2').click();
    await expect(page.getByTestId('storyboard-shot_size-S03_detail2')).toBeDisabled({ timeout: 3000 });
  });

  test('M4-Prompt-04: reset restores standard template', async ({ page, request }) => {
    test.setTimeout(60000);
    await setupWorkflow(page, request);
    await selectShot(page, 'S04_motion');
    await expect(page.getByTestId('canvas-node-detail-panel')).toBeVisible({ timeout: 8000 });
    await page.getByTestId('inspector-mode-advanced-S04_motion').click();
    await page.getByTestId('storyboard-custom-prompt-S04_motion').fill('Temporary custom');
    await page.getByTestId('storyboard-reset-prompt-S04_motion').click();
    await page.getByTestId('inspector-mode-basic-S04_motion').click();
    await expect(page.getByTestId('storyboard-shot_size-S04_motion')).toBeEnabled({ timeout: 3000 });
  });

  test('M4-Prompt-05: S06 brand shot not labeled as 尾帧', async ({ page, request }) => {
    test.setTimeout(60000);
    await setupWorkflow(page, request);
    await selectShot(page, 'S06_brand');
    await expect(page.getByTestId('canvas-node-detail-panel')).toBeVisible({ timeout: 8000 });
    await expect(page.getByTestId('canvas-detail-shot-key')).toContainText('S06_brand');
    const panelText = await page.getByTestId('canvas-node-detail-panel').textContent();
    expect(panelText).not.toContain('尾帧-LOGO');
  });

  test('M4-Prompt-06: safety suffix checkbox works independently', async ({ page, request }) => {
    test.setTimeout(60000);
    await setupWorkflow(page, request);
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
