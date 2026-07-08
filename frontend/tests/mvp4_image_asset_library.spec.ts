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

  // ── 10D-3 Dedup tests ──

  test('10D3-dedup-01: same file dropped twice adds only one library entry', async ({ page }) => {
    test.setTimeout(30000);
    // Drop on S01 ref node
    const refNode = page.getByTestId('reference-image-node-S01_main-0');
    await refNode.evaluate((el, pngBytes) => {
      const file = new File([new Uint8Array(pngBytes)], 'dedup-same.png', { type: 'image/png' });
      const dt = new DataTransfer(); dt.items.add(file);
      el.dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true }));
    }, MINI_PNG_BYTES);
    // Check library count
    await page.getByTestId('sidebar-icon-assets').hover();
    await expect(page.getByTestId('image-asset-library-panel')).toBeVisible({ timeout: 5000 });
    const firstCount = await page.locator('[data-testid^="image-asset-card-"]').count();
    // Drop same file again on S02 ref node
    await page.getByTestId('sidebar-icon-assets').hover(); // close/reopen
    const refNode2 = page.getByTestId('reference-image-node-S02_detail1-0');
    await refNode2.evaluate((el, pngBytes) => {
      const file = new File([new Uint8Array(pngBytes)], 'dedup-same.png', { type: 'image/png' });
      const dt = new DataTransfer(); dt.items.add(file);
      el.dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true }));
    }, MINI_PNG_BYTES);
    // Library count should remain the same
    await page.getByTestId('sidebar-icon-assets').hover();
    await expect(page.getByTestId('image-asset-library-panel')).toBeVisible({ timeout: 5000 });
    const secondCount = await page.locator('[data-testid^="image-asset-card-"]').count();
    expect(secondCount).toBe(firstCount);
  });

  test('10D3-dedup-02: same file dropped to canvas twice adds only one library entry, both nodes show image', async ({ page }) => {
    test.setTimeout(30000);
    const canvas = page.getByTestId('production-canvas-view');
    const canvasBox = await canvas.boundingBox();
    expect(canvasBox).not.toBeNull();
    // Drop once
    await canvas.evaluate((el, { pngBytes, cx, cy }) => {
      const file = new File([new Uint8Array(pngBytes)], 'canvas-dup.png', { type: 'image/png' });
      const dt = new DataTransfer(); dt.items.add(file);
      const ev = new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true, clientX: cx + 100, clientY: cy + 100 });
      Object.defineProperty(ev, 'clientX', { value: cx + 100 }); Object.defineProperty(ev, 'clientY', { value: cy + 100 });
      el.dispatchEvent(ev);
    }, { pngBytes: MINI_PNG_BYTES, cx: canvasBox!.x, cy: canvasBox!.y });
    await page.getByTestId('sidebar-icon-assets').hover();
    await expect(page.getByTestId('image-asset-library-panel')).toBeVisible({ timeout: 5000 });
    const c1 = await page.locator('[data-testid^="image-asset-card-"]').count();
    // Drop same again
    await canvas.evaluate((el, { pngBytes, cx, cy }) => {
      const file = new File([new Uint8Array(pngBytes)], 'canvas-dup.png', { type: 'image/png' });
      const dt = new DataTransfer(); dt.items.add(file);
      const ev = new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true, clientX: cx + 200, clientY: cy + 200 });
      Object.defineProperty(ev, 'clientX', { value: cx + 200 }); Object.defineProperty(ev, 'clientY', { value: cy + 200 });
      el.dispatchEvent(ev);
    }, { pngBytes: MINI_PNG_BYTES, cx: canvasBox!.x, cy: canvasBox!.y });
    await page.getByTestId('sidebar-icon-assets').hover();
    await expect(page.getByTestId('image-asset-library-panel')).toBeVisible({ timeout: 5000 });
    const c2 = await page.locator('[data-testid^="image-asset-card-"]').count();
    expect(c2).toBe(c1);
    // Two free nodes should exist (different ids)
    const freeNodes = page.locator('[data-testid^="delete-free-ref-node-"]');
    await expect(freeNodes.first()).toBeAttached({ timeout: 5000 });
    expect(await freeNodes.count()).toBeGreaterThanOrEqual(2);
    // Both nodes should have valid images (not broken)
    const thumbs = page.locator('[data-testid^="reference-image-thumb-"]');
    const thumbCount = await thumbs.count();
    expect(thumbCount).toBeGreaterThanOrEqual(2);
  });

  test('10D3-dedup-04: drag same asset from library twice creates two free nodes with visible images', async ({ page }) => {
    test.setTimeout(30000);
    const canvas = page.getByTestId('production-canvas-view');
    const canvasBox = await canvas.boundingBox();
    expect(canvasBox).not.toBeNull();
    // First, drop a file on canvas — this populates the mock image lib (ImageAsset)
    await canvas.evaluate((el, { pngBytes, cx, cy }) => {
      const file = new File([new Uint8Array(pngBytes)], 'libdrag.png', { type: 'image/png' });
      const dt = new DataTransfer(); dt.items.add(file);
      const ev = new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true, clientX: cx + 100, clientY: cy + 100 });
      Object.defineProperty(ev, 'clientX', { value: cx + 100 }); Object.defineProperty(ev, 'clientY', { value: cy + 100 });
      el.dispatchEvent(ev);
    }, { pngBytes: MINI_PNG_BYTES, cx: canvasBox!.x, cy: canvasBox!.y });
    // Now drag the image-asset card from library to canvas twice
    await page.getByTestId('sidebar-icon-assets').hover();
    await expect(page.getByTestId('image-asset-library-panel')).toBeVisible({ timeout: 5000 });
    const imgCard = page.locator('[data-testid^="image-asset-card-"]').first();
    await expect(imgCard).toBeVisible({ timeout: 5000 });
    const cardId = (await imgCard.getAttribute('data-testid') || '').replace('image-asset-card-', '');
    // Drag 1
    await canvas.evaluate((el, { assetId, cx, cy }) => {
      const dt = new DataTransfer();
      dt.setData('application/workbench-image-asset', JSON.stringify({ assetId }));
      const ev = new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true, clientX: cx + 300, clientY: cy + 300 });
      Object.defineProperty(ev, 'clientX', { value: cx + 300 }); Object.defineProperty(ev, 'clientY', { value: cy + 300 });
      el.dispatchEvent(ev);
    }, { assetId: cardId, cx: canvasBox!.x, cy: canvasBox!.y });
    // Drag 2
    await canvas.evaluate((el, { assetId, cx, cy }) => {
      const dt = new DataTransfer();
      dt.setData('application/workbench-image-asset', JSON.stringify({ assetId }));
      const ev = new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true, clientX: cx + 300, clientY: cy + 500 });
      Object.defineProperty(ev, 'clientX', { value: cx + 300 }); Object.defineProperty(ev, 'clientY', { value: cy + 500 });
      el.dispatchEvent(ev);
    }, { assetId: cardId, cx: canvasBox!.x, cy: canvasBox!.y });
    // Two free nodes
    const freeNodes = page.locator('[data-testid^="delete-free-ref-node-"]');
    await expect(freeNodes.first()).toBeAttached({ timeout: 8000 });
    expect(await freeNodes.count()).toBeGreaterThanOrEqual(3); // 1 from initial drop + 2 from library drags
    // Library count = 1 (only the original canvas drop)
    await page.getByTestId('sidebar-icon-assets').hover();
    await expect(page.getByTestId('image-asset-library-panel')).toBeVisible({ timeout: 5000 });
    const libCount = await page.locator('[data-testid^="image-asset-card-"]').count();
    expect(libCount).toBe(1);
    // Free node images should load (thumbnails visible)
    const thumbs = page.locator('[data-testid^="reference-image-thumb-"]');
    expect(await thumbs.count()).toBeGreaterThanOrEqual(2);
  });

  test('10D3-dedup-03: different name same content adds new entry', async ({ page }) => {
    test.setTimeout(30000);
    const canvas = page.getByTestId('production-canvas-view');
    const canvasBox = await canvas.boundingBox();
    await canvas.evaluate((el, { pngBytes, cx, cy }) => {
      const file = new File([new Uint8Array(pngBytes)], 'diff-a.png', { type: 'image/png' });
      const dt = new DataTransfer(); dt.items.add(file);
      const ev = new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true, clientX: cx + 300, clientY: cy + 300 });
      Object.defineProperty(ev, 'clientX', { value: cx + 300 }); Object.defineProperty(ev, 'clientY', { value: cy + 300 });
      el.dispatchEvent(ev);
    }, { pngBytes: MINI_PNG_BYTES, cx: canvasBox!.x, cy: canvasBox!.y });
    await page.getByTestId('sidebar-icon-assets').hover();
    await expect(page.getByTestId('image-asset-library-panel')).toBeVisible({ timeout: 5000 });
    const c1 = await page.locator('[data-testid^="image-asset-card-"]').count();
    await canvas.evaluate((el, { pngBytes, cx, cy }) => {
      const file = new File([new Uint8Array(pngBytes)], 'diff-b.png', { type: 'image/png' });
      const dt = new DataTransfer(); dt.items.add(file);
      const ev = new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true, clientX: cx + 400, clientY: cy + 400 });
      Object.defineProperty(ev, 'clientX', { value: cx + 400 }); Object.defineProperty(ev, 'clientY', { value: cy + 400 });
      el.dispatchEvent(ev);
    }, { pngBytes: MINI_PNG_BYTES, cx: canvasBox!.x, cy: canvasBox!.y });
    await page.getByTestId('sidebar-icon-assets').hover();
    await expect(page.getByTestId('image-asset-library-panel')).toBeVisible({ timeout: 5000 });
    const c2 = await page.locator('[data-testid^="image-asset-card-"]').count();
    expect(c2).toBe(c1 + 1);
  });

  // ── Library asset drop on reference node ──

  test('10D4-drop-01: drop library asset on empty fixed ref node replaces image', async ({ page }) => {
    test.setTimeout(30000);
    const canvas = page.getByTestId('production-canvas-view');
    const cb = await canvas.boundingBox();
    // First populate library by dropping a file on canvas
    await canvas.evaluate((el, { pngBytes, cx, cy }) => {
      const file = new File([new Uint8Array(pngBytes)], 'lib-node.png', { type: 'image/png' });
      const dt = new DataTransfer(); dt.items.add(file);
      const ev = new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true, clientX: cx + 100, clientY: cy + 100 });
      Object.defineProperty(ev, 'clientX', { value: cx + 100 }); Object.defineProperty(ev, 'clientY', { value: cy + 100 });
      el.dispatchEvent(ev);
    }, { pngBytes: MINI_PNG_BYTES, cx: cb!.x, cy: cb!.y });
    // Get the library asset card id
    await page.getByTestId('sidebar-icon-assets').hover();
    await expect(page.getByTestId('image-asset-library-panel')).toBeVisible({ timeout: 5000 });
    const cardId = (await page.locator('[data-testid^="image-asset-card-"]').first().getAttribute('data-testid') || '').replace('image-asset-card-', '');
    // Now drop on S03 reference node (which is empty) using assetId
    const refNode = page.getByTestId('reference-image-node-S03_detail2-0');
    const refBox = await refNode.boundingBox();
    await canvas.evaluate((el, { assetId, rx, ry }: any) => {
      const dt = new DataTransfer();
      dt.setData('application/workbench-image-asset', JSON.stringify({ assetId }));
      const ev = new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true, clientX: rx + 30, clientY: ry + 30 });
      Object.defineProperty(ev, 'clientX', { value: rx + 30 }); Object.defineProperty(ev, 'clientY', { value: ry + 30 });
      el.dispatchEvent(ev);
    }, { assetId: cardId, rx: refBox!.x, ry: refBox!.y });
    // S03 ref node should now show the image
    await expect(page.getByTestId('reference-image-thumb-S03_detail2-0')).toBeAttached({ timeout: 5000 });
    // Library count unchanged
    await page.getByTestId('sidebar-icon-assets').hover();
    await expect(page.getByTestId('image-asset-library-panel')).toBeVisible({ timeout: 5000 });
    const libCount = await page.locator('[data-testid^="image-asset-card-"]').count();
    expect(libCount).toBe(1);
  });

  test('10D4-drop-02: drop library asset on filled fixed ref node replaces image', async ({ page }) => {
    test.setTimeout(30000);
    // Fill S01 with a file drop, then create library entry, then replace with library asset
    await page.getByTestId('reference-image-node-S01_main-0').evaluate((el, pngBytes) => {
      const file = new File([new Uint8Array(pngBytes)], 'old.png', { type: 'image/png' });
      const dt = new DataTransfer(); dt.items.add(file);
      el.dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true }));
    }, MINI_PNG_BYTES);
    // Create another canvas drop to get a different library entry
    const canvas = page.getByTestId('production-canvas-view');
    const cb = await canvas.boundingBox();
    await canvas.evaluate((el, { pngBytes, cx, cy }) => {
      const file = new File([new Uint8Array(pngBytes)], 'new-lib.png', { type: 'image/png' });
      const dt = new DataTransfer(); dt.items.add(file);
      const ev = new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true, clientX: cx + 200, clientY: cy + 200 });
      Object.defineProperty(ev, 'clientX', { value: cx + 200 }); Object.defineProperty(ev, 'clientY', { value: cy + 200 });
      el.dispatchEvent(ev);
    }, { pngBytes: MINI_PNG_BYTES, cx: cb!.x, cy: cb!.y });
    await page.getByTestId('sidebar-icon-assets').hover();
    await expect(page.getByTestId('image-asset-library-panel')).toBeVisible({ timeout: 5000 });
    const cards = page.locator('[data-testid^="image-asset-card-"]');
    const cardId = (await cards.last().getAttribute('data-testid') || '').replace('image-asset-card-', '');
    // Drop the new library asset on S01 ref node
    const refNode = page.getByTestId('reference-image-node-S01_main-0');
    const refBox = await refNode.boundingBox();
    await canvas.evaluate((el, { assetId, rx, ry }: any) => {
      const dt = new DataTransfer();
      dt.setData('application/workbench-image-asset', JSON.stringify({ assetId }));
      const ev = new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true, clientX: rx + 30, clientY: ry + 30 });
      Object.defineProperty(ev, 'clientX', { value: rx + 30 }); Object.defineProperty(ev, 'clientY', { value: ry + 30 });
      el.dispatchEvent(ev);
    }, { assetId: cardId, rx: refBox!.x, ry: refBox!.y });
    // S01 ref still has a thumb (replaced, not removed)
    await expect(page.getByTestId('reference-image-thumb-S01_main-0')).toBeAttached({ timeout: 5000 });
    // Library count = 2 (two different files)
    const libCount = await page.locator('[data-testid^="image-asset-card-"]').count();
    expect(libCount).toBe(2);
  });
});
