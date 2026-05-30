-- =============================================================================
-- ArchFlow — User provisioning trigger
-- Migration: 20260530_provision_user_trigger
--
-- PURPOSE
--   Acts as a safety net for user provisioning.
--
--   The primary provisioning path is:
--     Frontend → supabase.auth.signUp() → POST /api/auth/provision
--
--   This trigger fires when a user is inserted into auth.users and:
--     1. Creates a record in public.user_provision_log (audit trail).
--     2. Calls the ArchFlow backend via pg_net (async HTTP request) if
--        ARCHFLOW_PROVISION_URL and ARCHFLOW_PROVISION_SECRET are set.
--
--   This ensures users are provisioned even if the frontend call fails.
--
-- REQUIREMENTS
--   - Supabase pg_net extension enabled (Dashboard → Database → Extensions)
--   - ARCHFLOW_PROVISION_URL secret set  (Dashboard → Settings → Vault)
--   - ARCHFLOW_PROVISION_SECRET set      (Dashboard → Settings → Vault)
--
-- HOW TO APPLY
--   1. Open Supabase Dashboard → SQL Editor
--   2. Paste and run this entire file
--
-- ROLLBACK
--   Run: 20260530_provision_user_trigger_rollback.sql
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 0. Enable pg_net (skip if already enabled)
-- ---------------------------------------------------------------------------

CREATE EXTENSION IF NOT EXISTS pg_net;

-- ---------------------------------------------------------------------------
-- 1. Audit table — user_provision_log
--    Stores every attempt so we can retry failed provisions from the backend.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.user_provision_log (
  id             BIGSERIAL PRIMARY KEY,
  supabase_id    UUID        NOT NULL,
  email          TEXT        NOT NULL,
  full_name      TEXT,
  company_name   TEXT,
  provider       TEXT,
  triggered_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  http_request_id BIGINT,             -- pg_net request id for status tracking
  status         TEXT        NOT NULL DEFAULT 'pending',
                                      -- pending | success | failed | skipped
  error_message  TEXT,
  provisioned_at TIMESTAMPTZ
);

-- Index for the backend retry job
CREATE INDEX IF NOT EXISTS idx_provision_log_status
  ON public.user_provision_log (status)
  WHERE status IN ('pending', 'failed');

CREATE INDEX IF NOT EXISTS idx_provision_log_supabase_id
  ON public.user_provision_log (supabase_id);

-- RLS: only service_role can read/write this table
ALTER TABLE public.user_provision_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_only" ON public.user_provision_log
  USING (auth.role() = 'service_role');

-- ---------------------------------------------------------------------------
-- 2. Provisioning function
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.provision_archflow_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER          -- runs as the owner (postgres), not the calling user
SET search_path = public
AS $$
DECLARE
  provision_url    TEXT;
  provision_secret TEXT;
  request_body     JSONB;
  request_id       BIGINT;
  log_id           BIGINT;
  full_name        TEXT;
  company_name     TEXT;
  provider         TEXT;
BEGIN
  -- ── Extract metadata from NEW record ──────────────────────────────────
  full_name    := NEW.raw_user_meta_data  ->> 'full_name';
  company_name := NEW.raw_user_meta_data  ->> 'company_name';
  provider     := NEW.raw_app_meta_data   ->> 'provider';

  -- ── Log the attempt (always, even if pg_net call is skipped) ──────────
  INSERT INTO public.user_provision_log
    (supabase_id, email, full_name, company_name, provider, status)
  VALUES
    (NEW.id, NEW.email, full_name, company_name, provider, 'pending')
  RETURNING id INTO log_id;

  -- ── Read secrets from Vault (gracefully skip if not configured) ────────
  BEGIN
    SELECT decrypted_secret INTO provision_url
    FROM   vault.decrypted_secrets
    WHERE  name = 'ARCHFLOW_PROVISION_URL'
    LIMIT  1;

    SELECT decrypted_secret INTO provision_secret
    FROM   vault.decrypted_secrets
    WHERE  name = 'ARCHFLOW_PROVISION_SECRET'
    LIMIT  1;
  EXCEPTION WHEN OTHERS THEN
    -- vault extension not available or secrets not set — skip HTTP call
    UPDATE public.user_provision_log
    SET    status = 'skipped',
           error_message = 'Vault not configured — front-end provisioning only'
    WHERE  id = log_id;
    RETURN NEW;
  END;

  IF provision_url IS NULL OR provision_secret IS NULL THEN
    UPDATE public.user_provision_log
    SET    status = 'skipped',
           error_message = 'ARCHFLOW_PROVISION_URL or ARCHFLOW_PROVISION_SECRET not set'
    WHERE  id = log_id;
    RETURN NEW;
  END IF;

  -- ── Build request body ─────────────────────────────────────────────────
  request_body := jsonb_build_object(
    'supabaseId',   NEW.id::text,
    'email',        NEW.email,
    'fullName',     COALESCE(full_name, ''),
    'companyName',  company_name,
    'provider',     COALESCE(provider, 'email'),
    'triggeredBy',  'supabase_trigger'
  );

  -- ── Fire async HTTP POST via pg_net ────────────────────────────────────
  SELECT net.http_post(
    url     := provision_url || '/api/auth/provision-internal',
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer ' || provision_secret
    ),
    body    := request_body::text,
    timeout_milliseconds := 5000
  ) INTO request_id;

  -- ── Update log with pg_net request id ─────────────────────────────────
  UPDATE public.user_provision_log
  SET    http_request_id = request_id,
         status          = 'pending'   -- stays pending until backend confirms
  WHERE  id = log_id;

  RETURN NEW;

EXCEPTION WHEN OTHERS THEN
  -- Never let the trigger block user creation
  UPDATE public.user_provision_log
  SET    status        = 'failed',
         error_message = SQLERRM
  WHERE  id = log_id;
  RETURN NEW;
END;
$$;

-- ---------------------------------------------------------------------------
-- 3. Attach trigger to auth.users
-- ---------------------------------------------------------------------------

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.provision_archflow_user();

-- ---------------------------------------------------------------------------
-- 4. Helper: mark provision as successful (called by backend after it
--    creates the MongoDB user)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.mark_provision_success(p_supabase_id UUID)
RETURNS VOID
LANGUAGE sql
SECURITY DEFINER
AS $$
  UPDATE public.user_provision_log
  SET    status         = 'success',
         provisioned_at = now()
  WHERE  supabase_id    = p_supabase_id
    AND  status         = 'pending'
  ORDER  BY triggered_at DESC
  LIMIT  1;
$$;

-- ---------------------------------------------------------------------------
-- 5. Helper view: pending provisions for retry
-- ---------------------------------------------------------------------------

CREATE OR REPLACE VIEW public.pending_provisions AS
SELECT
  id,
  supabase_id,
  email,
  full_name,
  company_name,
  provider,
  triggered_at,
  status,
  error_message,
  EXTRACT(EPOCH FROM (now() - triggered_at)) AS seconds_ago
FROM public.user_provision_log
WHERE status IN ('pending', 'failed')
ORDER BY triggered_at DESC;

-- Grant read to authenticated role for dashboard visibility (optional)
GRANT SELECT ON public.pending_provisions TO authenticated;

-- ---------------------------------------------------------------------------
-- 6. Grant required permissions
-- ---------------------------------------------------------------------------

GRANT EXECUTE ON FUNCTION public.provision_archflow_user()   TO postgres;
GRANT EXECUTE ON FUNCTION public.mark_provision_success(UUID) TO service_role;
GRANT ALL     ON TABLE   public.user_provision_log            TO service_role;
GRANT USAGE   ON SEQUENCE public.user_provision_log_id_seq    TO service_role;

-- ---------------------------------------------------------------------------
-- Done
-- ---------------------------------------------------------------------------

DO $$
BEGIN
  RAISE NOTICE '✅  Trigger on_auth_user_created created on auth.users';
  RAISE NOTICE '✅  Table user_provision_log created';
  RAISE NOTICE '✅  View  pending_provisions  created';
  RAISE NOTICE '';
  RAISE NOTICE '👉  Next steps:';
  RAISE NOTICE '    1. Enable pg_net extension (Dashboard → Database → Extensions)';
  RAISE NOTICE '    2. Add secret ARCHFLOW_PROVISION_URL   (Dashboard → Vault)';
  RAISE NOTICE '    3. Add secret ARCHFLOW_PROVISION_SECRET (Dashboard → Vault)';
END $$;
