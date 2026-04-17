import React, { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { supabaseSafe } from '../lib/supabaseSafe'
import { useAuth } from '../lib/auth-context'
import { usePageRefresh } from '../lib/refresh'
import { safeLocalStorage } from '../lib/safe-browser'

const FAVORIS_KEY = 'eleco_favoris'

function loadFavoris() {
  return safeLocalStorage.getJSON(FAVORIS_KEY, [])
}

function saveFavoris(favoris) {
  safeLocalStorage.setJSON(FAVORIS_KEY, favoris)
}

export default function Rapport() {
  const navigate = useNavigate()
  const { id } = useParams()
  const { profile: user } = useAuth()
  const [sd, setSd] = useState(null)
  const [date, setDate] = useState(new Date().toISOString().split('T')[0])
  const [duree, setDuree] = useState(8)
  const [remarques, setRemarques] = useState('')
  const [materiaux, setMateriaux] = useState([])
  const [catalogue, setCatalogue] = useState([])
  const [categories, setCategories] = useState([])
  const [catalogueVue, setCatalogueVue] = useState(false)
  const [recherche, setRecherche] = useState('')
  const [catFiltre, setCatFiltre] = useState('Favoris')
  const [favoris, setFavoris] = useState(loadFavoris)
  const [articleManuel, setArticleManuel] = useState({ nom: '', unite: 'pce', qte: 1, pu: '0' })
  const [envoi, setEnvoi] = useState(false)
  const [succes, setSucces] = useState(false)
  const [loading, setLoading] = useState(true)
  const [creditUtilise, setCreditUtilise] = useState(0)
  const CREDIT_JOUR = 8

  useEffect(() => {
    charger()
  }, [id])
  usePageRefresh(() => charger(), [id, date, user?.id])

  async function charger() {
    setLoading(true)
    await Promise.all([
      supabase.from('sous_dossiers').select('*, chantiers(nom)').eq('id', id).single()
        .then(({ data }) => { if (data) setSd(data) }),
      supabase.from('catalogue').select('*').eq('actif', true).order('categorie').order('nom')
        .then(({ data }) => {
          if (data && data.length > 0) {
            setCatalogue(data)
            setCategories(['Favoris', ...Array.from(new Set(data.map(a => a.categorie).filter(Boolean)))])
          }
        }),
      chargerCredit(date)
    ])
    setLoading(false)
  }

  async function chargerCredit(d) {
    const { data } = await supabase
      .from('time_entries')
      .select('duree')
      .eq('employe_id', user.id)
      .eq('date_travail', d)
    if (data) setCreditUtilise(data.reduce((s, e) => s + Number(e.duree), 0))
  }

  function toggleFavori(favId) {
    const n = favoris.includes(favId) ? favoris.filter(f => f !== favId) : [...favoris, favId]
    setFavoris(n)
    saveFavoris(n)
  }

  const articlesFiltres = (() => {
    let l = catalogue
    if (catFiltre === 'Favoris') l = catalogue.filter(a => favoris.includes(a.id))
    else if (catFiltre) l = catalogue.filter(a => a.categorie === catFiltre)
    if (recherche) l = l.filter(a => a.nom.toLowerCase().includes(recherche.toLowerCase()))
    return l.slice(0, 80)
  })()

  function ajouter(a) {
    const e = materiaux.find(m => m.id === a.id)
    if (e) setMateriaux(materiaux.map(m => m.id === a.id ? { ...m, qte: m.qte + 1 } : m))
    else setMateriaux([...materiaux, { id: a.id, catalogueId: a.id, nom: a.nom, unite: a.unite, qte: 1, pu: a.prix_net }])
  }

  function ajouterManuel() {
    if (!articleManuel.nom.trim()) return
    setMateriaux([...materiaux, {
      id: `manuel-${Date.now()}`,
      catalogueId: null,
      manuel: true,
      nom: articleManuel.nom.trim(),
      unite: articleManuel.unite.trim() || 'pce',
      qte: Math.max(1, Number(articleManuel.qte) || 1),
      pu: Math.max(0, Number(articleManuel.pu) || 0)
    }])
    setArticleManuel({ nom: '', unite: 'pce', qte: 1, pu: '0' })
  }

  function modQte(mId, d) {
    setMateriaux(materiaux.map(m => m.id === mId ? { ...m, qte: Math.max(0, m.qte + d) } : m).filter(m => m.qte > 0))
  }

  const DUREES = [1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5, 5.5, 6, 6.5, 7, 7.5, 8]
  const creditRestant = CREDIT_JOUR - creditUtilise
  const depasse = creditUtilise + duree > CREDIT_JOUR

  async function envoyer(e) {
    e.preventDefault()
    if (!user || !sd) return
    setEnvoi(true)

    try {
      const r = await supabaseSafe(
        supabase.from('rapports').insert({
          sous_dossier_id: id,
          employe_id: user.id,
          date_travail: date,
          heure_debut: '07:30',
          heure_fin: '17:00',
          remarques
        }).select().single()
      )

      if (r) {
        // Enregistrer dans time_entries
        await supabaseSafe(
          supabase.from('time_entries').insert({
            employe_id: user.id,
            date_travail: date,
            type: 'chantier',
            reference_id: r.id,
            duree
          })
        )

        if (materiaux.length > 0) {
          await supabaseSafe(
            supabase.from('rapport_materiaux').insert(
              materiaux.map(m => ({
                rapport_id: r.id,
                ref_article: m.catalogueId || null,
                designation: m.nom,
                unite: m.unite,
                quantite: m.qte,
                prix_net: m.pu
              }))
            )
          )
        }
      }

      setSucces(true)
      setTimeout(() => navigate(`/employe/chantier/${sd.chantier_id}`), 2000)
    } catch (error) {
      alert("Erreur lors de l'envoi du rapport. Veuillez réessayer.")
    } finally {
      setEnvoi(false)
    }
  }

  if (succes) return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '16px' }}>
      <div style={{ fontSize: '48px' }}>✅</div>
      <div style={{ fontWeight: 600, fontSize: '16px' }}>Rapport envoyé !</div>
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
        <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          <div style={{ fontWeight: 600, fontSize: '13px', color: '#185FA5' }}>Article manuel</div>
          <div className="form-group">
            <label>Désignation *</label>
            <input value={articleManuel.nom} onChange={e => setArticleManuel(p => ({ ...p, nom: e.target.value }))} placeholder="Ex: disjoncteur spécifique" />
          </div>
          <div className="grid2">
            <div className="form-group">
              <label>Unité</label>
              <input value={articleManuel.unite} onChange={e => setArticleManuel(p => ({ ...p, unite: e.target.value }))} />
            </div>
            <div className="form-group">
              <label>Quantité</label>
              <input type="number" min="1" value={articleManuel.qte} onChange={e => setArticleManuel(p => ({ ...p, qte: e.target.value }))} />
            </div>
          </div>
          <div className="form-group">
            <label>Prix net (CHF)</label>
            <input type="number" min="0" step="0.01" value={articleManuel.pu} onChange={e => setArticleManuel(p => ({ ...p, pu: e.target.value }))} />
          </div>
          <button type="button" className="btn-primary" disabled={!articleManuel.nom.trim()} onClick={ajouterManuel}>+ Ajouter l'article manuel</button>
        </div>
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
        {!loading && catalogue.length === 0 && (
          <div style={{ textAlign: 'center', color: '#888', fontSize: '13px', padding: '20px' }}>Catalogue vide</div>
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
          <button onClick={() => navigate(-1)} style={{ background: 'none', border: 'none', color: '#185FA5', fontSize: '13px', cursor: 'pointer', padding: 0 }}>← Retour</button>
          <div style={{ fontWeight: 600, fontSize: '15px', marginTop: '4px' }}>Nouveau rapport</div>
          {sd && <div style={{ fontSize: '11px', color: '#888' }}>{sd.chantiers?.nom} › {sd.nom}</div>}
        </div>
      </div>
      <form onSubmit={envoyer}>
        <div className="page-content">

          {/* Crédit restant */}
          <div style={{
            background: depasse ? '#FCEBEB' : '#E6F1FB',
            border: `1px solid ${depasse ? '#f09595' : '#185FA5'}`,
            borderRadius: '8px', padding: '10px 14px', fontSize: '12px',
            color: depasse ? '#A32D2D' : '#185FA5', fontWeight: 500
          }}>
            {depasse
              ? `⚠️ Dépassement — crédit restant : ${creditRestant.toFixed(1)}h`
              : `Crédit restant aujourd'hui : ${creditRestant.toFixed(1)}h`}
          </div>

          <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div style={{ fontWeight: 600, fontSize: '14px' }}>Heures travaillées</div>
            <div className="form-group">
              <label>Date</label>
              <input type="date" value={date} onChange={e => { setDate(e.target.value); chargerCredit(e.target.value) }} required />
            </div>
            <div className="form-group">
              <label>Durée sur ce chantier</label>
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
              <button type="button" className="btn-primary btn-sm" style={{ width: 'auto' }} onClick={() => setCatalogueVue(true)}>+ Ajouter</button>
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
            <textarea placeholder="Observations..." value={remarques} onChange={e => setRemarques(e.target.value)} rows={3} />
          </div>

          <button type="submit" className="btn-primary" disabled={envoi}>{envoi ? 'Envoi...' : '✓ Envoyer le rapport'}</button>
        </div>
      </form>
    </div>
  )
}
