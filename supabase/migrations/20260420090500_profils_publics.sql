CREATE OR REPLACE VIEW public.profils_publics AS
SELECT id, prenom, initiales
FROM public.utilisateurs
WHERE actif = true;

GRANT SELECT ON public.profils_publics TO authenticated;
