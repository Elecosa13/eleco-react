import React, { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { supabaseSafe } from '../lib/supabaseSafe'
import { useAuth } from '../lib/auth-context'
import { usePageRefresh } from '../lib/refresh'
import DepannageCard from '../components/depannage/DepannageCard'
import {
  demarrerDepannage,
  fetchDepannages,
  libererDepannage,
  planifierDepannage,
  prendreDepannage,
  prendreDepannageSansDate,
  quitterDepannage,
  rejoindreDepannage
} from '../services/depannages.service'
import {
  getChantierClientLabel,
  getChantierStatusBadgeStyle,
  groupChantiersByClient,
  isChantierVisibleToEmployees
} from '../services/chantiers.service'
import RapportV1 from './RapportV1'

const QUOTA_VACANCES = 20
const CREDIT_JOUR = 8
const STATUT_RAPPORT_RECU = 'Rapport reçu'
const STATUT_FACTURE_A_PREPARER = 'Facture à préparer'
const STATUT_FACTURE_PRETE = 'Facture prête'
const STATUTS_DEPANNAGE_ADMIN = [STATUT_RAPPORT_RECU, STATUT_FACTURE_A_PREPARER, STATUT_FACTURE_PRETE]

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
  const [intermediaireSel, setIntermediaireSel] = useState(null)
  const [nouveauNom, setNouveauNom] = useState('')
  const [nouvelleAdresse, setNouvelleAdresse] = useState('')
  const [confirmDoublon, setConfirmDoublon] = useState(null)
  const [depannagesRecents, setDepannagesRecents] = useState([])
  const [depannagesTerrain, setDepannagesTerrain] = useState([])
  const [depannagesLoading, setDepannagesLoading] = useState(false)
  const [depannagesErreur, setDepannagesErreur] = useState('')
  const [depannagesRecherche, setDepannagesRecherche] = useState('')
  const [depannageActionLoading, setDepannageActionLoading] = useState('')

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

  const [absences, setAbsences] = useState([])
  const [modalAbsence, setModalAbsence] = useState(false)
  const [absType, setAbsType] = useState('maladie')
  const [absDateDebut, setAbsDateDebut] = useState('')
  const [absDateFin, setAbsDateFin] = useState('')
  const [absCommentaire, setAbsCommentaire] = useState('')
  const [absEnvoi, setAbsEnvoi] = useState(false)
  const [absSucces, setAbsSucces] = useState(false)
  const [absErreur, setAbsErreur] = useState('')

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
    const { data: ch } = await supabase.from('chantiers').select('*, intermediaires(id, nom)').eq('actif', true).order('nom')
    if (ch) setChantiers(ch.filter(isChantierVisibleToEmployees))

    const aujourdHui = new Date().toISOString().split('T')[0]
    const { data: entries } = await supabase
      .from('time_entries')
      .select('duree')
      .eq('employe_id', user.id)
      .eq('date_travail', aujourdHui)
    if (entries) setCreditUtilise(entries.reduce((s, e) => s + Number(e.duree), 0))

    const { data: deps } = await supabase
      .from('depannages')
      .select('id, adresse, date_travail, statut')
      .eq('employe_id', user.id)
      .not('statut', 'in', `(${STATUTS_DEPANNAGE_ADMIN.map(statut => `"${statut}"`).join(',')})`)
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

    await chargerAbsences()
    await chargerDepannagesTerrain()

  }

  async function chargerDepannagesTerrain() {
    setDepannagesLoading(true)
    setDepannagesErreur('')
    try {
      const data = await fetchDepannages()
      setDepannagesTerrain(data)
    } catch (error) {
      console.error('Erreur chargement depannages terrain', error)
      setDepannagesErreur("Impossible de charger les dépannages. Réessaie dans un instant.")
    } finally {
      setDepannagesLoading(false)
    }
  }

  async function chargerAbsences() {
    const { data: abs } = await supabase.from('absences')
      .select('*')
      .eq('employe_id', user.id)
      .order('date_debut', { ascending: false })
      .limit(3)
    if (abs) setAbsences(abs)
  }

  async function creerChantier(forcer = false) {
    if (!nouveauNom.trim()) return
    if (!forcer) {
      const existe = chantiers.find(c => c.nom.toLowerCase() === nouveauNom.toLowerCase())
      if (existe) { setConfirmDoublon(existe); return }
    }
    try {
      await supabaseSafe(supabase.from('chantiers').insert({
        nom: nouveauNom,
        adresse: nouvelleAdresse,
        statut: 'A confirmer'
      }))
      setNouveauNom('')
      setNouvelleAdresse('')
      setAjoutChantier(false)
      setConfirmDoublon(null)
      charger()
    } catch (error) {
      alert("Erreur lors de la création du chantier. Veuillez réessayer.")
    }
  }

  async function soumettreHeuresSupp(e) {
    e.preventDefault()
    if (!suppJustification.trim() || Number(suppHeures) <= 0) return
    setSuppEnvoi(true)
    const aujourdHui = new Date().toISOString().split('T')[0]
    const annee = new Date(aujourdHui + 'T12:00:00').getFullYear()
    try {
      await supabaseSafe(supabase.from('time_entries').insert({
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
      }))
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
    } catch (error) {
      alert("Erreur lors de l'enregistrement des heures supplémentaires. Veuillez réessayer.")
    } finally {
      setSuppEnvoi(false)
    }
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
    try {
      await supabaseSafe(supabase.from('vacances').insert({
        employe_id: user.id,
        date_debut: vacDateDebut,
        date_fin: vacDateFin,
        commentaire: vacCommentaire.trim() || null,
        statut: 'en_attente',
        jours_ouvrables: joursVacancesSelectionnes
      }))
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
    } catch (error) {
      setVacErreur("Erreur lors de l'envoi de la demande. Veuillez réessayer.")
    } finally {
      setVacEnvoi(false)
    }
  }

  async function soumettreAbsence(e) {
    e.preventDefault()
    if (!absDateDebut || !absDateFin || absDateFin < absDateDebut) return
    setAbsErreur('')
    setAbsEnvoi(true)
    try {
      await supabaseSafe(supabase.from('absences').insert({
        employe_id: user.id,
        type: absType,
        date_debut: absDateDebut,
        date_fin: absDateFin,
        commentaire: absCommentaire.trim() || null,
        statut: 'en_attente'
      }))
      setAbsSucces(true)
      setTimeout(() => {
        setAbsSucces(false)
        setModalAbsence(false)
        setAbsType('maladie')
        setAbsDateDebut('')
        setAbsDateFin('')
        setAbsCommentaire('')
        setAbsErreur('')
        chargerAbsences()
      }, 1500)
    } catch {
      setAbsErreur("Erreur lors de l'envoi. Veuillez réessayer.")
    } finally {
      setAbsEnvoi(false)
    }
  }

  async function deconnecter() {
    await signOut()
    navigate('/login')
  }

  async function agirSurDepannage(action, depannage, payload = null) {
    if (!depannage?.id) return

    if (action === 'rapport') {
      navigate(`/employe/depannage?depannageId=${depannage.id}`)
      return
    }

    const actions = {
      prendre: prendreDepannage,
      prendreSansDate: prendreDepannageSansDate,
      planifier: id => planifierDepannage(id, payload || {}),
      demarrer: demarrerDepannage,
      rejoindre: rejoindreDepannage,
      quitter: quitterDepannage,
      liberer: libererDepannage
    }
    const executer = actions[action]
    if (!executer) return

    setDepannagesErreur('')
    setDepannageActionLoading(`${action}:${depannage.id}`)
    try {
      await executer(depannage.id)
      await chargerDepannagesTerrain()
    } catch (error) {
      console.error(`Erreur action depannage ${action}`, error)
      setDepannagesErreur(error?.message || "Action impossible pour ce dépannage. La liste reste disponible.")
    } finally {
      setDepannageActionLoading('')
    }
  }

  function ouvrirDepannage(depannage) {
    if (!depannage?.id) return
    navigate(`/employe/depannage?depannageId=${depannage.id}`)
  }

  const creditRestant = CREDIT_JOUR - creditUtilise
  const pourcent = Math.min(100, (creditUtilise / CREDIT_JOUR) * 100)
  const couleurBarre = creditUtilise >= CREDIT_JOUR ? '#27ae60' : creditUtilise >= 6 ? '#f39c12' : '#185FA5'
  const chantiersFiltres = chantiers.filter(c =>
    c.nom.toLowerCase().includes(recherche.toLowerCase()) ||
    (c.adresse || '').toLowerCase().includes(recherche.toLowerCase()) ||
    getChantierClientLabel(c).toLowerCase().includes(recherche.toLowerCase())
  )
  const chantiersGroupes = useMemo(() => groupChantiersByClient(chantiersFiltres), [chantiersFiltres])
  const intermediaires = useMemo(() => {
    const map = new Map()
    chantiers.forEach(c => {
      if (c.intermediaire_id && c.intermediaires?.nom && !map.has(c.intermediaire_id))
        map.set(c.intermediaire_id, c.intermediaires.nom)
    })
    return [...map.entries()].map(([id, nom]) => ({ id, nom })).sort((a, b) => a.nom.localeCompare(b.nom, 'fr'))
  }, [chantiers])
  const depannagesFiltres = useMemo(() => {
    const term = normaliserRecherche(depannagesRecherche)
    if (!term) return depannagesTerrain
    return depannagesTerrain.filter(depannage =>
      normaliserRecherche(depannage.adresse).includes(term) ||
      normaliserRecherche(depannage.adresse_normalisee).includes(term)
    )
  }, [depannagesRecherche, depannagesTerrain])

  const statutLabel = { en_attente: 'En attente', accepte: 'Accepté', refuse: 'Refusé' }
  const statutColor = { en_attente: '#BA7517', accepte: '#3B6D11', refuse: '#A32D2D' }
  const statutBg = { en_attente: '#FAEEDA', accepte: '#EAF3DE', refuse: '#FCEBEB' }
  const absStatutLabel = { en_attente: 'En attente', approuve: 'Approuvé', refuse: 'Refusé' }
  const absStatutColor = { en_attente: '#BA7517', approuve: '#3B6D11', refuse: '#A32D2D' }
  const absStatutBg = { en_attente: '#FAEEDA', approuve: '#EAF3DE', refuse: '#FCEBEB' }
  const absTypeLabel = { maladie: 'Maladie', accident: 'Accident', autre: 'Autre' }
  const titrePage = vue === 'accueil'
    ? `Bonjour, ${user?.prenom}`
    : vue === 'depannages'
      ? 'Dépannages'
      : vue === 'autres'
        ? 'Autres'
        : vue === 'testv1'
          ? 'Rapport V1'
          : vue === 'chantiers' && intermediaireSel
            ? (intermediaires.find(i => i.id === intermediaireSel)?.nom || 'Chantiers actifs')
            : 'Chantiers actifs'

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

  if (modalAbsence) {
    if (absSucces) return (
      <div style={{ position: 'fixed', inset: 0, background: 'white', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '16px', zIndex: 100 }}>
        <div style={{ fontSize: '48px' }}>✅</div>
        <div style={{ fontWeight: 600, fontSize: '16px' }}>Absence déclarée !</div>
        <div style={{ fontSize: '13px', color: '#888' }}>En attente de validation par l'administration.</div>
      </div>
    )
    return (
      <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 100, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end' }}>
        <div style={{ background: 'white', borderRadius: '16px 16px 0 0', padding: '20px 16px', maxHeight: '90vh', overflowY: 'auto' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <span style={{ fontWeight: 700, fontSize: '16px' }}>Déclarer une absence</span>
            <button onClick={() => { setModalAbsence(false); setAbsErreur('') }} style={{ background: 'none', border: 'none', fontSize: '22px', color: '#888', padding: '4px', lineHeight: 1 }}>×</button>
          </div>
          <form onSubmit={soumettreAbsence} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <div className="form-group">
              <label>Type d'absence *</label>
              <select value={absType} onChange={e => setAbsType(e.target.value)} required>
                <option value="maladie">Maladie</option>
                <option value="accident">Accident</option>
                <option value="autre">Autre</option>
              </select>
            </div>
            <div className="grid2">
              <div className="form-group">
                <label>Date de début *</label>
                <input type="date" value={absDateDebut} onChange={e => { setAbsDateDebut(e.target.value); setAbsErreur('') }} required />
              </div>
              <div className="form-group">
                <label>Date de fin *</label>
                <input type="date" value={absDateFin} min={absDateDebut} onChange={e => { setAbsDateFin(e.target.value); setAbsErreur('') }} required />
              </div>
            </div>
            <div className="form-group">
              <label>Commentaire (optionnel)</label>
              <textarea rows={2} value={absCommentaire} onChange={e => setAbsCommentaire(e.target.value)} placeholder="Informations complémentaires..." style={{ resize: 'none' }} />
            </div>
            {absErreur && (
              <div style={{ background: '#FCEBEB', border: '1px solid #f09595', borderRadius: '8px', padding: '10px 14px', fontSize: '12px', color: '#A32D2D' }}>
                {absErreur}
              </div>
            )}
            <div style={{ background: '#FAEEDA', border: '1px solid #f39c12', borderRadius: '8px', padding: '10px 14px', fontSize: '12px', color: '#BA7517' }}>
              Cette absence sera visible par l'administration.
            </div>
            <button type="submit" className="btn-primary" disabled={absEnvoi || !absDateDebut || !absDateFin || absDateFin < absDateDebut}>
              {absEnvoi ? 'Envoi...' : "✓ Déclarer l'absence"}
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
            {titrePage}
          </div>
          <div style={{ fontSize: '11px', color: '#888' }}>Espace employé</div>
        </div>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          {vue !== 'accueil' && (
            <button className="btn-outline btn-sm" onClick={() => { if (vue === 'chantiers' && intermediaireSel) { setIntermediaireSel(null); setRecherche('') } else { setVue('accueil'); setRecherche(''); setDepannagesRecherche(''); setAjoutChantier(false) } }}>Retour ←</button>
          )}
          <button className="avatar" onClick={deconnecter}>{user?.initiales}</button>
        </div>
      </div>

      <div className="page-content">
        {vue === 'accueil' && <>
          <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
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
            <button onClick={() => navigate('/employe/chantier')} style={{ position: 'relative', background: '#E6F1FB', border: '1px solid #185FA5', borderRadius: '12px', padding: '20px 28px 20px 12px', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '28px' }}>🏗️</span>
              <span style={{ fontWeight: 600, fontSize: '14px', color: '#185FA5' }}>Chantiers</span>
              <span style={{ fontSize: '11px', color: '#666' }}>Travail sur chantier</span>
              <span style={{ position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)', color: '#185FA5', fontSize: '18px' }}>›</span>
            </button>
            <button onClick={() => setVue('depannages')} style={{ position: 'relative', background: '#FEF3E2', border: '1px solid #f39c12', borderRadius: '12px', padding: '20px 28px 20px 12px', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '28px' }}>⚡</span>
              <span style={{ fontWeight: 600, fontSize: '14px', color: '#d68910' }}>Dépannages</span>
              <span style={{ fontSize: '11px', color: '#666' }}>Interventions rapides</span>
              <span style={{ position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)', color: '#d68910', fontSize: '18px' }}>›</span>
            </button>
            <button onClick={() => navigate('/employe/devis')} style={{ position: 'relative', background: '#EAF3DE', border: '1px solid #3B6D11', borderRadius: '12px', padding: '20px 28px 20px 12px', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '28px' }}>📄</span>
              <span style={{ fontWeight: 600, fontSize: '14px', color: '#3B6D11' }}>Devis à faire</span>
              <span style={{ fontSize: '11px', color: '#666' }}>À venir</span>
              <span style={{ position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)', color: '#3B6D11', fontSize: '18px' }}>›</span>
            </button>
            <button onClick={() => setVue('autres')} style={{ position: 'relative', background: '#F3F4F6', border: '1px solid #9CA3AF', borderRadius: '12px', padding: '20px 28px 20px 12px', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '28px' }}>☰</span>
              <span style={{ fontWeight: 600, fontSize: '14px', color: '#4B5563' }}>Autres</span>
              <span style={{ fontSize: '11px', color: '#666' }}>Vacances, absences</span>
              <span style={{ position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)', color: '#4B5563', fontSize: '18px' }}>›</span>
            </button>
            {user?.prenom?.toLowerCase() === 'noylan' && (
              <button onClick={() => setVue('testv1')} style={{ position: 'relative', background: '#F0E6FB', border: '1px solid #7C3AED', borderRadius: '12px', padding: '20px 28px 20px 12px', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px', gridColumn: '1 / -1' }}>
                <span style={{ fontSize: '28px' }}>📋</span>
                <span style={{ fontWeight: 600, fontSize: '14px', color: '#7C3AED' }}>Rapport V1</span>
                <span style={{ fontSize: '11px', color: '#666' }}>Envoyer un rapport de journée</span>
                <span style={{ position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)', color: '#7C3AED', fontSize: '18px' }}>›</span>
              </button>
            )}
          </div>
        </>}

        {vue === 'autres' && <>
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

          <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontWeight: 600, fontSize: '14px' }}>🤒 Absences</span>
              <button className="btn-primary btn-sm" style={{ width: 'auto' }} onClick={() => setModalAbsence(true)}>Déclarer une absence</button>
            </div>
            {absences.length === 0 && (
              <div style={{ fontSize: '12px', color: '#bbb', textAlign: 'center', padding: '4px 0' }}>Aucune absence enregistrée</div>
            )}
            {absences.slice(0, 3).map((a, i) => (
              <div key={a.id || i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: '8px', borderTop: i === 0 ? '1px solid #eee' : 'none', paddingBottom: '4px' }}>
                <div>
                  <div style={{ fontSize: '12px', fontWeight: 500 }}>
                    {absTypeLabel[a.type] || a.type || 'Absence'}
                  </div>
                  <div style={{ fontSize: '10px', color: '#999', marginTop: '1px' }}>
                    {a.date_debut ? fmtDate(a.date_debut, { day: '2-digit', month: '2-digit' }) : '—'}
                    {a.date_fin && a.date_fin !== a.date_debut ? ` → ${fmtDate(a.date_fin, { day: '2-digit', month: '2-digit' })}` : ''}
                  </div>
                  {a.commentaire && <div style={{ fontSize: '10px', color: '#999', fontStyle: 'italic', marginTop: '1px' }}>{a.commentaire}</div>}
                </div>
                <span style={{ fontSize: '11px', fontWeight: 500, padding: '3px 8px', borderRadius: '12px', flexShrink: 0, marginLeft: '8px', background: absStatutBg[a.statut] || '#f0f0f0', color: absStatutColor[a.statut] || '#666' }}>
                  {absStatutLabel[a.statut] || a.statut || 'En attente'}
                </span>
              </div>
            ))}
          </div>
        </>}

        {vue === 'chantiers' && <>
          {!intermediaireSel ? (
            <div className="card">
              <div style={{ marginBottom: '12px', fontWeight: 600, fontSize: '14px' }}>Intermédiaire</div>
              {intermediaires.length === 0 && <div style={{ fontSize: '13px', color: '#888' }}>Aucun chantier disponible pour l'instant.</div>}
              {intermediaires.map(interm => {
                const count = chantiers.filter(c => c.intermediaire_id === interm.id).length
                return (
                  <div key={interm.id} className="row-item" style={{ cursor: 'pointer' }} onClick={() => setIntermediaireSel(interm.id)}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <div style={{ width: 34, height: 34, borderRadius: '8px', background: '#E6F1FB', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '16px' }}>🏗️</div>
                      <div>
                        <div style={{ fontWeight: 500, fontSize: '13px' }}>{interm.nom}</div>
                        <div style={{ fontSize: '11px', color: '#888' }}>{count} chantier{count > 1 ? 's' : ''}</div>
                      </div>
                    </div>
                    <span style={{ color: '#185FA5', fontSize: '18px' }}>›</span>
                  </div>
                )
              })}
            </div>
          ) : (
            <>
              <input
                type="search"
                placeholder="🔍 Rechercher un chantier..."
                value={recherche}
                onChange={e => setRecherche(e.target.value)}
                style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid #ddd', fontSize: '13px' }}
              />
              <div className="card">
                {chantiers
                  .filter(c => c.intermediaire_id === intermediaireSel)
                  .filter(c => !recherche || c.nom.toLowerCase().includes(recherche.toLowerCase()) || (c.adresse || '').toLowerCase().includes(recherche.toLowerCase()))
                  .length === 0 && <div style={{ fontSize: '13px', color: '#888' }}>Aucun chantier trouvé.</div>}
                {chantiers
                  .filter(c => c.intermediaire_id === intermediaireSel)
                  .filter(c => !recherche || c.nom.toLowerCase().includes(recherche.toLowerCase()) || (c.adresse || '').toLowerCase().includes(recherche.toLowerCase()))
                  .map(c => {
                    const badgeStyle = getChantierStatusBadgeStyle(c.statut)
                    return (
                      <div key={c.id} className="row-item" style={{ cursor: 'pointer' }} onClick={() => navigate(`/employe/chantier/${c.id}`)}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                          <div style={{ width: 34, height: 34, borderRadius: '8px', background: '#E6F1FB', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '16px' }}>🏗️</div>
                          <div>
                            <div style={{ fontWeight: 500, fontSize: '13px' }}>{c.nom}</div>
                            <div style={{ fontSize: '11px', color: '#888' }}>{c.adresse || '—'}</div>
                          </div>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span style={{ ...badgeStyle, borderRadius: '6px', padding: '4px 8px', fontSize: '10px', fontWeight: 700, whiteSpace: 'nowrap' }}>
                            {c.statut || 'A confirmer'}
                          </span>
                          <span style={{ color: '#185FA5' }}>›</span>
                        </div>
                      </div>
                    )
                  })}
              </div>
            </>
          )}
        </>}

        {vue === 'depannages' && <>
          <input
            type="search"
            placeholder="Rechercher une adresse..."
            value={depannagesRecherche}
            onChange={e => setDepannagesRecherche(e.target.value)}
            style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid #ddd', fontSize: '13px' }}
          />
          {depannagesErreur && (
            <div style={{ background: '#FCEBEB', border: '1px solid #f09595', borderRadius: '8px', padding: '10px 14px', fontSize: '12px', color: '#A32D2D' }}>
              {depannagesErreur}
            </div>
          )}
          {depannagesLoading && (
            <div style={{ fontSize: '13px', color: '#888', textAlign: 'center', padding: '18px 0' }}>Chargement des dépannages...</div>
          )}
          {!depannagesLoading && depannagesFiltres.length === 0 && (
            <div className="card" style={{ fontSize: '13px', color: '#888', borderRadius: '8px' }}>
              Aucun dépannage trouvé
            </div>
          )}
          {!depannagesLoading && depannagesFiltres.map(depannage => (
            <DepannageCard
              key={depannage.id}
              depannage={depannage}
              currentUserId={user?.id}
              onAction={agirSurDepannage}
              actionLoading={depannageActionLoading}
              onClick={ouvrirDepannage}
            />
          ))}
        </>}

        {vue === 'testv1' && user?.prenom?.toLowerCase() === 'noylan' && (
          <RapportV1 user={user} onRetour={() => setVue('accueil')} />
        )}
      </div>
    </div>
  )
}

function normaliserRecherche(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
}
