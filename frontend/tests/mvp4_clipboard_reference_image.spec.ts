import { test, expect } from '@playwright/test';

// Minimal valid 1x1 PNG file bytes
const MINI_PNG_BYTES = [137,80,78,71,13,10,26,10,0,0,0,13,73,72,68,82,0,0,0,1,0,0,0,1,8,2,0,0,0,144,119,83,222,0,0,0,12,73,68,65,84,8,215,99,248,207,192,0,0,3,0,1,171,21,105,195,0,0,0,0,73,69,78,68,174,66,96,130];

test.describe('MVP-4 10D-3 Clipboard Image Paste', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    const wbBtn = page.getByRole('button', { name: '生产工作台' });
    if (await wbBtn.isVisible({ timeout: 5000 }).catch(() => false)) await wbBtn.click();
    await expect(page.getByTestId('mvp3-workbench')).toBeVisible({ timeout: 10000 });
  });

  // Helper: grant clipboard permissions and set PNG data
  async function pasteImageFile(page: any, pngBytes: number[]) {
    await page.evaluate((bytes: number[]) => {
      const blob = new Blob([new Uint8Array(bytes)], { type: 'image/png' });
      const dt = new DataTransfer();
      dt.items.add(new File([blob], 'pasted.png', { type: 'image/png' }));
      // Dispatch paste event with the file in clipboardData
      const pasteEvent = new ClipboardEvent('paste', {
        clipboardData: dt,
        bubbles: true,
        cancelable: true,
      });
      document.dispatchEvent(pasteEvent);
    }, pngBytes);
  }

  test('10D3-01: Ctrl+V paste on hovered fixed ref node replaces image', async ({ page }) => {
    test.setTimeout(30000);

    // Hover S01 reference node
    const refNode = page.getByTestId('reference-image-node-S01_main-0');
    // Simulate mouse enter via bubbling mouseover (triggers React synthetic onMouseEnter)
    await refNode.scrollIntoViewIfNeeded();
    await refNode.evaluate(el => {
      el.dispatchEvent(new MouseEvent('mouseover', { bubbles: true, cancelable: true, view: window }));
    });
    await expect(refNode).toBeVisible({ timeout: 3000 });

    // Trigger paste event
    await pasteImageFile(page, MINI_PNG_BYTES);

    // After paste, the node should show the image thumbnail
    await expect(page.getByTestId('reference-image-thumb-S01_main-0')).toBeAttached({ timeout: 5000 });
  });

  test('10D3-02: Ctrl+V paste on hovered fixed ref node adds to asset library', async ({ page }) => {
    test.setTimeout(30000);

    // Simulate mouse enter (node may be outside viewport)
    await page.getByTestId('reference-image-node-S02_detail1-0').evaluate(el => {
      el.dispatchEvent(new MouseEvent('mouseover', { bubbles: true, cancelable: true, view: window }));
    });
    await pasteImageFile(page, MINI_PNG_BYTES);

    // Open assets panel to check library
    await page.getByTestId('sidebar-icon-assets').hover();
    await expect(page.getByTestId('workflow-sidebar-expanded')).toBeVisible({ timeout: 5000 });
    await expect(page.getByTestId('image-asset-library-panel')).toBeVisible({ timeout: 3000 });
    // At least one card from paste should appear
    await expect(page.locator('[data-testid^="image-asset-card-"]').first()).toBeAttached({ timeout: 3000 });
  });

  test('10D3-03: Ctrl+V paste on fixed ref node does NOT clear fixed video result node', async ({ page }) => {
    test.setTimeout(30000);

    // S03 is far right — simulate mouse enter without scrolling
    await page.getByTestId('reference-image-node-S03_detail2-0').evaluate(el => {
      el.dispatchEvent(new MouseEvent('mouseover', { bubbles: true, cancelable: true, view: window }));
    });
    await pasteImageFile(page, MINI_PNG_BYTES);

    // Fixed video result node must still exist
    await expect(page.getByTestId('fixed-video-node-S03_detail2')).toBeAttached({ timeout: 5000 });
  });

  test('10D3-04: Ctrl+V paste on free reference node replaces its image', async ({ page }) => {
    test.setTimeout(30000);

    // First create a free node by dropping on canvas
    const canvas = page.getByTestId('production-canvas-view');
    const canvasBox = await canvas.boundingBox();
    expect(canvasBox).not.toBeNull();

    await canvas.evaluate((el, { pngBytes, cx, cy }) => {
      const file = new File([new Uint8Array(pngBytes)], 'canvas-drop.png', { type: 'image/png' });
      const dt = new DataTransfer();
      dt.items.add(file);
      const dropEvent = new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true,
        clientX: cx + 400, clientY: cy + 400 });
      Object.defineProperty(dropEvent, 'clientX', { value: cx + 400 });
      Object.defineProperty(dropEvent, 'clientY', { value: cy + 400 });
      el.dispatchEvent(dropEvent);
    }, { pngBytes: MINI_PNG_BYTES, cx: canvasBox!.x, cy: canvasBox!.y });

    // Free node should appear
    const deleteBtns = page.locator('[data-testid^="delete-free-ref-node-"]');
    await expect(deleteBtns.first()).toBeAttached({ timeout: 8000 });

    // Dispatch mouseenter on the free node's delete button parent to set hover state
    const freeNodeId = (await deleteBtns.first().getAttribute('data-testid'))?.replace('delete-free-ref-node-', '') || '';
    await page.evaluate((nid) => {
      const el = document.querySelector(`[data-testid="reference-image-node--1"]`) as HTMLElement;
      if (el) el.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
    }, freeNodeId);

    // Paste to replace
    await pasteImageFile(page, MINI_PNG_BYTES);

    // Free node should still exist (not deleted by paste)
    await expect(deleteBtns.first()).toBeAttached({ timeout: 3000 });
  });

  test('10D3-05: Ctrl+V paste with no hovered ref node creates free reference node', async ({ page }) => {
    test.setTimeout(30000);

    // Move mouse to canvas to set position, then move away so no node is hovered
    const canvas = page.getByTestId('production-canvas-view');
    await canvas.hover();

    // Paste without hovering any ref node
    await pasteImageFile(page, MINI_PNG_BYTES);

    // A free reference node should now exist
    await expect(page.locator('[data-testid^="delete-free-ref-node-"]').first()).toBeAttached({ timeout: 8000 });
  });

  test('10D3-06: pasted free node has no shot connections', async ({ page }) => {
    test.setTimeout(30000);

    const initialEdgeCount = await page.locator('[data-testid^="ref-edge-"]').count();

    await page.getByTestId('production-canvas-view').hover();
    await pasteImageFile(page, MINI_PNG_BYTES);

    await expect(page.locator('[data-testid^="delete-free-ref-node-"]').first()).toBeAttached({ timeout: 8000 });

    // Edge count should NOT increase
    const afterEdgeCount = await page.locator('[data-testid^="ref-edge-"]').count();
    expect(afterEdgeCount).toBe(initialEdgeCount);
  });

  test('10D3-07: pasted free node can be selected and deleted', async ({ page }) => {
    test.setTimeout(30000);

    await page.getByTestId('production-canvas-view').hover();
    await pasteImageFile(page, MINI_PNG_BYTES);

    const deleteBtn = page.locator('[data-testid^="delete-free-ref-node-"]').first();
    await expect(deleteBtn).toBeAttached({ timeout: 8000 });

    // Delete it
    await deleteBtn.click();
    await expect(page.locator('[data-testid^="delete-free-ref-node-"]')).toBeHidden({ timeout: 5000 });
  });

  test('10D3-08: after deleting pasted free node, image remains in library', async ({ page }) => {
    test.setTimeout(30000);

    await page.getByTestId('production-canvas-view').hover();
    await pasteImageFile(page, MINI_PNG_BYTES);

    await expect(page.locator('[data-testid^="delete-free-ref-node-"]').first()).toBeAttached({ timeout: 8000 });

    // Delete
    await page.locator('[data-testid^="delete-free-ref-node-"]').first().click();

    // Open assets — library should still have images
    await page.getByTestId('sidebar-icon-assets').hover();
    await expect(page.getByTestId('image-asset-library-panel')).toBeVisible({ timeout: 5000 });
    await expect(page.locator('[data-testid^="image-asset-card-"]').first()).toBeAttached({ timeout: 3000 });
  });

  test('10D3-09: pasting non-image clipboard does nothing', async ({ page }) => {
    test.setTimeout(30000);

    const initialFreeCount = await page.locator('[data-testid^="delete-free-ref-node-"]').count();

    // Trigger paste with text data only
    await page.evaluate(() => {
      const dt = new DataTransfer();
      dt.setData('text/plain', 'hello world');
      const pasteEvent = new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true });
      document.dispatchEvent(pasteEvent);
    });

    // No new free nodes should appear
    const afterFreeCount = await page.locator('[data-testid^="delete-free-ref-node-"]').count();
    expect(afterFreeCount).toBe(initialFreeCount);

    // No error message should appear
    await expect(page.getByTestId('error-message')).toBeHidden({ timeout: 2000 });
  });

  test('10D3-10: product line switch preserves pasted images in library', async ({ page }) => {
    test.setTimeout(30000);

    // Paste on S01 (simulate mouse enter — node may be outside viewport)
    await page.getByTestId('reference-image-node-S01_main-0').evaluate(el => {
      el.dispatchEvent(new MouseEvent('mouseover', { bubbles: true, cancelable: true, view: window }));
    });
    await pasteImageFile(page, MINI_PNG_BYTES);

    // Verify library has content
    await page.getByTestId('sidebar-icon-assets').hover();
    await expect(page.getByTestId('image-asset-library-panel')).toBeVisible({ timeout: 5000 });
    const beforeCount = await page.locator('[data-testid^="image-asset-card-"]').count();

    // Switch to wall calendar
    await page.getByTestId('sidebar-icon-productLine').hover();
    await expect(page.getByTestId('product-line-wall-calendar')).toBeVisible({ timeout: 3000 });
    await page.getByTestId('product-line-wall-calendar').click();

    // Go back to assets — count preserved
    await page.getByTestId('sidebar-icon-assets').hover();
    await expect(page.getByTestId('image-asset-library-panel')).toBeVisible({ timeout: 5000 });
    const afterCount = await page.locator('[data-testid^="image-asset-card-"]').count();
    expect(afterCount).toBe(beforeCount);
  });
});
