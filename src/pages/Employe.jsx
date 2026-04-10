import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'

export default function Employe() {
  const navigate = useNavigate()
  const user = JSON.parse(localStorage.getItem('eleco_user') || 'null')
  const [chantiers, setChantiers] = useState([])
  const [vue, setVue] = useState('accueil')
  const [creditUtilise, setCreditUtilise] = useState(0)
  const [recherche, setRecherche] = useState('')
  const [ajoutChantier, setAjoutChantier] = useState(false)
  const [nouveauNom, setNouveauNom] = useState('')
  const [nouvelleAdresse, setNouvelleAdresse] = useState('')
  const [confirmDoublon, setConfirmDoublon] = useState(null)
  const CREDIT_JOUR = 8

  useEffect(() => { charger() }, [])

  async function charger() {
    const { data } = await supabase.from('chantiers').select('*').eq('actif', true).order('nom')
    if (data) setChantiers(data)
    const aujourd_hui = new Date().toISOString().split('T')[0]
    const { data: entries } = await supabase.from('time_entries').select('duree').eq('employe_id', user.id).eq('date_travail', aujourd_hui)
    if (entries) setCreditUtilise(entries.reduce((s, e) => s + Number(e.duree), 0))
  }

  async function creerChantier(forcer = false) {
    if (!nouveauNom.trim()) return
    if (!forcer) {
      const existe = chantiers.find(c => c.nom.toLowerCase() === nouveauNom.toLowerCase())
      if (existe) { setConfirmDoublon(existe); return }
    }
    await supabase.from('chantiers').insert({ nom: nouveauNom, adresse: nouvelleAdresse })
    setNouveauNom(''); setNouvelleAdresse(''); setAjoutChantier(false); setConfirmDoublon(null); charger()
  }

  function deconnecter() { localStorage.removeItem('eleco_user'); navigate('/') }

  const creditRestant = CREDIT_JOUR - creditUtilise
  const pourcent = Math.min(100, (creditUtilise / CREDIT_JOUR) * 100)
  const couleurBarre = creditUtilise >= CREDIT_JOUR ? '#27ae60' : creditUtilise >= 6 ? '#f39c12' : '#185FA5'

  const chantiersFiltres = chantiers.filter(c =>
    c.nom.toLowerCase().includes(recherche.toLowerCase()) ||
    (c.adresse || '').toLowerCase().includes(recherche.toLowerCase())
  )

  if (confirmDoublon) return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '24px', gap: '16px' }}>
      <div style={{ fontSize: '40px' }}>⚠️</div>
      <div style={{ fontWeight: 600, fontSize: '16px', textAlign: 'center' }}>"{nouveauNom}" existe déjà</div>
      <div style={{ fontSize: '13px', color: '#888', textAlign: 'center' }}>Voulez-vous quand même créer un nouveau chantier avec ce nom ?</div>
      <div style={{ display: 'flex', gap: '10px', width: '100%', maxWidth: '300px' }}>
        <button className="btn-outline" style={{ flex: 1 }} onClick={() => setConfirmDoublon(null)}>Non</button>
        <button className="btn-primary" style={{ flex: 1 }} onClick={() => creerChantier(true)}>Oui, créer</button>
      </div>
    </div>
  )

  return (
    <div>
      <div className="top-bar">
        <div>
          <div style={{ fontWeight: 600, fontSize: '15px' }}>
            {vue === 'accueil' ? `Bonjour, ${user?.prenom}` : 'Chantiers actifs'}
          </div>
          <div style={{ fontSize: '11px', color: '#888' }}>Espace employé</div>
        </div>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          {vue !== 'accueil' && <button className="btn-outline btn-sm" onClick={() => { setVue('accueil'); setRecherche(''); setAjoutChantier(false) }}>← Retour</button>}
          <button className="avatar" onClick={deconnecter}>{user?.initiales}</button>
        </div>
      </div>

      <div className="page-content">
        {vue === 'accueil' && <>
          <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontWeight: 600, fontSize: '14px' }}>Crédit heures aujourd'hui</span>
              <span style={{ fontSize: '13px', fontWeight: 600, color: couleurBarre }}>{creditUtilise.toFixed(1)}h / {CREDIT_JOUR}h</span>
            </div>
            <div style={{ background: '#eee', borderRadius: '6px', height: '8px', overflow: 'hidden' }}>
              <div style={{ width: `${pourcent}%`, background: couleurBarre, height: '100%', borderRadius: '6px', transition: 'width 0.3s' }} />
            </div>
            <div style={{ fontSize: '12px', color: '#888' }}>
              {creditRestant > 0 ? `Il reste ${creditRestant.toFixed(1)}h à saisir` : '✅ Journée complète'}
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <button onClick={() => setVue('chantiers')} style={{ background: '#E6F1FB', border: '1px solid #185FA5', borderRadius: '12px', padding: '20px 12px', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '28px' }}>🏗️</span>
              <span style={{ fontWeight: 600, fontSize: '14px', color: '#185FA5' }}>Chantier</span>
              <span style={{ fontSize: '11px', color: '#666' }}>Travail sur chantier en cours</span>
            </button>
            <button onClick={() => navigate('/employe/depannage')} style={{ background: '#FEF3E2', border: '1px solid #f39c12', borderRadius: '12px', padding: '20px 12px', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '28px' }}>⚡</span>
              <span style={{ fontWeight: 600, fontSize: '14px', color: '#d68910' }}>Dépannage</span>
              <span style={{ fontSize: '11px', color: '#666' }}>Intervention rapide</span>
            </button>
          </div>
        </>}

        {vue === 'chantiers' && <>
          <input
            type="search"
            placeholder="🔍 Rechercher un chantier..."
            value={recherche}
            onChange={e => setRecherche(e.target.value)}
            style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid #ddd', fontSize: '13px', marginBottom: '4px' }}
          />
          {ajoutChantier && (
            <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <div style={{ fontWeight: 600, fontSize: '14px' }}>Nouveau chantier</div>
              <input placeholder="Nom *" value={nouveauNom} onChange={e => setNouveauNom(e.target.value)}
                style={{ padding: '8px', borderRadius: '6px', border: '1px solid #ddd', fontSize: '13px' }} />
              <input placeholder="Adresse" value={nouvelleAdresse} onChange={e => setNouvelleAdresse(e.target.value)}
                style={{ padding: '8px', borderRadius: '6px', border: '1px solid #ddd', fontSize: '13px' }} />
              <div style={{ display: 'flex', gap: '8px' }}>
                <button className="btn-outline" style={{ flex: 1 }} onClick={() => { setAjoutChantier(false); setNouveauNom(''); setNouvelleAdresse('') }}>Annuler</button>
                <button className="btn-primary" style={{ flex: 1 }} onClick={() => creerChantier(false)}>Créer</button>
              </div>
            </div>
          )}
          <div className="card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
              <span style={{ fontWeight: 600, fontSize: '14px' }}>Chantiers actifs</span>
              {!ajoutChantier && <button className="btn-primary btn-sm" style={{ width: 'auto' }} onClick={() => setAjoutChantier(true)}>+ Nouveau</button>}
            </div>
            {chantiersFiltres.length === 0 && <div style={{ fontSize: '13px', color: '#888' }}>Aucun chantier trouvé</div>}
            {chantiersFiltres.map(c => (
              <div key={c.id} className="row-item" style={{ cursor: 'pointer' }} onClick={() => navigate(`/employe/chantier/${c.id}`)}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <div style={{ width: 34, height: 34, borderRadius: '8px', background: '#E6F1FB', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '16px' }}>🏗️</div>
                  <div>
                    <div style={{ fontWeight: 500, fontSize: '13px' }}>{c.nom}</div>
                    <div style={{ fontSize: '11px', color: '#888' }}>{c.adresse || '—'}</div>
                  </div>
                </div>
                <span style={{ color: '#185FA5' }}>›</span>
              </div>
            ))}
          </div>
        </>}
      </div>
    </div>
  )
}
