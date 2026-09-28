---
type: PostgreSQL Table
title: client_config.admin_audit_log
description: Out-of-band audit trail for admin bypass mutations on client_config.portfolio and parent_account reference rows.
tags: [audit, compliance, history, client-config]
timestamp: 2026-08-03T00:00:00Z
---

# Schema

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | `bigint` | `GENERATED ALWAYS AS IDENTITY, PRIMARY KEY` | Audit entry identifier. |
| `action` | `text` | `NOT NULL` | Mutation performed: `create_portfolio`, `retire_portfolio`, `hard_delete_portfolio`, `create_parent_account`, `update_parent_account`, `retire_parent_account`, `hard_delete_parent_account`. |
| `dimension` | `text` | `NOT NULL` | Affected dimension: `portfolio` or `parent_account`. |
| `code` | `text` | `NOT NULL` | The affected code (`portfolio_code` / `parent_account_code`). |
| `actor` | `text` | `NOT NULL, DEFAULT 'admin'` | Who performed the mutation (admin bypass helpers accept an optional actor). |
| `details` | `jsonb` | | Extra context — e.g. `parent_account_id` for portfolio CREATE, `msa_parent_account_code`, or before/after snapshots for `update_parent_account`. |
| `created_at` | `timestamptz` | `NOT NULL, DEFAULT now()` | When the mutation was recorded. |

# Relationships

- Standalone table in the `client_config` schema. Unlike `audit_log`, it has **no**
  `change_request_id` FK: admin bypass actions are emergency direct CRUD that happens
  outside the governed change-request flow.

# Indexes

| Index | Columns | Purpose |
|-------|---------|---------|
| `idx_admin_audit_log_dim_code` | `dimension, code` | Lookup audit history for a specific code/dimension. |
| `idx_admin_audit_log_created` | `created_at` | Chronological queries. |

# Usage

The governed change-request flow is audited via `audit_log`, `status_history` and the
staged `change_portfolio_metadata_request` rows (apply lineage). Admin bypass helpers in
`lib/client-config-db.ts` (`createClientConfigPortfolio`, `retireClientConfigPortfolio`,
`hardDeleteClientConfigPortfolio`, `createClientConfigParentAccount`,
`updateClientConfigParentAccount`, `retireClientConfigParentAccount`,
`hardDeleteClientConfigParentAccount`) mutate `client_config.portfolio` /
`parent_account` directly with no change request, so every mutation is recorded here
instead. See the lifecycle spec §6.6 and §9.2
([portfolio-parent-account-lifecycle-spec.md](/documentation/portfolio-parent-account-lifecycle-spec.md)).

The table is created by migration §18 (`scripts/migrate.mjs`) and in `db/init.sql` §12e.
The write path is best-effort: a failure is reported via `captureError` and never blocks
the admin action itself.

# Citations

[1] [init.sql — admin_audit_log table](/db/init.sql)
