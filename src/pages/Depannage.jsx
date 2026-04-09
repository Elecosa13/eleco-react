import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'

const DUREES = [1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5, 5.5, 6, 6.5, 7, 7.5, 8]

export default function Depannage() {
  const navigate = useNavigate()
  const user = JSON.parse(localStorage.getItem('eleco_user') || 'null')
  const [adresse, setAdresse] = useState('')
  const [duree, setDuree] = useState(1)
  const [remarques, setRemarques] = useState('')
  const [date, setDate] = useState(new Date().toISOString().split('T')[0])
  const [creditUtilise, setCreditUtilise] = useState(0)
  const [envoi, setEnvoi] = useState(false)
  const [succes, setSucces] = useState(false)
  const CREDIT_JOUR = 8

  useEffect(() => { chargerCredit() }, [])

  async function chargerCredit() {
    const { data } = await supabase
      .from('time_entries')
      .select('duree')
      .eq('employe_id', user.id)
      .eq('date_travail', date)
    if (data) setCreditUtilise(data.reduce((s, e) => s + Number(e.duree), 0))
  }

  async function envoyer(e) {
    e.preventDefault()
    if (!adresse) return
    setEnvoi(true)

    // Créer le dépannage
    const { data: dep } = await supabase
      .from('depannages')
      .insert({ employe_id: user.id, date_travail: date, adresse, duree, remarques })
      .select()
      .single()

    // Enregistrer dans time_entries
    if (dep) {
      await supabase.from('time_entries').insert({
        employe_id: user.id,
        date_travail: date,
        type: 'depannage',
        reference_id: dep.id,
        duree
      })
    }

    setEnvoi(false)
    setSucces(true)
    setTimeout(() => navigate('/employe'), 2000)
  }

  const creditRestant = CREDIT_JOUR - creditUtilise
  const depasse = creditUtilise + duree > CREDIT_JOUR

  if (succes) return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '16px' }}>
      <div style={{ fontSize: '48px' }}>✅</div>
      <div style={{ fontWeight: 600, fontSize: '16px' }}>Dépannage enregistré !</div>
    </div>
  )

  return (
    <div>
      <div className="top-bar">
        <div>
          <button onClick={() => navigate('/employe')} style={{ background: 'none', border: 'none', color: '#185FA5', fontSize: '13px', cursor: 'pointer', padding: 0 }}>← Retour</button>
          <div style={{ fontWeight: 600, fontSize: '15px', marginTop: '4px' }}>Nouveau dépannage</div>
        </div>
      </div>

      <form onSubmit={envoyer}>
        <div className="page-content">

          {/* Crédit restant */}
          <div style={{
            background: depasse ? '#FCEBEB' : '#E6F1FB',
            border: `1px solid ${depasse ? '#f09595' : '#185FA5'}`,
            borderRadius: '8px', padding: '10px 14px', fontSize: '12px',
            color: depasse ? '#A32D2D' : '#185FA5', fontWeight: 500
          }}>
            {depasse
              ? `⚠️ Dépassement — crédit restant : ${creditRestant.toFixed(1)}h`
              : `Crédit restant aujourd'hui : ${creditRestant.toFixed(1)}h`}
          </div>

          <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div style={{ fontWeight: 600, fontSize: '14px' }}>Informations</div>

            <div className="form-group">
              <label>Date</label>
              <input type="date" value={date} onChange={e => { setDate(e.target.value); chargerCredit() }} required />
            </div>

            <div className="form-group">
              <label>Adresse *</label>
              <input
                value={adresse}
                onChange={e => setAdresse(e.target.value)}
                placeholder="Rue, NPA Ville"
                required
              />
            </div>

            <div className="form-group">
              <label>Durée (minimum 1h)</label>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginTop: '4px' }}>
                {DUREES.map(d => (
                  <button
                    key={d}
                    type="button"
                    onClick={() => setDuree(d)}
                    style={{
                      padding: '8px 14px', borderRadius: '20px', fontSize: '13px', fontWeight: 500,
                      cursor: 'pointer', border: duree === d ? 'none' : '1px solid #ddd',
                      background: duree === d ? '#185FA5' : 'white',
                      color: duree === d ? 'white' : '#333'
                    }}
                  >
                    {d % 1 === 0 ? `${d}h` : `${Math.floor(d)}h30`}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <div style={{ fontWeight: 600, fontSize: '14px' }}>Remarques</div>
            <textarea
              placeholder="Observations, client, travaux effectués..."
              value={remarques}
              onChange={e => setRemarques(e.target.value)}
              rows={3}
            />
          </div>

          <button type="submit" className="btn-primary" disabled={envoi}>
            {envoi ? 'Envoi...' : '⚡ Enregistrer le dépannage'}
          </button>
        </div>
      </form>
    </div>
  )
}0
