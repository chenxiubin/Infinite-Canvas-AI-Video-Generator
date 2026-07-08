import { test, expect } from '@playwright/test';

test.describe('MVP-4 10G Product Line Switching', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    const wbBtn = page.getByRole('button', { name: '生产工作台' });
    if (await wbBtn.isVisible({ timeout: 5000 }).catch(() => false)) await wbBtn.click();
    await expect(page.getByTestId('mvp3-workbench')).toBeVisible({ timeout: 10000 });
  });

  test('10G-01: default desk has 6 shots', async ({ page }) => {
    test.setTimeout(30000);
    for (const sk of ['S01_main', 'S02_detail1', 'S03_detail2', 'S04_motion', 'S05_scene', 'S06_brand']) {
      await expect(page.getByTestId(`shot-control-node-${sk}`)).toBeAttached({ timeout: 10000 });
    }
  });

  test('10G-02: switch to wall shows 7 shots', async ({ page }) => {
    test.setTimeout(30000);
    await page.getByTestId('sidebar-icon-productLine').hover();
    await expect(page.getByTestId('workflow-sidebar-expanded')).toBeVisible({ timeout: 5000 });
    await page.getByTestId('product-line-wall-calendar').click();
    for (const sk of ['W01_main', 'W02_hanging', 'W03_detail1', 'W04_detail2', 'W05_scene', 'W06_size', 'W07_brand']) {
      await expect(page.getByTestId(`shot-control-node-${sk}`)).toBeAttached({ timeout: 10000 });
    }
    await expect(page.getByTestId('shot-control-node-S01_main')).toBeHidden({ timeout: 5000 });
  });

  test('10G-03: switch back to desk', async ({ page }) => {
    test.setTimeout(30000);
    await page.getByTestId('sidebar-icon-productLine').hover();
    await page.getByTestId('product-line-wall-calendar').click();
    await page.getByTestId('sidebar-icon-productLine').hover();
    await page.getByTestId('product-line-desk-calendar').click();
    await expect(page.getByTestId('shot-control-node-S01_main')).toBeAttached({ timeout: 10000 });
  });

  test('10G-04: image assets preserved', async ({ page }) => {
    test.setTimeout(30000);
    const pngBytes = [137,80,78,71,13,10,26,10,0,0,0,13,73,72,68,82,0,0,0,1,0,0,0,1,8,2,0,0,0,144,119,83,222,0,0,0,12,73,68,65,84,8,215,99,248,207,192,0,0,3,0,1,171,21,105,195,0,0,0,0,73,69,78,68,174,66,96,130];
    await page.getByTestId('reference-image-node-S01_main-0').evaluate((el, bytes) => {
      const file = new File([new Uint8Array(bytes)], 'switch.png', { type: 'image/png' });
      const dt = new DataTransfer(); dt.items.add(file);
      el.dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true }));
    }, pngBytes);
    await page.getByTestId('sidebar-icon-assets').hover();
    await expect(page.getByTestId('image-asset-library-panel')).toBeVisible({ timeout: 5000 });
    const c1 = await page.locator('[data-testid^="image-asset-card-"]').count();
    await page.getByTestId('sidebar-icon-productLine').hover();
    await page.getByTestId('product-line-wall-calendar').click();
    await page.getByTestId('sidebar-icon-assets').hover();
    await expect(page.getByTestId('image-asset-library-panel')).toBeVisible({ timeout: 5000 });
    const c2 = await page.locator('[data-testid^="image-asset-card-"]').count();
    expect(c2).toBe(c1);
  });

  test('10G-05: free ref nodes preserved', async ({ page }) => {
    test.setTimeout(30000);
    const canvas = page.getByTestId('production-canvas-view');
    const cb = await canvas.boundingBox();
    const pngBytes = [137,80,78,71,13,10,26,10,0,0,0,13,73,72,68,82,0,0,0,1,0,0,0,1,8,2,0,0,0,144,119,83,222,0,0,0,12,73,68,65,84,8,215,99,248,207,192,0,0,3,0,1,171,21,105,195,0,0,0,0,73,69,78,68,174,66,96,130];
    await canvas.evaluate((el, { bytes, cx, cy }) => {
      const file = new File([new Uint8Array(bytes)], 'free.png', { type: 'image/png' });
      const dt = new DataTransfer(); dt.items.add(file);
      const ev = new DragEvent('drop', { dataTransfer: dt, bubbles: true, clientX: cx + 100, clientY: cy + 100 });
      Object.defineProperty(ev, 'clientX', { value: cx + 100 }); Object.defineProperty(ev, 'clientY', { value: cy + 100 });
      el.dispatchEvent(ev);
    }, { bytes: pngBytes, cx: cb!.x, cy: cb!.y });
    await expect(page.locator('[data-testid^="delete-free-ref-node-"]').first()).toBeAttached({ timeout: 8000 });
    const fc = await page.locator('[data-testid^="delete-free-ref-node-"]').count();
    await page.getByTestId('sidebar-icon-productLine').hover();
    await page.getByTestId('product-line-wall-calendar').click();
    expect(await page.locator('[data-testid^="delete-free-ref-node-"]').count()).toBe(fc);
  });
});
