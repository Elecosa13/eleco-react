-- Eleco SA - Preparation import catalogue Excel V1
-- Objectif:
-- - enrichir public.catalogue pour importer proprement la nouvelle liste materiel
-- - garder les prix et donnees sensibles reserves aux admins
-- - exposer aux employes uniquement la vue public.catalogue_employe sans prix

ALTER TABLE public.catalogue
  ADD COLUMN IF NOT EXISTS reference text,
  ADD COLUMN IF NOT EXISTS visible_employe boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS source_import text,
  ADD COLUMN IF NOT EXISTS import_batch text;

CREATE INDEX IF NOT EXISTS idx_catalogue_visible_employe
  ON public.catalogue(visible_employe)
  WHERE actif = true;

CREATE INDEX IF NOT EXISTS idx_catalogue_import_batch
  ON public.catalogue(import_batch)
  WHERE import_batch IS NOT NULL;

COMMENT ON COLUMN public.catalogue.reference IS
  'Reference fournisseur, CAN ou interne importee depuis une source catalogue.';

COMMENT ON COLUMN public.catalogue.visible_employe IS
  'Indique si l article peut apparaitre dans la vue catalogue_employe sans prix.';

COMMENT ON COLUMN public.catalogue.source_import IS
  'Nom ou type de source utilisee pour importer l article, par exemple prix_claude_xls.';

COMMENT ON COLUMN public.catalogue.import_batch IS
  'Identifiant de lot d import pour tracer et rollbacker une mise a jour catalogue.';

DROP VIEW IF EXISTS public.catalogue_employe;

CREATE VIEW public.catalogue_employe
WITH (security_invoker = false) AS
SELECT
  id,
  categorie,
  nom,
  unite,
  actif
FROM public.catalogue
WHERE actif = true
  AND visible_employe = true;

GRANT SELECT ON public.catalogue_employe TO authenticated;

NOTIFY pgrst, 'reload schema';
