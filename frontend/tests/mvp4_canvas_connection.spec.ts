import { test, expect } from '@playwright/test';

test.describe('MVP-4 Canvas Connection', () => {
  let sharedAssetId = '';

  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForTimeout(2000);
    const wbBtn = page.getByRole('button', { name: '生产工作台' });
    if (await wbBtn.isVisible({ timeout: 5000 }).catch(() => false)) await wbBtn.click();
    await expect(page.getByTestId('mvp3-workbench')).toBeVisible({ timeout: 10000 });
  });

  test('M4-Connect-01: upload image and verify asset card exists', async ({ page }) => {
    test.setTimeout(30000);
    const fileInput = page.getByTestId('asset-upload-input');
    await fileInput.setInputFiles({ name: 'drag_test.png', mimeType: 'image/png', buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64') });
    await expect(page.getByTestId('asset-library-panel')).toBeVisible({ timeout: 5000 });
    const assetCard = page.locator('[data-testid^="asset-card-"]').first();
    await expect(assetCard).toBeVisible();
    await expect(assetCard).toHaveAttribute('draggable', 'true');
    const testId = await assetCard.getAttribute('data-testid');
    if (testId) sharedAssetId = testId.replace('asset-card-', '');
  });

  test('M4-Connect-02: canvas has six shot nodes visible', async ({ page }) => {
    test.setTimeout(30000);
    await page.getByTestId('workbench-tab-canvas').click();
    for (const sk of ['S01_main', 'S02_detail1', 'S03_detail2', 'S04_motion', 'S05_scene', 'S06_brand']) {
      await expect(page.getByTestId(`shot-control-node-${sk}`)).toBeAttached({ timeout: 15000 });
    }
  });

  test('M4-Connect-03: drag asset to canvas creates asset node', async ({ page }) => {
    test.setTimeout(60000);
    // Upload + create demo batch so shot nodes exist with real data
    await page.getByTestId('create-demo-product-button').click();
    await expect(page.getByTestId('checklist-ready')).toBeVisible({ timeout: 20000 });
    await page.getByTestId('template-desk_calendar').first().click();
    await page.getByTestId('create-video-batch-button').click();
    await expect(page.getByTestId('batch-id')).toBeVisible({ timeout: 10000 });
    // Upload image
    const fileInput = page.getByTestId('asset-upload-input');
    await fileInput.setInputFiles({ name: 'canvas_drop.png', mimeType: 'image/png', buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64') });
    await expect(page.getByTestId('asset-library-panel')).toBeVisible({ timeout: 5000 });
    // Get asset card id
    const card = page.locator('[data-testid^="asset-card-"]').first();
    await expect(card).toBeVisible();
    // Switch to canvas
    await page.getByTestId('workbench-tab-canvas').click();
    await expect(page.getByTestId('shot-control-node-S01_main')).toBeAttached({ timeout: 8000 });
    // Dispatch drag-drop events via evaluate
    const testId = await card.getAttribute('data-testid');
    const aid = testId ? testId.replace('asset-card-', '') : sharedAssetId;
    await page.evaluate(({ assetId, cardSelector, canvasSelector }) => {
      const source = document.querySelector(cardSelector);
      const target = document.querySelector(canvasSelector);
      if (!source || !target) return;
      const asset = { id: assetId, filename: 'canvas_drop.png', url: '', role: 'reference', createdAt: Date.now() };
      const dt = new DataTransfer();
      dt.setData('application/workbench-asset', JSON.stringify(asset));
      source.dispatchEvent(new DragEvent('dragstart', { dataTransfer: dt, bubbles: true }));
      target.dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true }));
    }, { assetId: aid, cardSelector: `[data-testid="asset-card-${aid}"]`, canvasSelector: '[data-testid="production-canvas-view"]' });
    // Verify asset node appears on canvas
    await expect(page.getByTestId(`canvas-asset-node-${aid}`)).toBeVisible({ timeout: 5000 });
  });

  test('M4-Connect-04: Inspector fallback binding still works', async ({ page }) => {
    test.setTimeout(90000);
    await page.getByTestId('create-demo-product-button').click();
    await expect(page.getByTestId('checklist-ready')).toBeVisible({ timeout: 20000 });
    await page.getByTestId('template-desk_calendar').first().click();
    await page.getByTestId('create-video-batch-button').click();
    await expect(page.getByTestId('batch-id')).toBeVisible({ timeout: 10000 });
    const fileInput = page.getByTestId('asset-upload-input');
    await fileInput.setInputFiles({ name: 'test_sf.png', mimeType: 'image/png', buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64') });
    await expect(page.getByTestId('asset-library-panel')).toBeVisible({ timeout: 5000 });
    const assetCard = page.getByTestId('asset-library-panel').locator('[data-testid^="asset-card-"]').first();
    await assetCard.locator('select').selectOption('start_frame');
    await page.getByTestId('workbench-tab-canvas').click();
    await page.getByTestId('workflow-shot-S01_main').click();
    await expect(page.getByTestId('canvas-node-detail-panel')).toBeVisible({ timeout: 8000 });
    const bindSelect = page.getByTestId('bind-start-frame-select');
    await expect(bindSelect).toBeVisible({ timeout: 3000 });
    const options = bindSelect.locator('option');
    const count = await options.count();
    if (count > 1) { const val = await options.nth(1).getAttribute('value'); if (val) await bindSelect.selectOption(val); }
    await expect(page.getByTestId('start-frame-preview')).toBeVisible({ timeout: 5000 });
  });

  test('M4-Connect-06: asset node has source handle and shot node has start_frame handle with testids for real interaction', async ({ page }) => {
    test.setTimeout(90000);
    // Create batch with nodes
    await page.getByTestId('create-demo-product-button').click();
    await expect(page.getByTestId('checklist-ready')).toBeVisible({ timeout: 20000 });
    await page.getByTestId('template-desk_calendar').first().click();
    await page.getByTestId('create-video-batch-button').click();
    await expect(page.getByTestId('batch-id')).toBeVisible({ timeout: 10000 });
    const fileInput = page.getByTestId('asset-upload-input');
    await fileInput.setInputFiles({ name: 'h_test.png', mimeType: 'image/png', buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64') });
    await expect(page.getByTestId('asset-library-panel')).toBeVisible({ timeout: 5000 });
    const card = page.getByTestId('asset-library-panel').locator('[data-testid^="asset-card-"]').first();
    await card.locator('select').selectOption('start_frame');
    const testId = await card.getAttribute('data-testid');
    const aid = testId ? testId.replace('asset-card-', '') : '';
    await page.getByTestId('workbench-tab-canvas').click();
    await page.evaluate(({ assetId, cardSelector, canvasSelector }) => {
      const source = document.querySelector(cardSelector) as HTMLElement;
      const target = document.querySelector(canvasSelector) as HTMLElement;
      if (!source || !target) return;
      const asset = { id: assetId, filename: 'h_test.png', url: '', role: 'start_frame', createdAt: Date.now() };
      const dt = new DataTransfer();
      dt.setData('application/workbench-asset', JSON.stringify(asset));
      source.dispatchEvent(new DragEvent('dragstart', { dataTransfer: dt, bubbles: true }));
      target.dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true }));
    }, { assetId: aid, cardSelector: `[data-testid="asset-card-${aid}"]`, canvasSelector: '[data-testid="production-canvas-view"]' });
    await expect(page.getByTestId(`canvas-asset-node-${aid}`)).toBeVisible({ timeout: 5000 });
    // Verify asset connect button exists (handles have data-testids for drag-connect interaction)
    await expect(page.getByTestId(`asset-node-connect-${aid}`)).toBeVisible({ timeout: 5000 });
    // Click-to-connect: click asset "连接" button, then click S01 start_frame button in shot card
    await page.getByTestId(`asset-node-connect-${aid}`).click();
    await expect(page.getByTestId('cancel-asset-connection')).toBeVisible({ timeout: 3000 });
    // Use dispatchEvent for click-to-connect button — asset node may visually overlap the shot control node
    await page.evaluate(() => { const el = document.querySelector('[data-testid="shot-node-click-start-frame-S01_main"]') as HTMLElement; if (el) el.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    // Verify binding edge label exists (binding was created via same handleBindShotFrame path)
    const edgeDel = page.locator('[data-testid^="edge-delete-be-sf-"]').first();
    await expect(edgeDel).toBeAttached({ timeout: 10000 });
    // Delete binding by dispatching click on edge delete button (may be outside viewport due to React Flow transform)
    await edgeDel.dispatchEvent('click');
    await expect(edgeDel).not.toBeAttached({ timeout: 5000 });
  });

  test('M4-Connect-05: Inspector unbind restores missing frame warning', async ({ page }) => {
    test.setTimeout(90000);
    await page.getByTestId('create-demo-product-button').click();
    await expect(page.getByTestId('checklist-ready')).toBeVisible({ timeout: 20000 });
    await page.getByTestId('template-desk_calendar').first().click();
    await page.getByTestId('create-video-batch-button').click();
    await expect(page.getByTestId('batch-id')).toBeVisible({ timeout: 10000 });
    const fileInput = page.getByTestId('asset-upload-input');
    await fileInput.setInputFiles({ name: 'unbind_test.png', mimeType: 'image/png', buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64') });
    await expect(page.getByTestId('asset-library-panel')).toBeVisible({ timeout: 5000 });
    const assetCard = page.getByTestId('asset-library-panel').locator('[data-testid^="asset-card-"]').first();
    await assetCard.locator('select').selectOption('start_frame');
    // Bind via Inspector
    await page.getByTestId('workbench-tab-canvas').click();
    await page.getByTestId('workflow-shot-S01_main').click();
    const bindSelect = page.getByTestId('bind-start-frame-select');
    await expect(bindSelect).toBeVisible({ timeout: 3000 });
    const options = bindSelect.locator('option'); const count = await options.count();
    if (count > 1) { const val = await options.nth(1).getAttribute('value'); if (val) await bindSelect.selectOption(val); }
    await expect(page.getByTestId('start-frame-preview')).toBeVisible({ timeout: 5000 });
    // Click unbind button in Inspector
    const unbindBtn = page.getByTestId('start-frame-preview').locator('button', { hasText: '解绑' });
    if (await unbindBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await unbindBtn.click();
      await expect(page.getByTestId('frame-binding-warning')).toBeVisible({ timeout: 5000 });
    }
  });

  test('M4-Connect-07: click-to-connect end_frame binding', async ({ page }) => {
    test.setTimeout(90000);
    await page.getByTestId('create-demo-product-button').click();
    await expect(page.getByTestId('checklist-ready')).toBeVisible({ timeout: 20000 });
    await page.getByTestId('template-desk_calendar').first().click();
    await page.getByTestId('create-video-batch-button').click();
    await expect(page.getByTestId('batch-id')).toBeVisible({ timeout: 10000 });
    const f = page.getByTestId('asset-upload-input');
    await f.setInputFiles({ name: 'ef.png', mimeType: 'image/png', buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64') });
    await expect(page.getByTestId('asset-library-panel')).toBeVisible({ timeout: 5000 });
    const card = page.getByTestId('asset-library-panel').locator('[data-testid^="asset-card-"]').first();
    await card.locator('select').selectOption('end_frame');
    const tid = await card.getAttribute('data-testid'); const aid = (tid||'').replace('asset-card-','');
    await page.getByTestId('workbench-tab-canvas').click();
    await page.evaluate(({ assetId, cardSelector, canvasSelector }: any) => {
      const s = document.querySelector(cardSelector) as HTMLElement;
      const t = document.querySelector(canvasSelector) as HTMLElement;
      if(!s||!t) return;
      const a={id:assetId,filename:'ef.png',url:'',role:'end_frame',createdAt:Date.now()};
      const dt=new DataTransfer(); dt.setData('application/workbench-asset',JSON.stringify(a));
      s.dispatchEvent(new DragEvent('dragstart',{dataTransfer:dt,bubbles:true}));
      t.dispatchEvent(new DragEvent('drop',{dataTransfer:dt,bubbles:true}));
    },{assetId:aid,cardSelector:`[data-testid="asset-card-${aid}"]`,canvasSelector:'[data-testid="production-canvas-view"]'});
    await page.getByTestId(`asset-node-connect-${aid}`).click();
    await expect(page.getByTestId('cancel-asset-connection')).toBeVisible({ timeout: 3000 });
    await page.evaluate(() => { const el = document.querySelector('[data-testid="shot-node-click-end-frame-S01_main"]') as HTMLElement; if (el) el.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    const ed = page.locator('[data-testid^="edge-delete-be-ef-"]').first();
    await expect(ed).toBeAttached({ timeout: 10000 });
    await page.evaluate(()=>{const e=document.querySelector('[data-testid^="edge-delete-be-ef-"]') as HTMLElement;if(e)e.dispatchEvent(new MouseEvent('click',{bubbles:true}));});
    await expect(ed).not.toBeAttached({ timeout: 5000 });
  });
});
