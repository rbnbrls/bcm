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

| Account / role | Display name | Permissions (relevant) | Can |
|----------------|--------------|------------------------|-----|
| Change manager | Chris Change | `workflow:start`, `workflow:tasks:execute`, ... | create benchmark change requests |
| Account manager | Arjan Accountmanager | `workflow:approve`, `workflow:tasks:execute`, ... | approve / reject pending requests |
| Admin | Bert Beheerder | `admin:access`, `workflow:manage`, ... | manage (no `workflow:start`, no `workflow:approve`) |
| Unauthorized (e.g. `viewer`) | — | none | nothing (403 on every benchmark-change action) |

> **Important — client scope.** The benchmark-change API requires the identity
> to have a client claim (`bcm:client:*`) that overlaps the workflow's client
> scope. Without it the request fails with HTTP 500
> `Identiteit heeft geen client scope`. The e2e identity factory
> (`tests/e2e/identity-session.ts`) currently issues only role claims, so the
> spec must add `bcm:client:HOR` (client code of Pensioenfonds Horizon) to
> the change-manager session. See `lib/workflow-studio-authorization.ts`
> (`getIdentityClientScope`) and the API route
> (`app/api/workflows/benchmark-change/route.ts`).

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

## Unauthorized test accounts

The "unauthorized" scenarios are covered by roles that exist but lack the
required permission:

- **Account manager** may NOT create requests (`workflow:start` missing) → 403.
- **Change manager** may NOT approve/reject (`workflow:approve` missing) → 403
  at the API; the UI hides the approve/reject buttons.
- **Admin** has neither `workflow:start` nor `workflow:approve` → 403.
- Anonymous (no session): identity falls back to the server-configured
  identity; in production it is `anonymous` with no role groups → 403.

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
