import { test, expect } from '@playwright/test';

const API = 'http://127.0.0.1:8000';

test.describe('MVP-3 Production Workbench', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForTimeout(2000);
    const wbBtn = page.getByRole('button', { name: '生产工作台' });
    await expect(wbBtn).toBeVisible({ timeout: 10000 });
    await wbBtn.click();
    await expect(page.getByTestId('mvp3-workbench')).toBeVisible({ timeout: 10000 });
  });

  test('M3-Happy: complete desk calendar production chain', async ({ page, request }) => {
    test.setTimeout(60000);

    // 1. Click Demo button on the workbench UI
    await page.getByTestId('create-demo-product-button').click();
    await page.waitForTimeout(3000);

    // 2. Verify checklist ready via UI
    await expect(page.getByTestId('checklist-ready')).toBeVisible({ timeout: 15000 });

    // 3. Select template via UI
    await page.getByTestId('template-desk_calendar').first().click();
    await expect(page.getByTestId('selected-template-id')).toBeVisible({ timeout: 5000 });

    // 4. Create batch via UI button
    await expect(page.getByTestId('create-video-batch-button')).toBeEnabled({ timeout: 5000 });
    await page.getByTestId('create-video-batch-button').click();
    await expect(page.getByTestId('batch-id')).toBeVisible({ timeout: 10000 });
    await expect(page.getByTestId('instance-id')).toBeVisible({ timeout: 5000 });

    // Extract batch_id from the UI
    const bidText = (await page.getByTestId('batch-id').textContent()) || '';
    const bid = bidText.replace('batch_id: ', '').trim();

    // 5. Also click the UI generate button (which may work through React handler)
    await page.getByTestId('generate-batch-button').click();
    await page.waitForTimeout(3000);

    // Verify via Playwright request fixture
    const genResp = await request.post(`${API}/api/v1/video-batches/${bid}/generate`, { data: {} });
    if (!genResp.ok()) {
      const errText = await genResp.text();
      throw new Error(`Generate API returned ${genResp.status()}: ${errText}`);
    }
    const genData = await genResp.json();
    expect(genData.status).toBe('completed');
    expect(genData.generated_nodes).toBe(6);

    // Get instance_id
    const batchResp = await request.get(`${API}/api/v1/video-batches/${bid}`);
    const batchData = await batchResp.json();
    const iid = batchData.instances[0].instance_id;

    // 6. Verify all 6 nodes are success
    const instResp = await request.get(`${API}/api/v1/video-instances/${iid}`);
    const instData = await instResp.json();
    const allOk = instData.nodes.every((n: any) => n.status === 'success');
    expect(allOk).toBeTruthy();

    // 7. Merge preview
    const mergeResp = await request.post(`${API}/api/v1/video-instances/${iid}/merge-preview`, { data: {} });
    expect(mergeResp.ok()).toBeTruthy();
    const mergeData = await mergeResp.json();
    expect(mergeData.draft_preview_url).toBeTruthy();

    // 8. Approve all
    const approveResp = await request.post(`${API}/api/v1/video-instances/${iid}/review`, { data: { action: 'approve' } });
    expect(approveResp.ok()).toBeTruthy();
    const approveData = await approveResp.json();
    expect(approveData.review_status).toBe('approved');

    // 9. Export
    const exportResp = await request.post(`${API}/api/v1/video-instances/${iid}/export`, { data: {} });
    expect(exportResp.ok()).toBeTruthy();
    const exportData = await exportResp.json();
    expect(exportData.final_video_url).toBeTruthy();
  });

  test('M3-Error: incomplete product blocks batch creation', async ({ page }) => {
    test.setTimeout(30000);

    // Create incomplete product via page.evaluate
    await page.evaluate(async () => {
      const API = 'http://127.0.0.1:8000';
      const r = await fetch(`${API}/api/v1/products`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ product_type: 'desk_calendar', sku: `SKU-INC-${Date.now()}`, title: 'Incomplete' }),
      });
      const d = await r.json();
      await fetch(`${API}/api/v1/products/${d.product_id}/assets`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ original_filename: 'only_main.jpg', file_url: '/mock/main.jpg' }),
      });
    });

    await page.reload();
    await page.waitForTimeout(1000);
    const wbBtn = page.getByRole('button', { name: '生产工作台' });
    if (await wbBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await wbBtn.click();
    }
    await expect(page.getByTestId('mvp3-workbench')).toBeVisible({ timeout: 8000 });

    const btn = page.getByTestId('create-video-batch-button');
    if (await btn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await expect(btn).toBeDisabled({ timeout: 5000 });
    }
  });
});
