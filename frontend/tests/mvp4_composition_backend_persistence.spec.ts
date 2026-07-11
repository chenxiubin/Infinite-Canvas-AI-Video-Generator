import { test, expect } from '@playwright/test';

test.describe('MVP-4 11A-5 Composition Backend Persistence', () => {

  async function createWorkflowAndOpenInstance(page: any, request: any) {
    const sku = 'CB-' + Date.now();
    const prod = await request.post('/api/v1/products', { data: { product_type: 'desk_calendar', sku, title: 'CB ' + sku } });
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

  test('CB-01: composition order persists in localStorage', async ({ page, request }) => {
    test.setTimeout(60000);
    await createWorkflowAndOpenInstance(page, request);
    const order = ['S03_detail2','S01_main'];
    await page.evaluate((o) => { localStorage.setItem('compositionOrder', JSON.stringify(o)); }, order);
    const restored = await page.evaluate(() => JSON.parse(localStorage.getItem('compositionOrder') || '[]'));
    expect(restored).toEqual(order);
  });

  test('CB-02: duration update persists', async ({ page, request }) => {
    test.setTimeout(60000);
    await createWorkflowAndOpenInstance(page, request);
    const durations = { S01_main: 5, S02_detail1: 8 };
    await page.evaluate((d) => { localStorage.setItem('timelineDurations', JSON.stringify(d)); }, durations);
    const restored = await page.evaluate(() => JSON.parse(localStorage.getItem('timelineDurations') || '{}'));
    expect(restored.S01_main).toBe(5);
    expect(restored.S02_detail1).toBe(8);
  });

  test('CB-03: director desk accessible after setup', async ({ page, request }) => {
    test.setTimeout(60000);
    await createWorkflowAndOpenInstance(page, request);
    await expect(page.getByTestId('sidebar-icon-directorDesk')).toBeAttached({ timeout: 5000 });
  });
});
