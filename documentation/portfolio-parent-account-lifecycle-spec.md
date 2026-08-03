# Create / Update / Retire Semantics for `client_config.portfolio` and `client_config.parent_account`

> **Purpose:** Specify the governed lifecycle operations (create, update, retire) for
> `client_config.portfolio` and `client_config.parent_account` rows, aligned with the
> existing BCM change-request framework.
>
> **Author:** Hermes Agent · kanban task t_640b0d73
> **Repo:** rbnbrls/bcm
> **Status:** Implemented design reference. The stage/apply helpers described here are
> live on `main` (lib/client-config-db.ts, lib/change-processor.ts, scripts/migrate.mjs §17);
> this document is the authoritative decision record that downstream migration and
> frontend work (tasks t_d2726f9c, t_5cb38133, t_4fbdd465, t_9b9c3aaf) implement against.

---

## 1. Current State (verified against origin/main @ e417149 and the live DB)

Both tables are reference tables with soft-delete support. `active_ind` was added by
`scripts/migrate.mjs` step 17 (`ADD COLUMN IF NOT EXISTS active_ind boolean NOT NULL DEFAULT true`)
and the staging table `client_config.change_portfolio_metadata_request` is created by the
same migration step. The canonical schema file `db/clientconfig_schema.sql` does **not yet**
contain these columns/table (documented drift G9 in
`documentation/client-configuration-architecture.md`) — the DB migration task closes that gap.

### 1.1 `client_config.parent_account`

| Column | Type | Constraints |
|--------|------|-------------|
| `parent_account_id` | `bigint` | PK, `GENERATED ALWAYS AS IDENTITY` |
| `parent_account_code` | `varchar(16)` | **NOT NULL**, **UNIQUE**, pattern `^[A-Z0-9]+(?:_[A-Z0-9]+)*$` |
| `msa_parent_account_code` | `varchar(16)` | Nullable, pattern `^[A-Z0-9]+(?:_[A-Z0-9]+)*$` |
| `active_ind` | `boolean` | **NOT NULL**, default `true` |

### 1.2 `client_config.portfolio`

| Column | Type | Constraints |
|--------|------|-------------|
| `portfolio_id` | `bigint` | PK, `GENERATED ALWAYS AS IDENTITY` |
| `portfolio_code` | `varchar(15)` | **NOT NULL**, **UNIQUE**, pattern `^[A-Z0-9]{2,15}$` |
| `parent_account_id` | `bigint` | Nullable, FK → `parent_account(parent_account_id)` |
| `active_ind` | `boolean` | **NOT NULL**, default `true` |

### 1.3 Foreign-Key Chains

```
parent_account                              portfolio
├─ parent_account_code (UNIQUE)             ├─ portfolio_code (UNIQUE)
├─ parent_account_id (PK)                   ├─ portfolio_id (PK)
│  ↑ referenced by                          │  ↑ referenced by
│  └─ portfolio.parent_account_id (FK)      │  ├─ portfolio_configuration.portfolio_code (FK)
│                                           │  └─ account.portfolio_id (FK)
│                                           │
│                                           └─ parent_account_id (FK) → parent_account
```

Indirect read dependency: `getClientConfigPortfolioConfigurations()` (lib/client-config-db.ts)
LEFT JOINs `parent_account` on `parent_account_id` to surface `parent_account_code` on each
portfolio configuration row.

### 1.4 Existing Read Filters

All active-read queries already filter `active_ind = true`:

- `getClientConfigReferenceData()` → `SELECT ... FROM client_config.portfolio WHERE active_ind = true`
  and `... FROM client_config.parent_account WHERE active_ind = true`
- `getClientConfigPortfolioConfigurations()` → `WHERE pc.active_ind = true`

---

## 2. Required / Optional Fields

### 2.1 `parent_account` — CREATE

| Field | Required | Notes |
|-------|----------|-------|
| `parentAccountCode` | Yes | `varchar(16)`, unique, uppercase alphanumeric + underscore, 1–16 chars |
| `msaParentAccountCode` | No | `varchar(16)`, optional, same pattern |

### 2.2 `portfolio` — CREATE

| Field | Required | Notes |
|-------|----------|-------|
| `portfolioCode` | Yes | `varchar(15)`, unique, uppercase alphanumeric, 2–15 chars |
| `parentAccountId` | No | Bigint FK; when provided must reference an **active** `parent_account` |

---

## 3. Uniqueness Constraints

| Table | Constraint | Type | Notes |
|-------|-----------|------|-------|
| `parent_account` | `parent_account_code` | **Unique** | No two rows (active **or** retired) may share a code |
| `portfolio` | `portfolio_code` | **Unique** | No two rows (active **or** retired) may share a code |

Both are **global uniqueness** — not scoped by `active_ind`. The code is the identity, so a
retired row keeps its code reserved (prevents reuse confusion with historical data).

There are **no composite uniqueness rules** on either table (single-column unique keys only).

---

## 4. Admin-Only vs User-Requestable Boundary

In the governed change flow:

| Operation | `parent_account` | `portfolio` |
|-----------|-----------------|-------------|
| **CREATE** (new code) | User-requestable via change request | User-requestable via change request |
| **UPDATE** `msaParentAccountCode` | Admin-only today (see §6.4) | N/A |
| **UPDATE** `parentAccountId` | N/A | Admin-only (changes FK structure) — no governed path |
| **UPDATE** `parentAccountCode` / `portfolioCode` | Admin-only (code is identity; cascading impact) | Admin-only (code is identity; FK target of `portfolio_configuration`) |
| **RETIRE** | User-requestable via change request | User-requestable via change request |
| **Hard DELETE** (unreferenced) | Admin-only | Admin-only |

Rationale: `portfolio_code` is an FK target of `portfolio_configuration.portfolio_code` and
`portfolio_id` is an FK target of `account.portfolio_id`. Changing a code would require a
coordinated update of all referencing rows, so code changes are treated as identity changes
(create-new + retire-old) rather than in-place updates, except through the admin bypass.

---

## 5. Retire Semantics (Soft-Delete)

### 5.1 Mechanism

**Soft-delete** via `active_ind = false`. Rows are never physically removed through the
governed flow. Hard-delete exists only as an admin-only emergency path and only when no
references remain.

| Table | Retire action | Pre-condition |
|-------|---------------|---------------|
| `parent_account` | `SET active_ind = false` | No **active** portfolios reference this parent account |
| `portfolio` | `SET active_ind = false` | No **active** `portfolio_configuration` rows reference this `portfolio_code`; **no** `account` rows reference this `portfolio_id` |

If a pre-condition fails, the retire is **blocked** with a Dutch error message (see §7).

### 5.2 Retirement Reversal (Re-activate)

Setting `active_ind = true` on a retired row is allowed when the code is still unique
(always true — codes are globally unique) and the row still passes the inverse of the
retire pre-conditions. Re-activation is **admin-only**.

### 5.3 Dependent Rows

- Retiring a `portfolio` does **not** touch its `portfolio_configuration` rows (they are
  checked, not mutated). Accounts remain linked to the retired portfolio row.
- Retiring a `parent_account` does **not** touch its portfolios (they are checked, not
  mutated). Portfolios that referenced it keep their `parent_account_id`; the parent
  account simply no longer appears in active reference data.
- Hard-delete of a `parent_account` requires **zero** portfolio rows referencing it.
- Hard-delete of a `portfolio` requires **zero** `portfolio_configuration` rows and **zero**
  `account` rows referencing it.

### 5.4 Query Impact

All active reads must continue to filter `active_ind = true` (already the case, §1.4).
New queries added by downstream work must follow the same rule.

---

## 6. Alignment with the Change-Request Framework

### 6.1 Staging Table

`client_config.change_portfolio_metadata_request` (created by `scripts/migrate.mjs` §17):

```sql
CREATE TABLE IF NOT EXISTS client_config.change_portfolio_metadata_request (
  id                   bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  change_request_id    uuid NOT NULL REFERENCES change_requests(id) ON DELETE CASCADE,
  dimension            varchar(20) NOT NULL CHECK (dimension IN ('portfolio', 'parent_account')),
  action_type          varchar(10) NOT NULL CHECK (action_type IN ('CREATE', 'RETIRE')),
  code                 varchar(16) NOT NULL,
  parent_account_code  varchar(16),
  msa_parent_account_code varchar(16),
  apply_status         varchar(10) NOT NULL DEFAULT 'pending'
                       CHECK (apply_status IN ('pending', 'applied', 'failed')),
  apply_error          text,
  created_at           timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_cpmp_change_request_id
  ON client_config.change_portfolio_metadata_request(change_request_id);
```

Design rationale:

- Separate from `change_lookup_request` because portfolio/parent_account have a different
  lifecycle (CREATE + RETIRE now; UPDATE of specific fields is a documented future phase).
- `action_type` discriminates CREATE (new code) from RETIRE (deactivate). UPDATE is **not**
  a valid `action_type` in the current schema — governed updates are out of scope today and
  would require a schema change (`CHECK` widening) plus a stage/apply extension.
- For portfolio CREATE, `parent_account_code` (human-readable) is resolved to
  `parent_account_id` at apply time — the staging interface uses codes, the live table uses IDs.

### 6.2 Stage Function

`stagePortfolioMetadataChange(input)` in `lib/client-config-db.ts`:

```typescript
function stagePortfolioMetadataChange(input: {
  changeRequestId: string;
  dimension: 'portfolio' | 'parent_account';
  actionType: 'CREATE' | 'RETIRE';
  code: string;
  parentAccountCode?: string | null;    // portfolio only
  msaParentAccountCode?: string | null; // parent_account only
}): Promise<{ ok: true; id: string } | { ok: false; issues: string[] }>
```

Validation rules (order matters; first failure short-circuits to `{ ok: false }` after
collecting format issues):

1. **Format** — code matches the DB regex for the dimension (portfolio `^[A-Z0-9]{2,15}$`,
   parent_account `^[A-Z0-9]+(?:_[A-Z0-9]+)*$`); optional `parentAccountCode` /
   `msaParentAccountCode` values, when non-empty, are length- and pattern-checked.
2. **Uniqueness (CREATE)** — code must not exist in an **active or retired** row of the target table.
3. **Parent-account exists + active (portfolio CREATE with `parentAccountCode`)** — the
   referenced parent account must exist with `active_ind = true`.
4. **Retire pre-conditions (RETIRE)** — §5.1 checks: no active `portfolio_configuration`
   rows for a portfolio; no `account` rows for a portfolio; no active portfolios for a
   parent account.
5. **Duplicate staging** — no other open change request (status not in
   `('processed', 'validated')`) may already stage the same `dimension` + `code`.

On success the row is inserted with `apply_status = 'pending'` and the new `id` is returned.

### 6.3 Apply Function

`applyChangePortfolioMetadataRequests(changeRequestId)` in `lib/client-config-db.ts`:

- Runs inside **one transaction** (`sql.begin`).
- Sets `SET LOCAL app.change_process_bypass = 'true'` (mirrors the
  `portfolio_configuration` pattern; required for future enforcement triggers).
- For each staged row:
  - `CREATE` + `portfolio`: resolve `parent_account_code → parent_account_id` (active row
    only; null when absent), then `INSERT INTO portfolio (portfolio_code, parent_account_id, active_ind) VALUES (…, true)`.
  - `CREATE` + `parent_account`: `INSERT INTO parent_account (parent_account_code, msa_parent_account_code, active_ind) VALUES (…, true)`.
  - `RETIRE` + `portfolio`: `UPDATE portfolio SET active_ind = false WHERE portfolio_code = …`.
  - `RETIRE` + `parent_account`: `UPDATE parent_account SET active_ind = false WHERE parent_account_code = …`.
  - Mark the staged row `apply_status = 'applied'` (or `'failed'` + `apply_error` on error).
- Returns `ApplyChangeResult` (`success` = no row failed).

The apply function is invoked from `processChangeForProcessedStatus()` in
`lib/change-processor.ts` when the change request transitions to **`processed`**, after the
customer-onboarding branch and before the lookup/config branches.

### 6.4 Admin-Only Bypass (Direct CRUD)

Existing in `lib/client-config-db.ts` (all admin-only, bypass staging):

| Function | Action | Notes |
|----------|--------|-------|
| `createClientConfigPortfolio({portfolioCode, parentAccountId?})` | INSERT | Uniqueness-checked; `active_ind = true` |
| `retireClientConfigPortfolio(portfolioCode)` | `SET active_ind = false` | Same pre-conditions as §5.1 |
| `hardDeleteClientConfigPortfolio(portfolioCode)` | DELETE | Only when no `portfolio_configuration` / `account` rows exist |
| `createClientConfigParentAccount({parentAccountCode, msaParentAccountCode?})` | INSERT | Uniqueness-checked; `active_ind = true` |
| `updateClientConfigParentAccount(parentAccountId, {parentAccountCode?, msaParentAccountCode?})` | UPDATE | Code change allowed here (admin); `COALESCE`-style partial patch; null `msaParentAccountCode` clears it |
| `retireClientConfigParentAccount(parentAccountCode)` | `SET active_ind = false` | Same pre-conditions as §5.1 |
| `hardDeleteClientConfigParentAccount(parentAccountCode)` | DELETE | Only when no portfolios reference it |

There is **no** `updateClientConfigPortfolio` helper: portfolio code and `parentAccountId`
changes are not exposed even as admin CRUD today (identity/structural change → handled by
retire + create). `updateClientConfigParentAccount` is the only update helper and is
admin-only.

### 6.5 Change-Process Enforcement (Future)

Enforcement triggers on `portfolio` / `parent_account` (modelled on
`db/enforce_change_process.sql` for `portfolio_configuration`) are **deferred** until the
governed paths are stable in production. Staging order: governed paths first → migrate
admin workflows → activate triggers in a follow-up PR. The apply function already sets the
bypass GUC so trigger activation later is drop-in.

### 6.6 Audit History

- **Request record:** the `change_requests` row carries `requested_by`, `rationale`,
  `effective_date`, status timeline, and `fields` JSON.
- **Status transitions:** `status_history` records `from_status` / `to_status` /
  `changed_by` / `changed_at` for every transition.
- **Approvals:** `approvals` rows record `approver`, `decision`, `remarks`.
- **Apply lineage:** each staged `change_portfolio_metadata_request` row keeps
  `apply_status`, `apply_error`, `created_at`, and the `change_request_id` FK, giving a
  per-row audit trail of what was applied (or why it failed).
- **Generic audit:** `audit_log` captures `action`, `actor`, `previous_status`,
  `new_status`, `diff_snapshot` per change request.

---

## 7. Error Messages (Dutch)

Exact strings implemented in `lib/client-config-db.ts`:

| Scenario | Message |
|----------|---------|
| Portfolio code format/length invalid | `Portfolio code "{code}" voldoet niet aan het verwachte formaat (hoofdletters of cijfers, 2-15 tekens).` / `Code "{code}" moet 2-15 tekens zijn.` |
| Parent-account code format/length invalid | `Parent account code "{code}" voldoet niet aan het verwachte formaat (hoofdletters, cijfers en underscores).` / `Code "{code}" moet 1-16 tekens zijn.` |
| Duplicate portfolio_code on CREATE | `Portfolio code "{code}" bestaat al.` |
| Duplicate parent_account_code on CREATE | `Parent account code "{code}" bestaat al.` |
| Parent account not found / not active (portfolio CREATE) | `Ouderaccount "{code}" bestaat niet of is niet actief.` |
| Portfolio has active config rows (RETIRE blocked) | `Portfolio "{code}" heeft nog actieve portfolio configuraties. Verwijder of archiveer deze eerst.` |
| Portfolio linked to accounts (RETIRE blocked) | `Portfolio "{code}" is gekoppeld aan actieve rekeningen. Verwijder of archiveer deze eerst.` |
| Parent account has active portfolios (RETIRE blocked) | `Parent account "{code}" heeft nog actieve portfolios. Archiveer deze eerst.` |
| Invalid optional parent-account code format | `Ouderaccount code "{code}" voldoet niet aan het verwachte formaat.` |
| Invalid optional MSA code format | `MSA parent account code "{code}" voldoet niet aan het verwachte formaat.` |
| Already staged in open change request | `Portfolio code "{code}" is al eerder aangevraagd in een open change.` / `Parent account code "{code}" is al eerder aangevraagd in een open change.` |

---

## 8. TypeScript Type Definitions

Already implemented in `lib/types.ts`:

```typescript
export interface ClientConfigParentAccount {
  parentAccountId: number;
  parentAccountCode: string;
  msaParentAccountCode: string | null;
  activeInd: boolean;
}

export interface ClientConfigPortfolio {
  portfolioId: number;
  portfolioCode: string;
  parentAccountId: number | null;
  activeInd: boolean;
  parentAccount?: ClientConfigParentAccount;
}

export interface ChangePortfolioMetadataRequest {
  id: number;
  changeRequestId: string;
  dimension: 'portfolio' | 'parent_account';
  actionType: 'CREATE' | 'RETIRE';
  code: string;
  parentAccountCode: string | null;    // portfolio only
  msaParentAccountCode: string | null; // parent_account only
  applyStatus: 'pending' | 'applied' | 'failed';
  applyError: string | null;
  createdAt: string;
}
```

---

## 9. Worked Examples

### 9.1 Retiring a `parent_account` that still has active `portfolio` rows

Setup: `parent_account` row `PA001` (active), `portfolio` row `PF001`
(`parent_account_id → PA001`, `active_ind = true`).

**Attempted retire via change request:**

1. User stages `stagePortfolioMetadataChange({ changeRequestId, dimension: 'parent_account',
   actionType: 'RETIRE', code: 'PA001' })`.
2. Validation rule 4 fires: the subquery
   `SELECT 1 FROM client_config.portfolio WHERE parent_account_id = (SELECT parent_account_id FROM client_config.parent_account WHERE parent_account_code = 'PA001') AND active_ind = true`
   returns `PF001` → issue pushed:
   `Parent account "PA001" heeft nog actieve portfolios. Archiveer deze eerst.`
3. `stagePortfolioMetadataChange` returns `{ ok: false, issues: [ … ] }`. **No staging row
   is written**, so the change request contains no applyable metadata and nothing is retired.

**Correct sequence:**

1. Retire `PF001` first (user-requestable): stage
   `{ dimension: 'portfolio', actionType: 'RETIRE', code: 'PF001' }` → validation passes
   (no active `portfolio_configuration` rows, no `account` rows) → row staged `pending`.
2. Stage the parent-account retire
   `{ dimension: 'parent_account', actionType: 'RETIRE', code: 'PA001' }` → validation now
   passes because no **active** portfolio references `PA001`.
3. Change request reaches `processed` → `applyChangePortfolioMetadataRequests()` in one
   transaction sets `portfolio.active_ind = false` for `PF001`, then
   `parent_account.active_ind = false` for `PA001`; both staging rows marked `applied`.
4. Both rows remain in the tables (soft-delete); codes stay reserved.

**Admin bypass alternative:** `retireClientConfigParentAccount('PA001')` throws the same
Dutch error while `PF001` is active — the pre-condition is enforced identically in both paths.

### 9.2 Updating a field that is referenced elsewhere (`parent_account_code`)

Setup: `parent_account` row `PA001` is referenced by `portfolio` row `PF001`
(`parent_account_id → PA001`) and surfaced via the `getClientConfigPortfolioConfigurations()`
LEFT JOIN. `PA001` is also the FK target identity for nothing else (FK is by ID).

**Why the governed flow does not allow it:** the staging table's `action_type` CHECK only
accepts `('CREATE','RETIRE')`; there is no `UPDATE` action. A code change is an identity
change — the `portfolio` rows keep their `parent_account_id` FK (ID-based, so the FK itself
does not break), but every read surface that displays `parent_account_code` (reference data,
portfolio configuration join, downstream reporting) would instantly show the new value with
no audit trail if done outside the framework.

**Admin-only path (implemented):**
`updateClientConfigParentAccount(1, { parentAccountCode: 'PA001B' })`:

- `UPDATE client_config.parent_account SET parent_account_code = 'PA001B' WHERE parent_account_id = 1`
  (COALESCE semantics: only provided fields change; `msaParentAccountCode` unchanged).
- Uniqueness is enforced by the `parent_account_code` UNIQUE constraint — if `PA001B` were
  already taken, the UPDATE raises a constraint violation, which the helper surfaces as an
  error.
- `portfolio.parent_account_id` values are untouched (FK by ID), so no cascade is needed.
- Audit: the admin action must be recorded out-of-band (e.g. `audit_log` entry); the
  governed flow cannot represent this change today by design.

**Recommended governed pattern for code changes (future):** treat as RETIRE (old code) +
CREATE (new code) in one change request, applied atomically — matching the §9.1 flow and
preserving a full audit trail.

---

## 10. Acceptance Criteria (for downstream implementation tasks)

1. `active_ind` columns + `change_portfolio_metadata_request` DDL present in the canonical
   schema (`db/clientconfig_schema.sql`), matching §6.1 and the live DB (closes drift G9).
2. `stagePortfolioMetadataChange()` validates all pre-conditions (§6.2) and stages the row.
3. `applyChangePortfolioMetadataRequests()` handles CREATE and RETIRE in one transaction
   with the bypass GUC (§6.3).
4. Duplicate-staging detection (same dimension + code in another open change request) works
   for both dimensions.
5. Admin-only bypass functions exist for emergency mutation (§6.4); no governed UPDATE path.
6. All existing and new queries filter `active_ind = true` (§1.4, §5.4).
7. Error messages match §7 exactly (Dutch).
8. Change-process enforcement triggers are **not** activated yet (deferred, §6.5).
9. Types match §8 (already implemented in `lib/types.ts`).

---

## 11. Implementation Sequence (downstream tasks)

| Step | Task | Description |
|------|------|-------------|
| 1 | t_d2726f9c | Add `active_ind` columns + staging table to canonical schema (migrate.mjs §17 already has the DDL; align `db/clientconfig_schema.sql` and `db/init.sql`) |
| 2 | t_5cb38133 | Validation helpers callable from backend and frontend (stage/apply already in `client-config-db.ts`; expose/shared-validate as needed) |
| 3 | t_4fbdd465 | Frontend forms / onboarding integration calling `stagePortfolioMetadataChange` |
| 4 | t_9b9c3aaf | Wire into change-request processed pipeline (already dispatched from `processChangeForProcessedStatus`; verify ordering + statuses) |

### 11.1 Shared validation module (step 2 — implemented)

`lib/portfolio-metadata-validation.ts` is the single source of truth for the
stage-time rules in §6.2 and the Dutch messages in §7:

- **Pure format validators** — `validateCodeFormat(code, dimension)`,
  `validateOptionalMetadataCodes(input)`, `validatePortfolioMetadataFormat(input)`.
  No DB access; safe to import from client components for instant inline
  feedback.
- **`PortfolioMetadataLookup` interface** — the DB-backed predicates
  (`codeExists`, `parentAccountActive`, `portfolioHasActiveConfigurations`,
  `portfolioHasAccounts`, `parentAccountHasActivePortfolios`,
  `alreadyStagedInOpenChange`). Backend supplies a SQL-backed implementation
  (`createPortfolioMetadataLookup` in `client-config-db.ts`); a frontend form
  can supply an API-backed one so the same rules run on both sides.
- **`validatePortfolioMetadataChange(input, lookup)`** — the full pipeline
  (format → uniqueness → FK → retire pre-conditions → duplicate staging),
  returning the §7 issues.

Backend helpers (`stagePortfolioMetadataChange`, `createClientConfigPortfolio`,
`createClientConfigParentAccount`, `retireClientConfigPortfolio`,
`retireClientConfigParentAccount`) all route their checks through this module,
so governed and admin paths enforce identical rules.

Frontend uniqueness pre-checks for the parent-account identifier ride the
existing `/api/validate-code-uniqueness` route: it now accepts
`parentAccountCode` (same response shape as the other codes), and
`useCodeUniqueness` / `UniqueCodeField` support the `parent_account` kind.
