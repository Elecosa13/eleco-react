-- ============================================================
-- Eleco SA - Fondations metier Chantiers + Depannages
-- Date: 2026-04-23
--
-- Objectif:
-- - poser les vraies entites metier: intermediaires, affaires, documents
-- - garder la compatibilite temporaire avec client_nom et sous_dossiers
-- - preparer le classement depannages par date_reception_bon
--
-- Prerequis:
-- - auth_rls_security.sql deja applique
-- - 20260422170000_chantiers_statuts_visibility.sql deja applique de preference
--
-- Note:
-- - depannages.numero_bon existe deja dans le schema baseline.
--   Cette migration ne le recree pas.
-- ============================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

DO $$
BEGIN
  IF to_regprocedure('public.current_utilisateur_id()') IS NULL THEN
    RAISE EXCEPTION 'Fonction public.current_utilisateur_id() absente. Executer auth_rls_security.sql avant cette migration.';
  END IF;

  IF to_regprocedure('public.is_admin()') IS NULL THEN
    RAISE EXCEPTION 'Fonction public.is_admin() absente. Executer auth_rls_security.sql avant cette migration.';
  END IF;
END $$;

-- ------------------------------------------------------------
-- Normalisation metier partagee.
-- ------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.normalize_eleco_text(p_value text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  WITH cleaned AS (
    SELECT lower(btrim(coalesce(p_value, ''))) AS value
  )
  SELECT NULLIF(
    regexp_replace(
      translate(
        replace(replace(value, 'œ', 'oe'), 'æ', 'ae'),
        'àáâäãåçèéêëìíîïñòóôöõùúûüýÿ',
        'aaaaaaceeeeiiiinooooouuuuyy'
      ),
      '\s+',
      ' ',
      'g'
    ),
    ''
  )
  FROM cleaned
$$;

COMMENT ON FUNCTION public.normalize_eleco_text(text)
  IS 'Normalise les libelles metier Eleco pour comparaison et backfill.';

-- ------------------------------------------------------------
-- 1) Intermediaires
-- Chantiers -> Intermediaire -> Chantier -> Affaire -> Documents
-- ------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.intermediaires (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nom            text NOT NULL,
  nom_normalise  text NOT NULL,
  type           text NOT NULL DEFAULT 'intermediaire',
  actif          boolean NOT NULL DEFAULT true,
  created_by     uuid REFERENCES public.utilisateurs(id) ON DELETE SET NULL,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT intermediaires_type_check
    CHECK (type IN ('intermediaire', 'cabinet', 'personne', 'apporteur', 'contact', 'autre'))
);

CREATE OR REPLACE FUNCTION public.prepare_intermediaire_fields()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.nom = btrim(coalesce(NEW.nom, ''));

  IF NEW.nom = '' THEN
    RAISE EXCEPTION 'intermediaire_nom_required';
  END IF;

  NEW.nom_normalise = public.normalize_eleco_text(NEW.nom);
  NEW.type = coalesce(NULLIF(btrim(NEW.type), ''), 'intermediaire');
  NEW.actif = coalesce(NEW.actif, true);
  NEW.updated_at = now();

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_intermediaires_prepare_fields ON public.intermediaires;
CREATE TRIGGER trg_intermediaires_prepare_fields
  BEFORE INSERT OR UPDATE ON public.intermediaires
  FOR EACH ROW
  EXECUTE FUNCTION public.prepare_intermediaire_fields();

INSERT INTO public.intermediaires (nom, type)
SELECT seed.nom, seed.type
FROM (
  VALUES
    ('ABA', 'intermediaire'),
    ('ALTUN', 'intermediaire'),
    ('Bonbonnière', 'intermediaire'),
    ('DS', 'intermediaire'),
    ('Eyka', 'intermediaire'),
    ('Zimmerman', 'intermediaire'),
    ('Jonathan / sani Projet', 'intermediaire'),
    ('Wandrille', 'intermediaire')
) AS seed(nom, type)
WHERE NOT EXISTS (
  SELECT 1
  FROM public.intermediaires i
  WHERE i.nom_normalise = public.normalize_eleco_text(seed.nom)
    AND i.actif = true
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_intermediaires_nom_normalise_actif
  ON public.intermediaires(nom_normalise)
  WHERE actif = true;

CREATE INDEX IF NOT EXISTS idx_intermediaires_actif
  ON public.intermediaires(actif);

CREATE INDEX IF NOT EXISTS idx_intermediaires_type
  ON public.intermediaires(type);

ALTER TABLE public.intermediaires ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "intermediaires_read_authenticated" ON public.intermediaires;
CREATE POLICY "intermediaires_read_authenticated"
  ON public.intermediaires FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS "intermediaires_insert_admin" ON public.intermediaires;
CREATE POLICY "intermediaires_insert_admin"
  ON public.intermediaires FOR INSERT TO authenticated
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "intermediaires_update_admin" ON public.intermediaires;
CREATE POLICY "intermediaires_update_admin"
  ON public.intermediaires FOR UPDATE TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "intermediaires_delete_none" ON public.intermediaires;
CREATE POLICY "intermediaires_delete_none"
  ON public.intermediaires FOR DELETE TO authenticated
  USING (false);

COMMENT ON TABLE public.intermediaires
  IS 'Referentiel des intermediaires / cabinets / contacts qui apportent les chantiers.';

-- ------------------------------------------------------------
-- 2) Evolution chantiers
-- Compatibilite: client_nom reste en place pendant la transition.
-- ------------------------------------------------------------

ALTER TABLE public.chantiers
  ADD COLUMN IF NOT EXISTS intermediaire_id uuid,
  ADD COLUMN IF NOT EXISTS mot_cle text,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.chantiers'::regclass
      AND conname = 'chantiers_intermediaire_id_fkey'
  ) THEN
    ALTER TABLE public.chantiers
      ADD CONSTRAINT chantiers_intermediaire_id_fkey
      FOREIGN KEY (intermediaire_id)
      REFERENCES public.intermediaires(id)
      ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_chantiers_intermediaire_id
  ON public.chantiers(intermediaire_id);

CREATE INDEX IF NOT EXISTS idx_chantiers_mot_cle
  ON public.chantiers(mot_cle)
  WHERE mot_cle IS NOT NULL;

CREATE OR REPLACE FUNCTION public.set_chantiers_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_chantiers_updated_at ON public.chantiers;
CREATE TRIGGER trg_chantiers_updated_at
  BEFORE UPDATE ON public.chantiers
  FOR EACH ROW
  EXECUTE FUNCTION public.set_chantiers_updated_at();

-- Backfill prudent client_nom -> intermediaires -> chantiers.intermediaire_id.
-- Si client_nom n'existe pas encore en base distante, ce bloc est ignore.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'chantiers'
      AND column_name = 'client_nom'
  ) THEN
    INSERT INTO public.intermediaires (nom, type)
    SELECT source.nom, 'intermediaire'
    FROM (
      SELECT DISTINCT ON (public.normalize_eleco_text(client_nom))
        btrim(client_nom) AS nom,
        public.normalize_eleco_text(client_nom) AS nom_normalise
      FROM public.chantiers
      WHERE client_nom IS NOT NULL
        AND btrim(client_nom) <> ''
      ORDER BY public.normalize_eleco_text(client_nom), btrim(client_nom)
    ) AS source
    WHERE source.nom_normalise IS NOT NULL
      AND NOT EXISTS (
        SELECT 1
        FROM public.intermediaires i
        WHERE i.nom_normalise = source.nom_normalise
          AND i.actif = true
      );

    UPDATE public.chantiers c
    SET intermediaire_id = i.id
    FROM public.intermediaires i
    WHERE c.intermediaire_id IS NULL
      AND c.client_nom IS NOT NULL
      AND btrim(c.client_nom) <> ''
      AND i.actif = true
      AND i.nom_normalise = public.normalize_eleco_text(c.client_nom);
  END IF;
END $$;

COMMENT ON COLUMN public.chantiers.intermediaire_id
  IS 'Lien metier vers l''intermediaire. Remplace progressivement client_nom.';

COMMENT ON COLUMN public.chantiers.mot_cle
  IS 'Mot-cle technique ou recherche metier libre pour retrouver un chantier.';

-- ------------------------------------------------------------
-- 3) Affaires
-- Remplacement metier progressif de sous_dossiers.
-- ------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.affaires (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  chantier_id             uuid NOT NULL REFERENCES public.chantiers(id) ON DELETE CASCADE,
  numero                  text NOT NULL,
  numero_normalise        text NOT NULL,
  nom                     text,
  statut                  text NOT NULL DEFAULT 'active',
  actif                   boolean NOT NULL DEFAULT true,
  legacy_sous_dossier_id  uuid UNIQUE REFERENCES public.sous_dossiers(id) ON DELETE SET NULL,
  created_by              uuid REFERENCES public.utilisateurs(id) ON DELETE SET NULL,
  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT affaires_statut_check
    CHECK (statut IN ('active', 'terminee', 'archivee'))
);

CREATE OR REPLACE FUNCTION public.prepare_affaire_fields()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.numero = btrim(coalesce(NEW.numero, ''));

  IF NEW.numero = '' THEN
    RAISE EXCEPTION 'affaire_numero_required';
  END IF;

  NEW.numero_normalise = public.normalize_eleco_text(NEW.numero);
  NEW.nom = NULLIF(btrim(coalesce(NEW.nom, '')), '');
  NEW.statut = coalesce(NULLIF(btrim(NEW.statut), ''), 'active');
  NEW.actif = coalesce(NEW.actif, true);
  NEW.updated_at = now();

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_affaires_prepare_fields ON public.affaires;
CREATE TRIGGER trg_affaires_prepare_fields
  BEFORE INSERT OR UPDATE ON public.affaires
  FOR EACH ROW
  EXECUTE FUNCTION public.prepare_affaire_fields();

INSERT INTO public.affaires (
  chantier_id,
  numero,
  nom,
  legacy_sous_dossier_id,
  created_at
)
SELECT
  sd.chantier_id,
  btrim(sd.nom),
  btrim(sd.nom),
  sd.id,
  sd.created_at
FROM public.sous_dossiers sd
WHERE sd.nom IS NOT NULL
  AND btrim(sd.nom) <> ''
ON CONFLICT (legacy_sous_dossier_id) DO NOTHING;

CREATE INDEX IF NOT EXISTS idx_affaires_chantier_id
  ON public.affaires(chantier_id);

CREATE INDEX IF NOT EXISTS idx_affaires_numero_normalise
  ON public.affaires(numero_normalise);

CREATE INDEX IF NOT EXISTS idx_affaires_chantier_numero_normalise
  ON public.affaires(chantier_id, numero_normalise);

CREATE INDEX IF NOT EXISTS idx_affaires_legacy_sous_dossier_id
  ON public.affaires(legacy_sous_dossier_id)
  WHERE legacy_sous_dossier_id IS NOT NULL;

ALTER TABLE public.affaires ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "affaires_read_authenticated" ON public.affaires;
CREATE POLICY "affaires_read_authenticated"
  ON public.affaires FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS "affaires_insert_authenticated" ON public.affaires;
CREATE POLICY "affaires_insert_authenticated"
  ON public.affaires FOR INSERT TO authenticated
  WITH CHECK (public.current_utilisateur_id() IS NOT NULL);

DROP POLICY IF EXISTS "affaires_update_admin" ON public.affaires;
CREATE POLICY "affaires_update_admin"
  ON public.affaires FOR UPDATE TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "affaires_delete_admin" ON public.affaires;
CREATE POLICY "affaires_delete_admin"
  ON public.affaires FOR DELETE TO authenticated
  USING (public.is_admin());

COMMENT ON TABLE public.affaires
  IS 'Dossiers metier internes rattaches a un chantier. Remplace progressivement sous_dossiers.';

-- Pont temporaire: tant que l'ancien front insere dans sous_dossiers,
-- une affaire metier equivalente est creee ou tenue a jour.
CREATE OR REPLACE FUNCTION public.sync_affaire_from_sous_dossier()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_affaire_id uuid;
BEGIN
  IF NEW.nom IS NULL OR btrim(NEW.nom) = '' THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.affaires (
    chantier_id,
    numero,
    nom,
    legacy_sous_dossier_id,
    created_at
  )
  VALUES (
    NEW.chantier_id,
    btrim(NEW.nom),
    btrim(NEW.nom),
    NEW.id,
    coalesce(NEW.created_at, now())
  )
  ON CONFLICT (legacy_sous_dossier_id)
  DO UPDATE SET
    chantier_id = excluded.chantier_id,
    numero = excluded.numero,
    nom = excluded.nom,
    updated_at = now()
  RETURNING id INTO v_affaire_id;

  UPDATE public.rapports r
  SET affaire_id = v_affaire_id
  WHERE r.sous_dossier_id = NEW.id
    AND r.affaire_id IS DISTINCT FROM v_affaire_id;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sous_dossiers_sync_affaire ON public.sous_dossiers;
CREATE TRIGGER trg_sous_dossiers_sync_affaire
  AFTER INSERT OR UPDATE ON public.sous_dossiers
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_affaire_from_sous_dossier();

-- ------------------------------------------------------------
-- 4) Rapports: lien progressif vers affaires
-- ------------------------------------------------------------

ALTER TABLE public.rapports
  ADD COLUMN IF NOT EXISTS affaire_id uuid;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.rapports'::regclass
      AND conname = 'rapports_affaire_id_fkey'
  ) THEN
    ALTER TABLE public.rapports
      ADD CONSTRAINT rapports_affaire_id_fkey
      FOREIGN KEY (affaire_id)
      REFERENCES public.affaires(id)
      ON DELETE SET NULL;
  END IF;
END $$;

UPDATE public.rapports r
SET affaire_id = a.id
FROM public.affaires a
WHERE r.affaire_id IS NULL
  AND r.sous_dossier_id = a.legacy_sous_dossier_id;

CREATE INDEX IF NOT EXISTS idx_rapports_affaire_id
  ON public.rapports(affaire_id);

COMMENT ON COLUMN public.rapports.affaire_id
  IS 'Lien metier vers affaires. sous_dossier_id reste conserve pendant la transition.';

-- ------------------------------------------------------------
-- 5) Documents metier durables
-- ------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.documents (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  affaire_id       uuid REFERENCES public.affaires(id) ON DELETE CASCADE,
  chantier_id      uuid REFERENCES public.chantiers(id) ON DELETE CASCADE,
  depannage_id     uuid REFERENCES public.depannages(id) ON DELETE CASCADE,
  type_document    text NOT NULL DEFAULT 'autre',
  nom_fichier      text NOT NULL,
  storage_bucket   text NOT NULL DEFAULT 'documents-metier',
  storage_path     text NOT NULL,
  mime_type        text,
  taille_octets    bigint,
  source           text NOT NULL DEFAULT 'manuel',
  statut           text NOT NULL DEFAULT 'actif',
  metadata         jsonb NOT NULL DEFAULT '{}'::jsonb,
  uploaded_by      uuid REFERENCES public.utilisateurs(id) ON DELETE SET NULL,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT documents_type_document_check
    CHECK (type_document IN ('devis', 'facture', 'pdf_client', 'bon_regie', 'rapport', 'autre')),
  CONSTRAINT documents_source_check
    CHECK (source IN ('manuel', 'email', 'import_pdf', 'ia', 'autre')),
  CONSTRAINT documents_statut_check
    CHECK (statut IN ('actif', 'archive')),
  CONSTRAINT documents_parent_check
    CHECK (num_nonnulls(affaire_id, chantier_id, depannage_id) >= 1),
  CONSTRAINT documents_taille_octets_check
    CHECK (taille_octets IS NULL OR taille_octets >= 0),
  CONSTRAINT documents_storage_location_unique
    UNIQUE (storage_bucket, storage_path)
);

CREATE OR REPLACE FUNCTION public.prepare_document_fields()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.nom_fichier = btrim(coalesce(NEW.nom_fichier, ''));
  NEW.storage_bucket = coalesce(NULLIF(btrim(NEW.storage_bucket), ''), 'documents-metier');
  NEW.storage_path = btrim(coalesce(NEW.storage_path, ''));
  NEW.type_document = coalesce(NULLIF(btrim(NEW.type_document), ''), 'autre');
  NEW.source = coalesce(NULLIF(btrim(NEW.source), ''), 'manuel');
  NEW.statut = coalesce(NULLIF(btrim(NEW.statut), ''), 'actif');
  NEW.metadata = coalesce(NEW.metadata, '{}'::jsonb);
  NEW.uploaded_by = coalesce(NEW.uploaded_by, public.current_utilisateur_id());
  NEW.updated_at = now();

  IF NEW.nom_fichier = '' THEN
    RAISE EXCEPTION 'document_nom_fichier_required';
  END IF;

  IF NEW.storage_path = '' THEN
    RAISE EXCEPTION 'document_storage_path_required';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_documents_prepare_fields ON public.documents;
CREATE TRIGGER trg_documents_prepare_fields
  BEFORE INSERT OR UPDATE ON public.documents
  FOR EACH ROW
  EXECUTE FUNCTION public.prepare_document_fields();

CREATE INDEX IF NOT EXISTS idx_documents_affaire_id
  ON public.documents(affaire_id);

CREATE INDEX IF NOT EXISTS idx_documents_chantier_id
  ON public.documents(chantier_id);

CREATE INDEX IF NOT EXISTS idx_documents_depannage_id
  ON public.documents(depannage_id);

CREATE INDEX IF NOT EXISTS idx_documents_type_document
  ON public.documents(type_document);

CREATE INDEX IF NOT EXISTS idx_documents_uploaded_by
  ON public.documents(uploaded_by);

ALTER TABLE public.documents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "documents_select_allowed" ON public.documents;
CREATE POLICY "documents_select_allowed"
  ON public.documents FOR SELECT TO authenticated
  USING (
    public.is_admin()
    OR uploaded_by = public.current_utilisateur_id()
    OR EXISTS (
      SELECT 1
      FROM public.depannages d
      WHERE d.id = documents.depannage_id
        AND d.employe_id = public.current_utilisateur_id()
    )
  );

DROP POLICY IF EXISTS "documents_insert_allowed" ON public.documents;
CREATE POLICY "documents_insert_allowed"
  ON public.documents FOR INSERT TO authenticated
  WITH CHECK (
    public.is_admin()
    OR uploaded_by = public.current_utilisateur_id()
    OR EXISTS (
      SELECT 1
      FROM public.depannages d
      WHERE d.id = documents.depannage_id
        AND d.employe_id = public.current_utilisateur_id()
    )
  );

DROP POLICY IF EXISTS "documents_update_allowed" ON public.documents;
CREATE POLICY "documents_update_allowed"
  ON public.documents FOR UPDATE TO authenticated
  USING (
    public.is_admin()
    OR uploaded_by = public.current_utilisateur_id()
  )
  WITH CHECK (
    public.is_admin()
    OR uploaded_by = public.current_utilisateur_id()
  );

DROP POLICY IF EXISTS "documents_delete_allowed" ON public.documents;
CREATE POLICY "documents_delete_allowed"
  ON public.documents FOR DELETE TO authenticated
  USING (
    public.is_admin()
    OR uploaded_by = public.current_utilisateur_id()
  );

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'documents-metier',
  'documents-metier',
  false,
  52428800,
  ARRAY[
    'application/pdf',
    'image/jpeg',
    'image/png',
    'image/webp',
    'text/plain',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  ]
)
ON CONFLICT (id) DO UPDATE
SET public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

CREATE OR REPLACE FUNCTION public.can_access_document_object(p_bucket text, p_path text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.documents doc
    LEFT JOIN public.depannages d ON d.id = doc.depannage_id
    WHERE doc.storage_bucket = p_bucket
      AND doc.storage_path = p_path
      AND (
        public.is_admin()
        OR doc.uploaded_by = public.current_utilisateur_id()
        OR d.employe_id = public.current_utilisateur_id()
      )
  )
$$;

DROP POLICY IF EXISTS "documents_bucket_select" ON storage.objects;
CREATE POLICY "documents_bucket_select"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'documents-metier'
    AND public.can_access_document_object(bucket_id, name)
  );

DROP POLICY IF EXISTS "documents_bucket_insert" ON storage.objects;
CREATE POLICY "documents_bucket_insert"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'documents-metier'
    AND public.current_utilisateur_id() IS NOT NULL
  );

DROP POLICY IF EXISTS "documents_bucket_update" ON storage.objects;
CREATE POLICY "documents_bucket_update"
  ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'documents-metier'
    AND public.can_access_document_object(bucket_id, name)
  )
  WITH CHECK (
    bucket_id = 'documents-metier'
    AND public.can_access_document_object(bucket_id, name)
  );

DROP POLICY IF EXISTS "documents_bucket_delete" ON storage.objects;
CREATE POLICY "documents_bucket_delete"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'documents-metier'
    AND public.can_access_document_object(bucket_id, name)
  );

COMMENT ON TABLE public.documents
  IS 'Documents metier Eleco: devis, factures, PDF client, bons de regie, rapports et autres fichiers.';

-- ------------------------------------------------------------
-- 6) Depannages: classement futur par date_reception_bon
-- ------------------------------------------------------------

ALTER TABLE public.depannages
  ADD COLUMN IF NOT EXISTS date_reception_bon date,
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'manuel',
  ADD COLUMN IF NOT EXISTS ia_confidence numeric(5,4),
  ADD COLUMN IF NOT EXISTS ia_reviewed boolean NOT NULL DEFAULT false;

UPDATE public.depannages
SET source = 'manuel'
WHERE source IS NULL OR btrim(source) = '';

UPDATE public.depannages
SET ia_reviewed = false
WHERE ia_reviewed IS NULL;

ALTER TABLE public.depannages
  ALTER COLUMN source SET DEFAULT 'manuel',
  ALTER COLUMN source SET NOT NULL,
  ALTER COLUMN ia_reviewed SET DEFAULT false,
  ALTER COLUMN ia_reviewed SET NOT NULL;

ALTER TABLE public.depannages
  DROP CONSTRAINT IF EXISTS depannages_source_check,
  DROP CONSTRAINT IF EXISTS depannages_ia_confidence_check;

ALTER TABLE public.depannages
  ADD CONSTRAINT depannages_source_check
  CHECK (source IN ('manuel', 'email', 'import_pdf', 'ia', 'autre'))
  NOT VALID,
  ADD CONSTRAINT depannages_ia_confidence_check
  CHECK (ia_confidence IS NULL OR (ia_confidence >= 0 AND ia_confidence <= 1))
  NOT VALID;

CREATE INDEX IF NOT EXISTS idx_depannages_date_reception_bon
  ON public.depannages(date_reception_bon)
  WHERE date_reception_bon IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_depannages_regie_date_reception_bon
  ON public.depannages(regie_id, date_reception_bon)
  WHERE date_reception_bon IS NOT NULL;

COMMENT ON COLUMN public.depannages.date_reception_bon
  IS 'Date de reception du bon de regie. Base du futur classement Regie -> Annee -> Mois -> Depannage date.';

COMMENT ON COLUMN public.depannages.numero_bon
  IS 'Numero du bon de regie existant dans le schema baseline. Conserve tel quel.';

COMMENT ON COLUMN public.depannages.source
  IS 'Origine de creation ou detection du depannage: manuel, email, import_pdf, ia, autre.';

COMMENT ON COLUMN public.depannages.ia_confidence
  IS 'Score de confiance IA entre 0 et 1 pour les champs detectes.';

COMMENT ON COLUMN public.depannages.ia_reviewed
  IS 'Indique si les donnees detectees par IA ont ete revues par un humain.';

-- Seeds regies metier initiales. La table existe deja, on complete seulement les manquants.
INSERT INTO public.regies (nom, nom_normalise, actif)
SELECT seed.nom, public.normalize_eleco_text(seed.nom), true
FROM (
  VALUES
    ('Régisseurs du Léman'),
    ('Zimmerman'),
    ('Bersier & Cie SA'),
    ('Bernard Nicod'),
    ('Bory'),
    ('VPI')
) AS seed(nom)
WHERE NOT EXISTS (
  SELECT 1
  FROM public.regies r
  WHERE r.nom_normalise = public.normalize_eleco_text(seed.nom)
    AND r.actif = true
);

-- ------------------------------------------------------------
-- 7) Verifications rapides disponibles apres application
-- ------------------------------------------------------------
-- select count(*) from public.intermediaires;
-- select count(*) from public.affaires;
-- select count(*) from public.documents;
-- select count(*) from public.rapports where sous_dossier_id is not null and affaire_id is null;
-- select count(*) from public.chantiers where client_nom is not null and btrim(client_nom) <> '' and intermediaire_id is null;
-- select column_name from information_schema.columns where table_schema = 'public' and table_name = 'depannages' and column_name = 'date_reception_bon';
