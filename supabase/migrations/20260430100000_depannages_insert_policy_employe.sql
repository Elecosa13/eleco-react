-- Eleco SA - Politique INSERT depannages pour employes terrain
-- Permet aux employes de creer un depannage directement depuis leur espace (intervention spontanee).
-- Sans cette policy, tout INSERT depuis un employe est refuse par RLS (aucune policy INSERT n'existait).

DO $$
BEGIN
  IF to_regprocedure('public.is_admin()') IS NULL THEN
    RAISE EXCEPTION 'Fonction public.is_admin() absente. Executer auth_rls_security.sql avant cette migration.';
  END IF;
  IF to_regprocedure('public.current_utilisateur_id()') IS NULL THEN
    RAISE EXCEPTION 'Fonction public.current_utilisateur_id() absente.';
  END IF;
END $$;

DROP POLICY IF EXISTS "depannages_insert_employe_or_admin" ON public.depannages;

-- Un employe ne peut inserer qu'un depannage avec son propre employe_id.
-- L'admin peut inserer sans restriction.
CREATE POLICY "depannages_insert_employe_or_admin"
  ON public.depannages FOR INSERT TO authenticated
  WITH CHECK (
    public.is_admin()
    OR (
      employe_id = public.current_utilisateur_id()
      AND public.current_utilisateur_id() IS NOT NULL
    )
  );
