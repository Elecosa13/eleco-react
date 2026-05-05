import React, { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../lib/auth-context'
import { supabase } from '../lib/supabase'
import { usePageRefresh } from '../lib/refresh'

const BLUE = '#185FA5'
const ORANGE = '#d68910'
const CARD_BORDER = '#D8E3EF'
const ITEM_BORDER = '#E7EDF5'
const LABEL_STYLE = {
  fontSize: '11px',
  color: '#6D7B8A',
  textTransform: 'uppercase',
  letterSpacing: '0.06em',
  fontWeight: 700
}

function initialsFromName(name) {
  return String(name || '')
    .trim()
    .slice(0, 2)
    .toUpperCase()
}

function formatDate(value) {
  if (!value) return 'Date inconnue'
  return new Date(value).toLocaleDateString('fr-CH', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric'
  })
}

function monthKey(value) {
  if (!value) return 'Sans date'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'Sans date'
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
}

function monthLabel(key) {
  if (key === 'Sans date') return key
  const [year, month] = key.split('-').map(Number)
  return new Date(year, month - 1, 1).toLocaleDateString('fr-CH', {
    month: 'long',
    year: 'numeric'
  })
}

function normalizeStatus(status) {
  return String(status || 'Sans statut').replace(/_/g, ' ')
}

function statusBadgeStyle(status) {
  const raw = String(status || '').toLowerCase()
  if (raw.includes('cours') || raw.includes('traiter')) {
    return { background: '#FEF3E2', color: '#9A5A00', border: '1px solid #F6D6A5' }
  }
  if (raw.includes('termine') || raw.includes('fait') || raw.includes('valide')) {
    return { background: '#EAF3DE', color: '#3B6D11', border: '1px solid #C9E2AF' }
  }
  return { background: '#E6F1FB', color: BLUE, border: '1px solid #BFD7EF' }
}

function groupByMonth(dossiers) {
  const groups = {}
  for (const dossier of dossiers || []) {
    const key = monthKey(dossier.created_at)
    if (!groups[key]) groups[key] = []
    groups[key].push(dossier)
  }
  return Object.entries(groups)
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([key, items]) => ({ key, label: monthLabel(key), items }))
}

function countByClient(dossiers) {
  const counts = {}
  for (const dossier of dossiers || []) {
    const key = String(dossier.client_id || '')
    counts[key] = (counts[key] || 0) + 1
  }
  return counts
}

function Header({ title, canGoBack, onBack, user, onLogout, onRefresh }) {
  const initials = initialsFromName(user?.nom || user?.email || '??')
  return (
    <div style={{ background: '#fff', borderBottom: `1px solid ${CARD_BORDER}`, padding: '12px 16px', display: 'grid', gridTemplateColumns: '44px 1fr auto', alignItems: 'center', gap: '10px', position: 'sticky', top: 0, zIndex: 10 }}>
      <div>
        {canGoBack && (
          <button
            type="button"
            onClick={onBack}
            style={{ width: '38px', height: '38px', borderRadius: '10px', border: `1px solid ${CARD_BORDER}`, background: '#fff', color: BLUE, fontSize: '18px', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}
            aria-label="Retour"
          >
            ←
          </button>
        )}
      </div>
      <div style={{ textAlign: 'center', minWidth: 0 }}>
        <div style={{ fontSize: '16px', fontWeight: 800, color: '#111827', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{title}</div>
        <div style={{ fontSize: '11px', color: '#6D7B8A', marginTop: '2px' }}>Espace employé</div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
        {onRefresh && (
          <button
            type="button"
            onClick={onRefresh}
            title="Actualiser"
            style={{ width: '38px', height: '38px', borderRadius: '10px', border: `1px solid ${CARD_BORDER}`, background: '#fff', color: '#6D7B8A', fontSize: '18px', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}
            aria-label="Actualiser"
          >
            ↻
          </button>
        )}
        <button
          type="button"
          onClick={onLogout}
          title="Déconnexion"
          style={{ width: '38px', height: '38px', borderRadius: '50%', border: 'none', background: '#FAEEDA', color: '#BA7517', fontSize: '12px', fontWeight: 800, cursor: 'pointer' }}
        >
          {initials}
        </button>
      </div>
    </div>
  )
}

function Tile({ title, subtitle, color, background, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{ minHeight: '112px', borderRadius: '12px', border: `1px solid ${color}`, background, cursor: 'pointer', padding: '18px 12px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '8px', textAlign: 'center' }}
    >
      <div style={{ fontSize: '15px', fontWeight: 800, color }}>{title}</div>
      <div style={{ fontSize: '11px', color: '#566170' }}>{subtitle}</div>
    </button>
  )
}

function Card({ children, style }) {
  return (
    <div style={{ background: '#fff', border: `1px solid ${CARD_BORDER}`, borderRadius: '10px', padding: '14px', ...style }}>
      {children}
    </div>
  )
}

function ListRow({ title, subtitle, meta, badge, onClick }) {
  const [pressed, setPressed] = useState(false)
  return (
    <div
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onClick={onClick}
      onKeyDown={event => {
        if (!onClick) return
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault()
          onClick()
        }
      }}
      onPointerDown={() => onClick && setPressed(true)}
      onPointerUp={() => setPressed(false)}
      onPointerLeave={() => setPressed(false)}
      style={{ borderBottom: `1px solid ${ITEM_BORDER}`, padding: '12px 2px', display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto', alignItems: 'center', gap: '12px', cursor: onClick ? 'pointer' : 'default', opacity: pressed ? 0.6 : 1, transition: 'opacity 0.1s' }}
    >
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: '14px', fontWeight: 800, color: '#1F2937', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{title}</div>
        {subtitle && <div style={{ fontSize: '12px', color: '#64748B', marginTop: '3px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{subtitle}</div>}
        {meta && <div style={{ fontSize: '11px', color: '#6D7B8A', marginTop: '4px' }}>{meta}</div>}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        {badge}
        {onClick && <span style={{ color: BLUE, fontSize: '18px', lineHeight: 1 }}>›</span>}
      </div>
    </div>
  )
}

function CountBadge({ count, label }) {
  return (
    <span style={{ borderRadius: '999px', padding: '4px 8px', background: '#F8FAFC', border: `1px solid ${CARD_BORDER}`, color: '#475569', fontSize: '11px', fontWeight: 700, whiteSpace: 'nowrap' }}>
      {count} {label}{count !== 1 ? 's' : ''}
    </span>
  )
}

function StatusBadge({ status }) {
  return (
    <span style={{ ...statusBadgeStyle(status), borderRadius: '999px', padding: '4px 8px', fontSize: '10px', fontWeight: 800, whiteSpace: 'nowrap' }}>
      {normalizeStatus(status)}
    </span>
  )
}

export default function Employe() {
  const navigate = useNavigate()
  const { profile: user, signOut } = useAuth()

  const [view, setView] = useState('accueil')
  const [regies, setRegies] = useState([])
  const [intermediaires, setIntermediaires] = useState([])
  const [depannagesIndex, setDepannagesIndex] = useState([])
  const [chantiersIndex, setChantiersIndex] = useState([])
  const [selectedRegie, setSelectedRegie] = useState(null)
  const [selectedRegieDossiers, setSelectedRegieDossiers] = useState([])
  const [selectedMonth, setSelectedMonth] = useState(null)
  const [selectedIntermediaire, setSelectedIntermediaire] = useState(null)
  const [selectedChantiers, setSelectedChantiers] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const refreshPage = usePageRefresh(() => {
    if (view === 'depannages') return loadDepannagesHome()
    if (view === 'depannages-regie' && selectedRegie) return openRegie(selectedRegie)
    if (view === 'chantiers') return loadChantiersHome()
    if (view === 'chantiers-intermediaire' && selectedIntermediaire) return openIntermediaire(selectedIntermediaire)
  }, [view, selectedRegie, selectedIntermediaire])

  const regieCounts = useMemo(() => countByClient(depannagesIndex), [depannagesIndex])
  const chantierCounts = useMemo(() => countByClient(chantiersIndex), [chantiersIndex])
  const depannageMonths = useMemo(() => groupByMonth(selectedRegieDossiers), [selectedRegieDossiers])
  const depannagesDuMois = useMemo(() => {
    if (!selectedMonth) return []
    return selectedRegieDossiers.filter(dossier => monthKey(dossier.created_at) === selectedMonth)
  }, [selectedRegieDossiers, selectedMonth])

  const title = (() => {
    if (view === 'depannages-regie' && selectedRegie) return selectedRegie.nom
    if (view === 'depannages-mois' && selectedMonth) return monthLabel(selectedMonth)
    if (view === 'chantiers-intermediaire' && selectedIntermediaire) return selectedIntermediaire.nom
    if (view === 'depannages') return 'Dépannages'
    if (view === 'chantiers') return 'Chantiers'
    if (view === 'autres') return 'Autres'
    return 'Accueil'
  })()

  useEffect(() => {
    if (view === 'depannages') loadDepannagesHome()
    if (view === 'chantiers') loadChantiersHome()
  }, [view])

  useEffect(() => {
    function handlePop() {
      goBack()
    }
    window.addEventListener('popstate', handlePop)
    return () => window.removeEventListener('popstate', handlePop)
  }, [view, selectedRegie, selectedMonth, selectedIntermediaire])

  async function logout() {
    await signOut()
    navigate('/login', { replace: true })
  }

  async function navigateForward(next) {
    window.history.pushState(null, '')
    try {
      await next()
    } catch (err) {
      console.error('Erreur navigation', err)
      setError('Une erreur est survenue.')
    }
  }

  function goAccueil() {
    setView('accueil')
    setSelectedRegie(null)
    setSelectedRegieDossiers([])
    setSelectedMonth(null)
    setSelectedIntermediaire(null)
    setSelectedChantiers([])
    setLoading(false)
    setError('')
  }

  function goBack() {
    setLoading(false)
    setError('')
    if (view === 'depannages-mois') {
      setSelectedMonth(null)
      setView('depannages-regie')
      return
    }
    if (view === 'depannages-regie') {
      setSelectedRegie(null)
      setSelectedRegieDossiers([])
      setView('depannages')
      return
    }
    if (view === 'chantiers-intermediaire') {
      setSelectedIntermediaire(null)
      setSelectedChantiers([])
      setView('chantiers')
      return
    }
    goAccueil()
  }

  async function loadDepannagesHome() {
    setLoading(true)
    setError('')
    try {
      const [{ data: clients, error: clientsError }, { data: dossiers, error: dossiersError }] = await Promise.all([
        supabase.from('clients').select('id, nom').eq('type', 'regie').order('nom'),
        supabase.from('dossiers').select('id, client_id').eq('type', 'depannage')
      ])
      if (clientsError) throw clientsError
      if (dossiersError) throw dossiersError
      setRegies(clients || [])
      setDepannagesIndex(dossiers || [])
    } catch (err) {
      console.error('Erreur chargement régies employé', err)
      setError('Impossible de charger les régies.')
      setRegies([])
      setDepannagesIndex([])
    } finally {
      setLoading(false)
    }
  }

  async function openRegie(regie) {
    navigateForward(async () => {
      setLoading(true)
      setError('')
      setSelectedRegie(regie)
      setSelectedMonth(null)
      setView('depannages-regie')
      try {
        const { data, error: requestError } = await supabase
          .from('dossiers')
          .select('id, numero_affaire, adresse_chantier, statut, created_at')
          .eq('type', 'depannage')
          .eq('client_id', regie.id)
          .order('created_at', { ascending: false })
        if (requestError) throw requestError
        setSelectedRegieDossiers(data || [])
      } catch (err) {
        console.error('Erreur chargement dépannages régie employé', err)
        setError('Impossible de charger les dépannages de cette régie.')
        setSelectedRegieDossiers([])
      } finally {
        setLoading(false)
      }
    })
  }

  function openMonth(key) {
    navigateForward(() => {
      setSelectedMonth(key)
      setView('depannages-mois')
      setError('')
    })
  }

  async function loadChantiersHome() {
    setLoading(true)
    setError('')
    try {
      const [{ data: clients, error: clientsError }, { data: dossiers, error: dossiersError }] = await Promise.all([
        supabase.from('clients').select('id, nom').eq('type', 'intermediaire').order('nom'),
        supabase.from('dossiers').select('id, client_id').eq('type', 'chantier')
      ])
      if (clientsError) throw clientsError
      if (dossiersError) throw dossiersError
      setIntermediaires(clients || [])
      setChantiersIndex(dossiers || [])
    } catch (err) {
      console.error('Erreur chargement intermédiaires employé', err)
      setError('Impossible de charger les intermédiaires.')
      setIntermediaires([])
      setChantiersIndex([])
    } finally {
      setLoading(false)
    }
  }

  async function openIntermediaire(intermediaire) {
    navigateForward(async () => {
      setLoading(true)
      setError('')
      setSelectedIntermediaire(intermediaire)
      setView('chantiers-intermediaire')
      try {
        const { data, error: requestError } = await supabase
          .from('dossiers')
          .select('id, numero_affaire, adresse_chantier, statut, created_at')
          .eq('type', 'chantier')
          .eq('client_id', intermediaire.id)
          .order('created_at', { ascending: false })
        if (requestError) throw requestError
        setSelectedChantiers(data || [])
      } catch (err) {
        console.error('Erreur chargement chantiers intermédiaire employé', err)
        setError('Impossible de charger les chantiers de cet intermédiaire.')
        setSelectedChantiers([])
      } finally {
        setLoading(false)
      }
    })
  }

  function renderLoading() {
    if (!loading) return null
    return <Card style={{ textAlign: 'center', color: '#64748B', fontSize: '13px' }}>Chargement...</Card>
  }

  function renderError() {
    if (!error) return null
    return (
      <div style={{ background: '#FCEBEB', border: '1px solid #F09595', borderRadius: '8px', padding: '10px 14px', fontSize: '13px', color: '#A32D2D' }}>
        {error}
      </div>
    )
  }

  function renderAccueil() {
    return (
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
        <Tile
          title="Dépannages"
          subtitle="Régies et bons"
          color={ORANGE}
          background="#FEF3E2"
          onClick={() => navigateForward(() => setView('depannages'))}
        />
        <Tile
          title="Chantiers"
          subtitle="Intermédiaires et dossiers"
          color={BLUE}
          background="#E6F1FB"
          onClick={() => navigateForward(() => setView('chantiers'))}
        />
        <div style={{ gridColumn: '1 / -1' }}>
          <Tile
            title="Autres"
            subtitle="À venir"
            color="#6B7280"
            background="#F3F4F6"
            onClick={() => navigateForward(() => setView('autres'))}
          />
        </div>
      </div>
    )
  }

  function renderDepannagesHome() {
    return (
      <Card style={{ paddingTop: '8px', paddingBottom: 0 }}>
        <div style={{ ...LABEL_STYLE, marginBottom: '4px' }}>Régies</div>
        {!loading && regies.length === 0 && <div style={{ padding: '24px 0', textAlign: 'center', color: '#64748B', fontSize: '13px' }}>Aucune régie</div>}
        {regies.map(regie => (
          <ListRow
            key={regie.id}
            title={regie.nom || 'Régie sans nom'}
            badge={<CountBadge count={regieCounts[String(regie.id)] || 0} label="dépannage" />}
            onClick={() => openRegie(regie)}
          />
        ))}
      </Card>
    )
  }

  function renderDepannageMonths() {
    return (
      <Card style={{ paddingTop: '8px', paddingBottom: 0 }}>
        <div style={{ ...LABEL_STYLE, marginBottom: '4px' }}>Mois</div>
        {!loading && depannageMonths.length === 0 && <div style={{ padding: '24px 0', textAlign: 'center', color: '#64748B', fontSize: '13px' }}>Aucun dépannage</div>}
        {depannageMonths.map(month => (
          <ListRow
            key={month.key}
            title={month.label}
            badge={<CountBadge count={month.items.length} label="dossier" />}
            onClick={() => openMonth(month.key)}
          />
        ))}
      </Card>
    )
  }

  function renderDepannageList() {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <button
            type="button"
            onClick={() => navigateForward(() => navigate('/employe/depannage'))}
            style={{ width: '42px', height: '42px', borderRadius: '12px', border: 'none', background: ORANGE, color: '#fff', fontSize: '24px', lineHeight: '42px', cursor: 'pointer', fontWeight: 700 }}
            aria-label="Nouveau dépannage"
          >
            +
          </button>
        </div>
        <Card style={{ paddingTop: '8px', paddingBottom: 0 }}>
          <div style={{ ...LABEL_STYLE, marginBottom: '4px' }}>Dépannages</div>
          {!loading && depannagesDuMois.length === 0 && <div style={{ padding: '24px 0', textAlign: 'center', color: '#64748B', fontSize: '13px' }}>Aucun dépannage ce mois</div>}
          {depannagesDuMois.map(dossier => (
            <ListRow
              key={dossier.id}
              title={dossier.numero_affaire || 'Bon sans numéro'}
              subtitle={dossier.adresse_chantier || 'Adresse non renseignée'}
              meta={formatDate(dossier.created_at)}
              badge={<StatusBadge status={dossier.statut} />}
            />
          ))}
        </Card>
      </div>
    )
  }

  function renderChantiersHome() {
    return (
      <Card style={{ paddingTop: '8px', paddingBottom: 0 }}>
        <div style={{ ...LABEL_STYLE, marginBottom: '4px' }}>Intermédiaires</div>
        {!loading && intermediaires.length === 0 && <div style={{ padding: '24px 0', textAlign: 'center', color: '#64748B', fontSize: '13px' }}>Aucun intermédiaire</div>}
        {intermediaires.map(intermediaire => (
          <ListRow
            key={intermediaire.id}
            title={intermediaire.nom || 'Intermédiaire sans nom'}
            badge={<CountBadge count={chantierCounts[String(intermediaire.id)] || 0} label="chantier" />}
            onClick={() => openIntermediaire(intermediaire)}
          />
        ))}
      </Card>
    )
  }

  function renderChantierList() {
    return (
      <Card style={{ paddingTop: '8px', paddingBottom: 0 }}>
        <div style={{ ...LABEL_STYLE, marginBottom: '4px' }}>Chantiers</div>
        {!loading && selectedChantiers.length === 0 && <div style={{ padding: '24px 0', textAlign: 'center', color: '#64748B', fontSize: '13px' }}>Aucun chantier</div>}
        {selectedChantiers.map(dossier => (
          <ListRow
            key={dossier.id}
            title={dossier.numero_affaire || 'Chantier sans numéro'}
            subtitle={dossier.adresse_chantier || 'Adresse non renseignée'}
            meta={formatDate(dossier.created_at)}
            badge={<StatusBadge status={dossier.statut} />}
          />
        ))}
      </Card>
    )
  }

  function renderAutres() {
    return <Card style={{ textAlign: 'center', color: '#64748B', fontSize: '13px', padding: '28px' }}>Aucun contenu pour l'instant.</Card>
  }

  function renderContent() {
    if (view === 'accueil') return renderAccueil()
    if (view === 'depannages') return renderDepannagesHome()
    if (view === 'depannages-regie') return renderDepannageMonths()
    if (view === 'depannages-mois') return renderDepannageList()
    if (view === 'chantiers') return renderChantiersHome()
    if (view === 'chantiers-intermediaire') return renderChantierList()
    if (view === 'autres') return renderAutres()
    return renderAccueil()
  }

  return (
    <div style={{ minHeight: '100vh', background: '#F5F7FA' }}>
      <Header
        title={title}
        canGoBack={view !== 'accueil'}
        onBack={goBack}
        user={user}
        onLogout={logout}
        onRefresh={view !== 'accueil' ? refreshPage : undefined}
      />
      <main style={{ padding: '14px', display: 'flex', flexDirection: 'column', gap: '12px', maxWidth: '760px', margin: '0 auto' }}>
        {renderError()}
        {renderLoading()}
        {renderContent()}
      </main>
    </div>
  )
}
