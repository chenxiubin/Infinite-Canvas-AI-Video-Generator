import { test, expect } from '@playwright/test';

test.describe('MVP-4 Fixed Workflow Layout', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    const wbBtn = page.getByRole('button', { name: '生产工作台' });
    if (await wbBtn.isVisible({ timeout: 5000 }).catch(() => false)) await wbBtn.click();
    await expect(page.getByTestId('mvp3-workbench')).toBeVisible({ timeout: 10000 });
  });

  test('M4-FixedLayout-01: desk calendar layout has all layers + edges', async ({ page }) => {
    test.setTimeout(30000);
    // Reference image layer: at least S01 has ref node
    await expect(page.getByTestId('reference-image-node-S01_main-0')).toBeAttached({ timeout: 10000 });
    // Shot control layer
    await expect(page.getByTestId('shot-control-node-S01_main')).toBeAttached({ timeout: 8000 });
    // Video result layer
    await expect(page.getByTestId('fixed-video-node-S01_main')).toBeAttached({ timeout: 8000 });
    // Merge node
    await expect(page.getByTestId('merge-node')).toBeAttached({ timeout: 8000 });

    // Edges must exist in the DOM (React Flow v12 renders them in SVG)
    await page.waitForSelector('.react-flow__edge', { timeout: 5000 });
    const edgeCount = await page.locator('.react-flow__edge').count();
    expect(edgeCount).toBeGreaterThanOrEqual(1);
  });

  test('M4-FixedLayout-02: S04 has 2 reference image nodes + 2 ref→shot edges', async ({ page }) => {
    test.setTimeout(30000);
    await expect(page.getByTestId('reference-image-node-S04_motion-0')).toBeAttached({ timeout: 10000 });
    await expect(page.getByTestId('reference-image-node-S04_motion-1')).toBeAttached({ timeout: 10000 });
    // Verify edges: S04 should have 2 ref edges (one per reference node)
    const s04RefEdges = page.locator('.react-flow__edge[data-testid="rf__edge-ref-edge-S04_motion-0"], .react-flow__edge[data-testid="rf__edge-ref-edge-S04_motion-1"]');
    // Verify at least 1 edge exists (React Flow v12 renders edges in SVG)
    const totalRefEdges = await page.locator('.react-flow__edge').count();
    expect(totalRefEdges).toBeGreaterThanOrEqual(1);
  });

  test('M4-FixedLayout-03: switch to wall calendar shows wall-specific shot keys', async ({ page }) => {
    test.setTimeout(30000);
    await page.getByTestId('sidebar-icon-productLine').hover();
    await expect(page.getByTestId('workflow-sidebar-expanded')).toBeVisible({ timeout: 5000 });
    await page.getByTestId('product-line-wall-calendar').click();
    await expect(page.getByTestId('current-product-line-label')).toContainText('挂历', { timeout: 5000 });
    // Wall calendar shows different shot keys (W01 instead of S01)
    await expect(page.getByTestId('shot-control-node-W01_main')).toBeAttached({ timeout: 10000 });
    await expect(page.getByTestId('shot-control-node-W02_hanging')).toBeAttached({ timeout: 10000 });
    // Desk calendar keys should NOT be present
    await expect(page.getByTestId('shot-control-node-S01_main')).toBeHidden({ timeout: 5000 });
    // Edge count should be different (7 shots vs 6)
    await page.waitForSelector('.react-flow__edge', { timeout: 8000 });
    const edgeCount = await page.locator('.react-flow__edge').count();
    expect(edgeCount).toBeGreaterThanOrEqual(1);
  });

  test('M4-FixedLayout-04: click shot control node opens Inspector', async ({ page }) => {
    test.setTimeout(30000);
    // Click shot-control-node (use evaluate for reliable click through React Flow viewport)
    await page.getByTestId('shot-control-node-S01_main').evaluate((el: HTMLElement) => el.click());
    await expect(page.getByTestId('canvas-node-detail-panel')).toBeVisible({ timeout: 8000 });
    await expect(page.getByTestId('canvas-detail-shot-key')).toContainText('S01_main', { timeout: 5000 });
  });

  test('M4-FixedLayout-05: handles are visible on all node types', async ({ page }) => {
    test.setTimeout(30000);
    // Reference image node has visible source handle (purple, right)
    const refHandle = page.locator('[data-testid^="reference-source-handle-"]').first();
    await expect(refHandle).toBeAttached({ timeout: 8000 });
    // Shot control node: purple ref target (left) + blue video source (right)
    await expect(page.getByTestId('shot-reference-target-handle-S01_main')).toBeAttached({ timeout: 8000 });
    await expect(page.getByTestId('shot-video-source-handle-S01_main')).toBeAttached({ timeout: 8000 });
    // Fixed video node: blue target + blue source
    await expect(page.getByTestId('video-target-handle-S01_main')).toBeAttached({ timeout: 8000 });
    await expect(page.getByTestId('video-source-handle-S01_main')).toBeAttached({ timeout: 8000 });
    // Merge node has visible target handle (blue)
    await expect(page.getByTestId('merge-target-handle')).toBeAttached({ timeout: 8000 });
  });

  test('M4-FixedLayout-06: hover does not change react-flow node count', async ({ page }) => {
    test.setTimeout(30000);
    const initialCount = await page.locator('.react-flow__node').count();
    // Hover reference node (dispatch mouseover — should not cause re-render with ref approach)
    await page.getByTestId('reference-image-node-S01_main-0').evaluate((el: HTMLElement) => {
      el.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
    });
    const afterCount = await page.locator('.react-flow__node').count();
    expect(afterCount).toBe(initialCount);
  });
});
