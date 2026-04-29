-- Migration: restrict catalogue to admins, expose price-free view to employees
-- Date: 2026-04-29

-- 1. Drop the permissive read policy that exposes prices to all authenticated users
DROP POLICY IF EXISTS "catalogue_read_authenticated" ON public.catalogue;

-- 2. Create admin-only SELECT policy on catalogue
CREATE POLICY "catalogue_read_admin"
  ON public.catalogue FOR SELECT TO authenticated
  USING (public.is_admin());

-- 3. Create a price-free view for employee use
--    Owned by postgres (bypasses RLS), exposes only safe columns.
CREATE OR REPLACE VIEW public.catalogue_employe AS
SELECT id, categorie, nom, unite, actif
FROM public.catalogue
WHERE actif = true;

-- 4. Grant read access to authenticated users on the view
GRANT SELECT ON public.catalogue_employe TO authenticated;
