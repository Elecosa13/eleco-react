import React from 'react'
import DepannageStatusBadge from './DepannageStatusBadge'
import {
  getInitiales,
  isCurrentUserIntervenant,
  isCurrentUserResponsable,
  STATUT_A_TRAITER,
  STATUT_EN_COURS
} from '../../services/depannages.service'

const ACTION_STYLE = {
  flex: 1,
  minHeight: '42px',
  borderRadius: '8px',
  padding: '10px 12px',
  fontSize: '13px',
  fontWeight: 700
}

export default function DepannageCard({ depannage, currentUserId, onAction, actionLoading }) {
  const responsableLabel = getInitiales(depannage.pris_par_user)
  const responsableId = depannage.pris_par
  const equipe = getEquipeSansDoublon(depannage)
  const autresIntervenants = equipe.filter(user => String(user.id) !== String(responsableId))
  const estResponsable = isCurrentUserResponsable(depannage, currentUserId)
  const estIntervenant = isCurrentUserIntervenant(depannage, currentUserId)
  const peutPrendre = depannage.statut === STATUT_A_TRAITER
  const peutRejoindre = depannage.statut === STATUT_EN_COURS && !estIntervenant && !estResponsable
  const peutQuitter = estIntervenant && !estResponsable
  const peutLiberer = estResponsable
  const disabled = Boolean(actionLoading)

  return (
    <article className="card" style={{ display: 'flex', flexDirection: 'column', gap: '10px', borderRadius: '8px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '10px', alignItems: 'flex-start' }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: '13px', fontWeight: 800, color: '#185FA5', wordBreak: 'break-word' }}>
            {depannage.regie?.nom || 'Régie non assignée'}
          </div>
          <div style={{ fontSize: '15px', fontWeight: 700, color: '#1a1a1a', marginTop: '4px', wordBreak: 'break-word' }}>
            {depannage.adresse || 'Adresse non définie'}
          </div>
        </div>
      </div>

      <DepannageStatusBadge
        statut={depannage.statut}
        prisParLabel={responsableLabel}
        intervenantsMultiples={equipe.length > 1}
      />

      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '12px', color: '#555' }}>
        <div><strong>Resp. :</strong> {responsableLabel || 'Aucun'}</div>
        <div><strong>Équipe :</strong> {autresIntervenants.length > 0 ? autresIntervenants.map(getInitiales).filter(Boolean).join(', ') : 'Aucun autre'}</div>
      </div>

      {(peutPrendre || peutRejoindre || peutQuitter || peutLiberer) && (
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', paddingTop: '2px' }}>
          {peutPrendre && (
            <button
              type="button"
              onClick={() => onAction('prendre', depannage)}
              disabled={disabled}
              style={{ ...ACTION_STYLE, background: '#185FA5', color: 'white', border: 'none' }}
            >
              Prendre
            </button>
          )}
          {peutRejoindre && (
            <button
              type="button"
              onClick={() => onAction('rejoindre', depannage)}
              disabled={disabled}
              style={{ ...ACTION_STYLE, background: '#E6F1FB', color: '#185FA5', border: '1px solid #185FA5' }}
            >
              Rejoindre
            </button>
          )}
          {peutQuitter && (
            <button
              type="button"
              onClick={() => onAction('quitter', depannage)}
              disabled={disabled}
              style={{ ...ACTION_STYLE, background: 'white', color: '#A32D2D', border: '1px solid #f09595' }}
            >
              Quitter
            </button>
          )}
          {peutLiberer && (
            <button
              type="button"
              onClick={() => onAction('liberer', depannage)}
              disabled={disabled}
              style={{ ...ACTION_STYLE, background: '#FAEEDA', color: '#8A5A10', border: '1px solid #BA7517' }}
            >
              Libérer
            </button>
          )}
        </div>
      )}
    </article>
  )
}

function getEquipeSansDoublon(depannage) {
  const byId = new Map()

  if (depannage.pris_par && depannage.pris_par_user) {
    byId.set(String(depannage.pris_par), {
      ...depannage.pris_par_user,
      id: depannage.pris_par
    })
  }

  for (const intervenant of depannage.depannage_intervenants || []) {
    const id = intervenant.employe_id || intervenant.employe?.id
    if (!id || byId.has(String(id))) continue
    byId.set(String(id), {
      ...(intervenant.employe || {}),
      id
    })
  }

  return Array.from(byId.values())
}
