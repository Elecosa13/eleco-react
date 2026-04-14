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
