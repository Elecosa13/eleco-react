-- Correctif : vue catalogue_employe + reload schema cache PostgREST
-- Problème : PostgREST ne connaît pas la vue créée dans la migration précédente,
-- et security_invoker non explicite peut causer des comportements variables en PG15.

-- 1. Reload immédiat du schema cache PostgREST
NOTIFY pgrst, 'reload schema';

-- 2. Recréer la vue explicitement avec security_invoker = false
--    (= security definer : la vue s'exécute avec les droits du propriétaire = postgres = BYPASSRLS)
--    Garantit que les employés lisent les lignes même si RLS catalogue bloque non-admins.
DROP VIEW IF EXISTS public.catalogue_employe;

CREATE VIEW public.catalogue_employe
WITH (security_invoker = false) AS
SELECT id, categorie, nom, unite, actif
FROM public.catalogue
WHERE actif = true;

-- 3. Grant explicite à authenticated (les nouvelles vues n'héritent pas des GRANT globaux)
GRANT SELECT ON public.catalogue_employe TO authenticated;

-- 4. Reload schema cache une seconde fois après création
NOTIFY pgrst, 'reload schema';
