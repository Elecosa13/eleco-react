import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'

export default function Employe() {
  const navigate = useNavigate()
  const user = JSON.parse(localStorage.getItem('eleco_user') || 'null')
  const [chantiers, setChantiers] = useState([])
  const [vue, setVue] = useState('accueil')
  const [nom, setNom] = useState('')
  const [adresse, setAdresse] = useState('')
  const [ssd, setSsd] = useState('')
  const [creditUtilise, setCreditUtilise] = useState(0)
  const CREDIT_JOUR = 8

  useEffect(() => { charger() }, [])

  async function charger() {
    const { data } = await supabase
      .from('chantiers')
      .select('*')
      .eq('actif', true)
      .order('created_at', { ascending: false })
    if (data) setChantiers(data)

    // Calcul crédit utilisé aujourd'hui
    const aujourd_hui = new Date().toISOString().split('T')[0]
    const { data: entries } = await supabase
      .from('time_entries')
      .select('duree')
      .eq('employe_id', user.id)
      .eq('date_travail', aujourd_hui)
    if (entries) {
      const total = entries.reduce((s, e) => s + Number(e.duree), 0)
      setCreditUtilise(total)
    }
  }

  async function creerChantier(e) {
    e.preventDefault()
    const { data: c } = await supabase
      .from('chantiers')
      .insert({ nom, adresse })
      .select()
      .single()
    if (c && ssd) await supabase.from('sous_dossiers').insert({ chantier_id: c.id, nom: ssd })
    setNom(''); setAdresse(''); setSsd(''); setVue('accueil'); charger()
  }

  function deconnecter() { localStorage.removeItem('eleco_user'); navigate('/') }

  const creditRestant = CREDIT_JOUR - creditUtilise
  const pourcent = Math.min(100, (creditUtilise / CREDIT_JOUR) * 100)
  const couleurBarre = creditUtilise >= CREDIT_JOUR ? '#27ae60' : creditUtilise >= 6 ? '#f39c12' : '#185FA5'

  return (
    <div>
      <div className="top-bar">
        <div>
          <div style={{ fontWeight: 600, fontSize: '15px' }}>
            {vue === 'accueil' ? `Bonjour, ${user?.prenom}` : vue === 'nouveau' ? 'Nouveau chantier' : 'Choisir'}
          </div>
          <div style={{ fontSize: '11px', color: '#888' }}>Espace employé</div>
        </div>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          {vue !== 'accueil' && (
            <button className="btn-outline btn-sm" onClick={() => setVue('accueil')}>← Retour</button>
          )}
          <button className="avatar" onClick={deconnecter}>{user?.initiales}</button>
        </div>
      </div>

      <div className="page-content">
        {vue === 'accueil' && <>

          {/* Crédit heures du jour */}
          <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontWeight: 600, fontSize: '14px' }}>Crédit heures aujourd'hui</span>
              <span style={{ fontSize: '13px', fontWeight: 600, color: couleurBarre }}>
                {creditUtilise.toFixed(1)}h / {CREDIT_JOUR}h
              </span>
            </div>
            <div style={{ background: '#eee', borderRadius: '6px', height: '8px', overflow: 'hidden' }}>
              <div style={{ width: `${pourcent}%`, background: couleurBarre, height: '100%', borderRadius: '6px', transition: 'width 0.3s' }} />
            </div>
            <div style={{ fontSize: '12px', color: '#888' }}>
              {creditRestant > 0
                ? `Il reste ${creditRestant.toFixed(1)}h à saisir`
                : '✅ Journée complète'}
            </div>
          </div>

          {/* Choix type de saisie */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <button
              onClick={() => setVue('chantiers')}
              style={{
                background: '#E6F1FB', border: '1px solid #185FA5', borderRadius: '12px',
                padding: '20px 12px', cursor: 'pointer', display: 'flex', flexDirection: 'column',
                alignItems: 'center', gap: '8px'
              }}
            >
              <span style={{ fontSize: '28px' }}>🏗️</span>
              <span style={{ fontWeight: 600, fontSize: '14px', color: '#185FA5' }}>Chantier</span>
              <span style={{ fontSize: '11px', color: '#666' }}>Travail sur chantier en cours</span>
            </button>
            <button
              onClick={() => navigate('/employe/depannage')}
              style={{
                background: '#FEF3E2', border: '1px solid #f39c12', borderRadius: '12px',
                padding: '20px 12px', cursor: 'pointer', display: 'flex', flexDirection: 'column',
                alignItems: 'center', gap: '8px'
              }}
            >
              <span style={{ fontSize: '28px' }}>⚡</span>
              <span style={{ fontWeight: 600, fontSize: '14px', color: '#d68910' }}>Dépannage</span>
              <span style={{ fontSize: '11px', color: '#666' }}>Intervention rapide</span>
            </button>
          </div>

          {/* Liste chantiers (visible si vue chantiers) */}
          {vue === 'accueil' && null}

        </>}

        {vue === 'chantiers' && <>
          <div className="card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
              <span style={{ fontWeight: 600, fontSize: '14px' }}>Chantiers actifs</span>
              <button className="btn-primary btn-sm" style={{ width: 'auto' }} onClick={() => setVue('nouveau')}>+ Nouveau</button>
            </div>
            {chantiers.length === 0 && <div style={{ fontSize: '13px', color: '#888' }}>Aucun chantier</div>}
            {chantiers.map(c => (
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

        {vue === 'nouveau' && (
          <form className="card" onSubmit={creerChantier} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div className="form-group"><label>Nom *</label><input value={nom} onChange={e => setNom(e.target.value)} required placeholder="Ex: Villa Müller" /></div>
            <div className="form-group"><label>Adresse</label><input value={adresse} onChange={e => setAdresse(e.target.value)} placeholder="Rue, NPA Ville" /></div>
            <div className="form-group"><label>Premier sous-dossier</label><input value={ssd} onChange={e => setSsd(e.target.value)} placeholder="Ex: Cuisine" /></div>
            <button type="submit" className="btn-primary">Créer</button>
          </form>
        )}
      </div>
    </div>
  )
}
