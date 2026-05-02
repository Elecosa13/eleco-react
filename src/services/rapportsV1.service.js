import { supabase } from '../lib/supabase'

const CATALOGUE_EMPLOYE_SELECT = 'id, reference, categorie, nom, unite'

export async function fetchCatalogueEmployeV1() {
  const { data, error } = await supabase
    .from('catalogue_employe')
    .select(CATALOGUE_EMPLOYE_SELECT)
    .order('categorie', { ascending: true })
    .order('nom', { ascending: true })

  if (error) throw error
  return data || []
}

export async function creerRapportEmployeV1({
  dossierId,
  employeId,
  dateIntervention,
  heures,
  heuresDeplacement,
  materiaux,
  notes
}) {
  const { data: rapport, error: rapportError } = await supabase
    .from('rapports')
    .insert({
      dossier_id: dossierId,
      employe_id: employeId || null,
      date_intervention: dateIntervention,
      heures: Number(heures || 0),
      heures_deplacement: Number(heuresDeplacement || 0),
      materiaux_notes: buildMateriauxNotes(materiaux),
      notes: notes?.trim() || null,
      statut: 'recu',
      modifie_par_admin: false
    })
    .select('id')
    .single()

  if (rapportError) throw rapportError

  const lignes = (materiaux || [])
    .filter(item => item.nom && Number(item.quantite) > 0)
    .map(item => ({
      dossier_id: dossierId,
      rapport_id: rapport.id,
      type: 'materiel',
      description: buildMaterielDescription(item),
      quantite: Number(item.quantite),
      prix_unitaire: 0,
      montant_ht: 0,
      statut: 'non_facture'
    }))

  if (lignes.length > 0) {
    const { error: lignesError } = await supabase
      .from('lignes_facturables')
      .insert(lignes)

    if (lignesError) throw lignesError
  }

  return rapport
}

function buildMaterielDescription(item) {
  const reference = item.reference ? `${item.reference} - ` : ''
  const unite = item.unite ? ` (${item.unite})` : ''
  return `${reference}${item.nom}${unite}`
}

function buildMateriauxNotes(materiaux) {
  const lignes = (materiaux || [])
    .filter(item => item.nom && Number(item.quantite) > 0)
    .map(item => `${Number(item.quantite)} x ${buildMaterielDescription(item)}`)

  return lignes.length > 0 ? lignes.join('\n') : null
}
