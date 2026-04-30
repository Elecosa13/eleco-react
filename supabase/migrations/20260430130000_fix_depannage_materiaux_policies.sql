-- Eleco SA - Correction policies INSERT/DELETE depannage_materiaux
-- Probleme: la policy INSERT de 20260429143000 n'est pas active en production
-- (CREATE POLICY sans DROP IF EXISTS prealable = echec silencieux si existait).
-- Probleme 2: DELETE admin_only bloque l'employe sur la re-sauvegarde (DELETE+INSERT).
-- Solution: recreer INSERT + assouplir DELETE pour l'employe sur son propre depannage.

DO $$
BEGIN
  IF to_regprocedure('public.is_admin()') IS NULL THEN
    RAISE EXCEPTION 'Fonction public.is_admin() absente.';
  END IF;
  IF to_regprocedure('public.current_utilisateur_id()') IS NULL THEN
    RAISE EXCEPTION 'Fonction public.current_utilisateur_id() absente.';
  END IF;
END $$;

-- INSERT : employe peut inserer si created_by = lui-meme OU s'il est lie au depannage.
DROP POLICY IF EXISTS "depannage_materiaux_insert_intervenant_or_admin" ON public.depannage_materiaux;
CREATE POLICY "depannage_materiaux_insert_intervenant_or_admin"
  ON public.depannage_materiaux FOR INSERT TO authenticated
  WITH CHECK (
    public.is_admin()
    OR (
      created_by = public.current_utilisateur_id()
      AND public.current_utilisateur_id() IS NOT NULL
    )
    OR EXISTS (
      SELECT 1
      FROM public.depannages d
      WHERE d.id = depannage_materiaux.depannage_id
        AND (
          d.employe_id = public.current_utilisateur_id()
          OR d.pris_par = public.current_utilisateur_id()
          OR EXISTS (
            SELECT 1
            FROM public.depannage_intervenants di
            WHERE di.depannage_id = d.id
              AND di.employe_id = public.current_utilisateur_id()
          )
        )
    )
  );

-- DELETE : admin OU employe lie au depannage (pour re-sauvegarde DELETE+INSERT).
DROP POLICY IF EXISTS "depannage_materiaux_delete_admin_only" ON public.depannage_materiaux;
CREATE POLICY "depannage_materiaux_delete_intervenant_or_admin"
  ON public.depannage_materiaux FOR DELETE TO authenticated
  USING (
    public.is_admin()
    OR EXISTS (
      SELECT 1
      FROM public.depannages d
      WHERE d.id = depannage_materiaux.depannage_id
        AND (
          d.employe_id = public.current_utilisateur_id()
          OR d.pris_par = public.current_utilisateur_id()
          OR EXISTS (
            SELECT 1
            FROM public.depannage_intervenants di
            WHERE di.depannage_id = d.id
              AND di.employe_id = public.current_utilisateur_id()
          )
        )
    )
  );
