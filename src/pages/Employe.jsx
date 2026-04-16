import React, { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth-context'
import { usePageRefresh } from '../lib/refresh'

const QUOTA_VACANCES = 20
const CREDIT_JOUR = 8

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

function datesSeChevauchent(debutA, finA, debutB, finB) {
  return debutA <= finB && finA >= debutB
}

function getISOWeek(dateStr) {
  const d = new Date(dateStr + 'T12:00:00')
  d.setDate(d.getDate() + 3 - ((d.getDay() + 6) % 7))
  const week1 = new Date(d.getFullYear(), 0, 4)
  return 1 + Math.round(((d - week1) / 86400000 - 3 + ((week1.getDay() + 6) % 7)) / 7)
}

function fmtDate(dateStr, opts) {
  return new Date(dateStr + 'T12:00:00').toLocaleDateString('fr-CH', opts)
}

export default function Employe() {
  const navigate = useNavigate()
  const { profile: user, signOut } = useAuth()

  const [chantiers, setChantiers] = useState([])
  const [vue, setVue] = useState('accueil')
  const [creditUtilise, setCreditUtilise] = useState(0)
  const [recherche, setRecherche] = useState('')
  const [ajoutChantier, setAjoutChantier] = useState(false)
  const [nouveauNom, setNouveauNom] = useState('')
  const [nouvelleAdresse, setNouvelleAdresse] = useState('')
  const [confirmDoublon, setConfirmDoublon] = useState(null)
  const [depannagesRecents, setDepannagesRecents] = useState([])

  const [modalSupp, setModalSupp] = useState(false)
  const [suppHeures, setSuppHeures] = useState(1)
  const [suppJustification, setSuppJustification] = useState('')
  const [suppChantierId, setSuppChantierId] = useState('')
  const [suppDepannageId, setSuppDepannageId] = useState('')
  const [suppEnvoi, setSuppEnvoi] = useState(false)
  const [suppSucces, setSuppSucces] = useState(false)
  const [suppHistorique, setSuppHistorique] = useState([])

  const [vacances, setVacances] = useState([])
  const [couvertureInfo, setCouvertureInfo] = useState({ count: 0, noms: null })
  const [soldeVacances, setSoldeVacances] = useState({ pris: 0, attente: 0 })
  const [quotaVacances, setQuotaVacances] = useState(QUOTA_VACANCES)
  const [periodesAdmin, setPeriodesAdmin] = useState([])
  const [vacErreur, setVacErreur] = useState('')
  const [modalVacances, setModalVacances] = useState(false)
  const [vacDateDebut, setVacDateDebut] = useState('')
  const [vacDateFin, setVacDateFin] = useState('')
  const [vacCommentaire, setVacCommentaire] = useState('')
  const [vacEnvoi, setVacEnvoi] = useState(false)
  const [vacSucces, setVacSucces] = useState(false)

  useEffect(() => { charger() }, [])
  usePageRefresh(() => charger(), [user?.id])

  useEffect(() => {
    if (!vacDateDebut || !vacDateFin || vacDateFin < vacDateDebut) {
      setCouvertureInfo({ count: 0, noms: null })
      return
    }
    supabase.rpc('get_couverture_vacances', { p_debut: vacDateDebut, p_fin: vacDateFin })
      .then(({ data }) => { if (data) setCouvertureInfo(data) })
  }, [vacDateDebut, vacDateFin])

  async function charger() {
    const { data: ch } = await supabase.from('chantiers').select('*').eq('actif', true).order('nom')
    if (ch) setChantiers(ch)

    const aujourdHui = new Date().toISOString().split('T')[0]
    const { data: entries } = await supabase
      .from('time_entries')
      .select('duree')
      .eq('employe_id', user.id)
      .eq('date_travail', aujourdHui)
    if (entries) setCreditUtilise(entries.reduce((s, e) => s + Number(e.duree), 0))

    const { data: deps } = await supabase
      .from('depannages')
      .select('id, adresse, date_travail')
      .eq('employe_id', user.id)
      .order('date_travail', { ascending: false })
      .limit(10)
    if (deps) setDepannagesRecents(deps)

    const { data: supp } = await supabase
      .from('time_entries')
      .select('id, date_travail, duree, commentaire, chantiers(nom)')
      .eq('employe_id', user.id)
      .eq('type', 'heures_supp')
      .order('date_travail', { ascending: false })
      .limit(8)
    if (supp) setSuppHistorique(supp)

    const annee = new Date().getFullYear()
    const { data: profil } = await supabase
      .from('utilisateurs')
      .select('vacances_quota_annuel')
      .eq('id', user.id)
      .maybeSingle()
    const quota = profil?.vacances_quota_annuel || QUOTA_VACANCES
    setQuotaVacances(quota)

    const { data: periodes } = await supabase.from('vacances_blocages')
      .select('*')
      .eq('actif', true)
      .order('date_debut', { ascending: true })
    if (periodes) setPeriodesAdmin(periodes)

    const { data: vac } = await supabase.from('vacances')
      .select('*')
      .eq('employe_id', user.id)
      .order('created_at', { ascending: false })

    if (vac) {
      setVacances(vac)
      const pris = vac
        .filter(v => v.statut === 'accepte' && new Date(v.date_debut + 'T12:00:00').getFullYear() === annee)
        .reduce((s, v) => s + Number(v.jours_ouvrables || countJoursOuvrables(v.date_debut, v.date_fin)), 0)
      const attente = vac
        .filter(v => v.statut === 'en_attente' && new Date(v.date_debut + 'T12:00:00').getFullYear() === annee)
        .reduce((s, v) => s + Number(v.jours_ouvrables || countJoursOuvrables(v.date_debut, v.date_fin)), 0)
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
    setNouveauNom('')
    setNouvelleAdresse('')
    setAjoutChantier(false)
    setConfirmDoublon(null)
    charger()
  }

  async function soumettreHeuresSupp(e) {
    e.preventDefault()
    if (!suppJustification.trim() || Number(suppHeures) <= 0) return
    setSuppEnvoi(true)
    const aujourdHui = new Date().toISOString().split('T')[0]
    const annee = new Date(aujourdHui + 'T12:00:00').getFullYear()
    await supabase.from('time_entries').insert({
      employe_id: user.id,
      date_travail: aujourdHui,
      type: 'heures_supp',
      duree: Number(suppHeures),
      heures_nettes: Number(suppHeures),
      semaine: getISOWeek(aujourdHui),
      annee,
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

  const joursVacancesSelectionnes = useMemo(
    () => countJoursOuvrables(vacDateDebut, vacDateFin),
    [vacDateDebut, vacDateFin]
  )

  const periodeSpeciale = useMemo(() => {
    if (!vacDateDebut || !vacDateFin) return null
    return periodesAdmin.find(p =>
      (p.type || 'blocage') === 'fermeture_collective' &&
      datesSeChevauchent(vacDateDebut, vacDateFin, p.date_debut, p.date_fin)
    )
  }, [periodesAdmin, vacDateDebut, vacDateFin])

  const alerteCouverture = useMemo(() => {
    if (!couvertureInfo || couvertureInfo.count < 2 || periodeSpeciale) return ''
    const noms = (couvertureInfo.noms || []).filter(Boolean)
    const periode = noms.length ? ' (' + noms.join(', ') + ')' : ''
    return 'Attention effectif reduit : ' + couvertureInfo.count + ' autre(s) absence(s) sur cette periode' + periode + '.'
  }, [couvertureInfo, periodeSpeciale])

  async function soumettreVacances(e) {
    e.preventDefault()
    if (!vacDateDebut || !vacDateFin || vacDateFin < vacDateDebut) return

    const blocage = periodesAdmin.find(p =>
      (p.type || 'blocage') === 'blocage' &&
      datesSeChevauchent(vacDateDebut, vacDateFin, p.date_debut, p.date_fin)
    )
    if (blocage) {
      setVacErreur(`Période bloquée : ${blocage.motif}`)
      return
    }

    if (joursVacancesSelectionnes <= 0) {
      setVacErreur('Sélectionne au moins un jour ouvrable.')
      return
    }

    const restant = quotaVacances - soldeVacances.pris
    if (joursVacancesSelectionnes > restant) {
      setVacErreur(`Quota dépassé : il reste ${Math.max(0, restant)} jour(s).`)
      return
    }

    const doublonPerso = vacances.find(v =>
      ['en_attente', 'accepte'].includes(v.statut) &&
      datesSeChevauchent(vacDateDebut, vacDateFin, v.date_debut, v.date_fin)
    )
    if (doublonPerso) {
      setVacErreur('Tu as déjà une demande en attente ou acceptée sur cette période.')
      return
    }

    setVacErreur('')
    setVacEnvoi(true)
    await supabase.from('vacances').insert({
      employe_id: user.id,
      date_debut: vacDateDebut,
      date_fin: vacDateFin,
      commentaire: vacCommentaire.trim() || null,
      statut: 'en_attente',
      jours_ouvrables: joursVacancesSelectionnes
    })
    setVacEnvoi(false)
    setVacSucces(true)
    setTimeout(() => {
      setVacSucces(false)
      setModalVacances(false)
      setVacDateDebut('')
      setVacDateFin('')
      setVacCommentaire('')
      setVacErreur('')
      charger()
    }, 1500)
  }

  async function deconnecter() {
    await signOut()
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
            <button onClick={() => setModalSupp(false)} style={{ background: 'none', border: 'none', fontSize: '22px', color: '#888', padding: '4px', lineHeight: 1 }}>×</button>
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
                    <option key={d.id} value={d.id}>{d.adresse} · {fmtDate(d.date_travail)}</option>
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

  if (modalVacances) {
    if (vacSucces) return (
      <div style={{ position: 'fixed', inset: 0, background: 'white', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '16px', zIndex: 100 }}>
        <div style={{ fontSize: '48px' }}>✅</div>
        <div style={{ fontWeight: 600, fontSize: '16px' }}>Demande envoyée !</div>
        <div style={{ fontSize: '13px', color: '#888' }}>En attente de validation par l'administration.</div>
      </div>
    )
    const restant = quotaVacances - soldeVacances.pris
    const blocages = periodesAdmin.filter(p => (p.type || 'blocage') === 'blocage')
    const fermetures = periodesAdmin.filter(p => (p.type || 'blocage') === 'fermeture_collective')

    return (
      <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 100, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end' }}>
        <div style={{ background: 'white', borderRadius: '16px 16px 0 0', padding: '20px 16px', maxHeight: '90vh', overflowY: 'auto' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <span style={{ fontWeight: 700, fontSize: '16px' }}>Demande de vacances</span>
            <button onClick={() => { setModalVacances(false); setVacErreur('') }} style={{ background: 'none', border: 'none', fontSize: '22px', color: '#888', padding: '4px', lineHeight: 1 }}>×</button>
          </div>
          <form onSubmit={soumettreVacances} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <div className="grid2">
              <div className="form-group">
                <label>Date de début *</label>
                <input type="date" value={vacDateDebut} onChange={e => { setVacDateDebut(e.target.value); setVacErreur('') }} required />
              </div>
              <div className="form-group">
                <label>Date de fin *</label>
                <input type="date" value={vacDateFin} min={vacDateDebut} onChange={e => { setVacDateFin(e.target.value); setVacErreur('') }} required />
              </div>
            </div>
            {joursVacancesSelectionnes > 0 && (
              <div style={{
                background: joursVacancesSelectionnes > restant ? '#FCEBEB' : '#E6F1FB',
                border: `1px solid ${joursVacancesSelectionnes > restant ? '#f09595' : '#185FA5'}`,
                borderRadius: '8px', padding: '10px 14px', fontSize: '12px',
                color: joursVacancesSelectionnes > restant ? '#A32D2D' : '#185FA5'
              }}>
                {joursVacancesSelectionnes} j. ouvrables sélectionnés · {Math.max(0, restant)} j. restants au quota
                {joursVacancesSelectionnes > restant && ' · quota dépassé'}
              </div>
            )}
            {periodeSpeciale && (
              <div style={{ background: '#EAF3DE', border: '1px solid #3B6D11', borderRadius: '8px', padding: '10px 14px', fontSize: '12px', color: '#3B6D11' }}>
                Fermeture collective : {periodeSpeciale.motif}
              </div>
            )}
            {!periodeSpeciale && alerteCouverture && (
              <div style={{ background: '#FAEEDA', border: '1px solid #f39c12', borderRadius: '8px', padding: '10px 14px', fontSize: '12px', color: '#BA7517' }}>
                {alerteCouverture}
              </div>
            )}
            <div className="form-group">
              <label>Commentaire (optionnel)</label>
              <textarea rows={2} value={vacCommentaire} onChange={e => setVacCommentaire(e.target.value)} placeholder="Informations complémentaires..." style={{ resize: 'none' }} />
            </div>
            {vacErreur && (
              <div style={{ background: '#FCEBEB', border: '1px solid #f09595', borderRadius: '8px', padding: '10px 14px', fontSize: '12px', color: '#A32D2D' }}>
                {vacErreur}
              </div>
            )}
            {(blocages.length > 0 || fermetures.length > 0) && (
              <div style={{ background: '#f8f8f8', border: '1px solid #e2e2e2', borderRadius: '8px', padding: '10px 14px', fontSize: '11px', color: '#666' }}>
                {blocages.length > 0 && <div>Blocages : {blocages.slice(0, 3).map(b => `${fmtDate(b.date_debut)} - ${fmtDate(b.date_fin)}`).join(', ')}</div>}
                {fermetures.length > 0 && <div>Fermetures collectives : {fermetures.slice(0, 3).map(b => `${fmtDate(b.date_debut)} - ${fmtDate(b.date_fin)}`).join(', ')}</div>}
              </div>
            )}
            <button type="submit" className="btn-primary" disabled={vacEnvoi || !vacDateDebut || !vacDateFin || vacDateFin < vacDateDebut}>
              {vacEnvoi ? 'Envoi...' : '✓ Envoyer la demande'}
            </button>
          </form>
        </div>
      </div>
    )
  }

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
            {suppHistorique.length > 0 && (
              <div style={{ borderTop: '1px solid #eee', paddingTop: '8px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <div style={{ fontSize: '12px', fontWeight: 600, color: '#555' }}>Historique heures supp.</div>
                {suppHistorique.slice(0, 3).map(s => (
                  <div key={s.id} style={{ display: 'flex', justifyContent: 'space-between', gap: '10px', fontSize: '11px', color: '#666' }}>
                    <span>
                      {fmtDate(s.date_travail)}
                      {s.chantiers?.nom ? ` · ${s.chantiers.nom}` : ''}
                      {s.commentaire ? ` · ${s.commentaire}` : ''}
                    </span>
                    <strong style={{ color: '#185FA5', flexShrink: 0 }}>{Number(s.duree || 0).toFixed(1)}h</strong>
                  </div>
                ))}
              </div>
            )}
          </div>

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
                <div style={{ fontSize: '20px', fontWeight: 700, color: '#185FA5' }}>{Math.max(0, quotaVacances - soldeVacances.pris)}</div>
                <div style={{ fontSize: '10px', color: '#185FA5', marginTop: '2px' }}>Restants</div>
              </div>
            </div>
            <div style={{ fontSize: '11px', color: '#aaa', textAlign: 'right' }}>Quota annuel : {quotaVacances} j. ouvrables</div>
            {vacances.length === 0 && (
              <div style={{ fontSize: '12px', color: '#bbb', textAlign: 'center', padding: '4px 0' }}>Aucune demande</div>
            )}
            {vacances.slice(0, 4).map((v, i) => (
              <div key={v.id || i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: '8px', borderTop: i === 0 ? '1px solid #eee' : 'none', paddingBottom: '4px' }}>
                <div>
                  <div style={{ fontSize: '12px', fontWeight: 500 }}>
                    {fmtDate(v.date_debut, { day: '2-digit', month: '2-digit' })}
                    {v.date_fin !== v.date_debut && ` → ${fmtDate(v.date_fin, { day: '2-digit', month: '2-digit' })}`}
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
