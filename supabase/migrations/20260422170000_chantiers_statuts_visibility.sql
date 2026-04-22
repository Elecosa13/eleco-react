ALTER TABLE public.chantiers
  ADD COLUMN IF NOT EXISTS client_nom text,
  ADD COLUMN IF NOT EXISTS statut text,
  ADD COLUMN IF NOT EXISTS documents_visibilite_employe text;

UPDATE public.chantiers
SET statut = 'A confirmer'
WHERE statut IS NULL OR btrim(statut) = '';

UPDATE public.chantiers
SET documents_visibilite_employe = 'sans_prix'
WHERE documents_visibilite_employe IS NULL OR btrim(documents_visibilite_employe) = '';

ALTER TABLE public.chantiers
  ALTER COLUMN statut SET DEFAULT 'A confirmer',
  ALTER COLUMN statut SET NOT NULL,
  ALTER COLUMN documents_visibilite_employe SET DEFAULT 'sans_prix',
  ALTER COLUMN documents_visibilite_employe SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'chantiers_statut_check'
  ) THEN
    ALTER TABLE public.chantiers
      ADD CONSTRAINT chantiers_statut_check
      CHECK (statut IN (
        'A confirmer',
        'Envoye aux employes',
        'En cours',
        'A facturer',
        'Fini'
      ));
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'chantiers_documents_visibilite_employe_check'
  ) THEN
    ALTER TABLE public.chantiers
      ADD CONSTRAINT chantiers_documents_visibilite_employe_check
      CHECK (documents_visibilite_employe IN ('sans_prix', 'complet'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_chantiers_statut ON public.chantiers(statut);
CREATE INDEX IF NOT EXISTS idx_chantiers_client_nom ON public.chantiers(client_nom);
