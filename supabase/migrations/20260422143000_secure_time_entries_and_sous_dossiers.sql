-- Verrouille les heures liees aux rapports/depannages sur une source unique
-- (time_entries), empeche les doublons, et bloque la suppression dangereuse
-- de sous-dossiers contenant des rapports.

ALTER TABLE public.rapports
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz DEFAULT NULL;

UPDATE public.time_entries te
SET chantier_id = sd.chantier_id
FROM public.rapports r
JOIN public.sous_dossiers sd ON sd.id = r.sous_dossier_id
WHERE te.type = 'chantier'
  AND te.reference_id = r.id
  AND te.chantier_id IS NULL;

INSERT INTO public.time_entries (
  employe_id,
  date_travail,
  type,
  reference_id,
  duree,
  chantier_id
)
SELECT
  d.employe_id,
  d.date_travail,
  'depannage',
  d.id,
  COALESCE(d.duree, 0),
  d.chantier_id
FROM public.depannages d
WHERE d.employe_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM public.time_entries te
    WHERE te.type = 'depannage'
      AND te.reference_id = d.id
  );

UPDATE public.time_entries te
SET chantier_id = d.chantier_id
FROM public.depannages d
WHERE te.type = 'depannage'
  AND te.reference_id = d.id
  AND te.chantier_id IS NULL;

CREATE OR REPLACE FUNCTION public.sync_depannage_duration_from_time_entry()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_reference_id uuid;
BEGIN
  v_reference_id := COALESCE(NEW.reference_id, OLD.reference_id);

  IF v_reference_id IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  UPDATE public.depannages
  SET duree = COALESCE((
    SELECT te.duree
    FROM public.time_entries te
    WHERE te.type = 'depannage'
      AND te.reference_id = v_reference_id
    ORDER BY te.created_at DESC
    LIMIT 1
  ), 0)
  WHERE id = v_reference_id;

  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_depannage_duration_from_time_entry_insupd ON public.time_entries;
CREATE TRIGGER trg_sync_depannage_duration_from_time_entry_insupd
AFTER INSERT OR UPDATE ON public.time_entries
FOR EACH ROW
WHEN (NEW.type = 'depannage')
EXECUTE FUNCTION public.sync_depannage_duration_from_time_entry();

DROP TRIGGER IF EXISTS trg_sync_depannage_duration_from_time_entry_delete ON public.time_entries;
CREATE TRIGGER trg_sync_depannage_duration_from_time_entry_delete
AFTER DELETE ON public.time_entries
FOR EACH ROW
WHEN (OLD.type = 'depannage')
EXECUTE FUNCTION public.sync_depannage_duration_from_time_entry();

CREATE OR REPLACE FUNCTION public.prevent_duplicate_linked_time_entry()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.type IN ('chantier', 'depannage') AND NEW.reference_id IS NOT NULL THEN
    PERFORM pg_advisory_xact_lock(
      hashtextextended('linked-time-entry:' || NEW.type || ':' || NEW.reference_id::text, 0)
    );

    IF EXISTS (
      SELECT 1
      FROM public.time_entries te
      WHERE te.type = NEW.type
        AND te.reference_id = NEW.reference_id
        AND te.id <> COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::uuid)
    ) THEN
      RAISE EXCEPTION 'duplicate_linked_time_entry';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_duplicate_linked_time_entry ON public.time_entries;
CREATE TRIGGER trg_prevent_duplicate_linked_time_entry
BEFORE INSERT OR UPDATE ON public.time_entries
FOR EACH ROW
EXECUTE FUNCTION public.prevent_duplicate_linked_time_entry();

CREATE OR REPLACE FUNCTION public.prevent_duplicate_chantier_rapport()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.depannage_id IS NULL AND NEW.deleted_at IS NULL THEN
    PERFORM pg_advisory_xact_lock(
      hashtextextended(
        'chantier-rapport:' || NEW.employe_id::text || ':' || NEW.sous_dossier_id::text || ':' || NEW.date_travail::text,
        0
      )
    );

    IF EXISTS (
      SELECT 1
      FROM public.rapports r
      WHERE r.employe_id = NEW.employe_id
        AND r.sous_dossier_id = NEW.sous_dossier_id
        AND r.date_travail = NEW.date_travail
        AND r.depannage_id IS NULL
        AND r.deleted_at IS NULL
        AND r.id <> COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::uuid)
    ) THEN
      RAISE EXCEPTION 'duplicate_chantier_rapport';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_duplicate_chantier_rapport ON public.rapports;
CREATE TRIGGER trg_prevent_duplicate_chantier_rapport
BEFORE INSERT OR UPDATE ON public.rapports
FOR EACH ROW
EXECUTE FUNCTION public.prevent_duplicate_chantier_rapport();

CREATE OR REPLACE FUNCTION public.prevent_delete_sous_dossier_with_rapports()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.rapports
    WHERE sous_dossier_id = OLD.id
  ) THEN
    RAISE EXCEPTION 'sous_dossier_has_rapports';
  END IF;

  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_delete_sous_dossier_with_rapports ON public.sous_dossiers;
CREATE TRIGGER trg_prevent_delete_sous_dossier_with_rapports
BEFORE DELETE ON public.sous_dossiers
FOR EACH ROW
EXECUTE FUNCTION public.prevent_delete_sous_dossier_with_rapports();

CREATE OR REPLACE FUNCTION public.upsert_linked_time_entry(
  p_type text,
  p_reference_id uuid,
  p_date_travail date,
  p_duree numeric,
  p_chantier_id uuid DEFAULT NULL,
  p_employe_id uuid DEFAULT NULL
)
RETURNS public.time_entries
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_current_user_id uuid;
  v_target_employe_id uuid;
  v_is_admin boolean;
  v_entry public.time_entries;
BEGIN
  v_current_user_id := public.current_utilisateur_id();
  v_is_admin := public.is_admin();

  IF v_current_user_id IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  IF p_type NOT IN ('chantier', 'depannage') THEN
    RAISE EXCEPTION 'invalid_linked_time_entry_type';
  END IF;

  IF p_reference_id IS NULL THEN
    RAISE EXCEPTION 'linked_time_entry_reference_required';
  END IF;

  IF p_date_travail IS NULL THEN
    RAISE EXCEPTION 'linked_time_entry_date_required';
  END IF;

  IF COALESCE(p_duree, 0) < 0 THEN
    RAISE EXCEPTION 'linked_time_entry_duree_invalid';
  END IF;

  v_target_employe_id := COALESCE(p_employe_id, v_current_user_id);

  IF NOT v_is_admin AND v_target_employe_id <> v_current_user_id THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  PERFORM pg_advisory_xact_lock(
    hashtextextended('linked-time-entry:' || p_type || ':' || p_reference_id::text, 0)
  );

  IF p_type = 'chantier' THEN
    IF NOT EXISTS (
      SELECT 1
      FROM public.rapports r
      WHERE r.id = p_reference_id
        AND r.deleted_at IS NULL
        AND (v_is_admin OR r.employe_id = v_target_employe_id)
    ) THEN
      RAISE EXCEPTION 'linked_rapport_not_found';
    END IF;

    IF NOT v_is_admin AND EXISTS (
      SELECT 1
      FROM public.rapports r
      WHERE r.id = p_reference_id
        AND r.valide = true
        AND r.deleted_at IS NULL
    ) THEN
      RAISE EXCEPTION 'locked_validated_report';
    END IF;
  END IF;

  IF p_type = 'depannage' THEN
    IF NOT EXISTS (
      SELECT 1
      FROM public.depannages d
      WHERE d.id = p_reference_id
        AND (v_is_admin OR d.employe_id = v_target_employe_id)
    ) THEN
      RAISE EXCEPTION 'linked_depannage_not_found';
    END IF;

    IF NOT v_is_admin AND EXISTS (
      SELECT 1
      FROM public.rapports r
      WHERE r.depannage_id = p_reference_id
        AND r.valide = true
        AND r.deleted_at IS NULL
    ) THEN
      RAISE EXCEPTION 'locked_validated_report';
    END IF;
  END IF;

  SELECT *
  INTO v_entry
  FROM public.time_entries te
  WHERE te.type = p_type
    AND te.reference_id = p_reference_id
  LIMIT 1;

  IF v_entry.id IS NOT NULL THEN
    UPDATE public.time_entries
    SET employe_id = v_target_employe_id,
        date_travail = p_date_travail,
        duree = COALESCE(p_duree, 0),
        chantier_id = p_chantier_id
    WHERE id = v_entry.id
    RETURNING * INTO v_entry;
  ELSE
    INSERT INTO public.time_entries (
      employe_id,
      date_travail,
      type,
      reference_id,
      duree,
      chantier_id
    )
    VALUES (
      v_target_employe_id,
      p_date_travail,
      p_type,
      p_reference_id,
      COALESCE(p_duree, 0),
      p_chantier_id
    )
    RETURNING * INTO v_entry;
  END IF;

  RETURN v_entry;
END;
$$;

GRANT EXECUTE ON FUNCTION public.upsert_linked_time_entry(text, uuid, date, numeric, uuid, uuid) TO authenticated;

DROP POLICY IF EXISTS "rapports_update_own_or_admin" ON public.rapports;
CREATE POLICY "rapports_update_own_or_admin"
  ON public.rapports FOR UPDATE TO authenticated
  USING (
    public.is_admin()
    OR (
      employe_id = public.current_utilisateur_id()
      AND valide = false
      AND deleted_at IS NULL
    )
  )
  WITH CHECK (
    public.is_admin()
    OR (
      employe_id = public.current_utilisateur_id()
      AND valide = false
      AND deleted_at IS NULL
    )
  );

DROP POLICY IF EXISTS "time_entries_insert_own_or_admin" ON public.time_entries;
CREATE POLICY "time_entries_insert_own_or_admin"
  ON public.time_entries FOR INSERT TO authenticated
  WITH CHECK (
    public.is_admin()
    OR (
      employe_id = public.current_utilisateur_id()
      AND type NOT IN ('chantier', 'depannage')
    )
  );

DROP POLICY IF EXISTS "time_entries_update_own_or_admin" ON public.time_entries;
CREATE POLICY "time_entries_update_own_or_admin"
  ON public.time_entries FOR UPDATE TO authenticated
  USING (
    public.is_admin()
    OR (
      employe_id = public.current_utilisateur_id()
      AND type NOT IN ('chantier', 'depannage')
    )
  )
  WITH CHECK (
    public.is_admin()
    OR (
      employe_id = public.current_utilisateur_id()
      AND type NOT IN ('chantier', 'depannage')
    )
  );

DROP POLICY IF EXISTS "time_entries_delete_own_or_admin" ON public.time_entries;
CREATE POLICY "time_entries_delete_own_or_admin"
  ON public.time_entries FOR DELETE TO authenticated
  USING (
    public.is_admin()
    OR (
      employe_id = public.current_utilisateur_id()
      AND type NOT IN ('chantier', 'depannage')
    )
  );
