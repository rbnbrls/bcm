CREATE SCHEMA IF NOT EXISTS client_config;
SET search_path TO client_config, public;
CREATE TABLE legal_entity (legal_entity_id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, legal_name varchar(100) NOT NULL UNIQUE CHECK (legal_name ~ '^[^\r\n]{1,100}$'));
CREATE TABLE parent_account (parent_account_id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, parent_account_code varchar(16) NOT NULL UNIQUE CHECK(parent_account_code ~ '^[A-Z0-9]+(?:_[A-Z0-9]+)*$'), msa_parent_account_code varchar(16) CHECK(msa_parent_account_code IS NULL OR msa_parent_account_code ~ '^[A-Z0-9]+(?:_[A-Z0-9]+)*$'), active_ind boolean NOT NULL DEFAULT true);
CREATE TABLE client (client_code varchar(3) PRIMARY KEY CHECK(client_code ~ '^[A-Z0-9]{1,3}$'), client_name varchar(100) NOT NULL UNIQUE CHECK(client_name ~ '^[^\r\n]{1,100}$'));
CREATE TABLE portfolio (portfolio_id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, portfolio_code varchar(15) NOT NULL UNIQUE CHECK(portfolio_code ~ '^[A-Z0-9]{2,15}$'), parent_account_id bigint REFERENCES parent_account, active_ind boolean NOT NULL DEFAULT true);
CREATE TABLE asset_class (asset_class_id smallint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, asset_class_code char(2) NOT NULL UNIQUE CHECK(asset_class_code ~ '^[A-Z]{2}$'), asset_class_name varchar(30) NOT NULL UNIQUE);
CREATE TABLE sub_asset_class (sub_asset_class_id smallint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, asset_class_id smallint NOT NULL REFERENCES asset_class, sub_asset_class_code char(3) NOT NULL CHECK(sub_asset_class_code ~ '^[A-Z]{3}$'), sub_asset_class_name varchar(100) NOT NULL, sort_order integer, UNIQUE(asset_class_id,sub_asset_class_code), UNIQUE(asset_class_id,sub_asset_class_name));
CREATE TABLE manager (manager_id smallint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, manager_code char(3) NOT NULL UNIQUE CHECK(manager_code ~ '^[A-Z0-9]{3}$'), manager_name varchar(50) NOT NULL UNIQUE);
CREATE TABLE benchmark (benchmark_id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, benchmark_code varchar(60) NOT NULL UNIQUE, benchmark_name varchar(100), rimes_code varchar(40));

-- Alleen de door de aangeleverde hiërarchie toegestane opties worden geladen.
WITH source(asset_code,asset_name,sub_code,sub_name,sort_order) AS (VALUES
('CS','CASH','CAS','CASH',1),
('CS','CASH','FUN','FUNDS',2),
('CS','CASH','LIQ','LIQUIDITIES',3),
('AL','ALTERNATIVES','PRI','PRIVATE EQUITY',1),
('AL','ALTERNATIVES','HED','HEDGE FUNDS',2),
('AL','ALTERNATIVES','PEI','PRIVATE EQUITY IMPACT',3),
('AL','ALTERNATIVES','HFC','HEDGE FUNDS CTA',4),
('AL','ALTERNATIVES','HFG','HEDGE FUNDS GLOBAL MACRO',5),
('AL','ALTERNATIVES','ILS','INFLATION LINKED SECURITIES',6),
('AL','ALTERNATIVES','GOL','GOLD',7),
('AL','ALTERNATIVES','RIS','RISK PARITY',8),
('AL','ALTERNATIVES','RIP','RISK PREMIA',9),
('EQ','EQUITIES','DEV','DEVELOPED MARKETS',1),
('EQ','EQUITIES','DMF','DEVELOPED MARKETS FACTOR',2),
('EQ','EQUITIES','DMS','DEVELOPED MARKETS SMALL CAP',3),
('EQ','EQUITIES','EME','EMERGING MARKETS',4),
('EQ','EQUITIES','ACX','AC WORLD',5),
('EQ','EQUITIES','EUR','EUROPE',6),
('EQ','EQUITIES','JAP','JAPAN',7),
('EQ','EQUITIES','AEJ','ASIA EX-JAPAN',8),
('EQ','EQUITIES','UNI','UNITED STATES',9),
('EQ','EQUITIES','NOR','NORTH AMERICA',10),
('EQ','EQUITIES','DUU','DUURZAAM',11),
('EQ','EQUITIES','MIL','MILIEU & WATER',12),
('EQ','EQUITIES','BIO','BIODIVERSITY',13),
('EQ','EQUITIES','FUN','FUNDS',14),
('EQ','EQUITIES','EMF','EMERGING MARKETS FACTOR',15),
('EQ','EQUITIES','AWF','AC WORLD FACTOR',16),
('FI','FIXED_INCOME','ABS','ASSET BACKED SECURITIES',1),
('FI','FIXED_INCOME','BAN','BANKLOANS',2),
('FI','FIXED_INCOME','BIO','BIODIVERSITY',3),
('FI','FIXED_INCOME','CON','CONVERTABLES',4),
('FI','FIXED_INCOME','CCL','CLO (COLLATERALIZED LOAN OBLIGATION)',5),
('FI','FIXED_INCOME','COR','CORPORATES EUROPE',6),
('FI','FIXED_INCOME','CRE','CREDITS EUROPE',7),
('FI','FIXED_INCOME','CRG','CREDITS GLOBAL',8),
('FI','FIXED_INCOME','CRU','CREDITS USA',9),
('FI','FIXED_INCOME','DHM','DEBT HY MICRO FINANCIERING',10),
('FI','FIXED_INCOME','DIE','DEBT IG ECA LOANS',11),
('FI','FIXED_INCOME','DIW','DEBT IG WSW LOANS',12),
('FI','FIXED_INCOME','DUU','DUURZAAM',13),
('FI','FIXED_INCOME','EMB','EMERGING MARKETS BLEND',14),
('FI','FIXED_INCOME','EMH','EMERGING MARKETS HC',15),
('FI','FIXED_INCOME','EML','EMERGING MARKETS LC',16),
('FI','FIXED_INCOME','FUN','FUNDS',17),
('FI','FIXED_INCOME','GRE','GREENBONDS',18),
('FI','FIXED_INCOME','HYE','HIGH YIELD EUROPE',19),
('FI','FIXED_INCOME','HYG','HIGH YIELD GLOBAL',20),
('FI','FIXED_INCOME','HYU','HIGH YIELD USA',21),
('FI','FIXED_INCOME','ILB','INFLATION LINKED BONDS EUROPE',22),
('FI','FIXED_INCOME','INL','INFLATION LINKED BONDS GLOBAL',23),
('FI','FIXED_INCOME','LDI','LDI',24),
('FI','FIXED_INCOME','LIM','LIQUID INVESTMENTS (MONEY MARKET)',25),
('FI','FIXED_INCOME','LIQ','LIQUIDITIES',26),
('FI','FIXED_INCOME','MOR','MORTGAGES',27),
('FI','FIXED_INCOME','OVE','OVERLAYFUNDS',28),
('FI','FIXED_INCOME','PRI','PRIVATE LOANS',29),
('FI','FIXED_INCOME','SEC','SECURITIZED',30),
('FI','FIXED_INCOME','SOC','SOCIAL',31),
('FI','FIXED_INCOME','SOV','SOVEREIGN EUROPE',32),
('FI','FIXED_INCOME','SOG','SOVEREIGN GLOBAL',33),
('FI','FIXED_INCOME','COG','CORPORATES GLOBAL',34),
('FI','FIXED_INCOME','COU','CORPORATES USA',35),
('FI','FIXED_INCOME','CBE','COVERED BONDS EUROPE',36),
('FI','FIXED_INCOME','CBG','COVERED BONDS GLOBAL',37),
('FI','FIXED_INCOME','CBU','COVERED BONDS USA',38),
('FI','FIXED_INCOME','DHD','DEBT HY DIRECT LOANS',39),
('FI','FIXED_INCOME','DHI','DEBT HY INFRASTRUCTURE',40),
('FI','FIXED_INCOME','DIO','DEBT IG OVERIG',41),
('FI','FIXED_INCOME','DIP','DEBT IG PRIVATE PLACEMENTS',42),
('FI','FIXED_INCOME','SSB','SOVEREIGN SHORT BONDS',43),
('FI','FIXED_INCOME','SOU','SOVEREIGN USA',44),
('FI','FIXED_INCOME','SSE','SSA EUROPE (SOVEREIGN, SUPRANATIONAL, AGENCY)',45),
('FI','FIXED_INCOME','SSG','SSA GLOBAL  (SOVEREIGN, SUPRANATIONAL, AGENCY)',46),
('FI','FIXED_INCOME','SGB','SSA GREEN BONDS EUR  (SOVEREIGN, SUPRANATIONAL, AGENCY)',47),
('FI','FIXED_INCOME','SSU','SSA USA',48),
('RA','REAL_ASSETS','AGR','AGRICULTURE',1),
('RA','REAL_ASSETS','COM','COMMODITIES',2),
('RA','REAL_ASSETS','INF','INFRASTRUCTURE',3),
('RA','REAL_ASSETS','REA','REALESTATE LISTED',4),
('RA','REAL_ASSETS','RED','REALESTATE DIRECT',5),
('RA','REAL_ASSETS','RNL','REALESTATE NON-LISTED NETHERLANDS',6),
('RA','REAL_ASSETS','REN','REALESTATE NON-LISTED INTERNATIONAL',7),
('RA','REAL_ASSETS','RNA','REALESTATE NON-LISTED EUROPE',8),
('RA','REAL_ASSETS','RNB','REALESTATE NON-LISTED ASIA PACIFIC',9),
('RA','REAL_ASSETS','RNC','REALESTATE NON-LISTED NORTH AMERICA',10),
('RA','REAL_ASSETS','FOR','FORESTRY',11),
('MA','MULTI_ASSETS','DEF','DEFENSIVE',1),
('MA','MULTI_ASSETS','VER','VERY DEFENSIVE',2),
('MA','MULTI_ASSETS','NEU','NEUTRAL',3),
('MA','MULTI_ASSETS','OFF','OFFENSIVE',4),
('MA','MULTI_ASSETS','VEO','VERY OFFENSIVE',5),
('MA','MULTI_ASSETS','MIX','MIX',6),
('OV','OVERLAY','INT','INTEREST',1),
('OV','OVERLAY','CUR','CURRENCY',2),
('OV','OVERLAY','INF','INFLATION',3),
('OV','OVERLAY','EQU','EQUITY',4),
('OV','OVERLAY','FUN','FUNDS',5),
('IM','IMPACT','IMP','IMPACT',1),
('IM','IMPACT','EQU','EQUITIES',2),
('IM','IMPACT','FID','FIXED INCOME DEBT',3),
('IM','IMPACT','PRI','PRIVATE EQUITY',4),
('IM','IMPACT','REA','REALESTATE',5),
('IM','IMPACT','AGR','AGRICULTURE',6),
('IM','IMPACT','INF','INFRASTRUCTURE',7),
('IM','IMPACT','CLI','CLIMATE',8),
('IM','IMPACT','FOR','FORESTRY',9),
('OP','OPBOUW',NULL,NULL,NULL),
('RD','RENDEMENT',NULL,NULL,NULL),
('RT','RENTE',NULL,NULL,NULL),
('IF','INFLATION',NULL,NULL,NULL),
('MT','MATCHING',NULL,NULL,NULL),
('CL','COLLATERAL',NULL,NULL,NULL),
('RV','RESERVE',NULL,NULL,NULL)
), ins_asset AS (
 INSERT INTO asset_class(asset_class_code,asset_class_name) SELECT DISTINCT asset_code,asset_name FROM source ON CONFLICT (asset_class_code) DO UPDATE SET asset_class_name=EXCLUDED.asset_class_name RETURNING 1
)
INSERT INTO sub_asset_class(asset_class_id,sub_asset_class_code,sub_asset_class_name,sort_order)
SELECT a.asset_class_id,s.sub_code,s.sub_name,s.sort_order FROM source s JOIN asset_class a ON a.asset_class_code=s.asset_code WHERE s.sub_code IS NOT NULL ON CONFLICT (asset_class_id,sub_asset_class_code) DO UPDATE SET sub_asset_class_name=EXCLUDED.sub_asset_class_name,sort_order=EXCLUDED.sort_order;

-- Client Configuration 3NF extension (client_config schema)
--
-- IMPORTANT: This schema creates the live configuration table
-- (portfolio_configuration) and the staging table
-- (change_portfolio_configuration). The live table has a
-- change-process enforcement trigger defined in
-- db/enforce_change_process.sql — apply that script separately
-- to activate enforcement.
CREATE TABLE client_config.npc_classification (
  npc_classification_id smallint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  classification_name varchar(80) NOT NULL UNIQUE CHECK (classification_name ~ '^[^\r\n]{1,80}$')
);

CREATE TABLE client_config.portfolio_configuration (
  primary_account_id varchar(13) PRIMARY KEY CHECK (primary_account_id ~ '^[A-Z0-9]{1,3}[*][A-Z]{2}[A-Z]{3}[*][A-Z0-9]{3}$'),
  client_code varchar(3) NOT NULL REFERENCES client_config.client(client_code),
  portfolio_code varchar(15) NOT NULL REFERENCES client_config.portfolio(portfolio_code),
  asset_class_code char(2) NOT NULL REFERENCES client_config.asset_class(asset_class_code),
  sub_asset_class_code char(3) NOT NULL CHECK (sub_asset_class_code ~ '^[A-Z]{3}$'),
  manager_code char(3) NOT NULL REFERENCES client_config.manager(manager_code),
  benchmark_code varchar(60) NOT NULL CHECK (benchmark_code <> ''),
  npc_classification_id smallint NOT NULL REFERENCES client_config.npc_classification(npc_classification_id),
  long_name varchar(255) NOT NULL CHECK (long_name ~ '^[^\r\n]{1,255}$'),
  short_name varchar(100) NOT NULL CHECK (short_name ~ '^[^\r\n]{1,100}$'),
  active_ind boolean NOT NULL DEFAULT true,
  effective_from date NOT NULL,
  effective_until date,
  change_request_id uuid UNIQUE REFERENCES change_requests(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chk_pc_dates CHECK (effective_until IS NULL OR effective_until >= effective_from)
);

CREATE TABLE client_config.change_portfolio_configuration (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  change_request_id uuid NOT NULL REFERENCES change_requests(id) ON DELETE CASCADE,
  action_type varchar(10) NOT NULL CHECK (action_type IN ('CREATE','UPDATE','DELETE')),
  -- Original primary_account_id of the live row this change targets.
  -- Stored explicitly so UPDATE/DELETE can find the correct live row even
  -- when the change modifies fields (asset_class_code, sub_asset_class_code,
  -- manager_code) that derive primary_account_id. NULL for CREATE rows.
  target_primary_account_id varchar(13) CHECK (target_primary_account_id ~ '^[A-Z0-9]{1,3}[*][A-Z]{2}[A-Z]{3}[*][A-Z0-9]{3}$'),
  client_code varchar(3) NOT NULL REFERENCES client_config.client(client_code),
  portfolio_code varchar(15) NOT NULL REFERENCES client_config.portfolio(portfolio_code),
  asset_class_code char(2) NOT NULL REFERENCES client_config.asset_class(asset_class_code),
  sub_asset_class_code char(3) NOT NULL CHECK (sub_asset_class_code ~ '^[A-Z]{3}$'),
  manager_code char(3) NOT NULL REFERENCES client_config.manager(manager_code),
  benchmark_code varchar(60) NOT NULL CHECK (benchmark_code <> ''),
  npc_classification_id smallint NOT NULL REFERENCES client_config.npc_classification(npc_classification_id),
  long_name varchar(255) NOT NULL CHECK (long_name ~ '^[^\r\n]{1,255}$'),
  short_name varchar(100) NOT NULL CHECK (short_name ~ '^[^\r\n]{1,100}$'),
  active_ind boolean NOT NULL DEFAULT true,
  effective_from date NOT NULL,
  effective_until date,
  created_at timestamptz NOT NULL DEFAULT now(),
  
  -- Apply outcome tracking: set by applyChangePortfolioConfigurations()
  -- when the change request is processed to status 'processed'.
  apply_status varchar(10) DEFAULT NULL CHECK (apply_status IS NULL OR apply_status IN ('applied','skipped','failed')),
  apply_error text DEFAULT NULL
);

CREATE TABLE client_config.change_lookup_request (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  change_request_id uuid NOT NULL REFERENCES change_requests(id) ON DELETE CASCADE,
  dimension varchar(20) NOT NULL CHECK (dimension IN ('asset_class','sub_asset_class','benchmark')),
  -- New asset class (dimension = 'asset_class')
  asset_class_code char(2),
  asset_class_name varchar(30),
  -- New sub asset class (dimension = 'sub_asset_class')
  parent_asset_class_code char(2),
  sub_asset_class_code char(3),
  sub_asset_class_name varchar(100),
  -- New benchmark (dimension = 'benchmark')
  benchmark_code varchar(60),
  benchmark_name varchar(100),
  currency varchar(3),
  sort_order integer,
  apply_status varchar(20) NOT NULL DEFAULT 'pending' CHECK (apply_status IN ('pending','applied','failed')),
  apply_error text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Onboarding staging table for genuinely new pension funds. Holds the new
-- client identity (client_code/client_name) plus the initial portfolio
-- metadata until the customer_onboarding change request reaches 'processed'.
-- Like change_lookup_request, the values here do NOT need to exist in the
-- live client_config tables yet — they are introduced by the apply step
-- (stage → approve → apply).
--
-- Idempotency: UNIQUE (client_code, status) allows at most one row per
-- client code per status, so a re-processed change finds the existing
-- 'applied' row and is skipped, and duplicate 'pending' onboarding requests
-- for the same client code are rejected at the database level.
CREATE TABLE client_config.client_onboarding_staging (
  staging_id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  change_request_id uuid NOT NULL UNIQUE REFERENCES change_requests(id) ON DELETE CASCADE,
  client_code varchar(3) NOT NULL CHECK (client_code ~ '^[A-Z0-9]{1,3}$'),
  client_name varchar(100) NOT NULL CHECK (client_name ~ '^[^\r\n]{1,100}$'),
  portfolio_code varchar(15) NOT NULL CHECK (portfolio_code ~ '^[A-Z0-9]{2,15}$'),
  parent_account_code varchar(16) CHECK (parent_account_code IS NULL OR parent_account_code ~ '^[A-Z0-9]+(?:_[A-Z0-9]+)*$'),
  asset_class_code char(2) NOT NULL CHECK (asset_class_code ~ '^[A-Z]{2}$'),
  sub_asset_class_code char(3) NOT NULL CHECK (sub_asset_class_code ~ '^[A-Z]{3}$'),
  manager_code char(3) NOT NULL CHECK (manager_code ~ '^[A-Z0-9]{3}$'),
  benchmark_code varchar(60) NOT NULL CHECK (benchmark_code <> ''),
  npc_classification_id smallint NOT NULL,
  long_name varchar(255) NOT NULL CHECK (long_name ~ '^[^\r\n]{1,255}$'),
  short_name varchar(100) NOT NULL CHECK (short_name ~ '^[^\r\n]{1,100}$'),
  effective_from date NOT NULL,
  effective_until date,
  status varchar(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','applied','failed')),
  apply_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz,
  CONSTRAINT chk_onboarding_dates CHECK (effective_until IS NULL OR effective_until >= effective_from),
  CONSTRAINT uq_onboarding_client_status UNIQUE (client_code, status)
);

CREATE INDEX IF NOT EXISTS idx_clr_change_request_id ON client_config.change_lookup_request(change_request_id);

CREATE INDEX IF NOT EXISTS idx_portfolio_active_ind ON client_config.portfolio(active_ind);
CREATE INDEX IF NOT EXISTS idx_parent_account_active_ind ON client_config.parent_account(active_ind);

CREATE INDEX IF NOT EXISTS idx_pc_portfolio_code ON client_config.portfolio_configuration(portfolio_code);
CREATE INDEX IF NOT EXISTS idx_pc_client_code ON client_config.portfolio_configuration(client_code);
CREATE INDEX IF NOT EXISTS idx_pc_benchmark_code ON client_config.portfolio_configuration(benchmark_code);
CREATE INDEX IF NOT EXISTS idx_pc_npc_classification_id ON client_config.portfolio_configuration(npc_classification_id);
CREATE INDEX IF NOT EXISTS idx_pc_active_ind ON client_config.portfolio_configuration(active_ind);
CREATE INDEX IF NOT EXISTS idx_cpc_change_request_id ON client_config.change_portfolio_configuration(change_request_id);
CREATE INDEX IF NOT EXISTS idx_cpc_target_primary_account_id ON client_config.change_portfolio_configuration(target_primary_account_id);

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
