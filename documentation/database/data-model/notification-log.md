---
type: PostgreSQL Table
title: notification_log
description: Notification delivery log. Tracks all notification delivery attempts with retry state and response data.
tags: [notification, log, delivery]
timestamp: 2026-07-27T00:00:00Z
---

# Schema

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | `uuid` | `PRIMARY KEY` | Globally unique identifier. |
| `change_request_id` | `uuid` | `NOT NULL, REFERENCES change_requests(id) ON DELETE CASCADE` | The change request this notification relates to. |
| `stakeholder` | `text` | `NOT NULL` | Target stakeholder. |
| `channel` | `text` | `NOT NULL, CHECK (channel IN ('webhook', 'email'))` | Delivery channel used. |
| `recipient` | `text` | `NOT NULL` | Actual delivery address used. |
| `status` | `text` | `NOT NULL, DEFAULT 'pending'` | Delivery status. |
| `attempts` | `integer` | `NOT NULL, DEFAULT 0` | Number of delivery attempts made. |
| `max_attempts` | `integer` | `NOT NULL, DEFAULT 3` | Maximum retry attempts before giving up. |
| `response` | `text` | | Response payload from the delivery. |
| `next_retry_at` | `timestamptz` | | When the next retry is scheduled (NULL if no retry pending). |
| `created_at` | `timestamptz` | `NOT NULL, DEFAULT now()` | Record creation timestamp. |
| `updated_at` | `timestamptz` | `NOT NULL, DEFAULT now()` | Last update timestamp. |

# Constraints

- `chk_nl_status_values` — Status must be one of: `pending`, `sent`, `failed`, `cancelled`.

# Relationships

- Many-to-one with [change_requests](change-requests.md) via `change_request_id` (cascading delete)

# Indexes

| Index | Columns | Purpose |
|-------|---------|---------|
| `idx_nl_change_request_id` | `change_request_id` | FK: log entries by change request |
| `idx_nl_status` | `status` | Filter by delivery status (e.g., all failed deliveries) |

# Usage

When a change request triggers a notification (on submit, approval, or completion), the system creates a `notification_log` entry and attempts delivery via the configured channel. Failed deliveries are retried up to `max_attempts` times. The `next_retry_at` field schedules retries, and the `response` field captures the delivery result for debugging.

# Citations

[1] [init.sql — notification_log table](/db/init.sql)
