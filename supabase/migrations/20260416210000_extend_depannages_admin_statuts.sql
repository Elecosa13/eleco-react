-- ============================================================
-- Migration : statuts admin des depannages
-- Etend la contrainte du workflow sans changer de table.
-- ============================================================

ALTER TABLE public.depannages
  DROP CONSTRAINT IF EXISTS depannages_statut_metier_check;

ALTER TABLE public.depannages
  ADD CONSTRAINT depannages_statut_metier_check
  CHECK (statut IN (
    'Bon reçu',
    'À traiter',
    'Intervention faite',
    'Rapport reçu',
    'Facture à préparer',
    'Facture prête'
  ))
  NOT VALID;
