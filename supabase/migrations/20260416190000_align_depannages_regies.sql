-- ============================================================
-- Migration : aligner depannages avec les regies
-- Additive uniquement : table regies si absente + lien nullable.
-- Aucun backfill force pour ne pas inventer de rattachement.
-- ============================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS public.regies (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nom            text NOT NULL,
  nom_normalise  text,
  actif          boolean NOT NULL DEFAULT true,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_regies_nom_normalise ON public.regies(nom_normalise);
CREATE INDEX IF NOT EXISTS idx_regies_actif ON public.regies(actif);

ALTER TABLE public.regies ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "regies_read_authenticated" ON public.regies;
CREATE POLICY "regies_read_authenticated"
  ON public.regies FOR SELECT TO authenticated
  USING (true);

CREATE OR REPLACE FUNCTION public.set_regies_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_regies_updated_at ON public.regies;
CREATE TRIGGER trg_regies_updated_at
  BEFORE UPDATE ON public.regies
  FOR EACH ROW
  EXECUTE FUNCTION public.set_regies_updated_at();

ALTER TABLE public.depannages
  ADD COLUMN IF NOT EXISTS regie_id uuid;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'depannages_regie_id_fkey'
      AND conrelid = 'public.depannages'::regclass
  ) THEN
    ALTER TABLE public.depannages
      ADD CONSTRAINT depannages_regie_id_fkey
      FOREIGN KEY (regie_id)
      REFERENCES public.regies(id)
      ON DELETE SET NULL
      NOT VALID;
  END IF;
END;
$$;

CREATE INDEX IF NOT EXISTS idx_depannages_regie_id ON public.depannages(regie_id);
