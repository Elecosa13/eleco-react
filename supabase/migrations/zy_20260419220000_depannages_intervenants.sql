-- ============================================================
-- Eleco SA - Multi-intervenants sur dépannages
-- Date: 2026-04-19
--
-- Blocs :
-- 1) Table depannage_intervenants + index + RLS
-- 2) prendre_depannage() : insère le preneur dans la table
-- 3) RPC rejoindre_depannage(p_depannage_id uuid)
-- 4) RPC quitter_depannage(p_depannage_id uuid)
-- 5) liberer_depannage() : vide la table à la libération
-- 6) Policy UPDATE depannages élargie aux intervenants
--
-- time_entries : pas de modification nécessaire.
-- La policy existante (employe_id = current_utilisateur_id()) permet
-- déjà à chaque intervenant de saisir ses propres heures.
--
-- A exécuter après zy_20260419210000_depannages_lifecycle.sql
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
-- 1) Table depannage_intervenants
--
-- Chaque ligne représente un employé actuellement impliqué sur un bon.
-- La table est vidée lors de liberer_depannage().
-- pris_le = moment où l'employé a rejoint le bon (pas forcément pris_par).
-- ------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.depannage_intervenants (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  depannage_id  uuid        NOT NULL REFERENCES public.depannages(id) ON DELETE CASCADE,
  employe_id    uuid        NOT NULL REFERENCES public.utilisateurs(id) ON DELETE CASCADE,
  pris_le       timestamptz NOT NULL DEFAULT now(),
  created_at    timestamptz NOT NULL DEFAULT now(),

  UNIQUE (depannage_id, employe_id)
);

CREATE INDEX IF NOT EXISTS idx_depannage_intervenants_depannage
  ON public.depannage_intervenants(depannage_id);

CREATE INDEX IF NOT EXISTS idx_depannage_intervenants_employe
  ON public.depannage_intervenants(employe_id);

ALTER TABLE public.depannage_intervenants ENABLE ROW LEVEL SECURITY;

-- Tous les authentifiés voient les intervenants (cohérent avec SELECT sur depannages).
DROP POLICY IF EXISTS "di_select_authenticated" ON public.depannage_intervenants;
CREATE POLICY "di_select_authenticated"
  ON public.depannage_intervenants FOR SELECT TO authenticated
  USING (true);

-- Un employé ne peut s'inscrire que lui-même ; l'admin peut inscrire n'importe qui.
DROP POLICY IF EXISTS "di_insert_own_or_admin" ON public.depannage_intervenants;
CREATE POLICY "di_insert_own_or_admin"
  ON public.depannage_intervenants FOR INSERT TO authenticated
  WITH CHECK (
    public.is_admin()
    OR employe_id = public.current_utilisateur_id()
  );

-- Un employé ne peut se retirer que lui-même ; l'admin peut retirer n'importe qui.
DROP POLICY IF EXISTS "di_delete_own_or_admin" ON public.depannage_intervenants;
CREATE POLICY "di_delete_own_or_admin"
  ON public.depannage_intervenants FOR DELETE TO authenticated
  USING (
    public.is_admin()
    OR employe_id = public.current_utilisateur_id()
  );

-- Pas d'UPDATE direct : on supprime/reinsère si besoin.
DROP POLICY IF EXISTS "di_update_none" ON public.depannage_intervenants;
CREATE POLICY "di_update_none"
  ON public.depannage_intervenants FOR UPDATE TO authenticated
  USING (false);

-- ------------------------------------------------------------
-- 2) prendre_depannage() : ajoute le preneur dans depannage_intervenants
-- ------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.prendre_depannage(p_depannage_id uuid)
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
    pris_par   = v_utilisateur_id,
    pris_le    = now(),
    libere_par = NULL,
    libere_le  = NULL,
    statut     = 'En cours'
  WHERE id       = p_depannage_id
    AND pris_par IS NULL
    AND statut   = 'À traiter'
  RETURNING *
  INTO v_depannage;

  -- Si le bon a bien été pris, enregistrer l'intervenant.
  IF v_depannage.id IS NOT NULL THEN
    INSERT INTO public.depannage_intervenants(depannage_id, employe_id)
    VALUES (p_depannage_id, v_utilisateur_id)
    ON CONFLICT (depannage_id, employe_id) DO NOTHING;
  END IF;

  RETURN v_depannage;
END;
$$;

GRANT EXECUTE ON FUNCTION public.prendre_depannage(uuid) TO authenticated;

-- ------------------------------------------------------------
-- 3) RPC rejoindre_depannage(p_depannage_id uuid)
--
-- Règles métier :
-- - le bon doit être En cours
-- - idempotent via ON CONFLICT DO NOTHING
-- - retourne la ligne depannage_intervenants insérée, ou NULL si déjà membre
-- ------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.rejoindre_depannage(p_depannage_id uuid)
RETURNS public.depannage_intervenants
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_utilisateur_id   uuid;
  v_statut           text;
  v_intervenant      public.depannage_intervenants;
BEGIN
  v_utilisateur_id := public.current_utilisateur_id();

  IF v_utilisateur_id IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  SELECT statut INTO v_statut
  FROM public.depannages
  WHERE id = p_depannage_id;

  IF v_statut IS NULL THEN
    RAISE EXCEPTION 'depannage_not_found';
  END IF;

  IF v_statut <> 'En cours' THEN
    RAISE EXCEPTION 'depannage_not_en_cours';
  END IF;

  INSERT INTO public.depannage_intervenants(depannage_id, employe_id)
  VALUES (p_depannage_id, v_utilisateur_id)
  ON CONFLICT (depannage_id, employe_id) DO NOTHING
  RETURNING *
  INTO v_intervenant;

  -- Retourne NULL si l'employé était déjà inscrit (ON CONFLICT).
  RETURN v_intervenant;
END;
$$;

GRANT EXECUTE ON FUNCTION public.rejoindre_depannage(uuid) TO authenticated;

-- ------------------------------------------------------------
-- 4) RPC quitter_depannage(p_depannage_id uuid)
--
-- Règles métier :
-- - retire uniquement l'intervenant courant de la table
-- - ne modifie PAS le statut du bon ni pris_par
-- - si l'employé n'était pas inscrit, retourne false proprement
-- ------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.quitter_depannage(p_depannage_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_utilisateur_id uuid;
  v_deleted        int;
BEGIN
  v_utilisateur_id := public.current_utilisateur_id();

  IF v_utilisateur_id IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  WITH del AS (
    DELETE FROM public.depannage_intervenants
    WHERE depannage_id = p_depannage_id
      AND employe_id   = v_utilisateur_id
    RETURNING id
  )
  SELECT count(*) INTO v_deleted FROM del;

  RETURN v_deleted > 0;
END;
$$;

GRANT EXECUTE ON FUNCTION public.quitter_depannage(uuid) TO authenticated;

-- ------------------------------------------------------------
-- 5) liberer_depannage() : vide la table à la libération
--
-- Remplace la version de zy_20260419210000_depannages_lifecycle.sql.
-- Seul ajout : DELETE FROM depannage_intervenants après le UPDATE.
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
    pris_par   = NULL,
    pris_le    = NULL,
    libere_par = v_utilisateur_id,
    libere_le  = now(),
    statut     = 'À traiter'
  WHERE id     = p_depannage_id
    AND statut = 'En cours'
    AND (
      public.is_admin()
      OR pris_par = v_utilisateur_id
    )
  RETURNING *
  INTO v_depannage;

  -- Nettoie la table uniquement si la libération a eu lieu.
  IF v_depannage.id IS NOT NULL THEN
    DELETE FROM public.depannage_intervenants
    WHERE depannage_id = p_depannage_id;
  END IF;

  RETURN v_depannage;
END;
$$;

GRANT EXECUTE ON FUNCTION public.liberer_depannage(uuid) TO authenticated;

-- ------------------------------------------------------------
-- 6) Policy UPDATE depannages élargie aux intervenants
--
-- Avant : is_admin() OR employe_id OR pris_par
-- Après : + tout employé présent dans depannage_intervenants
--
-- Permet aux intervenants de faire évoluer le statut du bon
-- (ex. : 'En cours' → 'Intervention faite') sans être is_admin() ni pris_par.
-- ------------------------------------------------------------

DROP POLICY IF EXISTS "depannages_update_own_or_admin" ON public.depannages;

CREATE POLICY "depannages_update_own_or_admin"
  ON public.depannages FOR UPDATE TO authenticated
  USING (
    public.is_admin()
    OR employe_id = public.current_utilisateur_id()
    OR pris_par   = public.current_utilisateur_id()
    OR EXISTS (
      SELECT 1 FROM public.depannage_intervenants di
      WHERE di.depannage_id = id
        AND di.employe_id   = public.current_utilisateur_id()
    )
  )
  WITH CHECK (
    public.is_admin()
    OR employe_id = public.current_utilisateur_id()
    OR pris_par   = public.current_utilisateur_id()
    OR EXISTS (
      SELECT 1 FROM public.depannage_intervenants di
      WHERE di.depannage_id = id
        AND di.employe_id   = public.current_utilisateur_id()
    )
  );
