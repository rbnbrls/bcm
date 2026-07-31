-- ──────────────────────────────────────────────────────────────────────────
-- BCM Database Schema (3NF Compliant)
-- ──────────────────────────────────────────────────────────────────────────
-- This init.sql is the single source of truth for the database schema.
-- It is applied on first PostgreSQL volume creation by Docker Compose.
-- For existing deployments use scripts/migrate.mjs.
--
-- Schema: 3NF (Third Normal Form) — resolves 8 transitive dependency
-- violations by replacing free-text columns with FK references to
-- canonical lookup tables.
--
-- All DDL below is idempotent (IF NOT EXISTS guards) so it can safely
-- be re-applied during schema updates.
-- ──────────────────────────────────────────────────────────────────────────

-- =========================================================================
-- EXTENSIONS
-- =========================================================================
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- =========================================================================
-- 1. LOOKUP TABLES
-- =========================================================================

CREATE TABLE IF NOT EXISTS asset_classes (
  id uuid PRIMARY KEY,
  code text NOT NULL UNIQUE,
  name text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS wtp_classifications (
  id uuid PRIMARY KEY,
  name text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS managers (
  id uuid PRIMARY KEY,
  name text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS benchmarks (
  id uuid PRIMARY KEY,
  name text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 3NF: replaces free-text clients.regeling_type
CREATE TABLE IF NOT EXISTS regeling_types (
  id uuid PRIMARY KEY,
  name text NOT NULL UNIQUE,
  description text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 3NF: replaces free-text portfolios.sub_asset_class
CREATE TABLE IF NOT EXISTS sub_asset_classes (
  id uuid PRIMARY KEY,
  name text NOT NULL UNIQUE,
  asset_class_id uuid NOT NULL REFERENCES asset_classes(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 3NF: replaces free-text notification_config/log.stakeholder
CREATE TABLE IF NOT EXISTS stakeholders (
  id uuid PRIMARY KEY,
  name text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- =========================================================================
-- 2. CORE TABLES
-- =========================================================================

CREATE TABLE IF NOT EXISTS clients (
  id uuid PRIMARY KEY,
  name text NOT NULL UNIQUE,
  external_reference text NOT NULL UNIQUE,
  -- Legacy text columns (kept for backward compatibility during migration)
  regeling_type text,
  asset_class text,
  -- 3NF FK columns
  regeling_type_id uuid REFERENCES regeling_types(id),
  asset_class_id uuid REFERENCES asset_classes(id),
  status text NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS benchmark_catalog (
  id uuid PRIMARY KEY,
  code text NOT NULL UNIQUE,
  name text NOT NULL,
  -- Legacy text column (kept for backward compatibility)
  asset_class text NOT NULL,
  -- 3NF FK column
  asset_class_id uuid REFERENCES asset_classes(id),
  currency text NOT NULL,
  cost numeric(10,2) NOT NULL DEFAULT 1000.00,
  provider text NOT NULL DEFAULT 'rimes',
  active boolean NOT NULL DEFAULT true,
  lead_weeks integer NOT NULL DEFAULT 1
);

-- =========================================================================
-- 3. PORTFOLIOS
-- =========================================================================
CREATE TABLE IF NOT EXISTS portfolios (
  id uuid PRIMARY KEY,
  client_id uuid NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  name text NOT NULL,
  external_reference text NOT NULL,
  current_benchmark_id uuid NOT NULL REFERENCES benchmark_catalog(id),
  wtp_classification_id uuid NOT NULL REFERENCES wtp_classifications(id),
  asset_class_id uuid NOT NULL REFERENCES asset_classes(id),
  -- 3NF FK column
  sub_asset_class_id uuid REFERENCES sub_asset_classes(id),
  manager_id uuid NOT NULL REFERENCES managers(id),
  benchmark_id uuid NOT NULL REFERENCES benchmarks(id),
  -- Legacy text columns (kept for backward compatibility)
  asset_class text,
  sub_asset_class text,
  currency text NOT NULL DEFAULT 'EUR',
  active boolean NOT NULL DEFAULT true,
  UNIQUE (client_id, external_reference)
);

-- =========================================================================
-- 4. CHANGE REQUEST TABLES
-- =========================================================================

CREATE TABLE IF NOT EXISTS change_type_config (
  id uuid PRIMARY KEY,
  slug text NOT NULL UNIQUE,
  name text NOT NULL,
  description text NOT NULL DEFAULT '',
  extended_explanation text,
  category text NOT NULL DEFAULT 'general',
  fields jsonb NOT NULL DEFAULT '[]'::jsonb,
  ist_soll_mapping jsonb,
  cost jsonb NOT NULL DEFAULT '{}'::jsonb,
  default_lead_days integer NOT NULL DEFAULT 5,
  stakeholders jsonb NOT NULL DEFAULT '[]'::jsonb,
  workflow text NOT NULL DEFAULT 'default',
  process_flow jsonb NOT NULL DEFAULT '[]'::jsonb,
  active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS change_requests (
  id uuid PRIMARY KEY,
  reference text NOT NULL UNIQUE,
  -- Legacy text column (kept for backward compatibility)
  change_type text NOT NULL,
  -- 3NF FK column (now required)
  change_type_id uuid NOT NULL REFERENCES change_type_config(id),
  client_id uuid NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  requested_by text NOT NULL,
  rationale text NOT NULL,
  effective_date date NOT NULL,
  status text NOT NULL DEFAULT 'draft',
  sla_lead_weeks integer NOT NULL DEFAULT 1,
  status_updated_at timestamptz NOT NULL DEFAULT now(),
  sla_status text,
  sla_days_open integer,
  submitted_at timestamptz,
  fields jsonb NOT NULL DEFAULT '[]'::jsonb,
  stakeholders jsonb NOT NULL DEFAULT '[]'::jsonb,
  estimated_cost numeric(10,2),
  estimated_cost_currency text NOT NULL DEFAULT 'EUR',
  estimated_lead_days integer,
  processed_at date,
  processed_by text,
  validated_at date,
  validated_by text,
  notification_sent boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chk_cr_status_values CHECK (
    status IN ('draft','submitted','pending_approval','accepted','approved','rejected','in_progress','processed','validated','failed')
  )
);

CREATE TABLE IF NOT EXISTS change_request_items (
  id uuid PRIMARY KEY,
  change_request_id uuid NOT NULL REFERENCES change_requests(id) ON DELETE CASCADE,
  portfolio_id uuid NOT NULL REFERENCES portfolios(id) ON DELETE CASCADE,
  previous_benchmark_id uuid NOT NULL REFERENCES benchmark_catalog(id),
  requested_benchmark_id uuid NOT NULL REFERENCES benchmark_catalog(id),
  UNIQUE(change_request_id, portfolio_id)
);

CREATE TABLE IF NOT EXISTS new_benchmark_requests (
  id uuid PRIMARY KEY,
  change_request_id uuid NOT NULL REFERENCES change_requests(id) ON DELETE CASCADE,
  short_name text NOT NULL,
  long_name text NOT NULL,
  -- Legacy text column (kept for backward compatibility)
  asset_class text NOT NULL,
  -- 3NF FK column
  asset_class_id uuid REFERENCES asset_classes(id),
  currency text NOT NULL DEFAULT 'EUR',
  estimated_cost numeric(10,2) NOT NULL DEFAULT 5000.00,
  estimated_lead_weeks integer NOT NULL DEFAULT 4
);

-- =========================================================================
-- 5. AUDIT & APPROVAL TABLES
-- =========================================================================

CREATE TABLE IF NOT EXISTS audit_log (
  id text PRIMARY KEY,
  change_request_id uuid NOT NULL REFERENCES change_requests(id) ON DELETE CASCADE,
  action text NOT NULL,
  actor text NOT NULL,
  previous_status text,
  new_status text NOT NULL,
  diff_snapshot jsonb,
  client_config_version text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS approvals (
  id text PRIMARY KEY,
  change_request_id uuid NOT NULL REFERENCES change_requests(id) ON DELETE CASCADE,
  approver text NOT NULL,
  decision text NOT NULL,
  remarks text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- =========================================================================
-- 6. STATUS HISTORY
-- =========================================================================

CREATE TABLE IF NOT EXISTS status_history (
  id uuid PRIMARY KEY,
  change_request_id uuid NOT NULL REFERENCES change_requests(id) ON DELETE CASCADE,
  from_status text,
  to_status text NOT NULL,
  changed_by text,
  changed_at timestamptz NOT NULL DEFAULT now()
);

-- =========================================================================
-- 7. NOTIFICATION TABLES
-- =========================================================================

CREATE TABLE IF NOT EXISTS notification_config (
  id uuid PRIMARY KEY,
  -- Legacy text column (kept for backward compatibility)
  stakeholder text NOT NULL,
  -- 3NF FK column
  stakeholder_id uuid REFERENCES stakeholders(id),
  channel text NOT NULL CHECK (channel IN ('webhook', 'email')),
  recipient text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  change_request_id uuid REFERENCES change_requests(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_notif_config_app
  ON notification_config (stakeholder_id, channel) WHERE change_request_id IS NULL;

CREATE TABLE IF NOT EXISTS notification_log (
  id uuid PRIMARY KEY,
  change_request_id uuid NOT NULL REFERENCES change_requests(id) ON DELETE CASCADE,
  -- Legacy text column (kept for backward compatibility)
  stakeholder text NOT NULL,
  -- 3NF FK column
  stakeholder_id uuid REFERENCES stakeholders(id),
  channel text NOT NULL CHECK (channel IN ('webhook', 'email')),
  recipient text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  attempts integer NOT NULL DEFAULT 0,
  max_attempts integer NOT NULL DEFAULT 3,
  response text,
  next_retry_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chk_nl_status_values CHECK (status IN ('pending','sent','failed','cancelled'))
);

-- =========================================================================
-- 8. WEBHOOK CONFIGURATION
-- =========================================================================

CREATE TABLE IF NOT EXISTS webhook_configs (
  id text PRIMARY KEY,
  name text NOT NULL,
  url text NOT NULL,
  secret text,
  events jsonb NOT NULL DEFAULT '[]'::jsonb,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- =========================================================================
-- 9. SLA STATUS TRIGGER
-- =========================================================================

ALTER TABLE change_requests ADD COLUMN IF NOT EXISTS sla_status text;
ALTER TABLE change_requests ADD COLUMN IF NOT EXISTS sla_days_open integer;

CREATE OR REPLACE FUNCTION update_sla_status_trigger() RETURNS trigger AS $$
DECLARE
  days_open integer;
  sla_days integer;
  remaining integer;
BEGIN
  IF NEW.status IN ('validated', 'processed') THEN
    NEW.sla_status := 'ok';
    NEW.sla_days_open := GREATEST(0, EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - NEW.created_at))::int / 86400);
    RETURN NEW;
  END IF;
  days_open := GREATEST(0, EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - NEW.created_at))::int / 86400);
  sla_days := NEW.sla_lead_weeks * 7;
  remaining := sla_days - days_open;
  IF remaining <= 0 THEN
    NEW.sla_status := 'overdue';
  ELSIF remaining <= CEIL(sla_days * 0.25) THEN
    NEW.sla_status := 'at_risk';
  ELSE
    NEW.sla_status := 'ok';
  END IF;
  NEW.sla_days_open := days_open;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_change_requests_sla ON change_requests;
CREATE TRIGGER trg_change_requests_sla
  BEFORE INSERT OR UPDATE OF status, created_at, sla_lead_weeks
  ON change_requests
  FOR EACH ROW
  EXECUTE FUNCTION update_sla_status_trigger();

-- =========================================================================
-- 10. PERFORMANCE INDEXES
-- =========================================================================

-- 10a. Foreign key indexes
CREATE INDEX IF NOT EXISTS idx_cr_client_id ON change_requests (client_id);
CREATE INDEX IF NOT EXISTS idx_cr_change_type_id ON change_requests (change_type_id);
CREATE INDEX IF NOT EXISTS idx_cri_change_request_id ON change_request_items (change_request_id);
CREATE INDEX IF NOT EXISTS idx_cri_portfolio_id ON change_request_items (portfolio_id);
CREATE INDEX IF NOT EXISTS idx_cri_previous_benchmark_id ON change_request_items (previous_benchmark_id);
CREATE INDEX IF NOT EXISTS idx_cri_requested_benchmark_id ON change_request_items (requested_benchmark_id);
CREATE INDEX IF NOT EXISTS idx_nbr_change_request_id ON new_benchmark_requests (change_request_id);
CREATE INDEX IF NOT EXISTS idx_nbr_asset_class_id ON new_benchmark_requests (asset_class_id);
CREATE INDEX IF NOT EXISTS idx_al_change_request_id ON audit_log (change_request_id);
CREATE INDEX IF NOT EXISTS idx_app_change_request_id ON approvals (change_request_id);
CREATE INDEX IF NOT EXISTS idx_nc_change_request_id ON notification_config (change_request_id);
CREATE INDEX IF NOT EXISTS idx_nc_stakeholder_id ON notification_config (stakeholder_id);
CREATE INDEX IF NOT EXISTS idx_nl_change_request_id ON notification_log (change_request_id);
CREATE INDEX IF NOT EXISTS idx_nl_stakeholder_id ON notification_log (stakeholder_id);
CREATE INDEX IF NOT EXISTS idx_sh_change_request_id ON status_history (change_request_id);
CREATE INDEX IF NOT EXISTS idx_p_client_id ON portfolios (client_id);
CREATE INDEX IF NOT EXISTS idx_p_wtp_classification_id ON portfolios (wtp_classification_id);
CREATE INDEX IF NOT EXISTS idx_p_asset_class_id ON portfolios (asset_class_id);
CREATE INDEX IF NOT EXISTS idx_p_sub_asset_class_id ON portfolios (sub_asset_class_id);
CREATE INDEX IF NOT EXISTS idx_p_manager_id ON portfolios (manager_id);
CREATE INDEX IF NOT EXISTS idx_p_benchmark_id ON portfolios (benchmark_id);
CREATE INDEX IF NOT EXISTS idx_bc_asset_class_id ON benchmark_catalog (asset_class_id);
CREATE INDEX IF NOT EXISTS idx_sub_ac_asset_class_id ON sub_asset_classes (asset_class_id);
CREATE INDEX IF NOT EXISTS idx_clients_asset_class_id ON clients (asset_class_id);
CREATE INDEX IF NOT EXISTS idx_clients_regeling_type_id ON clients (regeling_type_id);

-- 10b. Filter/sort indexes
CREATE INDEX IF NOT EXISTS idx_cr_status ON change_requests (status);
CREATE INDEX IF NOT EXISTS idx_cr_created_at ON change_requests (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_clients_status ON clients (status);
CREATE INDEX IF NOT EXISTS idx_bc_active ON benchmark_catalog (active);
CREATE INDEX IF NOT EXISTS idx_p_active ON portfolios (active);
CREATE INDEX IF NOT EXISTS idx_nl_status ON notification_log (status);
CREATE INDEX IF NOT EXISTS idx_nc_is_active ON notification_config (is_active);
CREATE INDEX IF NOT EXISTS idx_ctc_active ON change_type_config (active);
CREATE INDEX IF NOT EXISTS idx_ctc_slug ON change_type_config (slug);
CREATE INDEX IF NOT EXISTS idx_asset_classes_code ON asset_classes (code);

-- 10c. Composite indexes
CREATE INDEX IF NOT EXISTS idx_cr_client_created ON change_requests (client_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_cr_status_created ON change_requests (status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_cr_client_status_created ON change_requests (client_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_p_client_active_name ON portfolios (client_id, active, name);

-- 10d. Partial indexes
CREATE INDEX IF NOT EXISTS idx_cr_sla_status_non_terminal
  ON change_requests (sla_status) WHERE status NOT IN ('validated', 'processed');
CREATE INDEX IF NOT EXISTS idx_cr_notification_sent
  ON change_requests (notification_sent) WHERE notification_sent = false;

-- =========================================================================
-- 11. SEED DATA
-- =========================================================================

INSERT INTO asset_classes (id, code, name) VALUES
  ('00000002-0000-4000-a000-000000000001', 'EQUITIES', 'Aandelen'),
  ('00000002-0000-4000-a000-000000000002', 'FIXED_INCOME', 'Obligaties'),
  ('00000002-0000-4000-a000-000000000003', 'REAL_ESTATE', 'Vastgoed'),
  ('00000002-0000-4000-a000-000000000004', 'ALTERNATIVES', 'Alternatieven'),
  ('00000002-0000-4000-a000-000000000005', 'CASH', 'Liquiditeiten'),
  ('00000002-0000-4000-a000-000000000006', 'PRIVATE_EQUITY', 'Private Equity'),
  ('00000002-0000-4000-a000-000000000007', 'INFRASTRUCTURE', 'Infrastructuur'),
  ('00000002-0000-4000-a000-000000000008', 'COMMODITIES', 'Grondstoffen')
ON CONFLICT (id) DO NOTHING;

INSERT INTO wtp_classifications (id, name) VALUES
  ('00000001-0000-4000-a000-000000000001', 'Rendement'),
  ('00000001-0000-4000-a000-000000000002', 'Matching'),
  ('00000001-0000-4000-a000-000000000003', 'Opbouw')
ON CONFLICT (id) DO NOTHING;

INSERT INTO managers (id, name) VALUES
  ('00000003-0000-4000-a000-000000000001', 'EIGEN BEHEER'),
  ('00000003-0000-4000-a000-000000000002', 'ABERDEEN'),
  ('00000003-0000-4000-a000-000000000003', 'ACADIAN'),
  ('00000003-0000-4000-a000-000000000004', 'ADVENT'),
  ('00000003-0000-4000-a000-000000000005', 'AEGON'),
  ('00000003-0000-4000-a000-000000000006', 'ALLIANCE BERNSTEIN'),
  ('00000003-0000-4000-a000-000000000007', 'ALLSPRING'),
  ('00000003-0000-4000-a000-000000000008', 'ALMAZARA'),
  ('00000003-0000-4000-a000-000000000009', 'AQR'),
  ('00000003-0000-4000-a000-000000000010', 'ARROWSTREET'),
  ('00000003-0000-4000-a000-000000000011', 'AXA'),
  ('00000003-0000-4000-a000-000000000012', 'BARCLAYS'),
  ('00000003-0000-4000-a000-000000000013', 'BARINGS'),
  ('00000003-0000-4000-a000-000000000014', 'BLACKROCK'),
  ('00000003-0000-4000-a000-000000000015', 'BLUEBAY'),
  ('00000003-0000-4000-a000-000000000016', 'BNP PARIBAS'),
  ('00000003-0000-4000-a000-000000000017', 'BSM'),
  ('00000003-0000-4000-a000-000000000018', 'CARDANO'),
  ('00000003-0000-4000-a000-000000000019', 'CITIBANK'),
  ('00000003-0000-4000-a000-000000000020', 'CTI'),
  ('00000003-0000-4000-a000-000000000021', 'DDJ'),
  ('00000003-0000-4000-a000-000000000022', 'DE MUNT HYPOTHEKEN'),
  ('00000003-0000-4000-a000-000000000023', 'DEUTSCHE'),
  ('00000003-0000-4000-a000-000000000024', 'DYNAMIC CREDIT'),
  ('00000003-0000-4000-a000-000000000025', 'FIDELITY'),
  ('00000003-0000-4000-a000-000000000026', 'GOLDMAN SACHS'),
  ('00000003-0000-4000-a000-000000000027', 'HENDERSON'),
  ('00000003-0000-4000-a000-000000000028', 'ING'),
  ('00000003-0000-4000-a000-000000000029', 'INSIGHT'),
  ('00000003-0000-4000-a000-000000000030', 'INTERMEDE'),
  ('00000003-0000-4000-a000-000000000031', 'IRISH LIFE'),
  ('00000003-0000-4000-a000-000000000032', 'JP MORGAN'),
  ('00000003-0000-4000-a000-000000000033', 'KEMPEN'),
  ('00000003-0000-4000-a000-000000000034', 'KOPERNIK'),
  ('00000003-0000-4000-a000-000000000035', 'LAZARD'),
  ('00000003-0000-4000-a000-000000000036', 'LEGAL & GENERAL'),
  ('00000003-0000-4000-a000-000000000037', 'LSV'),
  ('00000003-0000-4000-a000-000000000038', 'M&G'),
  ('00000003-0000-4000-a000-000000000039', 'METLIFE'),
  ('00000003-0000-4000-a000-000000000040', 'MFS'),
  ('00000003-0000-4000-a000-000000000041', 'MORGAN STANLEY'),
  ('00000003-0000-4000-a000-000000000042', 'NINETY ONE'),
  ('00000003-0000-4000-a000-000000000043', 'NOMURA'),
  ('00000003-0000-4000-a000-000000000044', 'NORDEA'),
  ('00000003-0000-4000-a000-000000000045', 'NORTHERN TRUST'),
  ('00000003-0000-4000-a000-000000000046', 'OAKTREE'),
  ('00000003-0000-4000-a000-000000000047', 'PAYDEN RYGEL'),
  ('00000003-0000-4000-a000-000000000048', 'PGIM'),
  ('00000003-0000-4000-a000-000000000049', 'PIMCO'),
  ('00000003-0000-4000-a000-000000000050', 'PINESTONE'),
  ('00000003-0000-4000-a000-000000000051', 'PVF HYPOTHEKEN'),
  ('00000003-0000-4000-a000-000000000052', 'PZENA'),
  ('00000003-0000-4000-a000-000000000053', 'ROBECO'),
  ('00000003-0000-4000-a000-000000000054', 'RUSSELL'),
  ('00000003-0000-4000-a000-000000000055', 'SIXTH STREET'),
  ('00000003-0000-4000-a000-000000000056', 'STATESTREET'),
  ('00000003-0000-4000-a000-000000000057', 'STONE HARBOUR'),
  ('00000003-0000-4000-a000-000000000058', 'T-ROWE'),
  ('00000003-0000-4000-a000-000000000059', 'UBS')
ON CONFLICT (id) DO NOTHING;

INSERT INTO benchmarks (id, name) VALUES
  ('00000004-0000-4000-a000-000000000001', 'Benchmark A'),
  ('00000004-0000-4000-a000-000000000002', 'Benchmark B'),
  ('00000004-0000-4000-a000-000000000003', 'Benchmark C')
ON CONFLICT (id) DO NOTHING;

INSERT INTO regeling_types (id, name, description) VALUES
  ('r0000000-0000-4000-a000-000000000001', 'pensioenuitkering', 'Beschikbare premieregeling — uitkeringsfase'),
  ('r0000000-0000-4000-a000-000000000002', 'premieovereenkomst', 'Beschikbare premieregeling — opbouwfase'),
  ('r0000000-0000-4000-a000-000000000003', 'kapitaalovereenkomst', 'Vaste toegezegde kapitaalregeling'),
  ('r0000000-0000-4000-a000-000000000004', 'uitkeringsovereenkomst', 'Vaste toegezegde uitkeringsregeling (eindloon/middelloon)')
ON CONFLICT (id) DO NOTHING;

INSERT INTO stakeholders (id, name) VALUES
  ('s0000000-0000-4000-a000-000000000001', 'Portefeuillebeheerder'),
  ('s0000000-0000-4000-a000-000000000002', 'Risk manager'),
  ('s0000000-0000-4000-a000-000000000003', 'Fiduciair manager'),
  ('s0000000-0000-4000-a000-000000000004', 'Klant'),
  ('s0000000-0000-4000-a000-000000000005', 'Compliance'),
  ('s0000000-0000-4000-a000-000000000006', 'Juridisch'),
  ('s0000000-0000-4000-a000-000000000007', 'Financieel adviseur'),
  ('s0000000-0000-4000-a000-000000000008', 'Beleggingscommissie')
ON CONFLICT (id) DO NOTHING;

INSERT INTO sub_asset_classes (id, name, asset_class_id) VALUES
  ('s1000000-0000-4000-a000-000000000001', 'AC WORLD',           '00000002-0000-4000-a000-000000000001'),
  ('s1000000-0000-4000-a000-000000000002', 'DEVELOPED MARKETS',   '00000002-0000-4000-a000-000000000001'),
  ('s1000000-0000-4000-a000-000000000003', 'EMERGING MARKETS',    '00000002-0000-4000-a000-000000000001'),
  ('s1000000-0000-4000-a000-000000000004', 'SOVEREIGN EUROPE',    '00000002-0000-4000-a000-000000000002'),
  ('s1000000-0000-4000-a000-000000000005', 'CORPORATE EUROPE',    '00000002-0000-4000-a000-000000000002'),
  ('s1000000-0000-4000-a000-000000000006', 'GOVERNMENT BONDS',    '00000002-0000-4000-a000-000000000002'),
  ('s1000000-0000-4000-a000-000000000007', 'HIGH YIELD',          '00000002-0000-4000-a000-000000000002'),
  ('s1000000-0000-4000-a000-000000000008', 'PRIVATE EQUITY',      '00000002-0000-4000-a000-000000000004'),
  ('s1000000-0000-4000-a000-000000000009', 'REAL ESTATE DIRECT',  '00000002-0000-4000-a000-000000000003'),
  ('s1000000-0000-4000-a000-000000000010', 'REAL ESTATE INDIRECT','00000002-0000-4000-a000-000000000003')
ON CONFLICT (id) DO NOTHING;

-- Benchmark catalog with asset_class_id FK
INSERT INTO benchmark_catalog (id, code, name, asset_class, asset_class_id, currency, cost, provider, lead_weeks) VALUES
  ('9fb65c5a-5ccf-4374-a264-9b03c9ac3bd1', 'MSCI-WORLD-NR', 'MSCI World Net Return',         'Aandelen',     '00000002-0000-4000-a000-000000000001', 'EUR', 1000.00, 'MSCI', 1),
  ('b9ec8da5-5d7a-4ee0-a23e-9746ded5b43d', 'MSCI-ACWI-NR', 'MSCI ACWI Net Return',           'Aandelen',     '00000002-0000-4000-a000-000000000001', 'EUR', 1200.00, 'MSCI', 1),
  ('7c8bd971-b05c-4141-9a27-7ee0d02137a5', 'BLOOMBERG-EU-AGG', 'Bloomberg Euro Aggregate',   'Obligaties',   '00000002-0000-4000-a000-000000000002', 'EUR', 1000.00, 'Bloomberg', 1),
  ('9644a84d-59d6-40fa-aee9-062fbc1ef9fc', 'ICE-BOFA-EU-CORP', 'ICE BofA Euro Corporate',    'Obligaties',   '00000002-0000-4000-a000-000000000002', 'EUR', 1000.00, 'ICE BofA', 1),
  ('a1b2c3d4-e5f6-7890-abcd-ef0123456780', 'CUSTOM-ESG-NL', 'Duurzame NL Benchmark',         'Aandelen',     '00000002-0000-4000-a000-000000000001', 'EUR', 1500.00, 'rimes', 4),
  ('a1b2c3d4-e5f6-7890-abcd-ef0123456781', 'RIMES-PRIVATE-EQ', 'Rimes Private Equity Index', 'Alternatieven', '00000002-0000-4000-a000-000000000004', 'EUR', 2000.00, 'rimes', 4),
  ('a1b2c3d4-e5f6-7890-abcd-ef0123456782', 'EURO-GOVT-1-3Y', 'Euro Government 1-3 Year',     'Obligaties',   '00000002-0000-4000-a000-000000000002', 'EUR', 800.00, 'Bloomberg', 1),
  ('a1b2c3d4-e5f6-7890-abcd-ef0123456783', 'GLOBAL-REIT-NR', 'Global REIT Net Return',       'Vastgoed',     '00000002-0000-4000-a000-000000000003', 'EUR', 1500.00, 'MSCI', 1),
  ('9a1b2c3d-4e5f-6789-abcd-ef0123456784', 'MSCI-EM-NR', 'MSCI Emerging Markets Net Return','Aandelen',     '00000002-0000-4000-a000-000000000001', 'USD', 1000.00, 'MSCI', 1),
  ('9a1b2c3d-4e5f-6789-abcd-ef0123456785', 'BLOOMBERG-GL-AGG', 'Bloomberg Global Aggregate', 'Obligaties',   '00000002-0000-4000-a000-000000000002', 'USD', 1000.00, 'Bloomberg', 1),
  ('9a1b2c3d-4e5f-6789-abcd-ef0123456786', 'HFRX-GL-HEDGE', 'HFRX Global Hedge Fund Index',  'Alternatieven','00000002-0000-4000-a000-000000000004', 'USD', 2500.00, 'HFRX', 4),
  ('9a1b2c3d-4e5f-6789-abcd-ef0123456787', 'S&P-500-NR', 'S&P 500 Net Return',              'Aandelen',     '00000002-0000-4000-a000-000000000001', 'USD', 1000.00, 'S&P', 1),
  ('a2b1c3d4-e5f6-7890-abcd-ef0123456788', 'S&P-GSCI', 'S&P GSCI Commodity Total Return',   'Grondstoffen', '00000002-0000-4000-a000-000000000008', 'USD', 1500.00, 'S&P', 1),
  ('a2b1c3d4-e5f6-7890-abcd-ef0123456789', 'MSCI-WORLD-INFRA', 'MSCI World Infrastructure Net Return', 'Infrastructuur', '00000002-0000-4000-a000-000000000007', 'EUR', 1400.00, 'MSCI', 1),
  ('a2b1c3d4-e5f6-7890-abcd-ef0123456790', 'BLOOMBERG-GL-HY', 'Bloomberg Global High Yield',  'Obligaties',   '00000002-0000-4000-a000-000000000002', 'USD', 1800.00, 'Bloomberg', 1),
  ('a2b1c3d4-e5f6-7890-abcd-ef0123456791', 'FTSE-EPRA-NAREIT-DEV', 'FTSE EPRA Nareit Developed','Vastgoed',     '00000002-0000-4000-a000-000000000003', 'EUR', 1200.00, 'FTSE Russell', 1),
  ('a2b1c3d4-e5f6-7890-abcd-ef0123456792', 'MSCI-WORLD-HEALTH', 'MSCI World Health Care Net Return','Aandelen','00000002-0000-4000-a000-000000000001','EUR', 1100.00, 'MSCI', 1)
ON CONFLICT (id) DO NOTHING;

INSERT INTO clients (id, name, external_reference) VALUES
  ('9f9280fc-9572-49d1-b81c-2a039652bc93', 'Pensioenfonds Horizon', 'PF-HOR-001'),
  ('7b9303c1-3a0d-4398-a5c2-740ea76dfe37', 'Stichting Pensioen Zeker', 'PF-ZEK-002')
ON CONFLICT (id) DO NOTHING;

INSERT INTO portfolios (id, client_id, name, external_reference, current_benchmark_id,
  wtp_classification_id, asset_class_id, sub_asset_class_id, manager_id, benchmark_id) VALUES
  ('c4707067-b98a-4a0f-92c7-5ee510dc70ff', '9f9280fc-9572-49d1-b81c-2a039652bc93', 'Rendementsportefeuille', 'HOR-RP', '9fb65c5a-5ccf-4374-a264-9b03c9ac3bd1',
   '00000001-0000-4000-a000-000000000001', '00000002-0000-4000-a000-000000000001', 's1000000-0000-4000-a000-000000000001', '00000003-0000-4000-a000-000000000001', '00000004-0000-4000-a000-000000000001'),
  ('c12ca209-4df0-4774-bf96-0e31b5a10ff4', '9f9280fc-9572-49d1-b81c-2a039652bc93', 'Matchingportefeuille', 'HOR-MP', '7c8bd971-b05c-4141-9a27-7ee0d02137a5',
   '00000001-0000-4000-a000-000000000002', '00000002-0000-4000-a000-000000000002', 's1000000-0000-4000-a000-000000000004', '00000003-0000-4000-a000-000000000001', '00000004-0000-4000-a000-000000000002'),
  ('93de32a3-f238-4504-9fad-ab97cbe1a174', '7b9303c1-3a0d-4398-a5c2-740ea76dfe37', 'Return portefeuille', 'ZEK-RET', 'b9ec8da5-5d7a-4ee0-a23e-9746ded5b43d',
   '00000001-0000-4000-a000-000000000001', '00000002-0000-4000-a000-000000000001', 's1000000-0000-4000-a000-000000000002', '00000003-0000-4000-a000-000000000002', '00000004-0000-4000-a000-000000000001')
ON CONFLICT (id) DO NOTHING;

-- =========================================================================
-- 12. CLIENT CONFIG SCHEMA (3NF model from clientconfig_schema.sql)
-- =========================================================================
CREATE SCHEMA IF NOT EXISTS client_config;

-- 12a. Independent lookup tables (no foreign keys)
CREATE TABLE IF NOT EXISTS client_config.legal_entity (
  legal_entity_id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  legal_name varchar(100) NOT NULL UNIQUE CHECK (legal_name ~ '^[^\r\n]{1,100}$')
);

CREATE TABLE IF NOT EXISTS client_config.parent_account (
  parent_account_id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  parent_account_code varchar(16) NOT NULL UNIQUE CHECK (parent_account_code ~ '^[A-Z0-9]+(?:_[A-Z0-9]+)*$'),
  msa_parent_account_code varchar(16) CHECK (msa_parent_account_code IS NULL OR msa_parent_account_code ~ '^[A-Z0-9]+(?:_[A-Z0-9]+)*$')
);

CREATE TABLE IF NOT EXISTS client_config.asset_class (
  asset_class_id smallint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  asset_class_code char(2) NOT NULL UNIQUE CHECK (asset_class_code ~ '^[A-Z]{2}$'),
  asset_class_name varchar(30) NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS client_config.manager (
  manager_id smallint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  manager_code char(3) NOT NULL UNIQUE CHECK (manager_code ~ '^[A-Z0-9]{3}$'),
  manager_name varchar(50) NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS client_config.benchmark (
  benchmark_id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  benchmark_code varchar(60) NOT NULL UNIQUE,
  benchmark_name varchar(100),
  rimes_code varchar(40)
);

CREATE TABLE IF NOT EXISTS client_config.model (
  model_id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  model_code varchar(10) NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS client_config.classification (
  classification_id smallint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  classification_code varchar(10) NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS client_config.strategy (
  strategy_id smallint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  strategy_name varchar(30) NOT NULL UNIQUE
);

-- 12b. Tables with foreign key dependencies
CREATE TABLE IF NOT EXISTS client_config.portfolio (
  portfolio_id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  portfolio_code varchar(15) NOT NULL UNIQUE CHECK (portfolio_code ~ '^[A-Z0-9]{2,15}$'),
  parent_account_id bigint REFERENCES client_config.parent_account
);

CREATE TABLE IF NOT EXISTS client_config.sub_asset_class (
  sub_asset_class_id smallint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  asset_class_id smallint NOT NULL REFERENCES client_config.asset_class,
  sub_asset_class_code char(3) NOT NULL CHECK (sub_asset_class_code ~ '^[A-Z0-9]{3}$'),
  sub_asset_class_name varchar(50) NOT NULL,
  UNIQUE(asset_class_id, sub_asset_class_code),
  UNIQUE(asset_class_id, sub_asset_class_name)
);

CREATE TABLE IF NOT EXISTS client_config.sub_strategy (
  sub_strategy_id smallint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  strategy_id smallint NOT NULL REFERENCES client_config.strategy,
  sub_strategy_name varchar(50) NOT NULL,
  UNIQUE(strategy_id, sub_strategy_name)
);

CREATE TABLE IF NOT EXISTS client_config.account (
  primary_account_id varchar(30) PRIMARY KEY CHECK (primary_account_id ~ '^[A-Z0-9]{2,15}_[A-Z]{2}[A-Z0-9]{3}_[A-Z0-9]{3}$'),
  portfolio_id bigint NOT NULL REFERENCES client_config.portfolio,
  asset_class_id smallint NOT NULL REFERENCES client_config.asset_class,
  sub_asset_class_id smallint NOT NULL REFERENCES client_config.sub_asset_class,
  manager_id smallint NOT NULL REFERENCES client_config.manager,
  legal_entity_id bigint REFERENCES client_config.legal_entity,
  additional_code varchar(3),
  long_name varchar(50) NOT NULL,
  short_name varchar(30) NOT NULL,
  model_id bigint REFERENCES client_config.model,
  classification_id smallint REFERENCES client_config.classification,
  strategy_id smallint NOT NULL REFERENCES client_config.strategy,
  sub_strategy_id smallint NOT NULL REFERENCES client_config.sub_strategy,
  benchmark_id bigint REFERENCES client_config.benchmark,
  UNIQUE(portfolio_id, asset_class_id, sub_asset_class_id, manager_id)
);

-- 12c. Seed asset class hierarchy data (idempotent)
WITH source(asset_code, asset_name, sub_code, sub_name) AS (VALUES
  ('CS','CASH','CAS','CASH'),
  ('CS','CASH','FUN','FUNDS'),
  ('CS','CASH','LIQ','LIQUIDITIES'),
  ('EQ','EQUITIES','DEV','DEVELOPED MARKETS'),
  ('EQ','EQUITIES','DMF','DEVELOPED MARKETS FACTOR'),
  ('EQ','EQUITIES','DMS','DEVELOPED MARKETS SMALL CAP'),
  ('EQ','EQUITIES','EME','EMERGING MARKETS'),
  ('EQ','EQUITIES','ACX','AC WORLD'),
  ('EQ','EQUITIES','EUR','EUROPE'),
  ('EQ','EQUITIES','JAP','JAPAN'),
  ('EQ','EQUITIES','AEJ','ASIA EX-JAPAN'),
  ('EQ','EQUITIES','UNI','UNITED STATES'),
  ('EQ','EQUITIES','NOR','NORTH AMERICA'),
  ('EQ','EQUITIES','DUU','DUURZAAM'),
  ('EQ','EQUITIES','MIL','MILIEU & WATER'),
  ('EQ','EQUITIES','BIO','BIODIVERSITY'),
  ('EQ','EQUITIES','FUN','FUNDS'),
  ('EQ','EQUITIES','EMF','EMERGING MARKETS FACTOR'),
  ('EQ','EQUITIES','AWF','AC WORLD FACTOR'),
  ('AL','ALTERNATIVES','PRI','PRIVATE EQUITY'),
  ('AL','ALTERNATIVES','HED','HEDGE FUNDS'),
  ('AL','ALTERNATIVES','PEI','PRIVATE EQUITY IMPACT'),
  ('AL','ALTERNATIVES','HFC','HEDGE FUNDS CTA'),
  ('AL','ALTERNATIVES','HFG','HEDGE FUNDS GLOBAL MACRO'),
  ('AL','ALTERNATIVES','ILS','INFLATION LINKED SECURITIES'),
  ('AL','ALTERNATIVES','GOL','GOLD'),
  ('AL','ALTERNATIVES','RIS','RISK PARITY'),
  ('AL','ALTERNATIVES','RIP','RISK PREMIA'),
  ('RA','REAL_ASSETS','AGR','AGRICULTURE'),
  ('RA','REAL_ASSETS','COM','COMMODITIES'),
  ('RA','REAL_ASSETS','INF','INFRASTRUCTURE'),
  ('RA','REAL_ASSETS','REA','REALESTATE LISTED'),
  ('RA','REAL_ASSETS','RED','REALESTATE DIRECT'),
  ('RA','REAL_ASSETS','RNL','REALESTATE NON-LISTED NETHERLANDS'),
  ('RA','REAL_ASSETS','REN','REALESTATE NON-LISTED INTERNATIONAL'),
  ('RA','REAL_ASSETS','RNA','REALESTATE NON-LISTED EUROPE'),
  ('RA','REAL_ASSETS','RNB','REALESTATE NON-LISTED ASIA PACIFIC'),
  ('RA','REAL_ASSETS','RNC','REALESTATE NON-LISTED NORTH AMERICA'),
  ('RA','REAL_ASSETS','FOR','FORESTRY'),
  ('FI','FIXED_INCOME','ABS','ASSET BACKED SECURITIES'),
  ('FI','FIXED_INCOME','BAN','BANKLOANS'),
  ('FI','FIXED_INCOME','BIO','BIODIVERSITY'),
  ('FI','FIXED_INCOME','CON','CONVERTABLES'),
  ('FI','FIXED_INCOME','CCL','CLO (COLLATERALIZED LOAN OBLIGATION)'),
  ('FI','FIXED_INCOME','COR','CORPORATES EUROPE'),
  ('FI','FIXED_INCOME','CRE','CREDITS EUROPE'),
  ('FI','FIXED_INCOME','CRG','CREDITS GLOBAL'),
  ('FI','FIXED_INCOME','CRU','CREDITS USA'),
  ('FI','FIXED_INCOME','DHM','DEBT HY MICRO FINANCIERING'),
  ('FI','FIXED_INCOME','DIE','DEBT IG ECA LOANS'),
  ('FI','FIXED_INCOME','DIW','DEBT IG WSW LOANS'),
  ('FI','FIXED_INCOME','DUU','DUURZAAM'),
  ('FI','FIXED_INCOME','EMB','EMERGING MARKETS BLEND'),
  ('FI','FIXED_INCOME','EMH','EMERGING MARKETS HC'),
  ('FI','FIXED_INCOME','EML','EMERGING MARKETS LC'),
  ('FI','FIXED_INCOME','FUN','FUNDS'),
  ('FI','FIXED_INCOME','GRE','GREENBONDS'),
  ('FI','FIXED_INCOME','HYE','HIGH YIELD EUROPE'),
  ('FI','FIXED_INCOME','HYG','HIGH YIELD GLOBAL'),
  ('FI','FIXED_INCOME','HYU','HIGH YIELD USA'),
  ('FI','FIXED_INCOME','ILB','INFLATION LINKED BONDS EUROPE'),
  ('FI','FIXED_INCOME','INL','INFLATION LINKED BONDS GLOBAL'),
  ('FI','FIXED_INCOME','LDI','LDI'),
  ('FI','FIXED_INCOME','LIM','LIQUID INVESTMENTS (MONEY MARKET)'),
  ('FI','FIXED_INCOME','LIQ','LIQUIDITIES'),
  ('FI','FIXED_INCOME','MOR','MORTGAGES'),
  ('FI','FIXED_INCOME','OVE','OVERLAYFUNDS'),
  ('FI','FIXED_INCOME','PRI','PRIVATE LOANS'),
  ('FI','FIXED_INCOME','SEC','SECURITIZED'),
  ('FI','FIXED_INCOME','SOC','SOCIAL'),
  ('FI','FIXED_INCOME','SOV','SOVEREIGN EUROPE'),
  ('FI','FIXED_INCOME','SOG','SOVEREIGN GLOBAL'),
  ('MA','MULTI_ASSETS','DEF','DEFENSIVE'),
  ('MA','MULTI_ASSETS','VER','VERY DEFENSIVE'),
  ('MA','MULTI_ASSETS','NEU','NEUTRAL'),
  ('MA','MULTI_ASSETS','OFF','OFFENSIVE'),
  ('MA','MULTI_ASSETS','VEO','VERY OFFENSIVE'),
  ('MA','MULTI_ASSETS','MIX','MIX'),
  ('OV','OVERLAY','INT','INTEREST'),
  ('OV','OVERLAY','CUR','CURRENCY'),
  ('OV','OVERLAY','INF','INFLATION'),
  ('OV','OVERLAY','EQU','EQUITY'),
  ('OV','OVERLAY','FUN','FUNDS'),
  ('IM','IMPACT','IMP','IMPACT'),
  ('IM','IMPACT','EQU','EQUITIES'),
  ('IM','IMPACT','FID','FIXED INCOME DEBT'),
  ('IM','IMPACT','PRI','PRIVATE EQUITY'),
  ('IM','IMPACT','REA','REALESTATE'),
  ('IM','IMPACT','AGR','AGRICULTURE'),
  ('IM','IMPACT','INF','INFRASTRUCTURE'),
  ('IM','IMPACT','CLI','CLIMATE'),
  ('IM','IMPACT','FOR','FORESTRY')
),
ins_asset AS (
  INSERT INTO client_config.asset_class (asset_class_code, asset_class_name)
  SELECT DISTINCT asset_code, asset_name FROM source
  ON CONFLICT DO NOTHING
  RETURNING 1
)
INSERT INTO client_config.sub_asset_class (asset_class_id, sub_asset_class_code, sub_asset_class_name)
SELECT a.asset_class_id, s.sub_code, s.sub_name
FROM source s
JOIN client_config.asset_class a ON a.asset_class_code = s.asset_code
ON CONFLICT DO NOTHING;

-- 12d. Account validation trigger
CREATE OR REPLACE FUNCTION client_config.validate_account_selection() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE expected text;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM client_config.sub_asset_class s
    WHERE s.sub_asset_class_id = NEW.sub_asset_class_id
      AND s.asset_class_id = NEW.asset_class_id
  ) THEN
    RAISE EXCEPTION 'Sub asset class hoort niet bij asset class';
  END IF;
  SELECT p.portfolio_code || '_' || a.asset_class_code || s.sub_asset_class_code || '_' || m.manager_code
  INTO expected
  FROM client_config.portfolio p, client_config.asset_class a,
       client_config.sub_asset_class s, client_config.manager m
  WHERE p.portfolio_id = NEW.portfolio_id
    AND a.asset_class_id = NEW.asset_class_id
    AND s.sub_asset_class_id = NEW.sub_asset_class_id
    AND m.manager_id = NEW.manager_id;
  IF NEW.primary_account_id <> expected THEN
    RAISE EXCEPTION 'primary_account_id % moet % zijn', NEW.primary_account_id, expected;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_validate_account_selection ON client_config.account;
CREATE TRIGGER trg_validate_account_selection
  BEFORE INSERT OR UPDATE ON client_config.account
  FOR EACH ROW EXECUTE FUNCTION client_config.validate_account_selection();
