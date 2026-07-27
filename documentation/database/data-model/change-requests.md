---
type: PostgreSQL Table
title: change_requests
description: Benchmark change request records. The central workflow entity tracking all client-initiated benchmark changes from draft through validation.
tags: [workflow, change-request, core]
timestamp: 2026-07-27T00:00:00Z
---

# Schema

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | `uuid` | `PRIMARY KEY` | Globally unique change request identifier. |
| `reference` | `text` | `NOT NULL, UNIQUE` | Human-readable reference identifier. |
| `change_type_id` | `uuid` | `NOT NULL, REFERENCES change_type_config(id)` | Link to change-type configuration (3NF: now REQUIRED; was nullable). |
| `client_id` | `uuid` | `NOT NULL, REFERENCES clients(id) ON DELETE CASCADE` | Owning client. |
| `requested_by` | `text` | `NOT NULL` | Name or identifier of the person who requested the change. |
| `rationale` | `text` | `NOT NULL` | Business justification for the change. |
| `effective_date` | `date` | `NOT NULL` | Target effective date for the change. |
| `status` | `text` | `NOT NULL, DEFAULT 'draft'` | Current lifecycle status (see CHECK constraints). |
| `sla_lead_weeks` | `integer` | `NOT NULL, DEFAULT 1` | SLA lead time in weeks for processing this request. |
| `status_updated_at` | `timestamptz` | `NOT NULL, DEFAULT now()` | Timestamp of the last status change. |
| `submitted_at` | `timestamptz` | | When the request was submitted. |
| `fields` | `jsonb` | `NOT NULL, DEFAULT '[]'` | Generic change-type field values (ist/soll pairs). |
| `stakeholders` | `jsonb` | `NOT NULL, DEFAULT '[]'` | Stakeholder assignments for this request. |
| `estimated_cost` | `numeric(10,2)` | | Estimated cost of the change. |
| `estimated_cost_currency` | `text` | `NOT NULL, DEFAULT 'EUR'` | Currency for the estimated cost. |
| `estimated_lead_days` | `integer` | | Estimated number of lead days. |
| `processed_at` | `date` | | When the change was processed. |
| `processed_by` | `text` | | Who processed the change. |
| `validated_at` | `date` | | When the change was validated. |
| `validated_by` | `text` | | Who validated the change. |
| `notification_sent` | `boolean` | `NOT NULL, DEFAULT false` | Whether the notification has been sent. |
| `created_at` | `timestamptz` | `NOT NULL, DEFAULT now()` | Record creation timestamp. |
| `sla_status` | `text` | | Cached SLA status (`ok`, `at_risk`, `overdue`), computed by trigger. |
| `sla_days_open` | `integer` | | Cached days since creation, computed by trigger. |

# 3NF Changes

**Resolved violation:** `change_type` text column was redundant with `change_type_id` FK. When `change_type_id` was set, `change_type` was transitively dependent on `change_type_config.name` — an update anomaly.

**Changed columns:**
| Old | New | Rationale |
|-----|-----|-----------|
| `change_type` `text NOT NULL` | removed | 3NF: redundant with `change_type_id → change_type_config.name` |
| `change_type_id` (nullable) | `change_type_id` `NOT NULL` | 3NF: now required for every row |

# Constraints

- `chk_cr_status_values` — Status must be one of: `draft`, `submitted`, `pending_approval`, `accepted`, `approved`, `rejected`, `in_progress`, `processed`, `validated`, `failed`.

# SLA Computation

SLA status and days-open are computed automatically by the `update_sla_status_trigger()` PL/pgSQL function:

- **Terminal rows** (`validated`, `processed`) → status always `ok`
- **Overdue** → remaining days ≤ 0
- **At risk** → remaining days ≤ 25% of total SLA
- **Ok** → otherwise

The trigger fires on `INSERT` or `UPDATE OF status, created_at, sla_lead_weeks`. A scheduled `scripts/refresh-sla.mjs` job handles time-based drift.

# Relationships

- Many-to-one with [clients](clients.md) via `client_id`
- Many-to-one with [change_type_config](change-type-config.md) via `change_type_id` (now mandatory)
- One-to-many with [change_request_items](change-request-items.md) via cascade
- One-to-many with [new_benchmark_requests](new-benchmark-requests.md) via cascade
- One-to-many with [audit_log](audit-log.md) via cascade
- One-to-many with [approvals](approvals.md) via cascade
- One-to-many with [status_history](status-history.md) via cascade
- One-to-many with [notification_config](notification-config.md) via cascade

# Indexes

| Index | Columns | Purpose |
|-------|---------|---------|
| `idx_cr_client_id` | `client_id` | FK index |
| `idx_cr_change_type_id` | `change_type_id` | FK index |
| `idx_cr_status` | `status` | Filter by status |
| `idx_cr_created_at` | `created_at DESC` | Sort by recency |
| `idx_cr_client_created` | `(client_id, created_at DESC)` | List client's requests newest-first |
| `idx_cr_status_created` | `(status, created_at DESC)` | List by status, newest-first |
| `idx_cr_client_status_created` | `(client_id, status, created_at DESC)` | Client-scoped status filtering |
| `idx_cr_sla_status_non_terminal` | `sla_status` (partial) | Non-terminal SLA monitoring; `WHERE status NOT IN ('validated', 'processed')` |
| `idx_cr_notification_sent` | `notification_sent` (partial) | Unsent notifications; `WHERE notification_sent = false` |

# Citations

[1] [init.sql — change_requests table](/db/init.sql)
[2] [3NF Schema Design — change_requests](/documentation/database/data-model/3nf-schema-design.md)
