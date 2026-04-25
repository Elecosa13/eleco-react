import React, { useState } from 'react'
import { supabase } from '../lib/supabase'

export default function RapportV1({ user, onRetour }) {
  const today = new Date().toISOString().split('T')[0]

  const [date, setDate] = useState(today)
  const [heureDebut, setHeureDebut] = useState('08:00')
  const [heureFin, setHeureFin] = useState('17:00')
  const [adresse, setAdresse] = useState('')
  const [contact, setContact] = useState('')
  const [travail, setTravail] = useState('')
  const [heuresSup, setHeuresSup] = useState(0)
  const [envoi, setEnvoi] = useState(false)
  const [succes, setSucces] = useState(false)
  const [erreur, setErreur] = useState('')

  function reinitialiser() {
    setDate(today)
    setHeureDebut('08:00')
    setHeureFin('17:00')
    setAdresse('')
    setContact('')
    setTravail('')
    setHeuresSup(0)
    setErreur('')
    setSucces(false)
  }

  async function soumettre(e) {
    e.preventDefault()
    if (!date || !travail.trim()) return
    setErreur('')
    setEnvoi(true)

    const parties = [
      adresse.trim() ? `Adresse : ${adresse.trim()}` : null,
      contact.trim() ? `Contact : ${contact.trim()}` : null,
      `Travail effectué : ${travail.trim()}`,
      Number(heuresSup) > 0 ? `Heures sup. : ${heuresSup}h` : null
    ].filter(Boolean)
    const remarques = parties.join('\n')

    try {
      const { error } = await supabase.from('rapports').insert({
        employe_id: user.id,
        date_travail: date,
        heure_debut: heureDebut || null,
        heure_fin: heureFin || null,
        remarques,
        valide: false
      })

      if (error) {
        if (error.message?.includes('duplicate_chantier_rapport')) {
          setErreur('Un rapport existe déjà pour cette date. Modifie la date ou contacte l\'admin.')
        } else {
          setErreur('Erreur lors de l\'envoi. Réessaie dans un instant.')
        }
        return
      }

      setSucces(true)
    } catch {
      setErreur('Erreur lors de l\'envoi. Réessaie dans un instant.')
    } finally {
      setEnvoi(false)
    }
  }

  if (succes) return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '48px 24px', gap: '16px', minHeight: '320px' }}>
      <div style={{ fontSize: '52px' }}>✅</div>
      <div style={{ fontWeight: 700, fontSize: '17px' }}>Rapport envoyé !</div>
      <div style={{ fontSize: '13px', color: '#888', textAlign: 'center' }}>Il sera visible par l'administration.</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', width: '100%', maxWidth: '280px', marginTop: '8px' }}>
        <button className="btn-primary" onClick={reinitialiser}>Nouveau rapport</button>
        <button className="btn-outline" onClick={onRetour}>Retour à l'accueil</button>
      </div>
    </div>
  )

  return (
    <form onSubmit={soumettre} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
      <div className="grid2">
        <div className="form-group" style={{ gridColumn: '1 / -1' }}>
          <label>Date *</label>
          <input type="date" value={date} onChange={e => setDate(e.target.value)} required />
        </div>
        <div className="form-group">
          <label>Heure début</label>
          <input type="time" value={heureDebut} onChange={e => setHeureDebut(e.target.value)} />
        </div>
        <div className="form-group">
          <label>Heure fin</label>
          <input type="time" value={heureFin} onChange={e => setHeureFin(e.target.value)} />
        </div>
      </div>

      <div className="form-group">
        <label>Adresse / lieu</label>
        <input
          type="text"
          value={adresse}
          onChange={e => setAdresse(e.target.value)}
          placeholder="Adresse de l'intervention"
        />
      </div>

      <div className="form-group">
        <label>Personne de contact</label>
        <input
          type="text"
          value={contact}
          onChange={e => setContact(e.target.value)}
          placeholder="Nom du contact sur place"
        />
      </div>

      <div className="form-group">
        <label>Travail effectué *</label>
        <textarea
          rows={5}
          value={travail}
          onChange={e => setTravail(e.target.value)}
          placeholder="Décrivez le travail effectué..."
          required
          style={{ resize: 'vertical' }}
        />
      </div>

      <div className="form-group">
        <label>Heures supplémentaires</label>
        <input
          type="number"
          min="0"
          max="24"
          step="0.5"
          value={heuresSup}
          onChange={e => setHeuresSup(e.target.value)}
        />
      </div>

      {erreur && (
        <div style={{ background: '#FCEBEB', border: '1px solid #f09595', borderRadius: '8px', padding: '10px 14px', fontSize: '12px', color: '#A32D2D' }}>
          {erreur}
        </div>
      )}

      <button type="submit" className="btn-primary" disabled={envoi || !travail.trim()}>
        {envoi ? 'Envoi en cours...' : '✓ Envoyer le rapport'}
      </button>
    </form>
  )
}
