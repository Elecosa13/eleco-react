ALTER TABLE public.rapport_photos
  ADD COLUMN IF NOT EXISTS affaire_id uuid;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'rapport_photos_affaire_id_fkey'
  ) THEN
    ALTER TABLE public.rapport_photos
      ADD CONSTRAINT rapport_photos_affaire_id_fkey
      FOREIGN KEY (affaire_id)
      REFERENCES public.affaires(id)
      ON DELETE SET NULL;
  END IF;
END $$;
