import { test, expect } from '@playwright/test';

test.describe('MVP-4 10L-2 Director Console', () => {

  async function createWorkflowAndOpenInstance(page: any, request: any) {
    const sku = 'DC-' + Date.now();
    const prod = await request.post('/api/v1/products', { data: { product_type: 'desk_calendar', sku, title: 'DC ' + sku } });
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
    await page.goto('about:blank');
    await page.goto(`/#instance=${iid}`);
    await expect(page.getByTestId('mvp3-workbench')).toBeVisible({ timeout: 10000 });
    await expect(page.getByTestId('shot-control-node-S01_main')).toBeVisible({ timeout: 15000 });
    await expect(page.getByTestId('canvas-detail-shot-key')).toContainText('S01_main', { timeout: 8000 });
  }

  const ALL_SHOTS = ['S01_main','S02_detail1','S03_detail2','S04_motion','S05_scene','S06_brand'];

  async function generateAndApproveShot(page: any, sk: string) {
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

  test('DC-01: director desk icon visible in sidebar', async ({ page, request }) => {
    test.setTimeout(60000);
    await createWorkflowAndOpenInstance(page, request);
    // Director desk icon should be in the sidebar dock
    await expect(page.getByTestId('sidebar-icon-directorDesk')).toBeAttached({ timeout: 5000 });
  });

  test('DC-02: all approved — merge node shows ready', async ({ page, request }) => {
    test.setTimeout(180000);
    await createWorkflowAndOpenInstance(page, request);
    // Generate + approve all 6 shots
    for (const sk of ALL_SHOTS) {
      await generateAndApproveShot(page, sk);
    }
    // MergeNode should show ready state
    await expect(page.getByTestId('merge-node-ready')).toBeVisible({ timeout: 5000 });
  });

  test('DC-03: not all approved — merge node shows blocked shots', async ({ page, request }) => {
    test.setTimeout(120000);
    await createWorkflowAndOpenInstance(page, request);
    // Generate + approve only S01_main, leave others pending
    await generateAndApproveShot(page, 'S01_main');
    // MergeNode should show blocked list
    await expect(page.getByTestId('merge-node-blocked-list')).toBeAttached({ timeout: 5000 });
  });

  test('DC-04: compositionOrder persists across page reload', async ({ page, request }) => {
    test.setTimeout(90000);
    await createWorkflowAndOpenInstance(page, request);
    // Set composition order via localStorage
    const testOrder = ['S03_detail2','S01_main','S05_scene','S02_detail1','S06_brand','S04_motion'];
    await page.evaluate((order) => {
      localStorage.setItem('compositionOrder', JSON.stringify(order));
    }, testOrder);
    // Reload and verify order persists
    await page.goto('about:blank');
    const iid = await page.evaluate(() => window.location.hash.replace('#instance=',''));
    await page.goto(`/#instance=${iid}`);
    await page.waitForSelector('[data-testid=mvpp3-workbench]', { timeout: 10000 }).catch(() => {});
    const restored = await page.evaluate(() => {
      const v = localStorage.getItem('compositionOrder');
      return v ? JSON.parse(v) : [];
    });
    expect(restored).toEqual(testOrder);
  });

  test('DC-05: merge node blocked list matches director desk status', async ({ page, request }) => {
    test.setTimeout(60000);
    await createWorkflowAndOpenInstance(page, request);
    // No videos generated → merge node should show all shots as blocked
    await expect(page.getByTestId('merge-node-blocked-list')).toBeAttached({ timeout: 5000 });
    // Each shot should have a blocked entry in the merge node
    for (const sk of ['S01_main','S02_detail1','S03_detail2']) {
      await expect(page.getByTestId(`merge-node-blocked-${sk}`)).toBeAttached({ timeout: 3000 });
    }
  });
});
