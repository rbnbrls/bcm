# Seed Data: Setup & Acceptance Testing

This document describes how to populate the BCM database with test data and how to
use that data for acceptance testing of the change management application. A new
developer should be able to follow these instructions, understand the data model,
and know what to expect at each step.

---

## Table of Contents

1. [Overview](#overview)
2. [Running the Seed Script](#running-the-seed-script)
   - [CLI (Direct)](#cli-direct)
   - [API Endpoint](#api-endpoint)
   - [Security](#security)
   - [Idempotency & Clean-up](#idempotency--clean-up)
3. [Seeded Data Description](#seeded-data-description)
   - [Clients (12 total)](#clients-12-total)
   - [Portfolios (83 total)](#portfolios-83-total)
   - [Classifications & Lookup Tables](#classifications--lookup-tables)
   - [Benchmark Catalog (17 entries)](#benchmark-catalog-17-entries)
4. [Verification](#verification)
5. [Acceptance Testing Workflows](#acceptance-testing-workflows)
   - [1. Client Config Admin Page](#1-client-config-admin-page)
   - [2. Benchmark Switch Flow](#2-benchmark-switch-flow)
   - [3. New Benchmark Request](#3-new-benchmark-request)
   - [4. Fee / Generic Change](#4-fee--generic-change)
   - [5. Admin Reports Dashboard](#5-admin-reports-dashboard)
   - [6. Client Config Read-Only Verification](#6-client-config-read-only-verification)
6. [Expected Data Counts at a Glance](#expected-data-counts-at-a-glance)
7. [Troubleshooting](#troubleshooting)

---

## Overview

The seed script (`scripts/seed.mjs`) inserts **12 pension fund clients** with a
total of **83 portfolios**. Every portfolio has all required foreign-key
classifications populated:

- WTP classification (Rendement / Matching / Opbouw)
- Asset class (EQUITIES, FIXED_INCOME, REAL_ASSETS, ALTERNATIVES, CASH)
- Sub-asset class (e.g., AC WORLD, SOVEREIGN EUROPE, PRIVATE EQUITY)
- Manager (EigenBeheer / ExternA / ExternB)
- Benchmark group (A / B / C)
- Current benchmark (from benchmark_catalog)

The script also seeds the **benchmark catalog** (17 entries) and expands the
**sub_asset_classes** lookup table (27 entries) to support the portfolio data.

> **Two existing clients** from `db/init.sql` (Pensioenfonds Horizon and
> Stichting Pensioen Zeker, with 3 existing portfolios total) are **preserved**
> by the seed — the script only adds new data and never removes production data.

---

## Running the Seed Script

### CLI (Direct)

```bash
# Ensure DATABASE_URL is set
export DATABASE_URL=postgres://bcm:password@localhost:5432/bcm

# Run the seed
node scripts/seed.mjs

# Or via npm (reads DATABASE_URL from the environment)
npm run db:seed
```

**Expected output (success):**

```
🌱 BCM seed script starting…
  ✓ Partial data cleaned
  ✓ Benchmark catalog seeded
  ✓ Sub asset classes expanded
  ✓ Client Pensioenfonds Horizon seeded (0 portfolios — existing)
  ✓ Client Stichting Pensioen Zeker seeded (0 portfolios — existing)
  ✓ Client Bedrijfstakpensioenfonds Metaal & Techniek seeded (6 portfolios)
  ✓ Client Stichting Pensioenfonds Vervoer seeded (7 portfolios)
  ✓ Client Algemeen Pensioenfonds Bouw seeded (8 portfolios)
  ✓ Client Pensioenfonds Zorg & Welzijn seeded (9 portfolios)
  ✓ Client Stichting Pensioenfonds Detailhandel seeded (6 portfolios)
  ✓ Client Bedrijfspensioenfonds Bakkerij seeded (7 portfolios)
  ✓ Client Pensioenfonds Openbaar Vervoer seeded (10 portfolios)
  ✓ Client Stichting Pensioenfonds Landbouw seeded (8 portfolios)
  ✓ Client Algemeen Pensioenfonds Chemie seeded (9 portfolios)
  ✓ Client Pensioenfonds Techniek Nederland seeded (10 portfolios)
  ✓ Portfolio integrity: all 83 portfolios have valid FK references
  ✓ Seed complete: 12 clients, 83 portfolios
```

### API Endpoint

The seed can also be triggered via the REST API:

```bash
POST /api/seed
```

**Using curl:**

```bash
# Without API key (local network only)
curl -X POST http://localhost:3000/api/seed

# With API key (production / remote)
curl -X POST http://localhost:3000/api/seed \
  -H "x-api-key: your-seed-api-key"
```

**Expected JSON response:**

```json
{
  "success": true,
  "message": "Seed completed",
  "summary": {
    "totalClients": 12,
    "totalPortfolios": 83,
    "clientsWithPortfolios": 12
  }
}
```

The API is implemented in `app/api/seed/route.ts` and duplicates the same logic
as the CLI script. Both are idempotent — safe to call repeatedly.

### Security

The API endpoint is protected by the `SEED_API_KEY` environment variable:

- **If `SEED_API_KEY` is not set**: the endpoint is accessible without
  authentication — only listen on localhost or a private network.
- **If `SEED_API_KEY` is set**: the caller must provide the key via the
  `x-api-key` header or a `key` query parameter. Requests without a matching key
  receive a `401 Unauthorized` response.

> ⚠️ **Never set `SEED_API_KEY` to a weak value.** Use a UUID or a randomly
> generated token (`openssl rand -hex 32`).

**Add to `.env.local`:**

```
SEED_API_KEY=abc123-seed-key-change-me
```

### Idempotency & Clean-up

The seed is fully **idempotent** — every `INSERT` uses `ON CONFLICT (id) DO
NOTHING`. Running it multiple times produces the same result.

Before inserting new data, the script **cleans up any partial seed data** from
previous failed runs. It deletes portfolios and clients whose
`external_reference` starts with `PF-` but are **not** the two original
production clients (Pensioenfonds Horizon and Stichting Pensioen Zeker).

> The clean-up affects **only** seed-generated records. Production data is
> always preserved.

---

## Seeded Data Description

### Clients (12 total)

| # | Client Name | External Ref | Regeling Type | Portfolios |
|---|-------------|-------------|--------------|-----------|
| 1 | Pensioenfonds Horizon | PF-HOR-001 | pensioenuitkering | 2 (existing, preserved) |
| 2 | Stichting Pensioen Zeker | PF-ZEK-002 | premieovereenkomst | 1 (existing, preserved) |
| 3 | Bedrijfstakpensioenfonds Metaal & Techniek | PF-MET-003 | premieovereenkomst | 6 |
| 4 | Stichting Pensioenfonds Vervoer | PF-VRV-004 | pensioenuitkering | 7 |
| 5 | Algemeen Pensioenfonds Bouw | PF-BOU-005 | kapitaalovereenkomst | 8 |
| 6 | Pensioenfonds Zorg & Welzijn | PF-ZWG-006 | pensioenuitkering | 9 |
| 7 | Stichting Pensioenfonds Detailhandel | PF-DET-007 | premieovereenkomst | 6 |
| 8 | Bedrijfspensioenfonds Bakkerij | PF-BAK-008 | uitkeringsovereenkomst | 7 |
| 9 | Pensioenfonds Openbaar Vervoer | PF-OVV-009 | pensioenuitkering | 10 |
| 10 | Stichting Pensioenfonds Landbouw | PF-LAN-010 | kapitaalovereenkomst | 8 |
| 11 | Algemeen Pensioenfonds Chemie | PF-CHE-011 | premieovereenkomst | 9 |
| 12 | Pensioenfonds Techniek Nederland | PF-TEC-012 | pensioenuitkering | 10 |

**Regeling types** (from the `regeling_types` lookup table):

| Type | Description |
|------|------------|
| pensioenuitkering | Defined-benefit pension |
| premieovereenkomst | Defined-contribution pension |
| kapitaalovereenkomst | Capital agreement |
| uitkeringsovereenkomst | Benefit agreement |

### Portfolios (83 total)

Each client has between **3 and 10 portfolios** (excluding the two existing
clients with 2 and 1 portfolios respectively). Portfolio coverage includes:

**Asset classes covered:**

| Asset Class | Code | Portfolios |
|------------|------|-----------|
| Aandelen (Equities) | EQUITIES | ~30 |
| Obligaties (Fixed Income) | FIXED_INCOME | ~25 |
| Vastgoed (Real Assets) | REAL_ASSETS | ~14 |
| Alternatieven (Alternatives) | ALTERNATIVES | ~8 |
| Liquiditeiten (Cash) | CASH | ~6 |

**WTP classifications:**

| Classification | Description | Portfolios |
|--------------|------------|-----------|
| Rendement | Return portfolio (growth-oriented) | ~40 |
| Matching | Liability-matching portfolio | ~25 |
| Opbouw | Accumulation portfolio | ~12 |

**Managers:**

| Manager | Portfolios |
|---------|-----------|
| EigenBeheer (In-house) | ~38 |
| ExternA | ~30 |
| ExternB | ~15 |

**Benchmark groups:**

| Group | Portfolios |
|-------|-----------|
| A | ~30 |
| B | ~28 |
| C | ~25 |

**Sub-asset classes in use:**

AC WORLD, DEVELOPED MARKETS, EMERGING MARKETS, EUROPE, UNITED STATES, JAPAN,
DUURZAAM, SOVEREIGN EUROPE, GOVERNMENT BONDS, CORPORATE EUROPE, CREDITS EUROPE,
HIGH YIELD, HIGH YIELD EUROPE, INFLATION LINKED BONDS EUROPE, GREENBONDS, LDI,
PRIVATE EQUITY, HEDGE FUNDS, RISK PARITY, REALESTATE LISTED, REALESTATE DIRECT,
COMMODITIES, INFRASTRUCTURE, AGRICULTURE, CASH

### Classifications & Lookup Tables

**Asset classes** (8, from `db/init.sql`):

| UUID | Dutch Name | English Code |
|------|-----------|-------------|
| `00000002-...-001` | Aandelen | EQUITIES |
| `00000002-...-002` | Obligaties | FIXED_INCOME |
| `00000002-...-003` | Vastgoed | REAL_ASSETS |
| `00000002-...-004` | Alternatieven | ALTERNATIVES |
| `00000002-...-005` | Liquiditeiten | CASH |
| `00000002-...-006` | PrivateEquity | *(via ALTERNATIVES)* |
| `00000002-...-007` | Infrastructuur | *(via REAL_ASSETS)* |
| `00000002-...-008` | Grondstoffen | *(via REAL_ASSETS)* |

**WTP classifications** (3):

| UUID | Name |
|------|------|
| `00000001-...-001` | Rendement |
| `00000001-...-002` | Matching |
| `00000001-...-003` | Opbouw |

**Managers** (3):

| UUID | Name |
|------|------|
| `00000003-...-001` | EigenBeheer |
| `00000003-...-002` | ExternA |
| `00000003-...-003` | ExternB |

**Benchmark groups** (3):

| UUID | Name |
|------|------|
| `00000004-...-001` | A |
| `00000004-...-002` | B |
| `00000004-...-003` | C |

### Benchmark Catalog (17 entries)

| Code | Name | Asset Class | Currency | Provider |
|------|------|------------|----------|---------|
| MSCI-WORLD-NR | MSCI World Net Return | Aandelen | EUR | MSCI |
| MSCI-ACWI-NR | MSCI ACWI Net Return | Aandelen | EUR | MSCI |
| MSCI-EM-NR | MSCI Emerging Markets Net Return | Aandelen | USD | MSCI |
| S&P-500-NR | S&P 500 Net Return | Aandelen | USD | S&P |
| CUSTOM-ESG-NL | Duurzame NL Benchmark | Aandelen | EUR | rimes |
| MSCI-WORLD-HEALTH | MSCI World Health Care Net Return | Aandelen | EUR | MSCI |
| BLOOMBERG-EU-AGG | Bloomberg Euro Aggregate | Obligaties | EUR | Bloomberg |
| ICE-BOFA-EU-CORP | ICE BofA Euro Corporate | Obligaties | EUR | ICE BofA |
| EURO-GOVT-1-3Y | Euro Government 1-3 Year | Obligaties | EUR | Bloomberg |
| BLOOMBERG-GL-AGG | Bloomberg Global Aggregate | Obligaties | USD | Bloomberg |
| BLOOMBERG-GL-HY | Bloomberg Global High Yield | Obligaties | USD | Bloomberg |
| GLOBAL-REIT-NR | Global REIT Net Return | Vastgoed | EUR | MSCI |
| FTSE-EPRA-NAREIT-DEV | FTSE EPRA Nareit Developed | Vastgoed | EUR | FTSE Russell |
| RIMES-PRIVATE-EQ | Rimes Private Equity Index | Alternatieven | EUR | rimes |
| HFRX-GL-HEDGE | HFRX Global Hedge Fund Index | Alternatieven | USD | HFRX |
| S&P-GSCI | S&P GSCI Commodity Total Return | Grondstoffen | USD | S&P |
| MSCI-WORLD-INFRA | MSCI World Infrastructure Net Return | Infrastructuur | EUR | MSCI |

---

## Verification

### Via the Admin Page

1. Start the application: `npm run dev`
2. Visit `/admin/client-config`
3. Verify the table shows **56 portfolio rows** across all 12 clients
4. Each row should display: client name, portfolio name, WTP classification,
   asset class (with color dot), sub-asset class, manager, benchmark group,
   current benchmark, and code
5. Verify the table is **read-only** (no clickable edit fields)

### Via SQL (psql)

```sql
-- Total clients
SELECT COUNT(*) AS total_clients FROM clients WHERE status = 'active';
-- Expected: 12

-- Total portfolios
SELECT COUNT(*) AS total_portfolios FROM portfolios WHERE active = true;
-- Expected: 83

-- Clients with at least one portfolio
SELECT COUNT(DISTINCT client_id) FROM portfolios WHERE active = true;
-- Expected: 12

-- Portfolios per client
SELECT c.name, COUNT(p.id) AS portfolio_count
FROM clients c
LEFT JOIN portfolios p ON p.client_id = c.id AND p.active = true
WHERE c.status = 'active'
GROUP BY c.name
ORDER BY c.name;

-- Missing foreign keys (should return 0 rows)
SELECT id, external_reference FROM portfolios
WHERE wtp_classification_id IS NULL
   OR asset_class_id IS NULL
   OR sub_asset_class_id IS NULL
   OR manager_id IS NULL
   OR benchmark_id IS NULL
   OR current_benchmark_id IS NULL;
```

---

## Acceptance Testing Workflows

The seeded data is designed to support end-to-end acceptance testing of all
major BCM features. Below are specific test scenarios for each workflow.

### 1. Client Config Admin Page

**Page:** `/admin/client-config`

**Test scenario — Browse client configurations:**

1. Navigate to `/admin/client-config`
2. The table should display all 12 clients with their portfolios
3. Use the **client filter** dropdown to filter by "Pensioenfonds Zorg & Welzijn"
   → should show 9 portfolios
4. Use the **asset class filter** to show only "EQUITIES" → portfolios should
   narrow to equity-class portfolios only
5. Verify the table is **read-only**: no inline editing controls, values display
   as plain text with asset-class color dots

**Expected:** 56 rows total, each with complete classification data.

**Edge cases to test:**
- Filter to "CASH" → shows the 6 cash/liquidity portfolios across clients
- Filter to client "Pensioenfonds Horizon" (existing, pre-seed) → shows 2 portfolios
- Verify no missing FK indicators (blank cells) in any row

### 2. Benchmark Switch Flow

**Page:** `/changes/new` → select "Benchmarkwissel"

**Test scenario — Switch a portfolio's benchmark:**

1. Start a benchmark switch request
2. Select client: **Pensioenfonds Zorg & Welzijn** (PF-ZWG-006 — 9 portfolios)
3. Select portfolio: **Aandelen wereldwijd** (ZWG-AW, currently on MSCI World)
4. In the SOLL (desired) selector, choose **MSCI-ACWI-NR**
5. Verify the IST/SOLL diff shows the change from MSCI World → MSCI ACWI
6. Review cost estimate
7. Submit the change request
8. Verify redirect to the change detail page
9. Verify the change request shows correct client, portfolio, IST, and SOLL

**Suggested test clients for specific scenarios:**

| Scenario | Client | Portfolio(s) | Notes |
|----------|--------|-------------|-------|
| Simple switch | Pensioenfonds Zorg & Welzijn | Aandelen wereldwijd | 1 portfolio switch |
| Multi-portfolio switch | Algemeen Pensioenfonds Bouw | Rendementsportefeuille + Matchingportefeuille | 2 portfolio switch |
| Switch to same class | Stichting Pensioenfonds Vervoer | Return portefeuille (S&P 500 → MSCI World) | Both equity benchmarks |
| Cross-asset-class switch | Pensioenfonds Openbaar Vervoer | Return portefeuille (MSCI ACWI → Global REIT) | EQUITIES → REAL_ASSETS |
| New benchmark needed | Bedrijfstakpensioenfonds Metaal & Techniek | Matchingportefeuille | Requires new benchmark creation sub-flow |

**Expected behaviors:**
- IST column shows current benchmark with full name, code, and cost
- SOLL selector shows only benchmarks matching the portfolio's asset class
- Cost estimate displays per-portfolio and total
- After submission, the change detail page shows a diff table

### 3. New Benchmark Request

**Page:** `/benchmark-aanvraag`

**Test scenario — Request a new benchmark:**

1. Navigate to `/benchmark-aanvraag`
2. Fill in the 4-step form:
   - **Step 1**: Enter benchmark name, select asset class (e.g., Obligaties),
     currency, provider
   - **Step 2**: Enter rationale and supporting documentation
   - **Step 3**: Review cost estimate (€5.000)
   - **Step 4**: Confirm and submit
3. Verify the new benchmark request is created
4. The submission should create both a `change_requests` record (type: new
   benchmark) and a `new_benchmark_requests` record

**Edge cases to test:**
- Submit with existing benchmark code → validation should reject duplicate
- Submit with empty required fields → inline validation errors
- Submit via different clients to verify client-scoped data access

### 4. Fee / Generic Change

**Page:** `/changes/new` → select a fee or mandate change type

**Test scenario — Submit a fee change for a specific portfolio:**

1. Start a fee change for client **Algemeen Pensioenfonds Chemie**
2. Select portfolio **High yield** (CHE-HY)
3. Fill in the fee change details (old rate, new rate, effective date)
4. Submit and verify the change request appears on the dashboard

**Suggested test scenarios:**

| Change Type | Client | Portfolio | Key Validation |
|------------|--------|-----------|---------------|
| Fee change | Pensioenfonds Techniek Nederland | VS aandelen | Rate format validation |
| Mandate change | Pensioenfonds Openbaar Vervoer | Return portefeuille | Mandate type required |
| Custodian change | Bedrijfspensioenfonds Bakkerij | Kredietportefeuille | Free-text custodian name |
| IST-update | Stichting Pensioenfonds Landbouw | Rendementsportefeuille | IST/SOLL comparison |

### 5. Admin Reports Dashboard

**Page:** `/admin/reports`

**Test scenario — Reports with seeded change data:**

After submitting several change requests from the scenarios above:

1. Navigate to `/admin/reports`
2. Verify the dashboard shows change request statistics
3. Check SLA status breakdowns (if you submitted changes with varying metadata)
4. Verify data export (CSV/PDF) includes the seeded client names

### 6. Client Config Read-Only Verification

**Page:** `/admin/client-config`

**Test scenario — Confirm no editing possible:**

1. Navigate to `/admin/client-config`
2. Click on any portfolio cell (name, WTP, asset class, manager, etc.)
3. Verify no input fields, dropdowns, or toggles appear
4. All values display as **plain text** with asset-class color indicators
5. Verify the import function at `/admin/client-config/import` is the only
   path to modify client config data

**Why this matters:** The client configuration admin table was intentionally
made read-only (task t_11b29179). Acceptance testing must confirm that no
inline editing components survive.

---

## Expected Data Counts at a Glance

| Object | Count | Notes |
|--------|-------|-------|
| Total clients | 12 | 10 seed + 2 existing |
| New seed clients | 10 | PF-MET-003 through PF-TEC-012 |
| Total portfolios | 83 | 80 seed + 3 existing |
| Seed portfolios | 80 | Across the 10 new clients |
| Benchmark catalog | 17 | 17 unique benchmark indices |
| Asset classes | 8 | Lookup table |
| Sub-asset classes | 27 | 10 init + 17 seed additions |
| WTP classifications | 3 | Lookup table |
| Managers | 3 | Lookup table |
| Benchmark groups | 3 | Lookup table |
| Regeling types | 4 | Lookup table |
| Admin table rows | 56 | Portfolio rows visible at /admin/client-config |

> Note: The admin table shows 56 rows because only the existing test-data
> portfolios (from the `fixtures` module that the E2E tests use) are displayed.
> The full database has 83 portfolios across all 12 clients. The admin page's
> data source determines which rows are visible — **if you seed via the API or
> CLI, the database has 83 portfolios; if the admin page queries from the
> database directly you will see all 83.**

---

## Troubleshooting

| Problem | Likely Cause | Solution |
|---------|-------------|----------|
| `DATABASE_URL is required` | Missing env var | Set `DATABASE_URL` before running |
| `ECONNREFUSED` | PostgreSQL not running | Start Docker: `docker compose up -d db` |
| Migration not run | Tables don't exist | Run `npm run db:migrate` first |
| `401 Unauthorized` (API) | Missing or wrong API key | Pass `x-api-key` header or omit `SEED_API_KEY` for local dev |
| Seed runs but 0 portfolios | Partial clean-up removed everything | Check for DB constraints — run migration fresh |
| Admin page shows 56 rows, not 83 | Admin page has its own data source | Check whether admin fetches from fixtures or from the real database query |
| Existing clients missing | Clean-up query is too aggressive | The clean-up preserves clients with IDs `9f9280fc-...` and `7b9303c1-...` — check the seed script for exact IDs |

---

## See Also

- [Database Overview](README.md) — Full database documentation
- [Data Model](data-model/) — OKF-format table-level docs with ERD
- [Development Setup](../development/README.md) — Local development environment
- [API Documentation](../api/README.md) — Full API endpoint reference
- `scripts/seed.mjs` — The seed script source
- `app/api/seed/route.ts` — The API endpoint source
