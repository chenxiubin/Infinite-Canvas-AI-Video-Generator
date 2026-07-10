# Legacy Tests (Archived)

Tests in this directory are excluded from `npm run test` by default (via `testIgnore: ['**/legacy/**']` in playwright.config.ts).

**Most tests here (47/50) are expected to fail** because they depend on removed legacy-canvas UI testids. A non-zero exit code from `npm run test:legacy` is normal and expected.

## Categories

### 1. Legacy-canvas tests (MVP-1 / MVP-2 / MVP-3)

Old UI pages and components no longer part of the main application flow.

| File | Description |
|------|-------------|
| `mvp1.spec.ts` | MVP-1 legacy canvas tests |
| `mvp2.spec.ts` | MVP-2 batch generation / review / export tests |
| `mvp2_h_screenshots.spec.ts` | MVP-2 screenshot tests |
| `mvp2_screenshots.spec.ts` | MVP-2 screenshot tests |
| `mvp3_canvas.spec.ts` | MVP-3 canvas interaction tests |
| `mvp3_demo.spec.ts` | MVP-3 demo flow tests |
| `mvp3_workbench.spec.ts` | MVP-3 workbench tests |
| `screenshots.spec.ts` | Legacy screenshot tests |

### 2. Obsolete MVP-4 old-UI tests

Features now covered by newer tests using current UI.

| File | Description | Replaced by |
|------|-------------|-------------|
| `mvp4_image_binding.spec.ts` | Old image upload → dropdown role → bind flow | `mvp4_reference_image_input`, `mvp4_image_asset_library`, `mvp4_canvas_connection`, `mvp4_clipboard_reference_image` |
| `mvp4_single_shot_generation.spec.ts` | Old single-shot generate via canvas button | `mvp4_apimart_generation_flow` (11 tests) |

### 3. Archived old implementations

| File | Description | Current coverage |
|------|-------------|------------------|
| `mvp4_merge_gate.spec.ts` | Old merge gate sidebar UI tests (used `create-demo-product-button`) | Merge gate scenarios covered by `mvp4_video_asset_library` 10I-09 and 10I-10 |

### 4. Removed feature test cases

| Feature | Status |
|---------|--------|
| M4-Prompt-07 (motion-shot-version-panel) | Panel was removed from RightInspectorPanel per product decision. `motionShotVersion` state still exists but has no visible UI. |

## Running legacy tests

```bash
# Strict run (non-zero exit on failures — expected)
npm run test:legacy

# Report run (always exits 0, use for history inspection)
npm run test:legacy:report

# Specific subsets
npm run test:legacy:mvp2
npm run test:legacy:mvp3
```

**Do not use `npm run test:legacy` as a CI quality gate.** It is expected to fail. Use `npm run test` or `npm run test:mvp4` for quality gating.
