-- ============================================================
-- Eleco SA - Verrouillage employe_id sur depannages
-- Date: 2026-04-28
--
-- Faille corrigee :
-- Un intervenant pouvait soumettre un UPDATE qui changeait
-- employe_id vers lui-meme, volant la propriete du depannage.
--
-- Correction :
-- Trigger BEFORE UPDATE qui bloque tout changement de employe_id
-- si la valeur actuelle est deja definie et que l'appelant
-- n'est pas admin.
--
-- Regles metier :
-- - admin : peut toujours modifier employe_id
-- - employe_id NULL -> peut etre defini (prise initiale)
-- - employe_id defini -> seul admin peut le changer
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

-- ------------------------------------------------------------
-- Fonction trigger : blocage du vol de propriete
-- ------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.guard_depannage_employe_id()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Laisser passer si employe_id n'est pas modifie.
  IF NEW.employe_id IS NOT DISTINCT FROM OLD.employe_id THEN
    RETURN NEW;
  END IF;

  -- Admin : toujours autorise.
  IF public.is_admin() THEN
    RETURN NEW;
  END IF;

  -- Non-admin : interdit de changer employe_id si deja defini.
  IF OLD.employe_id IS NOT NULL THEN
    RAISE EXCEPTION 'depannage_employe_id_locked'
      USING DETAIL = 'employe_id ne peut etre modifie que par un admin une fois defini.';
  END IF;

  -- employe_id etait NULL : la prise initiale est autorisee.
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.guard_depannage_employe_id()
  IS 'Bloque le changement de employe_id par un non-admin si la valeur est deja definie.';

-- ------------------------------------------------------------
-- Trigger sur depannages
-- ------------------------------------------------------------

DROP TRIGGER IF EXISTS trg_guard_depannage_employe_id ON public.depannages;

CREATE TRIGGER trg_guard_depannage_employe_id
  BEFORE UPDATE ON public.depannages
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_depannage_employe_id();

-- ------------------------------------------------------------
-- Verification disponible apres application
-- ------------------------------------------------------------
-- Tester le blocage (doit echouer pour un non-admin) :
-- UPDATE public.depannages SET employe_id = '<autre_uuid>' WHERE id = '<uuid_test>';
