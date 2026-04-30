-- Eleco SA - Restaure la RPC appelee par la creation de depannage.
-- A appliquer apres backup production.
--
-- Constat:
-- - Le frontend actuel appelle public.upsert_linked_time_entry.
-- - La production peut ne pas exposer cette RPC dans le schema cache PostgREST.
-- - public.upsert_linked_tier n'est pas appelee par le code actuel et ne fait pas
--   partie du modele depannage.

DO $$
BEGIN
  IF to_regprocedure('public.current_utilisateur_id()') IS NULL THEN
    RAISE EXCEPTION 'Fonction public.current_utilisateur_id() absente.';
  END IF;
  IF to_regprocedure('public.is_admin()') IS NULL THEN
    RAISE EXCEPTION 'Fonction public.is_admin() absente.';
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.upsert_linked_time_entry(
  p_type          text,
  p_reference_id  uuid,
  p_date_travail  date,
  p_duree         numeric,
  p_chantier_id   uuid DEFAULT NULL,
  p_employe_id    uuid DEFAULT NULL
)
RETURNS public.time_entries
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_current_user_id   uuid;
  v_target_employe_id uuid;
  v_is_admin          boolean;
  v_entry             public.time_entries;
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
    hashtextextended(
      'linked-time-entry:' || p_type || ':' || p_reference_id::text || ':' || v_target_employe_id::text,
      0
    )
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
        AND (
          v_is_admin
          OR d.employe_id = v_target_employe_id
          OR d.pris_par = v_target_employe_id
          OR EXISTS (
            SELECT 1
            FROM public.depannage_intervenants di
            WHERE di.depannage_id = d.id
              AND di.employe_id = v_target_employe_id
          )
        )
    ) THEN
      RAISE EXCEPTION 'linked_depannage_not_found';
    END IF;

    IF NOT v_is_admin AND EXISTS (
      SELECT 1
      FROM public.rapports r
      WHERE r.depannage_id = p_reference_id
        AND r.employe_id = v_target_employe_id
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
    AND te.employe_id = v_target_employe_id;

  IF v_entry.id IS NOT NULL THEN
    UPDATE public.time_entries
    SET date_travail = p_date_travail,
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
