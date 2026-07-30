-- ─────────────────────────────────────────────────────────────────────────
-- Change-process enforcement (client_config.portfolio_configuration)
--
-- These triggers ensure that no code path can INSERT, UPDATE, or DELETE
-- rows in client_config.portfolio_configuration without explicitly
-- setting the session-level GUC 'app.change_process_bypass' to 'true'.
--
-- The ONLY code path that sets this variable is
-- applyChangePortfolioConfigurations() in lib/client-config-db.ts, which
-- is called from the change-processor when a change request reaches the
-- 'processed' state.
--
-- Any attempt to mutate the live configuration outside this flow
-- (e.g. from a new API route, an ad-hoc script, or a direct SQL console)
-- is blocked at the database level with a clear error message.
-- ─────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION client_config.enforce_change_process()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF current_setting('app.change_process_bypass', true) IS DISTINCT FROM 'true' THEN
    RAISE EXCEPTION 'Directe wijziging van client_config.portfolio_configuration is niet toegestaan. '
                     'Alle configuratiewijzigingen moeten via het BCM Change-process workflow verlopen '
                     '(change request aanmaken, stage, goedkeuring, verwerken).';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION client_config.enforce_change_process_delete()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF current_setting('app.change_process_bypass', true) IS DISTINCT FROM 'true' THEN
    RAISE EXCEPTION 'Directe verwijdering van client_config.portfolio_configuration is niet toegestaan. '
                     'Configuratiewijzigingen moeten via het BCM Change-process workflow verlopen.';
  END IF;
  RETURN OLD;
END;
$$;

DO $$
BEGIN
  -- INSERT trigger
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'trg_enforce_change_process_insert'
      AND tgrelid = 'client_config.portfolio_configuration'::regclass
  ) THEN
    CREATE TRIGGER trg_enforce_change_process_insert
      BEFORE INSERT ON client_config.portfolio_configuration
      FOR EACH ROW
      EXECUTE FUNCTION client_config.enforce_change_process();
  END IF;

  -- UPDATE trigger
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'trg_enforce_change_process_update'
      AND tgrelid = 'client_config.portfolio_configuration'::regclass
  ) THEN
    CREATE TRIGGER trg_enforce_change_process_update
      BEFORE UPDATE ON client_config.portfolio_configuration
      FOR EACH ROW
      EXECUTE FUNCTION client_config.enforce_change_process();
  END IF;

  -- DELETE trigger
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'trg_enforce_change_process_delete'
      AND tgrelid = 'client_config.portfolio_configuration'::regclass
  ) THEN
    CREATE TRIGGER trg_enforce_change_process_delete
      BEFORE DELETE ON client_config.portfolio_configuration
      FOR EACH ROW
      EXECUTE FUNCTION client_config.enforce_change_process_delete();
  END IF;
END;
$$;
