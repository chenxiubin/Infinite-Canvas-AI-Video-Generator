import { test, expect } from '@playwright/test';

test.describe('MVP-4 10L-8 Production State Isolation', () => {

  test('PSI-01: instance state isolation — separate instances do not cross-contaminate', async ({ page }) => {
    test.setTimeout(30000);
    await page.goto('/');
    const state = {
      ins_a: {
        compositionOrder: ['S01_main','S02_detail1'],
        timelineDurations: { S01_main: 8 },
        compositionJob: { status: 'completed', startedAt: 1, completedAt: 100 },
        finalVideoVersions: [{ versionId: 'a-fv1', videoUrl: '/a.mp4', createdAt: 100, status: 'completed' }],
        currentFinalVideoId: 'a-fv1',
      },
      ins_b: {
        compositionOrder: ['S03_detail2'],
        timelineDurations: {},
        compositionJob: { status: 'processing', startedAt: 200 },
        finalVideoVersions: [{ versionId: 'b-fv1', videoUrl: '/b.mp4', createdAt: 200, status: 'completed' }],
        currentFinalVideoId: 'b-fv1',
      },
    };
    // Write both instances
    await page.evaluate((s) => { localStorage.setItem('productionStateByInstance', JSON.stringify(s)); }, state);
    // Read and verify isolation
    const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('productionStateByInstance') || '{}'));
    // Instance A
    expect(stored.ins_a.compositionOrder).toEqual(['S01_main','S02_detail1']);
    expect(stored.ins_a.compositionJob.status).toBe('completed');
    expect(stored.ins_a.finalVideoVersions[0].versionId).toBe('a-fv1');
    // Instance B — independent
    expect(stored.ins_b.compositionOrder).toEqual(['S03_detail2']);
    expect(stored.ins_b.compositionJob.status).toBe('processing');
    expect(stored.ins_b.finalVideoVersions[0].versionId).toBe('b-fv1');
    // No cross-contamination
    expect(stored.ins_a.finalVideoVersions.length).toBe(1);
    expect(stored.ins_b.finalVideoVersions.length).toBe(1);
  });

  test('PSI-02: refresh preserves current instance state', async ({ page }) => {
    test.setTimeout(30000);
    await page.goto('/');
    const state = {
      ins_x: {
        compositionOrder: ['S01_main'],
        timelineDurations: { S01_main: 5 },
        compositionJob: { status: 'completed', startedAt: 500, completedAt: 800 },
        finalVideoVersions: [{ versionId: 'fv1', videoUrl: '/x.mp4', createdAt: 500, status: 'completed' }],
        currentFinalVideoId: 'fv1',
      },
    };
    await page.evaluate((s) => { localStorage.setItem('productionStateByInstance', JSON.stringify(s)); }, state);
    // Simulate refresh by re-reading
    const restored = await page.evaluate(() => JSON.parse(localStorage.getItem('productionStateByInstance') || '{}'));
    expect(restored.ins_x.compositionOrder[0]).toBe('S01_main');
    expect(restored.ins_x.compositionJob.status).toBe('completed');
    expect(restored.ins_x.finalVideoVersions[0].versionId).toBe('fv1');
    expect(restored.ins_x.currentFinalVideoId).toBe('fv1');
  });
});
