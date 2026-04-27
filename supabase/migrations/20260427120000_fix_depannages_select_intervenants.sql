-- ============================================================
-- Eleco SA - Correction policy SELECT depannages
-- Date: 2026-04-27
--
-- Probleme:
-- La policy SELECT ne couvrait que employe_id.
-- Un intervenant (depannage_intervenants) ou le preneur (pris_par)
-- ne pouvait pas lire les depannages auxquels il est lie.
--
-- Correction:
-- Aligner la policy SELECT avec la policy UPDATE existante
-- (zy_20260419220000_depannages_intervenants.sql).
--
-- Prerequis: auth_rls_security.sql deja applique.
-- ============================================================

DO $$
BEGIN
  IF to_regprocedure('public.current_utilisateur_id()') IS NULL THEN
    RAISE EXCEPTION 'Fonction public.current_utilisateur_id() absente. Executer auth_rls_security.sql avant cette migration.';
  END IF;

  IF to_regprocedure('public.is_admin()') IS NULL THEN
    RAISE EXCEPTION 'Fonction public.is_admin() absente. Executer auth_rls_security.sql avant cette migration.';
  END IF;
END $$;

DROP POLICY IF EXISTS "depannages_select_own_or_admin" ON public.depannages;

CREATE POLICY "depannages_select_own_or_admin"
  ON public.depannages FOR SELECT TO authenticated
  USING (
    public.is_admin()
    OR employe_id = public.current_utilisateur_id()
    OR pris_par   = public.current_utilisateur_id()
    OR EXISTS (
      SELECT 1 FROM public.depannage_intervenants di
      WHERE di.depannage_id = depannages.id
        AND di.employe_id   = public.current_utilisateur_id()
    )
  );
