-- Eleco SA - Audit logs V1
-- Base simple pour journaliser les actions sensibles.
-- Lecture admin uniquement. Insertion prévue via backend service_role ou fonctions/triggers SECURITY DEFINER.

DO $$
BEGIN
  IF to_regprocedure('public.current_utilisateur_id()') IS NULL THEN
    RAISE EXCEPTION 'Fonction public.current_utilisateur_id() absente.';
  END IF;

  IF to_regprocedure('public.is_admin()') IS NULL THEN
    RAISE EXCEPTION 'Fonction public.is_admin() absente.';
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),

  user_id uuid REFERENCES public.utilisateurs(id) ON DELETE SET NULL,
  user_email text,

  action text NOT NULL,
  target_table text,
  target_id uuid,

  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  success boolean NOT NULL DEFAULT true,
  created_by_role text CHECK (created_by_role IN ('admin', 'employe'))
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at
  ON public.audit_logs(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_audit_logs_user_id
  ON public.audit_logs(user_id);

CREATE INDEX IF NOT EXISTS idx_audit_logs_target
  ON public.audit_logs(target_table, target_id);

CREATE INDEX IF NOT EXISTS idx_audit_logs_action
  ON public.audit_logs(action);

ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "audit_logs_select_admin" ON public.audit_logs;
DROP POLICY IF EXISTS "audit_logs_no_client_insert" ON public.audit_logs;
DROP POLICY IF EXISTS "audit_logs_no_client_update" ON public.audit_logs;
DROP POLICY IF EXISTS "audit_logs_no_client_delete" ON public.audit_logs;

CREATE POLICY "audit_logs_select_admin"
  ON public.audit_logs FOR SELECT TO authenticated
  USING (public.is_admin());

-- Pas de policy INSERT/UPDATE/DELETE pour authenticated :
-- - les employés ne peuvent ni lire ni écrire les logs
-- - les admins lisent uniquement
-- - les insertions passent par service_role backend ou fonction SECURITY DEFINER
