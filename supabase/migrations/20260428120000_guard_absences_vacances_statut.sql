-- Eleco SA - Verrou statuts absences/vacances
-- Empeche tout non-admin de modifier le statut d'une demande.
-- Garde les flux existants : creation employe OK, modifications non critiques selon RLS OK.

DO $$
BEGIN
  IF to_regprocedure('public.is_admin()') IS NULL THEN
    RAISE EXCEPTION 'Fonction public.is_admin() absente.';
  END IF;
END
$$;

CREATE OR REPLACE FUNCTION public.guard_vacances_statut()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF OLD.statut IS DISTINCT FROM NEW.statut
     AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'vacances_statut_admin_only';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_vacances_statut ON public.vacances;

CREATE TRIGGER trg_guard_vacances_statut
  BEFORE UPDATE OF statut ON public.vacances
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_vacances_statut();

CREATE OR REPLACE FUNCTION public.guard_absences_statut()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF OLD.statut IS DISTINCT FROM NEW.statut
     AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'absences_statut_admin_only';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_absences_statut ON public.absences;

CREATE TRIGGER trg_guard_absences_statut
  BEFORE UPDATE OF statut ON public.absences
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_absences_statut();
