-- Rend sous_dossier_id nullable pour supporter les rapports V1 (sans sous-dossier).
-- Le trigger prevent_duplicate_chantier_rapport reste inchangé : quand sous_dossier_id
-- est NULL, la comparaison SQL (r.sous_dossier_id = NULL) est toujours fausse, donc
-- aucune vérification de doublon n'est appliquée aux rapports V1 — comportement voulu.

ALTER TABLE public.rapports ALTER COLUMN sous_dossier_id DROP NOT NULL;
