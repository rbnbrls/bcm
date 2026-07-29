# Client Configuration — 3NF Architecture

## 1. Goal

Replace the flat client-configuration Excel dump with a fully normalised
PostgreSQL model in **Third Normal Form (3NF)**.  All configuration changes
must flow through the existing BCM change-management workflow; direct DML
against configuration tables is prohibited by construction.

## 2. ERD

```mermaid
erDiagram
    PORTFOLIO ||--o{ PORTFOLIO_CONFIGURATION : contains
    ASSET_CLASS ||--o{ PORTFOLIO_CONFIGURATION : classifies
    ASSET_CLASS ||--o{ SUB_ASSET_CLASS : groups
    SUB_ASSET_CLASS ||--o{ PORTFOLIO_CONFIGURATION : subclasses
    MANAGER ||--o{ PORTFOLIO_CONFIGURATION : manages
    BENCHMARK ||--o{ PORTFOLIO_CONFIGURATION : benchmarks
    NPC_CLASSIFICATION ||--o{ PORTFOLIO_CONFIGURATION : classifies
    CHANGE_REQUEST ||--o{ CHANGE_PORTFOLIO_CONFIGURATION : requests
    CHANGE_REQUEST ||--o{ PORTFOLIO_CONFIGURATION : approves

    PORTFOLIO {
      varchar(15) portfolio_code PK
      bigint parent_account_id FK
    }
    ASSET_CLASS {
      smallint asset_class_id PK
      char(2) asset_class_code UK
      varchar(30) asset_class_name UK
    }
    SUB_ASSET_CLASS {
      smallint sub_asset_class_id PK
      smallint asset_class_id FK
      char(3) sub_asset_class_code
      varchar(50) sub_asset_class_name
    }
    MANAGER {
      smallint manager_id PK
      char(3) manager_code UK
      varchar(50) manager_name UK
    }
    BENCHMARK {
      bigint benchmark_id PK
      varchar(60) benchmark_code UK
      varchar(100) benchmark_name
      varchar(40) rimes_code
    }
    NPC_CLASSIFICATION {
      smallint npc_classification_id PK
      varchar(80) classification_name UK
    }
    PORTFOLIO_CONFIGURATION {
      varchar(30) primary_account_id PK
      varchar(15) portfolio_code FK
      char(2) asset_class_code FK
      char(3) sub_asset_class_code
      char(3) manager_code FK
      varchar(60) benchmark_code FK
      smallint npc_classification_id FK
      varchar(255) long_name
      varchar(100) short_name
      boolean active_ind
      date effective_from
      date effective_until
      bigint change_request_id UK
    }
    CHANGE_PORTFOLIO_CONFIGURATION {
      bigint id PK
      bigint change_request_id FK
      varchar(10) action_type
      varchar(15) portfolio_code
      char(2) asset_class_code
      char(3) sub_asset_class_code
      char(3) manager_code
      varchar(60) benchmark_code
      smallint npc_classification_id
      varchar(255) long_name
      varchar(100) short_name
      date effective_from
      date effective_until
    }
```

## 3. 3NF Design

- Every non-primary-key attribute is fully functionally dependent on the PK.
- Lookup domains (asset class, sub-asset class, manager, benchmark,
  NPC classification) are separate tables with natural/business-key candidates
  explicitly UNIQUE-constrained.
- `portfolio_configuration` is a fact/configuration table referencing those
  lookups; it contains no repeating groups or transitive dependencies.

### Business key

```
primary_account_id =
  {portfolio_code}_{asset_class_code}{sub_asset_class_code}_{manager_code}
```

Example: `ADP_FIHYG_ROB`

## 4. Business Rules

### Validation
- `portfolio_code`, `asset_class_code`, `sub_asset_class_code`, `manager_code`
  are required and validated by FK + NOT NULL + CHECK.
- `long_name`: 1–255 chars, no CR/LF.
- `short_name`: 1–100 chars, no CR/LF.
- `benchmark_code`: NOT NULL, non-empty string.
- `effective_until` >= `effective_from` when present.
- `primary_account_id` pattern matches generated business key.

### Change-Management Integration
- Direct writes to `portfolio_configuration` are not permitted by application
  logic.  All mutations must be submitted as a `change_request` whose
  implementation phase applies approved changes.
- `change_portfolio_configuration` records the intended `action_type`
  (`CREATE`, `UPDATE`, `DELETE`) and payload.

## 5. Change Process

1. User submits a change request.
2. Impact assessment runs.
3. Approval gate.
4. Implementation phase writes/updates `portfolio_configuration` using the
   staged row in `change_portfolio_configuration`.
5. Audit via existing `audit_log`/`approvals` pattern.

## 6. Migration Strategy

- New tables are created with schema-qualified DDL under `client_config`.
- Existing `client_config.account` remains the source of truth for dimension
  combinations; `portfolio_configuration` is effectively a configuration overlay
  keyed by `primary_account_id`.
- Backfill/migration service populates `portfolio_configuration` from legacy
  flat configuration data after validation.

## 7. Rollback

- Drop the three new tables/indexes.
- Revert application code to previous schema-bound entities.
- Legacy flat configuration view/table remains available until full cutover.

## 8. Code Map

- DDL: `db/clientconfig_schema.sql`
- Entities: `lib/entities/*.ts`
- Zod: `lib/schemas/domain.ts`
- Helpers: `lib/portfolio-config.ts`
- Tests: `tests/portfolio-config.test.ts`
