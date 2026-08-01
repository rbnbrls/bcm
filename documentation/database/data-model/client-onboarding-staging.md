---
type: PostgreSQL Table
title: client_onboarding_staging
description: Staging table for onboarding genuinely new pension funds (client + initial portfolio) through the BCM change process. Rows move pending → applied/failed when the customer_onboarding change request is processed.
tags: [client-config, onboarding, staging, workflow]
timestamp: 2026-08-01T00:00:00Z
---

# Schema

Table: `client_config.client_onboarding_staging` — one row per pending onboarding request. A row is created when a `customer_onboarding` change request is staged, and is consumed by the apply step of `processChangeForProcessedStatus` once the request is approved and processed.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `staging_id` | `bigint` | `GENERATED ALWAYS AS IDENTITY, PRIMARY KEY` | Unique staging record identifier. |
| `change_request_id` | `uuid` | `NOT NULL, UNIQUE, REFERENCES change_requests(id) ON DELETE CASCADE` | The change request that carries the onboarding through approval. At most one staging row per change request. |
| `client_code` | `varchar(3)` | `NOT NULL, CHECK ^[A-Z0-9]{1,3}$` | New client short code (becomes `client_config.client.client_code`). |
| `client_name` | `varchar(100)` | `NOT NULL, CHECK ^[^\r\n]{1,100}$` | New client display name (becomes `client_config.client.client_name`). |
| `portfolio_code` | `varchar(15)` | `NOT NULL, CHECK ^[A-Z0-9]{2,15}$` | Initial portfolio code (becomes `client_config.portfolio.portfolio_code`). |
| `parent_account_code` | `varchar(16)` | `CHECK ^[A-Z0-9]+(?:_[A-Z0-9]+)*$` | Optional parent account for the initial portfolio. Stored as a code (not an FK): resolved to `client_config.parent_account.parent_account_id` at apply time, creating the parent account if it does not exist. |
| `asset_class_code` | `char(2)` | `NOT NULL, CHECK ^[A-Z]{2}$` | Asset class of the initial portfolio configuration. |
| `sub_asset_class_code` | `char(3)` | `NOT NULL, CHECK ^[A-Z]{3}$` | Sub asset class of the initial portfolio configuration. |
| `manager_code` | `char(3)` | `NOT NULL, CHECK ^[A-Z0-9]{3}$` | Manager of the initial portfolio configuration. |
| `benchmark_code` | `varchar(60)` | `NOT NULL, CHECK <> ''` | Benchmark of the initial portfolio configuration. |
| `npc_classification_id` | `smallint` | `NOT NULL` | NPC classification of the initial portfolio configuration. No FK on purpose (staging values may not exist in live tables yet); the live-table FK on `portfolio_configuration.npc_classification_id` validates it at apply time. |
| `long_name` | `varchar(255)` | `NOT NULL, CHECK ^[^\r\n]{1,255}$` | Long name for the initial portfolio configuration. |
| `short_name` | `varchar(100)` | `NOT NULL, CHECK ^[^\r\n]{1,100}$` | Short name for the initial portfolio configuration. |
| `effective_from` | `date` | `NOT NULL` | Effective date of the initial portfolio configuration. |
| `effective_until` | `date` | | Optional end date; `chk_onboarding_dates` requires `>= effective_from`. |
| `status` | `varchar(20)` | `NOT NULL, DEFAULT 'pending', CHECK IN ('pending','applied','failed')` | Apply lifecycle status. |
| `apply_error` | `text` | | Error message captured when the apply step fails (status `failed`). |
| `created_at` | `timestamptz` | `NOT NULL, DEFAULT now()` | Row creation timestamp. |
| `updated_at` | `timestamptz` | `NOT NULL, DEFAULT now()` | Last update timestamp. |
| `processed_at` | `timestamptz` | | Timestamp of the apply attempt (set together with status `applied`/`failed`). |

# Idempotency

The table enforces idempotency at the database level with:

```sql
CONSTRAINT uq_onboarding_client_status UNIQUE (client_code, status)
```

- **At most one `pending` row per client code** — a duplicate onboarding request for the same client is rejected, so re-submitting or re-processing cannot create a second pending record.
- **At most one `applied` row per client code** — re-processing an already applied change finds the existing `applied` row and is skipped (the apply logic checks `client_config.client` existence first, and the unique constraint is the backstop).
- **At most one `failed` row per client code** — a failed apply stays on the row (status flipped to `failed` with `apply_error`), and a retry updates the same row rather than inserting a new one.

# Relationships

- Many-to-one with [change_requests](change-requests.md) via `change_request_id` (ON DELETE CASCADE; UNIQUE → 1:1 in practice).
- Produces (at apply time): `client_config.client`, `client_config.portfolio`, `client_config.parent_account` (optional), and `client_config.portfolio_configuration`.
- Mirrors the staged-data pattern of `client_config.change_lookup_request` (values do not need to exist in live tables yet).

# Indexes

| Index | Columns | Purpose |
|-------|---------|---------|
| (implicit, PK) | `staging_id` | Primary key lookup. |
| (implicit, UNIQUE) | `change_request_id` | Lookup by change request; enforces one staging row per request. |
| (implicit, UNIQUE) | `(client_code, status)` | Idempotency guard and client-code-prefixed lookups (pending per client, applied per client). |

# Apply Semantics

Status lifecycle: `pending` → (`applied` | `failed`).

- `pending` — staged, awaiting approval/processing of the `customer_onboarding` change request.
- `applied` — the apply step (invoked from `processChangeForProcessedStatus`) inserted the client, the portfolio metadata, and the initial `portfolio_configuration` row in one transaction, then flipped this row to `applied`.
- `failed` — the apply step rolled back the transaction and recorded the error in `apply_error`.

# Usage

- **Write**: `saveClientOnboardingStaging()` in [lib/onboarding-staging-db.ts](/lib/onboarding-staging-db.ts) inserts rows with status `pending`. A duplicate `pending` row for the same client code raises `DuplicateClientOnboardingError` (the DB unique constraint `uq_onboarding_client_status` is the authoritative backstop).
- **Read**: `getClientOnboardingStagingByStagingId()` (by primary key, returns `null` when absent) and `getClientOnboardingStagingByClientCode()` (all rows for a client, optionally filtered by status).
- **Update**: `updateClientOnboardingStaging()` changes status and/or metadata (`status`, `apply_error`, `processed_at`, portfolio metadata fields); returns the updated row or `null`.
- **Delete**: `deleteClientOnboardingStaging()` removes a row by `staging_id`, returning whether a row was deleted.
- All helpers use parameterized queries (postgres.js tagged templates) — no string interpolation of user input. Unit tests in [tests/onboarding-staging-crud.test.ts](/tests/onboarding-staging-crud.test.ts) and DB-backed integration tests in [tests/onboarding-staging-db-integration.test.ts](/tests/onboarding-staging-db-integration.test.ts).
- **Apply**: the change processor reads the staging row for a processed `customer_onboarding` change request, applies it inside a transaction, and updates `status` + `processed_at` (`apply_error` on failure).

# Citations

[1] [scripts/migrate.mjs — client_onboarding_staging DDL](/scripts/migrate.mjs)
[2] [db/clientconfig_schema.sql — client_onboarding_staging DDL](/db/clientconfig_schema.sql)
[3] [Client Configuration Architecture — §4 Schema Overview](/documentation/client-configuration-architecture.md)
