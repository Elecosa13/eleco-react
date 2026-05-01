-- Eleco SA - Catalogue articles/prix
-- Objectif:
-- - versionner localement la structure creee manuellement dans Supabase
-- - garder les prix accessibles aux admins uniquement
-- - exposer aux employes une vue sans prix
-- - preparer l'import du lot prix_claude_xls sans importer de donnees ici

CREATE EXTENSION IF NOT EXISTS pgcrypto;

DO $$
BEGIN
  IF to_regprocedure('public.is_admin()') IS NULL THEN
    RAISE EXCEPTION 'Fonction public.is_admin() absente. Executer auth_rls_security.sql avant cette migration.';
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.catalogue (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reference       text,
  nom             text NOT NULL,
  categorie       text,
  unite           text,
  prix_net        numeric(12, 2) NOT NULL DEFAULT 0,
  actif           boolean NOT NULL DEFAULT true,
  visible_employe boolean NOT NULL DEFAULT true,
  source_import   text,
  import_batch    text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.catalogue
  ADD COLUMN IF NOT EXISTS reference text,
  ADD COLUMN IF NOT EXISTS visible_employe boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS source_import text,
  ADD COLUMN IF NOT EXISTS import_batch text,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

ALTER TABLE public.catalogue
  ALTER COLUMN prix_net TYPE numeric(12, 2) USING round(prix_net::numeric, 2),
  ALTER COLUMN prix_net SET DEFAULT 0,
  ALTER COLUMN prix_net SET NOT NULL,
  ALTER COLUMN actif SET DEFAULT true,
  ALTER COLUMN actif SET NOT NULL,
  ALTER COLUMN visible_employe SET DEFAULT true,
  ALTER COLUMN visible_employe SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_catalogue_actif
  ON public.catalogue(actif);

CREATE INDEX IF NOT EXISTS idx_catalogue_categorie_nom
  ON public.catalogue(categorie, nom);

CREATE INDEX IF NOT EXISTS idx_catalogue_visible_employe
  ON public.catalogue(visible_employe)
  WHERE actif = true;

CREATE INDEX IF NOT EXISTS idx_catalogue_import_batch
  ON public.catalogue(import_batch)
  WHERE import_batch IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_catalogue_source_import
  ON public.catalogue(source_import)
  WHERE source_import IS NOT NULL;

COMMENT ON TABLE public.catalogue IS
  'Catalogue officiel Eleco des articles et prix. Les prix sont reserves aux admins; les employes passent par catalogue_employe.';

COMMENT ON COLUMN public.catalogue.reference IS
  'Reference fournisseur, CAN ou interne si elle existe explicitement dans la source. Rester NULL si aucune reference claire.';

COMMENT ON COLUMN public.catalogue.prix_net IS
  'Prix net admin, importe depuis P.U. et arrondi a 2 decimales.';

COMMENT ON COLUMN public.catalogue.visible_employe IS
  'Indique si l article peut apparaitre dans la vue catalogue_employe sans prix.';

COMMENT ON COLUMN public.catalogue.source_import IS
  'Nom de la source utilisee pour importer l article, par exemple prix_claude_xls.';

COMMENT ON COLUMN public.catalogue.import_batch IS
  'Identifiant de lot d import pour tracer et rollbacker une mise a jour catalogue.';

ALTER TABLE public.catalogue ENABLE ROW LEVEL SECURITY;

-- Supprimer l'ancienne lecture large si elle existe: elle exposerait prix_net.
DROP POLICY IF EXISTS "catalogue_read_authenticated" ON public.catalogue;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'catalogue'
      AND policyname = 'catalogue_read_admin'
  ) THEN
    CREATE POLICY "catalogue_read_admin"
      ON public.catalogue FOR SELECT TO authenticated
      USING (public.is_admin());
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'catalogue'
      AND policyname = 'catalogue_insert_admin'
  ) THEN
    CREATE POLICY "catalogue_insert_admin"
      ON public.catalogue FOR INSERT TO authenticated
      WITH CHECK (public.is_admin());
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'catalogue'
      AND policyname = 'catalogue_update_admin'
  ) THEN
    CREATE POLICY "catalogue_update_admin"
      ON public.catalogue FOR UPDATE TO authenticated
      USING (public.is_admin())
      WITH CHECK (public.is_admin());
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'catalogue'
      AND policyname = 'catalogue_delete_admin'
  ) THEN
    CREATE POLICY "catalogue_delete_admin"
      ON public.catalogue FOR DELETE TO authenticated
      USING (public.is_admin());
  END IF;
END $$;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.catalogue TO authenticated;

DROP VIEW IF EXISTS public.catalogue_employe;

CREATE VIEW public.catalogue_employe
WITH (security_invoker = false) AS
SELECT
  id,
  reference,
  categorie,
  nom,
  unite,
  actif
FROM public.catalogue
WHERE actif = true
  AND visible_employe = true;

GRANT SELECT ON public.catalogue_employe TO authenticated;

NOTIFY pgrst, 'reload schema';
