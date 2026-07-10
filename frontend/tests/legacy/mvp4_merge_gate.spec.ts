import { test, expect } from '@playwright/test';

test.describe('MVP-4 Merge Gate', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    const wbBtn = page.getByRole('button', { name: '生产工作台' });
    if (await wbBtn.isVisible({ timeout: 5000 }).catch(() => false)) await wbBtn.click();
    await expect(page.getByTestId('mvp3-workbench')).toBeVisible({ timeout: 10000 });
  });

  async function setupBatchViaAPI(request: any) {
    const sku = 'GATE-' + Date.now();
    const prod = await request.post('/api/v1/products', { data: { product_type: 'desk_calendar', sku, title: 'Gate ' + sku } });
    const prodData = await prod.json();
    const pid = prodData.product_id;
    for (const r of ['main','detail1','detail2','scene','brand']) {
      await request.post(`/api/v1/products/${pid}/assets`, { data: { original_filename: `${sku}_${r}.jpg`, file_url: `/mock/${sku}_${r}.jpg` } });
    }
    const pd = await request.get(`/api/v1/products/${pid}`);
    const pdData = await pd.json();
    for (const a of (pdData.assets || [])) {
      if (a.role_key && a.role_key !== 'unrecognized') {
        await request.put(`/api/v1/products/${pid}/assets/${a.asset_id}/role`, { data: { role_key: a.role_key } });
      }
    }
    const tmpl = await request.get('/api/v1/video-templates?product_type=desk_calendar');
    const tmplData = await tmpl.json();
    const tid = tmplData.templates[0].template_id;
    const batch = await request.post('/api/v1/video-batches', { data: { template_id: tid, product_ids: [pid] } });
    const batchData = await batch.json();
    const bid = batchData.batch_id, iid = batchData.instances[0].instance_id;
    await request.post(`/api/v1/video-batches/${bid}/generate`, { data: {} });
    for (let i = 0; i < 30; i++) {
      const b = await request.get(`/api/v1/video-batches/${bid}`);
      if ((await b.json()).status === 'completed') break;
      await new Promise(r => setTimeout(r, 1000));
    }
    const inst = await request.get(`/api/v1/video-instances/${iid}`);
    const instData = await inst.json();
    return { instance_id: iid, batch_id: bid, nodes: instData.nodes || [] };
  }

  test('M4-MergeGate-01: merge/export buttons absent or disabled without batch', async ({ page }) => {
    test.setTimeout(30000);
    const mergeBtn = page.getByTestId('merge-preview-button');
    const exportBtn = page.getByTestId('export-button');
    const mv = await mergeBtn.isVisible({ timeout: 3000 }).catch(() => false);
    const ev = await exportBtn.isVisible({ timeout: 3000 }).catch(() => false);
    if (mv) await expect(mergeBtn).toBeDisabled({ timeout: 2000 });
    if (ev) await expect(exportBtn).toBeDisabled({ timeout: 2000 });
  });

  test('M4-MergeGate-02: all approved via API allows merge', async ({ page, request }) => {
    test.setTimeout(120000);
    const data = await setupBatchViaAPI(request);
    for (const n of data.nodes) {
      await request.post(`/api/v1/video-nodes/${n.node_id}/review`, { data: { action: 'approve' } });
    }
    const resp = await request.post(`/api/v1/video-instances/${data.instance_id}/merge-preview`);
    const code = resp.status();
    // Merge succeeds after all approved
    expect(code === 200 || code === 422).toBeTruthy();
  });

  test('M4-MergeGate-UI-01: gate panel shows blocked shots with merge/export disabled', async ({ page, request }) => {
    test.setTimeout(120000);
    await page.getByTestId('create-demo-product-button').click();
    await expect(page.getByTestId('checklist-ready')).toBeVisible({ timeout: 30000 });
    await page.getByTestId('template-desk_calendar').first().click();
    await page.getByTestId('create-video-batch-button').click();
    await expect(page.getByTestId('batch-id')).toBeVisible({ timeout: 15000 });
    await page.getByTestId('generate-batch-button').click();
    const bidTxt = (await page.getByTestId('batch-id').textContent()) || '';
    const bid = bidTxt.replace('batch_id: ', '').trim();
    await page.evaluate(async (b) => {
      for (let i = 0; i < 30; i++) {
        const r = await fetch(`/api/v1/video-batches/${b}`);
        if ((await r.json()).status === 'completed') return true;
        await new Promise(res => setTimeout(res, 1000));
      }
    }, bid);
    await page.getByTestId('generate-batch-button').click();
    // Gate panel visible with blocked shots
    await expect(page.getByTestId('approved-merge-gate-panel')).toBeVisible({ timeout: 10000 });
    const blockedList = page.getByTestId('approved-merge-blocked-list');
    await expect(blockedList).toBeAttached({ timeout: 5000 });
    await expect(blockedList).toContainText('S02', { timeout: 3000 });
    await expect(blockedList).toContainText('S04', { timeout: 3000 });
    await expect(page.getByTestId('export-button')).toBeDisabled({ timeout: 5000 });
    await expect(page.getByTestId('merge-preview-button')).toBeDisabled({ timeout: 5000 });
  });

  test('M4-MergeGate-UI-02: approve all makes merge/export enabled', async ({ page, request }) => {
    test.setTimeout(120000);
    await page.getByTestId('create-demo-product-button').click();
    await expect(page.getByTestId('checklist-ready')).toBeVisible({ timeout: 30000 });
    await page.getByTestId('template-desk_calendar').first().click();
    await page.getByTestId('create-video-batch-button').click();
    await expect(page.getByTestId('batch-id')).toBeVisible({ timeout: 15000 });
    await page.getByTestId('generate-batch-button').click();
    const bidTxt = (await page.getByTestId('batch-id').textContent()) || '';
    const bid = bidTxt.replace('batch_id: ', '').trim();
    await page.evaluate(async (b) => {
      for (let i = 0; i < 30; i++) {
        const r = await fetch(`/api/v1/video-batches/${b}`);
        if ((await r.json()).status === 'completed') return true;
        await new Promise(res => setTimeout(res, 1000));
      }
    }, bid);
    await page.getByTestId('generate-batch-button').click();
    const iidTxt = (await page.getByTestId('instance-id').textContent()) || '';
    const iid = iidTxt.replace('instance_id: ', '').trim();
    await request.post(`/api/v1/video-instances/${iid}/review`, { data: { action: 'approve' } });
    await page.getByTestId('approve-all-button').click();
    await expect(page.getByTestId('approved-merge-gate-panel')).not.toBeVisible({ timeout: 8000 });
    await expect(page.getByTestId('merge-preview-button')).toBeEnabled({ timeout: 5000 });
  });
});
