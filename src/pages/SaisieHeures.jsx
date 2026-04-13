import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'

function getISOWeek(dateStr) {
  const d = new Date(dateStr + 'T12:00:00')
  d.setDate(d.getDate() + 3 - ((d.getDay() + 6) % 7))
  const week1 = new Date(d.getFullYear(), 0, 4)
  return 1 + Math.round(((d - week1) / 86400000 - 3 + ((week1.getDay() + 6) % 7)) / 7)
}

function calcHeuresNettes(debut, fin, pauseMins) {
  if (!debut || !fin) return 0
  const [hd, md] = debut.split(':').map(Number)
  const [hf, mf] = fin.split(':').map(Number)
  const totalMins = (hf * 60 + mf) - (hd * 60 + md) - Number(pauseMins)
  return Math.max(0, Math.round(totalMins * 100 / 60) / 100)
}

export default function SaisieHeures() {
  const navigate = useNavigate()
  const user = JSON.parse(localStorage.getItem('eleco_user') || 'null')

  const [chantiers, setChantiers] = useState([])
  const [chantierId, setChantierId] = useState('')
  const [date, setDate] = useState(new Date().toISOString().split('T')[0])
  const [heureDebut, setHeureDebut] = useState('07:00')
  const [heureFin, setHeureFin] = useState('17:00')
  const [pauseMinutes, setPauseMinutes] = useState(30)
  const [commentaire, setCommentaire] = useState('')
  const [envoi, setEnvoi] = useState(false)
  const [succes, setSucces] = useState(false)
  const [entries, setEntries] = useState([])

  useEffect(() => {
    supabase.from('chantiers').select('id, nom').eq('actif', true).order('nom')
      .then(({ data }) => { if (data) setChantiers(data) })
    chargerEntries()
  }, [])

  async function chargerEntries() {
    const { data } = await supabase
      .from('time_entries')
      .select('*, chantiers(nom)')
      .eq('employe_id', user.id)
      .eq('type', 'heures')
      .order('date_travail', { ascending: false })
      .limit(20)
    if (data) setEntries(data)
  }

  const heuresNettes = calcHeuresNettes(heureDebut, heureFin, pauseMinutes)

  async function envoyer(e) {
    e.preventDefault()
    if (!chantierId) return
    setEnvoi(true)

    const semaine = getISOWeek(date)
    const annee = new Date(date + 'T12:00:00').getFullYear()

    await supabase.from('time_entries').insert({
      employe_id: user.id,
      date_travail: date,
      type: 'heures',
      chantier_id: chantierId,
      heure_debut: heureDebut,
      heure_fin: heureFin,
      pause_minutes: pauseMinutes,
      semaine,
      annee,
      heures_nettes: heuresNettes,
      duree: heuresNettes,
      commentaire: commentaire || null
    })

    setEnvoi(false)
    setSucces(true)
    setTimeout(() => {
      setSucces(false)
      chargerEntries()
    }, 1500)
    setChantierId('')
    setDate(new Date().toISOString().split('T')[0])
    setHeureDebut('07:00')
    setHeureFin('17:00')
    setPauseMinutes(30)
    setCommentaire('')
  }

  if (succes) return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '16px' }}>
      <div style={{ fontSize: '48px' }}>✅</div>
      <div style={{ fontWeight: 600, fontSize: '16px' }}>Heures enregistrées !</div>
    </div>
  )

  return (
    <div>
      <div className="top-bar">
        <div>
          <button onClick={() => navigate('/employe')} style={{ background: 'none', border: 'none', color: '#185FA5', fontSize: '13px', cursor: 'pointer', padding: 0 }}>← Retour</button>
          <div style={{ fontWeight: 600, fontSize: '15px', marginTop: '4px' }}>Mes heures</div>
        </div>
      </div>

      <form onSubmit={envoyer}>
        <div className="page-content">
          <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div style={{ fontWeight: 600, fontSize: '14px' }}>Nouvelle saisie</div>

            <div className="form-group">
              <label>Chantier *</label>
              <select value={chantierId} onChange={e => setChantierId(e.target.value)} required>
                <option value="">Sélectionner un chantier...</option>
                {chantiers.map(c => <option key={c.id} value={c.id}>{c.nom}</option>)}
              </select>
            </div>

            <div className="form-group">
              <label>Date</label>
              <input type="date" value={date} onChange={e => setDate(e.target.value)} required />
            </div>

            <div className="grid2">
              <div className="form-group">
                <label>Heure début</label>
                <input type="time" value={heureDebut} onChange={e => setHeureDebut(e.target.value)} required />
              </div>
              <div className="form-group">
                <label>Heure fin</label>
                <input type="time" value={heureFin} onChange={e => setHeureFin(e.target.value)} required />
              </div>
            </div>

            <div className="form-group">
              <label>Pause</label>
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '4px' }}>
                {[0, 15, 30, 45, 60].map(p => (
                  <button key={p} type="button" onClick={() => setPauseMinutes(p)} style={{
                    padding: '6px 14px', borderRadius: '20px', fontSize: '13px', fontWeight: 500, cursor: 'pointer',
                    border: pauseMinutes === p ? 'none' : '1px solid #ddd',
                    background: pauseMinutes === p ? '#185FA5' : 'white',
                    color: pauseMinutes === p ? 'white' : '#333'
                  }}>
                    {p === 0 ? 'Aucune' : `${p} min`}
                  </button>
                ))}
              </div>
            </div>

            <div className="form-group">
              <label>Commentaire</label>
              <input value={commentaire} onChange={e => setCommentaire(e.target.value)} placeholder="Optionnel..." />
            </div>

            <div style={{ background: '#E6F1FB', borderRadius: '8px', padding: '10px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '13px', color: '#185FA5', fontWeight: 500 }}>Heures nettes</span>
              <span style={{ fontSize: '20px', fontWeight: 700, color: '#185FA5' }}>{heuresNettes.toFixed(2)}h</span>
            </div>
          </div>

          <button type="submit" className="btn-primary" disabled={envoi || !chantierId}>
            {envoi ? 'Enregistrement...' : '✓ Enregistrer'}
          </button>

          {entries.length > 0 && (
            <div className="card">
              <div style={{ fontWeight: 600, fontSize: '14px', marginBottom: '10px' }}>Historique récent</div>
              {entries.map((e, i) => (
                <div key={e.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: i < entries.length - 1 ? '1px solid #eee' : 'none' }}>
                  <div>
                    <div style={{ fontSize: '13px', fontWeight: 500 }}>{e.chantiers?.nom || '—'}</div>
                    <div style={{ fontSize: '11px', color: '#888' }}>
                      {new Date(e.date_travail + 'T12:00:00').toLocaleDateString('fr-CH', { weekday: 'short', day: 'numeric', month: 'short' })}
                      {e.heure_debut && e.heure_fin ? ` · ${e.heure_debut.slice(0, 5)}–${e.heure_fin.slice(0, 5)}` : ''}
                      {e.pause_minutes ? ` · pause ${e.pause_minutes}min` : ''}
                    </div>
                    {e.commentaire && <div style={{ fontSize: '11px', color: '#999', fontStyle: 'italic' }}>{e.commentaire}</div>}
                  </div>
                  <span style={{ fontSize: '14px', fontWeight: 600, color: '#185FA5', flexShrink: 0, marginLeft: '8px' }}>
                    {Number(e.heures_nettes || e.duree || 0).toFixed(2)}h
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </form>
    </div>
  )
}
