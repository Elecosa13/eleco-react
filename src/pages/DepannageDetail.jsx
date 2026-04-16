import React, { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'

function LoadingSpinner() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', color: '#185FA5', fontSize: '13px', fontWeight: 600 }}>
      <span className="pull-refresh__spinner pull-refresh__spinner--active" />
      Chargement...
    </div>
  )
}

function formatDate(value) {
  if (!value) return '-'
  return new Date(`${value}T12:00:00`).toLocaleDateString('fr-CH')
}

function formatDateTime(value) {
  if (!value) return '-'
  return new Date(value).toLocaleString('fr-CH')
}

function InfoLine({ label, value }) {
  return (
    <div>
      <div style={{ fontSize: '11px', color: '#888', marginBottom: '3px' }}>{label}</div>
      <div style={{ fontSize: '14px', fontWeight: 500, whiteSpace: 'pre-wrap' }}>{value || '-'}</div>
    </div>
  )
}

export default function DepannageDetail() {
  const navigate = useNavigate()
  const { id } = useParams()
  const [depannage, setDepannage] = useState(null)
  const [loading, setLoading] = useState(true)
  const [erreur, setErreur] = useState('')

  useEffect(() => {
    chargerDepannage()
  }, [id])

  async function chargerDepannage() {
    setLoading(true)
    setErreur('')

    try {
      const { data, error } = await supabase
        .from('depannages')
        .select('*, employe:employe_id(prenom), regie:regies(nom)')
        .eq('id', id)
        .maybeSingle()

      if (error) throw error
      setDepannage(data || null)
    } catch (error) {
      console.error('Erreur chargement detail depannage', error)
      setErreur("Impossible de charger ce depannage. Reessaie dans un instant.")
      setDepannage(null)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div>
      <div className="top-bar">
        <div>
          <button
            onClick={() => navigate('/admin', { state: { vue: 'depannages' } })}
            style={{ background: 'none', border: 'none', color: '#185FA5', fontSize: '13px', cursor: 'pointer', padding: 0 }}
          >
            Retour
          </button>
          <div style={{ fontWeight: 600, fontSize: '15px', marginTop: '4px' }}>Detail depannage</div>
          <div style={{ fontSize: '11px', color: '#888' }}>Bon #{id}</div>
        </div>
      </div>

      <div className="page-content">
        {loading && (
          <div className="card">
            <LoadingSpinner />
          </div>
        )}

        {!loading && erreur && (
          <div className="card" style={{ color: '#A32D2D', fontSize: '13px' }}>
            {erreur}
          </div>
        )}

        {!loading && !erreur && !depannage && (
          <div className="card" style={{ fontSize: '13px', color: '#888' }}>
            Aucun depannage trouve pour ce bon.
          </div>
        )}

        {!loading && !erreur && depannage && (
          <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <InfoLine label="Regie" value={depannage.regie?.nom || 'Non assignee'} />
            <InfoLine label="Adresse / titre" value={depannage.adresse} />
            <InfoLine label="Description" value={depannage.remarques} />
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
              <InfoLine label="Date" value={formatDate(depannage.date_travail)} />
              <InfoLine label="Cree le" value={formatDateTime(depannage.created_at)} />
            </div>
            <InfoLine label="Createur" value={depannage.employe?.prenom || 'Non disponible'} />
          </div>
        )}
      </div>
    </div>
  )
}
