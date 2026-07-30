CREATE SCHEMA IF NOT EXISTS client_config;
SET search_path TO client_config, public;
CREATE TABLE legal_entity (legal_entity_id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, legal_name varchar(100) NOT NULL UNIQUE CHECK (legal_name ~ '^[^\r\n]{1,100}$'));
CREATE TABLE parent_account (parent_account_id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, parent_account_code varchar(16) NOT NULL UNIQUE CHECK(parent_account_code ~ '^[A-Z0-9]+(?:_[A-Z0-9]+)*$'), msa_parent_account_code varchar(16) CHECK(msa_parent_account_code IS NULL OR msa_parent_account_code ~ '^[A-Z0-9]+(?:_[A-Z0-9]+)*$'));
CREATE TABLE portfolio (portfolio_id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, portfolio_code varchar(15) NOT NULL UNIQUE CHECK(portfolio_code ~ '^[A-Z0-9]{2,15}$'), parent_account_id bigint REFERENCES parent_account);
CREATE TABLE asset_class (asset_class_id smallint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, asset_class_code char(2) NOT NULL UNIQUE CHECK(asset_class_code ~ '^[A-Z]{2}$'), asset_class_name varchar(30) NOT NULL UNIQUE);
CREATE TABLE sub_asset_class (sub_asset_class_id smallint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, asset_class_id smallint NOT NULL REFERENCES asset_class, sub_asset_class_code char(3) NOT NULL CHECK(sub_asset_class_code ~ '^[A-Z0-9]{3}$'), sub_asset_class_name varchar(50) NOT NULL, UNIQUE(asset_class_id,sub_asset_class_code), UNIQUE(asset_class_id,sub_asset_class_name));
CREATE TABLE manager (manager_id smallint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, manager_code char(3) NOT NULL UNIQUE CHECK(manager_code ~ '^[A-Z0-9]{3}$'), manager_name varchar(50) NOT NULL UNIQUE);
CREATE TABLE benchmark (benchmark_id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, benchmark_code varchar(60) NOT NULL UNIQUE, benchmark_name varchar(100), rimes_code varchar(40));
CREATE TABLE model (model_id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, model_code varchar(10) NOT NULL UNIQUE);
CREATE TABLE classification (classification_id smallint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, classification_code varchar(10) NOT NULL UNIQUE);
CREATE TABLE strategy (strategy_id smallint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, strategy_name varchar(30) NOT NULL UNIQUE);
CREATE TABLE sub_strategy (sub_strategy_id smallint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, strategy_id smallint NOT NULL REFERENCES strategy, sub_strategy_name varchar(50) NOT NULL, UNIQUE(strategy_id,sub_strategy_name));
CREATE TABLE account (primary_account_id varchar(30) PRIMARY KEY CHECK(primary_account_id ~ '^[A-Z0-9]{2,15}_[A-Z]{2}[A-Z0-9]{3}_[A-Z0-9]{3}$'), portfolio_id bigint NOT NULL REFERENCES portfolio, asset_class_id smallint NOT NULL REFERENCES asset_class, sub_asset_class_id smallint NOT NULL REFERENCES sub_asset_class, manager_id smallint NOT NULL REFERENCES manager, legal_entity_id bigint REFERENCES legal_entity, additional_code varchar(3), long_name varchar(50) NOT NULL, short_name varchar(30) NOT NULL, model_id bigint REFERENCES model, classification_id smallint REFERENCES classification, strategy_id smallint NOT NULL REFERENCES strategy, sub_strategy_id smallint NOT NULL REFERENCES sub_strategy, benchmark_id bigint REFERENCES benchmark, UNIQUE(portfolio_id,asset_class_id,sub_asset_class_id,manager_id));

-- Alleen de door de aangeleverde hiërarchie toegestane opties worden geladen.
WITH source(asset_code,asset_name,sub_code,sub_name) AS (VALUES
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
), ins_asset AS (
 INSERT INTO asset_class(asset_class_code,asset_class_name) SELECT DISTINCT asset_code,asset_name FROM source ON CONFLICT DO NOTHING RETURNING 1
)
INSERT INTO sub_asset_class(asset_class_id,sub_asset_class_code,sub_asset_class_name)
SELECT a.asset_class_id,s.sub_code,s.sub_name FROM source s JOIN asset_class a ON a.asset_class_code=s.asset_code ON CONFLICT DO NOTHING;

CREATE OR REPLACE FUNCTION validate_account_selection() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE expected text;
BEGIN
 IF NOT EXISTS (SELECT 1 FROM sub_asset_class s WHERE s.sub_asset_class_id=NEW.sub_asset_class_id AND s.asset_class_id=NEW.asset_class_id) THEN RAISE EXCEPTION 'Sub asset class hoort niet bij asset class'; END IF;
 SELECT p.portfolio_code||'_'||a.asset_class_code||s.sub_asset_class_code||'_'||m.manager_code INTO expected FROM portfolio p,asset_class a,sub_asset_class s,manager m WHERE p.portfolio_id=NEW.portfolio_id AND a.asset_class_id=NEW.asset_class_id AND s.sub_asset_class_id=NEW.sub_asset_class_id AND m.manager_id=NEW.manager_id;
 IF NEW.primary_account_id<>expected THEN RAISE EXCEPTION 'primary_account_id % moet % zijn',NEW.primary_account_id,expected; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER trg_validate_account_selection BEFORE INSERT OR UPDATE ON account FOR EACH ROW EXECUTE FUNCTION validate_account_selection();

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
  primary_account_id varchar(30) PRIMARY KEY CHECK (primary_account_id ~ '^[A-Z0-9]{2,15}_[A-Z]{2}[A-Z0-9]{3}_[A-Z0-9]{3}$'),
  portfolio_code varchar(15) NOT NULL REFERENCES client_config.portfolio(portfolio_code),
  asset_class_code char(2) NOT NULL REFERENCES client_config.asset_class(asset_class_code),
  sub_asset_class_code char(3) NOT NULL CHECK (sub_asset_class_code ~ '^[A-Z0-9]{3}$'),
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
  portfolio_code varchar(15) NOT NULL REFERENCES client_config.portfolio(portfolio_code),
  asset_class_code char(2) NOT NULL REFERENCES client_config.asset_class(asset_class_code),
  sub_asset_class_code char(3) NOT NULL CHECK (sub_asset_class_code ~ '^[A-Z0-9]{3}$'),
  manager_code char(3) NOT NULL REFERENCES client_config.manager(manager_code),
  benchmark_code varchar(60) NOT NULL CHECK (benchmark_code <> ''),
  npc_classification_id smallint NOT NULL REFERENCES client_config.npc_classification(npc_classification_id),
  long_name varchar(255) NOT NULL CHECK (long_name ~ '^[^\r\n]{1,255}$'),
  short_name varchar(100) NOT NULL CHECK (short_name ~ '^[^\r\n]{1,100}$'),
  effective_from date NOT NULL,
  effective_until date,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pc_portfolio_code ON client_config.portfolio_configuration(portfolio_code);
CREATE INDEX IF NOT EXISTS idx_pc_benchmark_code ON client_config.portfolio_configuration(benchmark_code);
CREATE INDEX IF NOT EXISTS idx_pc_npc_classification_id ON client_config.portfolio_configuration(npc_classification_id);
CREATE INDEX IF NOT EXISTS idx_pc_active_ind ON client_config.portfolio_configuration(active_ind);
CREATE INDEX IF NOT EXISTS idx_cpc_change_request_id ON client_config.change_portfolio_configuration(change_request_id);
