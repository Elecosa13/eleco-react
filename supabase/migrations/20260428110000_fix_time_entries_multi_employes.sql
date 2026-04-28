-- ============================================================
-- Eleco SA - Correction time_entries multi-employes sur depannages
-- Date: 2026-04-28
--
-- Failles corrigees :
-- 1) upsert_linked_time_entry : SELECT sans filtre employe_id
--    → Bruno ecrasait les heures de Paulo
-- 2) prevent_duplicate_linked_time_entry : unicite sur (type, reference_id)
--    → bloquait le 2e INSERT au lieu d'autoriser une ligne par employe
-- 3) sync_depannage_duration : prenait la derniere valeur au lieu du SUM
--    → duree totale incorrecte avec plusieurs employes
-- 4) acces check depannage : bloquait les intervenants
--    → seul employe_id pouvait enregistrer des heures
--
-- Invariant apres correction :
-- 1 depannage + N employes = N lignes time_entries distinctes
-- duree depannages = somme de toutes les lignes
-- ============================================================

DO $$
BEGIN
  IF to_regprocedure('public.current_utilisateur_id()') IS NULL THEN
    RAISE EXCEPTION 'Fonction public.current_utilisateur_id() absente.';
  END IF;
  IF to_regprocedure('public.is_admin()') IS NULL THEN
    RAISE EXCEPTION 'Fonction public.is_admin() absente.';
  END IF;
END $$;

-- ------------------------------------------------------------
-- 1) Contrainte d'unicite par (type, reference_id, employe_id)
--
-- Remplace le modele 1-ligne-par-depannage par 1-ligne-par-employe.
-- Partial index uniquement sur les types lies (chantier, depannage).
-- ------------------------------------------------------------

CREATE UNIQUE INDEX IF NOT EXISTS uq_time_entries_linked_per_employe
  ON public.time_entries (type, reference_id, employe_id)
  WHERE type IN ('chantier', 'depannage');

-- ------------------------------------------------------------
-- 2) Trigger anti-doublon : unicite par (type, reference_id, employe_id)
--
-- Avant : bloquait tout 2e enregistrement pour le meme depannage
-- Apres : autorise une ligne par employe
-- ------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.prevent_duplicate_linked_time_entry()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.type IN ('chantier', 'depannage') AND NEW.reference_id IS NOT NULL THEN
    PERFORM pg_advisory_xact_lock(
      hashtextextended(
        'linked-time-entry:' || NEW.type || ':' || NEW.reference_id::text || ':' || NEW.employe_id::text,
        0
      )
    );

    IF EXISTS (
      SELECT 1
      FROM public.time_entries te
      WHERE te.type        = NEW.type
        AND te.reference_id = NEW.reference_id
        AND te.employe_id   = NEW.employe_id
        AND te.id <> COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::uuid)
    ) THEN
      RAISE EXCEPTION 'duplicate_linked_time_entry';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

-- ------------------------------------------------------------
-- 3) Trigger sync duree depannage : SUM de toutes les lignes
--
-- Avant : prenait la duree de la derniere ligne (ORDER BY created_at DESC LIMIT 1)
-- Apres : somme toutes les lignes pour ce depannage
-- ------------------------------------------------------------

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
    SELECT SUM(te.duree)
    FROM public.time_entries te
    WHERE te.type        = 'depannage'
      AND te.reference_id = v_reference_id
  ), 0)
  WHERE id = v_reference_id;

  RETURN COALESCE(NEW, OLD);
END;
$$;

-- ------------------------------------------------------------
-- 4) RPC upsert_linked_time_entry : corrigee
--
-- Changements :
-- a) SELECT filtre desormais par employe_id → chaque employe a sa propre ligne
-- b) Acces depannage elargi aux intervenants (depannage_intervenants + pris_par)
-- ------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.upsert_linked_time_entry(
  p_type         text,
  p_reference_id uuid,
  p_date_travail date,
  p_duree        numeric,
  p_chantier_id  uuid DEFAULT NULL,
  p_employe_id   uuid DEFAULT NULL
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
  v_is_admin        := public.is_admin();

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

  -- Verrou par (type, reference_id, employe_id) pour eviter la race condition.
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
      WHERE r.id         = p_reference_id
        AND r.deleted_at IS NULL
        AND (v_is_admin OR r.employe_id = v_target_employe_id)
    ) THEN
      RAISE EXCEPTION 'linked_rapport_not_found';
    END IF;

    IF NOT v_is_admin AND EXISTS (
      SELECT 1
      FROM public.rapports r
      WHERE r.id         = p_reference_id
        AND r.valide     = true
        AND r.deleted_at IS NULL
    ) THEN
      RAISE EXCEPTION 'locked_validated_report';
    END IF;
  END IF;

  IF p_type = 'depannage' THEN
    -- Acces autorise : admin, responsable (employe_id), preneur (pris_par), intervenants
    IF NOT EXISTS (
      SELECT 1
      FROM public.depannages d
      WHERE d.id = p_reference_id
        AND (
          v_is_admin
          OR d.employe_id = v_target_employe_id
          OR d.pris_par   = v_target_employe_id
          OR EXISTS (
            SELECT 1
            FROM public.depannage_intervenants di
            WHERE di.depannage_id = d.id
              AND di.employe_id   = v_target_employe_id
          )
        )
    ) THEN
      RAISE EXCEPTION 'linked_depannage_not_found';
    END IF;

    IF NOT v_is_admin AND EXISTS (
      SELECT 1
      FROM public.rapports r
      WHERE r.depannage_id = p_reference_id
        AND r.valide       = true
        AND r.deleted_at   IS NULL
    ) THEN
      RAISE EXCEPTION 'locked_validated_report';
    END IF;
  END IF;

  -- Recherche la ligne de CET employe uniquement.
  SELECT *
  INTO v_entry
  FROM public.time_entries te
  WHERE te.type        = p_type
    AND te.reference_id = p_reference_id
    AND te.employe_id   = v_target_employe_id;

  IF v_entry.id IS NOT NULL THEN
    UPDATE public.time_entries
    SET date_travail = p_date_travail,
        duree        = COALESCE(p_duree, 0),
        chantier_id  = p_chantier_id
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

-- ------------------------------------------------------------
-- 5) Recalcul de duree sur les depannages existants
--
-- Les lignes existantes ont ete creees avec le modele 1-par-depannage.
-- On recalcule le SUM maintenant pour rester coherent.
-- ------------------------------------------------------------

UPDATE public.depannages d
SET duree = COALESCE((
  SELECT SUM(te.duree)
  FROM public.time_entries te
  WHERE te.type        = 'depannage'
    AND te.reference_id = d.id
), 0)
WHERE EXISTS (
  SELECT 1
  FROM public.time_entries te
  WHERE te.type        = 'depannage'
    AND te.reference_id = d.id
);

-- ------------------------------------------------------------
-- Verification disponible apres application
-- ------------------------------------------------------------
-- Verifier l'index unique :
-- SELECT indexname FROM pg_indexes WHERE tablename = 'time_entries' AND indexname = 'uq_time_entries_linked_per_employe';
--
-- Verifier qu'il n'y a pas de doublons residuels :
-- SELECT type, reference_id, employe_id, count(*) FROM public.time_entries
--   WHERE type IN ('chantier','depannage') GROUP BY 1,2,3 HAVING count(*) > 1;
