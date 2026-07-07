import { test, expect } from '@playwright/test';

// Minimal valid 1x1 PNG file bytes — used for simulating image file drops
const MINI_PNG_BYTES = [137,80,78,71,13,10,26,10,0,0,0,13,73,72,68,82,0,0,0,1,0,0,0,1,8,2,0,0,0,144,119,83,222,0,0,0,12,73,68,65,84,8,215,99,248,207,192,0,0,3,0,1,171,21,105,195,0,0,0,0,73,69,78,68,174,66,96,130];

test.describe('MVP-4 10D-1 Reference Image Node Input', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    const wbBtn = page.getByRole('button', { name: '生产工作台' });
    if (await wbBtn.isVisible({ timeout: 5000 }).catch(() => false)) await wbBtn.click();
    await expect(page.getByTestId('mvp3-workbench')).toBeVisible({ timeout: 10000 });
  });

  test('10D1-01: empty reference image node is visible with placeholder', async ({ page }) => {
    test.setTimeout(30000);

    // Empty reference node is visible on the canvas
    const refNode = page.getByTestId('reference-image-node-S01_main-0');
    await expect(refNode).toBeAttached({ timeout: 10000 });
    await expect(refNode).toBeVisible({ timeout: 5000 });

    // Placeholder shows the label and hint text
    await expect(page.getByTestId('reference-image-label-S01_main-0')).toContainText('首帧参考');
    // Placeholder hints are visible in the empty state
    await expect(refNode).toContainText('拖入参考图');
  });

  test('10D1-02: hover reference image node does NOT open Inspector', async ({ page }) => {
    test.setTimeout(30000);

    // Verify Inspector is in collapsed state initially
    const inspectorCollapsedOrEmpty = page.locator(
      '[data-testid="inspector-collapsed"], [data-testid="inspector-empty-state"]'
    );
    await expect(inspectorCollapsedOrEmpty.first()).toBeAttached({ timeout: 10000 });

    // Hover over the reference image node
    await page.getByTestId('reference-image-node-S01_main-0').hover();

    // Inspector must NOT expand on hover
    const inspectorExpanded = page.locator('[data-testid="inspector-expanded"]');
    await expect(inspectorExpanded).toBeHidden({ timeout: 3000 });

    // Collapsed/empty state should still be visible
    await expect(inspectorCollapsedOrEmpty.first()).toBeAttached({ timeout: 3000 });
  });

  test('10D1-03: click reference image node does NOT open Inspector (only shot control nodes do)', async ({ page }) => {
    test.setTimeout(30000);

    // Click the reference image node
    await page.getByTestId('reference-image-node-S01_main-0').click();

    // Inspector should remain collapsed (ref nodes don't trigger Inspector)
    const inspectorExpanded = page.locator('[data-testid="inspector-expanded"]');
    await expect(inspectorExpanded).toBeHidden({ timeout: 5000 });
  });

  test('10D1-04: image drag-over shows visual feedback on empty reference node', async ({ page }) => {
    test.setTimeout(30000);

    const refNode = page.getByTestId('reference-image-node-S01_main-0');

    // Create a fake image file transfer via dataTransfer
    await refNode.evaluate((el) => {
      const dt = new DataTransfer();
      // Add a fake .png file entry
      const file = new File(['dummy'], 'test.png', { type: 'image/png' });
      dt.items.add(file);
      el.dispatchEvent(new DragEvent('dragenter', { dataTransfer: dt, bubbles: true, cancelable: true }));
    });

    // After dragenter with image, the node should show the "释放以替换" text
    await expect(refNode).toContainText('释放以替换');
  });

  test('10D1-05: non-image drag-over does NOT show valid visual feedback', async ({ page }) => {
    test.setTimeout(30000);

    const refNode = page.getByTestId('reference-image-node-S01_main-0');

    // Simulate drag with a non-image file
    await refNode.evaluate((el) => {
      const dt = new DataTransfer();
      const file = new File(['dummy'], 'test.txt', { type: 'text/plain' });
      dt.items.add(file);
      el.dispatchEvent(new DragEvent('dragenter', { dataTransfer: dt, bubbles: true, cancelable: true }));
    });

    // Should NOT show the "释放以替换" text for non-image files
    await expect(refNode).not.toContainText('释放以替换');
    // Placeholder should still be present
    await expect(page.getByTestId('reference-image-label-S01_main-0')).toBeAttached({ timeout: 3000 });
  });

  test('10D1-06: drop image file replaces placeholder with image', async ({ page }) => {
    test.setTimeout(30000);

    const refNode = page.getByTestId('reference-image-node-S01_main-0');

    // Simulate drop of a valid PNG file via page.evaluate
    await refNode.evaluate((el, pngBytes) => {
      const file = new File([new Uint8Array(pngBytes)], 'test-ref.png', { type: 'image/png' });
      const dt = new DataTransfer();
      dt.items.add(file);
      el.dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true }));
    }, MINI_PNG_BYTES);

    // After drop, the node should show the image thumbnail
    await expect(page.getByTestId('reference-image-thumb-S01_main-0')).toBeAttached({ timeout: 5000 });
  });

  test('10D1-07: after drop replacement, shot control node still exists', async ({ page }) => {
    test.setTimeout(30000);

    const refNode = page.getByTestId('reference-image-node-S02_detail1-0');

    await refNode.evaluate((el, pngBytes) => {
      const file = new File([new Uint8Array(pngBytes)], 'test-s02.png', { type: 'image/png' });
      const dt = new DataTransfer();
      dt.items.add(file);
      el.dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true }));
    }, MINI_PNG_BYTES);

    // Shot control node must still be present with its testid
    await expect(page.getByTestId('shot-control-node-S02_detail1')).toBeAttached({ timeout: 5000 });
  });

  test('10D1-08: after drop replacement, fixed video result node is NOT cleared', async ({ page }) => {
    test.setTimeout(30000);

    const refNode = page.getByTestId('reference-image-node-S03_detail2-0');

    await refNode.evaluate((el, pngBytes) => {
      const file = new File([new Uint8Array(pngBytes)], 'test-s03.png', { type: 'image/png' });
      const dt = new DataTransfer();
      dt.items.add(file);
      el.dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true }));
    }, MINI_PNG_BYTES);

    // Fixed video result node must still be present
    await expect(page.getByTestId('fixed-video-node-S03_detail2')).toBeAttached({ timeout: 5000 });
  });
});
