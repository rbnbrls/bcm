CREATE TABLE clients (
  id uuid PRIMARY KEY,
  name text NOT NULL UNIQUE,
  external_reference text NOT NULL UNIQUE,
  status text NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE benchmark_catalog (
  id uuid PRIMARY KEY,
  code text NOT NULL UNIQUE,
  name text NOT NULL,
  asset_class text NOT NULL,
  currency text NOT NULL,
  cost numeric(10,2) NOT NULL DEFAULT 1000.00,
  provider text NOT NULL DEFAULT 'rimes',
  active boolean NOT NULL DEFAULT true
);
CREATE TABLE portfolios (
  id uuid PRIMARY KEY,
  client_id uuid NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  name text NOT NULL,
  external_reference text NOT NULL,
  current_benchmark_id uuid NOT NULL REFERENCES benchmark_catalog(id),
  currency text NOT NULL DEFAULT 'EUR',
  active boolean NOT NULL DEFAULT true,
  UNIQUE (client_id, external_reference)
);
CREATE TABLE change_requests (
  id uuid PRIMARY KEY,
  reference text NOT NULL UNIQUE,
  change_type text NOT NULL,
  client_id uuid NOT NULL REFERENCES clients(id),
  requested_by text NOT NULL,
  rationale text NOT NULL,
  effective_date date NOT NULL,
  status text NOT NULL DEFAULT 'draft',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE change_request_items (
  id uuid PRIMARY KEY,
  change_request_id uuid NOT NULL REFERENCES change_requests(id) ON DELETE CASCADE,
  portfolio_id uuid NOT NULL REFERENCES portfolios(id),
  previous_benchmark_id uuid NOT NULL REFERENCES benchmark_catalog(id),
  requested_benchmark_id uuid NOT NULL REFERENCES benchmark_catalog(id),
  UNIQUE(change_request_id, portfolio_id)
);

CREATE TABLE new_benchmark_requests (
  id uuid PRIMARY KEY,
  change_request_id uuid NOT NULL REFERENCES change_requests(id) ON DELETE CASCADE,
  short_name text NOT NULL,
  long_name text NOT NULL,
  asset_class text NOT NULL,
  currency text NOT NULL DEFAULT 'EUR',
  estimated_cost numeric(10,2) NOT NULL DEFAULT 5000.00,
  estimated_lead_weeks integer NOT NULL DEFAULT 4
);

INSERT INTO benchmark_catalog (id, code, name, asset_class, currency, cost, provider) VALUES
  ('9fb65c5a-5ccf-4374-a264-9b03c9ac3bd1', 'MSCI-WORLD-NR', 'MSCI World Net Return', 'Aandelen', 'EUR', 1000.00, 'MSCI'),
  ('b9ec8da5-5d7a-4ee0-a23e-9746ded5b43d', 'MSCI-ACWI-NR', 'MSCI ACWI Net Return', 'Aandelen', 'EUR', 1200.00, 'MSCI'),
  ('7c8bd971-b05c-4141-9a27-7ee0d02137a5', 'BLOOMBERG-EU-AGG', 'Bloomberg Euro Aggregate', 'Obligaties', 'EUR', 1000.00, 'Bloomberg'),
  ('9644a84d-59d6-40fa-aee9-062fbc1ef9fc', 'ICE-BOFA-EU-CORP', 'ICE BofA Euro Corporate', 'Obligaties', 'EUR', 1000.00, 'ICE BofA'),
  ('a1b2c3d4-e5f6-7890-abcd-ef0123456780', 'CUSTOM-ESG-NL', 'Duurzame NL Benchmark', 'Aandelen', 'EUR', 1500.00, 'rimes'),
  ('a1b2c3d4-e5f6-7890-abcd-ef0123456781', 'RIMES-PRIVATE-EQ', 'Rimes Private Equity Index', 'Alternatieven', 'EUR', 2000.00, 'rimes'),
  ('a1b2c3d4-e5f6-7890-abcd-ef0123456782', 'EURO-GOVT-1-3Y', 'Euro Government 1-3 Year', 'Obligaties', 'EUR', 800.00, 'Bloomberg'),
  ('a1b2c3d4-e5f6-7890-abcd-ef0123456783', 'GLOBAL-REIT-NR', 'Global REIT Net Return', 'Vastgoed', 'EUR', 1500.00, 'MSCI');
INSERT INTO clients (id, name, external_reference) VALUES
  ('9f9280fc-9572-49d1-b81c-2a039652bc93', 'Pensioenfonds Horizon', 'PF-HOR-001'),
  ('7b9303c1-3a0d-4398-a5c2-740ea76dfe37', 'Stichting Pensioen Zeker', 'PF-ZEK-002');
INSERT INTO portfolios (id, client_id, name, external_reference, current_benchmark_id) VALUES
  ('c4707067-b98a-4a0f-92c7-5ee510dc70ff', '9f9280fc-9572-49d1-b81c-2a039652bc93', 'Rendementsportefeuille', 'HOR-RP', '9fb65c5a-5ccf-4374-a264-9b03c9ac3bd1'),
  ('c12ca209-4df0-4774-bf96-0e31b5a10ff4', '9f9280fc-9572-49d1-b81c-2a039652bc93', 'Matchingportefeuille', 'HOR-MP', '7c8bd971-b05c-4141-9a27-7ee0d02137a5'),
  ('93de32a3-f238-4504-9fad-ab97cbe1a174', '7b9303c1-3a0d-4398-a5c2-740ea76dfe37', 'Return portefeuille', 'ZEK-RET', 'b9ec8da5-5d7a-4ee0-a23e-9746ded5b43d');
