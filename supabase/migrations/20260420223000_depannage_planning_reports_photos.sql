-- ============================================================
-- Eleco SA - Depannages: planification, rapports classes, photos terrain
-- Date: 2026-04-20
--
-- Blocs:
-- 1) Colonnes de planification / chantier sur depannages
-- 2) Lien rapport <-> depannage
-- 3) Table rapport_photos + bucket Storage prive
-- 4) RPC metier: prendre sans date, planifier, demarrer, dossier depannage
-- 5) Elargissement liberer_depannage() aux statuts Pris / Planifie
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

ALTER TABLE public.depannages
  ADD COLUMN IF NOT EXISTS chantier_id uuid REFERENCES public.chantiers(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS date_planifiee date,
  ADD COLUMN IF NOT EXISTS heure_planifiee time,
  ADD COLUMN IF NOT EXISTS rapport_envoye_le timestamptz;

CREATE INDEX IF NOT EXISTS idx_depannages_chantier_id
  ON public.depannages(chantier_id);

CREATE INDEX IF NOT EXISTS idx_depannages_date_planifiee
  ON public.depannages(date_planifiee, heure_planifiee);

ALTER TABLE public.depannages
  DROP CONSTRAINT IF EXISTS depannages_statut_metier_check;

ALTER TABLE public.depannages
  ADD CONSTRAINT depannages_statut_metier_check
  CHECK (statut IN (
    'Bon reçu',
    'À traiter',
    'Pris',
    'Planifié',
    'En cours',
    'Intervention faite',
    'Rapport reçu',
    'Facture à préparer',
    'Facture prête',
    'Annulé'
  ))
  NOT VALID;

ALTER TABLE public.rapports
  ADD COLUMN IF NOT EXISTS depannage_id uuid REFERENCES public.depannages(id) ON DELETE SET NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_rapports_depannage_id_unique
  ON public.rapports(depannage_id)
  WHERE depannage_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.rapport_photos (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rapport_id       uuid NOT NULL REFERENCES public.rapports(id) ON DELETE CASCADE,
  depannage_id     uuid REFERENCES public.depannages(id) ON DELETE SET NULL,
  chantier_id      uuid REFERENCES public.chantiers(id) ON DELETE SET NULL,
  sous_dossier_id  uuid REFERENCES public.sous_dossiers(id) ON DELETE SET NULL,
  storage_bucket   text NOT NULL DEFAULT 'rapport-photos',
  storage_path     text NOT NULL,
  file_name        text NOT NULL,
  mime_type        text,
  size_bytes       bigint,
  created_by       uuid REFERENCES public.utilisateurs(id) ON DELETE SET NULL,
  created_at       timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT rapport_photos_storage_path_unique UNIQUE (storage_path)
);

CREATE INDEX IF NOT EXISTS idx_rapport_photos_rapport_id
  ON public.rapport_photos(rapport_id);

CREATE INDEX IF NOT EXISTS idx_rapport_photos_depannage_id
  ON public.rapport_photos(depannage_id);

CREATE INDEX IF NOT EXISTS idx_rapport_photos_sous_dossier_id
  ON public.rapport_photos(sous_dossier_id);

ALTER TABLE public.rapport_photos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "rapport_photos_select_own_or_admin" ON public.rapport_photos;
CREATE POLICY "rapport_photos_select_own_or_admin"
  ON public.rapport_photos FOR SELECT TO authenticated
  USING (
    public.is_admin()
    OR created_by = public.current_utilisateur_id()
    OR EXISTS (
      SELECT 1
      FROM public.rapports r
      WHERE r.id = rapport_photos.rapport_id
        AND r.employe_id = public.current_utilisateur_id()
    )
  );

DROP POLICY IF EXISTS "rapport_photos_insert_own_or_admin" ON public.rapport_photos;
CREATE POLICY "rapport_photos_insert_own_or_admin"
  ON public.rapport_photos FOR INSERT TO authenticated
  WITH CHECK (
    public.is_admin()
    OR created_by = public.current_utilisateur_id()
    OR EXISTS (
      SELECT 1
      FROM public.rapports r
      WHERE r.id = rapport_photos.rapport_id
        AND r.employe_id = public.current_utilisateur_id()
    )
  );

DROP POLICY IF EXISTS "rapport_photos_update_own_or_admin" ON public.rapport_photos;
CREATE POLICY "rapport_photos_update_own_or_admin"
  ON public.rapport_photos FOR UPDATE TO authenticated
  USING (
    public.is_admin()
    OR created_by = public.current_utilisateur_id()
  )
  WITH CHECK (
    public.is_admin()
    OR created_by = public.current_utilisateur_id()
  );

DROP POLICY IF EXISTS "rapport_photos_delete_own_or_admin" ON public.rapport_photos;
CREATE POLICY "rapport_photos_delete_own_or_admin"
  ON public.rapport_photos FOR DELETE TO authenticated
  USING (
    public.is_admin()
    OR created_by = public.current_utilisateur_id()
  );

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'rapport-photos',
  'rapport-photos',
  false,
  10485760,
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']
)
ON CONFLICT (id) DO UPDATE
SET public = EXCLUDED.public,
    file_size_limit = EXCLUDED.file_size_limit,
    allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "rapport_photos_bucket_select" ON storage.objects;
CREATE POLICY "rapport_photos_bucket_select"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'rapport-photos');

DROP POLICY IF EXISTS "rapport_photos_bucket_insert" ON storage.objects;
CREATE POLICY "rapport_photos_bucket_insert"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'rapport-photos');

DROP POLICY IF EXISTS "rapport_photos_bucket_update" ON storage.objects;
CREATE POLICY "rapport_photos_bucket_update"
  ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'rapport-photos')
  WITH CHECK (bucket_id = 'rapport-photos');

DROP POLICY IF EXISTS "rapport_photos_bucket_delete" ON storage.objects;
CREATE POLICY "rapport_photos_bucket_delete"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'rapport-photos');

CREATE OR REPLACE FUNCTION public.ensure_depannage_sous_dossier(p_chantier_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sous_dossier_id uuid;
BEGIN
  IF p_chantier_id IS NULL THEN
    RAISE EXCEPTION 'chantier_required';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('depannages:' || p_chantier_id::text, 0));

  SELECT id
  INTO v_sous_dossier_id
  FROM public.sous_dossiers
  WHERE chantier_id = p_chantier_id
    AND nom = 'Dépannages'
  ORDER BY created_at ASC
  LIMIT 1;

  IF v_sous_dossier_id IS NULL THEN
    INSERT INTO public.sous_dossiers (chantier_id, nom)
    VALUES (p_chantier_id, 'Dépannages')
    RETURNING id INTO v_sous_dossier_id;
  END IF;

  RETURN v_sous_dossier_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.ensure_depannage_sous_dossier(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.prendre_depannage_sans_date(p_depannage_id uuid)
RETURNS public.depannages
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_utilisateur_id uuid;
  v_depannage      public.depannages;
BEGIN
  v_utilisateur_id := public.current_utilisateur_id();

  IF v_utilisateur_id IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  UPDATE public.depannages
  SET
    pris_par        = v_utilisateur_id,
    pris_le         = now(),
    libere_par      = NULL,
    libere_le       = NULL,
    date_planifiee  = NULL,
    heure_planifiee = NULL,
    statut          = 'Pris'
  WHERE id       = p_depannage_id
    AND pris_par IS NULL
    AND statut   = 'À traiter'
  RETURNING *
  INTO v_depannage;

  IF v_depannage.id IS NOT NULL THEN
    INSERT INTO public.depannage_intervenants(depannage_id, employe_id)
    VALUES (p_depannage_id, v_utilisateur_id)
    ON CONFLICT (depannage_id, employe_id) DO NOTHING;
  END IF;

  RETURN v_depannage;
END;
$$;

GRANT EXECUTE ON FUNCTION public.prendre_depannage_sans_date(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.planifier_depannage(
  p_depannage_id uuid,
  p_date date,
  p_heure time DEFAULT NULL
)
RETURNS public.depannages
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_utilisateur_id uuid;
  v_depannage      public.depannages;
BEGIN
  v_utilisateur_id := public.current_utilisateur_id();

  IF v_utilisateur_id IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  IF p_date IS NULL THEN
    RAISE EXCEPTION 'planning_date_required';
  END IF;

  UPDATE public.depannages
  SET
    pris_par        = v_utilisateur_id,
    pris_le         = COALESCE(pris_le, now()),
    libere_par      = NULL,
    libere_le       = NULL,
    date_planifiee  = p_date,
    heure_planifiee = p_heure,
    date_travail    = p_date,
    statut          = 'Planifié'
  WHERE id = p_depannage_id
    AND (
      (pris_par IS NULL AND statut = 'À traiter')
      OR (pris_par = v_utilisateur_id AND statut IN ('Pris', 'Planifié'))
    )
  RETURNING *
  INTO v_depannage;

  IF v_depannage.id IS NOT NULL THEN
    INSERT INTO public.depannage_intervenants(depannage_id, employe_id)
    VALUES (p_depannage_id, v_utilisateur_id)
    ON CONFLICT (depannage_id, employe_id) DO NOTHING;
  END IF;

  RETURN v_depannage;
END;
$$;

GRANT EXECUTE ON FUNCTION public.planifier_depannage(uuid, date, time) TO authenticated;

CREATE OR REPLACE FUNCTION public.demarrer_depannage(p_depannage_id uuid)
RETURNS public.depannages
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_utilisateur_id uuid;
  v_depannage      public.depannages;
BEGIN
  v_utilisateur_id := public.current_utilisateur_id();

  IF v_utilisateur_id IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  UPDATE public.depannages
  SET statut = 'En cours'
  WHERE id = p_depannage_id
    AND (
      public.is_admin()
      OR pris_par = v_utilisateur_id
    )
    AND statut IN ('Pris', 'Planifié')
  RETURNING *
  INTO v_depannage;

  IF v_depannage.id IS NOT NULL THEN
    INSERT INTO public.depannage_intervenants(depannage_id, employe_id)
    VALUES (p_depannage_id, COALESCE(v_depannage.pris_par, v_utilisateur_id))
    ON CONFLICT (depannage_id, employe_id) DO NOTHING;
  END IF;

  RETURN v_depannage;
END;
$$;

GRANT EXECUTE ON FUNCTION public.demarrer_depannage(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.liberer_depannage(p_depannage_id uuid)
RETURNS public.depannages
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_utilisateur_id uuid;
  v_depannage      public.depannages;
BEGIN
  v_utilisateur_id := public.current_utilisateur_id();

  IF v_utilisateur_id IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  UPDATE public.depannages
  SET
    pris_par        = NULL,
    pris_le         = NULL,
    libere_par      = v_utilisateur_id,
    libere_le       = now(),
    date_planifiee  = NULL,
    heure_planifiee = NULL,
    statut          = 'À traiter'
  WHERE id = p_depannage_id
    AND statut IN ('Pris', 'Planifié', 'En cours')
    AND (
      public.is_admin()
      OR pris_par = v_utilisateur_id
    )
  RETURNING *
  INTO v_depannage;

  IF v_depannage.id IS NOT NULL THEN
    DELETE FROM public.depannage_intervenants
    WHERE depannage_id = p_depannage_id;
  END IF;

  RETURN v_depannage;
END;
$$;

GRANT EXECUTE ON FUNCTION public.liberer_depannage(uuid) TO authenticated;
