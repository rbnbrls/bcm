# Lookup Dimension Classification — client_config

**Task:** t_5bccc58d — Classify lookup dimensions as user-requestable or admin-only
**Repo:** rbnbrls/bcm (issue #279 — "Reference data: Govern lookup dimensions used by client config rows")
**Status:** Decision document. Consumed by t_9d10a4cf (implement governed change flow) and t_1fb1e3cd (admin boundaries + validation errors).

## 1. Purpose

Every `client_config` lookup dimension is either:

- **USER** — a user may *request* a new lookup value through the BCM change workflow (staged → approved → applied). Direct mutation from user flows stays blocked.
- **ADMIN** — the lookup is operational master data. Users can only *select existing* values; the value set is maintained by administrators (or seeded from client-supplied data). Portfolio flows must fail with a descriptive "contact admin" error when a value is missing.

This document is the authoritative classification and the rationale per field.

## 2. Summary classification table

| Field | Table | Type | One-line justification |
|---|---|---|---|
| `manager` | `client_config.manager` | **ADMIN** | Fixed set of external counterparty codes; part of the account identity (`primary_account_id`) and the unique key; FK-enforced; no user creation flow exists or is desired. |
| `benchmark` | `client_config.benchmark` | **USER** | New benchmarks are requested via the Workflow Studio change catalog (change type `new_benchmark`, `__NEW__` inline option in the benchmark switch form); `benchmark_code` deliberately has **no FK** so staged rows may reference a benchmark being requested in the same change. |
| `npc_classification` | `client_config.npc_classification` | **ADMIN** | Small internal labeling taxonomy (e.g. "Geen NPC"), FK-enforced, selected by ID only; no user request path; not client-facing. |
| `asset_class` | `client_config.asset_class` | **USER** | Client-supplied investment taxonomy; new asset classes are rare, structural, high-impact events (embedded in `primary_account_id`) and should flow through the reviewable change process — but the request can originate from a user. |
| `sub_asset_class` | `client_config.sub_asset_class` | **USER** | Always belongs to an asset class; a new asset class brings its sub-asset classes, and a mandate change may add a sub-segment under an existing class. Requested together with its parent through the same change flow. |

## 3. Evidence per field

### 3.1 `manager` — ADMIN

| Aspect | Evidence |
|---|---|
| Schema | `manager_code char(3) NOT NULL REFERENCES client_config.manager(manager_code)` on **both** `portfolio_configuration` and `change_portfolio_configuration`. FK-enforced. |
| Identity | `manager_code` is part of `primary_account_id` (`{client}*{AC}{subAC}*{manager}`) and of the row's `UNIQUE(client_code, asset_class_id, sub_asset_class_id, manager_id)` — a new manager changes account identity semantics. |
| User flow | `createPortfolioAdditionChange` validates `managerCode` **must exist** in reference data (`De gekozen manager code bestaat niet.`). Users only pick from the existing list. |
| Admin surface | `/admin/attribute-options` → `createManager/updateManager/deleteManager` (master-data CRUD). Demo set = 59 real counterparties (EIGEN BEHEER, ABERDEEN, ROBECO, UBS, …). |
| Rationale | Managers are external counterparties set up by operations; a portfolio's manager is dictated by the mandate, never invented by a change requester. Low churn, high identity impact → admin master data. |

### 3.2 `benchmark` — USER (requestable via change workflow)

| Aspect | Evidence |
|---|---|
| Schema | `benchmark_code varchar(60) NOT NULL CHECK (benchmark_code <> '')` — **no FK** on either table. Deliberate: the change process itself introduces new codes, so a staged `change_portfolio_configuration` row may carry a code that is not (yet) in `client_config.benchmark`. |
| User flow (new value) | 1) Change type `new_benchmark` (via the Workflow Studio change catalog), estimated cost €5.000 / 4 weeks, persists a `new_benchmark_requests` staging row + change request. 2) `BenchmarkChangeForm` offers a `__NEW__` (`NEW_BENCHMARK_VALUE`) target per portfolio with inline short/long name + asset class. |
| User flow (existing value) | `createPortfolioAdditionChange` validates `benchmarkCode` against the catalog (`De gekozen benchmark code bestaat niet in de catalogus.`). |
| Admin surface | `/admin/attribute-options` → benchmark-group CRUD (legacy `benchmarks` table) for catalog maintenance (names, RIMES codes). |
| Rationale | The benchmark **catalog** is admin-maintained master data, but the **addition of a new benchmark** is a user-driven investment decision (new index, custom ESG mandate). The app already implements this as a governed change flow with cost/lead-time estimates and approval. Classification: user-requestable; catalog corrections remain admin. |

### 3.3 `npc_classification` — ADMIN

| Aspect | Evidence |
|---|---|
| Schema | `npc_classification_id smallint NOT NULL REFERENCES client_config.npc_classification(npc_classification_id)` — FK-enforced on both tables. |
| User flow | Selected by ID only (`npcClassificationId`); `createPortfolioAdditionChange` validates existence (`De gekozen NPC classificatie bestaat niet.`). |
| Creation path | None. No user flow, no admin CRUD UI, no seed INSERT in `clientconfig_schema.sql`. Populated via migration/fixtures; demo set is tiny and internal ("Geen NPC", …). |
| Rationale | Internal labeling taxonomy with stable, low cardinality. Not client-facing, never requested by users. → admin master data. |

### 3.4 `asset_class` — USER (requestable via change workflow)

| Aspect | Evidence |
|---|---|
| Schema | `asset_class_code char(2) NOT NULL REFERENCES client_config.asset_class(asset_class_code)` — FK-enforced. |
| Source of truth | `lib/asset-classes.ts`: the hierarchy is "copied exactly from the supplied domain source data" (client-supplied taxonomy: CASH, ALTERNATIVES, EQUITIES, FIXED_INCOME, REAL_ASSETS, MULTI_ASSETS, OVERLAY, IMPACT, OPBOUW, …). Mirrored in the DB seed (`db/clientconfig_schema.sql`). |
| Identity | `asset_class_code` is embedded in `primary_account_id` and drives the `(asset_class, sub_asset_class)` pair validation (`validateAssetSubAssetPair`, Zod `AssetSubAssetSelection`, `trg_validate_account_selection`). A new asset class is a structural taxonomy change. |
| User flow | Forms validate against reference data; users cannot invent codes today. |
| Admin surface | `/admin/attribute-options` → `createClientConfigAssetClassAction/update/delete` write **directly** to `client_config.asset_class` (no change process — the enforcement triggers only cover `portfolio_configuration`). |
| Rationale | New asset classes originate from client mandates and are exactly the kind of high-impact change that should be staged, reviewed and approved (who/when/why, cost, approval) instead of silently edited. The request originates from a user; the *decision* is admin review via the change process. Classification: **user-requestable**, mandatory admin approval, direct admin maintenance allowed for corrections only. |

> ⚠️ Implementation gap (for t_9d10a4cf): the app-layer validation is **hardcoded** to the static hierarchy (`AssetClassValue = z.enum(ASSET_CLASS_VALUES)`, `ASSET_SUB_ASSET_OPTIONS`). A DB-only asset-class addition is not selectable in the change forms until `lib/asset-classes.ts` is updated in lockstep. The governed flow must update both the DB lookup table and the static validation source (or switch validation to reference-data-driven).

### 3.5 `sub_asset_class` — USER (requestable together with its parent)

| Aspect | Evidence |
|---|---|
| Schema | `sub_asset_class_code char(3) NOT NULL CHECK (regex)` — no FK to the code (the pair is validated by `validateAssetSubAssetPair` + the DB trigger); FK exists on `sub_asset_class.asset_class_id` in the lookup itself. |
| Coupling | A sub-asset class only exists under one asset class (`UNIQUE(asset_class_id, sub_asset_class_code)`). New asset classes ship with their sub-asset classes; new sub-segments under an existing class are likewise mandate-driven. |
| Rationale | Same classification as its parent: user-requestable via the change flow, with the `(asset_class, sub_asset_class)` pair staged and validated atomically. Admin direct maintenance for corrections. |

## 4. Governance rules

1. **User-requestable dimensions** (`benchmark`, `asset_class`, `sub_asset_class`): new lookup values enter **only** through a change request (stage → approve → apply). No direct mutation from lifecycle user flows — same enforcement philosophy as the `app.change_process_bypass` trigger on `portfolio_configuration`, extended to the lookup tables.
2. **Admin-only dimensions** (`manager`, `npc_classification`): no user-facing create path anywhere. Portfolio create/update flows validate existence up front and fail with a descriptive Dutch error (see §5).
3. **Missing lookup in a portfolio flow** must *guide* the user, not dead-end them: for user-requestable dimensions point to the request flow; for admin-only dimensions point to admin/support.
4. **Lockstep validation:** any lookup change must keep the DB table, the static validation sources (`lib/asset-classes.ts`), and the reference-data fixtures consistent, or the value becomes selectable in one layer and rejected in another.

## 5. Required validation messages (Dutch, for t_1fb1e3cd)

| Field | Missing-value message |
|---|---|
| `manager` | `Manager {code} bestaat niet in de referentiedata. Managers worden alleen door de beheerder toegevoegd — neem contact op met support.` |
| `npc_classification` | `NPC classificatie {id} bestaat niet. Neem contact op met de beheerder.` |
| `benchmark` (existing, keep) | `De gekozen benchmark code bestaat niet in de catalogus.` — when the user wants a *new* benchmark, guide: `Nieuwe benchmark aanvragen via de change catalog (Workflow Studio).` |
| `asset_class` / `sub_asset_class` | `Combinatie asset class + sub asset class is niet toegestaan.` (exists) — when the *value itself* is unknown: `Asset class {code} bestaat niet. Een nieuwe asset class kan via het change proces worden aangevraagd.` |

## 6. Notes for follow-up tasks

- **t_9d10a4cf (governed change flow):** needs a staging mechanism for lookup additions (e.g. `change_lookup_request`-style table or an extension of `change_portfolio_configuration`), change types for `new_asset_class` / `new_sub_asset_class` / `new_benchmark` (benchmark already exists), apply logic that inserts into the lookup tables with the bypass pattern, and forms. `new_benchmark` exists as change type (`new_benchmark_requests`); the standalone `/benchmark-aanvraag` route was removed in favour of the Workflow Studio change catalog.
- **t_1fb1e3cd (admin boundaries):** document the admin-only boundary for `manager`/`npc_classification` in code comments + dev docs, and add the §5 messages to `validatePortfolioAgainstReferenceData` / `validatePortfolioConfiguration`.
- **t_0c60daff / t_acda24cc:** reference this classification for tests (missing-lookup data → admin error; newly-requested lookup data → staged change applies cleanly).
