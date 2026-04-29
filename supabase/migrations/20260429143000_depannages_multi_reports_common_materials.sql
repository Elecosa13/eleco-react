-- Eleco SA - Depannages multi-intervenants: rapports separes, materiel commun.
-- A appliquer uniquement apres backup de production.

ALTER TABLE public.rapports
  DROP CONSTRAINT IF EXISTS rapports_depannage_id_key;

DROP INDEX IF EXISTS public.idx_rapports_depannage_id_unique;

CREATE UNIQUE INDEX IF NOT EXISTS idx_rapports_depannage_employe_unique
  ON public.rapports(depannage_id, employe_id)
  WHERE depannage_id IS NOT NULL
    AND deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_rapports_depannage_id
  ON public.rapports(depannage_id)
  WHERE depannage_id IS NOT NULL
    AND deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS public.depannage_materiaux (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  depannage_id uuid NOT NULL REFERENCES public.depannages(id) ON DELETE CASCADE,
  ref_article uuid REFERENCES public.catalogue(id) ON DELETE SET NULL,
  designation text NOT NULL,
  unite text NOT NULL DEFAULT 'pce',
  quantite numeric NOT NULL DEFAULT 1,
  created_by uuid REFERENCES public.utilisateurs(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT depannage_materiaux_quantite_non_negative CHECK (quantite >= 0),
  CONSTRAINT depannage_materiaux_unite_check CHECK (unite IN ('m', 'pce'))
);

CREATE INDEX IF NOT EXISTS idx_depannage_materiaux_depannage_id
  ON public.depannage_materiaux(depannage_id);

CREATE INDEX IF NOT EXISTS idx_depannage_materiaux_ref_article
  ON public.depannage_materiaux(ref_article);

ALTER TABLE public.depannage_materiaux ENABLE ROW LEVEL SECURITY;

CREATE POLICY "depannage_materiaux_select_intervenant_or_admin"
  ON public.depannage_materiaux FOR SELECT TO authenticated
  USING (
    public.is_admin()
    OR EXISTS (
      SELECT 1
      FROM public.depannages d
      WHERE d.id = depannage_materiaux.depannage_id
        AND (
          d.employe_id = public.current_utilisateur_id()
          OR d.pris_par = public.current_utilisateur_id()
          OR EXISTS (
            SELECT 1
            FROM public.depannage_intervenants di
            WHERE di.depannage_id = d.id
              AND di.employe_id = public.current_utilisateur_id()
          )
        )
    )
  );

CREATE POLICY "depannage_materiaux_insert_intervenant_or_admin"
  ON public.depannage_materiaux FOR INSERT TO authenticated
  WITH CHECK (
    public.is_admin()
    OR created_by = public.current_utilisateur_id()
    OR EXISTS (
      SELECT 1
      FROM public.depannages d
      WHERE d.id = depannage_materiaux.depannage_id
        AND (
          d.employe_id = public.current_utilisateur_id()
          OR d.pris_par = public.current_utilisateur_id()
          OR EXISTS (
            SELECT 1
            FROM public.depannage_intervenants di
            WHERE di.depannage_id = d.id
              AND di.employe_id = public.current_utilisateur_id()
          )
        )
    )
  );

CREATE POLICY "depannage_materiaux_update_admin_only"
  ON public.depannage_materiaux FOR UPDATE TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

CREATE POLICY "depannage_materiaux_delete_admin_only"
  ON public.depannage_materiaux FOR DELETE TO authenticated
  USING (public.is_admin());
