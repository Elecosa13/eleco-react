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

function buildForm(depannage) {
  return {
    regie_id: depannage?.regie_id || '',
    adresse: depannage?.adresse || '',
    remarques: depannage?.remarques || '',
    date_travail: depannage?.date_travail || ''
  }
}

export default function DepannageDetail() {
  const navigate = useNavigate()
  const { id } = useParams()
  const [depannage, setDepannage] = useState(null)
  const [regies, setRegies] = useState([])
  const [loading, setLoading] = useState(true)
  const [erreur, setErreur] = useState('')
  const [edition, setEdition] = useState(false)
  const [form, setForm] = useState(buildForm(null))
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')
  const [saveSuccess, setSaveSuccess] = useState('')

  useEffect(() => {
    chargerDepannage()
    chargerRegies()
  }, [id])

  async function lireDepannage() {
    const { data, error } = await supabase
      .from('depannages')
      .select('*, employe:employe_id(prenom), regie:regies(nom)')
      .eq('id', id)
      .maybeSingle()

    if (error) throw error
    return data || null
  }

  async function chargerDepannage() {
    setLoading(true)
    setErreur('')

    try {
      const data = await lireDepannage()
      setDepannage(data || null)
      setForm(buildForm(data))
    } catch (error) {
      console.error('Erreur chargement detail depannage', error)
      setErreur("Impossible de charger ce depannage. Reessaie dans un instant.")
      setDepannage(null)
    } finally {
      setLoading(false)
    }
  }

  async function chargerRegies() {
    try {
      const { data, error } = await supabase
        .from('regies')
        .select('id, nom')
        .eq('actif', true)
        .order('nom')

      if (error) throw error
      setRegies(data || [])
    } catch (error) {
      console.error('Erreur chargement regies depannage detail', error)
    }
  }

  function ouvrirEdition() {
    setForm(buildForm(depannage))
    setSaveError('')
    setSaveSuccess('')
    setEdition(true)
  }

  function annulerEdition() {
    setForm(buildForm(depannage))
    setSaveError('')
    setEdition(false)
  }

  async function enregistrerDepannage(e) {
    e.preventDefault()
    setSaveError('')
    setSaveSuccess('')

    const adresse = form.adresse.trim()
    const dateTravail = form.date_travail

    if (!adresse || !dateTravail) {
      setSaveError("L'adresse et la date sont obligatoires.")
      return
    }

    setSaving(true)

    try {
      const payload = {
        regie_id: form.regie_id || null,
        adresse,
        remarques: form.remarques.trim(),
        date_travail: dateTravail
      }

      const { data: updated, error: updateError } = await supabase
        .from('depannages')
        .update(payload)
        .eq('id', id)
        .select('id')
        .maybeSingle()

      if (updateError) throw updateError
      if (!updated) throw new Error('depannage_update_empty')

      const data = await lireDepannage()
      if (!data) throw new Error('depannage_update_refetch_empty')

      setDepannage(data)
      setForm(buildForm(data))
      setEdition(false)
      setSaveSuccess('Depannage mis a jour.')
    } catch (error) {
      console.error('Erreur sauvegarde depannage', error)
      setSaveError("Impossible d'enregistrer les modifications. Verifie les champs et reessaie.")
    } finally {
      setSaving(false)
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
            {saveSuccess && <div style={{ color: '#3B6D11', fontSize: '13px' }}>{saveSuccess}</div>}
            {saveError && <div style={{ color: '#A32D2D', fontSize: '13px' }}>{saveError}</div>}

            {edition ? (
              <form onSubmit={enregistrerDepannage} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <div className="form-group">
                  <label>Regie</label>
                  <select value={form.regie_id} onChange={e => setForm(prev => ({ ...prev, regie_id: e.target.value }))}>
                    <option value="">Non assignee</option>
                    {depannage.regie_id && depannage.regie?.nom && !regies.some(r => String(r.id) === String(depannage.regie_id)) && (
                      <option value={depannage.regie_id}>{depannage.regie.nom}</option>
                    )}
                    {regies.map(regie => (
                      <option key={regie.id} value={regie.id}>{regie.nom}</option>
                    ))}
                  </select>
                </div>
                <div className="form-group">
                  <label>Adresse / titre</label>
                  <input value={form.adresse} onChange={e => setForm(prev => ({ ...prev, adresse: e.target.value }))} required />
                </div>
                <div className="form-group">
                  <label>Description</label>
                  <textarea rows={4} value={form.remarques} onChange={e => setForm(prev => ({ ...prev, remarques: e.target.value }))} style={{ resize: 'vertical' }} />
                </div>
                <div className="form-group">
                  <label>Date</label>
                  <input type="date" value={form.date_travail} onChange={e => setForm(prev => ({ ...prev, date_travail: e.target.value }))} required />
                </div>
                <div style={{ display: 'flex', gap: '10px' }}>
                  <button type="button" className="btn-outline" onClick={annulerEdition} disabled={saving} style={{ flex: 1 }}>Annuler</button>
                  <button type="submit" className="btn-primary" disabled={saving} style={{ flex: 1 }}>
                    {saving ? 'Enregistrement...' : 'Enregistrer'}
                  </button>
                </div>
              </form>
            ) : (
              <>
                <InfoLine label="Regie" value={depannage.regie?.nom || 'Non assignee'} />
                <InfoLine label="Adresse / titre" value={depannage.adresse} />
                <InfoLine label="Description" value={depannage.remarques} />
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
                  <InfoLine label="Date" value={formatDate(depannage.date_travail)} />
                  <InfoLine label="Cree le" value={formatDateTime(depannage.created_at)} />
                </div>
                <InfoLine label="Createur" value={depannage.employe?.prenom || 'Non disponible'} />
                <button type="button" className="btn-primary" onClick={ouvrirEdition}>Modifier</button>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
