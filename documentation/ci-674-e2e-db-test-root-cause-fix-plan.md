# Root-cause analysis — CI #674 e2e-db-test failure (issue #567)

Repo: rbnbrls/bcm · PR #566 (commit `78006ba`, "Build Workflow Studio MVP builder") · Run #674 (31397643585) · GitHub issue: [#567](https://github.com/rbnbrls/bcm/issues/567)

## Root cause statement

The e2e-db-test failure is a **deterministic, test-code bug introduced by PR #566**:
`tests/e2e/workflow-studio-builder.spec.ts:22` uses an unscoped `getByRole("heading", { name })`
locator that matches **3 headings** on the workflow edit page. Playwright strict mode rejects the
ambiguous match, so `toBeVisible()` throws. It fails identically on all 3 attempts (initial +
2 retries) — this is not a flake.

## Evidence

- Failing step 20 (`npx playwright test --grep "@db"`): **32 passed, 1 failed**; the one failure is
  `workflow-studio-builder.spec.ts` "create → configure → simulate → review → publish", 3/3 attempts identical.
- Exact error: `strict mode violation: getByRole('heading', { name: 'E2E benchmarkworkflow …' }) resolved to 3 elements`:
  1. `<h1>{workflowName}</h1>` — `app/workflow-studio/[definitionId]/edit/workflow-editor-shell.tsx:363` (editor page title)
  2. `<h2 id="catalog-preview-title">{metadata.name}</h2>` — `app/workflow-studio/[definitionId]/edit/workflow-metadata-panel.tsx:128` (catalog preview)
  3. `<h2 aria-label="Preview: …">{preview.metadata.name}</h2>` — `app/workflow-studio/[definitionId]/edit/workflow-live-preview.tsx:91` (live preview)
- Verified against the branch: spec line 22 is `await expect(page.getByRole("heading", { name })).toBeVisible();`
  (after `waitForURL(/\/workflow-studio\/[0-9a-f-]{36}\/edit$/)` on line 20).
- **DB layer fully green**: steps 2 + 9–19 passed (containers, `db/init.sql`, `db:migrate` (29 tables,
  31 indexes), seed, plan-1.14 migration checks, staged-config seed, 6 vitest integration suites).
  No migration, RBAC or identity failure — `change_manager` holds `workflow:view`, both feature
  flags are set in the job env.
- **CI config is the enabler, not the cause**: `.github/workflows/ci.yml` sets
  `BCM_FEATURE_WORKFLOW_STUDIO_BUILDER/PUBLISH=true` in the e2e-db-test env, which activates the
  `/workflow-studio` routes and pulls this new @db spec into the job. The spec itself is what fails.

## Classification

| Candidate              | Verdict                                                                 |
|------------------------|-------------------------------------------------------------------------|
| Test code              | ✅ **Root cause** — ambiguous heading locator at spec line 22           |
| Database setup/migrations | ✅ all green (init.sql ↔ migrate.mjs ↔ lib/db.ts aligned, migration checks passed) |
| Application changes    | ✅ app legitimately renders the name in 3 headings (h1 page title + 2 h2 section headings, all a11y-correct) |
| CI configuration       | ✅ not the cause — the flag change only activated the new spec          |

## Fix plan

### 1. (Required, unblocks CI) Scope the heading locator — `tests/e2e/workflow-studio-builder.spec.ts:22`

Change:

```ts
await expect(page.getByRole("heading", { name })).toBeVisible();
```

to (recommended — matches the assertion's intent, "the workflow name appears as the page title after redirect"):

```ts
await expect(page.getByRole("heading", { name, level: 1 })).toBeVisible();
```

Alternative accepted: scope to the editor toolbar region, e.g.

```ts
await expect(page.locator(".workflow-editor-toolbar").getByRole("heading", { name })).toBeVisible();
```

Avoid `.first()` — it depends on DOM order and does not express intent.

Do **not** change the app headings: the h1 is the page title and the two h2s are legitimate section
headings (`catalog-preview-title` is also an anchor target); altering them would harm accessibility
to satisfy a test.

Expected effect: locator resolves to exactly the `<h1>` → strict mode satisfied → spec proceeds →
e2e-db-test green → issue #567 auto-closes when CI passes. Same fix should be applied to the non-DB
`e2e-test` job's copy of this spec if one exists (verify with `grep -rn 'getByRole("heading")' tests/e2e`).

### 2. (Follow-up, same PR, non-blocking) Fix the "Only plain objects" server→client warning

During the failing test window the Next.js dev server flooded:
`Only plain objects can be passed to Client Components from Server Components … {blockType: …, configurationSchema: …, configurationUiSchema: …, inputs: …, outputs: …, capabilities: …, ui: …}`
(blockType variants "end", "form", …). This indicates class instances (block definitions with
methods — likely schema/registry classes in `lib/workflow-studio/block-registry.ts` /
`editor-model.ts`) cross a server→client boundary in the new edit page; Next.js strips the methods
and the client receives mangled objects.

- Suspects: `app/workflow-studio/[definitionId]/edit/workflow-editor-shell.tsx` and the other new
  edit-page components that receive block definitions as props.
- Expected change: serialize block definitions to plain data (e.g. `.toJSON()` / plain-object
  mapping) before passing them into Client Components.
- This is **not** the cause of the current failure (the test fails on the heading assertion before
  exercising any functional flow that depends on those methods), but it is a latent functional risk
  worth fixing in the same PR.

### 3. (Watch item, not a fix) Latent assertions in the same spec

- Line ~55 `simulator.getByRole("heading", { name: "Verwachte intents" })` is safe today only because
  it is scoped to the `.workflow-path-simulator` panel — keep it scoped.
- Final `/change-catalog` assertions (published template card + `sha256:` code) depend on the full
  publish flow + overview query; if publish→catalog surfaces a regression after fix 1, check
  `app/change-catalog/page.tsx` and `lib/workflow-studio/definition-service.ts` next.

## Acceptance check

After applying fix 1 and pushing to `codex/workflow-studio-mvp-builder`, the next CI run's e2e-db-test
must show **33 passed, 0 failed** (or 32+1 depending on flag parity) and the job must be green;
issue #567 auto-closes on the first green run.
