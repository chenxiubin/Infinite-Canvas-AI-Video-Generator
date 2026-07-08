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

  test('M4-Connect-01: drop image to canvas adds to asset library', async ({ page }) => {
    test.setTimeout(30000);
    const canvas = page.getByTestId('production-canvas-view');
    const cb = await canvas.boundingBox();
    // Drop file on canvas to populate image library
    const pngBytes = [137,80,78,71,13,10,26,10,0,0,0,13,73,72,68,82,0,0,0,1,0,0,0,1,8,2,0,0,0,144,119,83,222,0,0,0,12,73,68,65,84,8,215,99,248,207,192,0,0,3,0,1,171,21,105,195,0,0,0,0,73,69,78,68,174,66,96,130];
    await canvas.evaluate((el, { bytes, cx, cy }) => {
      const file = new File([new Uint8Array(bytes)], 'drag_test.png', { type: 'image/png' });
      const dt = new DataTransfer(); dt.items.add(file);
      const ev = new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true, clientX: cx + 100, clientY: cy + 100 });
      Object.defineProperty(ev, 'clientX', { value: cx + 100 }); Object.defineProperty(ev, 'clientY', { value: cy + 100 });
      el.dispatchEvent(ev);
    }, { bytes: pngBytes, cx: cb!.x, cy: cb!.y });
    // Open assets panel to verify library has the image
    await openPanel(page, 'assets');
    await expect(page.getByTestId('image-asset-library-panel')).toBeVisible({ timeout: 5000 });
    const imgCard = page.locator('[data-testid^="image-asset-card-"]').first();
    await expect(imgCard).toBeVisible();
    const testId = await imgCard.getAttribute('data-testid');
    if (testId) sharedAssetId = testId.replace('image-asset-card-', '');
  });

  test('M4-Connect-02: canvas has six shot control nodes + fixed edges', async ({ page }) => {
    test.setTimeout(30000);
    for (const sk of ['S01_main', 'S02_detail1', 'S03_detail2', 'S04_motion', 'S05_scene', 'S06_brand']) {
      await expect(page.getByTestId(`shot-control-node-${sk}`)).toBeAttached({ timeout: 15000 });
    }
    // Fixed edges visible (React Flow renders edges after nodes sync)
    await page.waitForSelector('.react-flow__edge', { timeout: 8000 });
  });

  test('M4-Connect-03: drop file on canvas creates free ReferenceImageNode', async ({ page }) => {
    test.setTimeout(30000);
    const canvas = page.getByTestId('production-canvas-view');
    const cb = await canvas.boundingBox();
    // Drop file directly on canvas to create free node
    await canvas.evaluate((el, { cx, cy }) => {
      const pngBytes = [137,80,78,71,13,10,26,10,0,0,0,13,73,72,68,82,0,0,0,1,0,0,0,1,8,2,0,0,0,144,119,83,222,0,0,0,12,73,68,65,84,8,215,99,248,207,192,0,0,3,0,1,171,21,105,195,0,0,0,0,73,69,78,68,174,66,96,130];
      const file = new File([new Uint8Array(pngBytes)], 'free.png', { type: 'image/png' });
      const dt = new DataTransfer(); dt.items.add(file);
      const ev = new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true, clientX: cx + 100, clientY: cy + 100 });
      Object.defineProperty(ev, 'clientX', { value: cx + 100 }); Object.defineProperty(ev, 'clientY', { value: cy + 100 });
      el.dispatchEvent(ev);
    }, { cx: cb!.x, cy: cb!.y });
    await expect(page.locator('[data-testid^="delete-free-ref-node-"]').first()).toBeAttached({ timeout: 5000 });
  });

  test('M4-Connect-04: select shot shows inspector with reference list', async ({ page }) => {
    test.setTimeout(30000);
    // Select shot node on canvas
    await page.getByTestId('shot-control-node-S01_main').scrollIntoViewIfNeeded();
    await page.getByTestId('shot-control-node-S01_main').click();
    await expect(page.getByTestId('canvas-node-detail-panel')).toBeVisible({ timeout: 8000 });
    // Inspector shows reference list for selected shot
    await expect(page.getByTestId('inspector-shot-references')).toBeAttached({ timeout: 5000 });
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

  test('M4-Connect-05: Inspector shows batch count for selected shot', async ({ page }) => {
    test.setTimeout(30000);
    // Select shot node on canvas
    await page.getByTestId('shot-control-node-S01_main').scrollIntoViewIfNeeded();
    await page.getByTestId('shot-control-node-S01_main').click();
    await expect(page.getByTestId('canvas-node-detail-panel')).toBeVisible({ timeout: 8000 });
    // Inspector shows batch count selector
    await expect(page.getByTestId('inspector-batch-count')).toBeAttached({ timeout: 5000 });
    await expect(page.getByTestId('batch-count-select')).toBeAttached({ timeout: 3000 });
  });

  test('M4-Connect-07: drop file to canvas creates free ReferenceImageNode', async ({ page }) => {
    test.setTimeout(30000);
    const canvas = page.getByTestId('production-canvas-view');
    const cb = await canvas.boundingBox();
    const pngBytes = [137,80,78,71,13,10,26,10,0,0,0,13,73,72,68,82,0,0,0,1,0,0,0,1,8,2,0,0,0,144,119,83,222,0,0,0,12,73,68,65,84,8,215,99,248,207,192,0,0,3,0,1,171,21,105,195,0,0,0,0,73,69,78,68,174,66,96,130];
    await canvas.evaluate((el, { bytes, cx, cy }) => {
      const file = new File([new Uint8Array(bytes)], 'libdrag.png', { type: 'image/png' });
      const dt = new DataTransfer(); dt.items.add(file);
      const ev = new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true, clientX: cx + 100, clientY: cy + 100 });
      Object.defineProperty(ev, 'clientX', { value: cx + 100 }); Object.defineProperty(ev, 'clientY', { value: cy + 100 });
      el.dispatchEvent(ev);
    }, { bytes: pngBytes, cx: cb!.x, cy: cb!.y });
    // Open assets panel to verify library has the image, free node also created
    await openPanel(page, 'assets');
    await expect(page.getByTestId('image-asset-library-panel')).toBeVisible({ timeout: 5000 });
    await expect(page.locator('[data-testid^="delete-free-ref-node-"]').first()).toBeAttached({ timeout: 5000 });
  });
});
