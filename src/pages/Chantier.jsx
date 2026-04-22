import React, { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import PageTopActions from '../components/PageTopActions'
import { supabase } from '../lib/supabase'
import { usePageRefresh } from '../lib/refresh'
import {
  getChantierClientLabel,
  getChantierStatusBadgeStyle,
  isChantierVisibleToEmployees
} from '../services/chantiers.service'

export default function Chantier() {
  const navigate = useNavigate()
  const { id } = useParams()
  const [chantier, setChantier] = useState(null)
  const [sds, setSds] = useState([])
  const [forbidden, setForbidden] = useState(false)
  const refreshPage = usePageRefresh(() => charger(), [id])

  useEffect(() => {
    charger()
  }, [id])

  async function charger() {
    const [{ data: ch }, { data }] = await Promise.all([
      supabase.from('chantiers').select('*').eq('id', id).single(),
      supabase.from('sous_dossiers')
        .select('id, nom, rapports(id, rapport_photos(id))')
        .eq('chantier_id', id)
        .order('created_at')
    ])

    if (ch && !isChantierVisibleToEmployees(ch)) {
      setForbidden(true)
      setChantier(null)
      setSds([])
      return
    }

    setForbidden(false)
    if (ch) setChantier(ch)
    if (data) setSds(data)
  }

  if (forbidden) {
    return (
      <div>
        <div className="top-bar">
          <div>
            <div style={{ fontWeight: 600, fontSize: '15px', marginTop: '4px' }}>Chantier indisponible</div>
          </div>
          <PageTopActions navigate={navigate} fallbackPath="/employe" onRefresh={refreshPage} />
        </div>
        <div className="page-content">
          <div className="card" style={{ fontSize: '13px', color: '#888' }}>
            Ce chantier n'a pas encore ete envoye aux employes.
          </div>
        </div>
      </div>
    )
  }

  const badgeStyle = getChantierStatusBadgeStyle(chantier?.statut)

  return (
    <div>
      <div className="top-bar">
        <div>
          <div style={{ fontWeight: 600, fontSize: '15px', marginTop: '4px' }}>{chantier?.nom}</div>
          <div style={{ fontSize: '11px', color: '#888' }}>{getChantierClientLabel(chantier)}</div>
        </div>
        <PageTopActions navigate={navigate} fallbackPath="/employe" onRefresh={refreshPage} />
      </div>
      <div className="page-content">
        <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px' }}>
            <div>
              <div style={{ fontWeight: 600, fontSize: '14px' }}>Chantier</div>
              <div style={{ fontSize: '11px', color: '#888', marginTop: '4px' }}>{chantier?.adresse || '-'}</div>
            </div>
            <span style={{ ...badgeStyle, borderRadius: '6px', padding: '4px 8px', fontSize: '10px', fontWeight: 700, whiteSpace: 'nowrap' }}>
              {chantier?.statut || 'A confirmer'}
            </span>
          </div>
          <div style={{ fontSize: '11px', color: '#888' }}>
            Documents employe: vue preparee pour les versions sans prix.
          </div>
        </div>

        <div className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
            <span style={{ fontWeight: 600, fontSize: '14px' }}>Sous-dossiers / parties</span>
            <span style={{ fontSize: '11px', color: '#888' }}>{sds.length}</span>
          </div>
          {sds.length === 0 && <div style={{ fontSize: '13px', color: '#888' }}>Aucun sous-dossier</div>}
          {sds.map(sd => {
            const rapportsCount = (sd.rapports || []).length
            const photosCount = (sd.rapports || []).reduce((sum, rapport) => sum + (rapport.rapport_photos || []).length, 0)
            return (
              <div key={sd.id} style={{ borderTop: '1px solid #eee', paddingTop: '12px', marginTop: '12px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px' }}>
                  <div style={{ width: 34, height: 34, borderRadius: '8px', background: '#E6F1FB', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '16px' }}>D</div>
                  <div style={{ fontWeight: 500, fontSize: '13px' }}>{sd.nom}</div>
                </div>

                <div style={{ display: 'grid', gap: '8px' }}>
                  <button
                    type="button"
                    className="row-item"
                    style={{ cursor: 'pointer', width: '100%', textAlign: 'left', background: '#fff' }}
                    onClick={() => navigate(`/employe/rapport/${sd.id}`)}
                  >
                    <div>
                      <div style={{ fontWeight: 500, fontSize: '12px' }}>Rapports</div>
                      <div style={{ fontSize: '11px', color: '#888' }}>{rapportsCount} rapport(s)</div>
                    </div>
                    <span style={{ color: '#185FA5' }}>{'>'}</span>
                  </button>

                  <div className="row-item">
                    <div>
                      <div style={{ fontWeight: 500, fontSize: '12px' }}>Photos</div>
                      <div style={{ fontSize: '11px', color: '#888' }}>{photosCount} photo(s)</div>
                    </div>
                    <span style={{ fontSize: '11px', color: '#888' }}>Depuis rapports</span>
                  </div>

                  <div className="row-item">
                    <div>
                      <div style={{ fontWeight: 500, fontSize: '12px' }}>Documents</div>
                      <div style={{ fontSize: '11px', color: '#888' }}>Structure prete pour documents sans prix</div>
                    </div>
                    <span style={{ fontSize: '11px', color: '#888' }}>Bientot</span>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
