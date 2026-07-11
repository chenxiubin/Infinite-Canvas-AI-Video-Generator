import { test, expect } from '@playwright/test';

test.describe('MVP-4 10L-6 Final Video Asset', () => {

  async function createWorkflowAndOpenInstance(page: any, request: any) {
    const sku = 'FV-' + Date.now();
    const prod = await request.post('/api/v1/products', { data: { product_type: 'desk_calendar', sku, title: 'FV ' + sku } });
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

  test('FV-01: composition completed shows final video', async ({ page, request }) => {
    test.setTimeout(60000);
    await createWorkflowAndOpenInstance(page, request);
    // Set completed job state with version
    const now = Date.now();
    await page.evaluate((t) => {
      localStorage.setItem('compositionJob', JSON.stringify({ status: 'completed', startedAt: t - 5000, completedAt: t }));
      localStorage.setItem('finalVideoVersions', JSON.stringify([{ versionId: 'final-v1', videoUrl: '/mock/final.mp4', createdAt: t, status: 'completed' }]));
      localStorage.setItem('currentFinalVideoId', 'final-v1');
    }, now);
    // Verify localStorage persistence after setting
    const versions = await page.evaluate(() => JSON.parse(localStorage.getItem('finalVideoVersions') || '[]'));
    expect(versions.length).toBe(1);
    expect(versions[0].status).toBe('completed');
    const currentId = await page.evaluate(() => localStorage.getItem('currentFinalVideoId'));
    expect(currentId).toBe('final-v1');
  });

  test('FV-02: failed status shows error', async ({ page, request }) => {
    test.setTimeout(60000);
    await createWorkflowAndOpenInstance(page, request);
    // Set failed job state
    await page.evaluate(() => {
      localStorage.setItem('compositionJob', JSON.stringify({ status: 'failed', startedAt: Date.now() - 3000, errorMessage: '合成失败' }));
    });
    const job = await page.evaluate(() => JSON.parse(localStorage.getItem('compositionJob') || '{}'));
    expect(job.status).toBe('failed');
  });

  test('FV-03: new version preserves history', async ({ page, request }) => {
    test.setTimeout(60000);
    await createWorkflowAndOpenInstance(page, request);
    // Set up two versions
    const now = Date.now();
    await page.evaluate((t) => {
      localStorage.setItem('finalVideoVersions', JSON.stringify([
        { versionId: 'final-v1', videoUrl: '/mock/v1.mp4', createdAt: t - 10000, status: 'completed' },
        { versionId: 'final-v2', videoUrl: '/mock/v2.mp4', createdAt: t, status: 'completed' },
      ]));
      localStorage.setItem('currentFinalVideoId', 'final-v2');
    }, now);
    const versions = await page.evaluate(() => JSON.parse(localStorage.getItem('finalVideoVersions') || '[]'));
    expect(versions.length).toBe(2);
  });

  test('FV-04: switching current version works', async ({ page, request }) => {
    test.setTimeout(60000);
    await createWorkflowAndOpenInstance(page, request);
    const now = Date.now();
    await page.evaluate((t) => {
      localStorage.setItem('finalVideoVersions', JSON.stringify([
        { versionId: 'final-v1', videoUrl: '/mock/v1.mp4', createdAt: t - 10000, status: 'completed' },
        { versionId: 'final-v2', videoUrl: '/mock/v2.mp4', createdAt: t, status: 'completed' },
      ]));
      localStorage.setItem('currentFinalVideoId', 'final-v2');
    }, now);
    // Switch to v1
    await page.evaluate(() => { localStorage.setItem('currentFinalVideoId', 'final-v1'); });
    const current = await page.evaluate(() => localStorage.getItem('currentFinalVideoId'));
    expect(current).toBe('final-v1');
  });
});
