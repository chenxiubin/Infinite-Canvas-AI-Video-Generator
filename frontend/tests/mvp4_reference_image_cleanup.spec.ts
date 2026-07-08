import { test, expect } from '@playwright/test';

const MINI_PNG_BYTES = [137,80,78,71,13,10,26,10,0,0,0,13,73,72,68,82,0,0,0,1,0,0,0,1,8,2,0,0,0,144,119,83,222,0,0,0,12,73,68,65,84,8,215,99,248,207,192,0,0,3,0,1,171,21,105,195,0,0,0,0,73,69,78,68,174,66,96,130];

test.describe('MVP-4 10D-4 Reference Image Cleanup', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    const wbBtn = page.getByRole('button', { name: '生产工作台' });
    if (await wbBtn.isVisible({ timeout: 5000 }).catch(() => false)) await wbBtn.click();
    await expect(page.getByTestId('mvp3-workbench')).toBeVisible({ timeout: 10000 });
  });

  // ── Fixed node clear ──

  test('10D4-01: clear image button visible on fixed ref node with image', async ({ page }) => {
    test.setTimeout(30000);
    // Drop image on S01 ref node
    const refNode = page.getByTestId('reference-image-node-S01_main-0');
    await refNode.evaluate((el, pngBytes) => {
      const file = new File([new Uint8Array(pngBytes)], 'clear-test.png', { type: 'image/png' });
      const dt = new DataTransfer(); dt.items.add(file);
      el.dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true }));
    }, MINI_PNG_BYTES);
    // Clear button appears
    await expect(page.getByTestId('clear-ref-image-ref-node-S01_main-0')).toBeAttached({ timeout: 5000 });
  });

  test('10D4-02: clear fixed ref image restores placeholder', async ({ page }) => {
    test.setTimeout(30000);
    const refNode = page.getByTestId('reference-image-node-S01_main-0');
    // Drop image
    await refNode.evaluate((el, pngBytes) => {
      const file = new File([new Uint8Array(pngBytes)], 'clear-restore.png', { type: 'image/png' });
      const dt = new DataTransfer(); dt.items.add(file);
      el.dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true }));
    }, MINI_PNG_BYTES);
    await expect(page.getByTestId('reference-image-thumb-S01_main-0')).toBeAttached({ timeout: 5000 });
    // Click clear
    await page.getByTestId('clear-ref-image-ref-node-S01_main-0').click();
    // Placeholder restored, thumb gone
    await expect(page.getByTestId('reference-image-thumb-S01_main-0')).toBeHidden({ timeout: 5000 });
    await expect(page.getByTestId('reference-image-placeholder-S01_main-0')).toBeAttached({ timeout: 3000 });
  });

  test('10D4-03: after clear, fixed ref node and edges still exist', async ({ page }) => {
    test.setTimeout(30000);
    // Drop and clear
    const refNode = page.getByTestId('reference-image-node-S01_main-0');
    await refNode.evaluate((el, pngBytes) => {
      const file = new File([new Uint8Array(pngBytes)], 'clear-edges.png', { type: 'image/png' });
      const dt = new DataTransfer(); dt.items.add(file);
      el.dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true }));
    }, MINI_PNG_BYTES);
    await page.getByTestId('clear-ref-image-ref-node-S01_main-0').click();
    // Node still exists
    await expect(page.getByTestId('reference-image-node-S01_main-0')).toBeAttached({ timeout: 3000 });
    // Fixed edges still exist
    await expect(page.locator('.react-flow__edge').first()).toBeAttached({ timeout: 5000 });
  });

  test('10D4-04: after clear, image library still has the image', async ({ page }) => {
    test.setTimeout(30000);
    const refNode = page.getByTestId('reference-image-node-S01_main-0');
    await refNode.evaluate((el, pngBytes) => {
      const file = new File([new Uint8Array(pngBytes)], 'clear-lib.png', { type: 'image/png' });
      const dt = new DataTransfer(); dt.items.add(file);
      el.dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true }));
    }, MINI_PNG_BYTES);
    // Check library has 1 entry
    await page.getByTestId('sidebar-icon-assets').hover();
    await expect(page.getByTestId('image-asset-library-panel')).toBeVisible({ timeout: 5000 });
    const c1 = await page.locator('[data-testid^="image-asset-card-"]').count();
    // Clear (use evaluate for reliable click — button may be overlapped by side panels)
    await page.getByTestId('clear-ref-image-ref-node-S01_main-0').evaluate((el: HTMLElement) => el.click());
    // Library still has the image
    await page.getByTestId('sidebar-icon-assets').hover();
    await expect(page.getByTestId('image-asset-library-panel')).toBeVisible({ timeout: 5000 });
    const c2 = await page.locator('[data-testid^="image-asset-card-"]').count();
    expect(c2).toBe(c1);
  });

  // ── Free node delete ──

  test('10D4-05: delete free ref node removes node, keeps library image', async ({ page }) => {
    test.setTimeout(30000);
    const canvas = page.getByTestId('production-canvas-view');
    const canvasBox = await canvas.boundingBox();
    // Drop on canvas → free node created
    await canvas.evaluate((el, { pngBytes, cx, cy }) => {
      const file = new File([new Uint8Array(pngBytes)], 'free-delete.png', { type: 'image/png' });
      const dt = new DataTransfer(); dt.items.add(file);
      const ev = new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true, clientX: cx + 100, clientY: cy + 100 });
      Object.defineProperty(ev, 'clientX', { value: cx + 100 }); Object.defineProperty(ev, 'clientY', { value: cy + 100 });
      el.dispatchEvent(ev);
    }, { pngBytes: MINI_PNG_BYTES, cx: canvasBox!.x, cy: canvasBox!.y });
    const delBtn = page.locator('[data-testid^="delete-free-ref-node-"]').first();
    await expect(delBtn).toBeAttached({ timeout: 8000 });
    // Check library
    await page.getByTestId('sidebar-icon-assets').hover();
    await expect(page.getByTestId('image-asset-library-panel')).toBeVisible({ timeout: 5000 });
    const c1 = await page.locator('[data-testid^="image-asset-card-"]').count();
    // Delete free node
    await delBtn.click();
    await expect(page.locator('[data-testid^="delete-free-ref-node-"]')).toBeHidden({ timeout: 5000 });
    // Library image still there
    await page.getByTestId('sidebar-icon-assets').hover();
    await expect(page.getByTestId('image-asset-library-panel')).toBeVisible({ timeout: 5000 });
    const c2 = await page.locator('[data-testid^="image-asset-card-"]').count();
    expect(c2).toBe(c1);
  });

  test('10D4-06: same asset two free nodes, delete one, other still shows image', async ({ page }) => {
    test.setTimeout(30000);
    const canvas = page.getByTestId('production-canvas-view');
    const canvasBox = await canvas.boundingBox();
    // Drop twice
    for (let i = 0; i < 2; i++) {
      await canvas.evaluate((el, { pngBytes, cx, cy, offset }) => {
        const file = new File([new Uint8Array(pngBytes)], 'multi-free.png', { type: 'image/png' });
        const dt = new DataTransfer(); dt.items.add(file);
        const ev = new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true, clientX: cx + 100 + offset, clientY: cy + 100 + offset });
        Object.defineProperty(ev, 'clientX', { value: cx + 100 + offset }); Object.defineProperty(ev, 'clientY', { value: cy + 100 + offset });
        el.dispatchEvent(ev);
      }, { pngBytes: MINI_PNG_BYTES, cx: canvasBox!.x, cy: canvasBox!.y, offset: i * 50 });
    }
    const delBtns = page.locator('[data-testid^="delete-free-ref-node-"]');
    await expect(delBtns.first()).toBeAttached({ timeout: 8000 });
    expect(await delBtns.count()).toBeGreaterThanOrEqual(2);
    // Delete first (use evaluate — button may be overlapped)
    await delBtns.first().evaluate((el: HTMLElement) => el.click());
    // Other still exists
    await expect(page.locator('[data-testid^="delete-free-ref-node-"]').first()).toBeAttached({ timeout: 3000 });
    // Library still has only 1 entry (dedup)
    await page.getByTestId('sidebar-icon-assets').hover();
    await expect(page.getByTestId('image-asset-library-panel')).toBeVisible({ timeout: 5000 });
    const libCount = await page.locator('[data-testid^="image-asset-card-"]').count();
    expect(libCount).toBe(1);
  });

  // ── Clear all ──

  test('10D4-07: clear all fixed ref images restores all placeholders', async ({ page }) => {
    test.setTimeout(30000);
    // Drop images on S01 and S02 ref nodes
    for (const sk of ['S01_main', 'S02_detail1']) {
      const nodeId = `reference-image-node-${sk}-0`;
      await page.getByTestId(nodeId).evaluate((el, { pngBytes, fname }) => {
        const file = new File([new Uint8Array(pngBytes)], fname, { type: 'image/png' });
        const dt = new DataTransfer(); dt.items.add(file);
        el.dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true }));
      }, { pngBytes: MINI_PNG_BYTES, fname: `clearall-${sk}.png` });
    }
    // Open assets and click clear-all
    await page.getByTestId('sidebar-icon-assets').hover();
    await expect(page.getByTestId('clear-all-fixed-ref-images')).toBeVisible({ timeout: 3000 });
    await page.getByTestId('clear-all-fixed-ref-images').click();
    // Both nodes back to placeholder
    await expect(page.getByTestId('reference-image-thumb-S01_main-0')).toBeHidden({ timeout: 5000 });
    await expect(page.getByTestId('reference-image-thumb-S02_detail1-0')).toBeHidden({ timeout: 5000 });
    // Both nodes still exist
    await expect(page.getByTestId('reference-image-node-S01_main-0')).toBeAttached({ timeout: 3000 });
    await expect(page.getByTestId('reference-image-node-S02_detail1-0')).toBeAttached({ timeout: 3000 });
    // Image library retained
    const libCount = await page.locator('[data-testid^="image-asset-card-"]').count();
    expect(libCount).toBeGreaterThanOrEqual(1);
  });

  test('10D4-08: clear all does not affect free nodes', async ({ page }) => {
    test.setTimeout(30000);
    // Create a free node on canvas
    const canvas = page.getByTestId('production-canvas-view');
    const canvasBox = await canvas.boundingBox();
    await canvas.evaluate((el, { pngBytes, cx, cy }) => {
      const file = new File([new Uint8Array(pngBytes)], 'free-stay.png', { type: 'image/png' });
      const dt = new DataTransfer(); dt.items.add(file);
      const ev = new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true, clientX: cx + 100, clientY: cy + 100 });
      Object.defineProperty(ev, 'clientX', { value: cx + 100 }); Object.defineProperty(ev, 'clientY', { value: cy + 100 });
      el.dispatchEvent(ev);
    }, { pngBytes: MINI_PNG_BYTES, cx: canvasBox!.x, cy: canvasBox!.y });
    // Also drop on S01 ref node
    await page.getByTestId('reference-image-node-S01_main-0').evaluate((el, pngBytes) => {
      const file = new File([new Uint8Array(pngBytes)], 'fixed-stay.png', { type: 'image/png' });
      const dt = new DataTransfer(); dt.items.add(file);
      el.dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true }));
    }, MINI_PNG_BYTES);
    // Clear all
    // Clear-all button is in the top header toolbar, always visible
    await page.getByTestId('clear-all-fixed-ref-images').click();
    // Fixed node cleared
    await expect(page.getByTestId('reference-image-thumb-S01_main-0')).toBeHidden({ timeout: 5000 });
    // Free node still has delete button (= still exists with image)
    await expect(page.locator('[data-testid^="delete-free-ref-node-"]').first()).toBeAttached({ timeout: 3000 });
  });

  test('10D4-09: after clear all, fixed edges still exist', async ({ page }) => {
    test.setTimeout(30000);
    await page.getByTestId('reference-image-node-S01_main-0').evaluate((el, pngBytes) => {
      const file = new File([new Uint8Array(pngBytes)], 'edges-stay.png', { type: 'image/png' });
      const dt = new DataTransfer(); dt.items.add(file);
      el.dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true }));
    }, MINI_PNG_BYTES);
    await page.waitForSelector('.react-flow__edge', { timeout: 5000 });
    const edgeCount = await page.locator('.react-flow__edge').count();
    // Clear-all button is in the top header toolbar, always visible
    await page.getByTestId('clear-all-fixed-ref-images').click();
    const afterCount = await page.locator('.react-flow__edge').count();
    expect(afterCount).toBeGreaterThanOrEqual(edgeCount);
  });

  test('10D4-10: fixed ref node has no delete button, only clear button', async ({ page }) => {
    test.setTimeout(30000);
    await page.getByTestId('reference-image-node-S01_main-0').evaluate((el, pngBytes) => {
      const file = new File([new Uint8Array(pngBytes)], 'no-delete-fixed.png', { type: 'image/png' });
      const dt = new DataTransfer(); dt.items.add(file);
      el.dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true }));
    }, MINI_PNG_BYTES);
    await expect(page.getByTestId('clear-ref-image-ref-node-S01_main-0')).toBeAttached({ timeout: 5000 });
    // Delete button should NOT exist for fixed node
    await expect(page.getByTestId('delete-free-ref-node-ref-node-S01_main-0')).toBeHidden({ timeout: 2000 });
  });

  // ── Broken image regression ──

  test('10D4-11: after clearing fixed ref, library thumbnail is not broken', async ({ page }) => {
    test.setTimeout(30000);
    // Drop on S01 ref node to populate library
    await page.getByTestId('reference-image-node-S01_main-0').evaluate((el, pngBytes) => {
      const file = new File([new Uint8Array(pngBytes)], 'lib-keep.png', { type: 'image/png' });
      const dt = new DataTransfer(); dt.items.add(file);
      el.dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true }));
    }, MINI_PNG_BYTES);
    // Clear the ref node
    await page.getByTestId('clear-ref-image-ref-node-S01_main-0').evaluate((el: HTMLElement) => el.click());
    // Library thumbnail should still have a valid image (not broken)
    await page.getByTestId('sidebar-icon-assets').hover();
    await expect(page.getByTestId('image-asset-library-panel')).toBeVisible({ timeout: 5000 });
    const thumb = page.locator('[data-testid^="image-asset-card-"] img').first();
    await expect(thumb).toBeVisible({ timeout: 3000 });
    const naturalWidth = await thumb.evaluate((el: HTMLImageElement) => el.naturalWidth);
    expect(naturalWidth).toBeGreaterThan(0);
  });

  test('10D4-12: after clearing fixed ref, drag from library still shows valid image', async ({ page }) => {
    test.setTimeout(30000);
    await page.getByTestId('reference-image-node-S01_main-0').evaluate((el, pngBytes) => {
      const file = new File([new Uint8Array(pngBytes)], 'redrag.png', { type: 'image/png' });
      const dt = new DataTransfer(); dt.items.add(file);
      el.dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true }));
    }, MINI_PNG_BYTES);
    await page.getByTestId('clear-ref-image-ref-node-S01_main-0').evaluate((el: HTMLElement) => el.click());
    // Drag from library to canvas
    await page.getByTestId('sidebar-icon-assets').hover();
    await expect(page.getByTestId('image-asset-library-panel')).toBeVisible({ timeout: 5000 });
    const cardId = (await page.locator('[data-testid^="image-asset-card-"]').first().getAttribute('data-testid') || '').replace('image-asset-card-', '');
    const canvas = page.getByTestId('production-canvas-view');
    const cb = await canvas.boundingBox();
    await canvas.evaluate((el, { assetId, cx, cy }: any) => {
      const dt = new DataTransfer();
      dt.setData('application/workbench-image-asset', JSON.stringify({ assetId }));
      const ev = new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true, clientX: cx + 300, clientY: cy + 300 });
      Object.defineProperty(ev, 'clientX', { value: cx + 300 }); Object.defineProperty(ev, 'clientY', { value: cy + 300 });
      el.dispatchEvent(ev);
    }, { assetId: cardId, cx: cb!.x, cy: cb!.y });
    await expect(page.locator('[data-testid^="delete-free-ref-node-"]').first()).toBeAttached({ timeout: 8000 });
    // Free node image should load
    const thumb = page.locator('[data-testid^="reference-image-thumb-"]').first();
    const naturalWidth = await thumb.evaluate((el: HTMLImageElement) => el.naturalWidth);
    expect(naturalWidth).toBeGreaterThan(0);
  });

  test('10D4-13: after clear-all, library thumbnails are not broken', async ({ page }) => {
    test.setTimeout(30000);
    // Drop on S01 and S02
    for (const sk of ['S01_main', 'S02_detail1']) {
      const nodeId = `reference-image-node-${sk}-0`;
      await page.getByTestId(nodeId).evaluate((el, { pngBytes, fname }) => {
        const file = new File([new Uint8Array(pngBytes)], fname, { type: 'image/png' });
        const dt = new DataTransfer(); dt.items.add(file);
        el.dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true }));
      }, { pngBytes: MINI_PNG_BYTES, fname: `keep-${sk}.png` });
    }
    // Clear all
    // Clear-all button is in the top header toolbar, always visible
    await page.getByTestId('clear-all-fixed-ref-images').click();
    // All library thumbs still valid
    await page.getByTestId('sidebar-icon-assets').hover();
    await expect(page.getByTestId('image-asset-library-panel')).toBeVisible({ timeout: 5000 });
    const thumbs = page.locator('[data-testid^="image-asset-card-"] img');
    const count = await thumbs.count();
    for (let i = 0; i < count; i++) {
      const nw = await thumbs.nth(i).evaluate((el: HTMLImageElement) => el.naturalWidth);
      expect(nw).toBeGreaterThan(0);
    }
  });

  test('10D4-14: free nodes from different sources have consistent delete UI', async ({ page }) => {
    test.setTimeout(30000);
    // Create free node via canvas drop
    const canvas = page.getByTestId('production-canvas-view');
    const cb = await canvas.boundingBox();
    await canvas.evaluate((el, { pngBytes, cx, cy }) => {
      const file = new File([new Uint8Array(pngBytes)], 'drop-ui.png', { type: 'image/png' });
      const dt = new DataTransfer(); dt.items.add(file);
      const ev = new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true, clientX: cx + 100, clientY: cy + 100 });
      Object.defineProperty(ev, 'clientX', { value: cx + 100 }); Object.defineProperty(ev, 'clientY', { value: cy + 100 });
      el.dispatchEvent(ev);
    }, { pngBytes: MINI_PNG_BYTES, cx: cb!.x, cy: cb!.y });
    await expect(page.locator('[data-testid^="delete-free-ref-node-"]').first()).toBeAttached({ timeout: 8000 });
    // All delete buttons should have consistent text "删除" (not "清空图片")
    const delBtns = page.locator('[data-testid^="delete-free-ref-node-"]');
    const txt = await delBtns.first().textContent();
    expect(txt?.trim()).toBe('删除节点');
    // Fixed nodes should have "清空图片" not "删除"
    // (already tested in 10D4-10)
  });
});
