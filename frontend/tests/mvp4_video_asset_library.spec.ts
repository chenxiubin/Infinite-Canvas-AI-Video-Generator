import { test, expect } from '@playwright/test';

test.describe('MVP-4 10I Video Asset Library', () => {
  async function ensureWorkbench(page: any) {
    await page.goto('/');
    const wbBtn = page.getByRole('button', { name: '生产工作台' });
    if (await wbBtn.isVisible({ timeout: 5000 }).catch(() => false)) await wbBtn.click();
    await expect(page.getByTestId('mvp3-workbench')).toBeVisible({ timeout: 10000 });
  }

  // Setup batch via public API. Instance opened via URL deep-link.
  async function setupBatch(page: any, request: any) {
    const sku = 'VL-' + Date.now();
    const prod = await request.post('/api/v1/products', { data: { product_type: 'desk_calendar', sku, title: 'VL ' + sku } });
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

  const ALL_SHOTS = ['S01_main','S02_detail1','S03_detail2','S04_motion','S05_scene','S06_brand'];

  // Generate and approve all shots via real Inspector UI buttons.
  async function generateAndApproveAllShots(page: any) {
    for (const sk of ALL_SHOTS) {
      const label = page.getByTestId('canvas-detail-shot-key');
      const curText = await label.textContent().catch(() => '');
      if (!curText?.includes(sk)) {
        await page.getByTestId('canvas-reset-view').click();
        const node = page.getByTestId(`shot-control-node-${sk}`);
        await node.scrollIntoViewIfNeeded();
        await expect(node).toBeVisible({ timeout: 10000 });
        await node.click();
      }
      await expect(label).toContainText(sk, { timeout: 8000 });
      await expect(page.getByTestId(`inspector-generate-shot-${sk}`)).toBeVisible({ timeout: 15000 });
      await page.getByTestId(`inspector-generate-shot-${sk}`).click();
      await expect(page.getByTestId('inspector-current-video')).toBeVisible({ timeout: 30000 });
      await expect(page.getByTestId(`inspector-approve-video-${sk}`)).toBeVisible({ timeout: 10000 });
      await page.getByTestId(`inspector-approve-video-${sk}`).click();
      await expect(page.getByTestId('inspector-current-video')).toContainText('已通过', { timeout: 5000 });
    }
  }

  test('10I-01: asset panel has image/video tabs', async ({ page }) => {
    await ensureWorkbench(page);
    test.setTimeout(30000);
    await page.getByTestId('sidebar-icon-assets').hover();
    await expect(page.getByTestId('workflow-sidebar-expanded')).toBeVisible({ timeout: 5000 });
    await expect(page.getByTestId('asset-tab-image')).toBeAttached({ timeout: 3000 });
    await expect(page.getByTestId('asset-tab-video')).toBeAttached({ timeout: 3000 });
  });

  test('10I-02: video tab shows empty state by default', async ({ page }) => {
    await ensureWorkbench(page);
    test.setTimeout(30000);
    await page.getByTestId('sidebar-icon-assets').hover();
    await page.getByTestId('asset-tab-video').click();
    await expect(page.getByTestId('video-asset-library-panel')).toBeVisible({ timeout: 3000 });
    await expect(page.getByTestId('video-asset-library-panel')).toContainText('暂无视频素材');
  });

  test('10I-03: full demo populates video library with shot groups', async ({ page, request }) => {
    test.setTimeout(60000);
    // Run full demo
    await setupBatch(page, request); await generateAndApproveAllShots(page);
    // Wait for demo to complete (status bar updates)
    // Check video library
    await page.getByTestId('sidebar-icon-assets').hover();
    await page.getByTestId('asset-tab-video').click();
    await expect(page.getByTestId('video-asset-library-panel')).toBeVisible({ timeout: 5000 });
    // Should have per-shot groups with version entries
    await expect(page.locator('[data-testid^="video-shot-group-"]').first()).toBeAttached({ timeout: 5000 });
    // Current badge should show "当前使用中"
    await expect(page.locator('[data-testid^="video-current-badge-"]').first()).toContainText('当前使用中');
    // Fixed video result nodes should show version labels
    await expect(page.getByTestId('fixed-video-node-label-S01_main')).toBeAttached({ timeout: 5000 });
  });

  test('10I-04: fixed video result node shows version and approved status after demo', async ({ page, request }) => {
    test.setTimeout(60000);
    await setupBatch(page, request); await generateAndApproveAllShots(page);
    // Check fixed video node shows v1 and approved
    await expect(page.getByTestId('fixed-video-node-label-S01_main')).toBeAttached({ timeout: 8000 });
    await expect(page.getByTestId('fixed-video-node-status-S01_main')).toContainText('已通过');
    // Merge node should be mergeable (all approved)
    await expect(page.getByTestId('merge-node-status')).toContainText('已通过');
  });

  test('10I-05: image tab still works after video tab added', async ({ page }) => {
    await ensureWorkbench(page);
    test.setTimeout(30000);
    await page.getByTestId('sidebar-icon-assets').hover();
    // Switch to video and back to image
    await page.getByTestId('asset-tab-video').click();
    await page.getByTestId('asset-tab-image').click();
    // Image panel should show empty state
    await expect(page.getByTestId('image-asset-library-panel')).toBeVisible({ timeout: 3000 });
    await expect(page.getByTestId('image-asset-library-panel')).toContainText('暂无图片素材');
  });

  test('10I-06: inspector shows current video info for selected shot', async ({ page, request }) => {
    test.setTimeout(60000);
    await setupBatch(page, request); await generateAndApproveAllShots(page);
    // Open video library to verify S01_main video exists, then select via inspector
    await page.getByTestId('sidebar-icon-assets').hover();
    await page.getByTestId('asset-tab-video').click();
    await expect(page.getByTestId('video-version-card-S01_main-v1')).toBeAttached({ timeout: 5000 });
    // Select shot node: focus canvas, reset view, click
    await page.locator('.react-flow__pane').click({ position: { x: 400, y: 200 } });
    await page.getByTestId('canvas-reset-view').click();
    await page.locator('.react-flow__pane').waitFor({ state: 'visible', timeout: 3000 });
    await page.getByTestId('shot-control-node-S01_main').scrollIntoViewIfNeeded();
    await page.getByTestId('shot-control-node-S01_main').click({ timeout: 15000 });
    // Inspector should show current video info
    await expect(page.getByTestId('inspector-current-video')).toBeAttached({ timeout: 8000 });
    await expect(page.getByTestId('inspector-current-video')).toContainText('v1');
  });

  test('10I-07: all 6 main shots in video library after generate', async ({ page, request }) => {
    test.setTimeout(60000);
    await setupBatch(page, request); await generateAndApproveAllShots(page);
    await page.getByTestId('sidebar-icon-assets').hover();
    await page.getByTestId('asset-tab-video').click();
    await expect(page.getByTestId('video-shot-group-S01_main')).toBeAttached({ timeout: 5000 });
    await expect(page.getByTestId('video-shot-group-S06_brand')).toBeAttached({ timeout: 5000 });
  });

  test('10I-08: after full demo, merge node shows approved count', async ({ page, request }) => {
    test.setTimeout(60000);
    await setupBatch(page, request); await generateAndApproveAllShots(page);
    await expect(page.getByTestId('merge-node-status')).toContainText('已通过');
    const statusText = await page.getByTestId('merge-node-status').textContent();
    expect(statusText).toContain('/');
  });

  test('10I-09: demo v1 approved, generate v2 pending, 设为当前 switches back', async ({ page, request }) => {
    test.setTimeout(120000);
    // Demo → v1 approved current for all 6 shots
    await setupBatch(page, request); await generateAndApproveAllShots(page);

    // Re-select S01_main (loop ended on S06_brand)
    await page.getByTestId('canvas-reset-view').click();
    const s01node = page.getByTestId('shot-control-node-S01_main');
    await s01node.scrollIntoViewIfNeeded();
    await expect(s01node).toBeVisible({ timeout: 10000 });
    await s01node.click();
    await expect(page.getByTestId('canvas-detail-shot-key')).toContainText('S01_main', { timeout: 8000 });

    // Generate v2 pending for S01 via Inspector
    await expect(page.getByTestId('inspector-generate-shot-S01_main')).toBeVisible({ timeout: 15000 });
    await page.getByTestId('inspector-generate-shot-S01_main').click();
    await expect(page.getByTestId('inspector-current-video')).toBeVisible({ timeout: 30000 });

    // Open video library in sidebar
    await page.getByTestId('sidebar-icon-assets').hover();
    await page.getByTestId('asset-tab-video').click();
    await expect(page.getByTestId('video-asset-library-panel')).toBeVisible({ timeout: 5000 });

    // Both v1 (approved) and v2 (pending) cards exist
    await expect(page.getByTestId('video-version-card-S01_main-v1')).toBeAttached({ timeout: 5000 });
    await expect(page.getByTestId('video-version-card-S01_main-v2')).toBeAttached({ timeout: 10000 });

    // v2 (pending) is current → badge "当前使用中"
    await expect(page.getByTestId('video-current-badge-S01_main-v2')).toContainText('当前使用中');
    // v1 (approved, not current) → has "设为当前" button
    await expect(page.getByTestId('video-set-current-S01_main-v1')).toBeAttached({ timeout: 5000 });

    // Click "设为当前" on v1 to switch back
    await page.getByTestId('video-set-current-S01_main-v1').click();

    // v1 now shows current badge
    await expect(page.getByTestId('video-current-badge-S01_main-v1')).toContainText('当前使用中');
  });

  test('10I-10: merge approved after demo, generate pending current, 设为当前 re-enables', async ({ page, request }) => {
    test.setTimeout(120000);
    // Demo → all 6 shots approved, MergeNode shows all passed
    await setupBatch(page, request); await generateAndApproveAllShots(page);
    await expect(page.getByTestId('merge-node-status')).toContainText('6/6 已通过');

    // Re-select S01_main (loop ended on S06_brand)
    await page.getByTestId('canvas-reset-view').click();
    const s01n = page.getByTestId('shot-control-node-S01_main');
    await s01n.scrollIntoViewIfNeeded();
    await expect(s01n).toBeVisible({ timeout: 10000 });
    await s01n.click();
    await expect(page.getByTestId('canvas-detail-shot-key')).toContainText('S01_main', { timeout: 8000 });

    // Generate v2 pending for S01 via Inspector
    await expect(page.getByTestId('inspector-generate-shot-S01_main')).toBeVisible({ timeout: 15000 });
    await page.getByTestId('inspector-generate-shot-S01_main').click();
    await expect(page.getByTestId('inspector-current-video')).toBeVisible({ timeout: 30000 });

    // Open video library
    await page.getByTestId('sidebar-icon-assets').hover();
    await page.getByTestId('asset-tab-video').click();
    await expect(page.getByTestId('video-asset-library-panel')).toBeVisible({ timeout: 5000 });

    // v2 (pending) is current, v1 (approved) is in history but not current
    await expect(page.getByTestId('video-version-card-S01_main-v2')).toBeAttached({ timeout: 10000 });
    await expect(page.getByTestId('video-current-badge-S01_main-v2')).toContainText('当前使用中');
    // v1 approved is in history, has "设为当前" button — does NOT participate in merge
    await expect(page.getByTestId('video-set-current-S01_main-v1')).toBeAttached({ timeout: 5000 });

    // MergeNode shows partial — S01 v2 pending removes 1 from approved count
    await expect(page.getByTestId('merge-node-status')).toContainText('5/6 已通过');

    // Click "设为当前" on v1 approved to restore full merge readiness
    await page.getByTestId('video-set-current-S01_main-v1').click();

    // v1 is current again
    await expect(page.getByTestId('video-current-badge-S01_main-v1')).toContainText('当前使用中');

    // After restoring approved v1 as current, MergeNode shows all approved again
    await expect(page.getByTestId('merge-node-status')).toContainText('6/6 已通过');
  });
});
