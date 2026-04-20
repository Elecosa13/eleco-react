import React from 'react'

const BADGE_STYLES = {
  disponible: { background: '#EAF3DE', color: '#3B6D11', border: '1px solid #cfe5bd' },
  enCours: { background: '#E6F1FB', color: '#185FA5', border: '1px solid #c9ddf0' },
  planifie: { background: '#EEF7E8', color: '#3B6D11', border: '1px solid #cfe5bd' },
  pris: { background: '#FAEEDA', color: '#8A5A10', border: '1px solid #efd19c' },
  avance: { background: '#f2f2f2', color: '#555', border: '1px solid #ddd' },
  annule: { background: '#FCEBEB', color: '#A32D2D', border: '1px solid #f4c7c7' },
  multi: { background: '#FAEEDA', color: '#8A5A10', border: '1px solid #efd19c' }
}

export default function DepannageStatusBadge({ statut, prisParLabel, intervenantsMultiples = false }) {
  const label = getStatusLabel(statut, prisParLabel)
  const style = getStatusStyle(statut)

  return (
    <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', alignItems: 'center' }}>
      <span style={{
        ...style,
        display: 'inline-flex',
        alignItems: 'center',
        minHeight: '24px',
        borderRadius: '8px',
        padding: '3px 8px',
        fontSize: '12px',
        fontWeight: 700,
        lineHeight: 1.2
      }}>
        {label}
      </span>
      {intervenantsMultiples && (
        <span style={{
          ...BADGE_STYLES.multi,
          display: 'inline-flex',
          alignItems: 'center',
          minHeight: '24px',
          borderRadius: '8px',
          padding: '3px 8px',
          fontSize: '12px',
          fontWeight: 700,
          lineHeight: 1.2
        }}>
          Intervenants multiples
        </span>
      )}
    </div>
  )
}

function getStatusLabel(statut, prisParLabel) {
  if (statut === '\u00c0 traiter') return 'Disponible'
  if (statut === 'Pris') return prisParLabel ? `Pris par ${prisParLabel}` : 'Pris'
  if (statut === 'Planifi\u00e9') return prisParLabel ? `Planifi\u00e9 par ${prisParLabel}` : 'Planifi\u00e9'
  if (statut === 'En cours') return prisParLabel ? `En cours par ${prisParLabel}` : 'En cours'
  return statut || '\u00c0 traiter'
}

function getStatusStyle(statut) {
  if (statut === '\u00c0 traiter') return BADGE_STYLES.disponible
  if (statut === 'Pris') return BADGE_STYLES.pris
  if (statut === 'Planifi\u00e9') return BADGE_STYLES.planifie
  if (statut === 'En cours') return BADGE_STYLES.enCours
  if (statut === 'Annul\u00e9') return BADGE_STYLES.annule
  return BADGE_STYLES.avance
}
