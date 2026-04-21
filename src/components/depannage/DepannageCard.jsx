import React, { useMemo, useState } from 'react'
import DepannageStatusBadge from './DepannageStatusBadge'
import {
  formatPlanningLabel,
  getInitiales,
  isCurrentUserIntervenant,
  isCurrentUserResponsable,
  STATUT_A_TRAITER,
  STATUT_EN_COURS,
  STATUT_INTERVENTION_FAITE,
  STATUT_PLANIFIE,
  STATUT_PRIS
} from '../../services/depannages.service'

const ACTION_STYLE = {
  flex: 1,
  minHeight: '42px',
  borderRadius: '8px',
  padding: '10px 12px',
  fontSize: '13px',
  fontWeight: 700
}

export default function DepannageCard({ depannage, currentUserId, onAction, actionLoading, onClick }) {
  const [planOpen, setPlanOpen] = useState(false)
  const [planDate, setPlanDate] = useState(depannage.date_planifiee || depannage.date_travail || '')
  const [planTime, setPlanTime] = useState(String(depannage.heure_planifiee || '').slice(0, 5))
  const responsableLabel = getInitiales(depannage.pris_par_user)
  const responsableId = depannage.pris_par
  const equipe = getEquipeSansDoublon(depannage)
  const autresIntervenants = equipe.filter(user => String(user.id) !== String(responsableId))
  const estResponsable = isCurrentUserResponsable(depannage, currentUserId)
  const estIntervenant = isCurrentUserIntervenant(depannage, currentUserId)
  const statut = depannage.statut || STATUT_A_TRAITER
  const peutPrendreSansDate = statut === STATUT_A_TRAITER
  const peutPlanifier = statut === STATUT_A_TRAITER || (estResponsable && [STATUT_PRIS, STATUT_PLANIFIE].includes(statut))
  const peutDemarrer = estResponsable && [STATUT_PRIS, STATUT_PLANIFIE].includes(statut)
  const peutRejoindre = statut === STATUT_EN_COURS && !estIntervenant && !estResponsable
  const peutQuitter = estIntervenant && !estResponsable
  const peutLiberer = estResponsable && [STATUT_PRIS, STATUT_PLANIFIE, STATUT_EN_COURS].includes(statut)
  const peutFaireRapport = estResponsable && [STATUT_PRIS, STATUT_PLANIFIE, STATUT_EN_COURS, STATUT_INTERVENTION_FAITE].includes(statut)
  const planningLabel = formatPlanningLabel(depannage)
  const isCurrentAction = useMemo(
    () => Boolean(actionLoading) && String(actionLoading).endsWith(`:${depannage.id}`),
    [actionLoading, depannage.id]
  )

  function soumettrePlanification() {
    if (!planDate) return
    onAction('planifier', depannage, { date: planDate, heure: planTime || null })
    setPlanOpen(false)
  }

  function stopCardClickPropagation(event) {
    event.stopPropagation()
  }

  function handleCardClick(event) {
    if (!cardClickable) return
    onClick(depannage, event)
  }

  function handleCardKeyDown(event) {
    if (event.key !== 'Enter' && event.key !== ' ') return
    event.preventDefault()
    handleCardClick(event)
  }

  const cardClickable = typeof onClick === 'function'

  return (
    <article
      className="card"
      onClick={cardClickable ? handleCardClick : undefined}
      onKeyDown={cardClickable ? handleCardKeyDown : undefined}
      role={cardClickable ? 'button' : undefined}
      tabIndex={cardClickable ? 0 : undefined}
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '10px',
        borderRadius: '8px',
        cursor: cardClickable ? 'pointer' : 'default'
      }}
    >
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
        statut={statut}
        prisParLabel={responsableLabel}
        intervenantsMultiples={equipe.length > 1}
      />

      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '12px', color: '#555' }}>
        <div><strong>Resp. :</strong> {responsableLabel || 'Aucun'}</div>
        <div><strong>Équipe :</strong> {autresIntervenants.length > 0 ? autresIntervenants.map(getInitiales).filter(Boolean).join(', ') : 'Aucun autre'}</div>
        {planningLabel && <div><strong>Planifié :</strong> {planningLabel}</div>}
        {depannage.chantier?.nom && <div><strong>Chantier :</strong> {depannage.chantier.nom}</div>}
      </div>

      {(peutPlanifier || peutPrendreSansDate || peutDemarrer || peutRejoindre || peutQuitter || peutLiberer || peutFaireRapport) && (
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', paddingTop: '2px' }}>
          {peutPlanifier && (
            <button
              type="button"
              onClick={event => {
                stopCardClickPropagation(event)
                setPlanOpen(current => !current)
              }}
              disabled={isCurrentAction}
              style={{ ...ACTION_STYLE, background: '#185FA5', color: 'white', border: 'none' }}
            >
              {statut === STATUT_A_TRAITER ? 'Prendre + planifier' : 'Planifier'}
            </button>
          )}
          {peutPrendreSansDate && (
            <button
              type="button"
              onClick={event => {
                stopCardClickPropagation(event)
                onAction('prendreSansDate', depannage)
              }}
              disabled={isCurrentAction}
              style={{ ...ACTION_STYLE, background: '#FAEEDA', color: '#8A5A10', border: '1px solid #BA7517' }}
            >
              Prendre sans date
            </button>
          )}
          {peutDemarrer && (
            <button
              type="button"
              onClick={event => {
                stopCardClickPropagation(event)
                onAction('demarrer', depannage)
              }}
              disabled={isCurrentAction}
              style={{ ...ACTION_STYLE, background: '#E6F1FB', color: '#185FA5', border: '1px solid #185FA5' }}
            >
              Démarrer
            </button>
          )}
          {peutFaireRapport && (
            <button
              type="button"
              onClick={event => {
                stopCardClickPropagation(event)
                onAction('rapport', depannage)
              }}
              disabled={isCurrentAction}
              style={{ ...ACTION_STYLE, background: 'white', color: '#185FA5', border: '1px solid #185FA5' }}
            >
              Rapport
            </button>
          )}
          {peutRejoindre && (
            <button
              type="button"
              onClick={event => {
                stopCardClickPropagation(event)
                onAction('rejoindre', depannage)
              }}
              disabled={isCurrentAction}
              style={{ ...ACTION_STYLE, background: '#E6F1FB', color: '#185FA5', border: '1px solid #185FA5' }}
            >
              Rejoindre
            </button>
          )}
          {peutQuitter && (
            <button
              type="button"
              onClick={event => {
                stopCardClickPropagation(event)
                onAction('quitter', depannage)
              }}
              disabled={isCurrentAction}
              style={{ ...ACTION_STYLE, background: 'white', color: '#A32D2D', border: '1px solid #f09595' }}
            >
              Quitter
            </button>
          )}
          {peutLiberer && (
            <button
              type="button"
              onClick={event => {
                stopCardClickPropagation(event)
                onAction('liberer', depannage)
              }}
              disabled={isCurrentAction}
              style={{ ...ACTION_STYLE, background: '#fff7ea', color: '#8A5A10', border: '1px solid #efd19c' }}
            >
              Libérer
            </button>
          )}
        </div>
      )}

      {planOpen && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', borderTop: '1px solid #eee', paddingTop: '10px' }}>
          <div style={{ fontSize: '12px', fontWeight: 700, color: '#185FA5' }}>
            {statut === STATUT_A_TRAITER ? 'Prendre et planifier' : 'Planifier ce dépannage'}
          </div>
          <div className="grid2">
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label>Date</label>
              <input
                type="date"
                value={planDate}
                onClick={stopCardClickPropagation}
                onChange={event => setPlanDate(event.target.value)}
                required
              />
            </div>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label>Heure</label>
              <input
                type="time"
                value={planTime}
                onClick={stopCardClickPropagation}
                onChange={event => setPlanTime(event.target.value)}
              />
            </div>
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              type="button"
              onClick={event => {
                stopCardClickPropagation(event)
                setPlanOpen(false)
              }}
              disabled={isCurrentAction}
              style={{ ...ACTION_STYLE, background: 'white', color: '#555', border: '1px solid #ddd' }}
            >
              Annuler
            </button>
            <button
              type="button"
              onClick={event => {
                stopCardClickPropagation(event)
                soumettrePlanification()
              }}
              disabled={isCurrentAction || !planDate}
              style={{ ...ACTION_STYLE, background: '#185FA5', color: 'white', border: 'none' }}
            >
              Valider
            </button>
          </div>
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
