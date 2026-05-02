import { supabase } from '../lib/supabase'

const DOSSIER_SELECT = `
  id,
  numero_affaire,
  type,
  statut,
  description,
  adresse_chantier,
  created_at,
  client_nom,
  client_type,
  nb_lignes_a_facturer
`

function normalizeDossier(row) {
  return {
    id: row.id,
    numero_affaire: row.numero_affaire || '',
    type: row.type || '',
    statut: row.statut || '',
    description: row.description || '',
    adresse_chantier: row.adresse_chantier || '',
    created_at: row.created_at || null,
    client_nom: row.client_nom || '',
    client_type: row.client_type || '',
    nb_lignes_a_facturer: Number(row.nb_lignes_a_facturer || 0)
  }
}

export async function fetchDossiersV1({ type } = {}) {
  let query = supabase
    .from('vue_liste_dossiers')
    .select(DOSSIER_SELECT)
    .order('created_at', { ascending: false })

  if (type) query = query.eq('type', type)

  const { data, error } = await query
  if (error) throw error
  return (data || []).map(normalizeDossier)
}

export async function fetchDossiersATraiterV1() {
  const dossiers = await fetchDossiersV1()
  return dossiers.filter(dossier => {
    const statut = String(dossier.statut || '').toLowerCase()
    return dossier.nb_lignes_a_facturer > 0 ||
      statut.includes('traiter') ||
      statut.includes('ouvert') ||
      statut.includes('cours') ||
      statut.includes('nouveau')
  })
}
