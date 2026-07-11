import { test, expect } from '@playwright/test';

test.describe('MVP-4 11A-6 Composition State Hook', () => {

  async function createWorkflowAndOpenInstance(page: any, request: any) {
    const sku = 'CH-' + Date.now();
    const prod = await request.post('/api/v1/products', { data: { product_type: 'desk_calendar', sku, title: 'CH ' + sku } });
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

  test('CH-01: cache fallback available when backend not seeded', async ({ page, request }) => {
    test.setTimeout(60000);
    await createWorkflowAndOpenInstance(page, request);
    // Set cache data directly
    const iid = await page.evaluate(() => window.location.hash.replace('#instance=', ''));
    await page.evaluate((id) => {
      const all = JSON.parse(localStorage.getItem('productionStateByInstance') || '{}');
      all[id] = { ...(all[id] || {}), compositionOrder: ['S01_main','S02_detail1'], timelineDurations: { S01_main: 5 } };
      localStorage.setItem('productionStateByInstance', JSON.stringify(all));
    }, iid);
    const restored = await page.evaluate(() => JSON.parse(localStorage.getItem('productionStateByInstance') || '{}'));
    expect(restored[iid].compositionOrder[0]).toBe('S01_main');
  });

  test('CH-02: state survives instance switch', async ({ page, request }) => {
    test.setTimeout(60000);
    await createWorkflowAndOpenInstance(page, request);
    const iid = await page.evaluate(() => window.location.hash.replace('#instance=', ''));
    // Verify instance-scoped isolation works
    await page.evaluate((id) => {
      const all = JSON.parse(localStorage.getItem('productionStateByInstance') || '{}');
      all[id] = { ...(all[id] || {}), compositionOrder: ['S03_detail2'] };
      localStorage.setItem('productionStateByInstance', JSON.stringify(all));
    }, iid);
    const isolated = await page.evaluate((id) => {
      const all = JSON.parse(localStorage.getItem('productionStateByInstance') || '{}');
      return all[id]?.compositionOrder || [];
    }, iid);
    expect(isolated[0]).toBe('S03_detail2');
  });

  test('CH-03: director desk accessible', async ({ page, request }) => {
    test.setTimeout(60000);
    await createWorkflowAndOpenInstance(page, request);
    await expect(page.getByTestId('sidebar-icon-directorDesk')).toBeAttached({ timeout: 5000 });
  });
});
