-- ============================================================
-- Migration : Regies pour depannages - Eleco SA
-- Additive uniquement : nouvelle table + lien nullable
-- ============================================================

CREATE TABLE IF NOT EXISTS regies (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nom            text NOT NULL,
  nom_normalise  text,
  actif          boolean NOT NULL DEFAULT true,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_regies_nom_normalise ON regies(nom_normalise);
CREATE INDEX IF NOT EXISTS idx_regies_actif ON regies(actif);

ALTER TABLE regies ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "regies_read_authenticated" ON regies;
CREATE POLICY "regies_read_authenticated"
  ON regies FOR SELECT TO authenticated
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

DROP TRIGGER IF EXISTS trg_regies_updated_at ON regies;
CREATE TRIGGER trg_regies_updated_at
  BEFORE UPDATE ON regies
  FOR EACH ROW
  EXECUTE FUNCTION public.set_regies_updated_at();

ALTER TABLE depannages
  ADD COLUMN IF NOT EXISTS regie_id uuid REFERENCES regies(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_depannages_regie_id ON depannages(regie_id);

INSERT INTO regies (nom, nom_normalise)
SELECT U&'Non assign\00E9e', 'non assignee'
WHERE NOT EXISTS (
  SELECT 1
  FROM regies
  WHERE nom_normalise = 'non assignee'
);

UPDATE depannages
SET regie_id = (
  SELECT id
  FROM regies
  WHERE nom_normalise = 'non assignee'
  ORDER BY created_at
  LIMIT 1
)
WHERE regie_id IS NULL;
