import { test, expect } from '@playwright/test';

// Minimal valid 1x1 PNG file bytes — used for simulating image file drops
const MINI_PNG_BYTES = [137,80,78,71,13,10,26,10,0,0,0,13,73,72,68,82,0,0,0,1,0,0,0,1,8,2,0,0,0,144,119,83,222,0,0,0,12,73,68,65,84,8,215,99,248,207,192,0,0,3,0,1,171,21,105,195,0,0,0,0,73,69,78,68,174,66,96,130];

test.describe('MVP-4 10D-2 Image Asset Library', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    const wbBtn = page.getByRole('button', { name: '生产工作台' });
    if (await wbBtn.isVisible({ timeout: 5000 }).catch(() => false)) await wbBtn.click();
    await expect(page.getByTestId('mvp3-workbench')).toBeVisible({ timeout: 10000 });
  });

  test('10D2-01: drop on fixed ref node adds image to asset library', async ({ page }) => {
    test.setTimeout(30000);

    // Drop a PNG file on the S01 reference node
    const refNode = page.getByTestId('reference-image-node-S01_main-0');
    await refNode.evaluate((el, pngBytes) => {
      const file = new File([new Uint8Array(pngBytes)], 'test-lib.png', { type: 'image/png' });
      const dt = new DataTransfer();
      dt.items.add(file);
      el.dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true }));
    }, MINI_PNG_BYTES);

    // Open the assets panel in sidebar to check library
    await page.getByTestId('sidebar-icon-assets').hover();
    await expect(page.getByTestId('workflow-sidebar-expanded')).toBeVisible({ timeout: 5000 });

    // The image library section should now show the dropped image
    await expect(page.getByTestId('sidebar-section-image-library')).toBeAttached({ timeout: 5000 });
    await expect(page.getByTestId('image-asset-library-panel')).toBeVisible({ timeout: 3000 });
  });

  test('10D2-02: node image is replaced after drop', async ({ page }) => {
    test.setTimeout(30000);

    // Drop on S02 reference node
    const refNode = page.getByTestId('reference-image-node-S02_detail1-0');
    await refNode.evaluate((el, pngBytes) => {
      const file = new File([new Uint8Array(pngBytes)], 'replaced.png', { type: 'image/png' });
      const dt = new DataTransfer();
      dt.items.add(file);
      el.dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true }));
    }, MINI_PNG_BYTES);

    // After drop, the node should show the image thumbnail
    await expect(page.getByTestId('reference-image-thumb-S02_detail1-0')).toBeAttached({ timeout: 5000 });
  });

  test('10D2-03: drop on canvas blank area creates a free reference node', async ({ page }) => {
    test.setTimeout(30000);

    // Drop an image on the canvas view area
    const canvas = page.getByTestId('production-canvas-view');
    const canvasBox = await canvas.boundingBox();
    expect(canvasBox).not.toBeNull();

    await canvas.evaluate((el, { pngBytes, cx, cy }) => {
      const file = new File([new Uint8Array(pngBytes)], 'free-node.png', { type: 'image/png' });
      const dt = new DataTransfer();
      dt.items.add(file);
      const dropEvent = new DragEvent('drop', {
        dataTransfer: dt, bubbles: true, cancelable: true,
        clientX: cx + 200, clientY: cy + 200,
      });
      Object.defineProperty(dropEvent, 'clientX', { value: cx + 200 });
      Object.defineProperty(dropEvent, 'clientY', { value: cy + 200 });
      el.dispatchEvent(dropEvent);
    }, { pngBytes: MINI_PNG_BYTES, cx: canvasBox!.x, cy: canvasBox!.y });

    // A free reference node should now exist on the canvas
    // Find it by the "删除" (delete) button which only free nodes have
    const deleteButtons = page.locator('[data-testid^="delete-free-ref-node-"]');
    await expect(deleteButtons.first()).toBeAttached({ timeout: 8000 });
  });

  test('10D2-04: free reference node has no shot connections by default', async ({ page }) => {
    test.setTimeout(30000);

    const canvas = page.getByTestId('production-canvas-view');
    const canvasBox = await canvas.boundingBox();
    expect(canvasBox).not.toBeNull();

    // First, count all reference-image-edge elements (edges from ref nodes to shot nodes)
    const initialEdgeCount = await page.locator('[data-testid^="ref-edge-"]').count();

    // Drop an image on canvas to create a free node
    await canvas.evaluate((el, { pngBytes, cx, cy }) => {
      const file = new File([new Uint8Array(pngBytes)], 'no-conn.png', { type: 'image/png' });
      const dt = new DataTransfer();
      dt.items.add(file);
      const dropEvent = new DragEvent('drop', {
        dataTransfer: dt, bubbles: true, cancelable: true,
        clientX: cx + 250, clientY: cy + 250,
      });
      Object.defineProperty(dropEvent, 'clientX', { value: cx + 250 });
      Object.defineProperty(dropEvent, 'clientY', { value: cy + 250 });
      el.dispatchEvent(dropEvent);
    }, { pngBytes: MINI_PNG_BYTES, cx: canvasBox!.x, cy: canvasBox!.y });

    // Wait for free node to appear
    await expect(page.locator('[data-testid^="delete-free-ref-node-"]').first()).toBeAttached({ timeout: 8000 });

    // Edge count should NOT increase — free nodes are isolated
    const afterEdgeCount = await page.locator('[data-testid^="ref-edge-"]').count();
    expect(afterEdgeCount).toBe(initialEdgeCount);
  });

  test('10D2-05: free reference node can be deleted', async ({ page }) => {
    test.setTimeout(30000);

    const canvas = page.getByTestId('production-canvas-view');
    const canvasBox = await canvas.boundingBox();
    expect(canvasBox).not.toBeNull();

    // Drop on canvas to create a free node
    await canvas.evaluate((el, { pngBytes, cx, cy }) => {
      const file = new File([new Uint8Array(pngBytes)], 'to-delete.png', { type: 'image/png' });
      const dt = new DataTransfer();
      dt.items.add(file);
      const dropEvent = new DragEvent('drop', {
        dataTransfer: dt, bubbles: true, cancelable: true,
        clientX: cx + 300, clientY: cy + 300,
      });
      Object.defineProperty(dropEvent, 'clientX', { value: cx + 300 });
      Object.defineProperty(dropEvent, 'clientY', { value: cy + 300 });
      el.dispatchEvent(dropEvent);
    }, { pngBytes: MINI_PNG_BYTES, cx: canvasBox!.x, cy: canvasBox!.y });

    // Click the delete button on the free node
    const deleteBtn = page.locator('[data-testid^="delete-free-ref-node-"]').first();
    await expect(deleteBtn).toBeAttached({ timeout: 8000 });
    await deleteBtn.click();

    // After deletion, no more delete buttons on the canvas
    await expect(page.locator('[data-testid^="delete-free-ref-node-"]')).toBeHidden({ timeout: 5000 });
  });

  test('10D2-06: after deleting free node, image remains in asset library', async ({ page }) => {
    test.setTimeout(30000);

    const canvas = page.getByTestId('production-canvas-view');
    const canvasBox = await canvas.boundingBox();
    expect(canvasBox).not.toBeNull();

    // Create a free node first
    await canvas.evaluate((el, { pngBytes, cx, cy }) => {
      const file = new File([new Uint8Array(pngBytes)], 'stay-in-lib.png', { type: 'image/png' });
      const dt = new DataTransfer();
      dt.items.add(file);
      const dropEvent = new DragEvent('drop', {
        dataTransfer: dt, bubbles: true, cancelable: true,
        clientX: cx + 350, clientY: cy + 350,
      });
      Object.defineProperty(dropEvent, 'clientX', { value: cx + 350 });
      Object.defineProperty(dropEvent, 'clientY', { value: cy + 350 });
      el.dispatchEvent(dropEvent);
    }, { pngBytes: MINI_PNG_BYTES, cx: canvasBox!.x, cy: canvasBox!.y });

    await expect(page.locator('[data-testid^="delete-free-ref-node-"]').first()).toBeAttached({ timeout: 8000 });

    // Delete it
    await page.locator('[data-testid^="delete-free-ref-node-"]').first().click();

    // Now open assets panel — image library should still have the image
    await page.getByTestId('sidebar-icon-assets').hover();
    await expect(page.getByTestId('workflow-sidebar-expanded')).toBeVisible({ timeout: 5000 });
    await expect(page.getByTestId('image-asset-library-panel')).toBeVisible({ timeout: 3000 });
    // At least one image asset card should still exist
    const cards = page.locator('[data-testid^="image-asset-card-"]');
    await expect(cards.first()).toBeAttached({ timeout: 3000 });
  });

  test('10D2-07: product line switch preserves image library', async ({ page }) => {
    test.setTimeout(30000);

    // Drop an image on S01 ref node to populate library
    const refNode = page.getByTestId('reference-image-node-S01_main-0');
    await refNode.evaluate((el, pngBytes) => {
      const file = new File([new Uint8Array(pngBytes)], 'switch-test.png', { type: 'image/png' });
      const dt = new DataTransfer();
      dt.items.add(file);
      el.dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true }));
    }, MINI_PNG_BYTES);

    // Open assets, verify library has content
    await page.getByTestId('sidebar-icon-assets').hover();
    await expect(page.getByTestId('image-asset-library-panel')).toBeVisible({ timeout: 5000 });
    const beforeCount = await page.locator('[data-testid^="image-asset-card-"]').count();

    // Switch to wall calendar via product line module
    await page.getByTestId('sidebar-icon-productLine').hover();
    await expect(page.getByTestId('product-line-wall-calendar')).toBeVisible({ timeout: 3000 });
    await page.getByTestId('product-line-wall-calendar').click();

    // Go back to assets — library should still have the same count
    await page.getByTestId('sidebar-icon-assets').hover();
    await expect(page.getByTestId('image-asset-library-panel')).toBeVisible({ timeout: 5000 });
    const afterCount = await page.locator('[data-testid^="image-asset-card-"]').count();
    expect(afterCount).toBe(beforeCount);
  });

  test('10D2-08: no confirmation dialog after drop replacement', async ({ page }) => {
    test.setTimeout(30000);

    // Listen for dialog
    page.on('dialog', () => {
      throw new Error('Unexpected dialog appeared');
    });

    // Drop on S03 reference node
    const refNode = page.getByTestId('reference-image-node-S03_detail2-0');
    await refNode.evaluate((el, pngBytes) => {
      const file = new File([new Uint8Array(pngBytes)], 'no-dialog.png', { type: 'image/png' });
      const dt = new DataTransfer();
      dt.items.add(file);
      el.dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true }));
    }, MINI_PNG_BYTES);

    // Should show thumbnail without any dialog
    await expect(page.getByTestId('reference-image-thumb-S03_detail2-0')).toBeAttached({ timeout: 5000 });
    // No re-generate prompt should appear
    await expect(page.locator('text=是否重新生成')).toBeHidden({ timeout: 2000 });
  });
});
