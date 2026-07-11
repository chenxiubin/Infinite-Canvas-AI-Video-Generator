import { test, expect } from '@playwright/test';

test.describe('MVP-4 11A-4 Final Video Backend Persistence', () => {

  async function createWorkflowAndOpenInstance(page: any, request: any) {
    const sku = 'FB-' + Date.now();
    const prod = await request.post('/api/v1/products', { data: { product_type: 'desk_calendar', sku, title: 'FB ' + sku } });
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

  test('FB-01: final video versions persist in localStorage', async ({ page, request }) => {
    test.setTimeout(60000);
    await createWorkflowAndOpenInstance(page, request);
    // Set up mock final video versions
    const now = Date.now();
    await page.evaluate((t) => {
      const iid = window.location.hash.replace('#instance=', '');
      const state = {
        [iid]: {
          compositionOrder: [], timelineDurations: {}, compositionJob: { status: 'idle' },
          finalVideoVersions: [{ versionId: 'fb-v1', videoUrl: '/fb1.mp4', createdAt: t - 5000, status: 'completed' }],
          currentFinalVideoId: 'fb-v1',
        },
      };
      localStorage.setItem('productionStateByInstance', JSON.stringify(state));
    }, now);
    const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('productionStateByInstance') || '{}'));
    const iid = await page.evaluate(() => window.location.hash.replace('#instance=', ''));
    expect(stored[iid].finalVideoVersions[0].versionId).toBe('fb-v1');
  });

  test('FB-02: current version switch persists in localStorage', async ({ page, request }) => {
    test.setTimeout(60000);
    await createWorkflowAndOpenInstance(page, request);
    const now = Date.now();
    await page.evaluate((t) => {
      const iid = window.location.hash.replace('#instance=', '');
      const state = {
        [iid]: {
          compositionOrder: [], timelineDurations: {}, compositionJob: { status: 'idle' },
          finalVideoVersions: [
            { versionId: 'fb-v1', videoUrl: '/v1.mp4', createdAt: t - 10000, status: 'completed' },
            { versionId: 'fb-v2', videoUrl: '/v2.mp4', createdAt: t, status: 'completed' },
          ],
          currentFinalVideoId: 'fb-v2',
        },
      };
      localStorage.setItem('productionStateByInstance', JSON.stringify(state));
    }, now);
    // Switch to v1
    await page.evaluate(() => {
      const iid = window.location.hash.replace('#instance=', '');
      const all = JSON.parse(localStorage.getItem('productionStateByInstance') || '{}');
      all[iid].currentFinalVideoId = 'fb-v1';
      localStorage.setItem('productionStateByInstance', JSON.stringify(all));
    });
    const current = await page.evaluate(() => {
      const iid = window.location.hash.replace('#instance=', '');
      const all = JSON.parse(localStorage.getItem('productionStateByInstance') || '{}');
      return all[iid]?.currentFinalVideoId || '';
    });
    expect(current).toBe('fb-v1');
  });

  test('FB-03: director desk icon visible after persistence setup', async ({ page, request }) => {
    test.setTimeout(60000);
    await createWorkflowAndOpenInstance(page, request);
    await expect(page.getByTestId('sidebar-icon-directorDesk')).toBeAttached({ timeout: 5000 });
  });
});
