import { supabase } from '../lib/supabase'

export const STATUT_A_TRAITER = 'À traiter'
export const STATUT_EN_COURS = 'En cours'

export async function fetchDepannages() {
  const { data, error } = await supabase
    .from('depannages')
    .select(`
      id,
      adresse,
      adresse_normalisee,
      statut,
      date_travail,
      created_at,
      pris_par,
      regie:regies (
        id,
        nom
      ),
      depannage_intervenants (
        employe_id
      )
    `)
    .order('created_at', { ascending: false })

  if (error) throw error

  // Facturation future: SUM(time_entries.duree) WHERE type = 'depannage' AND reference_id = depannage.id.
  return mergeProfilsPublics(data || [])
}

async function mergeProfilsPublics(depannages) {
  const ids = Array.from(new Set(
    depannages.flatMap(depannage => [
      depannage.pris_par,
      ...(depannage.depannage_intervenants || []).map(intervenant => intervenant.employe_id)
    ]).filter(Boolean)
  ))

  if (ids.length === 0) {
    return depannages.map(depannage => ({
      ...depannage,
      pris_par_user: null,
      depannage_intervenants: (depannage.depannage_intervenants || []).map(intervenant => ({
        ...intervenant,
        employe: null
      }))
    }))
  }

  const { data: profils, error } = await supabase
    .from('profils_publics')
    .select('id, prenom, initiales')
    .in('id', ids)

  if (error) throw error

  const profilsById = new Map((profils || []).map(profil => [String(profil.id), profil]))

  return depannages.map(depannage => ({
    ...depannage,
    pris_par_user: depannage.pris_par ? profilsById.get(String(depannage.pris_par)) || null : null,
    depannage_intervenants: (depannage.depannage_intervenants || []).map(intervenant => ({
      ...intervenant,
      employe: intervenant.employe_id ? profilsById.get(String(intervenant.employe_id)) || null : null
    }))
  }))
}

export async function prendreDepannage(id) {
  return callDepannageRpc('prendre_depannage', id)
}

export async function rejoindreDepannage(id) {
  return callDepannageRpc('rejoindre_depannage', id)
}

export async function quitterDepannage(id) {
  return callDepannageRpc('quitter_depannage', id)
}

export async function libererDepannage(id) {
  return callDepannageRpc('liberer_depannage', id)
}

async function callDepannageRpc(functionName, depannageId) {
  const { data, error } = await supabase.rpc(functionName, {
    p_depannage_id: depannageId
  })
  if (error) throw error
  return data
}

export function getInitiales(user) {
  if (!user) return ''
  if (user.initiales) return String(user.initiales).trim().toUpperCase()

  const prenom = String(user.prenom || '').trim()
  const nom = String(user.nom || '').trim()
  const parts = [prenom, nom].filter(Boolean)
  if (parts.length >= 2) return parts.map(part => part[0]).join('').toUpperCase()
  if (prenom.length >= 2) return prenom.slice(0, 2).toUpperCase()
  return prenom.slice(0, 1).toUpperCase()
}

export function isCurrentUserIntervenant(depannage, userId) {
  if (!depannage || !userId) return false
  return (depannage.depannage_intervenants || []).some(intervenant =>
    String(intervenant.employe_id) === String(userId)
  )
}

export function isCurrentUserResponsable(depannage, userId) {
  if (!depannage || !userId || !depannage.pris_par) return false
  return String(depannage.pris_par) === String(userId)
}
