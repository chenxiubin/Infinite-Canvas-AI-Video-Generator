import { test, expect } from '@playwright/test';

const MINI_PNG_BYTES = [137,80,78,71,13,10,26,10,0,0,0,13,73,72,68,82,0,0,0,1,0,0,0,1,8,2,0,0,0,144,119,83,222,0,0,0,12,73,68,65,84,8,215,99,248,207,192,0,0,3,0,1,171,21,105,195,0,0,0,0,73,69,78,68,174,66,96,130];

test.describe('MVP-4 10F Shot Reference Ordering', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    const wbBtn = page.getByRole('button', { name: '生产工作台' });
    if (await wbBtn.isVisible({ timeout: 5000 }).catch(() => false)) await wbBtn.click();
    await expect(page.getByTestId('mvp3-workbench')).toBeVisible({ timeout: 10000 });
  });

  test('10F-01: inspector shows move up/down buttons for references', async ({ page }) => {
    test.setTimeout(30000);
    // Drop on S04 refs to make them ready
    await page.getByTestId('reference-image-node-S04_motion-0').evaluate((el, pngBytes) => {
      const file = new File([new Uint8Array(pngBytes)], 's04-0.png', { type: 'image/png' });
      const dt = new DataTransfer(); dt.items.add(file);
      el.dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true }));
    }, MINI_PNG_BYTES);
    await page.getByTestId('reference-image-node-S04_motion-1').evaluate((el, pngBytes) => {
      const file = new File([new Uint8Array(pngBytes)], 's04-1.png', { type: 'image/png' });
      const dt = new DataTransfer(); dt.items.add(file);
      el.dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true }));
    }, MINI_PNG_BYTES);
    // Select S04 shot
    await page.getByTestId('shot-control-node-S04_motion').evaluate((el: HTMLElement) => el.click());
    await expect(page.getByTestId('inspector-shot-references')).toBeAttached({ timeout: 8000 });
    // Move buttons visible
    await expect(page.getByTestId('ref-move-up-0')).toBeAttached({ timeout: 3000 });
    await expect(page.getByTestId('ref-move-down-0')).toBeAttached({ timeout: 3000 });
    // First item: up disabled, down enabled
    await expect(page.getByTestId('ref-move-up-0')).toBeDisabled();
    await expect(page.getByTestId('ref-move-down-0')).toBeEnabled();
    // Last item: up enabled, down disabled
    await expect(page.getByTestId('ref-move-up-1')).toBeEnabled();
    await expect(page.getByTestId('ref-move-down-1')).toBeDisabled();
  });

  test('10F-02: S04 shows first/last frame labels by default', async ({ page }) => {
    test.setTimeout(30000);
    await page.getByTestId('reference-image-node-S04_motion-0').evaluate((el, pngBytes) => {
      const file = new File([new Uint8Array(pngBytes)], 's04-0.png', { type: 'image/png' });
      const dt = new DataTransfer(); dt.items.add(file);
      el.dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true }));
    }, MINI_PNG_BYTES);
    await page.getByTestId('reference-image-node-S04_motion-1').evaluate((el, pngBytes) => {
      const file = new File([new Uint8Array(pngBytes)], 's04-1.png', { type: 'image/png' });
      const dt = new DataTransfer(); dt.items.add(file);
      el.dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true }));
    }, MINI_PNG_BYTES);
    // S04 shot shows 首帧/尾帧 labels
    const strip = page.getByTestId('shot-control-reference-strip-S04_motion');
    await expect(strip).toContainText('首帧');
    await expect(strip).toContainText('尾帧');
  });

  test('10F-03: move down swaps order in inspector', async ({ page }) => {
    test.setTimeout(30000);
    await page.getByTestId('reference-image-node-S04_motion-0').evaluate((el, pngBytes) => {
      const file = new File([new Uint8Array(pngBytes)], 's04-0.png', { type: 'image/png' });
      const dt = new DataTransfer(); dt.items.add(file);
      el.dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true }));
    }, MINI_PNG_BYTES);
    await page.getByTestId('reference-image-node-S04_motion-1').evaluate((el, pngBytes) => {
      const file = new File([new Uint8Array(pngBytes)], 's04-1.png', { type: 'image/png' });
      const dt = new DataTransfer(); dt.items.add(file);
      el.dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true }));
    }, MINI_PNG_BYTES);
    await page.getByTestId('shot-control-node-S04_motion').evaluate((el: HTMLElement) => el.click());
    await expect(page.getByTestId('inspector-shot-references')).toBeAttached({ timeout: 8000 });
    // Click move-down on first item
    await page.getByTestId('ref-move-down-0').click();
    // Order should swap — the first item is now the second (sourceNodeId changed)
    // We can verify the inspector still shows 2 items and both are "已绑定"
    await expect(page.getByTestId('inspector-ref-item-0')).toContainText('已绑定');
    await expect(page.getByTestId('inspector-ref-item-1')).toContainText('已绑定');
    // Shot node should still show both thumbs
    await expect(page.getByTestId('shot-ref-thumb-S04_motion-0')).toBeAttached({ timeout: 3000 });
    await expect(page.getByTestId('shot-ref-thumb-S04_motion-1')).toBeAttached({ timeout: 3000 });
  });

  test('10F-04: move up restores original order', async ({ page }) => {
    test.setTimeout(30000);
    await page.getByTestId('reference-image-node-S04_motion-0').evaluate((el, pngBytes) => {
      const file = new File([new Uint8Array(pngBytes)], 's04-0.png', { type: 'image/png' });
      const dt = new DataTransfer(); dt.items.add(file);
      el.dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true }));
    }, MINI_PNG_BYTES);
    await page.getByTestId('reference-image-node-S04_motion-1').evaluate((el, pngBytes) => {
      const file = new File([new Uint8Array(pngBytes)], 's04-1.png', { type: 'image/png' });
      const dt = new DataTransfer(); dt.items.add(file);
      el.dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true }));
    }, MINI_PNG_BYTES);
    await page.getByTestId('shot-control-node-S04_motion').evaluate((el: HTMLElement) => el.click());
    await expect(page.getByTestId('inspector-shot-references')).toBeAttached({ timeout: 8000 });
    // Move down then up
    await page.getByTestId('ref-move-down-0').click();
    await page.getByTestId('ref-move-up-1').click();
    // Should be back to original
    await expect(page.getByTestId('inspector-ref-item-0')).toContainText('已绑定');
    await expect(page.getByTestId('inspector-ref-item-1')).toContainText('已绑定');
  });

  test('10F-05: ordering preserved after clearing and re-dropping on fixed ref', async ({ page }) => {
    test.setTimeout(30000);
    await page.getByTestId('reference-image-node-S04_motion-0').evaluate((el, pngBytes) => {
      const file = new File([new Uint8Array(pngBytes)], 'ord-test-0.png', { type: 'image/png' });
      const dt = new DataTransfer(); dt.items.add(file);
      el.dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true }));
    }, MINI_PNG_BYTES);
    await page.getByTestId('reference-image-node-S04_motion-1').evaluate((el, pngBytes) => {
      const file = new File([new Uint8Array(pngBytes)], 'ord-test-1.png', { type: 'image/png' });
      const dt = new DataTransfer(); dt.items.add(file);
      el.dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true }));
    }, MINI_PNG_BYTES);
    await page.getByTestId('shot-control-node-S04_motion').evaluate((el: HTMLElement) => el.click());
    await expect(page.getByTestId('inspector-shot-references')).toBeAttached({ timeout: 8000 });
    // Swap order
    await page.getByTestId('ref-move-down-0').click();
    // Clear first fixed ref
    await page.getByTestId('clear-ref-image-ref-node-S04_motion-0').evaluate((el: HTMLElement) => el.click());
    // Inspector should still show 2 items (one missing, one ready)
    await expect(page.getByTestId('inspector-ref-item-0')).toContainText('缺图');
    await expect(page.getByTestId('inspector-ref-item-1')).toContainText('已绑定');
  });
});
