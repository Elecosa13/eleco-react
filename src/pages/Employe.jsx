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

  useEffect(() => { charger() }, [])

  async function charger() {
    const { data } = await supabase.from('chantiers').select('*').eq('actif', true).order('created_at', { ascending: false })
    if (data) setChantiers(data)
  }

  async function creerChantier(e) {
    e.preventDefault()
    const { data: c } = await supabase.from('chantiers').insert({ nom, adresse }).select().single()
    if (c && ssd) await supabase.from('sous_dossiers').insert({ chantier_id: c.id, nom: ssd })
    setNom(''); setAdresse(''); setSsd(''); setVue('accueil'); charger()
  }

  function deconnecter() { localStorage.removeItem('eleco_user'); navigate('/') }

  return (
    <div>
      <div className="top-bar">
        <div>
          <div style={{ fontWeight: 600, fontSize: '15px' }}>{vue === 'accueil' ? `Bonjour, ${user?.prenom}` : 'Nouveau chantier'}</div>
          <div style={{ fontSize: '11px', color: '#888' }}>Espace employé</div>
        </div>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          {vue !== 'accueil' && <button className="btn-outline btn-sm" onClick={() => setVue('accueil')}>← Retour</button>}
          <button className="avatar" onClick={deconnecter}>{user?.initiales}</button>
        </div>
      </div>
      <div className="page-content">
        {vue === 'accueil' && <>
          <div style={{ background: '#FCEBEB', border: '1px solid #f09595', borderRadius: '6px', padding: '10px 14px', fontSize: '12px', color: '#A32D2D', display: 'flex', gap: '8px' }}>
            🔒 Espace employé
          </div>
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
