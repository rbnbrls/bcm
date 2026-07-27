-- ──────────────────────────────────────────────────────────────────────────
-- BCM Database Schema
-- ──────────────────────────────────────────────────────────────────────────
-- This init.sql is the single source of truth for the database schema.
-- It is applied on first PostgreSQL volume creation by Docker Compose.
-- For existing deployments use scripts/optimize-schema.mjs or migrate.mjs.
--
-- All DDL below is idempotent (IF NOT EXISTS guards) so it can safely
-- be re-applied during schema updates.
-- ──────────────────────────────────────────────────────────────────────────

-- =========================================================================
-- EXTENSIONS
-- =========================================================================
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- =========================================================================
-- 1. CORE TABLES
-- =========================================================================

CREATE TABLE IF NOT EXISTS clients (
  id uuid PRIMARY KEY,
  name text NOT NULL UNIQUE,
  external_reference text NOT NULL UNIQUE,
  regeling_type text,
  asset_class text,
  status text NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS benchmark_catalog (
  id uuid PRIMARY KEY,
  code text NOT NULL UNIQUE,
  name text NOT NULL,
  asset_class text NOT NULL,
  currency text NOT NULL,
  cost numeric(10,2) NOT NULL DEFAULT 1000.00,
  provider text NOT NULL DEFAULT 'rimes',
  active boolean NOT NULL DEFAULT true,
  lead_weeks integer NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS portfolios (
  id uuid PRIMARY KEY,
  client_id uuid NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  name text NOT NULL,
  external_reference text NOT NULL,
  current_benchmark_id uuid NOT NULL REFERENCES benchmark_catalog(id),
  currency text NOT NULL DEFAULT 'EUR',
  active boolean NOT NULL DEFAULT true,
  UNIQUE (client_id, external_reference)
);

-- =========================================================================
-- 2. CHANGE REQUEST TABLES
-- =========================================================================

CREATE TABLE IF NOT EXISTS change_requests (
  id uuid PRIMARY KEY,
  reference text NOT NULL UNIQUE,
  change_type text NOT NULL,
  change_type_id uuid REFERENCES change_type_config(id) ON DELETE SET NULL,
  client_id uuid NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  requested_by text NOT NULL,
  rationale text NOT NULL,
  effective_date date NOT NULL,
  status text NOT NULL DEFAULT 'draft',
  sla_lead_weeks integer NOT NULL DEFAULT 1,
  status_updated_at timestamptz NOT NULL DEFAULT now(),
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
  -- Only known status values are permitted
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
  asset_class text NOT NULL,
  currency text NOT NULL DEFAULT 'EUR',
  estimated_cost numeric(10,2) NOT NULL DEFAULT 5000.00,
  estimated_lead_weeks integer NOT NULL DEFAULT 4
);

-- =========================================================================
-- 3. CHANGE TYPE CONFIGURATION (generic change-type model)
-- =========================================================================

CREATE TABLE IF NOT EXISTS change_type_config (
  id uuid PRIMARY KEY,
  slug text NOT NULL UNIQUE,
  name text NOT NULL,
  description text NOT NULL DEFAULT '',
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

-- =========================================================================
-- 4. AUDIT & APPROVAL TABLES
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
-- 5. STATUS HISTORY
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
-- 6. NOTIFICATION TABLES
-- =========================================================================

CREATE TABLE IF NOT EXISTS notification_config (
  id uuid PRIMARY KEY,
  stakeholder text NOT NULL,
  channel text NOT NULL CHECK (channel IN ('webhook', 'email')),
  recipient text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  change_request_id uuid REFERENCES change_requests(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_notif_config_app
  ON notification_config (stakeholder, channel) WHERE change_request_id IS NULL;

CREATE TABLE IF NOT EXISTS notification_log (
  id uuid PRIMARY KEY,
  change_request_id uuid NOT NULL REFERENCES change_requests(id) ON DELETE CASCADE,
  stakeholder text NOT NULL,
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
-- 7. WEBHOOK CONFIGURATION
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
-- 8. SLA STATUS CACHING — trigger to auto-compute sla_status + sla_days_open
-- =========================================================================
-- The sla_status and sla_days_open columns cache the computed SLA values so
-- read paths don't recompute computeSlaStatus() on every row (500+ Date
-- computations per request). The trigger fires on INSERT and when
-- status/created_at/sla_lead_weeks change. A scheduled refresh
-- (scripts/refresh-sla.mjs) handles time-based drift for non-terminal rows.
-- -------------------------------------------------------------------------

ALTER TABLE change_requests ADD COLUMN IF NOT EXISTS sla_status text;
ALTER TABLE change_requests ADD COLUMN IF NOT EXISTS sla_days_open integer;

CREATE OR REPLACE FUNCTION update_sla_status_trigger() RETURNS trigger AS $$
DECLARE
  days_open integer;
  sla_days integer;
  remaining integer;
BEGIN
  -- Terminal statuses are always "ok" regardless of elapsed time
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
-- 9. PERFORMANCE INDEXES
-- =========================================================================
--
-- PostgreSQL does NOT auto-index foreign key columns.  Without these
-- indexes every JOIN involving a FK column triggers a sequential scan.
-- -------------------------------------------------------------------------

-- 8a. Foreign key indexes
CREATE INDEX IF NOT EXISTS idx_cr_client_id ON change_requests (client_id);
CREATE INDEX IF NOT EXISTS idx_cr_change_type_id ON change_requests (change_type_id);
CREATE INDEX IF NOT EXISTS idx_cri_change_request_id ON change_request_items (change_request_id);
CREATE INDEX IF NOT EXISTS idx_cri_portfolio_id ON change_request_items (portfolio_id);
CREATE INDEX IF NOT EXISTS idx_cri_previous_benchmark_id ON change_request_items (previous_benchmark_id);
CREATE INDEX IF NOT EXISTS idx_cri_requested_benchmark_id ON change_request_items (requested_benchmark_id);
CREATE INDEX IF NOT EXISTS idx_nbr_change_request_id ON new_benchmark_requests (change_request_id);
CREATE INDEX IF NOT EXISTS idx_al_change_request_id ON audit_log (change_request_id);
CREATE INDEX IF NOT EXISTS idx_app_change_request_id ON approvals (change_request_id);
CREATE INDEX IF NOT EXISTS idx_nc_change_request_id ON notification_config (change_request_id);
CREATE INDEX IF NOT EXISTS idx_nl_change_request_id ON notification_log (change_request_id);
CREATE INDEX IF NOT EXISTS idx_sh_change_request_id ON status_history (change_request_id);
CREATE INDEX IF NOT EXISTS idx_p_client_id ON portfolios (client_id);

-- 8b. Filter / sort indexes
CREATE INDEX IF NOT EXISTS idx_cr_status ON change_requests (status);
CREATE INDEX IF NOT EXISTS idx_cr_created_at ON change_requests (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_cr_change_type ON change_requests (change_type);
CREATE INDEX IF NOT EXISTS idx_clients_status ON clients (status);
CREATE INDEX IF NOT EXISTS idx_bc_active ON benchmark_catalog (active);
CREATE INDEX IF NOT EXISTS idx_bc_asset_class ON benchmark_catalog (asset_class);
CREATE INDEX IF NOT EXISTS idx_p_active ON portfolios (active);
CREATE INDEX IF NOT EXISTS idx_nl_status ON notification_log (status);
CREATE INDEX IF NOT EXISTS idx_nc_is_active ON notification_config (is_active);
CREATE INDEX IF NOT EXISTS idx_ctc_active ON change_type_config (active);
CREATE INDEX IF NOT EXISTS idx_ctc_slug ON change_type_config (slug);

-- 8c. Composite indexes for common query patterns
CREATE INDEX IF NOT EXISTS idx_cr_client_created ON change_requests (client_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_cr_status_created ON change_requests (status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_cr_client_status_created ON change_requests (client_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_p_client_active_name ON portfolios (client_id, active, name);

-- =========================================================================
-- 10. SEED DATA
-- =========================================================================
-- Safe to re-run: uses ON CONFLICT DO NOTHING / idempotent INSERT patterns.

INSERT INTO benchmark_catalog (id, code, name, asset_class, currency, cost, provider, lead_weeks) VALUES
  ('9fb65c5a-5ccf-4374-a264-9b03c9ac3bd1', 'MSCI-WORLD-NR', 'MSCI World Net Return', 'Aandelen', 'EUR', 1000.00, 'MSCI', 1),
  ('b9ec8da5-5d7a-4ee0-a23e-9746ded5b43d', 'MSCI-ACWI-NR', 'MSCI ACWI Net Return', 'Aandelen', 'EUR', 1200.00, 'MSCI', 1),
  ('7c8bd971-b05c-4141-9a27-7ee0d02137a5', 'BLOOMBERG-EU-AGG', 'Bloomberg Euro Aggregate', 'Obligaties', 'EUR', 1000.00, 'Bloomberg', 1),
  ('9644a84d-59d6-40fa-aee9-062fbc1ef9fc', 'ICE-BOFA-EU-CORP', 'ICE BofA Euro Corporate', 'Obligaties', 'EUR', 1000.00, 'ICE BofA', 1),
  ('a1b2c3d4-e5f6-7890-abcd-ef0123456780', 'CUSTOM-ESG-NL', 'Duurzame NL Benchmark', 'Aandelen', 'EUR', 1500.00, 'rimes', 4),
  ('a1b2c3d4-e5f6-7890-abcd-ef0123456781', 'RIMES-PRIVATE-EQ', 'Rimes Private Equity Index', 'Alternatieven', 'EUR', 2000.00, 'rimes', 4),
  ('a1b2c3d4-e5f6-7890-abcd-ef0123456782', 'EURO-GOVT-1-3Y', 'Euro Government 1-3 Year', 'Obligaties', 'EUR', 800.00, 'Bloomberg', 1),
  ('a1b2c3d4-e5f6-7890-abcd-ef0123456783', 'GLOBAL-REIT-NR', 'Global REIT Net Return', 'Vastgoed', 'EUR', 1500.00, 'MSCI', 1),
  ('9a1b2c3d-4e5f-6789-abcd-ef0123456784', 'MSCI-EM-NR', 'MSCI Emerging Markets Net Return', 'Aandelen', 'USD', 1000.00, 'MSCI', 1),
  ('9a1b2c3d-4e5f-6789-abcd-ef0123456785', 'BLOOMBERG-GL-AGG', 'Bloomberg Global Aggregate', 'Obligaties', 'USD', 1000.00, 'Bloomberg', 1),
  ('9a1b2c3d-4e5f-6789-abcd-ef0123456786', 'HFRX-GL-HEDGE', 'HFRX Global Hedge Fund Index', 'Alternatieven', 'USD', 2500.00, 'HFRX', 4),
  ('9a1b2c3d-4e5f-6789-abcd-ef0123456787', 'S&P-500-NR', 'S&P 500 Net Return', 'Aandelen', 'USD', 1000.00, 'S&P', 1)
ON CONFLICT (id) DO NOTHING;

INSERT INTO clients (id, name, external_reference) VALUES
  ('9f9280fc-9572-49d1-b81c-2a039652bc93', 'Pensioenfonds Horizon', 'PF-HOR-001'),
  ('7b9303c1-3a0d-4398-a5c2-740ea76dfe37', 'Stichting Pensioen Zeker', 'PF-ZEK-002')
ON CONFLICT (id) DO NOTHING;

INSERT INTO portfolios (id, client_id, name, external_reference, current_benchmark_id) VALUES
  ('c4707067-b98a-4a0f-92c7-5ee510dc70ff', '9f9280fc-9572-49d1-b81c-2a039652bc93', 'Rendementsportefeuille', 'HOR-RP', '9fb65c5a-5ccf-4374-a264-9b03c9ac3bd1'),
  ('c12ca209-4df0-4774-bf96-0e31b5a10ff4', '9f9280fc-9572-49d1-b81c-2a039652bc93', 'Matchingportefeuille', 'HOR-MP', '7c8bd971-b05c-4141-9a27-7ee0d02137a5'),
  ('93de32a3-f238-4504-9fad-ab97cbe1a174', '7b9303c1-3a0d-4398-a5c2-740ea76dfe37', 'Return portefeuille', 'ZEK-RET', 'b9ec8da5-5d7a-4ee0-a23e-9746ded5b43d')
ON CONFLICT (id) DO NOTHING;
