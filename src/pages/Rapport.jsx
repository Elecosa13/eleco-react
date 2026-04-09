import React, { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'

const FAVORIS_KEY = 'eleco_favoris'

export default function Rapport() {
  const navigate = useNavigate()
  const { id } = useParams()
  const user = JSON.parse(localStorage.getItem('eleco_user') || 'null')
  const [sd, setSd] = useState(null)
  const [date, setDate] = useState(new Date().toISOString().split('T')[0])
  const [debut, setDebut] = useState('07:30')
  const [fin, setFin] = useState('17:00')
  const [remarques, setRemarques] = useState('')
  const [materiaux, setMateriaux] = useState([])
  const [catalogue, setCatalogue] = useState([])
  const [categories, setCategories] = useState([])
  const [catalogueVue, setCatalogueVue] = useState(false)
  const [recherche, setRecherche] = useState('')
  const [catFiltre, setCatFiltre] = useState('Favoris')
  const [favoris, setFavoris] = useState(JSON.parse(localStorage.getItem(FAVORIS_KEY) || '[]'))
  const [envoi, setEnvoi] = useState(false)
  const [succes, setSucces] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase.from('sous_dossiers').select('*, chantiers(nom)').eq('id', id).single().then(({ data }) => { if (data) setSd(data) })
    supabase.from('catalogue').select('*').eq('actif', true).order('categorie').order('nom').then(({ data }) => {
      if (data && data.length > 0) {
        setCatalogue(data)
        setCategories(['Favoris', ...Array.from(new Set(data.map(a => a.categorie).filter(Boolean)))])
      }
      setLoading(false)
    })
  }, [id])

  function toggleFavori(favId) {
    const n = favoris.includes(favId) ? favoris.filter(f => f !== favId) : [...favoris, favId]
    setFavoris(n)
    localStorage.setItem(FAVORIS_KEY, JSON.stringify(n))
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
    else setMateriaux([...materiaux, { id: a.id, nom: a.nom, unite: a.unite, qte: 1, pu: a.prix_net }])
  }

  function modQte(mId, d) {
    setMateriaux(materiaux.map(m => m.id === mId ? { ...m, qte: Math.max(0, m.qte + d) } : m).filter(m => m.qte > 0))
  }

  function heures() {
    const [h1, m1] = debut.split(':').map(Number)
    const [h2, m2] = fin.split(':').map(Number)
    return ((h2 * 60 + m2) - (h1 * 60 + m1)) / 60
  }

  async function envoyer(e) {
    e.preventDefault()
    if (!user || !sd) return
    setEnvoi(true)
    const { data: r } = await supabase.from('rapports').insert({
      sous_dossier_id: id, employe_id: user.id, date_travail: date, heure_debut: debut, heure_fin: fin, remarques
    }).select().single()
    if (r && materiaux.length > 0) {
      await supabase.from('rapport_materiaux').insert(
        materiaux.map(m => ({ rapport_id: r.id, ref_article: m.id, designation: m.nom, unite: m.unite, quantite: m.qte, prix_net: m.pu }))
      )
    }
    setEnvoi(false); setSucces(true)
    setTimeout(() => navigate(`/employe/chantier/${sd.chantier_id}`), 2000)
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
        <input type="search" placeholder="Rechercher..." value={recherche} onChange={e => setRecherche(e.target.value)} />
        <div style={{ display: 'flex', gap: '6px', overflowX: 'auto', paddingBottom: '4px' }}>
          {categories.map(c => (
            <button key={c} onClick={() => setCatFiltre(c)} style={{
              padding: '5px 12px', borderRadius: '20px', fontSize: '12px', fontWeight: 500, cursor: 'pointer',
              border: catFiltre === c ? 'none' : '1px solid #ddd',
              background: catFiltre === c ? '#185FA5' : 'white',
              color: catFiltre === c ? 'white' : '#333', whiteSpace: 'nowrap'
            }}>
              {c === 'Favoris' ? `⭐ Favoris (${favoris.length})` : c}
            </button>
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
          <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div style={{ fontWeight: 600, fontSize: '14px' }}>Heures travaillées</div>
            <div className="form-group"><label>Date</label><input type="date" value={date} onChange={e => setDate(e.target.value)} required /></div>
            <div className="grid2">
              <div className="form-group"><label>Début</label><input type="time" value={debut} onChange={e => setDebut(e.target.value)} required /></div>
              <div className="form-group"><label>Fin</label><input type="time" value={fin} onChange={e => setFin(e.target.value)} required /></div>
            </div>
            <div style={{ fontSize: '12px', color: '#185FA5', fontWeight: 500 }}>Durée : {heures().toFixed(1)}h</div>
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
