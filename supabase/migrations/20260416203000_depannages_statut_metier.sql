-- ============================================================
-- Migration : statut metier des depannages
-- Dossier unique, pilotage de visibilite par statut.
-- ============================================================

ALTER TABLE public.depannages
  ADD COLUMN IF NOT EXISTS statut text;

ALTER TABLE public.depannages
  ALTER COLUMN statut SET DEFAULT 'À traiter';

UPDATE public.depannages
SET statut = 'À traiter'
WHERE statut IS NULL OR btrim(statut) = '';

ALTER TABLE public.depannages
  ALTER COLUMN statut SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'depannages_statut_metier_check'
      AND conrelid = 'public.depannages'::regclass
  ) THEN
    ALTER TABLE public.depannages
      ADD CONSTRAINT depannages_statut_metier_check
      CHECK (statut IN ('Bon reçu', 'À traiter', 'Intervention faite', 'Rapport reçu'))
      NOT VALID;
  END IF;
END;
$$;

CREATE INDEX IF NOT EXISTS idx_depannages_statut ON public.depannages(statut);
