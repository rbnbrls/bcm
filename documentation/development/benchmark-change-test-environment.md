# Benchmark change workflow — test environment

This document describes the non-production test environment used for the
benchmark change workflow (`benchmark-wijziging`) end-to-end tests. It lists
the accounts, roles, test portfolio, workflow definition and the recorded
baseline benchmark configuration. Everything here is isolated from
production: local PostgreSQL 17, dev-mode Next.js, demo seed data, signed
identity sessions with the committed e2e secret (rejected in production by
`lib/identity/session.ts`).

## Environment overview

| Component | Value |
|-----------|-------|
| Application | BCM (Next.js) dev server on `http://localhost:3000` |
| Database | local PostgreSQL 17 at `postgres://bcm@localhost:5432/bcm` |
| Schema | `db/init.sql` + `npm run db:migrate` + `npm run db:seed` |
| Identity | signed cookie `bcm_identity_session` (HMAC-SHA256) |
| E2E session secret | `bcm-playwright-identity-session-secret` (LOCAL/CI ONLY — rejected in production) |
| Tenant / business unit | `e2e` / `e2e` |
| Feature flags (required) | `BCM_FEATURE_WORKFLOW_STUDIO_BUILDER=true`, `BCM_FEATURE_WORKFLOW_STUDIO_PUBLISH=true`, `BCM_FEATURE_WORKFLOW_RUNTIME_START=true` |
| Per-workflow cutover flag | `BCM_FEATURE_WORKFLOW_RUNTIME_WORKFLOW_<DEFINITION_ID_UPPERCASE_UNDERSCORED>=true` (see below) |

## Roles and accounts

BCM uses signed identity-session cookies. A session carries `groups`
containing role claims (`bcm:role:change_manager`, `bcm:role:account_manager`,
`bcm:role:admin`) and optionally client claims (`bcm:client:<clientId>`).

| Account / role | Display name | Identity / session | Credential location | Permissions (relevant) | Can |
|----------------|--------------|--------------------|---------------------|------------------------|-----|
| Change manager | Chris Change | `e2e:change_manager` (group `bcm:role:change_manager` + `bcm:client:HOR`) | Signed session forged with `createIdentitySessionToken` (secret `bcm-playwright-identity-session-secret`, LOCAL/CI ONLY); profile switcher / `identitySessionCookie("change_manager")` / `identityToken("change_manager", ["bcm:client:HOR"])` | `workflow:start`, `workflow:tasks:execute`, `changes:create`, ... | create benchmark change requests |
| Account manager | Arjan Accountmanager | `e2e:account_manager` (group `bcm:role:account_manager` + `bcm:client:HOR`) | Same signed-session mechanism; `identitySessionCookie("account_manager")` / `identityToken("account_manager", ["bcm:client:HOR"])` | `workflow:approve`, `workflow:tasks:execute`, `changes:approve`, ... | approve / reject pending requests |
| Admin | Bert Beheerder | `e2e:admin` (group `bcm:role:admin`) | Same signed-session mechanism; `identitySessionCookie("admin")` | `admin:access`, `workflow:manage`, ... | manage (no `workflow:start`, no `workflow:approve`) |
| Viewer (unauthorized) | Vera Viewer | `e2e:viewer` (group `bcm:role:viewer`) | Same signed-session mechanism; `identitySessionCookie("viewer")` | none (`permissions: []`) | nothing (403 on every benchmark-change action) |

There is no password database for these accounts: BCM's dev/test identity is
cookie-based, so the "credential" for every role is the local-only session
secret (`bcm-playwright-identity-session-secret`) used to sign the forged
cookie. That secret is committed in `tests/e2e/identity-session.ts`
(`E2E_SESSION_SECRET`) and is **rejected in production** by
`lib/identity/session.ts` (see `FORBIDDEN_PRODUCTION_SECRETS`). In the UI the
profile switcher (`components/profile-switcher.tsx`, enabled in dev/demo)
lets you log in as any role without forging a cookie.

### Change manager (t_a706ed74)

The **change manager** account is the one with permission to **create**
benchmark change requests:

- **Account identifier:** `e2e:change_manager` (display name *Chris Change*,
  role claim `bcm:role:change_manager`, client claim `bcm:client:HOR`).
- **Credential location:** no password; the signed session cookie is forged
  with the local/CI-only secret `bcm-playwright-identity-session-secret`
  (committed in `tests/e2e/identity-session.ts` as `E2E_SESSION_SECRET`).
  The e2e helper `identitySessionCookie("change_manager")` and the driver
  helper `identityToken("change_manager", ["bcm:client:HOR"])` both produce a
  valid login session. In the UI, use the profile switcher.
- **Create permission:** `workflow:start` (from `lib/rbac-config.ts` and the
  workflow role binding `change_manager → workflow:start` in
  `workflow_role_binding`). The POST `/api/workflows/benchmark-change` route
  authorizes with `authorizeWorkflowPermission(identity, "workflow:start")`
  and returns HTTP 403 without it.
- **No approve/reject permission:** the profile has **no** `workflow:approve`
  and the workflow binds approval to `account_manager → workflow:approve`
  only. `WorkflowTaskService.claim` / `decideApproval` return
  `permission_denied` for the change manager on approval tasks (verified live
  against the local DB and by
  `tests/workflow-runtime-task.test.ts`).

Verification (live, 2026-08-20, t_a706ed74):

```bash
DATABASE_URL=postgres://bcm@localhost:5432/bcm \
  node scripts/verify-change-manager-account.mjs   # create → 200; deny matrix
DATABASE_URL=postgres://bcm@localhost:5432/bcm \
  node scripts/verify-change-manager-deny.mjs      # claim/approve/reject → permission_denied
```

> **Important — client scope.** The benchmark-change API requires the identity
> to have a client claim (`bcm:client:*`) that overlaps the workflow's client
> scope. Without it the request fails with HTTP 500
> `Identiteit heeft geen client scope`. The e2e identity factory
> (`tests/e2e/identity-session.ts`) currently issues only role claims, so the
> spec must add `bcm:client:HOR` (client code of Pensioenfonds Horizon) to
> the change-manager session. See `lib/workflow-studio-authorization.ts`
> (`getIdentityClientScope`) and the API route
> (`app/api/workflows/benchmark-change/route.ts`).

### Account manager (t_f7413517)

The **account manager** account is the one with permission to **approve and
reject** benchmark change requests:

- **Account identifier:** `e2e:account_manager` (display name *Arjan
  Accountmanager*, role claim `bcm:role:account_manager`, client claim
  `bcm:client:HOR`).
- **Credential location:** no password; the signed session cookie is forged
  with the local/CI-only secret `bcm-playwright-identity-session-secret`
  (committed in `tests/e2e/identity-session.ts` as `E2E_SESSION_SECRET`).
  The e2e helper `identitySessionCookie("account_manager")` and the driver
  helper `identityToken("account_manager", ["bcm:client:HOR"])` both produce
  a valid login session. In the UI, use the profile switcher.
- **Approve/reject permission:** `workflow:approve` (from `lib/rbac-config.ts`
  and the workflow role binding `account_manager → workflow:approve` in
  `workflow_role_binding`). `WorkflowTaskService.claim` /
  `decideApproval` return `allowed` for the account manager on approval
  tasks (verified live against the local DB and by
  `tests/workflow-runtime-task.test.ts`).
- **No create permission:** the profile has **no** `workflow:start` and the
  workflow binds start to `change_manager → workflow:start` only. The
  `POST /api/workflows/benchmark-change` route authorizes with
  `authorizeWorkflowPermission(identity, "workflow:start")` and returns
  HTTP 403 for the account manager (verified live).
- **No admin access:** the profile has **no** `admin:access`; navigation to
  `/admin` is blocked by `navigationPermissions` in `lib/rbac-config.ts`.

Verification (live, 2026-08-20, t_f7413517):

```bash
DATABASE_URL=postgres://bcm@localhost:5432/bcm \
  node scripts/verify-account-manager-account.mjs   # login + approve/reject + deny matrix
```

Test identities are forged locally with `createIdentitySessionToken` from
`lib/identity/session.ts` — see `tests/e2e/identity-session.ts` for the
existing helper. `tests/e2e/helpers.ts` may also be used.

## Test portfolio

The seed data (`lib/fixtures.ts`, `npm run db:seed`) contains 3 demo
portfolios. The benchmark change workflow tests use
**Pensioenfonds Horizon — Rendementsportefeuille**:

| Field | Value |
|-------|-------|
| Portfolio id | `c4707067-b98a-4a0f-92c7-5ee510dc70ff` |
| Portfolio name | Rendementsportefeuille |
| External reference | HOR-RP |
| Client | Pensioenfonds Horizon (`9f9280fc-9572-49d1-b81c-2a039652bc93`) |
| Client code | HOR |
| Current benchmark | MSCI World Net Return (`9fb65c5a-5ccf-4374-a264-9b03c9ac3bd1`) |

## Baseline benchmark configuration (recorded before testing)

Recorded against the local e2e database on 2026-08-20, before any benchmark
change request was executed. Re-verified live on 2026-08-20 (task t_72ac7812)
with `scripts/verify-benchmark-test-env.mjs` and
`scripts/check-baseline-counts.mjs` — benchmark assignments are unchanged:

| Portfolio | Current benchmark | Code |
|-----------|-------------------|------|
| Rendementsportefeuille (HOR-RP) | MSCI World Net Return | `MSCI-WORLD-NR` |
| Matchingportefeuille (HOR-MP) | Bloomberg Euro Aggregate | `BLOOMBERG-EU-AGG` |
| Return portefeuille (ZEK-RET) | MSCI ACWI Net Return | `MSCI-ACWI-NR` |

Counts at baseline: 3 portfolios, 12 clients, 17 benchmark catalog entries,
16 change requests, 58 workflow definitions, 3 workflow instances.

> Counts re-checked on 2026-08-20 (t_72ac7812): 3 portfolios, 12 clients,
> 17 benchmark catalog entries, **20 change requests, 58 workflow definitions,
> 7 workflow instances** — the change-request/instance counts grew because
> earlier diagnostic runs drove the workflow; the baseline *benchmark
> assignments* (the data under test) are unchanged.
>
> Counts at final validation on 2026-08-20 (t_c3aa74fa): 3 portfolios,
> 12 clients, 17 benchmark catalog entries, **19 change requests,
> 70 workflow definitions, 36 workflow instances** — the definition/instance
> counts keep growing because the account-verification scripts
> (`verify-*-account.mjs`, `drive-benchmark-workflow.mjs`) create fresh
> instances and `ensureBenchmarkWorkflowExists` bumps definitions on re-runs.
> The baseline *benchmark assignments* (the data under test) are still
> unchanged: HOR-RP → MSCI-WORLD-NR, HOR-MP → BLOOMBERG-EU-AGG,
> ZEK-RET → MSCI-ACWI-NR (re-verified by `verify-benchmark-test-env.mjs`).

## Workflow definition

The `benchmark-wijziging` workflow is created lazily by the
`POST /api/workflows/benchmark-change` endpoint
(`ensureBenchmarkWorkflowExists`). In the e2e database it is published:

| Field | Value |
|-------|-------|
| Slug | `benchmark-wijziging` |
| Name | Benchmarkwijziging |
| Definition id | `060f70fc-161f-4e6f-a437-e54eb0101edd` |
| Version id | `0b6f3c56-1176-41ce-bb22-d0f1c661842e` |
| Version | v1 (published) |
| Tenant / BU | e2e / e2e |
| Client scope | `["HOR"]` |
| Nodes | manual_start → client_config_lookup → form → approval (account_manager) → change_request → end |
| Role bindings | change_manager → `workflow:start`; account_manager → `workflow:approve` |

> **Cutover flag.** Even with `BCM_FEATURE_WORKFLOW_RUNTIME_START=true`, a
> published workflow only becomes startable when its per-workflow cutover flag
> is enabled (`decideWorkflowRuntimeCutover` in
> `lib/workflow-studio/runtime-cutover.ts`). For the definition above the flag
> is:
>
> ```
> BCM_FEATURE_WORKFLOW_RUNTIME_WORKFLOW_060F70FC_161F_4E6F_A437_E54EB0101EDD=true
> ```
>
> (compute via `workflowRuntimeWorkflowFlagName(definitionId)` in
> `lib/feature-flags.ts`). Without it the change-catalog card shows
> "Niet startbaar — Workflow runtime is niet actief voor deze versie" and the
> API returns HTTP 400 `Deze workflowversie staat nog op classic`.

## Unauthorized test account

The dedicated unauthorized test account is the **viewer** profile (**Vera
Viewer**, identity `e2e:viewer`, group `bcm:role:viewer`). It was added to
`lib/rbac-config.ts` (t_14be6701) with an **empty permission list** — it has
no `workflow:start`, `workflow:approve`, `workflow:tasks:execute`,
`changes:create` or `changes:approve`. It can log in via the profile
switcher or a forged session (`identitySessionCookie("viewer")` /
`identityToken("viewer")`) and is expected to be **denied every
benchmark-change action**:

| Action | Endpoint / call | Expected result |
|--------|-----------------|-----------------|
| Create benchmark change request | `POST /api/workflows/benchmark-change` | HTTP 403 (missing `workflow:start`) |
| Approve pending request | `WorkflowTaskService.decideApproval(..., "approved")` | `permission_denied` (missing `workflow:approve`) |
| Reject pending request | `WorkflowTaskService.decideApproval(..., "rejected")` | `permission_denied` (missing `workflow:approve`) |
| Claim approval task | `WorkflowTaskService.claim` | `permission_denied` |

The other roles confirm the same split:

- **Account manager** may NOT create requests (`workflow:start` missing) → 403.
- **Change manager** may NOT approve/reject (`workflow:approve` missing) → 403
  at the API; the UI hides the approve/reject buttons.
- **Admin** has neither `workflow:start` nor `workflow:approve` → 403.
- Anonymous (no session): identity falls back to the server-configured
  identity; in production it is `anonymous` with no role groups → 403.

The full matrix is verified by the driver's `authz` mode:

```bash
node scripts/drive-benchmark-workflow.mjs authz
```

It asserts HTTP 403 for viewer/account_manager/admin create attempts,
`permission_denied` for viewer claim/approve/reject on a real approval task,
and `permission_denied` for change_manager claim/approve on the same task.

## How to run the environment

```bash
# 1. Database (Postgres 17 running on localhost:5432)
npm run db:migrate
npm run db:seed

# 2. Dev server with all flags (see `npm run dev` in playwright.config.ts)
BCM_SESSION_SECRET=bcm-playwright-identity-session-secret \
BCM_FEATURE_WORKFLOW_STUDIO_BUILDER=true \
BCM_FEATURE_WORKFLOW_STUDIO_PUBLISH=true \
BCM_FEATURE_WORKFLOW_RUNTIME_START=true \
BCM_FEATURE_WORKFLOW_RUNTIME_WORKFLOW_060F70FC_161F_4E6F_A437_E54EB0101EDD=true \
FEEDBACK_DRY_RUN=true \
npm run dev

# 3. E2E benchmark change spec
npx playwright test tests/e2e/benchmark-change-workflow.spec.ts
```

## Verification script

`scripts/verify-benchmark-test-env.mjs` checks the environment: portfolio
exists, workflow definition is published, role bindings are present, and
reports the baseline benchmark. Run with:

```bash
node scripts/verify-benchmark-test-env.mjs
```

## Isolation verification (t_72ac7812, 2026-08-20)

- **No production env vars** in the running dev-server process (checked
  `/proc/<pid>/environ`): no `PROD`/`production` variables, no production
  URLs; `DATABASE_URL` points at `postgres://bcm@localhost:5432/bcm` and
  `FEEDBACK_DRY_RUN=true` prevents outbound feedback posts.
- **No remote DB connections**: `scripts/check-db-connections.mjs` shows only
  localhost / unix-socket sessions in `pg_stat_activity`.
- **E2E session secret** (`bcm-playwright-identity-session-secret`) is
  rejected in production by `lib/identity/session.ts`; the dev server runs
  with `NODE_ENV=development`.
- **Baseline counts** re-verified with `scripts/check-baseline-counts.mjs`.

## Final validation (t_c3aa74fa, 2026-08-20)

Full readiness pass after all accounts, the isolated environment and the
baseline were prepared. Everything below was executed live against the real
dev server (`http://localhost:3000`) and the local e2e Postgres:

| Check | Result |
|-------|--------|
| Dev server + all feature flags | HTTP 200; `BCM_FEATURE_WORKFLOW_STUDIO_BUILDER/PUBLISH/RUNTIME_START=true`, per-workflow cutover flag `BCM_FEATURE_WORKFLOW_RUNTIME_WORKFLOW_060F70FC_161F_4E6F_A437_E54EB0101EDD=true`, `FEEDBACK_DRY_RUN=true`, `BCM_SESSION_SECRET=bcm-playwright-identity-session-secret`, `NODE_ENV=development` (read from `/proc/<pid>/environ`) |
| Isolation | `scripts/check-db-connections.mjs`: only localhost/unix-socket sessions, no production connections |
| Environment + baseline | `scripts/verify-benchmark-test-env.mjs`: portfolio HOR-RP active, 3 baselines unchanged, workflow published v1, role bindings `change_manager→workflow:start` + `account_manager→workflow:approve` ✅ |
| Change manager | `scripts/verify-change-manager-account.mjs`: create → HTTP 200 (1/1 PASS) |
| Change manager denies | `scripts/verify-change-manager-deny.mjs`: claim/approve/reject → `permission_denied`, account_manager control allowed (5/5 PASS) |
| Account manager | `scripts/verify-account-manager-account.mjs`: login verifies, approve/reject allowed, create 403, no admin (15/15 PASS) |
| Unauthorized matrix | `drive-benchmark-workflow.mjs authz`: create 403 for viewer/account_manager/admin, change_manager control 200 (4/4 PASS; stops at documented known issue #5) |
| Unit tests | `npx vitest run tests/rbac.test.ts tests/workflow-runtime-task.test.ts` — 21/21 passed |

**Conclusion: the environment is ready for benchmark change-request testing**
— all required accounts behave as expected, unauthorized accounts are denied,
data is isolated from production, and this document covers environment
details, account identifiers/permissions and the baseline benchmark
configuration. The only remaining blocker for full end-to-end execution is
**known issue #5** (lookup_portfolio finds 2 HOR records); it sits *after*
every authorization assertion and does not affect account validation.

> **Update (t_5eb0156b, 2026-08-21):** known issue #5 is now **resolved**
> (PR #634 + re-published workflow v3, see issue list below). The full
> approval and rejection drives complete end-to-end, and the authz matrix
> passes 5/5.

## Rejection flow test results (t_5eb0156b, 2026-08-21)

Executed live against the dev server (`http://localhost:3000`) and local PG17.

### Steps
1. Login as **change manager** (`e2e:change_manager`) and create a benchmark
   change request via `POST /api/workflows/benchmark-change` → HTTP 200.
2. Drive the instance through `start → lookup_portfolio → form_request →
   approval_account_manager` (`node scripts/drive-benchmark-workflow.mjs reject`).
3. Login as **account manager** (`e2e:account_manager`), claim the approval
   task, decide **rejected** with comment "Afgekeurd door driver test.".

### Result (instance `d9a99533-30c6-409a-8512-df20afb7c690`)

| Check | Result |
|-------|--------|
| Create as change manager | HTTP 200 ✅ |
| Approval task | status `completed`, outcome **`rejected`** ✅ |
| Rejection reason captured | `workflow_task.completion_comment` = "Afgekeurd door driver test."; `form_data` = `{decision: rejected, label: Afwijzen, comment: ...}`; audit event `workflow.approval.decided` with `decidedByUserId: e2e:account_manager`, `commentRequired: true` ✅ |
| Decision variable | `approval_account_manager_decision = "rejected"` ✅ |
| Benchmark updated? | **No** — `client_config.portfolio_configuration` (HOR*EQACX*EIG) and legacy `portfolios` row both still `MSCI-WORLD-NR` ✅ |
| apply_change node reached? | **No** — the approval node has no outgoing `rejected` edge; the `change_request` node only activates from the `approved` port, so it never ran ✅ |
| Baselines after test | HOR-RP→MSCI-WORLD-NR, HOR-MP→BLOOMBERG-EU-AGG, ZEK-RET→MSCI-ACWI-NR — all unchanged ✅ |
| Instance final status | `running` ⚠️ (see deviation) |

### Deviation (must be recorded)
- **No terminal "rejected" instance state.** The published graph ends the
  rejection path at the approval node: the approval task is completed with
  `outcome=rejected`, the audit event and decision variable are written, but
  the **workflow instance stays `running` indefinitely** — there is no
  `rejected`/`closed` terminal state and no edge from the approval node's
  rejected port. The rejection is clearly visible on the task + audit trail,
  but not as a distinct instance status. If a terminal rejected state is
  required, the graph needs a rejected branch (edge from approval rejected
  port → terminal node with outcome `rejected`).

### Verification commands
```bash
DATABASE_URL=postgres://bcm@localhost:5432/bcm node scripts/drive-benchmark-workflow.mjs reject
DATABASE_URL=postgres://bcm@localhost:5432/bcm node scripts/inspect-rejection-outcome.cjs <instanceId>
DATABASE_URL=postgres://bcm@localhost:5432/bcm node scripts/check-baselines-rejection.cjs
```

## Unauthorized access test results (t_92eec771, 2026-08-21)

Executed live against the dev server (`http://localhost:3000`) and local PG17
with `scripts/verify-unauthorized-access.mjs`.

### Matrix

| # | Action | Unauthorized identity | Result |
|---|--------|----------------------|--------|
| 1 | Create benchmark change request (`POST /api/workflows/benchmark-change`) | viewer / account_manager / admin | HTTP 403 (missing `workflow:start`) ✅ |
| 2a | Claim approval task (`WorkflowTaskService.claim`) | viewer | `permission_denied` ✅ |
| 2b | Approve approval task (`decideApproval`) | viewer / change_manager | `permission_denied` (missing `workflow:approve`) ✅ |
| 2c | Reject approval task (`decideApproval`) | viewer | `permission_denied` ✅ |
| 3a | Accept change (`POST /api/changes/[id]/status` → accepted) | viewer | HTTP 403 (missing `changes:approve`) ✅ |
| 3b | Transition to in_progress (`status` → in_progress) | viewer | HTTP 403 (gated by fix) ✅ |
| 3c | Provider feedback (`POST /api/changes/[id]/provider-feedback` → processed) | viewer | HTTP 403 (gated by fix) ✅ |
| 4a | Direct portfolio write (`PATCH /api/portfolio/[id]`) | no auth | HTTP 400 — only assetClass/subAssetClass fields, no benchmark mutation ✅ |
| 4b | IST update webhook (`POST /api/ist-update`) | no token | Open in dev (`IST_API_TOKEN` unset); token-gated when configured ⚠️ dev-mode only |
| 5 | Anonymous (production-like, no role groups) | `workflow:start` / `workflow:approve` / `changes:approve` | all denied ✅ |

Controls (authorized identities) all allowed: change_manager create → 200,
account_manager claim/approve → allowed, account_manager accept /
in_progress / provider-feedback → 200.

### Defect found & fixed (PR #637)

**`POST /api/changes/[id]/provider-feedback` had NO authorization check.**
Any caller with a change ID (viewer, or unauthenticated in dev) could
transition a change to `processed`, which applies it to the live benchmark
configuration (`istSyncOnProcessed` → `UPDATE portfolios SET
current_benchmark_id = ...`). The live probe confirmed the mutation:
HOR-RP's legacy `portfolios.current_benchmark_id` flipped
MSCI-WORLD-NR → BLOOMBERG-EU-AGG before the baseline was restored.

**Fix (merged, PR #637):** the `provider-feedback` route, the
`/api/changes/[id]/status` route, and the `updateStatus` server action now
all require the change type's approve permission (`changes:approve`) for the
`in_progress` and `processed` transitions (previously only `accepted` was
gated). The `db/enforce_change_process.sql` trigger protects
`client_config.portfolio_configuration` but not the legacy `portfolios`
table, so the API-level gate is the primary defense for the IST-sync path.

Verification after fix: `verify-unauthorized-access.mjs` **ALL PASS** (22/22
assertions), baselines unchanged (HOR-RP → MSCI-WORLD-NR), full unit suite
2093 passed / 0 failed, regression test
`tests/api/provider-feedback-auth.test.ts` (3 tests).

### Unauthenticated (no session cookie) behavior

In dev mode an anonymous request falls back to
`BCM_DEVELOPMENT_IDENTITY_ROLE` (default `change_manager`) via
`lib/identity/request.ts` `configuredIdentity()`. So "no cookie" in dev is
NOT anonymous — it inherits the change_manager role. In production the
fallback is `anonymous` with no role groups → denied everywhere. This is
dev-only behavior; the authorization primitives themselves deny a
zero-permission identity (`identityHasPermission` returns false for all
relevant permissions).

## Known environment issues (must be fixed before e2e runs green)

1. **Spec locator mismatch.** The spec (`tests/e2e/benchmark-change-workflow.spec.ts`,
   currently untracked) looks for heading `Benchmark wijziging`, but the
   published workflow name is `Benchmarkwijziging` (no space). The heading
   regex must be `/Benchmarkwijziging/i`.
2. **Missing client claim in e2e identity.** `identitySessionCookie(role)`
   issues only `bcm:role:*` groups. The benchmark-change API requires a client
   claim; add `bcm:client:HOR` to the change-manager session or the POST
   returns 500 `Identiteit heeft geen client scope`.
3. **Workflow cutover flag not set in dev.** Without the per-workflow flag the
   workflow is "classic" (HTTP 400, card "Niet startbaar").
4. **No automatic node driver.** The runtime engine is command-driven:
   `start()` only activates the `manual_start` node as `ready`. Progress to
   `lookup`/`form`/`approval` requires `claimNext`/`execute` calls (see
   `tests/workflow-runtime-engine.test.ts`). The e2e spec exercises the UI
   forms/tasks, which drive human nodes, but the manual_start → lookup
   transition must be driven by the start path or a test driver.
5. **Lookup "finds 2 records" with HOR scope — RESOLVED (t_5eb0156b, PR #634).**
   The published `lookup_portfolio` node had `selection: one` with no
   filter/parentBinding, so it searched all portfolios scoped to the
   identity's client claims. The HOR client has two portfolios in scope
   (`HORRP` + `HORMP`), so the lookup failed with "verwacht precies één
   record, maar vond 2". **Fix (merged):** the node now filters
   `portfolio_configuration` on `primary_account_id = portfolio_id`
   (variable pre-bound by the API route as a start variable). The fix was
   applied both in `app/api/workflows/benchmark-change/route.ts`
   (`ensureBenchmarkWorkflowExists`) and re-published into the test DB as
   benchmark-wijziging **v3** via `scripts/publish-benchmark-lookup-fix.mjs`.
   After the fix, `drive-benchmark-workflow.mjs authz` passes **5/5**
   (previously stopped at this issue) and the full approve/reject e2e
   drives complete.
6. **`DATABASE_URL` must be set for standalone scripts.** The driver and the
   verify scripts import engine modules that read `lib/db.ts`'s `sql`, which
   is `null` unless `DATABASE_URL` is in the process env (Next.js loads
   `.env`; plain `node` scripts do not). Without it the in-process lookup
   returns 0 records. `drive-benchmark-workflow.mjs` now bootstraps it;
   the verify scripts document it in their header comment.

## Prerequisite verification + baseline re-record (t_0b5a3e9c, 2026-08-21)

Pre-change verification for the benchmark-change happy-path test. All checks
executed live against the dev server (`http://localhost:3000`) and local PG17
after the unauthorized-access test (t_92eec771) restored the baseline.

### Test portfolio — accessible

- `c4707067-b98a-4a0f-92c7-5ee510dc70ff` (Pensioenfonds Horizon HOR-RP,
  Rendementsportefeuille) found active in `portfolios`, client Pensioenfonds
  Horizon; `client_config.portfolio_configuration` row `HOR*EQACX*EIG`
  (HORRP) active.
- UI: `/admin/client-config` (admin) shows HORRP row → **MSCI World Net
  Return / MSCI-WORLD-NR**.

### Accounts — both log in / act

- Change manager `e2e:change_manager` (Chris Change): create benchmark
  change request → HTTP 200 (`verify-change-manager-account.mjs` ALL PASS).
- Account manager `e2e:account_manager` (Arjan Accountmanager): session
  verifies, claim+approve+reject allowed, create 403, no admin
  (`verify-account-manager-account.mjs` 15/15 PASS).

### Baseline benchmark value (recorded before any new change request)

| Source | Portfolio | Current benchmark | Code |
|--------|-----------|-------------------|------|
| `portfolios` (legacy) | HOR-RP | MSCI World Net Return | `MSCI-WORLD-NR` |
| `client_config.portfolio_configuration` | HOR*EQACX*EIG (HORRP) | MSCI World Net Return | `MSCI-WORLD-NR` |
| `portfolios` (legacy) | HOR-MP | Bloomberg Euro Aggregate | `BLOOMBERG-EU-AGG` |
| `client_config.portfolio_configuration` | HOR*FISOV*EIG (HORMP) | Bloomberg Euro Aggregate | `BLOOMBERG-EU-AGG` |
| `portfolios` (legacy) | ZEK-RET | MSCI ACWI Net Return | `MSCI-ACWI-NR` |

Change requests at baseline: 1 draft / 1 processed / 34 submitted (no new
request created by this task's probes — the account-verify scripts only add
workflow instances, which is documented as expected).

### Environment blocker found & fixed during this task

The dev server returned HTTP 500 on **every** route (root, catalog, API)
because the untracked WIP route
`app/change-catalog/benchmark-wijziging/start/page.tsx` (created by a prior
t_01a05c9e attempt) had:
1. a stray `</div>` closing tag (JSX fragment imbalance) — Turbopack compile
   error `Expected '>', got 'ident'`, and
2. `"use client"` at the top while importing server-only modules
   (`@/lib/db` → `postgres` → Node `fs`) and defining a server action inline
   — browser-bundle error `Can't resolve 'fs'`.

**Fix applied (t_0b5a3e9c):** split the file into the codebase-standard
pattern — server component `page.tsx` (flag/sql/identity gating) + client
form `start-form.tsx` + `"use server"` action module `actions.ts`
(`startBenchmarkChange`). Dev server fully recovered: `/`, `/change-catalog`,
`/change-catalog/benchmark-wijziging/start`, detail-by-id and the runtime
start page all HTTP 200; API `POST /api/workflows/benchmark-change` works
(account-verify script re-ran ALL PASS after the fix).

> **Note for downstream tasks:** the static slug route
> `/change-catalog/benchmark-wijziging` (untracked WIP detail page) renders a
> 404 body while the by-id route `/change-catalog/060f70fc-...` works. The
> catalog card's primary CTA ("Aanvragen") points at the working
> `/workflow-runtime/{versionId}/start`; the slug link is a cosmetic WIP
> artifact, not a blocker for the API-driven happy-path test.

### Screenshots (baseline evidence)

Stored in `/tmp/bcm-baseline-shots-r2/`:
`admin_client_config_baseline.png` (HOR-RP → MSCI-WORLD-NR),
`change_catalog_list.png`, `change_catalog_benchmark_wijziging.png`,
`benchmark_wijziging_start_form.png`.

### Conclusion

All prerequisites for the benchmark-change happy-path test are confirmed:
portfolio accessible, both test accounts log in and act with correct
permissions, baseline benchmark value recorded (MSCI-WORLD-NR for HOR-RP),
and the environment blocker (broken WIP start page) that would have taken
down the downstream tasks is fixed.
