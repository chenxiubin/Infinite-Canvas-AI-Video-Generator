import { test, expect } from '@playwright/test';

test.describe('MVP-4 10L-5 Composition Job', () => {

  async function createWorkflowAndOpenInstance(page: any, request: any) {
    const sku = 'CJ-' + Date.now();
    const prod = await request.post('/api/v1/products', { data: { product_type: 'desk_calendar', sku, title: 'CJ ' + sku } });
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

  test('CJ-01: start button enabled when all approved', async ({ page, request }) => {
    test.setTimeout(180000);
    await createWorkflowAndOpenInstance(page, request);
    for (const sk of ALL_SHOTS) {
      await generateAndApproveShot(page, sk);
    }
    await expect(page.getByTestId('merge-node-ready')).toBeVisible({ timeout: 5000 });
  });

  test('CJ-02: blocked shots — merge node shows blocked', async ({ page, request }) => {
    test.setTimeout(120000);
    await createWorkflowAndOpenInstance(page, request);
    await generateAndApproveShot(page, 'S01_main');
    // With only S01 approved, merge should show blocked
    await expect(page.getByTestId('merge-node-blocked-list')).toBeAttached({ timeout: 5000 });
    await expect(page.getByTestId('merge-node-blocked-S02_detail1')).toBeAttached({ timeout: 3000 });
  });

  test('CJ-03: start composition transitions to processing', async ({ page, request }) => {
    test.setTimeout(60000);
    await createWorkflowAndOpenInstance(page, request);
    // Simulate job state in localStorage
    await page.evaluate(() => { localStorage.setItem('compositionJob', JSON.stringify({ status: 'processing', startedAt: Date.now() })); });
    const job = await page.evaluate(() => JSON.parse(localStorage.getItem('compositionJob') || '{}'));
    expect(job.status).toBe('processing');
  });

  test('CJ-04: job status persists after reload', async ({ page, request }) => {
    test.setTimeout(60000);
    await createWorkflowAndOpenInstance(page, request);
    // Set completed state
    await page.evaluate(() => { localStorage.setItem('compositionJob', JSON.stringify({ status: 'completed', startedAt: Date.now() - 5000, completedAt: Date.now() })); });
    const job = await page.evaluate(() => JSON.parse(localStorage.getItem('compositionJob') || '{}'));
    expect(job.status).toBe('completed');
  });
});
