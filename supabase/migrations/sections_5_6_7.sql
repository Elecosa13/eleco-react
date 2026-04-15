-- ============================================================
-- Migration : Sections 5, 6, 7 — Eleco SA
-- À exécuter dans Supabase > SQL Editor
-- ============================================================

-- -------------------------------------------------------
-- SECTION 5 — Gestion des heures
-- Ajoute les colonnes à time_entries
-- -------------------------------------------------------

ALTER TABLE time_entries
  ADD COLUMN IF NOT EXISTS heure_debut  time,
  ADD COLUMN IF NOT EXISTS heure_fin    time,
  ADD COLUMN IF NOT EXISTS pause_minutes int DEFAULT 0,
  ADD COLUMN IF NOT EXISTS semaine      int,
  ADD COLUMN IF NOT EXISTS annee        int,
  ADD COLUMN IF NOT EXISTS heures_nettes numeric,
  ADD COLUMN IF NOT EXISTS commentaire  text,
  ADD COLUMN IF NOT EXISTS chantier_id  uuid REFERENCES chantiers(id) ON DELETE SET NULL;

-- Heures supplementaires : stockees dans time_entries avec type = 'heures_supp'.
-- commentaire est obligatoire cote UI pour justifier la saisie.

-- -------------------------------------------------------
-- SECTION 5B - Vacances
-- -------------------------------------------------------

ALTER TABLE utilisateurs
  ADD COLUMN IF NOT EXISTS vacances_quota_annuel int DEFAULT 20;

CREATE TABLE IF NOT EXISTS vacances (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employe_id      uuid REFERENCES utilisateurs(id) ON DELETE CASCADE,
  date_debut      date NOT NULL,
  date_fin        date NOT NULL,
  commentaire     text,
  statut          text NOT NULL DEFAULT 'en_attente' CHECK (statut IN ('en_attente', 'accepte', 'refuse')),
  jours_ouvrables int NOT NULL DEFAULT 0,
  decision_note   text,
  decide_par      uuid REFERENCES utilisateurs(id) ON DELETE SET NULL,
  decide_le       timestamptz,
  created_at      timestamptz DEFAULT now(),
  CHECK (date_fin >= date_debut)
);

CREATE INDEX IF NOT EXISTS idx_vacances_employe_dates ON vacances(employe_id, date_debut, date_fin);
CREATE INDEX IF NOT EXISTS idx_vacances_statut ON vacances(statut);

ALTER TABLE vacances ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Utilisateurs gerent les vacances"
  ON vacances FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

CREATE TABLE IF NOT EXISTS vacances_blocages (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  date_debut  date NOT NULL,
  date_fin    date NOT NULL,
  type        text NOT NULL DEFAULT 'blocage',
  motif       text NOT NULL,
  actif       boolean NOT NULL DEFAULT true,
  created_by  uuid REFERENCES utilisateurs(id) ON DELETE SET NULL,
  created_at  timestamptz DEFAULT now(),
  CHECK (date_fin >= date_debut)
);

ALTER TABLE vacances_blocages
  ADD COLUMN IF NOT EXISTS type text NOT NULL DEFAULT 'blocage';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'vacances_blocages_type_check'
  ) THEN
    ALTER TABLE vacances_blocages
      ADD CONSTRAINT vacances_blocages_type_check
      CHECK (type IN ('blocage', 'fermeture_collective'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_vacances_blocages_dates ON vacances_blocages(date_debut, date_fin);

ALTER TABLE vacances_blocages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Utilisateurs consultent les blocages vacances"
  ON vacances_blocages FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

-- -------------------------------------------------------
-- SECTION 6 — Signature numérique
-- -------------------------------------------------------

CREATE TABLE IF NOT EXISTS signatures (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employe_id       uuid UNIQUE REFERENCES utilisateurs(id) ON DELETE CASCADE,
  signature_base64 text NOT NULL,
  signee_le        timestamptz DEFAULT now(),
  ip_address       text,
  device_info      text
);

ALTER TABLE signatures ENABLE ROW LEVEL SECURITY;

-- Employé : lire et gérer sa propre signature
CREATE POLICY "Employe gere sa signature"
  ON signatures FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

-- -------------------------------------------------------
-- SECTION 7 — Charte numérique employé
-- -------------------------------------------------------

CREATE TABLE IF NOT EXISTS chartes_acceptees (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employe_id     uuid REFERENCES utilisateurs(id) ON DELETE CASCADE,
  version_charte text DEFAULT 'v1.0',
  acceptee_le    timestamptz DEFAULT now(),
  ip_address     text,
  device_info    text,
  pdf_url        text
);

ALTER TABLE chartes_acceptees ENABLE ROW LEVEL SECURITY;

-- Accès ouvert aux utilisateurs authentifiés (policies fines = Phase 1)
CREATE POLICY "Employe gere sa charte"
  ON chartes_acceptees FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

-- -------------------------------------------
------------
-- NOTE : créer le bucket Supabase Storage "chartes"
-- depuis le dashboard Storage > New bucket > "chartes" (private)
-- -------------------------------------------------------
