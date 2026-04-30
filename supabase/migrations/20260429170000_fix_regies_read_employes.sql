-- ============================================================
-- Eleco SA - Lecture des regies cote employe
-- Date: 2026-04-29
--
-- Probleme:
-- Cote employe, les depannages sont visibles mais la jointure vers
-- public.regies peut revenir NULL si la policy SELECT regies manque
-- ou ne couvre que les admins. L'UI retombe alors sur "Regie non assignee".
--
-- Correction:
-- Autoriser les utilisateurs authentifies avec profil Eleco actif a lire
-- les regies actives necessaires a l'affichage des depannages.
-- Les modifications restent reservees aux admins par les policies existantes.
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

ALTER TABLE public.regies ENABLE ROW LEVEL SECURITY;

GRANT SELECT ON public.regies TO authenticated;

DROP POLICY IF EXISTS "regies_select_active_users" ON public.regies;

CREATE POLICY "regies_select_active_users"
  ON public.regies FOR SELECT TO authenticated
  USING (
    public.is_admin()
    OR (
      public.current_utilisateur_id() IS NOT NULL
      AND actif = true
    )
  );
