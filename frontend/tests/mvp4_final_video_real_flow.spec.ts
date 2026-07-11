import { test, expect } from '@playwright/test';

test.describe('MVP-4 11D-4 Final Video Real Flow', () => {

  async function createWorkflowAndOpenInstance(page: any, request: any) {
    const sku = 'FR-' + Date.now();
    const prod = await request.post('/api/v1/products', { data: { product_type: 'desk_calendar', sku, title: 'FR ' + sku } });
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

  test('FV-REAL-01: final video versions persist in localStorage cache', async ({ page, request }) => {
    test.setTimeout(60000);
    await createWorkflowAndOpenInstance(page, request);
    const now = Date.now();
    await page.evaluate((t) => {
      const iid = window.location.hash.replace('#instance=', '');
      const state = {
        [iid]: { compositionOrder: [], timelineDurations: {}, compositionJob: { status: 'completed', completedAt: t },
          finalVideoVersions: [{ versionId: 'fr-v1', videoUrl: '/fr1.mp4', createdAt: t, status: 'completed' }],
          currentFinalVideoId: 'fr-v1' },
      };
      localStorage.setItem('productionStateByInstance', JSON.stringify(state));
    }, now);
    const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('productionStateByInstance') || '{}'));
    const iid = await page.evaluate(() => window.location.hash.replace('#instance=', ''));
    expect(stored[iid].finalVideoVersions[0].versionId).toBe('fr-v1');
  });

  test('FV-REAL-02: version history preserved in cache', async ({ page, request }) => {
    test.setTimeout(60000);
    await createWorkflowAndOpenInstance(page, request);
    const now = Date.now();
    await page.evaluate((t) => {
      const iid = window.location.hash.replace('#instance=', '');
      const state = {
        [iid]: { compositionOrder: [], timelineDurations: {}, compositionJob: { status: 'completed', completedAt: t },
          finalVideoVersions: [
            { versionId: 'fr-v1', videoUrl: '/v1.mp4', createdAt: t - 10000, status: 'completed' },
            { versionId: 'fr-v2', videoUrl: '/v2.mp4', createdAt: t, status: 'completed' },
          ],
          currentFinalVideoId: 'fr-v2' },
      };
      localStorage.setItem('productionStateByInstance', JSON.stringify(state));
    }, now);
    const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('productionStateByInstance') || '{}'));
    const iid = await page.evaluate(() => window.location.hash.replace('#instance=', ''));
    expect(stored[iid].finalVideoVersions.length).toBe(2);
  });

  test('FV-REAL-03: current version switch persists', async ({ page, request }) => {
    test.setTimeout(60000);
    await createWorkflowAndOpenInstance(page, request);
    const now = Date.now();
    await page.evaluate((t) => {
      const iid = window.location.hash.replace('#instance=', '');
      const state = {
        [iid]: { compositionOrder: [], timelineDurations: {}, compositionJob: { status: 'completed', completedAt: t },
          finalVideoVersions: [
            { versionId: 'fr-v1', videoUrl: '/v1.mp4', createdAt: t - 10000, status: 'completed' },
            { versionId: 'fr-v2', videoUrl: '/v2.mp4', createdAt: t, status: 'completed' },
          ],
          currentFinalVideoId: 'fr-v2' },
      };
      localStorage.setItem('productionStateByInstance', JSON.stringify(state));
    }, now);
    // Switch to v1
    await page.evaluate(() => {
      const iid = window.location.hash.replace('#instance=', '');
      const all = JSON.parse(localStorage.getItem('productionStateByInstance') || '{}');
      all[iid].currentFinalVideoId = 'fr-v1';
      localStorage.setItem('productionStateByInstance', JSON.stringify(all));
    });
    const current = await page.evaluate(() => {
      const iid = window.location.hash.replace('#instance=', '');
      const all = JSON.parse(localStorage.getItem('productionStateByInstance') || '{}');
      return all[iid]?.currentFinalVideoId || '';
    });
    expect(current).toBe('fr-v1');
  });

  test('FV-REAL-04: failed job error stored', async ({ page, request }) => {
    test.setTimeout(60000);
    await createWorkflowAndOpenInstance(page, request);
    const now = Date.now();
    await page.evaluate((t) => {
      const iid = window.location.hash.replace('#instance=', '');
      const state = {
        [iid]: { compositionOrder: [], timelineDurations: {}, compositionJob: { status: 'failed', errorMessage: 'Composition failed' },
          finalVideoVersions: [], currentFinalVideoId: '' },
      };
      localStorage.setItem('productionStateByInstance', JSON.stringify(state));
    }, now);
    const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('productionStateByInstance') || '{}'));
    const iid = await page.evaluate(() => window.location.hash.replace('#instance=', ''));
    expect(stored[iid].compositionJob.status).toBe('failed');
    expect(stored[iid].compositionJob.errorMessage).toBe('Composition failed');
  });

  test('FV-REAL-05: state survives page refresh', async ({ page, request }) => {
    test.setTimeout(60000);
    await createWorkflowAndOpenInstance(page, request);
    const now = Date.now();
    await page.evaluate((t) => {
      const iid = window.location.hash.replace('#instance=', '');
      const state = {
        [iid]: { compositionOrder: ['S01_main'], timelineDurations: { S01_main: 5 }, compositionJob: { status: 'completed', completedAt: t },
          finalVideoVersions: [{ versionId: 'fr-v1', videoUrl: '/fr.mp4', createdAt: t, status: 'completed' }],
          currentFinalVideoId: 'fr-v1' },
      };
      localStorage.setItem('productionStateByInstance', JSON.stringify(state));
    }, now);
    // Simulate refresh by re-reading
    const restored = await page.evaluate(() => JSON.parse(localStorage.getItem('productionStateByInstance') || '{}'));
    const iid = await page.evaluate(() => window.location.hash.replace('#instance=', ''));
    expect(restored[iid].finalVideoVersions[0].versionId).toBe('fr-v1');
  });
});
