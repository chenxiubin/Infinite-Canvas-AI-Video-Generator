import { test, expect } from '@playwright/test';

test.describe('MVP-4 10K-2 APIMart Generation Flow', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    const wbBtn = page.getByRole('button', { name: '生产工作台' });
    if (await wbBtn.isVisible({ timeout: 5000 }).catch(() => false)) await wbBtn.click();
    await expect(page.getByTestId('mvp3-workbench')).toBeVisible({ timeout: 10000 });
  });

  async function openSettings(page: any) {
    await page.getByTestId('model-settings-button').click();
    await expect(page.getByTestId('model-settings-panel')).toBeVisible({ timeout: 5000 });
  }
  async function closeSettings(page: any) {
    await page.getByTestId('model-settings-panel-title').locator('..').locator('button').last().click();
  }
  async function setupApimart(page: any) {
    await openSettings(page);
    await page.getByTestId('model-provider-apimart').click();
    await page.getByTestId('apimart-api-key-input').fill('sk-test-key-123456');
    await page.getByTestId('apimart-save-key').click();
    await closeSettings(page);
  }
  async function focusShotInInspector(page: any, shotKey: string) {
    const shotKeyLabel = page.getByTestId('canvas-detail-shot-key');
    const selectedShot = await shotKeyLabel.textContent().catch(() => '');
    if (!selectedShot?.includes(shotKey)) {
      await page.getByTestId('canvas-reset-view').click();
      const node = page.getByTestId(`shot-control-node-${shotKey}`);
      await node.scrollIntoViewIfNeeded();
      await expect(node).toBeVisible({ timeout: 10000 });
      await node.click();
    }
    await expect(shotKeyLabel).toContainText(shotKey, { timeout: 8000 });
  }

  async function clickInspectorGenerate(page: any, shotKey: string) {
    await focusShotInInspector(page, shotKey);
    await expect(page.getByTestId(`inspector-generate-shot-${shotKey}`)).toBeVisible({ timeout: 10000 });
    await page.getByTestId(`inspector-generate-shot-${shotKey}`).click();
  }

  async function demoThenGenerate(page: any) {
    await page.getByTestId('run-full-demo-button').click();
    await expect(page.getByTestId('production-status-compact')).toBeAttached({ timeout: 30000 });
    await expect(page.getByTestId('merge-node-status')).toContainText('已通过', { timeout: 10000 });
    await clickInspectorGenerate(page, 'S01_main');
  }

  const FULL_MOCK = async (route: any) => {
    const url = route.request().url();
    let body = '{}';
    if (url.includes('/uploads')) body = JSON.stringify({ url: 'https://mock.apimart.ai/img.png', filename: 'ref.png' });
    else if (url.includes('/generations')) body = JSON.stringify({ task_id: 'task_mock_12345' });
    else body = JSON.stringify({ status: 'completed', progress: 100, result: { video_url: 'https://mock.apimart.ai/video.mp4' } });
    await route.fulfill({ status: 200, contentType: 'application/json', body });
  };

  // ── K2-01 ──
  test('K2-01: blocked without key', async ({ page }) => {
    test.setTimeout(60000);
    await openSettings(page); await page.getByTestId('model-provider-apimart').click(); await closeSettings(page);
    await demoThenGenerate(page);
    await expect(page.getByTestId('mvp3-workbench')).toContainText('API Key', { timeout: 8000 });
  });

  // ── K2-02 ──
  test('K2-02: full generation calls APIMart APIs', async ({ page }) => {
    test.setTimeout(60000);
    const calls: string[] = [];
    await page.route('**/api.apimart.ai/**', async (route) => {
      calls.push(route.request().url());
      await FULL_MOCK(route);
    });
    await setupApimart(page);
    await demoThenGenerate(page);
    // At minimum, generation submit must be called
    await expect.poll(() => calls.length, { timeout: 15000 }).toBeGreaterThanOrEqual(2);
    expect(calls.some(c => c.includes('/generations'))).toBe(true);
    // Verify task URL is correct (not /v1/v1/tasks)
    expect(calls.some(c => c.includes('/v1/v1/tasks'))).toBe(false);
  });

  // ── K2-03 ──
  test('K2-03: processing → completed poll', async ({ page }) => {
    test.setTimeout(60000);
    let pollCalls = 0;
    await page.route('**/api.apimart.ai/**', async (route) => {
      const url = route.request().url();
      let body = '{}';
      if (url.includes('/uploads')) body = JSON.stringify({ url: 'https://mock.apimart.ai/img.png' });
      else if (url.includes('/generations')) body = JSON.stringify({ task_id: 'task_poll_test' });
      else {
        pollCalls++;
        body = JSON.stringify({ status: pollCalls >= 2 ? 'completed' : 'processing', progress: pollCalls >= 2 ? 100 : 45, result: pollCalls >= 2 ? { video_url: 'https://mock.apimart.ai/video.mp4' } : undefined });
      }
      await route.fulfill({ status: 200, contentType: 'application/json', body });
    });
    await setupApimart(page);
    await demoThenGenerate(page);
    await expect.poll(() => pollCalls, { timeout: 15000 }).toBeGreaterThanOrEqual(2);
  });

  // ── K2-04 ──
  test('K2-04: task failed does not add video version', async ({ page }) => {
    test.setTimeout(60000);
    await page.route('**/api.apimart.ai/**', async (route) => {
      const url = route.request().url();
      let body = '{}';
      if (url.includes('/uploads')) body = JSON.stringify({ url: 'https://mock.apimart.ai/img.png' });
      else if (url.includes('/generations')) body = JSON.stringify({ task_id: 'task_fail' });
      else body = JSON.stringify({ status: 'failed', progress: 0, error: { message: 'Generation error' } });
      await route.fulfill({ status: 200, contentType: 'application/json', body });
    });
    await setupApimart(page);
    await demoThenGenerate(page);
    // v2 should NOT exist
    await page.getByTestId('sidebar-icon-assets').hover();
    await page.getByTestId('asset-tab-video').click();
    await expect(page.getByTestId('video-version-card-S01_main-v2')).toBeHidden({ timeout: 5000 });
  });

  // ── K2-05 ──
  test('K2-05: two refs use first_frame/last_frame', async ({ page }) => {
    test.setTimeout(60000);
    let genBody: any = null;
    await page.route('**/api.apimart.ai/**', async (route) => {
      const url = route.request().url();
      if (url.includes('/generations')) {
        const postData = route.request().postDataJSON();
        genBody = postData || {};
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ task_id: 'task_two_refs' }) });
      } else if (url.includes('/uploads')) {
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ url: 'https://mock.apimart.ai/img_' + Date.now() + '.png' }) });
      } else {
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ status: 'completed', progress: 100, result: { video_url: 'https://mock.apimart.ai/video.mp4' } }) });
      }
    });
    await setupApimart(page);
    // Use S04_motion which has 2 reference image nodes
    await page.getByTestId('run-full-demo-button').click();
    await expect(page.getByTestId('production-status-compact')).toBeAttached({ timeout: 30000 });
    // Drop images on S04 ref nodes 0 and 1
    const MINI_PNG = [137,80,78,71,13,10,26,10,0,0,0,13,73,72,68,82,0,0,0,1,0,0,0,1,8,2,0,0,0,144,119,83,222,0,0,0,12,73,68,65,84,8,215,99,248,207,192,0,0,3,0,1,171,21,105,195,0,0,0,0,73,69,78,68,174,66,96,130];
    for (const ri of [0, 1]) {
      const refNode = page.getByTestId(`reference-image-node-S04_motion-${ri}`);
      await refNode.scrollIntoViewIfNeeded();
      await expect(refNode).toBeVisible({ timeout: 5000 });
      await refNode.evaluate((el: any, bytes: any) => {
        const file = new File([new Uint8Array(bytes)], `ref${bytes.length}.png`, { type: 'image/png' });
        const dt = new DataTransfer(); dt.items.add(file);
        el.dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true }));
      }, MINI_PNG);
    }
    // Generate S04
    await clickInspectorGenerate(page, 'S04_motion');
    // Verify image_with_roles in request
    await expect.poll(() => genBody, { timeout: 15000 }).not.toBeNull();
    expect(genBody.image_with_roles).toBeDefined();
    expect(genBody.image_with_roles[0].role).toBe('first_frame');
    expect(genBody.image_with_roles[1].role).toBe('last_frame');
  });

  // ── K2-06 ──
  test('K2-06: maxRefs=1 truncates to single image', async ({ page }) => {
    test.setTimeout(60000);
    let genBody: any = null;
    await page.route('**/api.apimart.ai/**', async (route) => {
      const url = route.request().url();
      if (url.includes('/generations')) {
        genBody = route.request().postDataJSON() || {};
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ task_id: 'task_one_ref' }) });
      } else if (url.includes('/uploads')) {
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ url: 'https://mock.apimart.ai/img.png' }) });
      } else {
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ status: 'completed', progress: 100, result: { video_url: 'https://mock.apimart.ai/video.mp4' } }) });
      }
    });
    await setupApimart(page);
    // Select sora-2 (maxReferenceImages=1)
    await openSettings(page);
    await page.getByTestId('model-provider-apimart').click();
    await page.getByTestId('apimart-select-model-sora-2').click();
    await closeSettings(page);
    await demoThenGenerate(page);
    await expect.poll(() => genBody, { timeout: 15000 }).not.toBeNull();
    // Should only have 1 image_url (not image_with_roles)
    expect(genBody.image_urls?.length || 0).toBeLessThanOrEqual(1);
  });

  // ── K2-07 ──
  test('K2-07: mock mode generation not affected', async ({ page }) => {
    test.setTimeout(60000);
    await page.getByTestId('run-full-demo-button').click();
    await expect(page.getByTestId('production-status-compact')).toBeAttached({ timeout: 30000 });
    await expect(page.getByTestId('merge-node-status')).toContainText('已通过', { timeout: 10000 });
    await clickInspectorGenerate(page, 'S01_main');
    await page.getByTestId('sidebar-icon-assets').hover();
    await page.getByTestId('asset-tab-video').click();
    await expect(page.getByTestId('video-version-card-S01_main-v2')).toBeAttached({ timeout: 10000 });
  });

  // ── K2-08 ──
  test('K2-08: no API key leak', async ({ page }) => {
    test.setTimeout(60000);
    await page.route('**/api.apimart.ai/**', FULL_MOCK);
    await setupApimart(page);
    await demoThenGenerate(page);
    const bodyText = await page.locator('body').textContent();
    expect(bodyText).not.toContain('sk-test-key-123456');
  });

  // ── K2-09 ──
  test('K2-09: upload failure does not add video version', async ({ page }) => {
    test.setTimeout(60000);
    await page.route('**/api.apimart.ai/v1/uploads/**', async (route) => {
      await route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ error: 'Upload failed' }) });
    });
    await setupApimart(page);
    await demoThenGenerate(page);
    // v2 should NOT appear after upload failure
    await page.getByTestId('sidebar-icon-assets').hover();
    await page.getByTestId('asset-tab-video').click();
    await expect(page.getByTestId('video-version-card-S01_main-v2')).toBeHidden({ timeout: 5000 });
  });

  // ── K2-10 ──
  test('K2-10: submit failure does not add video version', async ({ page }) => {
    test.setTimeout(60000);
    await page.route('**/api.apimart.ai/v1/uploads/**', async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ url: 'https://mock.apimart.ai/img.png' }) });
    });
    await page.route('**/api.apimart.ai/v1/videos/**', async (route) => {
      await route.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ error: 'Invalid request' }) });
    });
    await setupApimart(page);
    await demoThenGenerate(page);
    // v2 should NOT exist (generation failed)
    await page.getByTestId('sidebar-icon-assets').hover();
    await page.getByTestId('asset-tab-video').click();
    await expect(page.getByTestId('video-version-card-S01_main-v2')).toBeHidden({ timeout: 5000 });
  });

  // ── K2-11 ──
  test('K2-11: remoteUrl cache reuses uploaded image', async ({ page }) => {
    test.setTimeout(60000);
    let uploadCount = 0;
    await page.route('**/api.apimart.ai/v1/uploads/**', async (route) => {
      uploadCount++;
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ url: 'https://mock.apimart.ai/img_cached.png' }) });
    });
    await page.route('**/api.apimart.ai/v1/videos/**', async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ task_id: 'task_cache' }) });
    });
    await page.route('**/api.apimart.ai/v1/tasks/**', async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ status: 'completed', progress: 100, result: { video_url: 'https://mock.apimart.ai/video.mp4' } }) });
    });
    await setupApimart(page);
    // Add a reference image to S01 first
    await page.getByTestId('run-full-demo-button').click();
    await expect(page.getByTestId('production-status-compact')).toBeAttached({ timeout: 30000 });
    const MINI_PNG = [137,80,78,71,13,10,26,10,0,0,0,13,73,72,68,82,0,0,0,1,0,0,0,1,8,2,0,0,0,144,119,83,222,0,0,0,12,73,68,65,84,8,215,99,248,207,192,0,0,3,0,1,171,21,105,195,0,0,0,0,73,69,78,68,174,66,96,130];
    const refNode = page.getByTestId('reference-image-node-S01_main-0');
    await refNode.scrollIntoViewIfNeeded();
    await refNode.evaluate((el: any, bytes: any) => {
      const file = new File([new Uint8Array(bytes)], 'cache_test.png', { type: 'image/png' });
      const dt = new DataTransfer(); dt.items.add(file);
      el.dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true }));
    }, MINI_PNG);
    // First generation — upload should be called
    await clickInspectorGenerate(page, 'S01_main');
    await expect.poll(() => uploadCount, { timeout: 15000 }).toBe(1);
    // Second generation — cache hit, no new upload
    await clickInspectorGenerate(page, 'S01_main');
    // Upload count should stay at 1 (cache reused)
    await expect.poll(() => uploadCount, { timeout: 10000 }).toBe(1);
  });
});
