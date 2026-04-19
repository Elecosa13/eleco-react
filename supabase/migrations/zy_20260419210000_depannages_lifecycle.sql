-- ============================================================
-- Eleco SA - Cycle de vie dépannages : libérer + policy update + normalize fix
-- Date: 2026-04-19
--
-- Blocs :
-- 1) Fix normalize_eleco_text : ajout û et ü
-- 2) Backfill des lignes existantes avec û/ü
-- 3) RPC liberer_depannage(p_depannage_id uuid)
-- 4) Policy UPDATE depannages élargie à pris_par
--
-- A exécuter après zy_20260419200000_depannages_regies_assignment.sql
-- et avant zz_20260419193000_lockdown_existing_db.sql.
-- ============================================================

DO $$
BEGIN
  IF to_regprocedure('public.current_utilisateur_id()') IS NULL THEN
    RAISE EXCEPTION 'Fonction public.current_utilisateur_id() absente. Exécuter auth_rls_security.sql avant cette migration.';
  END IF;

  IF to_regprocedure('public.is_admin()') IS NULL THEN
    RAISE EXCEPTION 'Fonction public.is_admin() absente. Exécuter auth_rls_security.sql avant cette migration.';
  END IF;
END $$;

-- ------------------------------------------------------------
-- 1) Fix normalize_eleco_text : ajout û → u et ü → u
-- ------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.normalize_eleco_text(p_value text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT NULLIF(
    regexp_replace(
      replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(
      replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(
      replace(replace(
      lower(btrim(coalesce(p_value, ''))),
      'à', 'a'), 'á', 'a'), 'â', 'a'), 'ä', 'a'), 'ã', 'a'),
      'ç', 'c'),
      'è', 'e'), 'é', 'e'), 'ê', 'e'), 'ë', 'e'),
      'ì', 'i'), 'í', 'i'), 'î', 'i'), 'ï', 'i'),
      'ñ', 'n'),
      'ò', 'o'), 'ó', 'o'), 'ô', 'o'), 'ö', 'o'),
      'ù', 'u'), 'û', 'u'), 'ü', 'u'),
      '\s+',
      ' ',
      'g'
    ),
    ''
  )
$$;

-- normalize_regie_nom est un simple wrapper sur normalize_eleco_text :
-- la corriger en haut suffit, pas besoin de la recréer.

-- ------------------------------------------------------------
-- 2) Backfill des lignes existantes impactées par le fix û/ü
-- ------------------------------------------------------------

-- Régies : recalcule nom_normalise si le nom contient û ou ü.
UPDATE public.regies
SET nom_normalise = public.normalize_regie_nom(nom)
WHERE nom ~* '[ûü]';

-- Dépannages : recalcule adresse_normalisee si l'adresse contient û ou ü.
UPDATE public.depannages
SET adresse_normalisee = public.normalize_eleco_text(adresse)
WHERE adresse ~* '[ûü]';

-- ------------------------------------------------------------
-- 3) RPC liberer_depannage(p_depannage_id uuid)
--
-- Règles métier :
-- - l'admin peut libérer n'importe quel bon en cours
-- - l'employé ne peut libérer que le bon qu'il a lui-même pris
-- - ne fonctionne que sur statut = 'En cours'
-- - retourne NULL proprement si la condition n'est pas remplie
-- ------------------------------------------------------------

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
    pris_par  = NULL,
    pris_le   = NULL,
    libere_par = v_utilisateur_id,
    libere_le  = now(),
    statut     = 'À traiter'
  WHERE id = p_depannage_id
    AND statut = 'En cours'
    AND (
      public.is_admin()
      OR pris_par = v_utilisateur_id
    )
  RETURNING *
  INTO v_depannage;

  -- Retourne NULL si le bon n'était pas libérable par cet utilisateur.
  RETURN v_depannage;
END;
$$;

GRANT EXECUTE ON FUNCTION public.liberer_depannage(uuid) TO authenticated;

-- ------------------------------------------------------------
-- 4) Policy UPDATE depannages élargie à pris_par
--
-- Avant : seul employe_id ou admin pouvaient mettre à jour.
-- Après : pris_par (l'employé qui a pris le bon) peut aussi mettre à jour,
--         ce qui couvre les transitions de statut pendant le cycle En cours.
--
-- La libération reste gérée exclusivement par liberer_depannage() :
-- un UPDATE direct ne peut pas remettre pris_par à NULL car la WITH CHECK
-- exige que le nouveau pris_par soit encore l'utilisateur courant ou admin.
-- ------------------------------------------------------------

DROP POLICY IF EXISTS "depannages_update_own_or_admin" ON public.depannages;

CREATE POLICY "depannages_update_own_or_admin"
  ON public.depannages FOR UPDATE TO authenticated
  USING (
    public.is_admin()
    OR employe_id = public.current_utilisateur_id()
    OR pris_par   = public.current_utilisateur_id()
  )
  WITH CHECK (
    public.is_admin()
    OR employe_id = public.current_utilisateur_id()
    OR pris_par   = public.current_utilisateur_id()
  );
