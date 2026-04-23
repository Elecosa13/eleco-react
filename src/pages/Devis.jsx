import React from 'react'
import { useNavigate } from 'react-router-dom'

export default function Devis() {
  const navigate = useNavigate()
  const devis = []

  return (
    <div>
      <div className="top-bar">
        <div>
          <div style={{ fontWeight: 600, fontSize: '15px' }}>Devis à faire</div>
          <div style={{ fontSize: '11px', color: '#888' }}>Espace employé</div>
        </div>
        <button className="btn-outline btn-sm" onClick={() => navigate('/employe')}>Retour ←</button>
      </div>

      <div className="page-content">
        <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px' }}>
            <div>
              <div style={{ fontWeight: 700, fontSize: '15px' }}>Module en préparation</div>
              <div style={{ fontSize: '12px', color: '#666', marginTop: '2px' }}>La gestion des devis n'est pas encore opérationnelle.</div>
            </div>
            <span className="badge badge-blue">{devis.length}</span>
          </div>

          {devis.length === 0 && (
            <div style={{ border: '1px dashed #d6d6d6', borderRadius: '8px', padding: '18px 12px', textAlign: 'center', color: '#888', fontSize: '13px' }}>
              À venir : les devis à faire seront affichés ici lorsque le module sera connecté.
            </div>
          )}
        </div>

        <button className="btn-primary" disabled style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px' }}>
          <span>+ Créer un devis (à venir)</span>
          <span>›</span>
        </button>
      </div>
    </div>
  )
}
