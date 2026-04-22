-- Soft delete sur rapports
-- Remplace le hard DELETE par un flag deleted_at pour préserver
-- les time_entries et rapport_photos liés (même UUID).

ALTER TABLE public.rapports
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz DEFAULT NULL;

-- Index partiel : seules les lignes supprimées sont indexées (faible cardinalité)
CREATE INDEX IF NOT EXISTS idx_rapports_deleted_at
  ON public.rapports (deleted_at)
  WHERE deleted_at IS NOT NULL;
