-- ============================================================
-- Eleco SA - Regies admin + prise en charge depannages
-- Date: 2026-04-19
--
-- Blocs:
-- 1) regies: creation/modification admin uniquement, lecture authentifiee
-- 2) depannages: champs de prise en charge et statuts etendus
-- 3) RPC atomique prendre_depannage(p_depannage_id uuid)
--
-- A executer apres auth_rls_security.sql.
-- ============================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

DO $$
BEGIN
  IF to_regprocedure('public.current_utilisateur_id()') IS NULL THEN
    RAISE EXCEPTION 'Fonction public.current_utilisateur_id() absente. Executer auth_rls_security.sql avant cette migration.';
  END IF;

  IF to_regprocedure('public.is_admin()') IS NULL THEN
    RAISE EXCEPTION 'Fonction public.is_admin() absente. Executer auth_rls_security.sql avant cette migration.';
  END IF;
END $$;

-- ------------------------------------------------------------
-- Normalisation simple et sans extension externe.
-- Utilisee pour regies.nom_normalise et depannages.adresse_normalisee.
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
      lower(btrim(coalesce(p_value, ''))),
      'à', 'a'), 'á', 'a'), 'â', 'a'), 'ä', 'a'), 'ã', 'a'),
      'ç', 'c'),
      'è', 'e'), 'é', 'e'), 'ê', 'e'), 'ë', 'e'),
      'ì', 'i'), 'í', 'i'), 'î', 'i'), 'ï', 'i'),
      'ñ', 'n'),
      'ò', 'o'), 'ó', 'o'), 'ô', 'o'), 'ö', 'o'),
      'ù', 'u'),
      '\s+',
      ' ',
      'g'
    ),
    ''
  )
$$;

CREATE OR REPLACE FUNCTION public.normalize_regie_nom(p_nom text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT public.normalize_eleco_text(p_nom)
$$;

-- ------------------------------------------------------------
-- Bloc 1 - Regies
-- ------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.regies (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nom            text NOT NULL,
  nom_normalise  text,
  actif          boolean NOT NULL DEFAULT true,
  created_by     uuid REFERENCES public.utilisateurs(id) ON DELETE SET NULL,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.regies
  ADD COLUMN IF NOT EXISTS nom_normalise text,
  ADD COLUMN IF NOT EXISTS actif boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES public.utilisateurs(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

UPDATE public.regies
SET nom = btrim(nom),
    nom_normalise = public.normalize_regie_nom(nom)
WHERE nom IS NOT NULL
  AND (
    nom <> btrim(nom)
    OR nom_normalise IS NULL
    OR btrim(nom_normalise) = ''
  );

CREATE INDEX IF NOT EXISTS idx_regies_nom_normalise ON public.regies(nom_normalise);
CREATE INDEX IF NOT EXISTS idx_regies_actif ON public.regies(actif);

CREATE OR REPLACE FUNCTION public.prepare_regie_fields()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.nom = btrim(NEW.nom);
  NEW.nom_normalise = public.normalize_regie_nom(NEW.nom);
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_regies_updated_at ON public.regies;
DROP TRIGGER IF EXISTS trg_regies_prepare_fields ON public.regies;
CREATE TRIGGER trg_regies_prepare_fields
  BEFORE INSERT OR UPDATE ON public.regies
  FOR EACH ROW
  EXECUTE FUNCTION public.prepare_regie_fields();

ALTER TABLE public.regies ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "regies_read_authenticated" ON public.regies;
DROP POLICY IF EXISTS "regies_insert_admin" ON public.regies;
DROP POLICY IF EXISTS "regies_update_admin" ON public.regies;
DROP POLICY IF EXISTS "regies_delete_none" ON public.regies;

CREATE POLICY "regies_read_authenticated"
  ON public.regies FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "regies_insert_admin"
  ON public.regies FOR INSERT TO authenticated
  WITH CHECK (public.is_admin());

CREATE POLICY "regies_update_admin"
  ON public.regies FOR UPDATE TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- Pas de suppression physique des regies: utiliser actif = false.
CREATE POLICY "regies_delete_none"
  ON public.regies FOR DELETE TO authenticated
  USING (false);

-- ------------------------------------------------------------
-- Bloc 2 - Depannages: champs de prise en charge
-- ------------------------------------------------------------

ALTER TABLE public.depannages
  ADD COLUMN IF NOT EXISTS statut text,
  ADD COLUMN IF NOT EXISTS pris_par uuid REFERENCES public.utilisateurs(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS pris_le timestamptz,
  ADD COLUMN IF NOT EXISTS libere_par uuid REFERENCES public.utilisateurs(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS libere_le timestamptz,
  ADD COLUMN IF NOT EXISTS adresse_normalisee text;

UPDATE public.depannages d
SET statut = COALESCE(
  NULLIF(btrim(d.statut), ''),
  CASE
    WHEN to_jsonb(d) ? 'status'
      AND to_jsonb(d)->>'status' IN (
        'Bon reçu',
        'À traiter',
        'En cours',
        'Intervention faite',
        'Rapport reçu',
        'Facture à préparer',
        'Facture prête',
        'Annulé'
      )
    THEN to_jsonb(d)->>'status'
    ELSE 'À traiter'
  END
)
WHERE d.statut IS NULL OR btrim(d.statut) = '';

UPDATE public.depannages
SET adresse_normalisee = public.normalize_eleco_text(adresse)
WHERE adresse IS NOT NULL
  AND (
    adresse_normalisee IS NULL
    OR btrim(adresse_normalisee) = ''
  );

ALTER TABLE public.depannages
  ALTER COLUMN statut SET DEFAULT 'À traiter',
  ALTER COLUMN statut SET NOT NULL;

ALTER TABLE public.depannages
  DROP CONSTRAINT IF EXISTS depannages_statut_metier_check;

ALTER TABLE public.depannages
  ADD CONSTRAINT depannages_statut_metier_check
  CHECK (statut IN (
    'Bon reçu',
    'À traiter',
    'En cours',
    'Intervention faite',
    'Rapport reçu',
    'Facture à préparer',
    'Facture prête',
    'Annulé'
  ))
  NOT VALID;

CREATE INDEX IF NOT EXISTS idx_depannages_statut ON public.depannages(statut);
CREATE INDEX IF NOT EXISTS idx_depannages_pris_par ON public.depannages(pris_par);
CREATE INDEX IF NOT EXISTS idx_depannages_adresse_normalisee ON public.depannages(adresse_normalisee);

CREATE OR REPLACE FUNCTION public.prepare_depannage_fields()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.adresse_normalisee = public.normalize_eleco_text(NEW.adresse);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_depannages_prepare_fields ON public.depannages;
CREATE TRIGGER trg_depannages_prepare_fields
  BEFORE INSERT OR UPDATE OF adresse ON public.depannages
  FOR EACH ROW
  EXECUTE FUNCTION public.prepare_depannage_fields();

ALTER TABLE public.depannages ENABLE ROW LEVEL SECURITY;

-- Nouvelle regle metier: tous les utilisateurs authentifies voient les bons,
-- meme ceux deja pris. Les actions restent controlees par RPC/policies.
DROP POLICY IF EXISTS "depannages_select_own_or_admin" ON public.depannages;
DROP POLICY IF EXISTS "depannages_select_authenticated" ON public.depannages;

CREATE POLICY "depannages_select_authenticated"
  ON public.depannages FOR SELECT TO authenticated
  USING (true);

-- ------------------------------------------------------------
-- Bloc 3 - RPC atomique de prise en charge
-- ------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.prendre_depannage(p_depannage_id uuid)
RETURNS public.depannages
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_utilisateur_id uuid;
  v_depannage public.depannages;
BEGIN
  v_utilisateur_id := public.current_utilisateur_id();

  IF v_utilisateur_id IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  UPDATE public.depannages
  SET
    pris_par = v_utilisateur_id,
    pris_le = now(),
    libere_par = NULL,
    libere_le = NULL,
    statut = 'En cours'
  WHERE id = p_depannage_id
    AND pris_par IS NULL
    AND statut = 'À traiter'
  RETURNING *
  INTO v_depannage;

  -- Si deja pris ou plus disponible, retourne NULL proprement.
  RETURN v_depannage;
END;
$$;

GRANT EXECUTE ON FUNCTION public.prendre_depannage(uuid) TO authenticated;

-- Fonctions futures a ajouter ensuite si besoin:
-- - public.liberer_depannage(p_depannage_id uuid): admin uniquement, remet pris_par/pris_le a NULL et statut a 'À traiter'
-- - public.reassigner_depannage(p_depannage_id uuid, p_employe_id uuid): admin uniquement, change pris_par/pris_le et statut 'En cours'
