-- ============================================================
-- Eleco SA - Patch immediat de securisation base existante
-- Date: 2026-04-19
--
-- Objectif:
-- - retirer les policies temporaires/permissives connues
-- - reappliquer les policies finales sur les modules sensibles
-- - laisser les controles de donnees avant validation des contraintes
--
-- A executer APRES:
-- - sections_5_6_7.sql
-- - 20260418_absences.sql
-- - auth_rls_security.sql
--
-- Ce patch est volontairement non destructif pour les donnees.
-- Les VALIDATE CONSTRAINT restent commentes: les lancer seulement si
-- les requetes de controle retournent 0 ligne.
-- ============================================================

DO $$
BEGIN
  IF to_regprocedure('public.current_utilisateur_id()') IS NULL THEN
    RAISE EXCEPTION 'Fonction public.current_utilisateur_id() absente. Executer auth_rls_security.sql avant ce patch.';
  END IF;

  IF to_regprocedure('public.is_admin()') IS NULL THEN
    RAISE EXCEPTION 'Fonction public.is_admin() absente. Executer auth_rls_security.sql avant ce patch.';
  END IF;
END $$;

-- ------------------------------------------------------------
-- 1) Nettoyage des policies temporaires/permissives et doublons
-- ------------------------------------------------------------

DROP POLICY IF EXISTS "Utilisateurs gerent les vacances" ON public.vacances;
DROP POLICY IF EXISTS "Utilisateurs consultent les blocages vacances" ON public.vacances_blocages;
DROP POLICY IF EXISTS "Employe gere sa signature" ON public.signatures;
DROP POLICY IF EXISTS "Employe gere sa charte" ON public.chartes_acceptees;
DROP POLICY IF EXISTS "Acces temporaire absences" ON public.absences;

DROP POLICY IF EXISTS "vacances_select_own_or_admin" ON public.vacances;
DROP POLICY IF EXISTS "vacances_insert_own_or_admin" ON public.vacances;
DROP POLICY IF EXISTS "vacances_update_own_or_admin" ON public.vacances;
DROP POLICY IF EXISTS "vacances_delete_admin" ON public.vacances;

DROP POLICY IF EXISTS "vacances_blocages_select_authenticated" ON public.vacances_blocages;
DROP POLICY IF EXISTS "vacances_blocages_admin_insert" ON public.vacances_blocages;
DROP POLICY IF EXISTS "vacances_blocages_admin_update" ON public.vacances_blocages;
DROP POLICY IF EXISTS "vacances_blocages_admin_delete" ON public.vacances_blocages;

DROP POLICY IF EXISTS "signatures_select_own_or_admin" ON public.signatures;
DROP POLICY IF EXISTS "signatures_insert_own_or_admin" ON public.signatures;
DROP POLICY IF EXISTS "signatures_update_own_or_admin" ON public.signatures;
DROP POLICY IF EXISTS "signatures_delete_admin" ON public.signatures;

DROP POLICY IF EXISTS "chartes_select_own_or_admin" ON public.chartes_acceptees;
DROP POLICY IF EXISTS "chartes_insert_own_or_admin" ON public.chartes_acceptees;
DROP POLICY IF EXISTS "chartes_update_admin" ON public.chartes_acceptees;
DROP POLICY IF EXISTS "chartes_delete_admin" ON public.chartes_acceptees;

DROP POLICY IF EXISTS "absences_select_own_or_admin" ON public.absences;
DROP POLICY IF EXISTS "absences_insert_own_or_admin" ON public.absences;
DROP POLICY IF EXISTS "absences_update_own_or_admin" ON public.absences;
DROP POLICY IF EXISTS "absences_delete_admin" ON public.absences;

-- ------------------------------------------------------------
-- 2) Activation RLS sur les tables sensibles
-- ------------------------------------------------------------

ALTER TABLE public.vacances ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vacances_blocages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.signatures ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chartes_acceptees ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.absences ENABLE ROW LEVEL SECURITY;

-- ------------------------------------------------------------
-- 3) Policies finales - vacances
-- ------------------------------------------------------------

CREATE POLICY "vacances_select_own_or_admin"
  ON public.vacances FOR SELECT TO authenticated
  USING (public.is_admin() OR employe_id = public.current_utilisateur_id());

CREATE POLICY "vacances_insert_own_or_admin"
  ON public.vacances FOR INSERT TO authenticated
  WITH CHECK (public.is_admin() OR employe_id = public.current_utilisateur_id());

CREATE POLICY "vacances_update_own_or_admin"
  ON public.vacances FOR UPDATE TO authenticated
  USING (
    public.is_admin()
    OR (
      employe_id = public.current_utilisateur_id()
      AND statut = 'en_attente'
    )
  )
  WITH CHECK (
    public.is_admin()
    OR (
      employe_id = public.current_utilisateur_id()
      AND statut = 'en_attente'
      AND decide_par IS NULL
      AND decide_le IS NULL
    )
  );

CREATE POLICY "vacances_delete_admin"
  ON public.vacances FOR DELETE TO authenticated
  USING (public.is_admin());

-- ------------------------------------------------------------
-- 4) Policies finales - blocages vacances
-- ------------------------------------------------------------

CREATE POLICY "vacances_blocages_select_authenticated"
  ON public.vacances_blocages FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "vacances_blocages_admin_insert"
  ON public.vacances_blocages FOR INSERT TO authenticated
  WITH CHECK (public.is_admin());

CREATE POLICY "vacances_blocages_admin_update"
  ON public.vacances_blocages FOR UPDATE TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

CREATE POLICY "vacances_blocages_admin_delete"
  ON public.vacances_blocages FOR DELETE TO authenticated
  USING (public.is_admin());

-- ------------------------------------------------------------
-- 5) Policies finales - signatures
-- ------------------------------------------------------------

CREATE POLICY "signatures_select_own_or_admin"
  ON public.signatures FOR SELECT TO authenticated
  USING (public.is_admin() OR employe_id = public.current_utilisateur_id());

CREATE POLICY "signatures_insert_own_or_admin"
  ON public.signatures FOR INSERT TO authenticated
  WITH CHECK (public.is_admin() OR employe_id = public.current_utilisateur_id());

CREATE POLICY "signatures_update_own_or_admin"
  ON public.signatures FOR UPDATE TO authenticated
  USING (public.is_admin() OR employe_id = public.current_utilisateur_id())
  WITH CHECK (public.is_admin() OR employe_id = public.current_utilisateur_id());

CREATE POLICY "signatures_delete_admin"
  ON public.signatures FOR DELETE TO authenticated
  USING (public.is_admin());

-- ------------------------------------------------------------
-- 6) Policies finales - chartes acceptees
-- ------------------------------------------------------------

CREATE POLICY "chartes_select_own_or_admin"
  ON public.chartes_acceptees FOR SELECT TO authenticated
  USING (public.is_admin() OR employe_id = public.current_utilisateur_id());

CREATE POLICY "chartes_insert_own_or_admin"
  ON public.chartes_acceptees FOR INSERT TO authenticated
  WITH CHECK (public.is_admin() OR employe_id = public.current_utilisateur_id());

CREATE POLICY "chartes_update_admin"
  ON public.chartes_acceptees FOR UPDATE TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

CREATE POLICY "chartes_delete_admin"
  ON public.chartes_acceptees FOR DELETE TO authenticated
  USING (public.is_admin());

-- ------------------------------------------------------------
-- 7) Policies finales - absences
-- ------------------------------------------------------------

CREATE POLICY "absences_select_own_or_admin"
  ON public.absences FOR SELECT TO authenticated
  USING (public.is_admin() OR employe_id = public.current_utilisateur_id());

CREATE POLICY "absences_insert_own_or_admin"
  ON public.absences FOR INSERT TO authenticated
  WITH CHECK (public.is_admin() OR employe_id = public.current_utilisateur_id());

CREATE POLICY "absences_update_own_or_admin"
  ON public.absences FOR UPDATE TO authenticated
  USING (
    public.is_admin()
    OR (
      employe_id = public.current_utilisateur_id()
      AND statut = 'en_attente'
    )
  )
  WITH CHECK (
    public.is_admin()
    OR (
      employe_id = public.current_utilisateur_id()
      AND statut = 'en_attente'
      AND decide_par IS NULL
      AND decide_le IS NULL
    )
  );

CREATE POLICY "absences_delete_admin"
  ON public.absences FOR DELETE TO authenticated
  USING (public.is_admin());

-- ------------------------------------------------------------
-- 8) Controles avant validation des contraintes NOT VALID
-- ------------------------------------------------------------

-- Doit retourner 0 ligne avant VALIDATE depannages_regie_id_fkey.
SELECT id, regie_id
FROM public.depannages
WHERE regie_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM public.regies r
    WHERE r.id = depannages.regie_id
  );

-- Doit retourner 0 ligne avant VALIDATE depannages_statut_metier_check.
SELECT id, statut
FROM public.depannages
WHERE statut NOT IN (
  'Bon reçu',
  'À traiter',
  'Intervention faite',
  'Rapport reçu',
  'Facture à préparer',
  'Facture prête'
);

-- A lancer manuellement seulement si les 2 controles ci-dessus retournent 0 ligne.
-- ALTER TABLE public.depannages VALIDATE CONSTRAINT depannages_regie_id_fkey;
-- ALTER TABLE public.depannages VALIDATE CONSTRAINT depannages_statut_metier_check;

-- ------------------------------------------------------------
-- 9) Controle visuel des policies actives sur les tables sensibles
-- ------------------------------------------------------------

SELECT schemaname, tablename, policyname, cmd, roles, qual, with_check
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN (
    'vacances',
    'vacances_blocages',
    'signatures',
    'chartes_acceptees',
    'absences'
  )
ORDER BY tablename, policyname;
