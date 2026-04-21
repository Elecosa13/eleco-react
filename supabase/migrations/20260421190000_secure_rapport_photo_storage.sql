-- ============================================================
-- Eleco SA - Verrouillage fin du bucket rapport-photos
-- Date: 2026-04-21
--
-- Objectif:
-- - conserver l'upload applicatif existant
-- - empecher l'acces lecture / update / delete aux objets
--   qui ne sont pas rattaches a un rapport visible par l'utilisateur
-- ============================================================

DO $$
BEGIN
  IF to_regprocedure('public.current_utilisateur_id()') IS NULL THEN
    RAISE EXCEPTION 'Fonction public.current_utilisateur_id() absente. Executer auth_rls_security.sql avant ce patch.';
  END IF;

  IF to_regprocedure('public.is_admin()') IS NULL THEN
    RAISE EXCEPTION 'Fonction public.is_admin() absente. Executer auth_rls_security.sql avant ce patch.';
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.can_access_rapport_photo_object(p_bucket text, p_path text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.rapport_photos rp
    JOIN public.rapports r ON r.id = rp.rapport_id
    WHERE rp.storage_bucket = p_bucket
      AND rp.storage_path = p_path
      AND (
        public.is_admin()
        OR rp.created_by = public.current_utilisateur_id()
        OR r.employe_id = public.current_utilisateur_id()
      )
  )
$$;

DROP POLICY IF EXISTS "rapport_photos_bucket_select" ON storage.objects;
CREATE POLICY "rapport_photos_bucket_select"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'rapport-photos'
    AND public.can_access_rapport_photo_object(bucket_id, name)
  );

DROP POLICY IF EXISTS "rapport_photos_bucket_insert" ON storage.objects;
CREATE POLICY "rapport_photos_bucket_insert"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'rapport-photos'
    AND public.current_utilisateur_id() IS NOT NULL
  );

DROP POLICY IF EXISTS "rapport_photos_bucket_update" ON storage.objects;
CREATE POLICY "rapport_photos_bucket_update"
  ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'rapport-photos'
    AND public.can_access_rapport_photo_object(bucket_id, name)
  )
  WITH CHECK (
    bucket_id = 'rapport-photos'
    AND public.can_access_rapport_photo_object(bucket_id, name)
  );

DROP POLICY IF EXISTS "rapport_photos_bucket_delete" ON storage.objects;
CREATE POLICY "rapport_photos_bucket_delete"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'rapport-photos'
    AND public.can_access_rapport_photo_object(bucket_id, name)
  );
