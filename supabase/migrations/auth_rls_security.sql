-- ============================================================
-- Migration : Auth Supabase + RLS production Eleco SA
-- A executer dans Supabase > SQL Editor
-- ============================================================

-- 1) Lien explicite entre le profil applicatif et Supabase Auth.
ALTER TABLE utilisateurs
  ADD COLUMN IF NOT EXISTS auth_user_id uuid UNIQUE REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS actif boolean DEFAULT true;

CREATE INDEX IF NOT EXISTS idx_utilisateurs_auth_user_id ON utilisateurs(auth_user_id);
CREATE INDEX IF NOT EXISTS idx_utilisateurs_email ON utilisateurs(lower(email));

-- Rattache automatiquement les profils existants aux comptes Auth de meme email.
UPDATE utilisateurs u
SET auth_user_id = au.id
FROM auth.users au
WHERE u.auth_user_id IS NULL
  AND lower(u.email) = lower(au.email);

CREATE OR REPLACE FUNCTION public.current_utilisateur_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id
  FROM public.utilisateurs
  WHERE auth_user_id = auth.uid()
    AND actif = true
  LIMIT 1
$$;

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.utilisateurs
    WHERE auth_user_id = auth.uid()
      AND role = 'admin'
      AND actif = true
  )
$$;

CREATE OR REPLACE FUNCTION public.link_current_user_profile()
RETURNS public.utilisateurs
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  linked_profile public.utilisateurs;
BEGIN
  IF auth.uid() IS NULL OR auth.email() IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  UPDATE public.utilisateurs
  SET auth_user_id = auth.uid()
  WHERE auth_user_id IS NULL
    AND lower(email) = lower(auth.email())
    AND actif = true
  RETURNING * INTO linked_profile;

  IF linked_profile.id IS NULL THEN
    SELECT *
    INTO linked_profile
    FROM public.utilisateurs
    WHERE auth_user_id = auth.uid()
      AND actif = true
    LIMIT 1;
  END IF;

  RETURN linked_profile;
END;
$$;

GRANT EXECUTE ON FUNCTION public.link_current_user_profile() TO authenticated;

-- 2) Active RLS sur les tables utilisees par l'app.
ALTER TABLE utilisateurs ENABLE ROW LEVEL SECURITY;
ALTER TABLE chantiers ENABLE ROW LEVEL SECURITY;
ALTER TABLE sous_dossiers ENABLE ROW LEVEL SECURITY;
ALTER TABLE rapports ENABLE ROW LEVEL SECURITY;
ALTER TABLE depannages ENABLE ROW LEVEL SECURITY;
ALTER TABLE time_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE rapport_materiaux ENABLE ROW LEVEL SECURITY;
ALTER TABLE catalogue ENABLE ROW LEVEL SECURITY;
ALTER TABLE vacances ENABLE ROW LEVEL SECURITY;
ALTER TABLE vacances_blocages ENABLE ROW LEVEL SECURITY;
ALTER TABLE signatures ENABLE ROW LEVEL SECURITY;
ALTER TABLE chartes_acceptees ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
  t text;
  p record;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'utilisateurs',
    'chantiers',
    'sous_dossiers',
    'rapports',
    'depannages',
    'time_entries',
    'rapport_materiaux',
    'catalogue',
    'vacances',
    'vacances_blocages',
    'signatures',
    'chartes_acceptees'
  ]
  LOOP
    FOR p IN
      SELECT policyname
      FROM pg_policies
      WHERE schemaname = 'public'
        AND tablename = t
    LOOP
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', p.policyname, t);
    END LOOP;
  END LOOP;
END $$;

-- 3) Policies utilisateurs.
CREATE POLICY "utilisateurs_select_own_or_admin"
  ON utilisateurs FOR SELECT TO authenticated
  USING (
    public.is_admin()
    OR auth_user_id = auth.uid()
    OR (auth_user_id IS NULL AND lower(email) = lower(auth.email()))
  );

CREATE POLICY "utilisateurs_admin_insert"
  ON utilisateurs FOR INSERT TO authenticated
  WITH CHECK (public.is_admin());

CREATE POLICY "utilisateurs_admin_update"
  ON utilisateurs FOR UPDATE TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

CREATE POLICY "utilisateurs_admin_delete"
  ON utilisateurs FOR DELETE TO authenticated
  USING (public.is_admin());

-- 4) Tables referentielles partagees.
CREATE POLICY "chantiers_read_authenticated"
  ON chantiers FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "chantiers_insert_authenticated"
  ON chantiers FOR INSERT TO authenticated
  WITH CHECK (public.current_utilisateur_id() IS NOT NULL);

CREATE POLICY "chantiers_admin_update"
  ON chantiers FOR UPDATE TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

CREATE POLICY "chantiers_admin_delete"
  ON chantiers FOR DELETE TO authenticated
  USING (public.is_admin());

CREATE POLICY "sous_dossiers_read_authenticated"
  ON sous_dossiers FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "sous_dossiers_insert_authenticated"
  ON sous_dossiers FOR INSERT TO authenticated
  WITH CHECK (public.current_utilisateur_id() IS NOT NULL);

CREATE POLICY "sous_dossiers_admin_update"
  ON sous_dossiers FOR UPDATE TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

CREATE POLICY "sous_dossiers_admin_delete"
  ON sous_dossiers FOR DELETE TO authenticated
  USING (public.is_admin());

CREATE POLICY "catalogue_read_authenticated"
  ON catalogue FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "catalogue_admin_write"
  ON catalogue FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- 5) Donnees metier employe/admin.
CREATE POLICY "rapports_select_own_or_admin"
  ON rapports FOR SELECT TO authenticated
  USING (public.is_admin() OR employe_id = public.current_utilisateur_id());

CREATE POLICY "rapports_insert_own_or_admin"
  ON rapports FOR INSERT TO authenticated
  WITH CHECK (public.is_admin() OR employe_id = public.current_utilisateur_id());

CREATE POLICY "rapports_update_own_or_admin"
  ON rapports FOR UPDATE TO authenticated
  USING (public.is_admin() OR employe_id = public.current_utilisateur_id())
  WITH CHECK (public.is_admin() OR employe_id = public.current_utilisateur_id());

CREATE POLICY "rapports_delete_own_or_admin"
  ON rapports FOR DELETE TO authenticated
  USING (public.is_admin() OR employe_id = public.current_utilisateur_id());

CREATE POLICY "depannages_select_own_or_admin"
  ON depannages FOR SELECT TO authenticated
  USING (public.is_admin() OR employe_id = public.current_utilisateur_id());

CREATE POLICY "depannages_insert_own_or_admin"
  ON depannages FOR INSERT TO authenticated
  WITH CHECK (public.is_admin() OR employe_id = public.current_utilisateur_id());

CREATE POLICY "depannages_update_own_or_admin"
  ON depannages FOR UPDATE TO authenticated
  USING (public.is_admin() OR employe_id = public.current_utilisateur_id())
  WITH CHECK (public.is_admin() OR employe_id = public.current_utilisateur_id());

CREATE POLICY "depannages_delete_own_or_admin"
  ON depannages FOR DELETE TO authenticated
  USING (public.is_admin() OR employe_id = public.current_utilisateur_id());

CREATE POLICY "time_entries_select_own_or_admin"
  ON time_entries FOR SELECT TO authenticated
  USING (public.is_admin() OR employe_id = public.current_utilisateur_id());

CREATE POLICY "time_entries_insert_own_or_admin"
  ON time_entries FOR INSERT TO authenticated
  WITH CHECK (public.is_admin() OR employe_id = public.current_utilisateur_id());

CREATE POLICY "time_entries_update_own_or_admin"
  ON time_entries FOR UPDATE TO authenticated
  USING (public.is_admin() OR employe_id = public.current_utilisateur_id())
  WITH CHECK (public.is_admin() OR employe_id = public.current_utilisateur_id());

CREATE POLICY "time_entries_delete_own_or_admin"
  ON time_entries FOR DELETE TO authenticated
  USING (public.is_admin() OR employe_id = public.current_utilisateur_id());

CREATE POLICY "rapport_materiaux_select_own_or_admin"
  ON rapport_materiaux FOR SELECT TO authenticated
  USING (
    public.is_admin()
    OR EXISTS (
      SELECT 1 FROM rapports r
      WHERE r.id = rapport_materiaux.rapport_id
        AND r.employe_id = public.current_utilisateur_id()
    )
    OR EXISTS (
      SELECT 1 FROM depannages d
      WHERE d.id = rapport_materiaux.rapport_id
        AND d.employe_id = public.current_utilisateur_id()
    )
  );

CREATE POLICY "rapport_materiaux_insert_own_or_admin"
  ON rapport_materiaux FOR INSERT TO authenticated
  WITH CHECK (
    public.is_admin()
    OR EXISTS (
      SELECT 1 FROM rapports r
      WHERE r.id = rapport_materiaux.rapport_id
        AND r.employe_id = public.current_utilisateur_id()
    )
    OR EXISTS (
      SELECT 1 FROM depannages d
      WHERE d.id = rapport_materiaux.rapport_id
        AND d.employe_id = public.current_utilisateur_id()
    )
  );

CREATE POLICY "rapport_materiaux_update_own_or_admin"
  ON rapport_materiaux FOR UPDATE TO authenticated
  USING (
    public.is_admin()
    OR EXISTS (
      SELECT 1 FROM rapports r
      WHERE r.id = rapport_materiaux.rapport_id
        AND r.employe_id = public.current_utilisateur_id()
    )
    OR EXISTS (
      SELECT 1 FROM depannages d
      WHERE d.id = rapport_materiaux.rapport_id
        AND d.employe_id = public.current_utilisateur_id()
    )
  )
  WITH CHECK (
    public.is_admin()
    OR EXISTS (
      SELECT 1 FROM rapports r
      WHERE r.id = rapport_materiaux.rapport_id
        AND r.employe_id = public.current_utilisateur_id()
    )
    OR EXISTS (
      SELECT 1 FROM depannages d
      WHERE d.id = rapport_materiaux.rapport_id
        AND d.employe_id = public.current_utilisateur_id()
    )
  );

CREATE POLICY "rapport_materiaux_delete_own_or_admin"
  ON rapport_materiaux FOR DELETE TO authenticated
  USING (
    public.is_admin()
    OR EXISTS (
      SELECT 1 FROM rapports r
      WHERE r.id = rapport_materiaux.rapport_id
        AND r.employe_id = public.current_utilisateur_id()
    )
    OR EXISTS (
      SELECT 1 FROM depannages d
      WHERE d.id = rapport_materiaux.rapport_id
        AND d.employe_id = public.current_utilisateur_id()
    )
  );

-- 6) Vacances et periodes admin.
CREATE POLICY "vacances_select_own_or_admin"
  ON vacances FOR SELECT TO authenticated
  USING (public.is_admin() OR employe_id = public.current_utilisateur_id());

CREATE POLICY "vacances_insert_own_or_admin"
  ON vacances FOR INSERT TO authenticated
  WITH CHECK (public.is_admin() OR employe_id = public.current_utilisateur_id());

CREATE POLICY "vacances_update_own_or_admin"
  ON vacances FOR UPDATE TO authenticated
  USING (public.is_admin() OR employe_id = public.current_utilisateur_id())
  WITH CHECK (public.is_admin() OR employe_id = public.current_utilisateur_id());

CREATE POLICY "vacances_delete_admin"
  ON vacances FOR DELETE TO authenticated
  USING (public.is_admin());

CREATE POLICY "vacances_blocages_select_authenticated"
  ON vacances_blocages FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "vacances_blocages_admin_insert"
  ON vacances_blocages FOR INSERT TO authenticated
  WITH CHECK (public.is_admin());

CREATE POLICY "vacances_blocages_admin_update"
  ON vacances_blocages FOR UPDATE TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

CREATE POLICY "vacances_blocages_admin_delete"
  ON vacances_blocages FOR DELETE TO authenticated
  USING (public.is_admin());

-- 7) Signature et charte.
CREATE POLICY "signatures_select_own_or_admin"
  ON signatures FOR SELECT TO authenticated
  USING (public.is_admin() OR employe_id = public.current_utilisateur_id());

CREATE POLICY "signatures_insert_own_or_admin"
  ON signatures FOR INSERT TO authenticated
  WITH CHECK (public.is_admin() OR employe_id = public.current_utilisateur_id());

CREATE POLICY "signatures_update_own_or_admin"
  ON signatures FOR UPDATE TO authenticated
  USING (public.is_admin() OR employe_id = public.current_utilisateur_id())
  WITH CHECK (public.is_admin() OR employe_id = public.current_utilisateur_id());

CREATE POLICY "signatures_delete_admin"
  ON signatures FOR DELETE TO authenticated
  USING (public.is_admin());

CREATE POLICY "chartes_select_own_or_admin"
  ON chartes_acceptees FOR SELECT TO authenticated
  USING (public.is_admin() OR employe_id = public.current_utilisateur_id());

CREATE POLICY "chartes_insert_own_or_admin"
  ON chartes_acceptees FOR INSERT TO authenticated
  WITH CHECK (public.is_admin() OR employe_id = public.current_utilisateur_id());

CREATE POLICY "chartes_update_admin"
  ON chartes_acceptees FOR UPDATE TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

CREATE POLICY "chartes_delete_admin"
  ON chartes_acceptees FOR DELETE TO authenticated
  USING (public.is_admin());

-- 8) Table optionnelle existante sur certaines installations.
DO $$
DECLARE
  p record;
BEGIN
  IF to_regclass('public.absences') IS NOT NULL THEN
    ALTER TABLE absences ENABLE ROW LEVEL SECURITY;

    FOR p IN
      SELECT policyname
      FROM pg_policies
      WHERE schemaname = 'public'
        AND tablename = 'absences'
    LOOP
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.absences', p.policyname);
    END LOOP;

    EXECUTE 'CREATE POLICY "absences_select_own_or_admin"
      ON absences FOR SELECT TO authenticated
      USING (public.is_admin() OR employe_id = public.current_utilisateur_id())';

    EXECUTE 'CREATE POLICY "absences_insert_own_or_admin"
      ON absences FOR INSERT TO authenticated
      WITH CHECK (public.is_admin() OR employe_id = public.current_utilisateur_id())';

    EXECUTE 'CREATE POLICY "absences_update_own_or_admin"
      ON absences FOR UPDATE TO authenticated
      USING (public.is_admin() OR employe_id = public.current_utilisateur_id())
      WITH CHECK (public.is_admin() OR employe_id = public.current_utilisateur_id())';

    EXECUTE 'CREATE POLICY "absences_delete_admin"
      ON absences FOR DELETE TO authenticated
      USING (public.is_admin())';
  END IF;
END $$;

-- 9) RPC couverture vacances : retourne les absences simultanées sans exposer les données personnelles.
-- Utilisé par l'alerte couverture côté employé (remplace la requête directe bloquée par RLS).
CREATE OR REPLACE FUNCTION public.get_couverture_vacances(p_debut date, p_fin date)
RETURNS json
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_uid uuid := public.current_utilisateur_id();
  result json;
BEGIN
  SELECT json_build_object(
    'count', COUNT(*),
    'noms',  json_agg(u.prenom ORDER BY u.prenom)
  )
  INTO result
  FROM vacances v
  JOIN utilisateurs u ON u.id = v.employe_id
  WHERE v.employe_id <> current_uid
    AND v.statut IN ('en_attente', 'accepte')
    AND v.date_debut <= p_fin
    AND v.date_fin   >= p_debut;

  RETURN COALESCE(result, '{"count":0,"noms":null}'::json);
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_couverture_vacances(date, date) TO authenticated;
