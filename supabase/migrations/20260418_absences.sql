-- Migration : table absences (maladie / accident / autre)
-- À exécuter dans Supabase SQL Editor
-- Les politiques RLS définitives sont dans auth_rls_security.sql (à appliquer en dernier)

CREATE TABLE IF NOT EXISTS absences (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employe_id      uuid REFERENCES utilisateurs(id) ON DELETE CASCADE,
  type            text NOT NULL DEFAULT 'maladie' CHECK (type IN ('maladie', 'accident', 'autre')),
  date_debut      date NOT NULL,
  date_fin        date NOT NULL,
  commentaire     text,
  statut          text NOT NULL DEFAULT 'en_attente' CHECK (statut IN ('en_attente', 'approuve', 'refuse')),
  decide_par      uuid REFERENCES utilisateurs(id) ON DELETE SET NULL,
  decide_le       timestamptz,
  created_at      timestamptz DEFAULT now(),
  CHECK (date_fin >= date_debut)
);

-- Correction si la table existait déjà sans ces colonnes (migration partielle)
ALTER TABLE absences ADD COLUMN IF NOT EXISTS statut     text NOT NULL DEFAULT 'en_attente';
ALTER TABLE absences ADD COLUMN IF NOT EXISTS decide_par uuid REFERENCES utilisateurs(id) ON DELETE SET NULL;
ALTER TABLE absences ADD COLUMN IF NOT EXISTS decide_le  timestamptz;
ALTER TABLE absences ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now();

-- Contrainte CHECK sur statut (idempotent via nom explicite)
DO $$ BEGIN
  ALTER TABLE absences ADD CONSTRAINT absences_statut_check
    CHECK (statut IN ('en_attente', 'approuve', 'refuse'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS idx_absences_employe ON absences(employe_id, date_debut);
CREATE INDEX IF NOT EXISTS idx_absences_statut ON absences(statut);

ALTER TABLE absences ENABLE ROW LEVEL SECURITY;

-- Politique temporaire permissive (sera remplacée par auth_rls_security.sql en production)
CREATE POLICY "Acces temporaire absences"
  ON absences FOR ALL TO authenticated
  USING (true) WITH CHECK (true);
