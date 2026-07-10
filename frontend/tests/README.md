# Frontend Tests

## Directory Structure

```
tests/
├── mvp4_*.spec.ts          # Current MVP-4 production workbench tests (active)
├── legacy/                  # Archived legacy-canvas tests (excluded from main suite)
│   ├── README.md
│   ├── mvp1.spec.ts
│   ├── mvp2.spec.ts
│   └── ...
└── README.md               # This file
```

## Running Tests

### Main suite (quality gate)

```bash
cd frontend
npm run test          # Backend + current MVP-4 frontend, exit 0 = all passed
npm run test:mvp4     # Current MVP-4 only, 137 tests, exit 0 = all passed
npm run test:backend  # Backend 178 unit tests
```

**`npm run test` and `npm run test:mvp4` are the quality gate.** They must pass (exit code 0) for any merge.

### Legacy tests (archived, informational only)

```bash
cd frontend
npm run test:legacy         # Runs all 50 archived tests — EXPECTED to fail (non-zero exit)
npm run test:legacy:report  # Same as above but always exits 0 (for history reports)
npm run test:legacy:mvp2    # MVP-2 legacy only
npm run test:legacy:mvp3    # MVP-3 legacy only
```

**Legacy tests are excluded from `npm run test` by default.** They target the old legacy-canvas UI that has been removed. Most (47/50) are expected to fail. See `tests/legacy/README.md` for category details.

| Script | Tests | Expected | Exit code |
|--------|-------|----------|-----------|
| `npm run test` | Backend 178 + MVP-4 137 | All pass | 0 |
| `npm run test:mvp4` | MVP-4 137 | All pass | 0 |
| `npm run test:legacy` | Legacy 50 | 3 pass / 47 fail | **non-zero** |
| `npm run test:legacy:report` | Legacy 50 | 3 pass / 47 fail | 0 (always) |

## Current Test Files (MVP-4)

All `mvp4_*.spec.ts` files in this directory test the current MVP-4 production workbench. These are the actively maintained tests.
