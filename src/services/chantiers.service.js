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

export function getChantierClientLabel(chantier) {
  const value = String(chantier?.client_nom || '').trim()
  return value || 'Client / regie non defini'
}

export function isChantierVisibleToEmployees(chantierOrStatus) {
  const statut = typeof chantierOrStatus === 'string'
    ? chantierOrStatus
    : chantierOrStatus?.statut

  return CHANTIER_EMPLOYEE_VISIBLE_STATUSES.includes(String(statut || ''))
}

export function getChantierStatusBadgeStyle(statut) {
  if (statut === CHANTIER_STATUT_FINI) {
    return { background: '#EAF3DE', color: '#3B6D11', border: '1px solid #cfe2b5' }
  }

  if (statut === CHANTIER_STATUT_A_FACTURER) {
    return { background: '#FFF1E2', color: '#AF5E12', border: '1px solid #f0c48d' }
  }

  if ([CHANTIER_STATUT_ENVOYE_AUX_EMPLOYES, CHANTIER_STATUT_EN_COURS].includes(statut)) {
    return { background: '#E6F1FB', color: '#185FA5', border: '1px solid #c5daee' }
  }

  return { background: '#FAEEDA', color: '#8A5A10', border: '1px solid #efd19c' }
}

export function getNextChantierStatusAction(statut) {
  if (statut === CHANTIER_STATUT_A_CONFIRMER) {
    return { nextStatus: CHANTIER_STATUT_ENVOYE_AUX_EMPLOYES, label: 'Envoyer aux employes' }
  }

  if (statut === CHANTIER_STATUT_ENVOYE_AUX_EMPLOYES) {
    return { nextStatus: CHANTIER_STATUT_EN_COURS, label: 'Passer en cours' }
  }

  if (statut === CHANTIER_STATUT_EN_COURS) {
    return { nextStatus: CHANTIER_STATUT_A_FACTURER, label: 'Passer a facturer' }
  }

  if (statut === CHANTIER_STATUT_A_FACTURER) {
    return { nextStatus: CHANTIER_STATUT_FINI, label: 'Marquer fini' }
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
      items: items.sort((a, b) => String(a?.nom || '').localeCompare(String(b?.nom || ''), 'fr', { sensitivity: 'base' }))
    }))
}
