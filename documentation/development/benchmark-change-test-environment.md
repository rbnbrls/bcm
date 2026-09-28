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
| Unauthorized (e.g. `viewer`) | — | `e2e:viewer` (group `bcm:role:viewer`) | Same signed-session mechanism; `identitySessionCookie("viewer")` | none | nothing (403 on every benchmark-change action) |

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

## Approval flow test results (t_01a05c9e, 2026-08-21)

Executed live against the dev server (`http://localhost:3000`) and local PG17
using `scripts/drive-benchmark-workflow.mjs approve` (identity sessions forged
with the local-only e2e secret).

### Steps
1. Login as **change manager** (`e2e:change_manager`) and create a benchmark
   change request via `POST /api/workflows/benchmark-change` → HTTP 200.
2. Drive the instance through `start → lookup_portfolio → form_request →
   approval_account_manager` (`node scripts/drive-benchmark-workflow.mjs approve`).
3. Login as **account manager** (`e2e:account_manager`), claim the approval
   task, decide **approved** with comment "Goedgekeurd door driver test.".
4. Drive the automated `apply_change` (change_request) node and `end` node.

### Result (instance `d5d11809-f160-4f6b-ada4-0c29d36de105`)

| Check | Result |
|-------|--------|
| Create as change manager | HTTP 200 ✅ |
| Approval task | status `completed`, outcome **`approved`** ✅ |
| Decision variable | `approval_account_manager_decision = "approved"` ✅ |
| Instance final status | `completed` ✅ |
| **Benchmark updated?** | **NO** — `client_config.portfolio_configuration` (HOR\*EQACX\*EIG) and legacy `portfolios` row both still `MSCI-WORLD-NR` ❌ |
| Change intent | `workflow_change_intent.status = failed`, dry-run `invalid_intent` (`Intentversie, idempotency key, rationale, ingangsdatum en waarden zijn ongeldig.`) ❌ |

### Deviations (critical — must be recorded)

Three distinct defects block the approval happy path. None of them corrupts
baseline data (all 3 baselines re-verified unchanged after the runs).

1. **Date-only `effective_date` fails the mutation instant validation.**
   The API route binds `effective_date` as a `date`-typed start variable with
   value `YYYY-MM-DD` (e.g. `2026-09-19`). `executeChangeRequest` passes that
   raw string into `intent.effectiveAt`
   (`runtime-engine.ts` → `stringVariable(variables, "effective_date", ...)`).
   The mutation contract's `validInstant()` (`mutation-adapters.ts:188`)
   requires an ISO instant containing `T`
   (`!Number.isNaN(Date.parse(value)) && /T/.test(value)`), so a date-only
   value fails with `invalid_intent`. The mutation contract unit tests only
   ever use `T00:00:00.000Z` values and never caught this. The runtime must
   normalize a date-typed variable to a full ISO instant before building the
   intent (or `validInstant` must accept date-only values).
2. **Mutation dry-run authorizes on `workflow:test` — a studio permission the
   account manager does not hold.** `ClientConfigMutationContractService.dryRun`
   calls `authorizeWorkflowAction(identity, "workflow:test", scope)`
   (`mutation-adapters.ts:204`). `workflow:test` is only granted to
   `change_manager` (`lib/rbac-config.ts`); the account manager has
   `changes:approve`, `workflow:view`, `workflow:tasks:execute`,
   `workflow:approve` — not `workflow:test`. When the change_request node runs
   with the account manager identity (the realistic actor right after
   approval), the dry-run fails `mutation_not_authorized`
   (`De gebruiker mist de vereiste Workflow Studio-permissie.`). The change
   manager can pass the authz gate but is not the approver. The apply gate
   must be a runtime/business permission the approver holds
   (e.g. `workflow:approve`), or the change_request node must run under a
   distinct authorized identity.
3. **No mutation apply adapter is wired.** `WorkflowRuntimeMutationService.apply`
   is optional (`apply?: ...`, `runtime-engine.ts:250-252`) and
   `ClientConfigMutationContractService` does not implement it, so
   `this.mutations.apply` is `undefined` in production. Even if the intent
   validated, `applyChangeIntent` would return
   `apply_adapter_missing` (`Er is geen mutation apply-adapter geregistreerd
   voor deze runtime.`). The runtime can stage (dry-run) but cannot actually
   apply the portfolio_configuration UPDATE. The benchmark can never be
   updated through the runtime until a governed apply adapter is registered
   for `portfolio_configuration:UPDATE`.

Additionally, the driver itself (`drive-benchmark-workflow.mjs approve`)
unconditionally `succeed_node`s the change_request node and drives to `end`
regardless of the intent status, so the instance reports `completed` even
though the intent failed and the benchmark never changed — masking the
failure. A correct driver (or a worker) must stop when the intent is not
`validated`/`approved` and must call `applyChangeIntent` before succeeding
the node.

### Baseline after approval runs
Re-verified after all approval-driver runs (2026-08-21):

| Portfolio | Benchmark | Code |
|-----------|-----------|------|
| Rendementsportefeuille (HOR-RP) | MSCI World Net Return | `MSCI-WORLD-NR` (unchanged) |
| Matchingportefeuille (HOR-MP) | Bloomberg Euro Aggregate | `BLOOMBERG-EU-AGG` (unchanged) |
| Return portefeuille (ZEK-RET) | MSCI ACWI Net Return | `MSCI-ACWI-NR` (unchanged) |

### Verification commands
```bash
DATABASE_URL=postgres://bcm@localhost:5432/bcm node scripts/drive-benchmark-workflow.mjs approve
DATABASE_URL=postgres://bcm@localhost:5432/bcm node scripts/check-approval-prestate.mjs   # baselines + intent counts
DATABASE_URL=postgres://bcm@localhost:5432/bcm node scripts/check-approval-outcome.mjs <instanceId>
```

### Known environment issues (must be fixed before e2e runs green)

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
5. **Lookup "finds 2 records" with HOR scope.** The published
   `lookup_portfolio` node has `selection: one` but no filter/parentBinding,
   so it searches all portfolios scoped to the identity's client claims. The
   HOR client has two portfolios in scope (`HORRP` + `HORMP`), so the lookup
   fails with "verwacht precies één record, maar vond 2" (t_a706ed74,
   2026-08-20). Fix: add a filter (e.g. on `portfolio_code` from the form
   input) or a `parentBinding` that narrows to the selected portfolio. The
   change-manager account verification (`verify-change-manager-account.mjs`)
   is unaffected — it asserts the create/deny matrix, not the lookup.
6. **`DATABASE_URL` must be set for standalone scripts.** The driver and the
   verify scripts import engine modules that read `lib/db.ts`'s `sql`, which
   is `null` unless `DATABASE_URL` is in the process env (Next.js loads
   `.env`; plain `node` scripts do not). Without it the in-process lookup
   returns 0 records. `drive-benchmark-workflow.mjs` now bootstraps it;
   the verify scripts document it in their header comment.
