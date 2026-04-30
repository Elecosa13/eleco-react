-- Eleco SA - Correction policy INSERT depannage_intervenants
-- Probleme: la policy di_insert_own_or_admin n'est pas active en production,
-- ou le upsert (ON CONFLICT DO UPDATE) est bloque par di_update_none (USING false).
-- Solution: recreer la policy INSERT + remplacer di_update_none par une policy
-- UPDATE restrictive (seul l'admin peut modifier, l'employe peut uniquement se retirer via DELETE).

DO $$
BEGIN
  IF to_regprocedure('public.is_admin()') IS NULL THEN
    RAISE EXCEPTION 'Fonction public.is_admin() absente. Executer auth_rls_security.sql avant.';
  END IF;
  IF to_regprocedure('public.current_utilisateur_id()') IS NULL THEN
    RAISE EXCEPTION 'Fonction public.current_utilisateur_id() absente.';
  END IF;
END $$;

-- INSERT : un employe ne peut inserer que sa propre ligne (employe_id = lui-meme).
DROP POLICY IF EXISTS "di_insert_own_or_admin" ON public.depannage_intervenants;
CREATE POLICY "di_insert_own_or_admin"
  ON public.depannage_intervenants FOR INSERT TO authenticated
  WITH CHECK (
    public.is_admin()
    OR (
      employe_id = public.current_utilisateur_id()
      AND public.current_utilisateur_id() IS NOT NULL
    )
  );

-- UPDATE : admin seulement (pas d'UPDATE direct par les employes — ils DELETE/INSERT).
-- Remplace di_update_none (USING false) qui bloquait les upserts meme sans conflit.
DROP POLICY IF EXISTS "di_update_none" ON public.depannage_intervenants;
CREATE POLICY "di_update_admin_only"
  ON public.depannage_intervenants FOR UPDATE TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());
