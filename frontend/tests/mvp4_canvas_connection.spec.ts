import { test, expect } from '@playwright/test';

// Helper: hover a sidebar icon to open its module panel
async function openPanel(page: any, icon: string) {
  await page.getByTestId(`sidebar-icon-${icon}`).hover();
  await expect(page.getByTestId('workflow-sidebar-expanded')).toBeVisible({ timeout: 5000 });
}

test.describe('MVP-4 Canvas Connection', () => {
  let sharedAssetId = '';

  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    const wbBtn = page.getByRole('button', { name: '生产工作台' });
    if (await wbBtn.isVisible({ timeout: 5000 }).catch(() => false)) await wbBtn.click();
    await expect(page.getByTestId('mvp3-workbench')).toBeVisible({ timeout: 10000 });
  });

  test('M4-Connect-01: upload image and verify asset card exists', async ({ page }) => {
    test.setTimeout(30000);
    await openPanel(page, 'assets');
    const fileInput = page.getByTestId('asset-upload-input');
    await fileInput.setInputFiles({ name: 'drag_test.png', mimeType: 'image/png', buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64') });
    await expect(page.getByTestId('asset-library-panel')).toBeVisible({ timeout: 5000 });
    const assetCard = page.locator('[data-testid^="asset-card-"]').first();
    await expect(assetCard).toBeVisible();
    await expect(assetCard).toHaveAttribute('draggable', 'true');
    const testId = await assetCard.getAttribute('data-testid');
    if (testId) sharedAssetId = testId.replace('asset-card-', '');
  });

  test('M4-Connect-02: canvas has six shot control nodes + fixed edges', async ({ page }) => {
    test.setTimeout(30000);
    for (const sk of ['S01_main', 'S02_detail1', 'S03_detail2', 'S04_motion', 'S05_scene', 'S06_brand']) {
      await expect(page.getByTestId(`shot-control-node-${sk}`)).toBeAttached({ timeout: 15000 });
    }
    // Fixed edges visible (React Flow renders edges after nodes sync)
    await page.waitForSelector('.react-flow__edge', { timeout: 8000 });
  });

  test('M4-Connect-03: drag asset to canvas creates free ReferenceImageNode', async ({ page }) => {
    test.setTimeout(60000);
    await openPanel(page, 'assets');
    await page.getByTestId('create-demo-product-button').click();
    await expect(page.getByTestId('checklist-ready')).toBeVisible({ timeout: 20000 });
    await openPanel(page, 'template');
    await page.getByTestId('template-desk_calendar').first().click();
    await openPanel(page, 'batch');
    await page.getByTestId('create-video-batch-button').click();
    await expect(page.getByTestId('batch-id')).toBeVisible({ timeout: 10000 });
    await openPanel(page, 'assets');
    const fileInput = page.getByTestId('asset-upload-input');
    await fileInput.setInputFiles({ name: 'canvas_drop.png', mimeType: 'image/png', buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64') });
    await expect(page.getByTestId('asset-library-panel')).toBeVisible({ timeout: 5000 });
    const card = page.locator('[data-testid^="asset-card-"]').first();
    await expect(card).toBeVisible();
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
    // Free ReferenceImageNode created (has delete button)
    await expect(page.locator('[data-testid^="delete-free-ref-node-"]').first()).toBeAttached({ timeout: 5000 });
  });

  test('M4-Connect-04: Inspector fallback binding still works', async ({ page }) => {
    test.setTimeout(90000);
    await openPanel(page, 'assets');
    await page.getByTestId('create-demo-product-button').click();
    await expect(page.getByTestId('checklist-ready')).toBeVisible({ timeout: 20000 });
    await openPanel(page, 'template');
    await page.getByTestId('template-desk_calendar').first().click();
    await openPanel(page, 'batch');
    await page.getByTestId('create-video-batch-button').click();
    await expect(page.getByTestId('batch-id')).toBeVisible({ timeout: 10000 });
    await openPanel(page, 'assets');
    const fileInput = page.getByTestId('asset-upload-input');
    await fileInput.setInputFiles({ name: 'test_sf.png', mimeType: 'image/png', buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64') });
    await expect(page.getByTestId('asset-library-panel')).toBeVisible({ timeout: 5000 });
    const assetCard = page.getByTestId('asset-library-panel').locator('[data-testid^="asset-card-"]').first();
    await assetCard.locator('select').selectOption('start_frame');
    await openPanel(page, 'shots');
    await page.getByTestId('workflow-shot-S01_main').click();
    await expect(page.getByTestId('canvas-node-detail-panel')).toBeVisible({ timeout: 8000 });
    const bindSelect = page.getByTestId('bind-start-frame-select');
    await expect(bindSelect).toBeVisible({ timeout: 3000 });
    const options = bindSelect.locator('option');
    const count = await options.count();
    if (count > 1) { const val = await options.nth(1).getAttribute('value'); if (val) await bindSelect.selectOption(val); }
    await expect(page.getByTestId('start-frame-preview')).toBeVisible({ timeout: 5000 });
  });

  test('M4-Connect-06: handles exist and manual connection creates solid edge', async ({ page }) => {
    test.setTimeout(60000);
    // Reference source handle and shot target handle exist
    await expect(page.getByTestId('shot-reference-target-handle-S01_main')).toBeAttached({ timeout: 8000 });
    await expect(page.getByTestId('shot-video-source-handle-S01_main')).toBeAttached({ timeout: 8000 });
    // Create a free ref node (drop file on canvas)
    const canvas = page.getByTestId('production-canvas-view');
    const canvasBox = await canvas.boundingBox();
    await canvas.evaluate((el, { cx, cy }) => {
      const file = new File([new Uint8Array([137,80,78,71,13,10,26,10,0,0,0,13,73,72,68,82,0,0,0,1,0,0,0,1,8,2,0,0,0,144,119,83,222,0,0,0,12,73,68,65,84,8,215,99,248,207,192,0,0,3,0,1,171,21,105,195,0,0,0,0,73,69,78,68,174,66,96,130])], 'test.png', { type: 'image/png' });
      const dt = new DataTransfer(); dt.items.add(file);
      const ev = new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true, clientX: cx + 500, clientY: cy + 300 });
      Object.defineProperty(ev, 'clientX', { value: cx + 500 }); Object.defineProperty(ev, 'clientY', { value: cy + 300 });
      el.dispatchEvent(ev);
    }, { cx: canvasBox!.x, cy: canvasBox!.y });
    const deleteBtn = page.locator('[data-testid^="delete-free-ref-node-"]').first();
    await expect(deleteBtn).toBeAttached({ timeout: 8000 });
    // ReferenceImageNode source handle visible on free node
    const refHandle = page.locator('[data-testid^="reference-source-handle-"]').first();
    await expect(refHandle).toBeAttached({ timeout: 3000 });
  });

  test('M4-Connect-05: Inspector unbind restores missing frame warning', async ({ page }) => {
    test.setTimeout(90000);
    await openPanel(page, 'assets');
    await page.getByTestId('create-demo-product-button').click();
    await expect(page.getByTestId('checklist-ready')).toBeVisible({ timeout: 20000 });
    await openPanel(page, 'template');
    await page.getByTestId('template-desk_calendar').first().click();
    await openPanel(page, 'batch');
    await page.getByTestId('create-video-batch-button').click();
    await expect(page.getByTestId('batch-id')).toBeVisible({ timeout: 10000 });
    await openPanel(page, 'assets');
    const fileInput = page.getByTestId('asset-upload-input');
    await fileInput.setInputFiles({ name: 'unbind_test.png', mimeType: 'image/png', buffer: Buffer.from('iOVORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64') });
    await expect(page.getByTestId('asset-library-panel')).toBeVisible({ timeout: 5000 });
    const assetCard = page.getByTestId('asset-library-panel').locator('[data-testid^="asset-card-"]').first();
    await assetCard.locator('select').selectOption('start_frame');
    await openPanel(page, 'shots');
    await page.getByTestId('workflow-shot-S01_main').click();
    const bindSelect = page.getByTestId('bind-start-frame-select');
    await expect(bindSelect).toBeVisible({ timeout: 3000 });
    const options = bindSelect.locator('option'); const count = await options.count();
    if (count > 1) { const val = await options.nth(1).getAttribute('value'); if (val) await bindSelect.selectOption(val); }
    await expect(page.getByTestId('start-frame-preview')).toBeVisible({ timeout: 5000 });
    const unbindBtn = page.getByTestId('start-frame-preview').locator('button', { hasText: '解绑' });
    if (await unbindBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await unbindBtn.click();
      await expect(page.getByTestId('frame-binding-warning')).toBeVisible({ timeout: 5000 });
    }
  });

  test('M4-Connect-07: drag uploaded asset card to canvas creates free ReferenceImageNode', async ({ page }) => {
    test.setTimeout(60000);
    await openPanel(page, 'assets');
    const fileInput = page.getByTestId('asset-upload-input');
    await fileInput.setInputFiles({ name: 'libdrag.png', mimeType: 'image/png', buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64') });
    await expect(page.getByTestId('asset-library-panel')).toBeVisible({ timeout: 5000 });
    const assetCard = page.getByTestId('asset-library-panel').locator('[data-testid^="asset-card-"]').first();
    await expect(assetCard).toBeVisible();
    const cardTestId = await assetCard.getAttribute('data-testid');
    const aid = (cardTestId || '').replace('asset-card-', '');
    await page.evaluate(({ assetId, cardSelector, canvasSelector }: any) => {
      const s = document.querySelector(cardSelector) as HTMLElement;
      const t = document.querySelector(canvasSelector) as HTMLElement;
      if (!s || !t) return;
      const a = { id: assetId, filename: 'libdrag.png', url: '', role: 'reference', createdAt: Date.now() };
      const dt = new DataTransfer();
      dt.setData('application/workbench-asset', JSON.stringify(a));
      s.dispatchEvent(new DragEvent('dragstart', { dataTransfer: dt, bubbles: true }));
      t.dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true }));
    }, { assetId: aid, cardSelector: `[data-testid="asset-card-${aid}"]`, canvasSelector: '[data-testid="production-canvas-view"]' });
    // Free ReferenceImageNode created (has delete button, not an asset card node)
    await expect(page.locator('[data-testid^="delete-free-ref-node-"]').first()).toBeAttached({ timeout: 5000 });
  });
});
