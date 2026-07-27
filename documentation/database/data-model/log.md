# Update Log

## 2026-07-27
* **Design**: Completed 3NF-compliant schema design — resolved 8 transitive dependency violations across 7 tables. New design in [`3nf-schema-design.md`](./3nf-schema-design.md). DDL migration script at [`migrate-3nf.sql`](scripts/migrate-3nf.sql).
  * New lookup tables: `regeling_types`, `sub_asset_classes`, `stakeholders`
  * `asset_classes` enhanced with `code` column (English identifier)
  * Removed redundant text columns: `portfolios.asset_class/sub_asset_class`, `benchmark_catalog.asset_class`, `new_benchmark_requests.asset_class`, `clients.asset_class/regeling_type`, `change_requests.change_type`, `notification_config/log.stakeholder`
* **Create**: Established the BCM data model OKF bundle with 13 table concepts (clients, benchmark_catalog, portfolios, change_requests, change_request_items, new_benchmark_requests, change_type_config, audit_log, approvals, status_history, notification_config, notification_log, webhook_configs).
* **Create**: Entity-relationship diagram (Mermaid) and performance index summary in root index.md.
* **Analyze**: Normalization analysis completed — identified 8 × 1NF violations (JSONB arrays for multi-valued attributes), 0 × 2NF violations (surrogate PKs throughout), and 6 × 3NF violations (transitive dependencies in portfolios, clients, benchmark_catalog, new_benchmark_requests, change_requests, notification tables). Full report in [`normalization-analysis.md`](./normalization-analysis.md).

## Upcoming work
* Child task `t_5b73af0d` — Generate DDL for new 3NF schema (fresh init.sql)
* Child task `t_e8c25531` — Update TypeScript types and application code to match new schema
