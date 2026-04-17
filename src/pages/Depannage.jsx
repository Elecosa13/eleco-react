import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth-context'
import { usePageRefresh } from '../lib/refresh'

const DUREES = [1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5, 5.5, 6, 6.5, 7, 7.5, 8]
const FAVORIS_KEY = 'eleco_favoris'
const STATUT_INTERVENTION_FAITE = 'Intervention faite'
const STATUT_RAPPORT_RECU = 'Rapport reçu'

function loadFavoris() {
  try {
    return JSON.parse(localStorage.getItem(FAVORIS_KEY) || '[]')
  } catch (error) {
    console.warn('[Depannage] favoris localStorage indisponible:', error)
    return []
  }
}

function saveFavoris(favoris) {
  try {
    localStorage.setItem(FAVORIS_KEY, JSON.stringify(favoris))
  } catch (error) {
    console.warn('[Depannage] favoris localStorage non sauvegarde:', error)
  }
}

export default function Depannage() {
  const navigate = useNavigate()
  const { profile: user } = useAuth()
  const [adresse, setAdresse] = useState('')
  const [duree, setDuree] = useState(1)
  const [remarques, setRemarques] = useState('')
  const [date, setDate] = useState(new Date().toISOString().split('T')[0])
  const [creditUtilise, setCreditUtilise] = useState(0)
  const [envoi, setEnvoi] = useState(false)
  const [soumissionVerrouillee, setSoumissionVerrouillee] = useState(false)
  const [succes, setSucces] = useState(false)
  const [materiaux, setMateriaux] = useState([])
  const [catalogue, setCatalogue] = useState([])
  const [categories, setCategories] = useState([])
  const [catalogueVue, setCatalogueVue] = useState(false)
  const [recherche, setRecherche] = useState('')
  const [catFiltre, setCatFiltre] = useState('Favoris')
  const [favoris, setFavoris] = useState(loadFavoris)
  const [regies, setRegies] = useState([])
  const [regieId, setRegieId] = useState('')
  const [regieNonAssigneeId, setRegieNonAssigneeId] = useState('')
  const [erreur, setErreur] = useState('')
  const [loading, setLoading] = useState(true)
  const CREDIT_JOUR = 8

  useEffect(() => {
    charger()
  }, [])
  usePageRefresh(async () => {
    try {
      await chargerCredit(date)
    } catch (error) {
      console.error('Erreur chargement crédit dépannage', error)
      setErreur('Impossible de charger les données. Réessaie dans un instant.')
    }
  }, [date, user?.id])

  async function charger() {
    setLoading(true)
    setErreur('')
    try {
      const [{ data: regiesData, error: regiesError }, { data: catalogueData, error: catalogueError }] = await Promise.all([
        supabase.from('regies').select('id, nom, nom_normalise').eq('actif', true).order('nom'),
        supabase.from('catalogue').select('*').eq('actif', true).order('categorie').order('nom')
      ])

      if (regiesError) throw regiesError
      if (catalogueError) throw catalogueError

      const listeRegies = regiesData || []
      const nonAssignee = listeRegies.find(r => r.nom_normalise === 'non assignee')
      setRegies(listeRegies)
      setRegieNonAssigneeId(nonAssignee?.id || '')
      setRegieId(current => current || nonAssignee?.id || listeRegies[0]?.id || '')

      const listeCatalogue = catalogueData || []
      setCatalogue(listeCatalogue)
      setCategories(['Favoris', ...Array.from(new Set(listeCatalogue.map(a => a.categorie).filter(Boolean)))])

      await chargerCredit(date)
    } catch (error) {
      console.error('Erreur chargement dépannage', error)
      setErreur('Impossible de charger les données. Réessaie dans un instant.')
    } finally {
      setLoading(false)
    }
  }

  async function chargerCredit(d = date) {
    if (!user?.id) return
    const { data, error } = await supabase
      .from('time_entries')
      .select('duree')
      .eq('employe_id', user.id)
      .eq('date_travail', d)
    if (error) throw error
    if (data) setCreditUtilise(data.reduce((s, e) => s + Number(e.duree), 0))
  }

  function toggleFavori(favId) {
    const n = favoris.includes(favId) ? favoris.filter(f => f !== favId) : [...favoris, favId]
    setFavoris(n)
    saveFavoris(n)
  }

  function ajouter(a) {
    const e = materiaux.find(m => m.id === a.id)
    if (e) setMateriaux(materiaux.map(m => m.id === a.id ? { ...m, qte: m.qte + 1 } : m))
    else setMateriaux([...materiaux, { id: a.id, nom: a.nom, unite: a.unite, qte: 1, pu: a.prix_net }])
  }

  function modQte(mId, d) {
    setMateriaux(materiaux.map(m => m.id === mId ? { ...m, qte: Math.max(0, m.qte + d) } : m).filter(m => m.qte > 0))
  }

  const articlesFiltres = (() => {
    let l = catalogue
    if (catFiltre === 'Favoris') l = catalogue.filter(a => favoris.includes(a.id))
    else if (catFiltre) l = catalogue.filter(a => a.categorie === catFiltre)
    if (recherche) l = l.filter(a => a.nom.toLowerCase().includes(recherche.toLowerCase()))
    return l.slice(0, 80)
  })()

  async function envoyer(e) {
    e.preventDefault()
    if (envoi || soumissionVerrouillee) return
    if (!adresse) return
    if (!user?.id) {
      setErreur("Impossible d'identifier l'utilisateur connecté.")
      return
    }
    setEnvoi(true)
    setErreur('')
    let depannageCreeId = null
    let ecriturePartielle = false

    try {
      const regieIdFinal = regieId || regieNonAssigneeId || ''
      const depannagePayload = { employe_id: user.id, date_travail: date, adresse, duree, remarques, statut: STATUT_INTERVENTION_FAITE }
      if (regieIdFinal) depannagePayload.regie_id = regieIdFinal

      const { data: dep, error: depError } = await supabase
        .from('depannages')
        .insert(depannagePayload)
        .select()
        .single()

      if (depError) throw depError
      if (!dep?.id) throw new Error('depannage_insert_empty')
      depannageCreeId = dep.id
      ecriturePartielle = true

      const { error: timeError } = await supabase.from('time_entries').insert({
        employe_id: user.id,
        date_travail: date,
        type: 'depannage',
        reference_id: dep.id,
        duree
      })
      if (timeError) throw timeError
      ecriturePartielle = true

      if (materiaux.length > 0) {
        const { error: materiauxError } = await supabase.from('rapport_materiaux').insert(
          materiaux.map(m => ({
            rapport_id: dep.id,
            ref_article: m.id,
            designation: m.nom,
            unite: m.unite,
            quantite: m.qte,
            prix_net: m.pu
          }))
        )
        if (materiauxError) throw materiauxError
        ecriturePartielle = true
      }

      const { error: statutError } = await supabase
        .from('depannages')
        .update({ statut: STATUT_RAPPORT_RECU })
        .eq('id', depannageCreeId)

      if (statutError) throw statutError

      setSucces(true)
      setTimeout(() => navigate('/employe'), 2000)
    } catch (error) {
      console.error('Erreur enregistrement dépannage', error)
      if (depannageCreeId || ecriturePartielle) {
        setSoumissionVerrouillee(true)
        setErreur("Le rapport a probablement été enregistré partiellement. Ne le renvoie pas immédiatement : retourne à l'accueil et laisse l'administration contrôler le dossier.")
        return
      }
      setErreur("Impossible d'enregistrer le dépannage. Vérifie les informations et réessaie.")
    } finally {
      setEnvoi(false)
    }
  }

  const creditRestant = CREDIT_JOUR - creditUtilise
  const depasse = creditUtilise + duree > CREDIT_JOUR

  if (succes) return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '16px' }}>
      <div style={{ fontSize: '48px' }}>✅</div>
      <div style={{ fontWeight: 600, fontSize: '16px' }}>Dépannage enregistré !</div>
    </div>
  )

  if (catalogueVue) return (
    <div>
      <div className="top-bar">
        <div>
          <button onClick={() => setCatalogueVue(false)} style={{ background: 'none', border: 'none', color: '#185FA5', fontSize: '13px', cursor: 'pointer', padding: 0 }}>← Retour</button>
          <div style={{ fontWeight: 600, fontSize: '15px', marginTop: '4px' }}>Catalogue</div>
        </div>
        {materiaux.length > 0 && <span className="badge badge-blue">{materiaux.reduce((s, m) => s + m.qte, 0)}</span>}
      </div>
      <div className="page-content">
        {erreur && (
          <div style={{ background: '#FCEBEB', border: '1px solid #f09595', borderRadius: '8px', padding: '10px 14px', fontSize: '12px', color: '#A32D2D' }}>
            {erreur}
          </div>
        )}
        <input type="search" placeholder="Rechercher..." value={recherche} onChange={e => setRecherche(e.target.value)} />
        <div style={{ display: 'flex', gap: '6px', overflowX: 'auto', paddingBottom: '4px' }}>
          {categories.map(c => (
            <button key={c} onClick={() => setCatFiltre(c)} style={{
              padding: '5px 12px', borderRadius: '20px', fontSize: '12px', fontWeight: 500, cursor: 'pointer',
              border: catFiltre === c ? 'none' : '1px solid #ddd',
              background: catFiltre === c ? '#185FA5' : 'white',
              color: catFiltre === c ? 'white' : '#333', whiteSpace: 'nowrap'
            }}>{c === 'Favoris' ? `⭐ Favoris (${favoris.length})` : c}</button>
          ))}
        </div>
        {loading && <div style={{ textAlign: 'center', padding: '30px', color: '#888' }}>Chargement...</div>}
        {!loading && catFiltre === 'Favoris' && favoris.length === 0 && (
          <div style={{ textAlign: 'center', color: '#888', fontSize: '13px', padding: '20px' }}>Appuie sur ⭐ pour ajouter des favoris</div>
        )}
        <div className="card" style={{ padding: 0 }}>
          {articlesFiltres.map((a, i) => {
            const qte = materiaux.find(m => m.id === a.id)?.qte || 0
            return (
              <div key={a.id} style={{ display: 'flex', alignItems: 'center', padding: '10px 14px', gap: '8px', borderBottom: i < articlesFiltres.length - 1 ? '1px solid #eee' : 'none' }}>
                <button onClick={() => toggleFavori(a.id)} style={{ background: 'none', border: 'none', fontSize: '16px', cursor: 'pointer', opacity: favoris.includes(a.id) ? 1 : 0.25, padding: 0, flexShrink: 0 }}>⭐</button>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: '13px', fontWeight: 500 }}>{a.nom}</div>
                  <div style={{ fontSize: '11px', color: '#888' }}>{a.categorie} · {a.unite}</div>
                </div>
                {qte === 0 ? (
                  <button onClick={() => ajouter(a)} style={{ width: 28, height: 28, borderRadius: '50%', border: '1px solid #185FA5', background: '#E6F1FB', color: '#185FA5', fontSize: '18px', cursor: 'pointer', flexShrink: 0 }}>+</button>
                ) : (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
                    <button onClick={() => modQte(a.id, -1)} style={{ width: 26, height: 26, borderRadius: '50%', border: '1px solid #ddd', background: 'white', cursor: 'pointer', fontSize: '14px' }}>−</button>
                    <span style={{ fontSize: '13px', fontWeight: 600, minWidth: '20px', textAlign: 'center' }}>{qte}</span>
                    <button onClick={() => modQte(a.id, 1)} style={{ width: 26, height: 26, borderRadius: '50%', border: '1px solid #185FA5', background: '#185FA5', color: 'white', cursor: 'pointer', fontSize: '14px' }}>+</button>
                  </div>
                )}
              </div>
            )
          })}
          {!loading && articlesFiltres.length === 0 && <div style={{ padding: '20px', textAlign: 'center', color: '#888', fontSize: '13px' }}>Aucun article</div>}
        </div>
        <button className="btn-primary" onClick={() => setCatalogueVue(false)}>✓ Confirmer ({materiaux.reduce((s, m) => s + m.qte, 0)} articles)</button>
      </div>
    </div>
  )

  return (
    <div>
      <div className="top-bar">
        <div>
          <button onClick={() => navigate('/employe')} style={{ background: 'none', border: 'none', color: '#185FA5', fontSize: '13px', cursor: 'pointer', padding: 0 }}>← Retour</button>
          <div style={{ fontWeight: 600, fontSize: '15px', marginTop: '4px' }}>Nouveau dépannage</div>
        </div>
      </div>

      <form onSubmit={envoyer}>
        <div className="page-content">
          {erreur && (
            <div style={{ background: '#FCEBEB', border: '1px solid #f09595', borderRadius: '8px', padding: '10px 14px', fontSize: '12px', color: '#A32D2D' }}>
              {erreur}
            </div>
          )}
          {soumissionVerrouillee && (
            <button type="button" className="btn-primary" onClick={() => navigate('/employe')}>
              Retour à l'accueil
            </button>
          )}
          <div style={{
            background: depasse ? '#FCEBEB' : '#E6F1FB',
            border: `1px solid ${depasse ? '#f09595' : '#185FA5'}`,
            borderRadius: '8px', padding: '10px 14px', fontSize: '12px',
            color: depasse ? '#A32D2D' : '#185FA5', fontWeight: 500
          }}>
            {depasse ? `⚠️ Dépassement — crédit restant : ${creditRestant.toFixed(1)}h` : `Crédit restant aujourd'hui : ${creditRestant.toFixed(1)}h`}
          </div>

          <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div style={{ fontWeight: 600, fontSize: '14px' }}>Informations</div>
            <div className="form-group">
              <label>Régie</label>
              <select value={regieId} onChange={e => setRegieId(e.target.value)}>
                {regies.length === 0 && <option value="">Non assignée</option>}
                {regies.map(r => (
                  <option key={r.id} value={r.id}>{r.nom || 'Non assignée'}</option>
                ))}
              </select>
            </div>
            <div className="form-group">
              <label>Date</label>
              <input type="date" value={date} onChange={async e => {
                const nextDate = e.target.value
                setDate(nextDate)
                try {
                  await chargerCredit(nextDate)
                } catch (error) {
                  console.error('Erreur chargement crédit dépannage', error)
                  setErreur('Impossible de charger les données. Réessaie dans un instant.')
                }
              }} required />
            </div>
            <div className="form-group">
              <label>Adresse *</label>
              <input value={adresse} onChange={e => setAdresse(e.target.value)} placeholder="Rue, NPA Ville" required />
            </div>
            <div className="form-group">
              <label>Durée (minimum 1h)</label>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginTop: '4px' }}>
                {DUREES.map(d => (
                  <button key={d} type="button" onClick={() => setDuree(d)} style={{
                    padding: '8px 14px', borderRadius: '20px', fontSize: '13px', fontWeight: 500,
                    cursor: 'pointer', border: duree === d ? 'none' : '1px solid #ddd',
                    background: duree === d ? '#185FA5' : 'white',
                    color: duree === d ? 'white' : '#333'
                  }}>
                    {d % 1 === 0 ? `${d}h` : `${Math.floor(d)}h30`}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontWeight: 600, fontSize: '14px' }}>Matériaux</span>
              <button type="button" className="btn-primary btn-sm" disabled={soumissionVerrouillee} style={{ width: 'auto' }} onClick={() => setCatalogueVue(true)}>+ Ajouter</button>
            </div>
            {materiaux.length === 0 && <div style={{ fontSize: '13px', color: '#888' }}>Aucun article</div>}
            {materiaux.map(m => (
              <div key={m.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingBottom: '8px', borderBottom: '1px solid #eee' }}>
                <div><div style={{ fontSize: '13px', fontWeight: 500 }}>{m.nom}</div><div style={{ fontSize: '11px', color: '#888' }}>{m.unite}</div></div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <button type="button" onClick={() => modQte(m.id, -1)} style={{ width: 26, height: 26, borderRadius: '50%', border: '1px solid #ddd', background: 'white', cursor: 'pointer', fontSize: '14px' }}>−</button>
                  <span style={{ fontWeight: 600, minWidth: '20px', textAlign: 'center', fontSize: '13px' }}>{m.qte}</span>
                  <button type="button" onClick={() => modQte(m.id, 1)} style={{ width: 26, height: 26, borderRadius: '50%', border: '1px solid #185FA5', background: '#185FA5', color: 'white', cursor: 'pointer', fontSize: '14px' }}>+</button>
                </div>
              </div>
            ))}
          </div>

          <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <div style={{ fontWeight: 600, fontSize: '14px' }}>Remarques</div>
            <textarea placeholder="Observations, client, travaux effectués..." value={remarques} onChange={e => setRemarques(e.target.value)} rows={3} />
          </div>

          <button type="submit" className="btn-primary" disabled={envoi || soumissionVerrouillee}>
            {envoi ? 'Envoi...' : '⚡ Enregistrer le dépannage'}
          </button>
        </div>
      </form>
    </div>
  )
}
