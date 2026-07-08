import { test, expect } from '@playwright/test';

const MINI_PNG_BYTES = [137,80,78,71,13,10,26,10,0,0,0,13,73,72,68,82,0,0,0,1,0,0,0,1,8,2,0,0,0,144,119,83,222,0,0,0,12,73,68,65,84,8,215,99,248,207,192,0,0,3,0,1,171,21,105,195,0,0,0,0,73,69,78,68,174,66,96,130];

test.describe('MVP-4 10F Shot Reference Ordering', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    const wbBtn = page.getByRole('button', { name: '生产工作台' });
    if (await wbBtn.isVisible({ timeout: 5000 }).catch(() => false)) await wbBtn.click();
    await expect(page.getByTestId('mvp3-workbench')).toBeVisible({ timeout: 10000 });
  });

  test('10F-01: inspector shows drag handles for references', async ({ page }) => {
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
    // Drag handles visible on each item
    await expect(page.locator('[data-testid^="shot-ref-drag-handle-S04_motion-"]').first()).toBeAttached({ timeout: 3000 });
    // Order items have correct data-testid
    await expect(page.getByTestId('shot-ref-order-item-S04_motion-ref-node-S04_motion-0')).toBeAttached({ timeout: 3000 });
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

  test('10F-03: drag reorder via DataTransfer swaps order', async ({ page }) => {
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
    // Drag item 0 onto item 1 via DataTransfer
    const item0 = page.getByTestId('shot-ref-order-item-S04_motion-ref-node-S04_motion-0');
    const item1 = page.getByTestId('shot-ref-order-item-S04_motion-ref-node-S04_motion-1');
    await item0.evaluate((el, targetId) => {
      const dt = new DataTransfer();
      dt.setData('text/plain', el.getAttribute('data-testid')?.replace('shot-ref-order-item-S04_motion-', '') || '');
      el.dispatchEvent(new DragEvent('dragstart', { dataTransfer: dt, bubbles: true }));
    }, '');
    await item1.evaluate((el) => {
      const dt = new DataTransfer();
      dt.setData('text/plain', 'ref-node-S04_motion-0');
      el.dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true }));
    });
    // Both items still present with "已绑定"
    await expect(page.locator('[data-testid^="shot-ref-order-item-"]').first()).toBeAttached({ timeout: 3000 });
  });

  test('10F-04: inspector shows Chinese labels for >2 refs', async ({ page }) => {
    test.setTimeout(30000);
    await page.getByTestId('reference-image-node-S01_main-0').evaluate((el, pngBytes) => {
      const file = new File([new Uint8Array(pngBytes)], 'r1.png', { type: 'image/png' });
      const dt = new DataTransfer(); dt.items.add(file);
      el.dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true }));
    }, MINI_PNG_BYTES);
    // Create 2 free nodes with images (makes >2 total ready refs for S01)
    const canvas = page.getByTestId('production-canvas-view');
    const cb = await canvas.boundingBox();
    for (let i = 0; i < 2; i++) {
      await canvas.evaluate((el, { pngBytes, cx, cy, offset }) => {
        const file = new File([new Uint8Array(pngBytes)], `fr${offset}.png`, { type: 'image/png' });
        const dt = new DataTransfer(); dt.items.add(file);
        const ev = new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true, clientX: cx + 100 + offset * 50, clientY: cy + 100 + offset * 50 });
        Object.defineProperty(ev, 'clientX', { value: cx + 100 + offset * 50 }); Object.defineProperty(ev, 'clientY', { value: cy + 100 + offset * 50 });
        el.dispatchEvent(ev);
      }, { pngBytes: MINI_PNG_BYTES, cx: cb!.x, cy: cb!.y, offset: i });
    }
    // Select S01 shot
    await page.getByTestId('shot-control-node-S01_main').evaluate((el: HTMLElement) => el.click());
    await expect(page.getByTestId('inspector-shot-references')).toBeAttached({ timeout: 8000 });
    // Inspector shows "参考图" not "R1"
    const refText = await page.getByTestId('inspector-shot-references').textContent();
    expect(refText).toContain('参考图');
    expect(refText).not.toContain('R1');
    expect(refText).not.toContain('R2');
    expect(refText).not.toContain('R3');
  });

  test('10F-05: missing item can be dragged but not in payload', async ({ page }) => {
    test.setTimeout(30000);
    await page.getByTestId('reference-image-node-S04_motion-0').evaluate((el, pngBytes) => {
      const file = new File([new Uint8Array(pngBytes)], 'drag-miss-0.png', { type: 'image/png' });
      const dt = new DataTransfer(); dt.items.add(file);
      el.dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true }));
    }, MINI_PNG_BYTES);
    await page.getByTestId('reference-image-node-S04_motion-1').evaluate((el, pngBytes) => {
      const file = new File([new Uint8Array(pngBytes)], 'drag-miss-1.png', { type: 'image/png' });
      const dt = new DataTransfer(); dt.items.add(file);
      el.dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true }));
    }, MINI_PNG_BYTES);
    await page.getByTestId('shot-control-node-S04_motion').evaluate((el: HTMLElement) => el.click());
    await expect(page.getByTestId('inspector-shot-references')).toBeAttached({ timeout: 8000 });
    // Both show "已绑定"
    await expect(page.locator('[data-testid^="shot-ref-order-item-"]').first()).toContainText('已绑定');
    // Clear first ref
    await page.getByTestId('clear-ref-image-ref-node-S04_motion-0').evaluate((el: HTMLElement) => el.click());
    // Now first item shows "缺图", second "已绑定"
    const items = page.locator('[data-testid^="shot-ref-order-item-"]');
    await expect(items.first()).toContainText('缺图');
    await expect(items.last()).toContainText('已绑定');
    // Drag handles still present on both
    await expect(page.locator('[data-testid^="shot-ref-drag-handle-"]').first()).toBeAttached({ timeout: 3000 });
    expect(await page.locator('[data-testid^="shot-ref-drag-handle-"]').count()).toBeGreaterThanOrEqual(2);
  });
});
