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

CREATE TABLE IF NOT EXISTS wtp_classifications (
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
  asset_class_id text,
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
  asset_class_id text,
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
  asset_class_id text,
  -- 3NF FK column
  sub_asset_class_id text,
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
  workflow_version_id uuid REFERENCES workflow_version(id) ON DELETE RESTRICT,
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
  workflow_instance_id uuid,
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
  asset_class_id text,
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
-- 9. WORKFLOW STUDIO DEFINITIONS AND IMMUTABLE VERSIONS
-- =========================================================================

CREATE TABLE IF NOT EXISTS workflow_definition (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant text NOT NULL,
  business_unit text NOT NULL,
  client_ids text[],
  slug text NOT NULL,
  name text NOT NULL,
  description text NOT NULL DEFAULT '',
  category text NOT NULL DEFAULT 'other',
  tags text[] NOT NULL DEFAULT '{}'::text[],
  catalog_description text NOT NULL DEFAULT '',
  cost_model jsonb NOT NULL DEFAULT '{"baseCost":0,"currency":"EUR","description":""}'::jsonb,
  owner_user_id text NOT NULL,
  status text NOT NULL DEFAULT 'draft',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_workflow_definition_scope_slug UNIQUE (tenant, business_unit, slug),
  CONSTRAINT chk_workflow_definition_slug CHECK (slug ~ '^[a-z0-9]+(?:[-_][a-z0-9]+)*$'),
  CONSTRAINT chk_workflow_definition_scope CHECK (
    tenant <> '' AND business_unit <> ''
    AND (client_ids IS NULL OR cardinality(client_ids) > 0)
  ),
  CONSTRAINT chk_workflow_definition_status CHECK (
    status IN ('draft','published','deprecated','archived')
  ),
  CONSTRAINT chk_workflow_definition_category CHECK (
    category IN ('change','operations','compliance','data','other')
  ),
  CONSTRAINT chk_workflow_definition_cost_model CHECK (
    jsonb_typeof(cost_model) = 'object'
    AND jsonb_typeof(cost_model->'baseCost') = 'number'
    AND (cost_model->>'baseCost')::numeric >= 0
    AND cost_model->>'currency' ~ '^[A-Z]{3}$'
  )
);

CREATE TABLE IF NOT EXISTS workflow_version (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_definition_id uuid NOT NULL REFERENCES workflow_definition(id) ON DELETE CASCADE,
  version_number integer NOT NULL,
  schema_version integer NOT NULL DEFAULT 1,
  status text NOT NULL DEFAULT 'draft',
  content_hash text,
  revision bigint NOT NULL DEFAULT 1,
  published_at timestamptz,
  published_by_user_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_workflow_version_number UNIQUE (workflow_definition_id, version_number),
  CONSTRAINT chk_workflow_version_number CHECK (version_number > 0),
  CONSTRAINT chk_workflow_schema_version CHECK (schema_version > 0),
  CONSTRAINT chk_workflow_version_revision CHECK (revision > 0),
  CONSTRAINT chk_workflow_version_status CHECK (status IN ('draft','published')),
  CONSTRAINT chk_workflow_version_publication CHECK (
    (status = 'draft' AND content_hash IS NULL AND published_at IS NULL AND published_by_user_id IS NULL)
    OR
    (status = 'published' AND content_hash ~ '^[0-9a-f]{64}$'
      AND published_at IS NOT NULL AND published_by_user_id IS NOT NULL)
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_workflow_version_single_draft
  ON workflow_version (workflow_definition_id) WHERE status = 'draft';

CREATE TABLE IF NOT EXISTS workflow_version_review (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_version_id uuid NOT NULL REFERENCES workflow_version(id) ON DELETE CASCADE,
  revision bigint NOT NULL,
  decision text NOT NULL,
  notes text NOT NULL DEFAULT '',
  reviewer_user_id text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chk_workflow_version_review_revision CHECK (revision > 0),
  CONSTRAINT chk_workflow_version_review_decision CHECK (decision IN ('submitted','approved','rejected')),
  CONSTRAINT chk_workflow_version_review_actor CHECK (reviewer_user_id <> '')
);

CREATE TABLE IF NOT EXISTS workflow_node (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_version_id uuid NOT NULL REFERENCES workflow_version(id) ON DELETE CASCADE,
  node_key text NOT NULL,
  block_type text NOT NULL,
  block_contract_version integer NOT NULL DEFAULT 1,
  configuration jsonb NOT NULL DEFAULT '{}'::jsonb,
  position_x numeric NOT NULL DEFAULT 0,
  position_y numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_workflow_node_key UNIQUE (workflow_version_id, node_key),
  CONSTRAINT uq_workflow_node_id_version UNIQUE (id, workflow_version_id),
  CONSTRAINT chk_workflow_node_key CHECK (node_key <> ''),
  CONSTRAINT chk_workflow_node_contract_version CHECK (block_contract_version > 0),
  CONSTRAINT chk_workflow_node_configuration CHECK (jsonb_typeof(configuration) = 'object')
);

CREATE TABLE IF NOT EXISTS workflow_edge (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_version_id uuid NOT NULL REFERENCES workflow_version(id) ON DELETE CASCADE,
  edge_key text NOT NULL,
  source_node_id uuid NOT NULL,
  source_port text NOT NULL,
  target_node_id uuid NOT NULL,
  target_port text NOT NULL,
  condition jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_workflow_edge_key UNIQUE (workflow_version_id, edge_key),
  CONSTRAINT fk_workflow_edge_source FOREIGN KEY (source_node_id, workflow_version_id)
    REFERENCES workflow_node(id, workflow_version_id) ON DELETE CASCADE,
  CONSTRAINT fk_workflow_edge_target FOREIGN KEY (target_node_id, workflow_version_id)
    REFERENCES workflow_node(id, workflow_version_id) ON DELETE CASCADE,
  CONSTRAINT chk_workflow_edge_key CHECK (edge_key <> ''),
  CONSTRAINT chk_workflow_edge_ports CHECK (source_port <> '' AND target_port <> ''),
  CONSTRAINT chk_workflow_edge_nodes CHECK (source_node_id <> target_node_id),
  CONSTRAINT chk_workflow_edge_condition CHECK (condition IS NULL OR jsonb_typeof(condition) = 'object')
);

CREATE TABLE IF NOT EXISTS workflow_role_binding (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_version_id uuid NOT NULL REFERENCES workflow_version(id) ON DELETE CASCADE,
  workflow_role text NOT NULL,
  identity_group text NOT NULL,
  permissions text[] NOT NULL,
  tenant text NOT NULL,
  business_unit text NOT NULL,
  client_ids text[],
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_workflow_role_binding UNIQUE (workflow_version_id, workflow_role, identity_group),
  CONSTRAINT chk_workflow_role_binding_values CHECK (
    workflow_role <> '' AND identity_group <> '' AND tenant <> '' AND business_unit <> ''
  ),
  CONSTRAINT chk_workflow_role_binding_permissions CHECK (cardinality(permissions) > 0),
  CONSTRAINT chk_workflow_role_binding_scope CHECK (client_ids IS NULL OR cardinality(client_ids) > 0)
);

CREATE INDEX IF NOT EXISTS idx_workflow_version_definition
  ON workflow_version (workflow_definition_id, version_number DESC);
CREATE INDEX IF NOT EXISTS idx_workflow_version_review_lookup
  ON workflow_version_review (workflow_version_id, revision, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_workflow_node_version ON workflow_node (workflow_version_id);
CREATE INDEX IF NOT EXISTS idx_workflow_edge_version ON workflow_edge (workflow_version_id);
CREATE INDEX IF NOT EXISTS idx_workflow_role_binding_version ON workflow_role_binding (workflow_version_id);
CREATE INDEX IF NOT EXISTS idx_workflow_definition_scope
  ON workflow_definition (tenant, business_unit, status);

CREATE OR REPLACE FUNCTION workflow_assign_version_number() RETURNS trigger AS $$
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended(NEW.workflow_definition_id::text, 0));
  SELECT COALESCE(MAX(version_number), 0) + 1
    INTO NEW.version_number
    FROM workflow_version
    WHERE workflow_definition_id = NEW.workflow_definition_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION workflow_guard_version_immutability() RETURNS trigger AS $$
BEGIN
  IF OLD.status = 'published' THEN
    RAISE EXCEPTION 'Published workflow version % is immutable', OLD.id
      USING ERRCODE = '55000';
  END IF;
  IF TG_OP = 'UPDATE' THEN
    NEW.revision := OLD.revision + 1;
    NEW.updated_at := now();
    RETURN NEW;
  END IF;
  RETURN OLD;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION workflow_guard_version_content() RETURNS trigger AS $$
DECLARE
  old_status text;
  new_status text;
BEGIN
  IF TG_OP <> 'INSERT' THEN
    SELECT status INTO old_status FROM workflow_version WHERE id = OLD.workflow_version_id;
  END IF;
  IF TG_OP <> 'DELETE' THEN
    SELECT status INTO new_status FROM workflow_version WHERE id = NEW.workflow_version_id;
  END IF;
  IF old_status = 'published' OR new_status = 'published' THEN
    RAISE EXCEPTION 'Content of a published workflow version is immutable'
      USING ERRCODE = '55000';
  END IF;
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION workflow_guard_review_immutability() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'Workflow review event % is immutable', OLD.id
    USING ERRCODE = '55000';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_workflow_assign_version_number ON workflow_version;
CREATE TRIGGER trg_workflow_assign_version_number
  BEFORE INSERT ON workflow_version
  FOR EACH ROW EXECUTE FUNCTION workflow_assign_version_number();

DROP TRIGGER IF EXISTS trg_workflow_version_immutability ON workflow_version;
CREATE TRIGGER trg_workflow_version_immutability
  BEFORE UPDATE OR DELETE ON workflow_version
  FOR EACH ROW EXECUTE FUNCTION workflow_guard_version_immutability();

DROP TRIGGER IF EXISTS trg_workflow_review_immutability ON workflow_version_review;
CREATE TRIGGER trg_workflow_review_immutability
  BEFORE UPDATE OR DELETE ON workflow_version_review
  FOR EACH ROW EXECUTE FUNCTION workflow_guard_review_immutability();

DROP TRIGGER IF EXISTS trg_workflow_node_immutability ON workflow_node;
CREATE TRIGGER trg_workflow_node_immutability
  BEFORE INSERT OR UPDATE OR DELETE ON workflow_node
  FOR EACH ROW EXECUTE FUNCTION workflow_guard_version_content();

DROP TRIGGER IF EXISTS trg_workflow_edge_immutability ON workflow_edge;
CREATE TRIGGER trg_workflow_edge_immutability
  BEFORE INSERT OR UPDATE OR DELETE ON workflow_edge
  FOR EACH ROW EXECUTE FUNCTION workflow_guard_version_content();

DROP TRIGGER IF EXISTS trg_workflow_role_binding_immutability ON workflow_role_binding;
CREATE TRIGGER trg_workflow_role_binding_immutability
  BEFORE INSERT OR UPDATE OR DELETE ON workflow_role_binding
  FOR EACH ROW EXECUTE FUNCTION workflow_guard_version_content();

-- =========================================================================
-- 10. WORKFLOW STUDIO RUNTIME AND AUDIT
-- =========================================================================

CREATE TABLE IF NOT EXISTS workflow_instance (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_version_id uuid NOT NULL REFERENCES workflow_version(id) ON DELETE RESTRICT,
  tenant text NOT NULL,
  business_unit text NOT NULL,
  client_ids text[],
  status text NOT NULL DEFAULT 'pending',
  idempotency_key text NOT NULL,
  correlation_id text NOT NULL,
  started_by_user_id text NOT NULL,
  input jsonb NOT NULL DEFAULT '{}'::jsonb,
  result jsonb,
  deadline_at timestamptz,
  started_at timestamptz,
  completed_at timestamptz,
  error_code text,
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_workflow_instance_id_version UNIQUE (id, workflow_version_id),
  CONSTRAINT uq_workflow_instance_idempotency UNIQUE (tenant, idempotency_key),
  CONSTRAINT chk_workflow_instance_scope CHECK (
    tenant <> '' AND business_unit <> '' AND (client_ids IS NULL OR cardinality(client_ids) > 0)
  ),
  CONSTRAINT chk_workflow_instance_status CHECK (
    status IN ('pending','running','waiting','completed','cancelled','failed','needs_intervention')
  ),
  CONSTRAINT chk_workflow_instance_input CHECK (jsonb_typeof(input) = 'object'),
  CONSTRAINT chk_workflow_instance_timestamps CHECK (
    (status = 'pending' AND started_at IS NULL AND completed_at IS NULL)
    OR (status IN ('running','waiting','needs_intervention') AND started_at IS NOT NULL AND completed_at IS NULL)
    OR (status IN ('completed','cancelled','failed') AND completed_at IS NOT NULL)
  )
);

CREATE TABLE IF NOT EXISTS workflow_node_instance (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_instance_id uuid NOT NULL,
  workflow_version_id uuid NOT NULL,
  workflow_node_id uuid NOT NULL,
  status text NOT NULL DEFAULT 'ready',
  attempt integer NOT NULL,
  max_attempts integer NOT NULL DEFAULT 3,
  idempotency_key text NOT NULL,
  correlation_id text NOT NULL,
  causation_id text,
  input jsonb NOT NULL DEFAULT '{}'::jsonb,
  output jsonb,
  error_class text,
  error_code text,
  error_message text,
  available_at timestamptz NOT NULL DEFAULT now(),
  deadline_at timestamptz,
  started_at timestamptz,
  completed_at timestamptz,
  lease_owner text,
  lease_expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_workflow_node_instance_id_version UNIQUE (id, workflow_version_id),
  CONSTRAINT uq_workflow_node_instance_context UNIQUE (id, workflow_instance_id, workflow_version_id),
  CONSTRAINT uq_workflow_node_instance_id_instance UNIQUE (id, workflow_instance_id),
  CONSTRAINT uq_workflow_node_attempt UNIQUE (workflow_instance_id, workflow_node_id, attempt),
  CONSTRAINT uq_workflow_node_idempotency UNIQUE (workflow_instance_id, idempotency_key),
  CONSTRAINT fk_workflow_node_instance_instance FOREIGN KEY (workflow_instance_id, workflow_version_id)
    REFERENCES workflow_instance(id, workflow_version_id) ON DELETE CASCADE,
  CONSTRAINT fk_workflow_node_instance_node FOREIGN KEY (workflow_node_id, workflow_version_id)
    REFERENCES workflow_node(id, workflow_version_id) ON DELETE RESTRICT,
  CONSTRAINT chk_workflow_node_instance_status CHECK (
    status IN ('ready','running','waiting','succeeded','skipped','failed','needs_intervention')
  ),
  CONSTRAINT chk_workflow_node_instance_attempt CHECK (attempt > 0 AND max_attempts > 0 AND attempt <= max_attempts),
  CONSTRAINT chk_workflow_node_instance_input CHECK (jsonb_typeof(input) = 'object'),
  CONSTRAINT chk_workflow_node_instance_timestamps CHECK (
    (status = 'ready' AND started_at IS NULL AND completed_at IS NULL)
    OR (status IN ('running','waiting','needs_intervention') AND started_at IS NOT NULL AND completed_at IS NULL)
    OR (status IN ('succeeded','skipped','failed') AND completed_at IS NOT NULL)
  )
);

CREATE TABLE IF NOT EXISTS workflow_task (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_instance_id uuid NOT NULL,
  workflow_version_id uuid NOT NULL,
  workflow_node_instance_id uuid NOT NULL,
  workflow_role_binding_id uuid NOT NULL REFERENCES workflow_role_binding(id) ON DELETE RESTRICT,
  status text NOT NULL DEFAULT 'open',
  title text NOT NULL,
  instructions text NOT NULL DEFAULT '',
  assignee_group text NOT NULL,
  claimed_by_user_id text,
  outcome text,
  form_data jsonb,
  completion_comment text,
  idempotency_key text NOT NULL,
  correlation_id text NOT NULL,
  causation_id text,
  deadline_at timestamptz,
  claimed_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_workflow_task_node_instance UNIQUE (workflow_node_instance_id),
  CONSTRAINT uq_workflow_task_idempotency UNIQUE (workflow_instance_id, idempotency_key),
  CONSTRAINT fk_workflow_task_instance FOREIGN KEY (workflow_instance_id, workflow_version_id)
    REFERENCES workflow_instance(id, workflow_version_id) ON DELETE CASCADE,
  CONSTRAINT fk_workflow_task_node_instance FOREIGN KEY (
    workflow_node_instance_id, workflow_instance_id, workflow_version_id
  ) REFERENCES workflow_node_instance(id, workflow_instance_id, workflow_version_id) ON DELETE CASCADE,
  CONSTRAINT chk_workflow_task_status CHECK (status IN ('open','claimed','completed','cancelled','expired')),
  CONSTRAINT chk_workflow_task_form_data CHECK (form_data IS NULL OR jsonb_typeof(form_data) = 'object'),
  CONSTRAINT chk_workflow_task_timestamps CHECK (
    (status = 'open' AND claimed_by_user_id IS NULL AND claimed_at IS NULL AND completed_at IS NULL)
    OR (status = 'claimed' AND claimed_by_user_id IS NOT NULL AND claimed_at IS NOT NULL AND completed_at IS NULL)
    OR (status = 'completed' AND claimed_by_user_id IS NOT NULL AND claimed_at IS NOT NULL AND completed_at IS NOT NULL AND outcome IS NOT NULL)
    OR (status IN ('cancelled','expired') AND completed_at IS NOT NULL)
  )
);

CREATE TABLE IF NOT EXISTS workflow_variable (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_instance_id uuid NOT NULL REFERENCES workflow_instance(id) ON DELETE CASCADE,
  source_node_instance_id uuid,
  name text NOT NULL,
  data_type text NOT NULL,
  value jsonb NOT NULL,
  classification text NOT NULL DEFAULT 'internal',
  revision bigint NOT NULL DEFAULT 1,
  idempotency_key text NOT NULL,
  correlation_id text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_workflow_variable_name UNIQUE (workflow_instance_id, name),
  CONSTRAINT uq_workflow_variable_idempotency UNIQUE (workflow_instance_id, idempotency_key),
  CONSTRAINT fk_workflow_variable_source FOREIGN KEY (source_node_instance_id, workflow_instance_id)
    REFERENCES workflow_node_instance(id, workflow_instance_id) ON DELETE RESTRICT,
  CONSTRAINT chk_workflow_variable_name CHECK (name <> ''),
  CONSTRAINT chk_workflow_variable_data_type CHECK (
    data_type IN ('string','number','boolean','date','datetime','object','array','reference')
  ),
  CONSTRAINT chk_workflow_variable_classification CHECK (
    classification IN ('public','internal','confidential','restricted')
  ),
  CONSTRAINT chk_workflow_variable_revision CHECK (revision > 0)
);

CREATE TABLE IF NOT EXISTS workflow_data_snapshot (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_instance_id uuid NOT NULL REFERENCES workflow_instance(id) ON DELETE CASCADE,
  workflow_node_instance_id uuid,
  resource_id text NOT NULL,
  source_record_id text NOT NULL,
  selected_fields jsonb NOT NULL,
  concurrency_token text NOT NULL,
  snapshot_version integer NOT NULL DEFAULT 1,
  idempotency_key text NOT NULL,
  correlation_id text NOT NULL,
  causation_id text,
  read_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_workflow_snapshot_id_instance UNIQUE (id, workflow_instance_id),
  CONSTRAINT uq_workflow_snapshot_idempotency UNIQUE (workflow_instance_id, idempotency_key),
  CONSTRAINT fk_workflow_snapshot_node FOREIGN KEY (workflow_node_instance_id, workflow_instance_id)
    REFERENCES workflow_node_instance(id, workflow_instance_id) ON DELETE RESTRICT,
  CONSTRAINT chk_workflow_snapshot_fields CHECK (jsonb_typeof(selected_fields) = 'object'),
  CONSTRAINT chk_workflow_snapshot_version CHECK (snapshot_version > 0)
);

CREATE TABLE IF NOT EXISTS workflow_change_intent (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_instance_id uuid NOT NULL REFERENCES workflow_instance(id) ON DELETE CASCADE,
  workflow_node_instance_id uuid NOT NULL,
  workflow_data_snapshot_id uuid,
  adapter_id text NOT NULL,
  resource_id text NOT NULL,
  operation text NOT NULL,
  status text NOT NULL DEFAULT 'draft',
  payload jsonb NOT NULL,
  preconditions jsonb NOT NULL DEFAULT '{}'::jsonb,
  dry_run_result jsonb,
  apply_result jsonb,
  idempotency_key text NOT NULL,
  correlation_id text NOT NULL,
  causation_id text,
  attempt integer NOT NULL DEFAULT 1,
  max_attempts integer NOT NULL DEFAULT 3,
  next_retry_at timestamptz,
  effective_at timestamptz,
  approved_by_user_id text,
  approved_at timestamptz,
  applied_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_workflow_intent_idempotency UNIQUE (workflow_instance_id, idempotency_key),
  CONSTRAINT fk_workflow_intent_node FOREIGN KEY (workflow_node_instance_id, workflow_instance_id)
    REFERENCES workflow_node_instance(id, workflow_instance_id) ON DELETE RESTRICT,
  CONSTRAINT fk_workflow_intent_snapshot FOREIGN KEY (workflow_data_snapshot_id, workflow_instance_id)
    REFERENCES workflow_data_snapshot(id, workflow_instance_id) ON DELETE RESTRICT,
  CONSTRAINT chk_workflow_intent_operation CHECK (operation IN ('CREATE','UPDATE','RETIRE')),
  CONSTRAINT chk_workflow_intent_status CHECK (
    status IN ('draft','validated','approved','applying','applied','rejected','conflicted','failed')
  ),
  CONSTRAINT chk_workflow_intent_payload CHECK (jsonb_typeof(payload) = 'object'),
  CONSTRAINT chk_workflow_intent_preconditions CHECK (jsonb_typeof(preconditions) = 'object'),
  CONSTRAINT chk_workflow_intent_attempt CHECK (attempt > 0 AND max_attempts > 0 AND attempt <= max_attempts)
);

CREATE TABLE IF NOT EXISTS workflow_event (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_instance_id uuid NOT NULL REFERENCES workflow_instance(id) ON DELETE CASCADE,
  workflow_node_instance_id uuid,
  sequence_number bigint NOT NULL,
  event_type text NOT NULL,
  event_version integer NOT NULL DEFAULT 1,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  actor_type text NOT NULL,
  actor_id text NOT NULL,
  actor_session_id text,
  idempotency_key text NOT NULL,
  correlation_id text NOT NULL,
  causation_id text,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_workflow_event_sequence UNIQUE (workflow_instance_id, sequence_number),
  CONSTRAINT uq_workflow_event_idempotency UNIQUE (workflow_instance_id, idempotency_key),
  CONSTRAINT fk_workflow_event_node FOREIGN KEY (workflow_node_instance_id, workflow_instance_id)
    REFERENCES workflow_node_instance(id, workflow_instance_id) ON DELETE RESTRICT,
  CONSTRAINT chk_workflow_event_type CHECK (event_type <> ''),
  CONSTRAINT chk_workflow_event_version CHECK (event_version > 0),
  CONSTRAINT chk_workflow_event_payload CHECK (jsonb_typeof(payload) = 'object'),
  CONSTRAINT chk_workflow_event_actor_type CHECK (actor_type IN ('user','system'))
);

CREATE TABLE IF NOT EXISTS workflow_outbox (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_instance_id uuid NOT NULL REFERENCES workflow_instance(id) ON DELETE CASCADE,
  workflow_node_instance_id uuid,
  workflow_event_id uuid REFERENCES workflow_event(id) ON DELETE RESTRICT,
  kind text NOT NULL,
  target text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  idempotency_key text NOT NULL,
  correlation_id text NOT NULL,
  causation_id text,
  attempt integer NOT NULL DEFAULT 1,
  max_attempts integer NOT NULL DEFAULT 3,
  available_at timestamptz NOT NULL DEFAULT now(),
  lease_owner text,
  lease_expires_at timestamptz,
  delivered_at timestamptz,
  dead_letter_at timestamptz,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_workflow_outbox_idempotency UNIQUE (workflow_instance_id, idempotency_key),
  CONSTRAINT fk_workflow_outbox_node FOREIGN KEY (workflow_node_instance_id, workflow_instance_id)
    REFERENCES workflow_node_instance(id, workflow_instance_id) ON DELETE RESTRICT,
  CONSTRAINT chk_workflow_outbox_kind CHECK (kind IN ('engine','notification','integration')),
  CONSTRAINT chk_workflow_outbox_status CHECK (status IN ('pending','leased','delivered','dead_letter')),
  CONSTRAINT chk_workflow_outbox_payload CHECK (jsonb_typeof(payload) = 'object'),
  CONSTRAINT chk_workflow_outbox_attempt CHECK (attempt > 0 AND max_attempts > 0 AND attempt <= max_attempts),
  CONSTRAINT chk_workflow_outbox_lease CHECK (
    (status = 'leased' AND lease_owner IS NOT NULL AND lease_expires_at IS NOT NULL AND delivered_at IS NULL AND dead_letter_at IS NULL)
    OR (status = 'pending' AND lease_owner IS NULL AND lease_expires_at IS NULL AND delivered_at IS NULL AND dead_letter_at IS NULL)
    OR (status = 'delivered' AND lease_owner IS NULL AND lease_expires_at IS NULL AND delivered_at IS NOT NULL AND dead_letter_at IS NULL)
    OR (status = 'dead_letter' AND lease_owner IS NULL AND lease_expires_at IS NULL AND dead_letter_at IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_workflow_instance_version_status
  ON workflow_instance (workflow_version_id, status);
CREATE INDEX IF NOT EXISTS idx_workflow_instance_scope_status
  ON workflow_instance (tenant, business_unit, status);
CREATE INDEX IF NOT EXISTS idx_workflow_instance_correlation ON workflow_instance (correlation_id);
CREATE INDEX IF NOT EXISTS idx_change_requests_workflow_instance
  ON change_requests (workflow_instance_id) WHERE workflow_instance_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_workflow_node_instance_ready
  ON workflow_node_instance (status, available_at) WHERE status IN ('ready','waiting');
CREATE INDEX IF NOT EXISTS idx_workflow_node_instance_instance
  ON workflow_node_instance (workflow_instance_id, created_at);
CREATE INDEX IF NOT EXISTS idx_workflow_task_assignee_status
  ON workflow_task (assignee_group, status, deadline_at);
CREATE INDEX IF NOT EXISTS idx_workflow_variable_instance ON workflow_variable (workflow_instance_id);
CREATE INDEX IF NOT EXISTS idx_workflow_snapshot_instance ON workflow_data_snapshot (workflow_instance_id, read_at);
CREATE INDEX IF NOT EXISTS idx_workflow_intent_status_retry
  ON workflow_change_intent (status, next_retry_at);
CREATE INDEX IF NOT EXISTS idx_workflow_event_instance_sequence
  ON workflow_event (workflow_instance_id, sequence_number);
CREATE INDEX IF NOT EXISTS idx_workflow_event_correlation ON workflow_event (correlation_id);
CREATE INDEX IF NOT EXISTS idx_workflow_outbox_ready
  ON workflow_outbox (status, available_at, created_at) WHERE status IN ('pending','leased');
CREATE INDEX IF NOT EXISTS idx_workflow_outbox_event ON workflow_outbox (workflow_event_id);

CREATE OR REPLACE FUNCTION workflow_require_published_version() RETURNS trigger AS $$
DECLARE version_status text;
BEGIN
  SELECT status INTO version_status FROM workflow_version WHERE id = NEW.workflow_version_id;
  IF version_status IS DISTINCT FROM 'published' THEN
    RAISE EXCEPTION 'Workflow instances require a published version'
      USING ERRCODE = '55000';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION workflow_assign_node_attempt() RETURNS trigger AS $$
BEGIN
  PERFORM pg_advisory_xact_lock(
    hashtextextended(NEW.workflow_instance_id::text || ':' || NEW.workflow_node_id::text, 0)
  );
  SELECT COALESCE(MAX(attempt), 0) + 1 INTO NEW.attempt
    FROM workflow_node_instance
    WHERE workflow_instance_id = NEW.workflow_instance_id
      AND workflow_node_id = NEW.workflow_node_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION workflow_validate_task_role_binding() RETURNS trigger AS $$
DECLARE binding_version_id uuid;
BEGIN
  SELECT workflow_version_id INTO binding_version_id
    FROM workflow_role_binding WHERE id = NEW.workflow_role_binding_id;
  IF binding_version_id IS DISTINCT FROM NEW.workflow_version_id THEN
    RAISE EXCEPTION 'Workflow task role binding belongs to another version'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION workflow_assign_event_sequence() RETURNS trigger AS $$
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended(NEW.workflow_instance_id::text, 1));
  SELECT COALESCE(MAX(sequence_number), 0) + 1 INTO NEW.sequence_number
    FROM workflow_event WHERE workflow_instance_id = NEW.workflow_instance_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION workflow_reject_mutation() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION '% is append-only', TG_TABLE_NAME USING ERRCODE = '55000';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_workflow_instance_published_version ON workflow_instance;
CREATE TRIGGER trg_workflow_instance_published_version
  BEFORE INSERT OR UPDATE OF workflow_version_id ON workflow_instance
  FOR EACH ROW EXECUTE FUNCTION workflow_require_published_version();

DROP TRIGGER IF EXISTS trg_workflow_assign_node_attempt ON workflow_node_instance;
CREATE TRIGGER trg_workflow_assign_node_attempt
  BEFORE INSERT ON workflow_node_instance
  FOR EACH ROW EXECUTE FUNCTION workflow_assign_node_attempt();

DROP TRIGGER IF EXISTS trg_workflow_task_role_binding ON workflow_task;
CREATE TRIGGER trg_workflow_task_role_binding
  BEFORE INSERT OR UPDATE OF workflow_role_binding_id, workflow_version_id ON workflow_task
  FOR EACH ROW EXECUTE FUNCTION workflow_validate_task_role_binding();

DROP TRIGGER IF EXISTS trg_workflow_assign_event_sequence ON workflow_event;
CREATE TRIGGER trg_workflow_assign_event_sequence
  BEFORE INSERT ON workflow_event
  FOR EACH ROW EXECUTE FUNCTION workflow_assign_event_sequence();

DROP TRIGGER IF EXISTS trg_workflow_snapshot_append_only ON workflow_data_snapshot;
CREATE TRIGGER trg_workflow_snapshot_append_only
  BEFORE UPDATE OR DELETE ON workflow_data_snapshot
  FOR EACH ROW EXECUTE FUNCTION workflow_reject_mutation();

DROP TRIGGER IF EXISTS trg_workflow_event_append_only ON workflow_event;
CREATE TRIGGER trg_workflow_event_append_only
  BEFORE UPDATE OR DELETE ON workflow_event
  FOR EACH ROW EXECUTE FUNCTION workflow_reject_mutation();

-- =========================================================================
-- 11. SLA STATUS TRIGGER
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
-- 12. PERFORMANCE INDEXES
-- =========================================================================

-- 12a. Foreign key indexes
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
CREATE INDEX IF NOT EXISTS idx_bc_asset_class_id ON benchmark_catalog (asset_class_id);
CREATE INDEX IF NOT EXISTS idx_clients_asset_class_id ON clients (asset_class_id);
CREATE INDEX IF NOT EXISTS idx_clients_regeling_type_id ON clients (regeling_type_id);

-- 12b. Filter/sort indexes
CREATE INDEX IF NOT EXISTS idx_cr_status ON change_requests (status);
CREATE INDEX IF NOT EXISTS idx_cr_created_at ON change_requests (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_clients_status ON clients (status);
CREATE INDEX IF NOT EXISTS idx_bc_active ON benchmark_catalog (active);
CREATE INDEX IF NOT EXISTS idx_p_active ON portfolios (active);
CREATE INDEX IF NOT EXISTS idx_nl_status ON notification_log (status);
CREATE INDEX IF NOT EXISTS idx_nc_is_active ON notification_config (is_active);
CREATE INDEX IF NOT EXISTS idx_ctc_active ON change_type_config (active);
CREATE INDEX IF NOT EXISTS idx_ctc_slug ON change_type_config (slug);
CREATE INDEX IF NOT EXISTS idx_ctc_workflow_version ON change_type_config (workflow_version_id) WHERE active;

-- 12c. Composite indexes
CREATE INDEX IF NOT EXISTS idx_cr_client_created ON change_requests (client_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_cr_status_created ON change_requests (status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_cr_client_status_created ON change_requests (client_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_p_client_active_name ON portfolios (client_id, active, name);

-- 12d. Partial indexes
CREATE INDEX IF NOT EXISTS idx_cr_sla_status_non_terminal
  ON change_requests (sla_status) WHERE status NOT IN ('validated', 'processed');
CREATE INDEX IF NOT EXISTS idx_cr_notification_sent
  ON change_requests (notification_sent) WHERE notification_sent = false;

-- =========================================================================
-- 13. SEED DATA
-- =========================================================================

INSERT INTO wtp_classifications (id, name) VALUES
  ('00000001-0000-4000-a000-000000000001', 'Rendement'),
  ('00000001-0000-4000-a000-000000000002', 'Matching'),
  ('00000001-0000-4000-a000-000000000003', 'Opbouw'),
  ('00000001-0000-4000-a000-000000000004', 'CVP'),
  ('00000001-0000-4000-a000-000000000005', 'Rente'),
  ('00000001-0000-4000-a000-000000000006', 'Reserve')
ON CONFLICT (id) DO NOTHING;

INSERT INTO regeling_types (id, name, description) VALUES
  ('b0000000-0000-4000-a000-000000000001', 'pensioenuitkering', 'Beschikbare premieregeling — uitkeringsfase'),
  ('b0000000-0000-4000-a000-000000000002', 'premieovereenkomst', 'Beschikbare premieregeling — opbouwfase'),
  ('b0000000-0000-4000-a000-000000000003', 'kapitaalovereenkomst', 'Vaste toegezegde kapitaalregeling'),
  ('b0000000-0000-4000-a000-000000000004', 'uitkeringsovereenkomst', 'Vaste toegezegde uitkeringsregeling (eindloon/middelloon)')
ON CONFLICT (id) DO NOTHING;

INSERT INTO stakeholders (id, name) VALUES
  ('c0000000-0000-4000-a000-000000000001', 'Portefeuillebeheerder'),
  ('c0000000-0000-4000-a000-000000000002', 'Risk manager'),
  ('c0000000-0000-4000-a000-000000000003', 'Fiduciair manager'),
  ('c0000000-0000-4000-a000-000000000004', 'Klant'),
  ('c0000000-0000-4000-a000-000000000005', 'Compliance'),
  ('c0000000-0000-4000-a000-000000000006', 'Juridisch'),
  ('c0000000-0000-4000-a000-000000000007', 'Financieel adviseur'),
  ('c0000000-0000-4000-a000-000000000008', 'Beleggingscommissie')
ON CONFLICT (id) DO NOTHING;

-- Benchmark catalog; asset class is maintained in client_config.asset_class.
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
  wtp_classification_id, asset_class_id, sub_asset_class_id) VALUES
  ('c4707067-b98a-4a0f-92c7-5ee510dc70ff', '9f9280fc-9572-49d1-b81c-2a039652bc93', 'Rendementsportefeuille', 'HOR-RP', '9fb65c5a-5ccf-4374-a264-9b03c9ac3bd1',
   '00000001-0000-4000-a000-000000000001', '00000002-0000-4000-a000-000000000001', 's1000000-0000-4000-a000-000000000001'),
  ('c12ca209-4df0-4774-bf96-0e31b5a10ff4', '9f9280fc-9572-49d1-b81c-2a039652bc93', 'Matchingportefeuille', 'HOR-MP', '7c8bd971-b05c-4141-9a27-7ee0d02137a5',
   '00000001-0000-4000-a000-000000000002', '00000002-0000-4000-a000-000000000002', 's1000000-0000-4000-a000-000000000004'),
  ('93de32a3-f238-4504-9fad-ab97cbe1a174', '7b9303c1-3a0d-4398-a5c2-740ea76dfe37', 'Return portefeuille', 'ZEK-RET', 'b9ec8da5-5d7a-4ee0-a23e-9746ded5b43d',
   '00000001-0000-4000-a000-000000000001', '00000002-0000-4000-a000-000000000001', 's1000000-0000-4000-a000-000000000002')
ON CONFLICT (id) DO NOTHING;

-- =========================================================================
-- 14. CLIENT CONFIG SCHEMA (3NF model from clientconfig_schema.sql)
-- =========================================================================
CREATE SCHEMA IF NOT EXISTS client_config;

-- 14a. Independent lookup tables (no foreign keys)
CREATE TABLE IF NOT EXISTS client_config.legal_entity (
  legal_entity_id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  legal_name varchar(100) NOT NULL UNIQUE CHECK (legal_name ~ '^[^\r\n]{1,100}$')
);

CREATE TABLE IF NOT EXISTS client_config.parent_account (
  parent_account_id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  parent_account_code varchar(16) NOT NULL UNIQUE CHECK (parent_account_code ~ '^[A-Z0-9]+(?:_[A-Z0-9]+)*$'),
  msa_parent_account_code varchar(16) CHECK (msa_parent_account_code IS NULL OR msa_parent_account_code ~ '^[A-Z0-9]+(?:_[A-Z0-9]+)*$')
);

CREATE TABLE IF NOT EXISTS client_config.client (
  client_code varchar(3) PRIMARY KEY CHECK (client_code ~ '^[A-Z0-9]{1,3}$'),
  client_name varchar(100) NOT NULL UNIQUE CHECK (client_name ~ '^[^\r\n]{1,100}$')
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

-- 14b. Tables with foreign key dependencies
CREATE TABLE IF NOT EXISTS client_config.portfolio (
  portfolio_id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  portfolio_code varchar(15) NOT NULL UNIQUE CHECK (portfolio_code ~ '^[A-Z0-9]{2,15}$'),
  parent_account_id bigint REFERENCES client_config.parent_account
);

CREATE TABLE IF NOT EXISTS client_config.sub_asset_class (
  sub_asset_class_id smallint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  asset_class_id smallint NOT NULL REFERENCES client_config.asset_class,
  sub_asset_class_code char(3) NOT NULL CHECK (sub_asset_class_code ~ '^[A-Z]{3}$'),
  sub_asset_class_name varchar(100) NOT NULL,
  sort_order integer,
  UNIQUE(asset_class_id, sub_asset_class_code),
  UNIQUE(asset_class_id, sub_asset_class_name)
);

-- 14c. Seed asset class hierarchy data (idempotent)
WITH source(asset_code, asset_name, sub_code, sub_name, sort_order) AS (VALUES
  ('CS', 'CASH', 'CAS', 'CASH', 1),
  ('CS', 'CASH', 'FUN', 'FUNDS', 2),
  ('CS', 'CASH', 'LIQ', 'LIQUIDITIES', 3),
  ('AL', 'ALTERNATIVES', 'PRI', 'PRIVATE EQUITY', 1),
  ('AL', 'ALTERNATIVES', 'HED', 'HEDGE FUNDS', 2),
  ('AL', 'ALTERNATIVES', 'PEI', 'PRIVATE EQUITY IMPACT', 3),
  ('AL', 'ALTERNATIVES', 'HFC', 'HEDGE FUNDS CTA', 4),
  ('AL', 'ALTERNATIVES', 'HFG', 'HEDGE FUNDS GLOBAL MACRO', 5),
  ('AL', 'ALTERNATIVES', 'ILS', 'INFLATION LINKED SECURITIES', 6),
  ('AL', 'ALTERNATIVES', 'GOL', 'GOLD', 7),
  ('AL', 'ALTERNATIVES', 'RIS', 'RISK PARITY', 8),
  ('AL', 'ALTERNATIVES', 'RIP', 'RISK PREMIA', 9),
  ('EQ', 'EQUITIES', 'DEV', 'DEVELOPED MARKETS', 1),
  ('EQ', 'EQUITIES', 'DMF', 'DEVELOPED MARKETS FACTOR', 2),
  ('EQ', 'EQUITIES', 'DMS', 'DEVELOPED MARKETS SMALL CAP', 3),
  ('EQ', 'EQUITIES', 'EME', 'EMERGING MARKETS', 4),
  ('EQ', 'EQUITIES', 'ACX', 'AC WORLD', 5),
  ('EQ', 'EQUITIES', 'EUR', 'EUROPE', 6),
  ('EQ', 'EQUITIES', 'JAP', 'JAPAN', 7),
  ('EQ', 'EQUITIES', 'AEJ', 'ASIA EX-JAPAN', 8),
  ('EQ', 'EQUITIES', 'UNI', 'UNITED STATES', 9),
  ('EQ', 'EQUITIES', 'NOR', 'NORTH AMERICA', 10),
  ('EQ', 'EQUITIES', 'DUU', 'DUURZAAM', 11),
  ('EQ', 'EQUITIES', 'MIL', 'MILIEU & WATER', 12),
  ('EQ', 'EQUITIES', 'BIO', 'BIODIVERSITY', 13),
  ('EQ', 'EQUITIES', 'FUN', 'FUNDS', 14),
  ('EQ', 'EQUITIES', 'EMF', 'EMERGING MARKETS FACTOR', 15),
  ('EQ', 'EQUITIES', 'AWF', 'AC WORLD FACTOR', 16),
  ('FI', 'FIXED_INCOME', 'ABS', 'ASSET BACKED SECURITIES', 1),
  ('FI', 'FIXED_INCOME', 'BAN', 'BANKLOANS', 2),
  ('FI', 'FIXED_INCOME', 'BIO', 'BIODIVERSITY', 3),
  ('FI', 'FIXED_INCOME', 'CON', 'CONVERTABLES', 4),
  ('FI', 'FIXED_INCOME', 'CCL', 'CLO (COLLATERALIZED LOAN OBLIGATION)', 5),
  ('FI', 'FIXED_INCOME', 'COR', 'CORPORATES EUROPE', 6),
  ('FI', 'FIXED_INCOME', 'CRE', 'CREDITS EUROPE', 7),
  ('FI', 'FIXED_INCOME', 'CRG', 'CREDITS GLOBAL', 8),
  ('FI', 'FIXED_INCOME', 'CRU', 'CREDITS USA', 9),
  ('FI', 'FIXED_INCOME', 'DHM', 'DEBT HY MICRO FINANCIERING', 10),
  ('FI', 'FIXED_INCOME', 'DIE', 'DEBT IG ECA LOANS', 11),
  ('FI', 'FIXED_INCOME', 'DIW', 'DEBT IG WSW LOANS', 12),
  ('FI', 'FIXED_INCOME', 'DUU', 'DUURZAAM', 13),
  ('FI', 'FIXED_INCOME', 'EMB', 'EMERGING MARKETS BLEND', 14),
  ('FI', 'FIXED_INCOME', 'EMH', 'EMERGING MARKETS HC', 15),
  ('FI', 'FIXED_INCOME', 'EML', 'EMERGING MARKETS LC', 16),
  ('FI', 'FIXED_INCOME', 'FUN', 'FUNDS', 17),
  ('FI', 'FIXED_INCOME', 'GRE', 'GREENBONDS', 18),
  ('FI', 'FIXED_INCOME', 'HYE', 'HIGH YIELD EUROPE', 19),
  ('FI', 'FIXED_INCOME', 'HYG', 'HIGH YIELD GLOBAL', 20),
  ('FI', 'FIXED_INCOME', 'HYU', 'HIGH YIELD USA', 21),
  ('FI', 'FIXED_INCOME', 'ILB', 'INFLATION LINKED BONDS EUROPE', 22),
  ('FI', 'FIXED_INCOME', 'INL', 'INFLATION LINKED BONDS GLOBAL', 23),
  ('FI', 'FIXED_INCOME', 'LDI', 'LDI', 24),
  ('FI', 'FIXED_INCOME', 'LIM', 'LIQUID INVESTMENTS (MONEY MARKET)', 25),
  ('FI', 'FIXED_INCOME', 'LIQ', 'LIQUIDITIES', 26),
  ('FI', 'FIXED_INCOME', 'MOR', 'MORTGAGES', 27),
  ('FI', 'FIXED_INCOME', 'OVE', 'OVERLAYFUNDS', 28),
  ('FI', 'FIXED_INCOME', 'PRI', 'PRIVATE LOANS', 29),
  ('FI', 'FIXED_INCOME', 'SEC', 'SECURITIZED', 30),
  ('FI', 'FIXED_INCOME', 'SOC', 'SOCIAL', 31),
  ('FI', 'FIXED_INCOME', 'SOV', 'SOVEREIGN EUROPE', 32),
  ('FI', 'FIXED_INCOME', 'SOG', 'SOVEREIGN GLOBAL', 33),
  ('FI', 'FIXED_INCOME', 'COG', 'CORPORATES GLOBAL', 34),
  ('FI', 'FIXED_INCOME', 'COU', 'CORPORATES USA', 35),
  ('FI', 'FIXED_INCOME', 'CBE', 'COVERED BONDS EUROPE', 36),
  ('FI', 'FIXED_INCOME', 'CBG', 'COVERED BONDS GLOBAL', 37),
  ('FI', 'FIXED_INCOME', 'CBU', 'COVERED BONDS USA', 38),
  ('FI', 'FIXED_INCOME', 'DHD', 'DEBT HY DIRECT LOANS', 39),
  ('FI', 'FIXED_INCOME', 'DHI', 'DEBT HY INFRASTRUCTURE', 40),
  ('FI', 'FIXED_INCOME', 'DIO', 'DEBT IG OVERIG', 41),
  ('FI', 'FIXED_INCOME', 'DIP', 'DEBT IG PRIVATE PLACEMENTS', 42),
  ('FI', 'FIXED_INCOME', 'SSB', 'SOVEREIGN SHORT BONDS', 43),
  ('FI', 'FIXED_INCOME', 'SOU', 'SOVEREIGN USA', 44),
  ('FI', 'FIXED_INCOME', 'SSE', 'SSA EUROPE (SOVEREIGN, SUPRANATIONAL, AGENCY)', 45),
  ('FI', 'FIXED_INCOME', 'SSG', 'SSA GLOBAL  (SOVEREIGN, SUPRANATIONAL, AGENCY)', 46),
  ('FI', 'FIXED_INCOME', 'SGB', 'SSA GREEN BONDS EUR  (SOVEREIGN, SUPRANATIONAL, AGENCY)', 47),
  ('FI', 'FIXED_INCOME', 'SSU', 'SSA USA', 48),
  ('RA', 'REAL_ASSETS', 'AGR', 'AGRICULTURE', 1),
  ('RA', 'REAL_ASSETS', 'COM', 'COMMODITIES', 2),
  ('RA', 'REAL_ASSETS', 'INF', 'INFRASTRUCTURE', 3),
  ('RA', 'REAL_ASSETS', 'REA', 'REALESTATE LISTED', 4),
  ('RA', 'REAL_ASSETS', 'RED', 'REALESTATE DIRECT', 5),
  ('RA', 'REAL_ASSETS', 'RNL', 'REALESTATE NON-LISTED NETHERLANDS', 6),
  ('RA', 'REAL_ASSETS', 'REN', 'REALESTATE NON-LISTED INTERNATIONAL', 7),
  ('RA', 'REAL_ASSETS', 'RNA', 'REALESTATE NON-LISTED EUROPE', 8),
  ('RA', 'REAL_ASSETS', 'RNB', 'REALESTATE NON-LISTED ASIA PACIFIC', 9),
  ('RA', 'REAL_ASSETS', 'RNC', 'REALESTATE NON-LISTED NORTH AMERICA', 10),
  ('RA', 'REAL_ASSETS', 'FOR', 'FORESTRY', 11),
  ('MA', 'MULTI_ASSETS', 'DEF', 'DEFENSIVE', 1),
  ('MA', 'MULTI_ASSETS', 'VER', 'VERY DEFENSIVE', 2),
  ('MA', 'MULTI_ASSETS', 'NEU', 'NEUTRAL', 3),
  ('MA', 'MULTI_ASSETS', 'OFF', 'OFFENSIVE', 4),
  ('MA', 'MULTI_ASSETS', 'VEO', 'VERY OFFENSIVE', 5),
  ('MA', 'MULTI_ASSETS', 'MIX', 'MIX', 6),
  ('OV', 'OVERLAY', 'INT', 'INTEREST', 1),
  ('OV', 'OVERLAY', 'CUR', 'CURRENCY', 2),
  ('OV', 'OVERLAY', 'INF', 'INFLATION', 3),
  ('OV', 'OVERLAY', 'EQU', 'EQUITY', 4),
  ('OV', 'OVERLAY', 'FUN', 'FUNDS', 5),
  ('IM', 'IMPACT', 'IMP', 'IMPACT', 1),
  ('IM', 'IMPACT', 'EQU', 'EQUITIES', 2),
  ('IM', 'IMPACT', 'FID', 'FIXED INCOME DEBT', 3),
  ('IM', 'IMPACT', 'PRI', 'PRIVATE EQUITY', 4),
  ('IM', 'IMPACT', 'REA', 'REALESTATE', 5),
  ('IM', 'IMPACT', 'AGR', 'AGRICULTURE', 6),
  ('IM', 'IMPACT', 'INF', 'INFRASTRUCTURE', 7),
  ('IM', 'IMPACT', 'CLI', 'CLIMATE', 8),
  ('IM', 'IMPACT', 'FOR', 'FORESTRY', 9),
  ('OP', 'OPBOUW', NULL, NULL, NULL),
  ('RD', 'RENDEMENT', NULL, NULL, NULL),
  ('RT', 'RENTE', NULL, NULL, NULL),
  ('IF', 'INFLATION', NULL, NULL, NULL),
  ('MT', 'MATCHING', NULL, NULL, NULL),
  ('CL', 'COLLATERAL', NULL, NULL, NULL),
  ('RV', 'RESERVE', NULL, NULL, NULL)
),
ins_asset AS (
  INSERT INTO client_config.asset_class (asset_class_code, asset_class_name)
  SELECT DISTINCT asset_code, asset_name FROM source
  ON CONFLICT (asset_class_code) DO UPDATE SET asset_class_name = EXCLUDED.asset_class_name
  RETURNING 1
)
INSERT INTO client_config.sub_asset_class (asset_class_id, sub_asset_class_code, sub_asset_class_name, sort_order)
SELECT a.asset_class_id, s.sub_code, s.sub_name, s.sort_order
FROM source s
JOIN client_config.asset_class a ON a.asset_class_code = s.asset_code
WHERE s.sub_code IS NOT NULL
ON CONFLICT (asset_class_id, sub_asset_class_code) DO UPDATE SET
  sub_asset_class_name = EXCLUDED.sub_asset_class_name,
  sort_order = EXCLUDED.sort_order;

DROP TABLE IF EXISTS client_config.account CASCADE;
DROP TABLE IF EXISTS client_config.sub_strategy CASCADE;
DROP TABLE IF EXISTS client_config.model CASCADE;
DROP TABLE IF EXISTS client_config.classification CASCADE;
DROP TABLE IF EXISTS client_config.strategy CASCADE;
DROP FUNCTION IF EXISTS client_config.validate_account_selection() CASCADE;

-- 14d. Admin audit log (out-of-band audit trail for admin bypass mutations on
-- client_config.portfolio / parent_account). The governed change-request flow
-- is audited via audit_log + status_history + the staged
-- change_portfolio_metadata_request rows (apply lineage, spec §6.6); admin
-- direct CRUD has no change request, so every mutation is recorded here
-- instead (lifecycle spec §9.2: "the admin action must be recorded
-- out-of-band"). Written by the admin helper functions in
-- lib/client-config-db.ts.
CREATE TABLE IF NOT EXISTS client_config.admin_audit_log (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  action text NOT NULL,                -- create_portfolio | retire_portfolio | hard_delete_portfolio | create_parent_account | update_parent_account | retire_parent_account | hard_delete_parent_account
  dimension text NOT NULL,             -- 'portfolio' | 'parent_account'
  code text NOT NULL,                  -- the affected code (portfolio_code / parent_account_code)
  actor text NOT NULL DEFAULT 'admin', -- who performed the mutation
  details jsonb,                       -- extra context (parent_account_id, msa code, before/after for updates)
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_admin_audit_log_dim_code
  ON client_config.admin_audit_log (dimension, code);
CREATE INDEX IF NOT EXISTS idx_admin_audit_log_created
  ON client_config.admin_audit_log (created_at);

CREATE OR REPLACE VIEW client_config.service_catalog_item AS
  SELECT
    'asset_class'::text AS service_type,
    ac.asset_class_code::text AS service_code,
    ac.asset_class_name::text AS service_name,
    NULL::text AS parent_service_type,
    NULL::text AS parent_service_code,
    COUNT(DISTINCT pc.primary_account_id)::int AS portfolio_configuration_count
  FROM client_config.asset_class ac
  LEFT JOIN client_config.portfolio_configuration pc
    ON pc.asset_class_code = ac.asset_class_code
    AND pc.active_ind = true
  GROUP BY ac.asset_class_code, ac.asset_class_name
UNION ALL
  SELECT
    'sub_asset_class'::text AS service_type,
    sac.sub_asset_class_code::text AS service_code,
    sac.sub_asset_class_name::text AS service_name,
    'asset_class'::text AS parent_service_type,
    ac.asset_class_code::text AS parent_service_code,
    COUNT(DISTINCT pc.primary_account_id)::int AS portfolio_configuration_count
  FROM client_config.sub_asset_class sac
  JOIN client_config.asset_class ac ON ac.asset_class_id = sac.asset_class_id
  LEFT JOIN client_config.portfolio_configuration pc
    ON pc.asset_class_code = ac.asset_class_code
    AND pc.sub_asset_class_code = sac.sub_asset_class_code
    AND pc.active_ind = true
  GROUP BY sac.sub_asset_class_code, sac.sub_asset_class_name, ac.asset_class_code
UNION ALL
  SELECT
    'benchmark'::text AS service_type,
    b.benchmark_code::text AS service_code,
    COALESCE(b.benchmark_name, b.benchmark_code)::text AS service_name,
    NULL::text AS parent_service_type,
    NULL::text AS parent_service_code,
    COUNT(DISTINCT pc.primary_account_id)::int AS portfolio_configuration_count
  FROM client_config.benchmark b
  LEFT JOIN client_config.portfolio_configuration pc
    ON pc.benchmark_code = b.benchmark_code
    AND pc.active_ind = true
  GROUP BY b.benchmark_code, b.benchmark_name;

CREATE OR REPLACE VIEW client_config.client_service_configuration AS
  SELECT
    pc.primary_account_id,
    pc.client_code,
    c.client_name,
    pc.portfolio_code,
    pc.asset_class_code,
    ac.asset_class_name,
    pc.sub_asset_class_code,
    sac.sub_asset_class_name,
    pc.benchmark_code,
    b.benchmark_name,
    pc.effective_from,
    pc.effective_until,
    pc.change_request_id
  FROM client_config.portfolio_configuration pc
  JOIN client_config.client c ON c.client_code = pc.client_code
  JOIN client_config.asset_class ac ON ac.asset_class_code = pc.asset_class_code
  JOIN client_config.sub_asset_class sac
    ON sac.asset_class_id = ac.asset_class_id
    AND sac.sub_asset_class_code = pc.sub_asset_class_code
  JOIN client_config.benchmark b ON b.benchmark_code = pc.benchmark_code
  WHERE pc.active_ind = true;
