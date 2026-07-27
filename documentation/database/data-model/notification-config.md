---
type: PostgreSQL Table
title: notification_config
description: Per-stakeholder notification routing configuration. Defines how and where stakeholders should be notified about change request events.
tags: [notification, configuration, stakeholder]
timestamp: 2026-07-27T00:00:00Z
---

# Schema

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | `uuid` | `PRIMARY KEY` | Globally unique identifier. |
| `stakeholder` | `text` | `NOT NULL` | Stakeholder name or identifier. |
| `channel` | `text` | `NOT NULL, CHECK (channel IN ('webhook', 'email'))` | Notification channel. |
| `recipient` | `text` | `NOT NULL` | Destination address (email or webhook URL). |
| `is_active` | `boolean` | `NOT NULL, DEFAULT true` | Whether this config is active. |
| `change_request_id` | `uuid` | `REFERENCES change_requests(id) ON DELETE CASCADE` | Optional: scoped to a specific change request. NULL for global config. |
| `created_at` | `timestamptz` | `NOT NULL, DEFAULT now()` | Record creation timestamp. |

# Indexes

| Index | Columns | Purpose |
|-------|---------|---------|
| `idx_nc_change_request_id` | `change_request_id` | FK: notification configs by change request |
| `idx_nc_is_active` | `is_active` | Filter active configurations |
| `idx_notif_config_app` | `(stakeholder, channel)` (unique partial) | Prevent duplicates for global configs; `WHERE change_request_id IS NULL` |

# Relationships

- Many-to-one with [change_requests](change-requests.md) via `change_request_id` (nullable, cascading delete)

# Usage

Notification configs can be either global (applied to all change requests for a stakeholder) or scoped to a specific change request. The `idx_notif_config_app` unique partial index ensures that global configs (where `change_request_id IS NULL`) don't have duplicates. The `notification_log` table tracks actual delivery attempts against these configs.

# Citations

[1] [init.sql — notification_config table](/db/init.sql)
