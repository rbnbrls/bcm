---
type: PostgreSQL Table
title: status_history
description: Status transition history for change requests. Records every status change with the timestamp and who performed it.
tags: [audit, history, status]
timestamp: 2026-07-27T00:00:00Z
---

# Schema

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | `uuid` | `PRIMARY KEY` | Globally unique identifier. |
| `change_request_id` | `uuid` | `NOT NULL, REFERENCES change_requests(id) ON DELETE CASCADE` | The change request whose status changed. |
| `from_status` | `text` | | Previous status (NULL for initial entry). |
| `to_status` | `text` | `NOT NULL` | New status after the transition. |
| `changed_by` | `text` | | Who performed the status change. |
| `changed_at` | `timestamptz` | `NOT NULL, DEFAULT now()` | When the status change occurred. |

# Relationships

- Many-to-one with [change_requests](change-requests.md) via `change_request_id` (cascading delete)

# Indexes

| Index | Columns | Purpose |
|-------|---------|---------|
| `idx_sh_change_request_id` | `change_request_id` | FK: history entries by change request |

# Usage

The status_history table provides a granular timeline of every status transition for a change request. While audit_log captures higher-level actions (requested, approved, rejected), status_history captures every `from_status` → `to_status` transition regardless of action type. This is useful for reconstructing the full lifecycle of a change request and computing processing time metrics.

# Citations

[1] [init.sql — status_history table](/db/init.sql)
