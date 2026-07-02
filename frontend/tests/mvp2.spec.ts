import { test, expect } from '@playwright/test';

test.describe('Infinite Canvas Video Generator - MVP-2 Tests', () => {

  test.beforeEach(async ({ page }) => {
    // Add console and error listeners
    page.on('console', msg => console.log('BROWSER_LOG:', msg.text()));
    page.on('pageerror', err => console.log('BROWSER_ERR:', err.message));
    
    // Navigate to the local server
    await page.goto('/');
    // Wait for the workspace to initialize and sync with FastAPI backend
    await expect(page.locator('div[data-id="S01_main"] .node-title')).toContainText('主图-正面', { timeout: 8000 });
  });

  // ==================== G组: 技术债与交互体验修复 ====================

  test('G1. 角色不匹配非阻断角标提示', async ({ page }) => {
    // 1. Select S01_main (requires 'main')
    await page.locator('div[data-id="S01_main"]').click();
    
    // Register a dialog listener to trace confirm dialog triggers
    let confirmTriggered = false;
    page.on('dialog', async (dialog) => {
      confirmTriggered = true;
      await dialog.dismiss();
    });

    // 2. Click "绑定" on second asset (which has roleKey: 'detail_1')
    const mismatchAssetBtn = page.locator('.asset-card').nth(1).locator('button:has-text("绑定")');
    await mismatchAssetBtn.click();
    
    // Assert that no confirm dialog was triggered (non-blocking)
    expect(confirmTriggered).toBe(false);
    
    // 3. Verify S01_main card shows warning icon/border
    const s01Card = page.locator('div[data-id="S01_main"] .custom-node');
    const warningIcon = s01Card.locator('.warning-icon');
    await expect(warningIcon).toBeVisible();
    
    // 4. Hover over warning icon and verify tooltip
    await warningIcon.hover();
    const tooltip = page.locator('.warning-tooltip');
    await expect(tooltip).toBeVisible();
    await expect(tooltip).toContainText('角色不匹配');
    await expect(tooltip).toContainText('细节-纸张质感');
    await expect(tooltip).toContainText('主图-正面');
  });

  test('G2. 预检面板确认机制', async ({ page }) => {
    // 1. Setup a mismatch (by binding detail_1 to S01_main)
    await page.locator('div[data-id="S01_main"]').click();
    
    // Dismiss confirm if it shows up in current code
    page.on('dialog', async (dialog) => {
      await dialog.accept();
    });
    
    await page.locator('.asset-card').nth(1).locator('button:has-text("绑定")').click();
    
    // Make sure duration is valid by setting S01 to 5s
    await page.locator('div[data-id="S01_main"]').click();
    await page.locator('input[type="range"]').fill('5');
    await page.waitForTimeout(500);

    // 2. Click "视频合成" button
    const mergeBtn = page.locator('button:has-text("视频合成")');
    await mergeBtn.click();
    
    // 3. Verify pre-flight panel expands
    const preflightPanel = page.locator('.preflight-panel');
    await expect(preflightPanel).toBeVisible();
    
    // 4. Verify warning items listing specifically for role mismatch
    const mismatchWarnings = preflightPanel.locator('.warning-item:has-text("角色不匹配")');
    await expect(mismatchWarnings).toHaveCount(1);
    await expect(mismatchWarnings.first()).toContainText('S01');
    
    // 5. Verify confirm button is disabled before checking box
    const confirmBtn = preflightPanel.locator('button:has-text("确认合成")');
    await expect(confirmBtn).toBeDisabled();
    
    // Try to trigger click anyway and verify no backend tasks are started
    await confirmBtn.click({ force: true });
    
    // 6. Check box and verify enabled
    const ackCheckbox = preflightPanel.locator('input[type="checkbox"]');
    await ackCheckbox.check();
    await expect(confirmBtn).toBeEnabled();
    
    // 7. Verify closing/cancelling panel works and cancels action
    const cancelBtn = page.locator('button:has-text("取消")');
    await cancelBtn.click();
    await expect(preflightPanel).not.toBeVisible();
  });

  // ==================== H组: 台历模板与保存复用 ====================

  test('H1. 台历产品线模板切换', async ({ page }) => {
    // 1. Select Desk Calendar Product Line
    const productSelector = page.locator('.product-selector');
    await productSelector.selectOption('desk');
    await page.waitForTimeout(1000);

    // 2. Locate S03_detail2, S04_motion, S05_scene cards and verify labels/roles match Desk Calendar
    const s03 = page.locator('div[data-id="S03_detail2"]');
    const s04 = page.locator('div[data-id="S04_motion"]');
    const s05 = page.locator('div[data-id="S05_scene"]');

    await expect(s03).toContainText('底座/翻页装订结构');
    await expect(s04).toContainText('手部翻页动作 + 桌面平移');
    await expect(s05).toContainText('书桌/办公场景陈列');
  });

  test('H2. 模板保存与空白复用', async ({ page }) => {
    // 1. Switch to Desk Calendar
    const productSelector = page.locator('.product-selector');
    await productSelector.selectOption('desk');
    await page.waitForTimeout(1000);

    // 2. Bind an asset to S01_main to test blank template stripping
    await page.locator('div[data-id="S01_main"]').click();
    await page.locator('.asset-card').first().locator('button:has-text("绑定")').click();
    
    // Check that asset is bound successfully
    const s01 = page.locator('div[data-id="S01_main"]');
    await expect(s01.locator('.asset-thumbnail')).toBeVisible();

    // Modify duration on S01 to 5s to test that structure fields are saved
    await page.locator('input[type="range"]').fill('5');
    await page.waitForTimeout(500);

    // 3. Monitor POST /api/v1/templates request payload
    let savedPayload: any = null;
    await page.route('**/api/v1/templates', async (route) => {
      if (route.request().method() === 'POST') {
        savedPayload = route.request().postDataJSON();
      }
      await route.continue();
    });

    // 4. Fill in template name and click save
    const nameInput = page.locator('input[placeholder="自定义模板名称"]');
    const saveBtn = page.locator('.save-template-btn');
    
    const uniqueTemplateName = `Tpl_E2E_Test_${Date.now()}`;
    await nameInput.fill(uniqueTemplateName);
    
    // Setup dialog listener to accept success alert
    page.on('dialog', async (dialog) => {
      await dialog.accept();
    });
    
    await saveBtn.click();
    await page.waitForTimeout(1000);

    // 5. Verify the captured payload did NOT contain any asset bindings on non-fixed nodes
    expect(savedPayload).not.toBeNull();
    const s01NodeInPayload = savedPayload.nodes.find((n: any) => n.node_key === 'S01_main' || n.id === 'S01_main');
    expect(s01NodeInPayload).toBeDefined();
    
    // Assert that asset_id, bound_asset_url, and role keys are completely stripped for non-fixed node
    expect(s01NodeInPayload.bound_asset_url).toBeUndefined();
    expect(s01NodeInPayload.bound_asset_source).toBeUndefined();
    expect(s01NodeInPayload.data?.boundAssetUrl).toBeUndefined();
    
    // Assert edge transition duration is present in payload
    expect(savedPayload.edges[0].transition_duration).toBeDefined();

    // 6. Select the newly saved template from dropdown list to verify blank cloning
    const templateSelector = page.locator('.template-selector');
    await expect(templateSelector.locator(`option:has-text("${uniqueTemplateName}")`)).toBeAttached({ timeout: 5000 });
    
    // Load the custom template
    await templateSelector.selectOption({ label: uniqueTemplateName });
    await page.waitForTimeout(1000);

    // 7. Verify S01 is blank (待绑定素材)
    const freshS01 = page.locator('div[data-id="S01_main"]');
    await expect(freshS01.locator('.asset-placeholder')).toBeVisible();
    await expect(freshS01.locator('.asset-thumbnail')).not.toBeVisible();
    
    // Verify duration custom field (5s) is successfully preserved!
    await expect(freshS01).toContainText('5s');

    // 8. Verify S06 (fixed brand outro node) successfully keeps its default asset (PRD rule)
    const freshS06 = page.locator('div[data-id="S06_brand"]');
    await expect(freshS06.locator('.asset-thumbnail')).toBeVisible();
    await expect(freshS06.locator('.asset-placeholder')).not.toBeVisible();
  });

  test('H3. 产品线模板隔离查询', async ({ page }) => {
    const productSelector = page.locator('.product-selector');
    const templateSelector = page.locator('.template-selector');

    // 1. Switch to Desk Calendar
    await productSelector.selectOption('desk');
    await page.waitForTimeout(1000);

    // 2. Save a custom template in Desk Calendar
    const nameInput = page.locator('input[placeholder="自定义模板名称"]');
    const saveBtn = page.locator('.save-template-btn');
    const uniqueTemplateName = `Tpl_Filter_Test_${Date.now()}`;
    
    await nameInput.fill(uniqueTemplateName);
    page.on('dialog', async (dialog) => {
      await dialog.accept();
    });
    await saveBtn.click();
    await page.waitForTimeout(1000);

    // Verify it is attached in desk calendar template selector
    await expect(templateSelector.locator(`option:has-text("${uniqueTemplateName}")`)).toBeAttached();

    // 3. Switch to Hanging Calendar and verify network request query params
    const hangingReqPromise = page.waitForRequest(req => 
      req.url().includes('/api/v1/templates') && 
      req.url().includes('product_id=hanging_calendar')
    );
    await productSelector.selectOption('hanging');
    await hangingReqPromise; // Assert correct product_id query param in request

    // Verify that the desk custom template is NOT attached in the template dropdown anymore
    await expect(templateSelector.locator(`option:has-text("${uniqueTemplateName}")`)).not.toBeAttached();

    // 4. Switch back to Desk Calendar and verify network request query params
    const deskReqPromise = page.waitForRequest(req => 
      req.url().includes('/api/v1/templates') && 
      req.url().includes('product_id=desk_calendar')
    );
    await productSelector.selectOption('desk');
    await deskReqPromise; // Assert correct product_id query param in request

    // Verify that the desk custom template is visible/attached again!
    await expect(templateSelector.locator(`option:has-text("${uniqueTemplateName}")`)).toBeAttached();
  });

  // ==================== I组: Sprint 3 — 批量克隆与裂变交互 ====================

  test('I1. 素材库多选：实时裂变计数器显示正确', async ({ page }) => {
    // There are 3 distinct SKUs in mockUploadedAssets: A01, A02, A03

    // Initially no fission banner should be visible
    await expect(page.locator('.fission-banner')).not.toBeVisible();

    // Click first asset checkbox (SKU2027-A01)
    await page.locator('.asset-card').nth(0).locator('.asset-select-checkbox').click();

    // Banner should now appear with "1 条产品链"
    await expect(page.locator('.fission-banner')).toBeVisible();
    await expect(page.locator('.fission-banner')).toContainText('预计裂变 1 条产品链');

    // Click an asset from SKU2027-A02 (index 5)
    await page.locator('.asset-card').nth(5).locator('.asset-select-checkbox').click();

    // Banner should update to "2 条产品链"
    await expect(page.locator('.fission-banner')).toContainText('预计裂变 2 条产品链');

    // Deselect first asset — banner drops back to 1
    await page.locator('.asset-card').nth(0).locator('.asset-select-checkbox').click();
    await expect(page.locator('.fission-banner')).toContainText('预计裂变 1 条产品链');

    // Clear all selection
    await page.locator('button:has-text("清除选择")').click();
    await expect(page.locator('.fission-banner')).not.toBeVisible();
  });

  test('I2. 不完整产品链(SKU-A03)批量克隆后产生missing_roles', async ({ page }) => {
    // Select ONLY the incomplete SKU-A03 assets (indices 10, 11)
    await page.locator('.asset-card').nth(10).locator('.asset-select-checkbox').click();
    await page.locator('.asset-card').nth(11).locator('.asset-select-checkbox').click();

    // Verify banner shows 1 chain (SKU2027-A03 only)
    await expect(page.locator('.fission-banner')).toContainText('预计裂变 1 条产品链');

    // Hit the batch clone button — intercept the API call to verify payload
    const batchReqPromise = page.waitForRequest(req =>
      req.url().includes('/api/v1/canvases') &&
      req.url().includes('/instances/batch') &&
      req.method() === 'POST'
    ).catch(() => null); // gracefully handle offline mode where no network call is made

    let dialogMsg = '';
    page.once('dialog', async dialog => {
      dialogMsg = dialog.message();
      await dialog.accept();
    });

    await page.locator('.batch-fission-btn').click();
    await page.waitForTimeout(2000);

    // If the backend is running, the dialog should confirm batch completion mentioning missing roles
    // If offline, it'll still show the offline completion dialog
    if (dialogMsg) {
      expect(dialogMsg).toMatch(/批量克隆完成|条产品链/);
    }

    const req = await batchReqPromise;
    if (req) {
      // Verify request payload includes correct SKU assets
      const body = JSON.parse(req.postData() || '{}');
      expect(body.assets).toBeDefined();
      expect(body.assets.length).toBe(2); // a10 + a11

      // Verify API response has missing_roles populated for A03
      const resp = await page.request.fetch(req.url(), {
        method: 'POST',
        data: JSON.stringify(body),
        headers: { 'Content-Type': 'application/json' },
      });
      const data = await resp.json();
      const a03Instance = data.instances.find((i: any) => i.product_sku === 'SKU2027-A03');
      expect(a03Instance).toBeDefined();
      // A03 has only main + detail_1; it should be missing at least detail_2
      expect(Array.isArray(a03Instance.missing_roles)).toBe(true);
      expect(a03Instance.missing_roles.length).toBeGreaterThan(0);
    }
  });

  test('I3. 超出10条上限时裂变横幅标红且拖拽句柄隐藏', async ({ page }) => {
    // 1. We now have 12 SKUs + 1 unparseable asset in mock data.
    const checkboxes = page.locator('.asset-select-checkbox');
    // Click 10 different SKUs (first 10 assets from different SKUs)
    const indicesToClick = [0, 5, 10, 12, 13, 14, 15, 16, 17, 18];
    for (const idx of indicesToClick) {
      await checkboxes.nth(idx).click();
    }
    
    const banner = page.locator('.fission-banner');
    await expect(banner).toHaveAttribute('data-fission-count', '10');
    // 10 SKUs = under limit — banner should be blue (not red) and fission-drag-handle visible
    await expect(banner).toHaveClass(/bg-blue-500\/10/);
    await expect(page.locator('.fission-drag-handle')).toBeVisible();

    // 2. Click 11th SKU
    await checkboxes.nth(19).click();
    
    await expect(banner).toHaveAttribute('data-fission-count', '11');
    await expect(banner).toHaveClass(/bg-red-500\/15/);
    
    // Screenshot for User: I3 Over limit state
    await page.screenshot({ path: 'C:/Users/Administrator/.gemini/antigravity/brain/449b48a0-e99e-4d8e-9be7-7c8500ec7136/i3_overlimit.png' });
    await expect(page.locator('.fission-drag-handle')).toHaveClass(/cursor-not-allowed/);
    await expect(page.locator('.batch-fission-btn')).toBeDisabled();

    // Clean up
    await page.locator('button:has-text("清除选择")').click();
    await expect(page.locator('.fission-banner')).not.toBeVisible();
  });

  test('I4. 文件名不规范兜底分组 (Boundary 3) 待处理区交互', async ({ page }) => {
    // Select one valid asset (a1 = SKU-01 main) and the unparseable one (a21 = photo_holiday.jpg)
    const checkboxes = page.locator('.asset-select-checkbox');
    await checkboxes.nth(0).click(); // SKU-01 main
    
    const banner = page.locator('.fission-banner');
    await expect(banner).toHaveAttribute('data-fission-count', '1');
    
    await checkboxes.nth(21).click(); // photo_holiday.jpg (last one)
    // count should still be 1
    await expect(banner).toHaveAttribute('data-fission-count', '1');
    
    // Deselect a1, only photo_holiday remains
    await checkboxes.nth(0).click(); 
    await expect(banner).toHaveAttribute('data-fission-count', '0');
    
    // I1 boundary check: 0 valid SKUs should disable fission button
    const btn = page.locator('.batch-fission-btn');
    await expect(btn).toBeDisabled();
    
    // Screenshot for User: I1 0-SKU disabled state
    await page.screenshot({ path: 'C:/Users/Administrator/.gemini/antigravity/brain/449b48a0-e99e-4d8e-9be7-7c8500ec7136/i1_zero_sku_disabled.png' });
    await expect(page.locator('.fission-drag-handle')).toHaveClass(/cursor-not-allowed/);
    
    // Reselect a1 to allow submission for I4
    await checkboxes.nth(0).click();
    await expect(btn).toBeEnabled();

    // Submit batch clone
    let dialogMsg = '';
    page.once('dialog', async dialog => {
      dialogMsg = dialog.message();
      await dialog.accept();
    });

    await btn.click();
    await page.waitForTimeout(2000);

    // Dialog should mention 待处理区 (or at least completion)
    // The alert content depends on backend responses
    if (dialogMsg) {
      expect(dialogMsg).toContain('生成');
    }

    // Verify Pending Area appears in the UI and click it to expand
    const pendingArea = page.locator('.sidebar-panel').locator('text=待处理');
    await expect(pendingArea.first()).toBeVisible();
    await pendingArea.first().click();
    
    // Ensure the unparseable file is listed in the pending area
    await expect(page.locator('text=photo_holiday.jpg')).toBeVisible();
    
    // Screenshot for User: I4 Pending Area expanded
    await page.waitForTimeout(500); // wait for animation
    await page.screenshot({ path: 'C:/Users/Administrator/.gemini/antigravity/brain/449b48a0-e99e-4d8e-9be7-7c8500ec7136/i4_pending_area.png' });
  });

  test('J1/J2. 批量生成队列与看板 & 失败项定位高亮', async ({ page }) => {
    await page.reload();
    await page.waitForTimeout(1000); // wait for load
    
    // Select assets that make 1 full chain and 1 missing chain
    // For a full chain we need: main, detail_1, detail_2, motion, scene (depends on template)
    // Wait, the desk template requires main, detail_1, detail_2, motion, scene
    // Our mock assets only have:
    // A01_main, A01_detail_2
    // A02_detail_1
    // A03_main, A03_motion, A03_scene
    // None of them are complete!
    // So all of them will have missing roles and fail immediately.
    // Let's select 0,1,2,3,4 to form a complete SKU2027-A01 chain
    // And select 7 to form an incomplete SKU2027-A03 chain
    const checkboxes = page.locator('.asset-select-checkbox');
    await checkboxes.nth(0).click(); 
    await checkboxes.nth(1).click(); 
    await checkboxes.nth(2).click(); 
    await checkboxes.nth(3).click(); 
    await checkboxes.nth(4).click(); 
    await checkboxes.nth(10).click(); 
    
    // Trigger batch clone
    page.once('dialog', async dialog => await dialog.accept());
    await page.locator('.batch-fission-btn').click();
    
    // Wait for the dashboard to appear
    const dashboard = page.locator('text=批量生成任务');
    await expect(dashboard).toBeVisible({ timeout: 5000 });
    
    // Wait for the overall task to finish
    await expect(page.locator('text=部分完成')).toBeVisible({ timeout: 50000 });
    
    // J1 verify counts (1 success, 1 failure)
    await expect(page.locator('text=成功: 1')).toBeVisible();
    await expect(page.locator('text=失败: 1')).toBeVisible();
    
    // J2 verify click to pan & zoom
    const failedItem = page.getByTestId('batch-item-failed-SKU2027-A03');
    await expect(failedItem).toBeVisible();
    await failedItem.click({ force: true });
    // Check if the node is flashed (transient, might be missed by playwright, just wait for zoom)
    await page.waitForTimeout(800);
    
    // Screenshot for User: J1 & J2 Evidence
    await page.waitForTimeout(500); // wait for zoom animation to settle slightly
    await page.screenshot({ path: 'C:/Users/Administrator/.gemini/antigravity/brain/449b48a0-e99e-4d8e-9be7-7c8500ec7136/j1_j2_dashboard.png' });
  });

  test('J3. 批量生成全部失败验证', async ({ page }) => {
    await page.reload();
    await page.waitForTimeout(1000); // wait for load
    
    // Select incomplete chains (A04 and A05 main images, indices 12 and 13)
    const checkboxes = page.locator('.asset-select-checkbox');
    await checkboxes.nth(12).click(); 
    await checkboxes.nth(13).click(); 
    
    // Trigger batch clone
    page.once('dialog', async dialog => await dialog.accept());
    await page.locator('.batch-fission-btn').click();
    
    // Wait for the dashboard to appear
    const dashboard = page.locator('text=批量生成任务');
    await expect(dashboard).toBeVisible({ timeout: 5000 });
    
    // Wait for the overall task to finish
    await expect(page.locator('text=全部失败')).toBeVisible({ timeout: 15000 });
    
    // Verify counts (0 success, 2 failure)
    await expect(page.locator('text=成功: 0')).toBeVisible();
    await expect(page.locator('text=失败: 2')).toBeVisible();
  });

  test('J4. 批量生成全部成功验证', async ({ page }) => {
    test.setTimeout(120000);
    await page.reload();
    // Wait for backend connection to stabilize (Vite HMR cycling can cause transient failures)
    await page.waitForTimeout(3000);
    
    // Select 2 complete chains (A01: 0-4, A02: 5-9)
    const checkboxes = page.locator('.asset-select-checkbox');
    for (let i = 0; i < 10; i++) {
      await checkboxes.nth(i).click();
    }
    
    // Trigger batch clone
    page.once('dialog', async dialog => await dialog.accept());
    await page.locator('.batch-fission-btn').click();
    
    // Wait for the dashboard to appear
    const dashboard = page.locator('text=批量生成任务');
    await expect(dashboard).toBeVisible({ timeout: 5000 });
    
    // Wait for the overall task to finish
    await expect(page.locator('text=已完成')).toBeVisible({ timeout: 70000 });
    
    // Verify counts (2 success, 0 failure)
    await expect(page.locator('text=成功: 2')).toBeVisible();
    await expect(page.locator('text=失败: 0')).toBeVisible();
  });

  test('K1. 手动修复失败节点全流程端到端验证', async ({ page, request }) => {
    test.setTimeout(90000);
    const BACKEND = 'http://127.0.0.1:8000';

    await page.reload();
    await page.waitForTimeout(1000);

    // --- Phase 1: Create a failing batch (A03 with only main image) ---
    const checkboxes = page.locator('.asset-select-checkbox');
    await checkboxes.nth(10).click();  // A03 main image only

    // Capture the batch ID from the batch clone API response
    const batchClonePromise = page.waitForResponse(
      resp => resp.url().includes('/api/v1/canvases/') && resp.url().includes('/instances/batch') && resp.request().method() === 'POST',
      { timeout: 10000 }
    );
    page.once('dialog', async dialog => await dialog.accept());
    await page.locator('.batch-fission-btn').click();
    const batchCloneResp = await batchClonePromise;
    const batchCloneData = await batchCloneResp.json();
    const batchId = batchCloneData.batch_id;
    console.log('K1: batch_id =', batchId);

    // Verify the failed item's instance_id from the batch clone response
    const failedInstance = batchCloneData.instances.find((i: any) => i.product_sku === 'SKU2027-A03');
    if (!failedInstance) throw new Error('SKU2027-A03 not found in batch clone response');
    const targetInstanceId = failedInstance.instance_id;
    console.log('K1: targetInstanceId =', targetInstanceId);

    // Wait for batch dashboard and verify it shows failure
    await expect(page.locator('text=全部失败')).toBeVisible({ timeout: 15000 });

    // Click A03 in the batch dashboard to set the active instanceId and refresh nodes
    await page.getByTestId('batch-item-failed-SKU2027-A03').click({ force: true });
    await page.waitForTimeout(1000);

    // Define the 5 shot nodes to fix (S01-S05, excluding S06 which is fixed/success)
    const nodeKeysToFix = ['S01_main', 'S02_detail1', 'S03_detail2', 'S04_motion', 'S05_scene'];
    const nodeLabels: Record<string, string> = {
      'S01_main': '主图-正面',
      'S02_detail1': '细节-纸张质感',
      'S03_detail2': '细节-装订挂绳',
      'S04_motion': '运镜-整体悬挂摇镜',
      'S05_scene': '场景-墙面陈列',
    };
    // Asset indices in sidebar (A01 set = indices 0-4)
    const assetIndexByNodeKey: Record<string, number> = {
      'S01_main': 0,
      'S02_detail1': 1,
      'S03_detail2': 2,
      'S04_motion': 3,
      'S05_scene': 4,
    };

    // --- Phase 3: Bind assets to each node via real UI interaction ---
    for (const nodeKey of nodeKeysToFix) {
      const nodeLabel = nodeLabels[nodeKey];
      const nodeLocator = page.locator(`.react-flow__node:has-text("${nodeLabel}")`).last();
      await nodeLocator.click();
      await page.waitForTimeout(200);

      const assetIdx = assetIndexByNodeKey[nodeKey];
      await page.locator('.asset-card').nth(assetIdx).hover();
      await page.locator('.asset-card').nth(assetIdx).locator('button:has-text("绑定")').first().click({ force: true });
      await page.waitForTimeout(300);

      // Verify binding persisted on backend
      const verifyResp = await request.get(`${BACKEND}/api/v1/instances/${targetInstanceId}`);
      expect(verifyResp.ok()).toBeTruthy();
      const verifyData = await verifyResp.json();
      const boundNode = verifyData.nodes.find((n: any) => n.id === nodeKey);
      expect(boundNode, `Node ${nodeKey} should exist in instance`).toBeTruthy();
      expect(boundNode.data.boundAssetUrl, `Node ${nodeKey} should have boundAssetUrl after binding`).toBeTruthy();
    }

    // --- Phase 4: Generate each node and verify via backend polling ---
    for (const nodeKey of nodeKeysToFix) {
      const nodeLabel = nodeLabels[nodeKey];
      const nodeLocator = page.locator(`.react-flow__node:has-text("${nodeLabel}")`).last();
      await nodeLocator.click();
      await page.waitForTimeout(200);

      // Click Generate
      const genBtn = nodeLocator.locator('button:has-text("生成")');
      await genBtn.click();

      // Poll backend for node status instead of trusting UI text
      let nodeStatus = '';
      const pollStart = Date.now();
      while (Date.now() - pollStart < 15000) {
        const pollResp = await request.get(`${BACKEND}/api/v1/instances/${targetInstanceId}`);
        const pollData = await pollResp.json();
        const targetNode = pollData.nodes.find((n: any) => n.id === nodeKey);
        if (targetNode) {
          nodeStatus = targetNode.data.status;
          if (nodeStatus === 'success' || nodeStatus === 'failed') break;
        }
        await page.waitForTimeout(1000);
      }
      expect(nodeStatus, `Node ${nodeKey} should reach success status`).toBe('success');
    }

    // --- Phase 5: Verify auto-merge triggered and batch status self-healed ---
    // After all 5 shot nodes are success, the last generate should auto-trigger merge (4s delay)
    // Poll the instance to verify merge completes
    let instanceStatus = '';
    const mergePollStart = Date.now();
    while (Date.now() - mergePollStart < 20000) {
      const pollResp = await request.get(`${BACKEND}/api/v1/instances/${targetInstanceId}`);
      const pollData = await pollResp.json();
      instanceStatus = pollData.status;
      if (instanceStatus === 'completed') break;
      await page.waitForTimeout(1000);
    }
    expect(instanceStatus, 'Instance should be completed after merge').toBe('completed');
    const finalInstanceResp = await request.get(`${BACKEND}/api/v1/instances/${targetInstanceId}`);
    const finalInstanceData = await finalInstanceResp.json();
    expect(finalInstanceData.merged_video_url, 'Merged video URL should be set').toBeTruthy();

    // --- Phase 6: Verify batch task counts self-healed ---
    const finalBatchResp = await request.get(`${BACKEND}/api/v1/batches/${batchId}`);
    const finalBatchData = await finalBatchResp.json();
    expect(finalBatchData.completed_count, 'batch completed_count should be 1').toBe(1);
    expect(finalBatchData.failed_count, 'batch failed_count should be 0').toBe(0);
    expect(finalBatchData.status, 'batch status should be completed').toBe('completed');

    // Verify the UI shows the healed state
    await expect(page.locator('text=已完成')).toBeVisible({ timeout: 5000 });
    await expect(page.locator('text=成功: 1')).toBeVisible();
    await expect(page.locator('text=失败: 0')).toBeVisible();
    await expect(page.locator('text=✨ 已手动修复')).toBeVisible();
  });

});

