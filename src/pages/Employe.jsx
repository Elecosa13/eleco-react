import React, { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../lib/auth-context'
import { usePageRefresh } from '../lib/refresh'
import PageHeader from '../components/PageHeader'
import PageTopActions from '../components/PageTopActions'
import { fetchDossiersATraiterV1, fetchDossiersV1 } from '../services/dossiers.service'

const VIEWS = [
  { id: 'a_traiter', label: 'A traiter' },
  { id: 'depannage', label: 'Depannages' },
  { id: 'chantier', label: 'Chantiers' }
]

function normalizeSearch(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
}

function formatDate(dateStr) {
  if (!dateStr) return ''
  return new Date(dateStr).toLocaleDateString('fr-CH', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric'
  })
}

function getDossierTitle(dossier) {
  return dossier.numero_affaire || dossier.description || 'Dossier sans numero'
}

function dossierMatchesSearch(dossier, search) {
  if (!search) return true
  return [
    dossier.numero_affaire,
    dossier.description,
    dossier.adresse_chantier,
    dossier.client_nom,
    dossier.statut
  ].some(value => normalizeSearch(value).includes(search))
}

function DossierCard({ dossier }) {
  return (
    <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', alignItems: 'flex-start' }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontWeight: 700, fontSize: '15px', color: '#1f2933', overflowWrap: 'anywhere' }}>
            {getDossierTitle(dossier)}
          </div>
          {dossier.client_nom && (
            <div style={{ fontSize: '12px', color: '#607080', marginTop: '2px', overflowWrap: 'anywhere' }}>
              {dossier.client_nom}
            </div>
          )}
        </div>
        <span className="badge badge-blue" style={{ whiteSpace: 'nowrap' }}>
          {dossier.statut || 'Sans statut'}
        </span>
      </div>

      {dossier.description && dossier.description !== dossier.numero_affaire && (
        <div style={{ fontSize: '13px', color: '#334155', overflowWrap: 'anywhere' }}>
          {dossier.description}
        </div>
      )}

      <div style={{ display: 'grid', gap: '4px', fontSize: '12px', color: '#64748b' }}>
        {dossier.adresse_chantier && <span>{dossier.adresse_chantier}</span>}
        <span>
          {dossier.type || 'dossier'}
          {dossier.created_at ? ` - cree le ${formatDate(dossier.created_at)}` : ''}
        </span>
      </div>
    </div>
  )
}

export default function Employe() {
  const navigate = useNavigate()
  const { profile: user, signOut } = useAuth()
  const [activeView, setActiveView] = useState('a_traiter')
  const [dossiers, setDossiers] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')

  async function charger() {
    setLoading(true)
    setError('')
    try {
      const data = activeView === 'a_traiter'
        ? await fetchDossiersATraiterV1()
        : await fetchDossiersV1({ type: activeView })
      setDossiers(data)
    } catch (err) {
      console.error('Erreur chargement dossiers V1 employe', err)
      setError("Impossible de charger les dossiers V1 pour l'instant.")
      setDossiers([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    charger()
  }, [activeView])

  const refreshPage = usePageRefresh(() => charger(), [activeView])

  const filteredDossiers = useMemo(() => {
    const term = normalizeSearch(search)
    return dossiers.filter(dossier => dossierMatchesSearch(dossier, term))
  }, [dossiers, search])

  const title = VIEWS.find(view => view.id === activeView)?.label || 'Dossiers'

  return (
    <div className="app">
      <PageHeader
        title="Espace employe"
        subtitle={user?.nom || user?.email || ''}
        rightSlot={
          <PageTopActions
            navigate={navigate}
            fallbackPath="/employe"
            onRefresh={refreshPage}
            refreshing={loading}
            showBack={false}
          />
        }
      />

      <div className="container" style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '10px', alignItems: 'center' }}>
          <div>
            <div style={{ fontSize: '12px', color: '#64748b' }}>Vue V1 reelle</div>
            <h1 style={{ margin: 0, fontSize: '22px', color: '#1f2933' }}>{title}</h1>
          </div>
          <button type="button" className="btn-secondary btn-sm" style={{ width: 'auto' }} onClick={signOut}>
            Deconnexion
          </button>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: '8px' }}>
          {VIEWS.map(view => {
            const active = activeView === view.id
            return (
              <button
                key={view.id}
                type="button"
                onClick={() => setActiveView(view.id)}
                style={{
                  minHeight: '42px',
                  borderRadius: '8px',
                  border: active ? '1px solid #185FA5' : '1px solid #d9e2ec',
                  background: active ? '#E6F1FB' : '#fff',
                  color: active ? '#185FA5' : '#334155',
                  fontWeight: 700,
                  fontSize: '13px',
                  cursor: 'pointer'
                }}
              >
                {view.label}
              </button>
            )
          })}
        </div>

        <input
          type="search"
          placeholder="Rechercher par affaire, client, adresse ou statut"
          value={search}
          onChange={event => setSearch(event.target.value)}
          style={{
            width: '100%',
            padding: '11px 12px',
            borderRadius: '8px',
            border: '1px solid #d9e2ec',
            fontSize: '14px',
            boxSizing: 'border-box'
          }}
        />

        {error && (
          <div style={{ background: '#FCEBEB', border: '1px solid #f09595', borderRadius: '8px', padding: '10px 14px', fontSize: '13px', color: '#A32D2D' }}>
            {error}
          </div>
        )}

        {loading && (
          <div className="card" style={{ fontSize: '13px', color: '#64748b', textAlign: 'center' }}>
            Chargement des dossiers...
          </div>
        )}

        {!loading && filteredDossiers.length === 0 && (
          <div className="card" style={{ fontSize: '13px', color: '#64748b', textAlign: 'center' }}>
            Aucun dossier trouve.
          </div>
        )}

        {!loading && filteredDossiers.map(dossier => (
          <DossierCard key={dossier.id} dossier={dossier} />
        ))}
      </div>
    </div>
  )
}
