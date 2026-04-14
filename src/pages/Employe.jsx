import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'

const QUOTA_VACANCES = 20 // jours ouvrables par an (par défaut)

function countJoursOuvrables(dateDebut, dateFin) {
  if (!dateDebut || !dateFin) return 0
  const start = new Date(dateDebut + 'T12:00:00')
  const end = new Date(dateFin + 'T12:00:00')
  if (end < start) return 0
  let count = 0
  const cur = new Date(start)
  while (cur <= end) {
    const day = cur.getDay()
    if (day !== 0 && day !== 6) count++
    cur.setDate(cur.getDate() + 1)
  }
  return count
}

export default function Employe() {
  const navigate = useNavigate()
  const user = JSON.parse(localStorage.getItem('eleco_user') || 'null')
  const [chantiers, setChantiers] = useState([])
  const [vue, setVue] = useState('accueil')
  const [creditUtilise, setCreditUtilise] = useState(0)
  const [recherche, setRecherche] = useState('')
  const [ajoutChantier, setAjoutChantier] = useState(false)
  const [nouveauNom, setNouveauNom] = useState('')
  const [nouvelleAdresse, setNouvelleAdresse] = useState('')
  const [confirmDoublon, setConfirmDoublon] = useState(null)
  const [depannagesRecents, setDepannagesRecents] = useState([])

  // Heures supplémentaires
  const [modalSupp, setModalSupp] = useState(false)
  const [suppHeures, setSuppHeures] = useState(1)
  const [suppJustification, setSuppJustification] = useState('')
  const [suppChantierId, setSuppChantierId] = useState('')
  const [suppDepannageId, setSuppDepannageId] = useState('')
  const [suppEnvoi, setSuppEnvoi] = useState(false)
  const [suppSucces, setSuppSucces] = useState(false)

  // Vacances
  const [vacances, setVacances] = useState([])
  const [soldeVacances, setSoldeVacances] = useState({ pris: 0, attente: 0 })
  const [modalVacances, setModalVacances] = useState(false)
  const [vacDateDebut, setVacDateDebut] = useState('')
  const [vacDateFin, setVacDateFin] = useState('')
  const [vacCommentaire, setVacCommentaire] = useState('')
  const [vacEnvoi, setVacEnvoi] = useState(false)
  const [vacSucces, setVacSucces] = useState(false)

  const CREDIT_JOUR = 8

  useEffect(() => { charger() }, [])

  async function charger() {
    const { data } = await supabase.from('chantiers').select('*').eq('actif', true).order('nom')
    if (data) setChantiers(data)

    const aujourd_hui = new Date().toISOString().split('T')[0]
    const { data: entries } = await supabase
      .from('time_entries').select('duree')
      .eq('employe_id', user.id).eq('date_travail', aujourd_hui)
    if (entries) setCreditUtilise(entries.reduce((s, e) => s + Number(e.duree), 0))

    const { data: deps } = await supabase
      .from('depannages').select('id, adresse, date_travail')
      .eq('employe_id', user.id)
      .order('date_travail', { ascending: false }).limit(10)
    if (deps) setDepannagesRecents(deps)

    // Charger vacances
    const annee = new Date().getFullYear()
    const { data: vac } = await supabase.from('vacances')
      .select('*').eq('employe_id', user.id)
      .order('created_at', { ascending: false })
    if (vac) {
      setVacances(vac)
      const pris = vac
        .filter(v => v.statut === 'accepte' && new Date(v.date_debut + 'T12:00:00').getFullYear() === annee)
        .reduce((s, v) => s + countJoursOuvrables(v.date_debut, v.date_fin), 0)
      const attente = vac
        .filter(v => v.statut === 'en_attente' && new Date(v.date_debut + 'T12:00:00').getFullYear() === annee)
        .reduce((s, v) => s + countJoursOuvrables(v.date_debut, v.date_fin), 0)
      setSoldeVacances({ pris, attente })
    }
  }

  async function creerChantier(forcer = false) {
    if (!nouveauNom.trim()) return
    if (!forcer) {
      const existe = chantiers.find(c => c.nom.toLowerCase() === nouveauNom.toLowerCase())
      if (existe) { setConfirmDoublon(existe); return }
    }
    await supabase.from('chantiers').insert({ nom: nouveauNom, adresse: nouvelleAdresse })
    setNouveauNom(''); setNouvelleAdresse(''); setAjoutChantier(false); setConfirmDoublon(null); charger()
  }

  async function soumettreHeuresSupp(e) {
    e.preventDefault()
    if (!suppJustification.trim() || Number(suppHeures) <= 0) return
    setSuppEnvoi(true)
    const aujourd_hui = new Date().toISOString().split('T')[0]
    await supabase.from('time_entries').insert({
      employe_id: user.id,
      date_travail: aujourd_hui,
      type: 'heures_supp',
      duree: Number(suppHeures),
      commentaire: suppJustification.trim(),
      chantier_id: suppChantierId || null,
      reference_id: suppDepannageId || null
    })
    setSuppEnvoi(false)
    setSuppSucces(true)
    setTimeout(() => {
      setSuppSucces(false)
      setModalSupp(false)
      setSuppHeures(1)
      setSuppJustification('')
      setSuppChantierId('')
      setSuppDepannageId('')
      charger()
    }, 1500)
  }

  async function soumettreVacances(e) {
    e.preventDefault()
    if (!vacDateDebut || !vacDateFin || vacDateFin < vacDateDebut) return
    setVacEnvoi(true)
    await supabase.from('vacances').insert({
      employe_id: user.id,
      date_debut: vacDateDebut,
      date_fin: vacDateFin,
      commentaire: vacCommentaire.trim() || null,
      statut: 'en_attente'
    })
    setVacEnvoi(false)
    setVacSucces(true)
    setTimeout(() => {
      setVacSucces(false)
      setModalVacances(false)
      setVacDateDebut('')
      setVacDateFin('')
      setVacCommentaire('')
      charger()
    }, 1500)
  }

  async function deconnecter() {
    await supabase.auth.signOut()
    localStorage.removeItem('eleco_user')
    navigate('/login')
  }

  const creditRestant = CREDIT_JOUR - creditUtilise
  const pourcent = Math.min(100, (creditUtilise / CREDIT_JOUR) * 100)
  const couleurBarre = creditUtilise >= CREDIT_JOUR ? '#27ae60' : creditUtilise >= 6 ? '#f39c12' : '#185FA5'

  const chantiersFiltres = chantiers.filter(c =>
    c.nom.toLowerCase().includes(recherche.toLowerCase()) ||
    (c.adresse || '').toLowerCase().includes(recherche.toLowerCase())
  )

  const statutLabel = { en_attente: 'En attente', accepte: 'Accepté', refuse: 'Refusé' }
  const statutColor = { en_attente: '#BA7517', accepte: '#3B6D11', refuse: '#A32D2D' }
  const statutBg = { en_attente: '#FAEEDA', accepte: '#EAF3DE', refuse: '#FCEBEB' }

  // ─── Modal heures supplémentaires ─────────────────────────────────────────
  if (modalSupp) {
    if (suppSucces) return (
      <div style={{ position: 'fixed', inset: 0, background: 'white', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '16px', zIndex: 100 }}>
        <div style={{ fontSize: '48px' }}>✅</div>
        <div style={{ fontWeight: 600, fontSize: '16px' }}>Heures supp. enregistrées !</div>
      </div>
    )
    return (
      <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 100, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end' }}>
        <div style={{ background: 'white', borderRadius: '16px 16px 0 0', padding: '20px 16px', maxHeight: '90vh', overflowY: 'auto' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <span style={{ fontWeight: 700, fontSize: '16px' }}>Heures supplémentaires</span>
            <button onClick={() => setModalSupp(false)} style={{ background: 'none', border: 'none', fontSize: '22px', color: '#888', padding: '4px', lineHeight: 1 }}>✕</button>
          </div>
          <form onSubmit={soumettreHeuresSupp} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <div className="form-group">
              <label>Nombre d'heures *</label>
              <input type="number" min="0.5" max="24" step="0.5" value={suppHeures} onChange={e => setSuppHeures(e.target.value)} required />
            </div>
            <div className="form-group">
              <label>Justification *</label>
              <textarea rows={3} value={suppJustification} onChange={e => setSuppJustification(e.target.value)} placeholder="Motif des heures supplémentaires..." required style={{ resize: 'none' }} />
            </div>
            <div className="form-group">
              <label>Chantier (optionnel)</label>
              <select value={suppChantierId} onChange={e => { setSuppChantierId(e.target.value); if (e.target.value) setSuppDepannageId('') }}>
                <option value="">Aucun</option>
                {chantiers.map(c => <option key={c.id} value={c.id}>{c.nom}</option>)}
              </select>
            </div>
            {depannagesRecents.length > 0 && (
              <div className="form-group">
                <label>Dépannage (optionnel)</label>
                <select value={suppDepannageId} onChange={e => { setSuppDepannageId(e.target.value); if (e.target.value) setSuppChantierId('') }}>
                  <option value="">Aucun</option>
                  {depannagesRecents.map(d => (
                    <option key={d.id} value={d.id}>{d.adresse} · {new Date(d.date_travail + 'T12:00:00').toLocaleDateString('fr-CH')}</option>
                  ))}
                </select>
              </div>
            )}
            <div style={{ background: '#FAEEDA', border: '1px solid #f39c12', borderRadius: '8px', padding: '10px 14px', fontSize: '12px', color: '#BA7517' }}>
              Ces heures seront visibles par l'administration.
            </div>
            <button type="submit" className="btn-primary" disabled={suppEnvoi || !suppJustification.trim()}>
              {suppEnvoi ? 'Enregistrement...' : '✓ Enregistrer les heures supp.'}
            </button>
          </form>
        </div>
      </div>
    )
  }

  // ─── Modal demande de vacances ─────────────────────────────────────────────
  if (modalVacances) {
    if (vacSucces) return (
      <div style={{ position: 'fixed', inset: 0, background: 'white', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '16px', zIndex: 100 }}>
        <div style={{ fontSize: '48px' }}>✅</div>
        <div style={{ fontWeight: 600, fontSize: '16px' }}>Demande envoyée !</div>
        <div style={{ fontSize: '13px', color: '#888' }}>En attente de validation par l'administration.</div>
      </div>
    )
    const joursSelectionnes = countJoursOuvrables(vacDateDebut, vacDateFin)
    const restant = QUOTA_VACANCES - soldeVacances.pris
    return (
      <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 100, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end' }}>
        <div style={{ background: 'white', borderRadius: '16px 16px 0 0', padding: '20px 16px', maxHeight: '90vh', overflowY: 'auto' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <span style={{ fontWeight: 700, fontSize: '16px' }}>Demande de vacances</span>
            <button onClick={() => setModalVacances(false)} style={{ background: 'none', border: 'none', fontSize: '22px', color: '#888', padding: '4px', lineHeight: 1 }}>✕</button>
          </div>
          <form onSubmit={soumettreVacances} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <div className="grid2">
              <div className="form-group">
                <label>Date de début *</label>
                <input type="date" value={vacDateDebut} onChange={e => setVacDateDebut(e.target.value)} required />
              </div>
              <div className="form-group">
                <label>Date de fin *</label>
                <input type="date" value={vacDateFin} min={vacDateDebut} onChange={e => setVacDateFin(e.target.value)} required />
              </div>
            </div>
            {joursSelectionnes > 0 && (
              <div style={{
                background: joursSelectionnes > restant ? '#FCEBEB' : '#E6F1FB',
                border: `1px solid ${joursSelectionnes > restant ? '#f09595' : '#185FA5'}`,
                borderRadius: '8px', padding: '10px 14px', fontSize: '12px',
                color: joursSelectionnes > restant ? '#A32D2D' : '#185FA5'
              }}>
                {joursSelectionnes} j. ouvrables sélectionnés · {restant} j. restants au quota
                {joursSelectionnes > restant && ' — Dépassement de quota !'}
              </div>
            )}
            <div className="form-group">
              <label>Commentaire (optionnel)</label>
              <textarea rows={2} value={vacCommentaire} onChange={e => setVacCommentaire(e.target.value)} placeholder="Informations complémentaires..." style={{ resize: 'none' }} />
            </div>
            <button type="submit" className="btn-primary" disabled={vacEnvoi || !vacDateDebut || !vacDateFin || vacDateFin < vacDateDebut}>
              {vacEnvoi ? 'Envoi...' : '✓ Envoyer la demande'}
            </button>
          </form>
        </div>
      </div>
    )
  }

  // ─── Confirmation doublon ──────────────────────────────────────────────────
  if (confirmDoublon) return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '24px', gap: '16px' }}>
      <div style={{ fontSize: '40px' }}>⚠️</div>
      <div style={{ fontWeight: 600, fontSize: '16px', textAlign: 'center' }}>"{nouveauNom}" existe déjà</div>
      <div style={{ fontSize: '13px', color: '#888', textAlign: 'center' }}>Voulez-vous quand même créer un nouveau chantier avec ce nom ?</div>
      <div style={{ display: 'flex', gap: '10px', width: '100%', maxWidth: '300px' }}>
        <button className="btn-outline" style={{ flex: 1 }} onClick={() => setConfirmDoublon(null)}>Non</button>
        <button className="btn-primary" style={{ flex: 1 }} onClick={() => creerChantier(true)}>Oui, créer</button>
      </div>
    </div>
  )

  // ─── Vue principale ────────────────────────────────────────────────────────
  return (
    <div>
      <div className="top-bar">
        <div>
          <div style={{ fontWeight: 600, fontSize: '15px' }}>
            {vue === 'accueil' ? `Bonjour, ${user?.prenom}` : 'Chantiers actifs'}
          </div>
          <div style={{ fontSize: '11px', color: '#888' }}>Espace employé</div>
        </div>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          {vue !== 'accueil' && (
            <button className="btn-outline btn-sm" onClick={() => { setVue('accueil'); setRecherche(''); setAjoutChantier(false) }}>← Retour</button>
          )}
          <button className="avatar" onClick={deconnecter}>{user?.initiales}</button>
        </div>
      </div>

      <div className="page-content">
        {vue === 'accueil' && <>
          {/* Barre crédit heures */}
          <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontWeight: 600, fontSize: '14px' }}>Crédit heures aujourd'hui</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '13px', fontWeight: 600, color: couleurBarre }}>
                  {creditUtilise.toFixed(1)}h / {CREDIT_JOUR}h
                </span>
                <button
                  onClick={() => setModalSupp(true)}
                  title="Ajouter des heures supplémentaires"
                  style={{ width: 26, height: 26, borderRadius: '50%', background: '#185FA5', color: 'white', border: 'none', fontSize: '18px', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0, flexShrink: 0, lineHeight: 1 }}
                >+</button>
              </div>
            </div>
            <div style={{ background: '#eee', borderRadius: '6px', height: '8px', overflow: 'hidden' }}>
              <div style={{ width: `${pourcent}%`, background: couleurBarre, height: '100%', borderRadius: '6px', transition: 'width 0.3s' }} />
            </div>
            <div style={{ fontSize: '12px', color: '#888' }}>
              {creditRestant > 0 ? `Il reste ${creditRestant.toFixed(1)}h à saisir` : '✅ Journée complète'}
            </div>
          </div>

          {/* Modules principaux */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <button onClick={() => setVue('chantiers')} style={{ background: '#E6F1FB', border: '1px solid #185FA5', borderRadius: '12px', padding: '20px 12px', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '28px' }}>🏗️</span>
              <span style={{ fontWeight: 600, fontSize: '14px', color: '#185FA5' }}>Chantier</span>
              <span style={{ fontSize: '11px', color: '#666' }}>Travail sur chantier en cours</span>
            </button>
            <button onClick={() => navigate('/employe/depannage')} style={{ background: '#FEF3E2', border: '1px solid #f39c12', borderRadius: '12px', padding: '20px 12px', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '28px' }}>⚡</span>
              <span style={{ fontWeight: 600, fontSize: '14px', color: '#d68910' }}>Dépannage</span>
              <span style={{ fontSize: '11px', color: '#666' }}>Intervention rapide</span>
            </button>
          </div>

          {/* Vacances */}
          <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontWeight: 600, fontSize: '14px' }}>🏖️ Vacances {new Date().getFullYear()}</span>
              <button className="btn-primary btn-sm" style={{ width: 'auto' }} onClick={() => setModalVacances(true)}>+ Demande</button>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px', textAlign: 'center' }}>
              <div style={{ background: '#EAF3DE', borderRadius: '8px', padding: '8px 4px' }}>
                <div style={{ fontSize: '20px', fontWeight: 700, color: '#3B6D11' }}>{soldeVacances.pris}</div>
                <div style={{ fontSize: '10px', color: '#3B6D11', marginTop: '2px' }}>Pris</div>
              </div>
              <div style={{ background: '#FAEEDA', borderRadius: '8px', padding: '8px 4px' }}>
                <div style={{ fontSize: '20px', fontWeight: 700, color: '#BA7517' }}>{soldeVacances.attente}</div>
                <div style={{ fontSize: '10px', color: '#BA7517', marginTop: '2px' }}>En attente</div>
              </div>
              <div style={{ background: '#E6F1FB', borderRadius: '8px', padding: '8px 4px' }}>
                <div style={{ fontSize: '20px', fontWeight: 700, color: '#185FA5' }}>{Math.max(0, QUOTA_VACANCES - soldeVacances.pris)}</div>
                <div style={{ fontSize: '10px', color: '#185FA5', marginTop: '2px' }}>Restants</div>
              </div>
            </div>
            <div style={{ fontSize: '11px', color: '#aaa', textAlign: 'right' }}>Quota annuel : {QUOTA_VACANCES} j. ouvrables</div>
            {vacances.length === 0 && (
              <div style={{ fontSize: '12px', color: '#bbb', textAlign: 'center', padding: '4px 0' }}>Aucune demande</div>
            )}
            {vacances.slice(0, 4).map((v, i) => (
              <div key={v.id || i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: '8px', borderTop: i === 0 ? '1px solid #eee' : 'none', paddingBottom: '4px' }}>
                <div>
                  <div style={{ fontSize: '12px', fontWeight: 500 }}>
                    {new Date(v.date_debut + 'T12:00:00').toLocaleDateString('fr-CH', { day: '2-digit', month: '2-digit' })}
                    {v.date_fin !== v.date_debut && ` → ${new Date(v.date_fin + 'T12:00:00').toLocaleDateString('fr-CH', { day: '2-digit', month: '2-digit' })}`}
                    <span style={{ color: '#aaa', marginLeft: '4px', fontWeight: 400, fontSize: '11px' }}>({countJoursOuvrables(v.date_debut, v.date_fin)} j.)</span>
                  </div>
                  {v.commentaire && <div style={{ fontSize: '10px', color: '#999', fontStyle: 'italic', marginTop: '1px' }}>{v.commentaire}</div>}
                </div>
                <span style={{ fontSize: '11px', fontWeight: 500, padding: '3px 8px', borderRadius: '12px', flexShrink: 0, marginLeft: '8px', background: statutBg[v.statut] || '#f0f0f0', color: statutColor[v.statut] || '#666' }}>
                  {statutLabel[v.statut] || v.statut}
                </span>
              </div>
            ))}
          </div>
        </>}

        {vue === 'chantiers' && <>
          <input
            type="search"
            placeholder="🔍 Rechercher un chantier..."
            value={recherche}
            onChange={e => setRecherche(e.target.value)}
            style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid #ddd', fontSize: '13px' }}
          />
          {ajoutChantier && (
            <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <div style={{ fontWeight: 600, fontSize: '14px' }}>Nouveau chantier</div>
              <input placeholder="Nom *" value={nouveauNom} onChange={e => setNouveauNom(e.target.value)} style={{ padding: '8px', borderRadius: '6px', border: '1px solid #ddd', fontSize: '13px' }} />
              <input placeholder="Adresse" value={nouvelleAdresse} onChange={e => setNouvelleAdresse(e.target.value)} style={{ padding: '8px', borderRadius: '6px', border: '1px solid #ddd', fontSize: '13px' }} />
              <div style={{ display: 'flex', gap: '8px' }}>
                <button className="btn-outline" style={{ flex: 1 }} onClick={() => { setAjoutChantier(false); setNouveauNom(''); setNouvelleAdresse('') }}>Annuler</button>
                <button className="btn-primary" style={{ flex: 1 }} onClick={() => creerChantier(false)}>Créer</button>
              </div>
            </div>
          )}
          <div className="card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
              <span style={{ fontWeight: 600, fontSize: '14px' }}>Chantiers actifs</span>
              {!ajoutChantier && (
                <button className="btn-primary btn-sm" style={{ width: 'auto' }} onClick={() => setAjoutChantier(true)}>+ Nouveau</button>
              )}
            </div>
            {chantiersFiltres.length === 0 && <div style={{ fontSize: '13px', color: '#888' }}>Aucun chantier trouvé</div>}
            {chantiersFiltres.map(c => (
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
      </div>
    </div>
  )
}
