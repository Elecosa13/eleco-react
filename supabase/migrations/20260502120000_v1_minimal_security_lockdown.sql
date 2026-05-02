-- Eleco SA - V1 internal minimal security lockdown
-- Scope:
-- - keep current employee/admin flows working
-- - remove broad authenticated reads on sensitive business tables
-- - keep catalogue prices admin-only; employees use catalogue_employe
-- - protect legacy clear-text password column if it still exists

DO $$
BEGIN
  IF to_regprocedure('public.current_utilisateur_id()') IS NULL THEN
    RAISE EXCEPTION 'Missing function public.current_utilisateur_id(). Apply auth_rls_security.sql first.';
  END IF;

  IF to_regprocedure('public.is_admin()') IS NULL THEN
    RAISE EXCEPTION 'Missing function public.is_admin(). Apply auth_rls_security.sql first.';
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- RLS must be active on every V1 sensitive table.
-- ---------------------------------------------------------------------------

ALTER TABLE public.utilisateurs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.depannages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.absences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.time_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rapports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rapport_materiaux ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.catalogue ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF to_regclass('public.depannage_materiaux') IS NOT NULL THEN
    ALTER TABLE public.depannage_materiaux ENABLE ROW LEVEL SECURITY;
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- utilisateurs: row access stays own-or-admin, but legacy password columns must
-- not be selectable through the frontend role if production still has them.
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS "utilisateurs_select_own_or_admin" ON public.utilisateurs;
DROP POLICY IF EXISTS "utilisateurs_admin_insert" ON public.utilisateurs;
DROP POLICY IF EXISTS "utilisateurs_admin_update" ON public.utilisateurs;
DROP POLICY IF EXISTS "utilisateurs_admin_delete" ON public.utilisateurs;

CREATE POLICY "utilisateurs_select_own_or_admin"
  ON public.utilisateurs FOR SELECT TO authenticated
  USING (
    public.is_admin()
    OR auth_user_id = auth.uid()
    OR (auth_user_id IS NULL AND lower(email) = lower(auth.email()))
  );

CREATE POLICY "utilisateurs_admin_insert"
  ON public.utilisateurs FOR INSERT TO authenticated
  WITH CHECK (public.is_admin());

CREATE POLICY "utilisateurs_admin_update"
  ON public.utilisateurs FOR UPDATE TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

CREATE POLICY "utilisateurs_admin_delete"
  ON public.utilisateurs FOR DELETE TO authenticated
  USING (public.is_admin());

DO $$
DECLARE
  safe_columns text;
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'utilisateurs'
      AND column_name IN ('mot_de_passe', 'password', 'mdp')
  ) THEN
    SELECT string_agg(format('%I', column_name), ', ' ORDER BY ordinal_position)
    INTO safe_columns
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'utilisateurs'
      AND column_name NOT IN ('mot_de_passe', 'password', 'mdp');

    REVOKE SELECT ON public.utilisateurs FROM anon, authenticated;
    EXECUTE format('GRANT SELECT (%s) ON public.utilisateurs TO authenticated', safe_columns);
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- catalogue: employees must never read catalogue.prix_net. They read only the
-- security-definer view below, which intentionally omits price columns.
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS "catalogue_read_authenticated" ON public.catalogue;
DROP POLICY IF EXISTS "catalogue_read_admin" ON public.catalogue;
DROP POLICY IF EXISTS "catalogue_admin_write" ON public.catalogue;
DROP POLICY IF EXISTS "catalogue_insert_admin" ON public.catalogue;
DROP POLICY IF EXISTS "catalogue_update_admin" ON public.catalogue;
DROP POLICY IF EXISTS "catalogue_delete_admin" ON public.catalogue;

CREATE POLICY "catalogue_read_admin"
  ON public.catalogue FOR SELECT TO authenticated
  USING (public.is_admin());

CREATE POLICY "catalogue_insert_admin"
  ON public.catalogue FOR INSERT TO authenticated
  WITH CHECK (public.is_admin());

CREATE POLICY "catalogue_update_admin"
  ON public.catalogue FOR UPDATE TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

CREATE POLICY "catalogue_delete_admin"
  ON public.catalogue FOR DELETE TO authenticated
  USING (public.is_admin());

GRANT SELECT, INSERT, UPDATE, DELETE ON public.catalogue TO authenticated;

DROP VIEW IF EXISTS public.catalogue_employe;

CREATE VIEW public.catalogue_employe
WITH (security_invoker = false) AS
SELECT
  id,
  reference,
  categorie,
  nom,
  unite,
  actif
FROM public.catalogue
WHERE actif = true
  AND COALESCE(visible_employe, true) = true;

GRANT SELECT ON public.catalogue_employe TO authenticated;

-- ---------------------------------------------------------------------------
-- depannages: remove broad authenticated SELECT, but keep the field flow:
-- - admins see all
-- - linked employees see their records, including after report/facturation
-- - employees see open/non-final bons so they can take or join interventions
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS "depannages_select_authenticated" ON public.depannages;
DROP POLICY IF EXISTS "depannages_select_own_or_admin" ON public.depannages;
DROP POLICY IF EXISTS "depannages_insert_own_or_admin" ON public.depannages;
DROP POLICY IF EXISTS "depannages_insert_employe_or_admin" ON public.depannages;
DROP POLICY IF EXISTS "depannages_update_own_or_admin" ON public.depannages;
DROP POLICY IF EXISTS "depannages_delete_own_or_admin" ON public.depannages;

CREATE POLICY "depannages_select_v1"
  ON public.depannages FOR SELECT TO authenticated
  USING (
    public.is_admin()
    OR employe_id = public.current_utilisateur_id()
    OR pris_par = public.current_utilisateur_id()
    OR EXISTS (
      SELECT 1
      FROM public.depannage_intervenants di
      WHERE di.depannage_id = depannages.id
        AND di.employe_id = public.current_utilisateur_id()
    )
    OR COALESCE(statut, 'A traiter') IN (
      'Bon recu',
      'A traiter',
      'Pris',
      'Planifie',
      'En cours',
      'Intervention faite',
      'Bon reçu',
      'À traiter',
      'Planifié'
    )
  );

CREATE POLICY "depannages_insert_v1"
  ON public.depannages FOR INSERT TO authenticated
  WITH CHECK (
    public.is_admin()
    OR (
      employe_id = public.current_utilisateur_id()
      AND public.current_utilisateur_id() IS NOT NULL
    )
  );

CREATE POLICY "depannages_update_v1"
  ON public.depannages FOR UPDATE TO authenticated
  USING (
    public.is_admin()
    OR employe_id = public.current_utilisateur_id()
    OR pris_par = public.current_utilisateur_id()
    OR EXISTS (
      SELECT 1
      FROM public.depannage_intervenants di
      WHERE di.depannage_id = depannages.id
        AND di.employe_id = public.current_utilisateur_id()
    )
  )
  WITH CHECK (
    public.is_admin()
    OR employe_id = public.current_utilisateur_id()
    OR pris_par = public.current_utilisateur_id()
    OR EXISTS (
      SELECT 1
      FROM public.depannage_intervenants di
      WHERE di.depannage_id = depannages.id
        AND di.employe_id = public.current_utilisateur_id()
    )
  );

CREATE POLICY "depannages_delete_admin"
  ON public.depannages FOR DELETE TO authenticated
  USING (public.is_admin());

CREATE OR REPLACE FUNCTION public.guard_depannage_v1_employee_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF public.is_admin() THEN
    RETURN NEW;
  END IF;

  IF OLD.employe_id IS DISTINCT FROM NEW.employe_id THEN
    RAISE EXCEPTION 'depannage_employe_id_locked';
  END IF;

  IF NEW.statut IN ('Facture a preparer', 'Facture prete', 'Annule', 'Facture à préparer', 'Facture prête', 'Annulé')
     AND OLD.statut IS DISTINCT FROM NEW.statut THEN
    RAISE EXCEPTION 'depannage_admin_status_required';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_depannage_v1_employee_update ON public.depannages;
CREATE TRIGGER trg_guard_depannage_v1_employee_update
  BEFORE UPDATE ON public.depannages
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_depannage_v1_employee_update();

-- ---------------------------------------------------------------------------
-- rapports and time_entries: employees are limited to their own rows; admins
-- retain operational access.
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS "rapports_select_own_or_admin" ON public.rapports;
DROP POLICY IF EXISTS "rapports_insert_own_or_admin" ON public.rapports;
DROP POLICY IF EXISTS "rapports_update_own_or_admin" ON public.rapports;
DROP POLICY IF EXISTS "rapports_delete_own_or_admin" ON public.rapports;

CREATE POLICY "rapports_select_own_or_admin"
  ON public.rapports FOR SELECT TO authenticated
  USING (public.is_admin() OR employe_id = public.current_utilisateur_id());

CREATE POLICY "rapports_insert_own_or_admin"
  ON public.rapports FOR INSERT TO authenticated
  WITH CHECK (public.is_admin() OR employe_id = public.current_utilisateur_id());

CREATE POLICY "rapports_update_own_or_admin"
  ON public.rapports FOR UPDATE TO authenticated
  USING (public.is_admin() OR employe_id = public.current_utilisateur_id())
  WITH CHECK (public.is_admin() OR employe_id = public.current_utilisateur_id());

CREATE POLICY "rapports_delete_admin"
  ON public.rapports FOR DELETE TO authenticated
  USING (public.is_admin());

DROP POLICY IF EXISTS "time_entries_select_own_or_admin" ON public.time_entries;
DROP POLICY IF EXISTS "time_entries_insert_own_or_admin" ON public.time_entries;
DROP POLICY IF EXISTS "time_entries_update_own_or_admin" ON public.time_entries;
DROP POLICY IF EXISTS "time_entries_delete_own_or_admin" ON public.time_entries;

CREATE POLICY "time_entries_select_own_or_admin"
  ON public.time_entries FOR SELECT TO authenticated
  USING (public.is_admin() OR employe_id = public.current_utilisateur_id());

CREATE POLICY "time_entries_insert_own_or_admin"
  ON public.time_entries FOR INSERT TO authenticated
  WITH CHECK (public.is_admin() OR employe_id = public.current_utilisateur_id());

CREATE POLICY "time_entries_update_own_or_admin"
  ON public.time_entries FOR UPDATE TO authenticated
  USING (public.is_admin() OR employe_id = public.current_utilisateur_id())
  WITH CHECK (public.is_admin() OR employe_id = public.current_utilisateur_id());

CREATE POLICY "time_entries_delete_admin"
  ON public.time_entries FOR DELETE TO authenticated
  USING (public.is_admin());

-- ---------------------------------------------------------------------------
-- rapport_materiaux: keep employee report creation/editing possible for their
-- own reports; admins keep full access.
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS "rapport_materiaux_select_own_or_admin" ON public.rapport_materiaux;
DROP POLICY IF EXISTS "rapport_materiaux_insert_own_or_admin" ON public.rapport_materiaux;
DROP POLICY IF EXISTS "rapport_materiaux_update_own_or_admin" ON public.rapport_materiaux;
DROP POLICY IF EXISTS "rapport_materiaux_delete_own_or_admin" ON public.rapport_materiaux;

CREATE POLICY "rapport_materiaux_select_own_or_admin"
  ON public.rapport_materiaux FOR SELECT TO authenticated
  USING (
    public.is_admin()
    OR EXISTS (
      SELECT 1
      FROM public.rapports r
      WHERE r.id = rapport_materiaux.rapport_id
        AND r.employe_id = public.current_utilisateur_id()
        AND r.deleted_at IS NULL
    )
  );

CREATE POLICY "rapport_materiaux_insert_own_or_admin"
  ON public.rapport_materiaux FOR INSERT TO authenticated
  WITH CHECK (
    public.is_admin()
    OR EXISTS (
      SELECT 1
      FROM public.rapports r
      WHERE r.id = rapport_materiaux.rapport_id
        AND r.employe_id = public.current_utilisateur_id()
        AND r.deleted_at IS NULL
    )
  );

CREATE POLICY "rapport_materiaux_update_own_or_admin"
  ON public.rapport_materiaux FOR UPDATE TO authenticated
  USING (
    public.is_admin()
    OR EXISTS (
      SELECT 1
      FROM public.rapports r
      WHERE r.id = rapport_materiaux.rapport_id
        AND r.employe_id = public.current_utilisateur_id()
        AND r.deleted_at IS NULL
        AND r.valide = false
    )
  )
  WITH CHECK (
    public.is_admin()
    OR EXISTS (
      SELECT 1
      FROM public.rapports r
      WHERE r.id = rapport_materiaux.rapport_id
        AND r.employe_id = public.current_utilisateur_id()
        AND r.deleted_at IS NULL
        AND r.valide = false
    )
  );

CREATE POLICY "rapport_materiaux_delete_own_or_admin"
  ON public.rapport_materiaux FOR DELETE TO authenticated
  USING (
    public.is_admin()
    OR EXISTS (
      SELECT 1
      FROM public.rapports r
      WHERE r.id = rapport_materiaux.rapport_id
        AND r.employe_id = public.current_utilisateur_id()
        AND r.deleted_at IS NULL
        AND r.valide = false
    )
  );

-- ---------------------------------------------------------------------------
-- depannage_materiaux exists in newer V1 deployments. Keep shared material
-- editing possible only for admins or employees linked to the depannage.
-- ---------------------------------------------------------------------------

DO $$
BEGIN
  IF to_regclass('public.depannage_materiaux') IS NULL THEN
    RETURN;
  END IF;

  DROP POLICY IF EXISTS "depannage_materiaux_select_intervenant_or_admin" ON public.depannage_materiaux;
  DROP POLICY IF EXISTS "depannage_materiaux_insert_intervenant_or_admin" ON public.depannage_materiaux;
  DROP POLICY IF EXISTS "depannage_materiaux_update_admin_only" ON public.depannage_materiaux;
  DROP POLICY IF EXISTS "depannage_materiaux_delete_admin_only" ON public.depannage_materiaux;
  DROP POLICY IF EXISTS "depannage_materiaux_delete_intervenant_or_admin" ON public.depannage_materiaux;

  CREATE POLICY "depannage_materiaux_select_intervenant_or_admin"
    ON public.depannage_materiaux FOR SELECT TO authenticated
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

  CREATE POLICY "depannage_materiaux_update_intervenant_or_admin"
    ON public.depannage_materiaux FOR UPDATE TO authenticated
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
    )
    WITH CHECK (
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
END $$;

-- ---------------------------------------------------------------------------
-- absences: employees manage only their own pending rows; admins decide.
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS "Acces temporaire absences" ON public.absences;
DROP POLICY IF EXISTS "absences_select_own_or_admin" ON public.absences;
DROP POLICY IF EXISTS "absences_insert_own_or_admin" ON public.absences;
DROP POLICY IF EXISTS "absences_update_own_or_admin" ON public.absences;
DROP POLICY IF EXISTS "absences_delete_admin" ON public.absences;

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
    )
  );

CREATE POLICY "absences_delete_admin"
  ON public.absences FOR DELETE TO authenticated
  USING (public.is_admin());

NOTIFY pgrst, 'reload schema';
