import React, { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../lib/auth-context'
import { usePageRefresh } from '../lib/refresh'
import PageHeader from '../components/PageHeader'
import PageTopActions from '../components/PageTopActions'
import { fetchDossiersATraiterV1, fetchDossiersV1 } from '../services/dossiers.service'
import { creerRapportEmployeV1, fetchCatalogueEmployeV1 } from '../services/rapportsV1.service'

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

function DossierCard({ dossier, onCreateRapport }) {
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

      <div style={{ display: 'flex', justifyContent: 'flex-end', paddingTop: '4px' }}>
        <button type="button" className="btn-primary btn-sm" style={{ width: 'auto' }} onClick={() => onCreateRapport(dossier)}>
          Creer rapport
        </button>
      </div>
    </div>
  )
}

function createEmptyMateriel() {
  return {
    catalogueId: '',
    reference: '',
    nom: '',
    unite: '',
    quantite: 1
  }
}

export default function Employe() {
  const navigate = useNavigate()
  const { profile: user, signOut } = useAuth()
  const [activeView, setActiveView] = useState('a_traiter')
  const [dossiers, setDossiers] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [rapportDossier, setRapportDossier] = useState(null)
  const [rapportDate, setRapportDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [rapportHeures, setRapportHeures] = useState('')
  const [rapportHeuresDeplacement, setRapportHeuresDeplacement] = useState('0')
  const [rapportNotes, setRapportNotes] = useState('')
  const [materiaux, setMateriaux] = useState([])
  const [catalogue, setCatalogue] = useState([])
  const [catalogueLoading, setCatalogueLoading] = useState(false)
  const [rapportSubmitting, setRapportSubmitting] = useState(false)
  const [rapportError, setRapportError] = useState('')
  const [rapportSuccess, setRapportSuccess] = useState('')

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

  async function ouvrirRapport(dossier) {
    setRapportDossier(dossier)
    setRapportDate(new Date().toISOString().slice(0, 10))
    setRapportHeures('')
    setRapportHeuresDeplacement('0')
    setRapportNotes('')
    setMateriaux([])
    setRapportError('')
    setRapportSuccess('')

    if (catalogue.length === 0) {
      setCatalogueLoading(true)
      try {
        setCatalogue(await fetchCatalogueEmployeV1())
      } catch (err) {
        console.error('Erreur chargement catalogue employe V1', err)
        setRapportError("Impossible de charger le catalogue employe.")
      } finally {
        setCatalogueLoading(false)
      }
    }
  }

  function fermerRapport() {
    if (rapportSubmitting) return
    setRapportDossier(null)
    setRapportError('')
    setRapportSuccess('')
  }

  function ajouterMateriel() {
    setMateriaux(items => [...items, createEmptyMateriel()])
  }

  function modifierMateriel(index, patch) {
    setMateriaux(items => items.map((item, itemIndex) => (
      itemIndex === index ? { ...item, ...patch } : item
    )))
  }

  function choisirMateriel(index, catalogueId) {
    const article = catalogue.find(item => item.id === catalogueId)
    modifierMateriel(index, {
      catalogueId,
      reference: article?.reference || '',
      nom: article?.nom || '',
      unite: article?.unite || ''
    })
  }

  function retirerMateriel(index) {
    setMateriaux(items => items.filter((_, itemIndex) => itemIndex !== index))
  }

  async function envoyerRapport(event) {
    event.preventDefault()
    if (!rapportDossier || !rapportDate || Number(rapportHeures) <= 0) {
      setRapportError('Date et heures travaillees sont obligatoires.')
      return
    }

    setRapportSubmitting(true)
    setRapportError('')
    setRapportSuccess('')

    try {
      await creerRapportEmployeV1({
        dossierId: rapportDossier.id,
        employeId: user?.id,
        dateIntervention: rapportDate,
        heures: rapportHeures,
        heuresDeplacement: rapportHeuresDeplacement,
        materiaux,
        notes: rapportNotes
      })
      setRapportSuccess('Rapport envoye.')
      await charger()
      setTimeout(() => {
        setRapportDossier(null)
        setRapportSuccess('')
      }, 900)
    } catch (err) {
      console.error('Erreur creation rapport V1 employe', err)
      setRapportError("Impossible d'envoyer le rapport.")
    } finally {
      setRapportSubmitting(false)
    }
  }

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
          <DossierCard key={dossier.id} dossier={dossier} onCreateRapport={ouvrirRapport} />
        ))}
      </div>

      {rapportDossier && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15, 23, 42, 0.45)', zIndex: 40, display: 'flex', alignItems: 'flex-end', justifyContent: 'center', padding: '14px' }}>
          <form onSubmit={envoyerRapport} className="card" style={{ width: '100%', maxWidth: '560px', maxHeight: '92vh', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', alignItems: 'flex-start' }}>
              <div>
                <div style={{ fontSize: '12px', color: '#64748b' }}>Rapport employe</div>
                <div style={{ fontWeight: 800, fontSize: '16px', color: '#1f2933' }}>{getDossierTitle(rapportDossier)}</div>
              </div>
              <button type="button" className="btn-secondary btn-sm" style={{ width: 'auto' }} onClick={fermerRapport}>
                Fermer
              </button>
            </div>

            <label style={{ display: 'grid', gap: '5px', fontSize: '13px', color: '#334155', fontWeight: 700 }}>
              Date intervention
              <input type="date" value={rapportDate} onChange={event => setRapportDate(event.target.value)} required style={{ padding: '10px', borderRadius: '8px', border: '1px solid #d9e2ec', fontSize: '14px' }} />
            </label>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '10px' }}>
              <label style={{ display: 'grid', gap: '5px', fontSize: '13px', color: '#334155', fontWeight: 700 }}>
                Heures
                <input type="number" min="0" step="0.25" value={rapportHeures} onChange={event => setRapportHeures(event.target.value)} required style={{ padding: '10px', borderRadius: '8px', border: '1px solid #d9e2ec', fontSize: '14px' }} />
              </label>
              <label style={{ display: 'grid', gap: '5px', fontSize: '13px', color: '#334155', fontWeight: 700 }}>
                Deplacement
                <input type="number" min="0" step="0.25" value={rapportHeuresDeplacement} onChange={event => setRapportHeuresDeplacement(event.target.value)} required style={{ padding: '10px', borderRadius: '8px', border: '1px solid #d9e2ec', fontSize: '14px' }} />
              </label>
            </div>

            <label style={{ display: 'grid', gap: '5px', fontSize: '13px', color: '#334155', fontWeight: 700 }}>
              Notes
              <textarea value={rapportNotes} onChange={event => setRapportNotes(event.target.value)} rows={3} style={{ padding: '10px', borderRadius: '8px', border: '1px solid #d9e2ec', fontSize: '14px', resize: 'vertical' }} />
            </label>

            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '10px', alignItems: 'center' }}>
              <div style={{ fontWeight: 800, fontSize: '14px', color: '#1f2933' }}>Materiel</div>
              <button type="button" className="btn-secondary btn-sm" style={{ width: 'auto' }} onClick={ajouterMateriel} disabled={catalogueLoading}>
                Ajouter
              </button>
            </div>

            {catalogueLoading && <div style={{ fontSize: '13px', color: '#64748b' }}>Chargement catalogue...</div>}

            {materiaux.map((item, index) => (
              <div key={index} style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 90px 42px', gap: '8px', alignItems: 'end' }}>
                <label style={{ display: 'grid', gap: '5px', fontSize: '12px', color: '#334155', fontWeight: 700 }}>
                  Article
                  <select value={item.catalogueId} onChange={event => choisirMateriel(index, event.target.value)} style={{ minWidth: 0, padding: '10px', borderRadius: '8px', border: '1px solid #d9e2ec', fontSize: '13px' }}>
                    <option value="">Choisir</option>
                    {catalogue.map(article => (
                      <option key={article.id} value={article.id}>
                        {[article.reference, article.nom, article.unite].filter(Boolean).join(' - ')}
                      </option>
                    ))}
                  </select>
                </label>
                <label style={{ display: 'grid', gap: '5px', fontSize: '12px', color: '#334155', fontWeight: 700 }}>
                  Qte
                  <input type="number" min="0" step="0.01" value={item.quantite} onChange={event => modifierMateriel(index, { quantite: event.target.value })} style={{ padding: '10px', borderRadius: '8px', border: '1px solid #d9e2ec', fontSize: '13px' }} />
                </label>
                <button type="button" className="btn-secondary btn-sm" style={{ width: '42px', height: '40px', padding: 0 }} onClick={() => retirerMateriel(index)}>
                  X
                </button>
              </div>
            ))}

            {rapportError && <div style={{ background: '#FCEBEB', border: '1px solid #f09595', borderRadius: '8px', padding: '10px', fontSize: '13px', color: '#A32D2D' }}>{rapportError}</div>}
            {rapportSuccess && <div style={{ background: '#EAF7EA', border: '1px solid #9fd39f', borderRadius: '8px', padding: '10px', fontSize: '13px', color: '#2D6B2D' }}>{rapportSuccess}</div>}

            <button type="submit" className="btn-primary" disabled={rapportSubmitting || catalogueLoading}>
              {rapportSubmitting ? 'Envoi...' : 'Envoyer le rapport'}
            </button>
          </form>
        </div>
      )}
    </div>
  )
}
