-- =============================================================================
-- ROLLBACK: 20260530_provision_user_trigger
-- =============================================================================

-- Remove trigger
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

-- Remove functions
DROP FUNCTION IF EXISTS public.provision_archflow_user();
DROP FUNCTION IF EXISTS public.mark_provision_success(UUID);

-- Remove view
DROP VIEW IF EXISTS public.pending_provisions;

-- Remove table (keep data as audit trail by default — comment out to destroy)
-- DROP TABLE IF EXISTS public.user_provision_log;

DO $$ BEGIN
  RAISE NOTICE '✅  Trigger and functions removed.';
  RAISE NOTICE '⚠️   user_provision_log table preserved as audit trail.';
  RAISE NOTICE '    Run: DROP TABLE public.user_provision_log; to remove it.';
END $$;
