import { supabase } from '../lib/supabase'

export const STATUT_A_TRAITER = '\u00c0 traiter'
export const STATUT_PRIS = 'Pris'
export const STATUT_PLANIFIE = 'Planifi\u00e9'
export const STATUT_EN_COURS = 'En cours'
export const STATUT_INTERVENTION_FAITE = 'Intervention faite'
export const STATUT_RAPPORT_RECU = 'Rapport re\u00e7u'

export async function fetchDepannages() {
  const { data, error } = await supabase
    .from('depannages')
    .select(`
      id,
      adresse,
      adresse_normalisee,
      statut,
      date_travail,
      date_planifiee,
      heure_planifiee,
      chantier_id,
      created_at,
      pris_par,
      regie:regies (
        id,
        nom
      ),
      chantier:chantiers (
        id,
        nom
      ),
      depannage_intervenants (
        employe_id
      )
    `)
    .order('created_at', { ascending: false })

  if (error) throw error

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
  return callDepannageRpc('prendre_depannage', { p_depannage_id: id })
}

export async function prendreDepannageSansDate(id) {
  return callDepannageRpc('prendre_depannage_sans_date', { p_depannage_id: id })
}

export async function planifierDepannage(id, { date, heure = null }) {
  return callDepannageRpc('planifier_depannage', {
    p_depannage_id: id,
    p_date: date,
    p_heure: heure || null
  })
}

export async function demarrerDepannage(id) {
  return callDepannageRpc('demarrer_depannage', { p_depannage_id: id })
}

export async function rejoindreDepannage(id) {
  return callDepannageRpc('rejoindre_depannage', { p_depannage_id: id })
}

export async function quitterDepannage(id) {
  return callDepannageRpc('quitter_depannage', { p_depannage_id: id })
}

export async function libererDepannage(id) {
  return callDepannageRpc('liberer_depannage', { p_depannage_id: id })
}

export async function ensureDepannageSousDossier(chantierId) {
  const { data, error } = await supabase.rpc('ensure_depannage_sous_dossier', {
    p_chantier_id: chantierId
  })
  if (error) throw error
  return data
}

async function callDepannageRpc(functionName, payload) {
  const { data, error } = await supabase.rpc(functionName, payload)
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

export function formatPlanningLabel(depannage) {
  const dateValue = depannage?.date_planifiee || depannage?.date_travail
  if (!dateValue) return ''

  const [year, month, day] = String(dateValue).split('-')
  const dateLabel = year && month && day ? `${day}.${month}.${year}` : String(dateValue)
  const heure = String(depannage?.heure_planifiee || '').slice(0, 5)

  return heure ? `${dateLabel} \u00b7 ${heure}` : dateLabel
}
