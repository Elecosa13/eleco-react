-- ============================================================
-- Eleco SA - Baseline schema
-- Date: 2026-04-19
--
-- Objectif:
-- - permettre de reconstruire une base Eleco propre depuis zero
-- - creer les tables historiques manquantes dans les migrations actuelles
-- - inclure les colonnes reellement attendues par le frontend
--
-- Hypotheses importantes:
-- - Supabase fournit deja le schema auth et la table auth.users.
-- - Cette baseline ne cree pas de donnees de reference.
-- - Les policies RLS finales restent portees par auth_rls_security.sql.
-- - rapport_materiaux.rapport_id est actuellement polymorphique cote front:
--   il peut contenir un id de rapports OU un id de depannages. Une FK stricte
--   vers rapports casserait les materiaux de depannage. La baseline garde donc
--   cette colonne sans FK directe et l'indexe.
-- ============================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ------------------------------------------------------------
-- Utilisateurs
-- ------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.utilisateurs (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  auth_user_id           uuid UNIQUE REFERENCES auth.users(id) ON DELETE SET NULL,
  prenom                 text NOT NULL,
  initiales              text,
  email                  text,
  role                   text NOT NULL CHECK (role IN ('admin', 'employe')),
  actif                  boolean NOT NULL DEFAULT true,
  vacances_quota_annuel  int NOT NULL DEFAULT 20,
  created_at             timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_utilisateurs_auth_user_id ON public.utilisateurs(auth_user_id);
CREATE INDEX IF NOT EXISTS idx_utilisateurs_email ON public.utilisateurs(lower(email));
CREATE INDEX IF NOT EXISTS idx_utilisateurs_role ON public.utilisateurs(role);
CREATE INDEX IF NOT EXISTS idx_utilisateurs_actif ON public.utilisateurs(actif);

-- ------------------------------------------------------------
-- Chantiers et sous-dossiers
-- ------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.chantiers (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nom         text NOT NULL,
  adresse     text,
  actif       boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_chantiers_actif ON public.chantiers(actif);
CREATE INDEX IF NOT EXISTS idx_chantiers_nom ON public.chantiers(nom);

CREATE TABLE IF NOT EXISTS public.sous_dossiers (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  chantier_id  uuid NOT NULL REFERENCES public.chantiers(id) ON DELETE CASCADE,
  nom          text NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sous_dossiers_chantier_id ON public.sous_dossiers(chantier_id);
CREATE INDEX IF NOT EXISTS idx_sous_dossiers_created_at ON public.sous_dossiers(created_at);

-- ------------------------------------------------------------
-- Catalogue
-- ------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.catalogue (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nom         text NOT NULL,
  categorie   text,
  unite       text,
  prix_net    numeric NOT NULL DEFAULT 0,
  actif       boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_catalogue_actif ON public.catalogue(actif);
CREATE INDEX IF NOT EXISTS idx_catalogue_categorie_nom ON public.catalogue(categorie, nom);

-- ------------------------------------------------------------
-- Regies
-- ------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.regies (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nom            text NOT NULL,
  nom_normalise  text,
  actif          boolean NOT NULL DEFAULT true,
  created_by     uuid REFERENCES public.utilisateurs(id) ON DELETE SET NULL,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_regies_nom_normalise ON public.regies(nom_normalise);
CREATE INDEX IF NOT EXISTS idx_regies_actif ON public.regies(actif);

-- ------------------------------------------------------------
-- Rapports chantier
-- ------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.rapports (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sous_dossier_id  uuid NOT NULL REFERENCES public.sous_dossiers(id) ON DELETE CASCADE,
  employe_id       uuid NOT NULL REFERENCES public.utilisateurs(id) ON DELETE CASCADE,
  date_travail     date NOT NULL,
  heure_debut      time,
  heure_fin        time,
  remarques        text,
  valide           boolean NOT NULL DEFAULT false,
  created_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_rapports_sous_dossier_id ON public.rapports(sous_dossier_id);
CREATE INDEX IF NOT EXISTS idx_rapports_employe_date ON public.rapports(employe_id, date_travail);
CREATE INDEX IF NOT EXISTS idx_rapports_valide_created_at ON public.rapports(valide, created_at);

-- ------------------------------------------------------------
-- Depannages
-- ------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.depannages (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employe_id       uuid REFERENCES public.utilisateurs(id) ON DELETE SET NULL,
  regie_id         uuid CONSTRAINT depannages_regie_id_fkey REFERENCES public.regies(id) ON DELETE SET NULL,
  date_travail     date NOT NULL,
  adresse          text NOT NULL,
  duree            numeric NOT NULL DEFAULT 1,
  remarques        text,
  statut           text NOT NULL DEFAULT 'À traiter',
  pris_par         uuid REFERENCES public.utilisateurs(id) ON DELETE SET NULL,
  pris_le          timestamptz,
  libere_par       uuid REFERENCES public.utilisateurs(id) ON DELETE SET NULL,
  libere_le        timestamptz,
  adresse_normalisee text,

  -- Colonnes legacy/fallback lues par DepannageDetail/Admin si presentes.
  regie_nom        text,
  client           text,
  nom_client       text,
  objet            text,
  titre            text,
  description      text,
  status           text,
  intervenant      text,
  intervenant_nom  text,
  contact          text,
  telephone        text,
  email            text,
  numero_bon       text,
  reference        text,
  ref              text,

  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT depannages_statut_metier_check
    CHECK (statut IN (
      'Bon reçu',
      'À traiter',
      'En cours',
      'Intervention faite',
      'Rapport reçu',
      'Facture à préparer',
      'Facture prête',
      'Annulé'
    ))
);

CREATE INDEX IF NOT EXISTS idx_depannages_employe_date ON public.depannages(employe_id, date_travail);
CREATE INDEX IF NOT EXISTS idx_depannages_regie_id ON public.depannages(regie_id);
CREATE INDEX IF NOT EXISTS idx_depannages_statut ON public.depannages(statut);
CREATE INDEX IF NOT EXISTS idx_depannages_pris_par ON public.depannages(pris_par);
CREATE INDEX IF NOT EXISTS idx_depannages_adresse_normalisee ON public.depannages(adresse_normalisee);
CREATE INDEX IF NOT EXISTS idx_depannages_created_at ON public.depannages(created_at);

-- ------------------------------------------------------------
-- Materiaux
-- ------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.rapport_materiaux (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rapport_id   uuid NOT NULL,
  ref_article  uuid REFERENCES public.catalogue(id) ON DELETE SET NULL,
  designation  text NOT NULL,
  unite        text,
  quantite     numeric NOT NULL DEFAULT 1,
  prix_net     numeric NOT NULL DEFAULT 0,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_rapport_materiaux_rapport_id ON public.rapport_materiaux(rapport_id);
CREATE INDEX IF NOT EXISTS idx_rapport_materiaux_ref_article ON public.rapport_materiaux(ref_article);

-- ------------------------------------------------------------
-- Time entries
-- ------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.time_entries (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employe_id      uuid NOT NULL REFERENCES public.utilisateurs(id) ON DELETE CASCADE,
  date_travail    date NOT NULL,
  type            text NOT NULL,
  reference_id    uuid,
  duree           numeric NOT NULL DEFAULT 0,
  chantier_id     uuid REFERENCES public.chantiers(id) ON DELETE SET NULL,
  heure_debut     time,
  heure_fin       time,
  pause_minutes   int NOT NULL DEFAULT 0,
  semaine         int,
  annee           int,
  heures_nettes   numeric,
  commentaire     text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  CHECK (duree >= 0),
  CHECK (pause_minutes >= 0),
  CHECK (type IN ('chantier', 'depannage', 'heures_supp', 'heures'))
);

CREATE INDEX IF NOT EXISTS idx_time_entries_employe_date ON public.time_entries(employe_id, date_travail);
CREATE INDEX IF NOT EXISTS idx_time_entries_type ON public.time_entries(type);
CREATE INDEX IF NOT EXISTS idx_time_entries_reference_id ON public.time_entries(reference_id);
CREATE INDEX IF NOT EXISTS idx_time_entries_chantier_id ON public.time_entries(chantier_id);

-- ------------------------------------------------------------
-- Vacances
-- ------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.vacances (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employe_id      uuid NOT NULL REFERENCES public.utilisateurs(id) ON DELETE CASCADE,
  date_debut      date NOT NULL,
  date_fin        date NOT NULL,
  commentaire     text,
  statut          text NOT NULL DEFAULT 'en_attente' CHECK (statut IN ('en_attente', 'accepte', 'refuse')),
  jours_ouvrables int NOT NULL DEFAULT 0,
  decision_note   text,
  decide_par      uuid REFERENCES public.utilisateurs(id) ON DELETE SET NULL,
  decide_le       timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now(),
  CHECK (date_fin >= date_debut)
);

CREATE INDEX IF NOT EXISTS idx_vacances_employe_dates ON public.vacances(employe_id, date_debut, date_fin);
CREATE INDEX IF NOT EXISTS idx_vacances_statut ON public.vacances(statut);

CREATE TABLE IF NOT EXISTS public.vacances_blocages (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  date_debut  date NOT NULL,
  date_fin    date NOT NULL,
  type        text NOT NULL DEFAULT 'blocage' CONSTRAINT vacances_blocages_type_check CHECK (type IN ('blocage', 'fermeture_collective')),
  motif       text NOT NULL,
  actif       boolean NOT NULL DEFAULT true,
  created_by  uuid REFERENCES public.utilisateurs(id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  CHECK (date_fin >= date_debut)
);

CREATE INDEX IF NOT EXISTS idx_vacances_blocages_dates ON public.vacances_blocages(date_debut, date_fin);
CREATE INDEX IF NOT EXISTS idx_vacances_blocages_actif ON public.vacances_blocages(actif);

-- ------------------------------------------------------------
-- Absences
-- ------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.absences (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employe_id  uuid NOT NULL REFERENCES public.utilisateurs(id) ON DELETE CASCADE,
  type        text NOT NULL DEFAULT 'maladie' CHECK (type IN ('maladie', 'accident', 'autre')),
  date_debut  date NOT NULL,
  date_fin    date NOT NULL,
  commentaire text,
  statut      text NOT NULL DEFAULT 'en_attente' CONSTRAINT absences_statut_check CHECK (statut IN ('en_attente', 'approuve', 'refuse')),
  decide_par  uuid REFERENCES public.utilisateurs(id) ON DELETE SET NULL,
  decide_le   timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now(),
  CHECK (date_fin >= date_debut)
);

CREATE INDEX IF NOT EXISTS idx_absences_employe ON public.absences(employe_id, date_debut);
CREATE INDEX IF NOT EXISTS idx_absences_statut ON public.absences(statut);

-- ------------------------------------------------------------
-- Signatures et chartes
-- ------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.signatures (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employe_id       uuid UNIQUE NOT NULL REFERENCES public.utilisateurs(id) ON DELETE CASCADE,
  signature_base64 text NOT NULL,
  signee_le        timestamptz NOT NULL DEFAULT now(),
  ip_address       text,
  device_info      text
);

CREATE INDEX IF NOT EXISTS idx_signatures_employe_id ON public.signatures(employe_id);

CREATE TABLE IF NOT EXISTS public.chartes_acceptees (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employe_id     uuid NOT NULL REFERENCES public.utilisateurs(id) ON DELETE CASCADE,
  version_charte text DEFAULT 'v1.0',
  acceptee_le    timestamptz NOT NULL DEFAULT now(),
  ip_address     text,
  device_info    text,
  pdf_url        text
);

CREATE INDEX IF NOT EXISTS idx_chartes_acceptees_employe_id ON public.chartes_acceptees(employe_id);

-- ------------------------------------------------------------
-- RLS activee, policies finales a appliquer ensuite
-- ------------------------------------------------------------

ALTER TABLE public.utilisateurs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chantiers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sous_dossiers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rapports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.depannages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.time_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rapport_materiaux ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.catalogue ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.regies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vacances ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vacances_blocages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.absences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.signatures ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chartes_acceptees ENABLE ROW LEVEL SECURITY;
