import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'

const TAUX = 115

export default function Admin() {
  const navigate = useNavigate()
  const user = JSON.parse(localStorage.getItem('eleco_user') || 'null')
  const [rapports, setRapports] = useState([])
  const [detail, setDetail] = useState(null)

  useEffect(() => { charger() }, [])

  async function charger() {
    const { data } = await supabase.from('rapports').select('*, employe:employe_id(prenom), sous_dossiers(nom, chantiers(nom)), rapport_materiaux(*)').order('created_at', { ascending: false })
    if (data) setRapports(data)
  }

  async function valider(rid) {
    await supabase.from('rapports').update({ valide: true }).eq('id', rid)
    charger(); if (detail?.id === rid) setDetail(null)
  }

  async function refuser(rid) {
    if (!confirm('Refuser ce rapport ?')) return
    await supabase.from('rapports').delete().eq('id', rid)
    charger(); if (detail?.id === rid) setDetail(null)
  }

  function hStr(debut, fin) {
    const [h1, m1] = debut.split(':').map(Number)
    const [h2, m2] = fin.split(':').map(Number)
    const d = (h2 * 60 + m2) - (h1 * 60 + m1)
    return `${Math.floor(d / 60)}h${String(d % 60).padStart(2, '0')}`
  }

  function totaux(r) {
    const h = (() => { const [h1, m1] = r.heure_debut.split(':').map(Number); const [h2, m2] = r.heure_fin.split(':').map(Number); return ((h2 * 60 + m2) - (h1 * 60 + m1)) / 60 })()
    const mat = (r.rapport_materiaux || []).reduce((s, m) => s + m.quantite * (m.prix_net || 0), 0)
    const mo = h * TAUX
    const ht = mat + mo
    return { h, mat, mo, ht, tva: ht * 0.081, ttc: ht * 1.081 }
  }

  function deconnecter() { localStorage.removeItem('eleco_user'); navigate('/') }

  if (detail) {
    const t = totaux(detail)
    return (
      <div>
        <div className="top-bar">
          <div>
            <button onClick={() => setDetail(null)} style={{ background: 'none', border: 'none', color: '#185FA5', fontSize: '13px', cursor: 'pointer', padding: 0 }}>← Retour</button>
            <div style={{ fontWeight: 600, fontSize: '15px', marginTop: '4px' }}>Détail rapport</div>
            <div style={{ fontSize: '11px', color: '#888' }}>{detail.sous_dossiers?.chantiers?.nom} › {detail.sous_dossiers?.nom}</div>
          </div>
          {!detail.valide && <span className="badge badge-amber">À valider</span>}
        </div>
        <div className="page-content">
          <div className="card">
            <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
              <div><div style={{ fontSize: '11px', color: '#888' }}>Employé</div><div style={{ fontWeight: 500 }}>{detail.employe?.prenom}</div></div>
              <div><div style={{ fontSize: '11px', color: '#888' }}>Date</div><div style={{ fontWeight: 500 }}>{new Date(detail.date_travail).toLocaleDateString('fr-CH')}</div></div>
              <div><div style={{ fontSize: '11px', color: '#888' }}>Durée</div><div style={{ fontWeight: 500 }}>{hStr(detail.heure_debut, detail.heure_fin)}</div></div>
            </div>
            {detail.remarques && <div style={{ marginTop: '10px', padding: '8px', background: '#f9f9f9', borderRadius: '6px', fontSize: '13px' }}>💬 {detail.remarques}</div>}
          </div>
          <div className="card">
            <div style={{ fontWeight: 600, fontSize: '14px', marginBottom: '10px' }}>Matériaux</div>
            {(detail.rapport_materiaux || []).length === 0 && <div style={{ fontSize: '13px', color: '#888' }}>Aucun</div>}
            {(detail.rapport_materiaux || []).map((m, i) => (
              <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '7px 0', borderBottom: '1px solid #eee' }}>
                <div><div style={{ fontSize: '13px', fontWeight: 500 }}>{m.designation}</div><div style={{ fontSize: '11px', color: '#888' }}>{m.quantite} × {m.unite}</div></div>
                <div style={{ fontSize: '13px', fontWeight: 600 }}>{(m.quantite * (m.prix_net || 0)).toFixed(2)} CHF</div>
              </div>
            ))}
          </div>
          <div className="card">
            <div style={{ fontWeight: 600, fontSize: '14px', marginBottom: '12px' }}>Estimation</div>
            {[['Matériaux', `${t.mat.toFixed(2)} CHF`], [`M.O. (${t.h.toFixed(1)}h × ${TAUX})`, `${t.mo.toFixed(2)} CHF`], ['HT', `${t.ht.toFixed(2)} CHF`], ['TVA 8.1%', `${t.tva.toFixed(2)} CHF`]].map(([l, v]) => (
              <div key={l} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', marginBottom: '6px' }}>
                <span style={{ color: '#666' }}>{l}</span><span style={{ fontWeight: 500 }}>{v}</span>
              </div>
            ))}
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '15px', fontWeight: 700, paddingTop: '8px', borderTop: '2px solid #185FA5', color: '#185FA5' }}>
              <span>TOTAL TTC</span><span>{t.ttc.toFixed(2)} CHF</span>
            </div>
          </div>
          {!detail.valide && (
            <div style={{ display: 'flex', gap: '10px' }}>
              <button onClick={() => refuser(detail.id)} className="btn-outline" style={{ flex: 1, color: '#A32D2D', borderColor: '#f09595' }}>✕ Refuser</button>
              <button onClick={() => valider(detail.id)} className="btn-primary" style={{ flex: 1 }}>✓ Valider</button>
            </div>
          )}
        </div>
      </div>
    )
  }

  const nonValides = rapports.filter(r => !r.valide)
  const valides = rapports.filter(r => r.valide)

  return (
    <div>
      <div className="top-bar">
        <div>
          <div style={{ fontWeight: 600, fontSize: '15px' }}>Bonjour, {user?.prenom}</div>
          <div style={{ fontSize: '11px', color: '#888' }}>Tableau de bord</div>
        </div>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <span className="badge badge-amber">Admin</span>
          <button className="avatar" style={{ background: '#FAEEDA', color: '#BA7517' }} onClick={deconnecter}>{user?.initiales}</button>
        </div>
      </div>
      <div className="page-content">
        {nonValides.length > 0 && (
          <div className="card">
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '12px' }}>
              <span style={{ fontWeight: 600, fontSize: '14px' }}>À valider</span>
              <span className="badge badge-amber">{nonValides.length}</span>
            </div>
            {nonValides.map(r => {
              const t = totaux(r)
              return (
                <div key={r.id} style={{ paddingBottom: '12px', marginBottom: '12px', borderBottom: '1px solid #eee', cursor: 'pointer' }} onClick={() => setDetail(r)}>
                  <div style={{ fontWeight: 500, fontSize: '13px' }}>{r.sous_dossiers?.chantiers?.nom} › {r.sous_dossiers?.nom}</div>
                  <div style={{ fontSize: '11px', color: '#888', margin: '3px 0' }}>{r.employe?.prenom} · {hStr(r.heure_debut, r.heure_fin)} · {new Date(r.date_travail).toLocaleDateString('fr-CH')}</div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ fontSize: '11px', color: '#185FA5' }}>Voir détail →</span>
                    <span style={{ fontSize: '13px', fontWeight: 700, color: '#185FA5' }}>{t.ttc.toFixed(0)} CHF</span>
                  </div>
                </div>
              )
            })}
          </div>
        )}
        {valides.length > 0 && (
          <div className="card">
            <div style={{ fontWeight: 600, fontSize: '14px', marginBottom: '12px' }}>Validés</div>
            {valides.slice(0, 20).map(r => {
              const t = totaux(r)
              return (
                <div key={r.id} className="row-item" style={{ cursor: 'pointer' }} onClick={() => setDetail(r)}>
                  <div>
                    <div style={{ fontSize: '13px', fontWeight: 500 }}>{r.sous_dossiers?.chantiers?.nom} › {r.sous_dossiers?.nom}</div>
                    <div style={{ fontSize: '11px', color: '#888' }}>{r.employe?.prenom} · {new Date(r.date_travail).toLocaleDateString('fr-CH')}</div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: '13px', fontWeight: 600 }}>{t.ttc.toFixed(0)} CHF</div>
                    <span className="badge badge-green" style={{ fontSize: '10px' }}>✓</span>
                  </div>
                </div>
              )
            })}
          </div>
        )}
        {rapports.length === 0 && <div style={{ textAlign: 'center', color: '#888', fontSize: '13px', padding: '40px 0' }}>Aucun rapport</div>}
      </div>
    </div>
  )
}
