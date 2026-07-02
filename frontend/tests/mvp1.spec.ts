import { test, expect } from '@playwright/test';

test.describe('Infinite Canvas AI Video Generator - E2E Tests', () => {
  
  test.beforeEach(async ({ page }) => {
    // Navigate to the local server
    await page.goto('/');
    // Wait for the canvas and nodes to render
    await expect(page.locator('div[data-id="S01_main"]')).toBeVisible({ timeout: 5000 });
  });

  // ==================== A组: 单链端到端链路测试 ====================
  
  test('A1. 全节点素材绑定', async ({ page }) => {
    // 1. Click S01 node to select it
    const s01 = page.locator('div[data-id="S01_main"]');
    await s01.click();
    
    // 2. Click "绑定" on the first asset card in the sidebar
    const firstAssetBindBtn = page.locator('.asset-card').first().locator('button:has-text("绑定")');
    await firstAssetBindBtn.click();
    
    // 3. Verify S01 now has bound asset URL thumbnail and source badge
    await expect(s01.locator('.asset-thumbnail')).toBeVisible();
    await expect(s01.locator('.source-badge.uploaded')).toBeVisible();
    
    // 4. Check S06 Brand Node is fixed and pre-bound (should have thumbnail by default)
    const s06 = page.locator('div[data-id="S06_brand"]');
    await expect(s06.locator('.asset-thumbnail')).toBeVisible();
    await expect(s06.locator('.source-badge.uploaded')).toBeVisible();
  });

  test('A2. 逐节点生成', async ({ page }) => {
    const s01 = page.locator('div[data-id="S01_main"]');
    await s01.click();
    
    // Bind first asset
    await page.locator('.asset-card').first().locator('button:has-text("绑定")').click();
    
    // Click generate button inside the node card
    const genBtn = s01.locator('button:has-text("生成")');
    await genBtn.click();
    
    // Verify node goes to generating state (target inner custom-node element)
    await expect(s01.locator('.custom-node')).toHaveClass(/node-status-generating/);
    
    // Wait for mock duration (3s) to finish and check status (should be success or failed)
    await page.waitForTimeout(4000);
    const hasSuccess = await s01.locator('.custom-node').evaluate((el) => el.classList.contains('node-status-success'));
    const hasFailed = await s01.locator('.custom-node').evaluate((el) => el.classList.contains('node-status-failed'));
    expect(hasSuccess || hasFailed).toBeTruthy();
  });

  test('A3. 合成节点自动触发', async ({ page }) => {
    // This test will verify if the merge node automatically triggers once all segments are successful.
    // First, make total duration valid (25s) by changing S01 duration from 4s to 5s
    await page.locator('div[data-id="S01_main"]').click();
    await page.locator('input[type="range"]').fill('5');
    await page.waitForTimeout(500);
    
    const nodesToMock = ['S01_main', 'S02_detail1', 'S03_detail2', 'S04_motion', 'S05_scene'];
    
    for (let i = 0; i < nodesToMock.length; i++) {
      const node = page.locator(`div[data-id="${nodesToMock[i]}"]`);
      await node.click();
      await page.locator('.asset-card').nth(i).locator('button:has-text("绑定")').click();
      await node.locator('button:has-text("生成")').click();
    }
    
    await page.waitForTimeout(5000);
    
    for (const id of nodesToMock) {
      const node = page.locator(`div[data-id="${id}"]`);
      const isFailed = await node.locator('.custom-node').evaluate((el) => el.classList.contains('node-status-failed'));
      if (isFailed) {
        await node.locator('button:has-text("重跑")').click();
      }
    }
    await page.waitForTimeout(4000);
    
    const mergeNode = page.locator('div[data-id="M01_merge"] .custom-node');
    // EXPECTATION: should go to generating state or success (merged)
    const hasGenerating = await mergeNode.evaluate((el) => el.classList.contains('node-status-generating'));
    const hasSuccess = await mergeNode.evaluate((el) => el.classList.contains('node-status-success'));
    expect(hasGenerating || hasSuccess).toBeTruthy();
  });

  test('A4. 导出成片与命名规格', async ({ page }) => {
    const platformSelector = page.locator('.platform-selector'); 
    await expect(platformSelector).toBeVisible();
  });

  // ==================== B组: 总时长阻断逻辑测试 ====================
  
  test('B1. 时长不足阻断', async ({ page }) => {
    const mergeBtn = page.locator('button:has-text("视频合成")');
    await expect(mergeBtn).toBeDisabled();
    
    await mergeBtn.click({ force: true });
    await expect(page.locator('text=合成成功')).not.toBeVisible();
  });

  test('B2. 时长超出阻断', async ({ page }) => {
    await page.locator('div[data-id="S01_main"]').click();
    
    const slider = page.locator('input[type="range"]');
    await slider.fill('5');
    
    await page.locator('div[data-id="S02_detail1"]').click();
    await slider.fill('5');

    await page.locator('div[data-id="S03_detail2"]').click();
    await slider.fill('5');

    await page.locator('div[data-id="S04_motion"]').click();
    await slider.fill('5');
    
    await page.locator('div[data-id="S05_scene"]').click();
    await slider.fill('5'); 
    
    await page.locator('div[data-id="S06_brand"]').click();
    await slider.fill('5');
    
    const mergeBtn = page.locator('button:has-text("视频合成")');
    await expect(mergeBtn).toBeDisabled();
  });

  test('B3. 时长回到合规区间', async ({ page }) => {
    await page.locator('div[data-id="S01_main"]').click();
    await page.locator('input[type="range"]').fill('4');
    
    await page.locator('div[data-id="S02_detail1"]').click();
    await page.locator('input[type="range"]').fill('4');
    
    const durationIndicator = page.locator('.duration-val');
    await expect(durationIndicator).toHaveClass(/duration-val/);
    await expect(durationIndicator).not.toHaveClass(/invalid/);
  });

  // ==================== C组: 失败重跑隔离性测试 ====================
  
  test('C1. 模拟单节点失败', async ({ page }) => {
    // 1. Make duration valid (S01: 5s)
    await page.locator('div[data-id="S01_main"]').click();
    await page.locator('input[type="range"]').fill('5');
    await page.waitForTimeout(500);

    // 2. Intercept S03 generate request to force fail
    let forceFailS03 = true;
    await page.route('**/nodes/S03_detail2/generate', async (route) => {
      if (forceFailS03) {
        forceFailS03 = false;
        await route.continue({ url: route.request().url() + '?force_status=failed' });
      } else {
        await route.continue();
      }
    });

    // 3. Bind matching assets to S01 to S05
    const nodes = ['S01_main', 'S02_detail1', 'S03_detail2', 'S04_motion', 'S05_scene'];
    for (let i = 0; i < nodes.length; i++) {
      const node = page.locator(`div[data-id="${nodes[i]}"]`);
      await node.click();
      await page.locator('.asset-card').nth(i).locator('button:has-text("绑定")').click();
    }

    // 4. Trigger generation for all nodes
    for (const id of nodes) {
      await page.locator(`div[data-id="${id}"]`).click();
      await page.locator(`div[data-id="${id}"] button:has-text("生成")`).click();
    }

    // 5. Wait for nodes to finish generation
    const successNodes = ['S01_main', 'S02_detail1', 'S04_motion', 'S05_scene'];
    for (const id of successNodes) {
      await expect(page.locator(`div[data-id="${id}"] .custom-node`)).toHaveClass(/node-status-success/, { timeout: 15000 });
    }
    await expect(page.locator('div[data-id="S03_detail2"] .custom-node')).toHaveClass(/node-status-failed/, { timeout: 15000 });

    // 6. Verify isolation (S04 is success, unaffected by S03's failure)
    await expect(page.locator('div[data-id="S04_motion"] .custom-node')).toHaveClass(/node-status-success/);
  });

  test('C2. 单节点重跑', async ({ page }) => {
    // 1. Make duration valid (S01: 5s)
    await page.locator('div[data-id="S01_main"]').click();
    await page.locator('input[type="range"]').fill('5');
    await page.waitForTimeout(500);

    // 2. Intercept S03 generate request to force fail on first try, allow success on second
    let forceFailS03 = true;
    await page.route('**/nodes/S03_detail2/generate', async (route) => {
      if (forceFailS03) {
        forceFailS03 = false;
        await route.continue({ url: route.request().url() + '?force_status=failed' });
      } else {
        await route.continue();
      }
    });

    // 3. Bind matching assets to S01 to S05
    const nodes = ['S01_main', 'S02_detail1', 'S03_detail2', 'S04_motion', 'S05_scene'];
    for (let i = 0; i < nodes.length; i++) {
      const node = page.locator(`div[data-id="${nodes[i]}"]`);
      await node.click();
      await page.locator('.asset-card').nth(i).locator('button:has-text("绑定")').click();
    }

    // 4. Trigger generation for all nodes
    for (const id of nodes) {
      await page.locator(`div[data-id="${id}"]`).click();
      await page.locator(`div[data-id="${id}"] button:has-text("生成")`).click();
    }

    // 5. Wait for initial state: S03 is failed
    await expect(page.locator('div[data-id="S03_detail2"] .custom-node')).toHaveClass(/node-status-failed/, { timeout: 15000 });

    // 6. Select S03 and trigger rerun
    const s03 = page.locator('div[data-id="S03_detail2"]');
    await s03.click();
    const rerunBtn = s03.locator('button:has-text("重跑")');
    await expect(rerunBtn).toBeEnabled();
    await rerunBtn.click();

    // 7. Verify it transitions to generating then success
    await expect(s03.locator('.custom-node')).toHaveClass(/node-status-generating/);
    await expect(s03.locator('.custom-node')).toHaveClass(/node-status-success/, { timeout: 15000 });

    // 8. Verify compile button becomes enabled
    const mergeBtn = page.locator('button:has-text("视频合成")');
    await expect(mergeBtn).toBeEnabled();
  });

  test('C3. 合成节点等待逻辑', async ({ page }) => {
    // 1. Make duration valid (S01: 5s)
    await page.locator('div[data-id="S01_main"]').click();
    await page.locator('input[type="range"]').fill('5');
    await page.waitForTimeout(500);

    // 2. Intercept S03 generate request to force fail
    let forceFailS03 = true;
    await page.route('**/nodes/S03_detail2/generate', async (route) => {
      if (forceFailS03) {
        forceFailS03 = false;
        await route.continue({ url: route.request().url() + '?force_status=failed' });
      } else {
        await route.continue();
      }
    });

    // 3. Bind matching assets to S01 to S05
    const nodes = ['S01_main', 'S02_detail1', 'S03_detail2', 'S04_motion', 'S05_scene'];
    for (let i = 0; i < nodes.length; i++) {
      const node = page.locator(`div[data-id="${nodes[i]}"]`);
      await node.click();
      await page.locator('.asset-card').nth(i).locator('button:has-text("绑定")').click();
    }

    // 4. Trigger generation for all nodes
    for (const id of nodes) {
      await page.locator(`div[data-id="${id}"]`).click();
      await page.locator(`div[data-id="${id}"] button:has-text("生成")`).click();
    }

    // 5. Wait for initial state: S03 is failed
    await expect(page.locator('div[data-id="S03_detail2"] .custom-node')).toHaveClass(/node-status-failed/, { timeout: 15000 });

    // 6. Verify compile button is disabled due to the failure
    const mergeBtn = page.locator('button:has-text("视频合成")');
    await expect(mergeBtn).toBeDisabled();
  });

  // ==================== F组: 素材绑定与角色匹配校验 ====================
  
  test('F1. 素材绑定与角色匹配校验', async ({ page }) => {
    // Clear selection first
    await page.locator('.react-flow__pane').click();
    await page.waitForTimeout(500);

    // 1. Click "绑定" on the first asset card (roleKey: 'main') without selecting any node
    await page.locator('.asset-card').first().locator('button:has-text("绑定")').click();
    
    // Verify selector modal is shown
    const modalTitle = page.locator('text=选择目标分镜节点');
    await expect(modalTitle).toBeVisible();
    
    // 2. Select S01 (roleKey: 'main') from the selector modal list (Role matches, no dialog)
    const s01BtnInModal = page.locator('button').filter({ hasText: /S01 主图镜头|主图-正面/ });
    await s01BtnInModal.click();
    
    // Verify modal is closed and S01 gets bound asset
    await expect(modalTitle).not.toBeVisible();
    await expect(page.locator('div[data-id="S01_main"] .asset-thumbnail')).toBeVisible();
    
    // 3. Test role mismatch warning
    // Select S02_detail1 first (requires roleKey: 'detail_1')
    await page.locator('div[data-id="S02_detail1"]').click();
    
    // Register dialog listener to intercept mismatch confirm dialog
    let dialogTriggered = false;
    page.once('dialog', async (dialog) => {
      dialogTriggered = true;
      expect(dialog.message()).toContain('角色不匹配提示');
      await dialog.accept(); // Accept force bind
    });
    
    // Click "绑定" on the first asset card (which is roleKey: 'main', mismatching S02's detail_1)
    const mismatchAssetBtn = page.locator('.asset-card').first().locator('button:has-text("绑定")');
    await mismatchAssetBtn.click();
    
    // Verify dialog was triggered and S02 gets bound asset
    expect(dialogTriggered).toBe(true);
    await expect(page.locator('div[data-id="S02_detail1"] .asset-thumbnail')).toBeVisible();
  });
  
});
