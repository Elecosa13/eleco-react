export const CHANTIER_STATUT_A_CONFIRMER = 'A confirmer'
export const CHANTIER_STATUT_ENVOYE_AUX_EMPLOYES = 'Envoye aux employes'
export const CHANTIER_STATUT_EN_COURS = 'En cours'
export const CHANTIER_STATUT_A_FACTURER = 'A facturer'
export const CHANTIER_STATUT_FINI = 'Fini'

export const CHANTIER_EMPLOYEE_VISIBLE_STATUSES = [
  CHANTIER_STATUT_ENVOYE_AUX_EMPLOYES,
  CHANTIER_STATUT_EN_COURS,
  CHANTIER_STATUT_A_FACTURER,
  CHANTIER_STATUT_FINI
]

const INTERMEDIAIRES_METIER = [
  'ABA',
  'ALTUN',
  'Bonbonniere',
  'BonbonniÃ¨re',
  'DS',
  'Eyka',
  'Zimmerman',
  'Jonathan / sani Projet',
  'Wandrille'
]

function normaliserNom(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim()
}

export function getChantierClientLabel(chantier) {
  const intermediaireNom = String(
    chantier?.intermediaire?.nom ||
    chantier?.intermediaires?.nom ||
    chantier?.intermediaire_nom ||
    ''
  ).trim()

  const legacyClientNom = String(chantier?.client?.nom || '').trim()

  return intermediaireNom || legacyClientNom || 'Intermédiaire non défini'
}

export function isStandaloneIntermediaireRecord(chantier, intermediaires = []) {
  if (!chantier) return false

  const nom = normaliserNom(chantier.description)
  if (!nom) return false

  const nomsIntermediaires = [
    ...INTERMEDIAIRES_METIER,
    ...Array.from(intermediaires || []).map(item => item?.nom)
  ].map(normaliserNom).filter(Boolean)

  return nomsIntermediaires.includes(nom)
}

export function chantierBelongsToIntermediaire(chantier, intermediaire) {
  if (!chantier || !intermediaire) return false
  if (chantier.client_id != null && String(chantier.client_id) === String(intermediaire.id)) return true

  const label = normaliserNom(getChantierClientLabel(chantier))
  const nom = normaliserNom(intermediaire.nom)
  return Boolean(label && nom && label === nom)
}

export function isChantierVisibleToEmployees(chantierOrStatus) {
  const statut = typeof chantierOrStatus === 'string'
    ? chantierOrStatus
    : chantierOrStatus?.statut

  return CHANTIER_EMPLOYEE_VISIBLE_STATUSES.includes(String(statut || ''))
}

export function getChantierStatusBadgeStyle(statut) {
  if (statut === CHANTIER_STATUT_A_CONFIRMER) {
    return { background: '#F3F4F6', color: '#9A5B00', border: '1px solid #F0B75A' }
  }

  if (statut === CHANTIER_STATUT_ENVOYE_AUX_EMPLOYES) {
    return { background: '#E6F1FB', color: '#185FA5', border: '1px solid #c5daee' }
  }

  if (statut === CHANTIER_STATUT_EN_COURS) {
    return { background: '#E7F6EA', color: '#247A35', border: '1px solid #B9DFC1' }
  }

  if (statut === CHANTIER_STATUT_FINI) {
    return { background: '#E5E7EB', color: '#374151', border: '1px solid #9CA3AF' }
  }

  if (statut === CHANTIER_STATUT_A_FACTURER) {
    return { background: '#F1E9FF', color: '#6B3FA0', border: '1px solid #C9B3F2' }
  }

  return { background: '#FAEEDA', color: '#8A5A10', border: '1px solid #efd19c' }
}

export function getChantierStatusLabel(statut) {
  if (statut === CHANTIER_STATUT_ENVOYE_AUX_EMPLOYES) return 'Envoyé aux employés'
  return statut || CHANTIER_STATUT_A_CONFIRMER
}

export function getNextChantierStatusAction(statut) {
  if (statut === CHANTIER_STATUT_A_CONFIRMER) {
    return { nextStatus: CHANTIER_STATUT_ENVOYE_AUX_EMPLOYES, label: 'Envoyer aux employés' }
  }

  return null
}

export function groupChantiersByClient(chantiers) {
  const grouped = {}

  for (const chantier of Array.from(chantiers || [])) {
    const key = getChantierClientLabel(chantier)
    if (!grouped[key]) grouped[key] = []
    grouped[key].push(chantier)
  }

  return Object.entries(grouped)
    .sort((a, b) => a[0].localeCompare(b[0], 'fr', { sensitivity: 'base' }))
    .map(([clientLabel, items]) => ({
      clientLabel,
      items: items.sort((a, b) => String(a?.description || '').localeCompare(String(b?.description || ''), 'fr', { sensitivity: 'base' }))
    }))
}
