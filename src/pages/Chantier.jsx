import React, { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'

export default function Chantier() {
  const navigate = useNavigate()
  const { id } = useParams()
  const [chantier, setChantier] = useState(null)
  const [sds, setSds] = useState([])
  const [nouveauNom, setNouveauNom] = useState('')
  const [ajout, setAjout] = useState(false)

  useEffect(() => {
    supabase.from('chantiers').select('*').eq('id', id).single().then(({ data }) => { if (data) setChantier(data) })
    charger()
  }, [id])

  async function charger() {
    const { data } = await supabase.from('sous_dossiers').select('*').eq('chantier_id', id).order('created_at')
    if (data) setSds(data)
  }

  async function ajouter(e) {
    e.preventDefault()
    await supabase.from('sous_dossiers').insert({ chantier_id: id, nom: nouveauNom })
    setNouveauNom(''); setAjout(false); charger()
  }

  return (
    <div>
      <div className="top-bar">
        <div>
          <button onClick={() => navigate('/employe')} style={{ background: 'none', border: 'none', color: '#185FA5', fontSize: '13px', cursor: 'pointer', padding: 0 }}>← Retour</button>
          <div style={{ fontWeight: 600, fontSize: '15px', marginTop: '4px' }}>{chantier?.nom}</div>
        </div>
      </div>
      <div className="page-content">
        <div className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
            <span style={{ fontWeight: 600, fontSize: '14px' }}>Sous-dossiers</span>
            <button className="btn-primary btn-sm" style={{ width: 'auto' }} onClick={() => setAjout(!ajout)}>+ Nouveau</button>
          </div>
          {ajout && (
            <form onSubmit={ajouter} style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
              <input placeholder="Nom du sous-dossier" value={nouveauNom} onChange={e => setNouveauNom(e.target.value)} required style={{ flex: 1 }} />
              <button type="submit" className="btn-primary btn-sm" style={{ width: 'auto' }}>OK</button>
            </form>
          )}
          {sds.length === 0 && !ajout && <div style={{ fontSize: '13px', color: '#888' }}>Aucun sous-dossier</div>}
          {sds.map(sd => (
            <div key={sd.id} className="row-item" style={{ cursor: 'pointer' }} onClick={() => navigate(`/employe/rapport/${sd.id}`)}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div style={{ width: 34, height: 34, borderRadius: '8px', background: '#E6F1FB', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '16px' }}>📁</div>
                <div style={{ fontWeight: 500, fontSize: '13px' }}>{sd.nom}</div>
              </div>
              <span style={{ color: '#185FA5' }}>›</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
