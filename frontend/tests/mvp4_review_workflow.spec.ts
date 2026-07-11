import { test, expect } from '@playwright/test';

test.describe('MVP-4 Review Workflow', () => {

  // Create product + batch WITHOUT generating videos.
  async function setupWorkflow(page: any, request: any) {
    const sku = 'RW-' + Date.now();
    const prod = await request.post('/api/v1/products', { data: { product_type: 'desk_calendar', sku, title: 'RW ' + sku } });
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
    // Navigate with instance hash — ProductionWorkbench auto-loads the instance
    await page.goto(`/#instance=${iid}`);
    await expect(page.getByTestId('mvp3-workbench')).toBeVisible({ timeout: 10000 });
    // Wait for instance to load by checking canvas nodes appear
    await expect(page.getByTestId('shot-control-node-S01_main')).toBeVisible({ timeout: 15000 });
  }

  test('M4-Review-01: empty state → generate → pending', async ({ page, request }) => {
    test.setTimeout(60000);
    await setupWorkflow(page, request);
    await expect(page.getByTestId('canvas-detail-shot-key')).toContainText('S01_main', { timeout: 8000 });

    // Wait for real node (not skeleton) — generate button appears after instance loads
    await expect(page.getByTestId('inspector-generate-shot-S01_main')).toBeVisible({ timeout: 15000 });
    await expect(page.getByTestId('inspector-current-video')).not.toBeAttached({ timeout: 3000 });

    // Generate a pending video via Inspector
    await page.getByTestId('inspector-generate-shot-S01_main').click();
    await expect(page.getByTestId('inspector-current-video')).toBeVisible({ timeout: 30000 });
    // Pending state: approve + reject buttons visible
    await expect(page.getByTestId('inspector-approve-video-S01_main')).toBeVisible({ timeout: 5000 });
    await expect(page.getByTestId('inspector-reject-video-S01_main')).toBeVisible({ timeout: 5000 });
  });

  test('M4-Review-02: approve via Inspector', async ({ page, request }) => {
    test.setTimeout(90000);
    await setupWorkflow(page, request);
    await expect(page.getByTestId('canvas-detail-shot-key')).toContainText('S01_main', { timeout: 8000 });
    await expect(page.getByTestId('inspector-generate-shot-S01_main')).toBeVisible({ timeout: 5000 });
    await page.getByTestId('inspector-generate-shot-S01_main').click();
    await expect(page.getByTestId('inspector-current-video')).toBeVisible({ timeout: 30000 });

    await expect(page.getByTestId('inspector-approve-video-S01_main')).toBeVisible({ timeout: 10000 });
    await page.getByTestId('inspector-approve-video-S01_main').click();
    await expect(page.getByTestId('inspector-current-video')).toContainText('已通过', { timeout: 5000 });
  });

  test('M4-Review-03: reject without reason shows error', async ({ page, request }) => {
    test.setTimeout(90000);
    await setupWorkflow(page, request);
    await expect(page.getByTestId('canvas-detail-shot-key')).toContainText('S01_main', { timeout: 8000 });
    await expect(page.getByTestId('inspector-generate-shot-S01_main')).toBeVisible({ timeout: 5000 });
    await page.getByTestId('inspector-generate-shot-S01_main').click();
    await expect(page.getByTestId('inspector-current-video')).toBeVisible({ timeout: 30000 });

    await expect(page.getByTestId('inspector-reject-video-S01_main')).toBeVisible({ timeout: 5000 });
    await page.getByTestId('inspector-reject-video-S01_main').click();
    await expect(page.getByTestId('canvas-detail-error-message')).toBeVisible({ timeout: 3000 });
    // Pending state still active (reject was blocked)
    await expect(page.getByTestId('inspector-approve-video-S01_main')).toBeVisible({ timeout: 3000 });
  });

  test('M4-Review-04: fill reason then reject', async ({ page, request }) => {
    test.setTimeout(90000);
    await setupWorkflow(page, request);
    await expect(page.getByTestId('canvas-detail-shot-key')).toContainText('S01_main', { timeout: 8000 });
    await expect(page.getByTestId('inspector-generate-shot-S01_main')).toBeVisible({ timeout: 5000 });
    await page.getByTestId('inspector-generate-shot-S01_main').click();
    await expect(page.getByTestId('inspector-current-video')).toBeVisible({ timeout: 30000 });

    await expect(page.getByTestId('inspector-reject-reason-S01_main')).toBeVisible({ timeout: 3000 });
    await page.getByTestId('inspector-reject-reason-S01_main').fill('测试驳回原因');
    await page.getByTestId('inspector-reject-video-S01_main').click();
    await expect(page.getByTestId('inspector-current-video')).toContainText('已驳回', { timeout: 5000 });
  });

  test('M4-Review-05: regenerate after rejection creates v2 pending', async ({ page, request }) => {
    test.setTimeout(90000);
    await setupWorkflow(page, request);
    await expect(page.getByTestId('inspector-generate-shot-S01_main')).toBeVisible({ timeout: 5000 });
    await page.getByTestId('inspector-generate-shot-S01_main').click();
    await expect(page.getByTestId('inspector-current-video')).toBeVisible({ timeout: 30000 });

    // Reject v1
    await expect(page.getByTestId('inspector-reject-reason-S01_main')).toBeVisible({ timeout: 3000 });
    await page.getByTestId('inspector-reject-reason-S01_main').fill('需重新生成');
    await page.getByTestId('inspector-reject-video-S01_main').click();
    await expect(page.getByTestId('inspector-current-video')).toContainText('已驳回', { timeout: 5000 });

    // Regenerate → creates v2 pending via handleGenerateSingleShot
    await expect(page.getByTestId('inspector-regenerate-video-S01_main')).toBeVisible({ timeout: 5000 });
    await page.getByTestId('inspector-regenerate-video-S01_main').click();
    await expect(page.getByTestId('inspector-current-video')).toBeVisible({ timeout: 30000 });
    await expect(page.getByTestId('inspector-approve-video-S01_main')).toBeVisible({ timeout: 10000 });
  });

  // Note: Regenerate failure test (M4-Review-06) removed because Vite proxy prevents
  // Playwright route interception of backend API calls. The regenerate success path
  // is covered by M4-Review-05. Failure handling should be tested via backend-level
  // integration tests or by mocking at the fetch level.
});
