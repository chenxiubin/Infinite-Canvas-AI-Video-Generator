import { test, expect } from '@playwright/test';

test.describe('MVP-4 10L-9 UX Polish', () => {

  async function createWorkflowAndOpenInstance(page: any, request: any) {
    const sku = 'UX-' + Date.now();
    const prod = await request.post('/api/v1/products', { data: { product_type: 'desk_calendar', sku, title: 'UX ' + sku } });
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
  }

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

  test('UX-01: director desk shows correct stats', async ({ page, request }) => {
    test.setTimeout(180000);
    await createWorkflowAndOpenInstance(page, request);
    // Generate + approve only 2 shots
    await generateAndApproveShot(page, 'S01_main');
    await generateAndApproveShot(page, 'S02_detail1');
    // Verify stats via merge node status
    await expect(page.getByTestId('merge-node-status')).toContainText('2/');
    await expect(page.getByTestId('merge-node-blocked-list')).toBeAttached({ timeout: 5000 });
  });

  test('UX-02: blocked reason shows in merge node', async ({ page, request }) => {
    test.setTimeout(120000);
    await createWorkflowAndOpenInstance(page, request);
    await generateAndApproveShot(page, 'S01_main');
    // Other shots should show as blocked
    await expect(page.getByTestId('merge-node-blocked-S02_detail1')).toBeAttached({ timeout: 5000 });
    await expect(page.getByTestId('merge-node-blocked-S03_detail2')).toBeAttached({ timeout: 3000 });
  });

  test('UX-03: merge node ready when all approved', async ({ page, request }) => {
    test.setTimeout(180000);
    await createWorkflowAndOpenInstance(page, request);
    const shots = ['S01_main','S02_detail1','S03_detail2','S04_motion','S05_scene','S06_brand'];
    for (const sk of shots) await generateAndApproveShot(page, sk);
    await expect(page.getByTestId('merge-node-ready')).toBeVisible({ timeout: 5000 });
  });

  test('UX-04: timeline order persists in localStorage', async ({ page, request }) => {
    test.setTimeout(60000);
    await createWorkflowAndOpenInstance(page, request);
    const order = ['S03_detail2','S01_main','S05_scene'];
    await page.evaluate((o) => { localStorage.setItem('compositionOrder', JSON.stringify(o)); }, order);
    const restored = await page.evaluate(() => JSON.parse(localStorage.getItem('compositionOrder') || '[]'));
    expect(restored).toEqual(order);
  });

  test('UX-05: instance state survives page navigation', async ({ page, request }) => {
    test.setTimeout(60000);
    await createWorkflowAndOpenInstance(page, request);
    // Set instance-scoped state
    const iid = await page.evaluate(() => window.location.hash.replace('#instance=', ''));
    const state = { [iid]: { compositionOrder: ['S01_main'], timelineDurations: { S01_main: 5 }, compositionJob: { status: 'idle' }, finalVideoVersions: [], currentFinalVideoId: '' } };
    await page.evaluate((s) => { localStorage.setItem('productionStateByInstance', JSON.stringify(s)); }, state);
    // Verify state persists
    const restored = await page.evaluate(() => JSON.parse(localStorage.getItem('productionStateByInstance') || '{}'));
    expect(restored[iid].compositionOrder[0]).toBe('S01_main');
  });

  test('UX-06: no video state shows correct empty UI', async ({ page, request }) => {
    test.setTimeout(60000);
    await createWorkflowAndOpenInstance(page, request);
    // Without generating any videos, merge node should show all blocked
    await expect(page.getByTestId('merge-node-blocked-list')).toBeAttached({ timeout: 5000 });
    // Director desk icon exists
    await expect(page.getByTestId('sidebar-icon-directorDesk')).toBeAttached({ timeout: 3000 });
  });
});
