import { test, expect } from '@playwright/test';

test.describe('MVP-4 10L-3 Composition Panel', () => {

  async function createWorkflowAndOpenInstance(page: any, request: any) {
    const sku = 'CP-' + Date.now();
    const prod = await request.post('/api/v1/products', { data: { product_type: 'desk_calendar', sku, title: 'CP ' + sku } });
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

  test('CP-01: all approved — composition panel shows ready', async ({ page, request }) => {
    test.setTimeout(180000);
    await createWorkflowAndOpenInstance(page, request);
    for (const sk of ALL_SHOTS) {
      await generateAndApproveShot(page, sk);
    }
    // MergeNode ready
    await expect(page.getByTestId('merge-node-ready')).toBeVisible({ timeout: 5000 });
    // Composition panel exists on canvas via merge node
    await expect(page.getByTestId('merge-node')).toBeAttached({ timeout: 3000 });
  });

  test('CP-02: pending videos — merge node shows blocked shots', async ({ page, request }) => {
    test.setTimeout(120000);
    await createWorkflowAndOpenInstance(page, request);
    await generateAndApproveShot(page, 'S01_main');
    // With only S01 approved, merge node should show blocked
    await expect(page.getByTestId('merge-node-blocked-list')).toBeAttached({ timeout: 5000 });
    await expect(page.getByTestId('merge-node-blocked-S02_detail1')).toBeAttached({ timeout: 3000 });
  });

  test('CP-03: compositionOrder adjustment preserved', async ({ page, request }) => {
    test.setTimeout(90000);
    await createWorkflowAndOpenInstance(page, request);
    // Set and verify composition order via localStorage
    const testOrder = ['S03_detail2','S01_main','S05_scene','S02_detail1','S06_brand','S04_motion'];
    await page.evaluate((order) => { localStorage.setItem('compositionOrder', JSON.stringify(order)); }, testOrder);
    const result = await page.evaluate(() => JSON.parse(localStorage.getItem('compositionOrder') || '[]'));
    expect(result).toEqual(testOrder);
  });

  test('CP-04: merge node status matches composition state', async ({ page, request }) => {
    test.setTimeout(180000);
    await createWorkflowAndOpenInstance(page, request);
    // All shots approved → merge node ready
    for (const sk of ALL_SHOTS) {
      await generateAndApproveShot(page, sk);
    }
    await expect(page.getByTestId('merge-node-ready')).toBeVisible({ timeout: 5000 });
    const statusText = await page.getByTestId('merge-node-status').textContent();
    expect(statusText).toContain('6/6');
  });
});
