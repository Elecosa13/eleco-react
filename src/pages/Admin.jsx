import React, { useEffect, useMemo, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import PageTopActions from '../components/PageTopActions'
import PhotoInputPanel from '../components/PhotoInputPanel'
import { supabase } from '../lib/supabase'
import { supabaseSafe } from '../lib/supabaseSafe'
import { useAuth } from '../lib/auth-context'
import { usePageRefresh } from '../lib/refresh'
import { safeConfirm } from '../lib/safe-browser'
import { getInitiales } from '../services/depannages.service'
import { deleteRapportPhoto, uploadRapportPhotos, withSignedPhotoUrls } from '../services/rapportPhotos.service'
import { fetchTimeEntryDurationsMap } from '../services/timeEntries.service'
import {
  CHANTIER_STATUT_A_CONFIRMER,
  getChantierClientLabel,
  getChantierStatusBadgeStyle,
  getNextChantierStatusAction,
  groupChantiersByClient
} from '../services/chantiers.service'

const TAUX = 115
const MOIS_FR = ['Janvier','Février','Mars','Avril','Mai','Juin','Juillet','Août','Septembre','Octobre','Novembre','Décembre']
const JOURS_FR = ['L','M','M','J','V','S','D']
const JOURS_LONG = ['Lundi','Mardi','Mercredi','Jeudi','Vendredi','Samedi','Dimanche']
const STATUT_INTERVENTION_FAITE = 'Intervention faite'
const STATUT_RAPPORT_RECU = 'Rapport reçu'
const STATUT_FACTURE_A_PREPARER = 'Facture à préparer'
const STATUT_FACTURE_PRETE = 'Facture prête'
const ADMIN_VUES_OUVERTES = ['chantiers', 'depannages', 'a_verifier', 'calendrier', 'vacances', 'employes']

function getAdminVueInitiale(location) {
  if (ADMIN_VUES_OUVERTES.includes(location.state?.vue)) return location.state.vue
  if (location.pathname.endsWith('/a-verifier')) return 'a_verifier'
  if (location.pathname.endsWith('/calendrier')) return 'calendrier'
  if (location.pathname.endsWith('/employes')) return 'employes'
  return 'accueil'
}

// Clauses de la charte (identiques à Charte.jsx) — nécessaires pour régénérer le PDF côté admin
const CLAUSES_CHARTE = [
  { titre: '1. Confidentialité', texte: "Aucune information relative aux clients, chantiers, prix ou données internes d'Eleco SA ne peut être divulguée à des tiers, que ce soit verbalement, par écrit ou via tout support numérique." },
  { titre: '2. Usage exclusif professionnel', texte: "L'application Eleco SA est réservée exclusivement à un usage professionnel dans le cadre de votre activité au sein de la société. Toute utilisation à des fins personnelles est interdite." },
  { titre: '3. Identifiants personnels et confidentiels', texte: "Vos identifiants de connexion (nom d'utilisateur et mot de passe) sont strictement personnels. Il est formellement interdit de les communiquer à quiconque, y compris à d'autres employés." },
  { titre: '4. Interdiction de capture et d\'export', texte: "Il est interdit de réaliser des captures d'écran, des impressions ou tout export de données vers l'extérieur de l'entreprise, sauf autorisation écrite explicite de la direction." },
  { titre: '5. Signalement des accès suspects', texte: "Tout accès inhabituel ou suspect à votre compte doit être immédiatement signalé à l'administration. En cas de perte ou de vol de vos identifiants, vous devez en informer la direction sans délai." },
  { titre: '6. Propriété des données', texte: "Toutes les données, documents, images et informations accessibles via cette application sont la propriété exclusive d'Eleco SA. Vous ne disposez d'aucun droit de propriété sur ces éléments." },
  { titre: '7. Durée de validité', texte: "La présente charte est valable pour toute la durée de votre contrat de travail au sein d'Eleco SA. Elle reste en vigueur même après résiliation du contrat pour les obligations de confidentialité." },
  { titre: '8. Sanctions', texte: "Toute violation des présentes règles pourra entraîner des mesures disciplinaires allant jusqu'au licenciement immédiat, conformément au Code des obligations suisse et au droit du travail applicable." }
]

function debutFin(year, month) {
  const debut = `${year}-${String(month + 1).padStart(2, '0')}-01`
  const fin = `${year}-${String(month + 1).padStart(2, '0')}-${String(new Date(year, month + 1, 0).getDate()).padStart(2, '0')}`
  return { debut, fin }
}

function calcDuree(debut, fin) {
  if (!debut || !fin) return 0
  const [hd, md] = debut.split(':').map(Number)
  const [hf, mf] = fin.split(':').map(Number)
  return Math.max(0, (hf * 60 + mf - hd * 60 - md) / 60)
}

// Calcule la plage lundi–dimanche d'une semaine ISO
function getWeekDateRange(semaine, annee) {
  const jan4 = new Date(annee, 0, 4)
  const dayOfWeek = (jan4.getDay() + 6) % 7 // 0=Lun … 6=Dim
  const mondayW1 = new Date(jan4)
  mondayW1.setDate(jan4.getDate() - dayOfWeek)
  const lundi = new Date(mondayW1)
  lundi.setDate(mondayW1.getDate() + (semaine - 1) * 7)
  const dimanche = new Date(lundi)
  dimanche.setDate(lundi.getDate() + 6)
  const fmt = d => d.toISOString().split('T')[0]
  return { lundi, dimanche, lundiStr: fmt(lundi), dimancheStr: fmt(dimanche) }
}

function fmtDuree(h) {
  const hrs = Math.floor(h)
  const mins = Math.round((h - hrs) * 60)
  return mins === 0 ? `${hrs}h` : `${hrs}h${String(mins).padStart(2, '0')}`
}

async function hydraterRapportsPhotos(rapports) {
  const list = Array.from(rapports || [])
  const allPhotos = list.flatMap(rapport => rapport.rapport_photos || [])
  if (allPhotos.length === 0) return list

  try {
    const signedPhotos = await withSignedPhotoUrls(allPhotos)
    const photosByRapportId = {}

    for (const photo of signedPhotos) {
      const key = String(photo.rapport_id)
      if (!photosByRapportId[key]) photosByRapportId[key] = []
      photosByRapportId[key].push(photo)
    }

    return list.map(rapport => ({
      ...rapport,
      rapport_photos: photosByRapportId[String(rapport.id)] || []
    }))
  } catch (error) {
    console.error('Erreur signature photos rapports admin', error)
    return list
  }
}

async function hydraterRapportsDurees(rapports, employeId = null, dateFrom = null, dateTo = null) {
  const list = Array.from(rapports || [])
  if (list.length === 0) return list

  const byRapportId = await fetchTimeEntryDurationsMap({
    type: 'chantier',
    referenceIds: list.map(rapport => rapport.id),
    employeId,
    dateFrom,
    dateTo
  })

  return list.map(rapport => ({
    ...rapport,
    _duree: byRapportId[String(rapport.id)] ?? 0
  }))
}

async function hydraterDepannagesDurees(depannages, employeId = null, dateFrom = null, dateTo = null) {
  const list = Array.from(depannages || [])
  if (list.length === 0) return list

  const byDepannageId = await fetchTimeEntryDurationsMap({
    type: 'depannage',
    referenceIds: list.map(depannage => depannage.id),
    employeId,
    dateFrom,
    dateTo
  })

  return list.map(depannage => ({
    ...depannage,
    _duree: byDepannageId[String(depannage.id)] ?? 0
  }))
}

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

export default function Admin() {
  const navigate = useNavigate()
  const location = useLocation()
  const adminNavigationState = location.state || {}
  const { profile: user, signOut } = useAuth()
  const depannagesRequestRef = useRef(0)

  // Navigation
  const [vue, setVue] = useState(() => getAdminVueInitiale(location))

  // Données globales
  const [rapportsEnAttente, setRapportsEnAttente] = useState([])
  const [chantiers, setChantiers] = useState([])
  const [depannages, setDepannages] = useState([])
  const [depannagesLoading, setDepannagesLoading] = useState(false)
  const [depannagesError, setDepannagesError] = useState('')
  const [adminError, setAdminError] = useState('')
  const [search, setSearch] = useState(adminNavigationState.depannagesSearch || '')
  const [regies, setRegies] = useState([])
  const [regieFilter, setRegieFilter] = useState(adminNavigationState.depannagesRegieFilter || '')
  const [regieFilterAvailable, setRegieFilterAvailable] = useState(true)
  const [dateFilter, setDateFilter] = useState(adminNavigationState.depannagesDateFilter || '')
  const [employes, setEmployes] = useState([])
  const [catalogue, setCatalogue] = useState([])
  const [categories, setCategories] = useState([])

  // Vacances
  const [vacancesAdmin, setVacancesAdmin] = useState([])
  const [blocagesVacances, setBlocagesVacances] = useState([])
  const [vacancesStats, setVacancesStats] = useState({})
  const [vacancesLoading, setVacancesLoading] = useState(false)
  const [vacancesError, setVacancesError] = useState('')
  const [blocageForm, setBlocageForm] = useState({ date_debut: '', date_fin: '', type: 'blocage', motif: '' })

  // Chantiers
  const [chantierActif, setChantierActif] = useState(null)
  const [sousDossiers, setSousDossiers] = useState([])
  const [sousDossierActif, setSousDossierActif] = useState(null)
  const [rapports, setRapports] = useState([])
  const [rapportDetail, setRapportDetail] = useState(null)
  const [corbeille, setCorbeille] = useState([])
  const [vueCorbeille, setVueCorbeille] = useState(false)
  const [confirm, setConfirm] = useState(null)
  const [renommerItem, setRenommerItem] = useState(null)
  const [nouveauNom, setNouveauNom] = useState('')
  const [nouveauNomChantier, setNouveauNomChantier] = useState('')
  const [nouveauClientNom, setNouveauClientNom] = useState('')
  const [nouvelleAdresse, setNouvelleAdresse] = useState('')
  const [ajoutChantier, setAjoutChantier] = useState(false)
  const [nouveauSd, setNouveauSd] = useState(false)
  const [nouveauSdNom, setNouveauSdNom] = useState('')

  // Matériaux
  const [editMateriaux, setEditMateriaux] = useState(null)
  const [ajoutArticleVue, setAjoutArticleVue] = useState(false)
  const [rechercheArticle, setRechercheArticle] = useState('')
  const [catFiltre, setCatFiltre] = useState('Tous')
  const [articleManuel, setArticleManuel] = useState({ designation: '', unite: '', prix: '0', quantite: 1 })

  // Rapport édition (tâche 8)
  const [editRapportMode, setEditRapportMode] = useState(false)
  const [editRapportRemarques, setEditRapportRemarques] = useState('')
  const [editRapportDate, setEditRapportDate] = useState('')

  // Calendrier
  const [calMois, setCalMois] = useState(() => { const d = new Date(); return { year: d.getFullYear(), month: d.getMonth() } })
  const [calEmployeFiltre, setCalEmployeFiltre] = useState('tous')
  const [calRapports, setCalRapports] = useState([])
  const [calDepannages, setCalDepannages] = useState([])
  const [calJour, setCalJour] = useState(null)

  // Employés stats
  const [empStats, setEmpStats] = useState({})
  const [empLoading, setEmpLoading] = useState(false)

  // Fiche employé (tâche 7)
  const [empDetail, setEmpDetail] = useState(null)
  const [empDetailMois, setEmpDetailMois] = useState(() => { const d = new Date(); return { year: d.getFullYear(), month: d.getMonth() } })
  const [empDetailRapports, setEmpDetailRapports] = useState([])
  const [empDetailDepannages, setEmpDetailDepannages] = useState([])
  const [empAbsences, setEmpAbsences] = useState([])
  const [ficheTab, setFicheTab] = useState('heures')
  const [empCharteData, setEmpCharteData] = useState(null)
  const [empCharteLoading, setEmpCharteLoading] = useState(false)

  // PDF hebdomadaire (tâche 5)
  const [pdfSemaine, setPdfSemaine] = useState('')
  const [pdfAnnee, setPdfAnnee] = useState(new Date().getFullYear())
  const [pdfLoading, setPdfLoading] = useState(false)
  const [refreshingData, setRefreshingData] = useState(false)
  const [adminPhotoSaving, setAdminPhotoSaving] = useState(false)

  useEffect(() => { chargerTout() }, [])

  useEffect(() => {
    if (vue === 'calendrier') chargerCalendrier(calMois)
    if (vue === 'vacances') chargerVacancesAdmin()
    if (vue === 'employes') chargerStatsEmployes()
  }, [])

  const refreshPage = usePageRefresh(async () => {
    setRefreshingData(true)
    try {
      if (vue === 'calendrier') return await chargerCalendrier(calMois)
      if (vue === 'vacances') return await chargerVacancesAdmin()
      if (vue === 'employes') return await chargerStatsEmployes()
      if (vue === 'employe_detail' && empDetail) return await chargerDetailEmploye(empDetail.id, empDetailMois)
      if (rapportDetail?.id) return await rechargerRapportDetail(rapportDetail.id)
      if (vue === 'sous_dossiers' && chantierActif) return await chargerSousDossiers(chantierActif.id)
      if (vue === 'rapports' && sousDossierActif) return await chargerRapports(sousDossierActif.id)
      return await chargerTout()
    } finally {
      setRefreshingData(false)
    }
  }, [vue, calMois, empDetail, empDetailMois, chantierActif, sousDossierActif])

  // ──────────────────────────────────────────────────────────────────────────
  // CHARGEMENT
  // ──────────────────────────────────────────────────────────────────────────

  async function chargerDepannages(searchValue = search, regieValue = regieFilter, dateValue = dateFilter, regiesValue = regies, regieFilterAvailableValue = regieFilterAvailable) {
    const requestId = ++depannagesRequestRef.current
    setDepannagesLoading(true)
    setDepannagesError('')

    if (regieValue && !regieFilterAvailableValue) {
      if (requestId !== depannagesRequestRef.current) return
      setDepannages([])
      setDepannagesError("Le filtre régie est indisponible sur la base actuelle. Réinitialise les filtres pour afficher les dépannages.")
      setDepannagesLoading(false)
      return
    }

    let query = supabase.from('depannages')
      .select('*, employe:employe_id(prenom), regie:regies(id, nom), pris_par_user:utilisateurs!depannages_pris_par_fkey(id, prenom, initiales), depannage_intervenants(employe_id)')

    if (regieValue) {
      query = query.eq('regie_id', regieValue)
    }

    if (dateValue) {
      query = query.eq('date_travail', dateValue)
    }

    query = query.order('created_at', { ascending: false })

    try {
      const { data, error } = await query
      if (error) throw error
      if (requestId !== depannagesRequestRef.current) return

      const regiesById = {}
      for (const regie of regiesValue || []) regiesById[String(regie.id)] = regie

      let materiauxByDepannage = {}
      let linkedRapportsByDepannage = {}
      const ids = (data || []).map(d => d.id).filter(Boolean)
      const depannageDurees = ids.length > 0
        ? await fetchTimeEntryDurationsMap({ type: 'depannage', referenceIds: ids })
        : {}
      if (ids.length > 0) {
        const [{ data: mats, error: matsError }, { data: linkedRapports, error: linkedRapportsError }] = await Promise.all([
          supabase
            .from('rapport_materiaux')
            .select('*')
            .in('rapport_id', ids),
          supabase
            .from('rapports')
            .select('id, depannage_id, sous_dossier_id')
            .in('depannage_id', ids)
        ])
        if (requestId !== depannagesRequestRef.current) return

        if (linkedRapportsError) {
          console.error('Erreur chargement rapports lies depannages', linkedRapportsError)
        } else {
          for (const rapport of linkedRapports || []) {
            linkedRapportsByDepannage[String(rapport.depannage_id)] = rapport
          }
        }

        const rapportIds = (linkedRapports || []).map(rapport => rapport.id).filter(Boolean)
        let linkedMateriaux = []

        if (rapportIds.length > 0) {
          const { data: matsLinked, error: matsLinkedError } = await supabase
            .from('rapport_materiaux')
            .select('*')
            .in('rapport_id', rapportIds)
          if (requestId !== depannagesRequestRef.current) return

          if (matsLinkedError) {
            console.error('Erreur chargement materiaux rapports depannages', matsLinkedError)
          } else {
            linkedMateriaux = matsLinked || []
          }
        }

        for (const rapport of linkedRapports || []) {
          materiauxByDepannage[String(rapport.depannage_id)] = linkedMateriaux.filter(mat => String(mat.rapport_id) === String(rapport.id))
        }

        if (!matsError) {
          for (const mat of mats || []) {
            const key = String(mat.rapport_id)
            if (materiauxByDepannage[key]?.length) continue
            if (!materiauxByDepannage[key]) materiauxByDepannage[key] = []
            materiauxByDepannage[key].push(mat)
          }
        } else {
          console.error('Erreur chargement materiaux depannages', matsError)
        }
      }

      setDepannages((data || []).map(depannage => ({
        ...depannage,
        _duree: depannageDurees[String(depannage.id)] ?? 0,
        regie: depannage.regie || (depannage.regie_id ? regiesById[String(depannage.regie_id)] || null : null),
        rapport_lie: linkedRapportsByDepannage[String(depannage.id)] || null,
        rapport_materiaux: materiauxByDepannage[String(depannage.id)] || []
      })))
    } catch (error) {
      if (requestId !== depannagesRequestRef.current) return
      console.error('Erreur chargement depannages admin', error)
      setDepannages([])
      if (error?.code === '42703' && error?.message?.includes('regie_id')) {
        setDepannagesError("Le filtre régie est indisponible sur la base actuelle. Réinitialise les filtres pour afficher les dépannages.")
      } else {
        setDepannagesError("Impossible de charger les dépannages. Réessaie dans un instant.")
      }
    } finally {
      if (requestId === depannagesRequestRef.current) setDepannagesLoading(false)
    }
  }

  function resetDepannagesFilters() {
    setSearch('')
    setRegieFilter('')
    setDateFilter('')
    chargerDepannages('', '', '')
  }

  async function chargerTout() {
    setAdminError('')
    try {
      const rap = await supabaseSafe(supabase.from('rapports')
        .select('*, employe:employe_id(prenom), sous_dossiers(id, nom, chantier_id, chantiers(id, nom)), rapport_materiaux(*), rapport_photos(*)')
        .eq('valide', false).is('deleted_at', null).order('created_at', { ascending: false }))

      if (rap && rap.length > 0) {
        const rapportsHydrates = await hydraterRapportsPhotos(rap)
        setRapportsEnAttente(await hydraterRapportsDurees(rapportsHydrates))
      } else {
        setRapportsEnAttente(rap || [])
      }

      // Recharge la corbeille rapports depuis la DB (survive au rechargement de page)
      const rapsSupprimes = await supabaseSafe(supabase.from('rapports')
        .select('*, employe:employe_id(prenom), rapport_materiaux(*)')
        .not('deleted_at', 'is', null).order('deleted_at', { ascending: false }))
      if (rapsSupprimes && rapsSupprimes.length > 0) {
        setCorbeille(prev => {
          const existingIds = new Set(prev.filter(i => i.type === 'rapport').map(i => i.data.id))
          const newItems = rapsSupprimes
            .filter(r => !existingIds.has(r.id))
            .map(r => ({ type: 'rapport', label: `${r.employe?.prenom} · ${new Date(r.date_travail).toLocaleDateString('fr-CH')}`, data: r, enfants: [] }))
          return [...prev.filter(i => i.type !== 'rapport'), ...newItems]
        })
      } else {
        setCorbeille(prev => prev.filter(i => i.type !== 'rapport'))
      }

      const ch = await supabaseSafe(supabase.from('chantiers').select('*').eq('actif', true).order('nom'))
      setChantiers(ch || [])

      let regs = null
      try {
        regs = await supabaseSafe(supabase.from('regies').select('id, nom').eq('actif', true).order('nom'))
        setRegies(regs || [])
      } catch { setRegies([]) }

      let regieFiltreOk = regieFilterAvailable
      const { error: regieColumnError } = await supabase.from('depannages').select('regie_id').limit(1)
      if (regieColumnError?.code === '42703') {
        regieFiltreOk = false
        setRegieFilterAvailable(false)
        setRegieFilter('')
      } else if (regieColumnError) {
        regieFiltreOk = false
        setRegieFilterAvailable(false)
        setRegieFilter('')
      } else {
        regieFiltreOk = true
        setRegieFilterAvailable(true)
      }

      await chargerDepannages(search, regieFiltreOk ? regieFilter : '', dateFilter, regs || regies, regieFiltreOk)

      let cat = []
      try {
        cat = await supabaseSafe(supabase.from('catalogue').select('*').eq('actif', true).order('categorie').order('nom')) || []
      } catch { cat = [] }
      setCatalogue(cat)
      setCategories(['Tous', ...Array.from(new Set(cat.map(a => a.categorie).filter(Boolean)))])

      let emp = null
      try {
        emp = await supabaseSafe(supabase.from('utilisateurs').select('id, prenom, initiales, vacances_quota_annuel').eq('role', 'employe').order('prenom'))
        setEmployes(emp || [])
      } catch { setEmployes([]) }
    } catch (error) {
      console.error('Erreur chargement admin', error)
      setAdminError("Impossible de charger le tableau de bord admin. Réessaie dans un instant.")
    }
  }

  async function chargerVacancesAdmin() {
    setVacancesLoading(true)
    setVacancesError('')
    try {
      const annee = new Date().getFullYear()
      const debutAnnee = `${annee}-01-01`
      const finAnnee = `${annee}-12-31`

      const [demandes, blocages, listeEmp] = await Promise.all([
        supabaseSafe(supabase.from('vacances')
          .select('*, employe:employe_id(id, prenom, initiales, vacances_quota_annuel)')
          .order('created_at', { ascending: false })),
        supabaseSafe(supabase.from('vacances_blocages')
          .select('*')
          .eq('actif', true)
          .order('type', { ascending: true })
          .order('date_debut', { ascending: true })),
        supabaseSafe(supabase.from('utilisateurs')
          .select('id, prenom, initiales, vacances_quota_annuel')
          .eq('role', 'employe')
          .order('prenom'))
      ])

      setVacancesAdmin(demandes || [])
      setBlocagesVacances(blocages || [])
      setEmployes(listeEmp || [])

      const stats = {}
      for (const emp of listeEmp || employes) {
        const empDemandes = (demandes || []).filter(v => String(v.employe_id) === String(emp.id))
        const dansAnnee = empDemandes.filter(v => datesSeChevauchent(v.date_debut, v.date_fin, debutAnnee, finAnnee))
        stats[emp.id] = {
          quota: emp.vacances_quota_annuel || 20,
          pris: dansAnnee.filter(v => v.statut === 'accepte').reduce((s, v) => s + Number(v.jours_ouvrables || countJoursOuvrables(v.date_debut, v.date_fin)), 0),
          attente: dansAnnee.filter(v => v.statut === 'en_attente').reduce((s, v) => s + Number(v.jours_ouvrables || countJoursOuvrables(v.date_debut, v.date_fin)), 0)
        }
      }
      setVacancesStats(stats)
    } catch (error) {
      console.error('Erreur chargement vacances admin', error)
      setVacancesError("Impossible de charger les vacances. Réessaie dans un instant.")
    } finally {
      setVacancesLoading(false)
    }
  }

  async function deciderVacances(demande, statut) {
    try {
      await supabaseSafe(supabase.from('vacances').update({
        statut,
        decide_par: user?.id || null,
        decide_le: new Date().toISOString()
      }).eq('id', demande.id))
      chargerVacancesAdmin()
    } catch (error) {
      alert('Erreur lors de la mise à jour de la demande. Veuillez réessayer.')
    }
  }

  async function creerBlocageVacances(e) {
    e.preventDefault()
    if (!blocageForm.date_debut || !blocageForm.date_fin || !blocageForm.motif.trim() || blocageForm.date_fin < blocageForm.date_debut) return
    try {
      await supabaseSafe(supabase.from('vacances_blocages').insert({
        date_debut: blocageForm.date_debut,
        date_fin: blocageForm.date_fin,
        type: blocageForm.type,
        motif: blocageForm.motif.trim(),
        created_by: user?.id || null
      }))
      setBlocageForm({ date_debut: '', date_fin: '', type: 'blocage', motif: '' })
      chargerVacancesAdmin()
    } catch (error) {
      alert('Erreur lors de la création du blocage. Veuillez réessayer.')
    }
  }

  async function supprimerBlocageVacances(id) {
    try {
      await supabaseSafe(supabase.from('vacances_blocages').update({ actif: false }).eq('id', id))
      chargerVacancesAdmin()
    } catch (error) {
      alert('Erreur lors de la suppression du blocage. Veuillez réessayer.')
    }
  }

  async function modifierQuotaVacances(empId, quota) {
    const valeur = Math.max(0, Number(quota) || 0)
    try {
      await supabaseSafe(supabase.from('utilisateurs').update({ vacances_quota_annuel: valeur }).eq('id', empId))
      setEmployes(prev => prev.map(e => e.id === empId ? { ...e, vacances_quota_annuel: valeur } : e))
      setVacancesStats(prev => ({
        ...prev,
        [empId]: { ...(prev[empId] || {}), quota: valeur }
      }))
    } catch (error) {
      alert('Erreur lors de la mise à jour du quota. Veuillez réessayer.')
    }
  }

  async function chargerSousDossiers(chantierId) {
    const { data } = await supabase.from('sous_dossiers')
      .select('*, rapports(id, rapport_photos(id))')
      .eq('chantier_id', chantierId)
      .order('created_at')
    if (data) setSousDossiers(data)
  }

  async function chargerRapports(sdId) {
    const { data } = await supabase.from('rapports')
      .select('*, employe:employe_id(prenom), sous_dossiers(id, nom, chantier_id, chantiers(id, nom)), rapport_materiaux(*), rapport_photos(*)')
      .eq('sous_dossier_id', sdId).is('deleted_at', null).order('date_travail', { ascending: false })
    if (!data) { setRapports([]); return }
    const rapportsHydrates = await hydraterRapportsPhotos(data)
    if (rapportsHydrates.length > 0) {
      setRapports(await hydraterRapportsDurees(rapportsHydrates))
    } else {
      setRapports([])
    }
  }

  async function chargerCalendrier(mois) {
    const m = mois || calMois
    const { debut, fin } = debutFin(m.year, m.month)
    const { data: raps } = await supabase.from('rapports')
      .select('date_travail, employe_id, employe:employe_id(id, prenom), sous_dossiers(nom, chantiers(nom))')
      .gte('date_travail', debut).lte('date_travail', fin).is('deleted_at', null)
    if (raps) setCalRapports(raps)
    const { data: deps } = await supabase.from('depannages')
      .select('*, employe:employe_id(id, prenom)')
      .gte('date_travail', debut).lte('date_travail', fin)
    if (deps) setCalDepannages(await hydraterDepannagesDurees(deps, null, debut, fin))
  }

  function changerMois(delta) {
    const d = new Date(calMois.year, calMois.month + delta, 1)
    const newMois = { year: d.getFullYear(), month: d.getMonth() }
    setCalMois(newMois); setCalJour(null); chargerCalendrier(newMois)
  }

  function ouvrirVueAdmin(prochaineVue) {
    setVue(prochaineVue)
    if (prochaineVue === 'calendrier') chargerCalendrier(calMois)
    if (prochaineVue === 'vacances') chargerVacancesAdmin()
    if (prochaineVue === 'employes') chargerStatsEmployes()
  }

  async function chargerStatsEmployes() {
    setEmpLoading(true)
    const { data: listeEmp } = await supabase.from('utilisateurs')
      .select('id, prenom, initiales, vacances_quota_annuel').eq('role', 'employe').order('prenom')
    if (!listeEmp || listeEmp.length === 0) { setEmpLoading(false); return }
    setEmployes(listeEmp)

    const now = new Date()
    const { debut: debutMois, fin: finMois } = debutFin(now.getFullYear(), now.getMonth())
    const prevDate = new Date(now.getFullYear(), now.getMonth() - 1, 1)
    const { debut: debutPrev, fin: finPrev } = debutFin(prevDate.getFullYear(), prevDate.getMonth())

    const [{ data: entMois }, { data: entPrev }, { data: delRapsMois }, { data: delRapsPrev }] = await Promise.all([
      supabase.from('time_entries').select('employe_id, duree, type, reference_id, chantier_id')
        .gte('date_travail', debutMois).lte('date_travail', finMois),
      supabase.from('time_entries').select('employe_id, duree, type, reference_id')
        .gte('date_travail', debutPrev).lte('date_travail', finPrev),
      supabase.from('rapports').select('id').not('deleted_at', 'is', null)
        .gte('date_travail', debutMois).lte('date_travail', finMois),
      supabase.from('rapports').select('id').not('deleted_at', 'is', null)
        .gte('date_travail', debutPrev).lte('date_travail', finPrev)
    ])
    const deletedMoisIds = new Set((delRapsMois || []).map(r => r.id))
    const deletedPrevIds = new Set((delRapsPrev || []).map(r => r.id))
    const filteredMois = (entMois || []).filter(e => !(e.type === 'chantier' && e.reference_id && deletedMoisIds.has(e.reference_id)))
    const filteredPrev = (entPrev || []).filter(e => !(e.type === 'chantier' && e.reference_id && deletedPrevIds.has(e.reference_id)))

    const stats = {}
    for (const emp of listeEmp) {
      const moisEmp = filteredMois.filter(e => String(e.employe_id) === String(emp.id))
      const prevEmp = filteredPrev.filter(e => String(e.employe_id) === String(emp.id))
      stats[emp.id] = {
        heureMois: moisEmp.reduce((s, e) => s + Number(e.duree || 0), 0),
        heurePrev: prevEmp.reduce((s, e) => s + Number(e.duree || 0), 0),
        chantiersCount: new Set(moisEmp.filter(e => e.chantier_id).map(e => e.chantier_id)).size
      }
    }
    setEmpStats(stats)
    setEmpLoading(false)
  }

  async function chargerDetailEmploye(empId, mois) {
    const m = mois || empDetailMois
    const { debut, fin } = debutFin(m.year, m.month)

    const { data: raps } = await supabase.from('rapports')
      .select('id, date_travail, remarques, sous_dossiers(nom, chantier_id, chantiers(nom))')
      .eq('employe_id', empId).gte('date_travail', debut).lte('date_travail', fin).is('deleted_at', null).order('date_travail')

    if (raps && raps.length > 0) {
      setEmpDetailRapports(await hydraterRapportsDurees(raps, empId, debut, fin))
    } else {
      setEmpDetailRapports(raps || [])
    }

    const { data: deps } = await supabase.from('depannages')
      .select('*').eq('employe_id', empId)
      .gte('date_travail', debut).lte('date_travail', fin).order('date_travail')
    if (deps) setEmpDetailDepannages(await hydraterDepannagesDurees(deps, empId, debut, fin))

    // Absences
    const { data: abs } = await supabase.from('absences')
      .select('*').eq('employe_id', empId)
      .order('created_at', { ascending: false }).limit(30)
    setEmpAbsences(abs || [])
  }

  async function approuverAbsence(id) {
    try {
      await supabaseSafe(supabase.from('absences').update({
        statut: 'approuve',
        decide_par: user?.id || null,
        decide_le: new Date().toISOString()
      }).eq('id', id))
      if (empDetail) chargerDetailEmploye(empDetail.id, empDetailMois)
    } catch (error) {
      alert("Erreur lors de l'approbation de l'absence.")
    }
  }

  async function refuserAbsence(id) {
    try {
      await supabaseSafe(supabase.from('absences').update({
        statut: 'refuse',
        decide_par: user?.id || null,
        decide_le: new Date().toISOString()
      }).eq('id', id))
      if (empDetail) chargerDetailEmploye(empDetail.id, empDetailMois)
    } catch (error) {
      alert("Erreur lors du refus de l'absence.")
    }
  }

  async function chargerCharteEmploye(empId) {
    setEmpCharteLoading(true)
    const [{ data: charte }, { data: sig }] = await Promise.all([
      supabase.from('chartes_acceptees').select('*').eq('employe_id', empId).maybeSingle(),
      supabase.from('signatures').select('signature_base64, signee_le').eq('employe_id', empId).maybeSingle()
    ])
    setEmpCharteData({ charte, sig })
    setEmpCharteLoading(false)
  }

  // ──────────────────────────────────────────────────────────────────────────
  // PDF HEBDOMADAIRE (tâche 5)
  // ──────────────────────────────────────────────────────────────────────────

  async function genererFeuilleHebdo() {
    if (!empDetail || !pdfSemaine) return
    setPdfLoading(true)

    const sem = parseInt(pdfSemaine)
    const anneeVal = parseInt(pdfAnnee)
    const { lundi, dimanche, lundiStr, dimancheStr } = getWeekDateRange(sem, anneeVal)
    const empId = empDetail.id

    // Rapports + time_entries pour les durées correctes
    const [{ data: raps }, { data: deps }, { data: suppEntries }] = await Promise.all([
      supabase.from('rapports')
        .select('id, date_travail, remarques, sous_dossiers(nom, chantiers(nom, adresse))')
        .eq('employe_id', empId).gte('date_travail', lundiStr).lte('date_travail', dimancheStr)
        .is('deleted_at', null).order('date_travail'),
      supabase.from('depannages')
        .select('id, date_travail, adresse')
        .eq('employe_id', empId).gte('date_travail', lundiStr).lte('date_travail', dimancheStr)
        .order('date_travail'),
      supabase.from('time_entries')
        .select('date_travail, duree, commentaire')
        .eq('employe_id', empId).eq('type', 'heures_supp')
        .gte('date_travail', lundiStr).lte('date_travail', dimancheStr)
    ])

    // Merge des durées rapports via time_entries
    const rapsAvecDuree = await hydraterRapportsDurees(raps || [], empId, lundiStr, dimancheStr)
    const depsAvecDuree = await hydraterDepannagesDurees(deps || [], empId, lundiStr, dimancheStr)

    const { data: sigData } = await supabase.from('signatures')
      .select('signature_base64').eq('employe_id', empId).maybeSingle()

    const { jsPDF } = await import('jspdf')
    const doc = new jsPDF({ format: 'a4' })

    const lundiLabel = lundi.toLocaleDateString('fr-CH', { day: '2-digit', month: '2-digit', year: 'numeric' })
    const dimancheLabel = dimanche.toLocaleDateString('fr-CH', { day: '2-digit', month: '2-digit', year: 'numeric' })

    // En-tête
    doc.setFontSize(16); doc.setFont('helvetica', 'bold')
    doc.text('Eleco SA — Feuille hebdomadaire', 20, 20)
    doc.setFontSize(11); doc.setFont('helvetica', 'normal')
    doc.text(`Employé : ${empDetail.prenom || '—'}`, 20, 30)
    doc.text(`Semaine ${sem} — du ${lundiLabel} au ${dimancheLabel}`, 20, 37)
    doc.setDrawColor(180); doc.line(20, 42, 190, 42)

    let y = 52
    let totalH = 0

    for (let wd = 0; wd < 7; wd++) {
      const d = new Date(lundi)
      d.setDate(lundi.getDate() + wd)
      const dateStr = d.toISOString().split('T')[0]
      const nomJour = JOURS_LONG[wd]
      const dateLabel = d.toLocaleDateString('fr-CH', { day: '2-digit', month: '2-digit' })
      const isWeekend = wd >= 5

      const dayRaps = rapsAvecDuree.filter(r => r.date_travail === dateStr)
      const dayDeps = depsAvecDuree.filter(dep => dep.date_travail === dateStr)
      const daySupp = (suppEntries || []).filter(s => s.date_travail === dateStr)
      const isEmpty = dayRaps.length === 0 && dayDeps.length === 0 && daySupp.length === 0

      // Ligne de jour
      if (isWeekend) {
        doc.setFillColor(245, 245, 245)
      } else {
        doc.setFillColor(230, 241, 251)
      }
      doc.rect(20, y - 5, 170, 8, 'F')
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(9)
      doc.setTextColor(isWeekend ? 160 : 30)
      doc.text(`${nomJour} ${dateLabel}`, 22, y)
      doc.setTextColor(0)
      y += 6

      if (isEmpty) {
        doc.setFont('helvetica', 'normal')
        doc.setFontSize(8)
        doc.setTextColor(isWeekend ? 190 : 140)
        doc.text('— aucune activité —', 28, y)
        doc.setTextColor(0)
        y += 6
      } else {
        doc.setFont('helvetica', 'normal')
        doc.setFontSize(9)

        for (const r of dayRaps) {
          const nomChantier = r.sous_dossiers?.chantiers?.nom || '—'
          const nomSd = r.sous_dossiers?.nom || ''
          const duree = Number(r._duree) || 0
          totalH += duree
          const label = `🏗  ${nomChantier}${nomSd ? ' › ' + nomSd : ''}`
          const lines = doc.splitTextToSize(label, 130)
          doc.text(lines, 28, y)
          doc.text(fmtDuree(duree), 188, y, { align: 'right' })
          y += lines.length * 5 + 2
        }

        for (const dep of dayDeps) {
          const duree = Number(dep._duree) || 0
          totalH += duree
          const label = `⚡  Dépannage — ${dep.adresse}  (Bon #${dep.id})`
          const lines = doc.splitTextToSize(label, 130)
          doc.text(lines, 28, y)
          doc.text(fmtDuree(duree), 188, y, { align: 'right' })
          y += lines.length * 5 + 2
        }

        for (const s of daySupp) {
          const duree = Number(s.duree) || 0
          totalH += duree
          const label = `+  H. supp. — ${s.commentaire || ''}`
          const lines = doc.splitTextToSize(label, 130)
          doc.text(lines, 28, y)
          doc.text(fmtDuree(duree), 188, y, { align: 'right' })
          y += lines.length * 5 + 2
        }
      }

      doc.setDrawColor(220)
      doc.line(20, y, 190, y)
      y += 5

      if (y > 260) { doc.addPage(); y = 20 }
    }

    // Total
    y += 4
    doc.setFont('helvetica', 'bold'); doc.setFontSize(12)
    doc.text(`Total semaine ${sem} : ${fmtDuree(totalH)}`, 20, y)

    // Signature
    if (sigData?.signature_base64) {
      y += 16
      doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(120)
      doc.text(`Signature de ${empDetail.prenom}`, 20, y)
      doc.setTextColor(0); y += 4
      doc.addImage(sigData.signature_base64, 'PNG', 20, y, 80, 35)
    }

    doc.save(`heures_${empDetail.prenom || 'employe'}_sem${sem}_${anneeVal}.pdf`)
    setPdfLoading(false)
  }

  // ──────────────────────────────────────────────────────────────────────────
  // PDF CHARTE ADMIN (tâche 6)
  // ──────────────────────────────────────────────────────────────────────────

  async function genererPDFCharteAdmin() {
    if (!empDetail || !empCharteData?.sig?.signature_base64) return
    const { sig, charte } = empCharteData
    const dateISO = charte?.acceptee_le || sig?.signee_le || new Date().toISOString()
    const dateStr = new Date(dateISO).toLocaleDateString('fr-CH', { day: '2-digit', month: '2-digit', year: 'numeric' })
    const { jsPDF } = await import('jspdf')
    const doc = new jsPDF({ format: 'a4' })

    doc.setFontSize(18); doc.setFont('helvetica', 'bold')
    doc.text('ELECO SA', 20, 22)
    doc.setFontSize(13); doc.setFont('helvetica', 'normal')
    doc.text("Charte d'utilisation numérique — v1.0", 20, 31)
    doc.setFontSize(10); doc.setTextColor(130)
    doc.text(`Signé le ${dateStr} par ${empDetail.prenom || ''}`, 20, 39)
    doc.setTextColor(0); doc.setDrawColor(180); doc.line(20, 44, 190, 44)

    let y = 54
    doc.setFontSize(10)
    for (const clause of CLAUSES_CHARTE) {
      doc.setFont('helvetica', 'bold')
      const titreLines = doc.splitTextToSize(clause.titre, 170)
      if (y + (titreLines.length + 3) * 5.5 > 270) { doc.addPage(); y = 20 }
      doc.text(titreLines, 20, y)
      y += titreLines.length * 5.5 + 2
      doc.setFont('helvetica', 'normal'); doc.setTextColor(60)
      const texteLines = doc.splitTextToSize(clause.texte, 165)
      if (y + texteLines.length * 5 + 8 > 270) { doc.addPage(); y = 20 }
      doc.text(texteLines, 25, y)
      doc.setTextColor(0)
      y += texteLines.length * 5 + 8
    }

    if (y + 60 > 270) { doc.addPage(); y = 20 }
    y += 4
    doc.setDrawColor(200); doc.line(20, y, 190, y)
    y += 8
    doc.setFont('helvetica', 'bold'); doc.setFontSize(11)
    doc.text('Signature électronique', 20, y)
    y += 6
    doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(120)
    doc.text(`Accepté et signé numériquement le ${dateStr}`, 20, y)
    y += 5
    doc.text(`Employé : ${empDetail.prenom || '—'} — Eleco SA`, 20, y)
    doc.setTextColor(0); y += 6
    doc.addImage(sig.signature_base64, 'PNG', 20, y, 80, 36)
    doc.save(`charte_eleco_${empDetail.prenom || 'employe'}_${dateStr.replace(/\//g, '-')}.pdf`)
  }

  async function reinitialiserCharte(empId) {
    if (!safeConfirm(`Réinitialiser la charte de ${empDetail?.prenom} ? Cette action remet le statut à "non signé".`)) return
    try {
      await Promise.all([
        supabaseSafe(supabase.from('chartes_acceptees').delete().eq('employe_id', empId)),
        supabaseSafe(supabase.from('signatures').delete().eq('employe_id', empId))
      ])
      setEmpCharteData({ charte: null, sig: null })
    } catch (error) {
      alert('Erreur lors de la réinitialisation de la charte. Veuillez réessayer.')
    }
  }

  // ──────────────────────────────────────────────────────────────────────────
  // ACTIONS CRUD
  // ──────────────────────────────────────────────────────────────────────────

  async function deconnecter() { await signOut(); navigate('/login') }

  async function supprimerChantier(c) {
    const { data: sds } = await supabase.from('sous_dossiers').select('*').eq('chantier_id', c.id)
    try {
      await supabaseSafe(supabase.from('chantiers').update({ actif: false }).eq('id', c.id))
      setCorbeille(prev => [...prev, { type: 'chantier', label: c.nom, data: c, enfants: sds || [] }])
      chargerTout(); setConfirm(null); setVue('chantiers'); setChantierActif(null)
    } catch (error) {
      alert('Erreur lors de la suppression du chantier. Veuillez réessayer.')
    }
  }

  async function supprimerSousDossier(sd) {
    const { data: raps } = await supabase.from('rapports').select('*, rapport_materiaux(*)').eq('sous_dossier_id', sd.id)
    if ((raps || []).length > 0) {
      alert('Suppression bloquee: ce sous-dossier contient deja des rapports.')
      setConfirm(null)
      return
    }
    try {
      await supabaseSafe(supabase.from('sous_dossiers').delete().eq('id', sd.id))
      setCorbeille(prev => [...prev, { type: 'sous_dossier', label: sd.nom, data: sd, enfants: raps || [] }])
      chargerSousDossiers(chantierActif.id); setConfirm(null)
    } catch (error) {
      alert('Erreur lors de la suppression du sous-dossier. Veuillez réessayer.')
    }
  }

  async function supprimerRapport(r) {
    try {
      await supabaseSafe(supabase.from('rapports').update({ deleted_at: new Date().toISOString() }).eq('id', r.id))
      setCorbeille(prev => [...prev, { type: 'rapport', label: `${r.employe?.prenom} · ${new Date(r.date_travail).toLocaleDateString('fr-CH')}`, data: r, enfants: [] }])
      if (sousDossierActif) chargerRapports(sousDossierActif.id)
      setRapportDetail(null); setConfirm(null)
    } catch (error) {
      alert('Erreur lors de la suppression du rapport. Veuillez réessayer.')
    }
  }

  async function restaurerCorbeille(item) {
    try {
    if (item.type === 'chantier') {
      await supabaseSafe(supabase.from('chantiers').update({ actif: true }).eq('id', item.data.id))
    } else if (item.type === 'sous_dossier') {
      await supabaseSafe(supabase.from('sous_dossiers').insert({ chantier_id: item.data.chantier_id, nom: item.data.nom }))
    } else if (item.type === 'rapport') {
      await supabaseSafe(supabase.from('rapports').update({ deleted_at: null }).eq('id', item.data.id))
    }
    setCorbeille(prev => prev.filter(i => i !== item))
    chargerTout()
    } catch (error) {
      alert('Erreur lors de la restauration. Veuillez réessayer.')
    }
  }

  async function renommer() {
    if (!renommerItem || !nouveauNom.trim()) return
    try {
      if (renommerItem.type === 'chantier') {
        await supabaseSafe(supabase.from('chantiers').update({ nom: nouveauNom }).eq('id', renommerItem.data.id))
        chargerTout()
      } else if (renommerItem.type === 'sous_dossier') {
        await supabaseSafe(supabase.from('sous_dossiers').update({ nom: nouveauNom }).eq('id', renommerItem.data.id))
        chargerSousDossiers(chantierActif.id)
      }
      setRenommerItem(null); setNouveauNom('')
    } catch (error) {
      alert('Erreur lors du renommage. Veuillez réessayer.')
    }
  }

  async function valider(rid) {
    try {
      await supabaseSafe(supabase.from('rapports').update({ valide: true }).eq('id', rid))
      chargerTout()
      if (sousDossierActif) chargerRapports(sousDossierActif.id)
      setRapportDetail(null)
    } catch (error) {
      alert('Erreur lors de la validation du rapport. Veuillez réessayer.')
    }
  }

  async function sauvegarderMateriaux(rapportId, newMat) {
    try {
      const anciensIds = (rapportDetail?.rapport_materiaux || []).map(m => m.id).filter(Boolean)
      const idsConserves = newMat.map(m => m.id).filter(Boolean)
      const idsSupprimes = anciensIds.filter(id => !idsConserves.includes(id))

      if (newMat.length > 0) {
        await supabaseSafe(supabase.from('rapport_materiaux').upsert(
          newMat.map(m => ({
            ...(m.id ? { id: m.id } : {}),
            rapport_id: rapportId,
            ref_article: m.ref_article || null,
            designation: m.designation || m.nom,
            unite: m.unite,
            quantite: m.quantite,
            prix_net: m.prix_net || m.pu || 0
          }))
        ))
      }

      if (idsSupprimes.length > 0) {
        await supabaseSafe(supabase.from('rapport_materiaux').delete().in('id', idsSupprimes))
      }

      if (sousDossierActif) chargerRapports(sousDossierActif.id)
      chargerTout()
      // Recharger le rapportDetail avec les nouvelles données
      await rechargerRapportDetail(rapportId)
      setEditMateriaux(null); setAjoutArticleVue(false)
      setArticleManuel({ designation: '', unite: '', prix: '0', quantite: 1 })
    } catch (error) {
      alert("Erreur lors de l'enregistrement des matériaux. Veuillez réessayer.")
    }
  }

  async function sauvegarderRapportDetail() {
    if (!rapportDetail) return
    try {
      await supabaseSafe(supabase.from('rapports').update({
        date_travail: editRapportDate,
        remarques: editRapportRemarques
      }).eq('id', rapportDetail.id))
      setRapportDetail(prev => ({ ...prev, date_travail: editRapportDate, remarques: editRapportRemarques }))
      setEditRapportMode(false)
      if (sousDossierActif) chargerRapports(sousDossierActif.id)
    } catch (error) {
      alert('Erreur lors de la mise à jour du rapport. Veuillez réessayer.')
    }
  }

  // ──────────────────────────────────────────────────────────────────────────
  // HELPERS
  // ──────────────────────────────────────────────────────────────────────────

  async function rechargerRapportDetail(rapportId = rapportDetail?.id) {
    if (!rapportId) return null

    const updatedR = await supabaseSafe(
      supabase
        .from('rapports')
        .select('*, employe:employe_id(prenom), sous_dossiers(id, nom, chantier_id, chantiers(id, nom)), rapport_materiaux(*), rapport_photos(*)')
        .eq('id', rapportId)
        .single()
    )

    if (!updatedR) {
      setRapportDetail(null)
      return null
    }

    const [rapportHydrate] = await hydraterRapportsDurees(await hydraterRapportsPhotos([updatedR]))
    setRapportDetail(rapportHydrate || null)
    if (sousDossierActif?.id) await chargerRapports(sousDossierActif.id)
    return rapportHydrate || null
  }

  async function ajouterPhotosRapportAdmin(fileList) {
    const files = Array.from(fileList || []).filter(Boolean)
    if (!rapportDetail?.id || files.length === 0 || adminPhotoSaving) return

    const sousDossierId = rapportDetail.sous_dossiers?.id || rapportDetail.sous_dossier_id || sousDossierActif?.id || null
    const chantierId = rapportDetail.sous_dossiers?.chantier_id || rapportDetail.sous_dossiers?.chantiers?.id || chantierActif?.id || null

    if (!sousDossierId || !chantierId) {
      alert("Impossible d'ajouter des photos sans dossier chantier rattache au rapport.")
      return
    }

    setAdminPhotoSaving(true)
    try {
      await uploadRapportPhotos({
        rapportId: rapportDetail.id,
        depannageId: rapportDetail.depannage_id || null,
        chantierId,
        sousDossierId,
        files,
        userId: user?.id || null
      })
      await rechargerRapportDetail(rapportDetail.id)
      chargerTout()
    } catch (error) {
      console.error('Erreur ajout photos admin rapport', error)
      alert("Impossible d'ajouter les photos pour l'instant.")
    } finally {
      setAdminPhotoSaving(false)
    }
  }

  async function supprimerPhotoRapportAdmin(photo) {
    if (!photo?.id || adminPhotoSaving) return
    const confirmed = await safeConfirm('Supprimer cette photo du rapport ?')
    if (!confirmed) return

    setAdminPhotoSaving(true)
    try {
      await deleteRapportPhoto(photo)
      await rechargerRapportDetail(rapportDetail?.id)
      chargerTout()
    } catch (error) {
      console.error('Erreur suppression photo admin rapport', error)
      alert("Impossible de supprimer cette photo pour l'instant.")
    } finally {
      setAdminPhotoSaving(false)
    }
  }

  async function basculerVisibiliteDocuments(chantier) {
    if (!chantier?.id) return

    const nextVisibilite = chantier.documents_visibilite_employe === 'complet' ? 'sans_prix' : 'complet'

    try {
      const updated = await supabaseSafe(
        supabase
          .from('chantiers')
          .update({ documents_visibilite_employe: nextVisibilite })
          .eq('id', chantier.id)
          .select()
          .single()
      )

      if (!updated) throw new Error('chantier_documents_visibility_update_empty')

      setChantiers(prev => prev.map(item => item.id === updated.id ? updated : item))
      if (chantierActif?.id === updated.id) setChantierActif(updated)
    } catch (error) {
      console.error('Erreur mise a jour visibilite documents chantier', error)
      alert("Impossible de modifier la visibilite des documents pour l'instant.")
    }
  }

  function totaux(r) {
    const mat = (r.rapport_materiaux || []).reduce((s, m) => s + m.quantite * (m.prix_net || 0), 0)
    const duree = r._duree !== undefined ? r._duree : 0
    const mo = duree * TAUX
    const ht = mat + mo
    return { duree, mat, mo, ht, tva: ht * 0.081, ttc: ht * 1.081 }
  }

  const articlesFiltres = (() => {
    let l = catalogue
    if (catFiltre !== 'Tous') l = l.filter(a => a.categorie === catFiltre)
    if (rechercheArticle) l = l.filter(a =>
      a.nom.toLowerCase().includes(rechercheArticle.toLowerCase()) ||
      (a.categorie || '').toLowerCase().includes(rechercheArticle.toLowerCase())
    )
    return l.slice(0, 100)
  })()

  function depannageRegieLabel(depannage) {
    return depannage.regie?.nom || 'Régie non définie'
  }

  function depannageMoisLabel(depannage) {
    if (!depannage.date_travail) return 'Date non définie'
    const d = new Date(depannage.date_travail + 'T12:00:00')
    if (Number.isNaN(d.getTime())) return 'Date non définie'
    return `${MOIS_FR[d.getMonth()]} ${d.getFullYear()}`
  }

  function depannageDescription(depannage) {
    const texte = (depannage.objet || depannage.titre || depannage.remarques || '').trim()
    if (!texte) return 'Aucune description'
    return texte.length > 90 ? `${texte.slice(0, 90)}...` : texte
  }

  function depannageClientAdresse(depannage) {
    const client = (depannage.client || depannage.nom_client || '').trim()
    const adresse = (depannage.adresse || '').trim()
    if (client && adresse) return `${client} · ${adresse}`
    return client || adresse || 'Adresse non définie'
  }

  function depannageStatut(depannage) {
    return depannage.statut || depannage.status || 'À traiter'
  }

  function depannageStatutBadgeClass(statut) {
    if (statut === STATUT_FACTURE_PRETE) return 'badge-green'
    if (['Planifié', 'En cours', STATUT_INTERVENTION_FAITE, STATUT_RAPPORT_RECU, STATUT_FACTURE_A_PREPARER].includes(statut)) return 'badge-blue'
    return 'badge-amber'
  }

  function depannageResponsableLabel(depannage) {
    return getInitiales(depannage.pris_par_user) || 'Aucun'
  }

  function depannageIntervenantsCount(depannage) {
    return (depannage.depannage_intervenants || []).length
  }

  async function mettreAJourStatutChantier(chantier, nextStatus) {
    if (!chantier?.id || !nextStatus) return

    try {
      const updated = await supabaseSafe(
        supabase
          .from('chantiers')
          .update({ statut: nextStatus })
          .eq('id', chantier.id)
          .select()
          .single()
      )

      if (!updated) throw new Error('chantier_status_update_empty')

      setChantiers(prev => prev.map(item => item.id === updated.id ? updated : item))
      if (chantierActif?.id === updated.id) setChantierActif(updated)
    } catch (error) {
      console.error('Erreur mise a jour statut chantier', error)
      alert("Impossible de mettre a jour le statut du chantier. Veuillez reessayer.")
    }
  }

  function depannageTimestamp(depannage) {
    const value = depannage.date_travail || depannage.created_at
    if (!value) return 0
    const normalized = String(value).includes('T') ? value : `${value}T12:00:00`
    const timestamp = new Date(normalized).getTime()
    return Number.isNaN(timestamp) ? 0 : timestamp
  }

  function comparerDepannagesRecent(a, b) {
    return depannageTimestamp(b) - depannageTimestamp(a)
  }

  const chantiersGroupes = useMemo(() => groupChantiersByClient(chantiers), [chantiers])

  function normalizeDepannageSearchValue(value) {
    return String(value || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .trim()
  }

  function depannageMatchesSearch(depannage, rawSearch) {
    const term = normalizeDepannageSearchValue(rawSearch)
    if (!term) return true

    const searchableValues = [
      depannage.id,
      depannage.regie?.nom,
      depannage.adresse,
      depannage.remarques,
      depannage.objet,
      depannage.titre,
      depannage.client,
      depannage.nom_client
    ]

    return searchableValues.some(value => normalizeDepannageSearchValue(value).includes(term))
  }

  function grouperDepannages(liste) {
    const groupes = {}
    for (const depannage of [...liste].sort(comparerDepannagesRecent)) {
      const regie = depannageRegieLabel(depannage)
      const mois = depannageMoisLabel(depannage)
      const timestamp = depannageTimestamp(depannage)
      if (!groupes[regie]) groupes[regie] = { nom: regie, count: 0, mois: {}, moisTimestamps: {} }
      if (!groupes[regie].mois[mois]) groupes[regie].mois[mois] = []
      groupes[regie].mois[mois].push(depannage)
      groupes[regie].moisTimestamps[mois] = Math.max(groupes[regie].moisTimestamps[mois] || 0, timestamp)
      groupes[regie].count += 1
    }
    return Object.values(groupes).map(groupe => ({
      nom: groupe.nom,
      count: groupe.count,
      mois: groupe.mois,
      moisOrdre: Object.keys(groupe.mois).sort((a, b) => (groupe.moisTimestamps[b] || 0) - (groupe.moisTimestamps[a] || 0))
    }))
  }

  const depannagesFiltres = useMemo(
    () => depannages.filter(depannage => depannageMatchesSearch(depannage, search)),
    [depannages, search]
  )

  const depannagesGroupes = useMemo(() => grouperDepannages(depannagesFiltres), [depannagesFiltres])

  // ──────────────────────────────────────────────────────────────────────────
  // VUES
  // ──────────────────────────────────────────────────────────────────────────

  if (vueCorbeille) return (
    <div>
      <div className="top-bar">
        <div>
          <button onClick={() => setVueCorbeille(false)} style={{ background: 'none', border: 'none', color: '#185FA5', fontSize: '13px', cursor: 'pointer', padding: 0 }}>← Retour</button>
          <div style={{ fontWeight: 600, fontSize: '15px', marginTop: '4px' }}>🗑️ Corbeille</div>
        </div>
      </div>
      <div className="page-content">
        {corbeille.length === 0 && <div style={{ textAlign: 'center', color: '#888', fontSize: '13px', padding: '40px 0' }}>Corbeille vide</div>}
        {corbeille.map((item, i) => (
          <div key={i} className="card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <div style={{ fontSize: '12px', color: '#888', textTransform: 'uppercase' }}>{item.type}</div>
              <div style={{ fontWeight: 500, fontSize: '13px' }}>{item.label}</div>
            </div>
            <button className="btn-primary btn-sm" style={{ width: 'auto' }} onClick={() => restaurerCorbeille(item)}>↩ Restaurer</button>
          </div>
        ))}
      </div>
    </div>
  )

  if (confirm) return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '24px', gap: '16px' }}>
      <div style={{ fontSize: '40px' }}>⚠️</div>
      <div style={{ fontWeight: 600, fontSize: '16px', textAlign: 'center' }}>Supprimer "{confirm.data.nom || confirm.data.adresse}" ?</div>
      <div style={{ fontSize: '13px', color: '#888', textAlign: 'center' }}>L'élément sera mis en corbeille et récupérable.</div>
      <div style={{ display: 'flex', gap: '10px', width: '100%', maxWidth: '300px' }}>
        <button className="btn-outline" style={{ flex: 1 }} onClick={() => setConfirm(null)}>Annuler</button>
        <button className="btn-primary" style={{ flex: 1, background: '#A32D2D' }} onClick={() => {
          if (confirm.type === 'chantier') supprimerChantier(confirm.data)
          else if (confirm.type === 'sous_dossier') supprimerSousDossier(confirm.data)
          else if (confirm.type === 'rapport') supprimerRapport(confirm.data)
        }}>Supprimer</button>
      </div>
    </div>
  )

  if (renommerItem) return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '24px', gap: '16px' }}>
      <div style={{ fontWeight: 600, fontSize: '16px' }}>Renommer</div>
      <input value={nouveauNom} onChange={e => setNouveauNom(e.target.value)} placeholder="Nouveau nom"
        style={{ width: '100%', maxWidth: '300px', padding: '10px', borderRadius: '8px', border: '1px solid #ddd', fontSize: '14px' }} />
      <div style={{ display: 'flex', gap: '10px', width: '100%', maxWidth: '300px' }}>
        <button className="btn-outline" style={{ flex: 1 }} onClick={() => { setRenommerItem(null); setNouveauNom('') }}>Annuler</button>
        <button className="btn-primary" style={{ flex: 1 }} onClick={renommer}>Renommer</button>
      </div>
    </div>
  )

  // Vue ajout article (catalogue + saisie manuelle — tâche 8)
  if (ajoutArticleVue && editMateriaux) return (
    <div>
      <div className="top-bar">
        <div>
          <button onClick={() => setAjoutArticleVue(false)} style={{ background: 'none', border: 'none', color: '#185FA5', fontSize: '13px', cursor: 'pointer', padding: 0 }}>← Retour</button>
          <div style={{ fontWeight: 600, fontSize: '15px', marginTop: '4px' }}>Ajouter article</div>
        </div>
      </div>
      <div className="page-content">
        {/* Saisie manuelle */}
        <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          <div style={{ fontWeight: 600, fontSize: '13px', color: '#185FA5' }}>Saisie manuelle (hors catalogue)</div>
          <div className="form-group">
            <label>Désignation *</label>
            <input value={articleManuel.designation} onChange={e => setArticleManuel(p => ({ ...p, designation: e.target.value }))} placeholder="Nom de l'article..." />
          </div>
          <div className="grid2">
            <div className="form-group">
              <label>Unité</label>
              <input value={articleManuel.unite} onChange={e => setArticleManuel(p => ({ ...p, unite: e.target.value }))} placeholder="pce, m, kg..." />
            </div>
            <div className="form-group">
              <label>Prix net (CHF)</label>
              <input type="number" min="0" step="0.01" value={articleManuel.prix} onChange={e => setArticleManuel(p => ({ ...p, prix: e.target.value }))} />
            </div>
          </div>
          <div className="form-group">
            <label>Quantité</label>
            <input type="number" min="1" value={articleManuel.quantite} onChange={e => setArticleManuel(p => ({ ...p, quantite: parseInt(e.target.value) || 1 }))} />
          </div>
          <button
            className="btn-primary"
            disabled={!articleManuel.designation.trim()}
            onClick={() => {
              setEditMateriaux(prev => ({
                ...prev,
                mats: [...prev.mats, {
                  ref_article: null,
                  designation: articleManuel.designation.trim(),
                  unite: articleManuel.unite.trim() || 'pce',
                  quantite: articleManuel.quantite,
                  prix_net: parseFloat(articleManuel.prix) || 0
                }]
              }))
              setArticleManuel({ designation: '', unite: '', prix: '0', quantite: 1 })
              setAjoutArticleVue(false)
            }}
          >+ Ajouter cet article</button>
        </div>

        {/* Catalogue */}
        <div style={{ fontWeight: 600, fontSize: '13px', color: '#666' }}>Ou choisir dans le catalogue :</div>
        <input type="search" placeholder="Rechercher..." value={rechercheArticle} onChange={e => setRechercheArticle(e.target.value)}
          style={{ padding: '10px', borderRadius: '8px', border: '1px solid #ddd', fontSize: '13px' }} />
        <div style={{ display: 'flex', gap: '6px', overflowX: 'auto', paddingBottom: '4px' }}>
          {categories.map(c => (
            <button key={c} onClick={() => setCatFiltre(c)} style={{
              padding: '5px 12px', borderRadius: '20px', fontSize: '12px', fontWeight: 500, cursor: 'pointer',
              border: catFiltre === c ? 'none' : '1px solid #ddd',
              background: catFiltre === c ? '#185FA5' : 'white',
              color: catFiltre === c ? 'white' : '#333', whiteSpace: 'nowrap'
            }}>{c}</button>
          ))}
        </div>
        <div className="card" style={{ padding: 0 }}>
          {articlesFiltres.map((a, i) => {
            const dejaDans = editMateriaux.mats.find(m => m.ref_article === a.id)
            return (
              <div key={a.id} style={{ display: 'flex', alignItems: 'center', padding: '10px 14px', gap: '8px', borderBottom: i < articlesFiltres.length - 1 ? '1px solid #eee' : 'none' }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: '13px', fontWeight: 500 }}>{a.nom}</div>
                  <div style={{ fontSize: '11px', color: '#888' }}>{a.categorie} · {a.unite}</div>
                </div>
                {dejaDans ? (
                  <span style={{ fontSize: '12px', color: '#27ae60', fontWeight: 500 }}>✓ Ajouté</span>
                ) : (
                  <button onClick={() => {
                    setEditMateriaux(prev => ({ ...prev, mats: [...prev.mats, { ref_article: a.id, designation: a.nom, unite: a.unite, quantite: 1, prix_net: a.prix_net || 0 }] }))
                  }} style={{ width: 28, height: 28, borderRadius: '50%', border: '1px solid #185FA5', background: '#E6F1FB', color: '#185FA5', fontSize: '18px', cursor: 'pointer' }}>+</button>
                )}
              </div>
            )
          })}
          {articlesFiltres.length === 0 && <div style={{ padding: '20px', textAlign: 'center', color: '#888', fontSize: '13px' }}>Aucun article</div>}
        </div>
        <button className="btn-outline" onClick={() => setAjoutArticleVue(false)}>← Retour sans ajouter</button>
      </div>
    </div>
  )

  if (editMateriaux) return (
    <div>
      <div className="top-bar">
        <div>
          <button onClick={() => { setEditMateriaux(null); setArticleManuel({ designation: '', unite: '', prix: '0', quantite: 1 }) }} style={{ background: 'none', border: 'none', color: '#185FA5', fontSize: '13px', cursor: 'pointer', padding: 0 }}>← Retour</button>
          <div style={{ fontWeight: 600, fontSize: '15px', marginTop: '4px' }}>Modifier matériaux</div>
        </div>
        <button className="btn-primary btn-sm" style={{ width: 'auto' }} onClick={() => { setRechercheArticle(''); setCatFiltre('Tous'); setAjoutArticleVue(true) }}>+ Ajouter</button>
      </div>
      <div className="page-content">
        {editMateriaux.mats.length === 0 && <div style={{ textAlign: 'center', color: '#888', fontSize: '13px', padding: '20px' }}>Aucun article</div>}
        {editMateriaux.mats.map((m, i) => (
          <div key={i} className="card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 500, fontSize: '13px' }}>{m.designation}</div>
              <div style={{ fontSize: '11px', color: '#888' }}>{m.unite} · {m.prix_net?.toFixed(2) || '0.00'} CHF</div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <button onClick={() => {
                setEditMateriaux(prev => ({ ...prev, mats: prev.mats.map((x, j) => j === i ? { ...x, quantite: Math.max(1, x.quantite - 1) } : x) }))
              }} style={{ width: 26, height: 26, borderRadius: '50%', border: '1px solid #ddd', background: 'white', cursor: 'pointer', fontSize: '14px' }}>−</button>
              <span style={{ fontWeight: 600, minWidth: '20px', textAlign: 'center' }}>{m.quantite}</span>
              <button onClick={() => {
                setEditMateriaux(prev => ({ ...prev, mats: prev.mats.map((x, j) => j === i ? { ...x, quantite: x.quantite + 1 } : x) }))
              }} style={{ width: 26, height: 26, borderRadius: '50%', border: 'none', background: '#185FA5', color: 'white', cursor: 'pointer', fontSize: '14px' }}>+</button>
              <button onClick={() => {
                setEditMateriaux(prev => ({ ...prev, mats: prev.mats.filter((_, j) => j !== i) }))
              }} style={{ background: 'none', border: 'none', color: '#A32D2D', fontSize: '18px', cursor: 'pointer' }}>🗑️</button>
            </div>
          </div>
        ))}
        <button className="btn-primary" onClick={() => sauvegarderMateriaux(editMateriaux.rapportId, editMateriaux.mats)}>✓ Sauvegarder</button>
      </div>
    </div>
  )

  if (rapportDetail) {
    const t = totaux(rapportDetail)
    return (
      <div>
        <div className="top-bar">
          <div>
            <button onClick={() => { setRapportDetail(null); setEditRapportMode(false) }} style={{ background: 'none', border: 'none', color: '#185FA5', fontSize: '13px', cursor: 'pointer', padding: 0 }}>← Retour</button>
            <div style={{ fontWeight: 600, fontSize: '15px', marginTop: '4px' }}>Rapport</div>
            <div style={{ fontSize: '11px', color: '#888' }}>{rapportDetail.employe?.prenom} · {new Date(rapportDetail.date_travail + 'T12:00:00').toLocaleDateString('fr-CH')}</div>
          </div>
          <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
            <PageTopActions navigate={navigate} fallbackPath="/admin" onRefresh={refreshPage} refreshing={refreshingData} showBack={false} />
            {!editRapportMode && (
              <button onClick={() => { setEditRapportMode(true); setEditRapportDate(rapportDetail.date_travail); setEditRapportRemarques(rapportDetail.remarques || '') }}
                style={{ background: 'none', border: '1px solid #ddd', borderRadius: '6px', padding: '4px 8px', fontSize: '12px', cursor: 'pointer' }}>✏️</button>
            )}
            {!rapportDetail.valide && <span className="badge badge-amber">À valider</span>}
            {rapportDetail.valide && <span className="badge badge-green">✓ Validé</span>}
          </div>
        </div>
        <div className="page-content">
          {editRapportMode ? (
            <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div style={{ fontWeight: 600, fontSize: '14px' }}>Modifier le rapport</div>
              <div className="form-group">
                <label>Date</label>
                <input type="date" value={editRapportDate} onChange={e => setEditRapportDate(e.target.value)} />
              </div>
              <div className="form-group">
                <label>Remarques</label>
                <textarea rows={3} value={editRapportRemarques} onChange={e => setEditRapportRemarques(e.target.value)} style={{ resize: 'none' }} />
              </div>
              <div style={{ display: 'flex', gap: '10px' }}>
                <button className="btn-outline" style={{ flex: 1 }} onClick={() => setEditRapportMode(false)}>Annuler</button>
                <button className="btn-primary" style={{ flex: 1 }} onClick={sauvegarderRapportDetail}>✓ Sauvegarder</button>
              </div>
            </div>
          ) : (
            <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
                <div><div style={{ fontSize: '11px', color: '#888' }}>Employé</div><div style={{ fontWeight: 500 }}>{rapportDetail.employe?.prenom}</div></div>
                <div><div style={{ fontSize: '11px', color: '#888' }}>Date</div><div style={{ fontWeight: 500 }}>{new Date(rapportDetail.date_travail + 'T12:00:00').toLocaleDateString('fr-CH')}</div></div>
                <div><div style={{ fontSize: '11px', color: '#888' }}>Durée</div><div style={{ fontWeight: 500 }}>{fmtDuree(t.duree)}</div></div>
                {rapportDetail.depannage_id && <div><div style={{ fontSize: '11px', color: '#888' }}>Dépannage</div><div style={{ fontWeight: 500 }}>Bon #{rapportDetail.depannage_id}</div></div>}
              </div>
              {rapportDetail.remarques && <div style={{ padding: '8px', background: '#f9f9f9', borderRadius: '6px', fontSize: '13px' }}>💬 {rapportDetail.remarques}</div>}
            </div>
          )}

          <div className="card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
              <span style={{ fontWeight: 600, fontSize: '14px' }}>Matériaux</span>
              <button className="btn-primary btn-sm" style={{ width: 'auto' }} onClick={() => setEditMateriaux({ rapportId: rapportDetail.id, mats: [...(rapportDetail.rapport_materiaux || [])] })}>✏️ Modifier</button>
            </div>
            {(rapportDetail.rapport_materiaux || []).length === 0 && <div style={{ fontSize: '13px', color: '#888' }}>Aucun</div>}
            {(rapportDetail.rapport_materiaux || []).map((m, i) => (
              <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '7px 0', borderBottom: '1px solid #eee' }}>
                <div><div style={{ fontSize: '13px', fontWeight: 500 }}>{m.designation}</div><div style={{ fontSize: '11px', color: '#888' }}>{m.quantite} × {m.unite}</div></div>
                <div style={{ fontSize: '13px', fontWeight: 600 }}>{(m.quantite * (m.prix_net || 0)).toFixed(2)} CHF</div>
              </div>
            ))}
          </div>

          <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
              <div style={{ fontWeight: 600, fontSize: '14px' }}>Photos terrain</div>
              <span style={{ fontSize: '11px', color: '#888' }}>{adminPhotoSaving ? 'Mise a jour en cours...' : 'Admin: ajout et suppression actifs'}</span>
            </div>
            <PhotoInputPanel
              onFilesSelected={ajouterPhotosRapportAdmin}
              disabled={adminPhotoSaving}
              dropTitle="Glisser-deposer des photos ici"
              dropHint="ou cliquer pour selectionner plusieurs fichiers"
              dropNote={adminPhotoSaving ? 'Traitement en cours...' : 'Camera, galerie et depot utilisent le meme flux admin.'}
            />
            {(rapportDetail.rapport_photos || []).length === 0 && <div style={{ fontSize: '13px', color: '#888' }}>Aucune photo</div>}
            {(rapportDetail.rapport_photos || []).length > 0 && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '8px' }}>
                {(rapportDetail.rapport_photos || []).map(photo => (
                  <div key={photo.id} style={{ border: '1px solid #e6e6e6', borderRadius: '8px', overflow: 'hidden', background: '#fafafa' }}>
                    <a href={photo.signed_url || '#'} target="_blank" rel="noreferrer" style={{ textDecoration: 'none', color: 'inherit', display: 'block' }}>
                      {photo.signed_url && <img src={photo.signed_url} alt={photo.file_name} style={{ width: '100%', height: '120px', objectFit: 'cover', display: 'block' }} />}
                    </a>
                    <div style={{ padding: '8px', display: 'flex', justifyContent: 'space-between', gap: '8px', alignItems: 'center' }}>
                      <div style={{ fontSize: '11px', color: '#555', wordBreak: 'break-word' }}>{photo.file_name}</div>
                      <button type="button" onClick={() => supprimerPhotoRapportAdmin(photo)} disabled={adminPhotoSaving} style={{ border: '1px solid #f09595', background: 'white', color: '#A32D2D', borderRadius: '6px', padding: '4px 6px', fontSize: '11px', flexShrink: 0, cursor: adminPhotoSaving ? 'default' : 'pointer' }}>Supprimer</button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="card">
            <div style={{ fontWeight: 600, fontSize: '14px', marginBottom: '12px' }}>Estimation</div>
            {[
              [`M.O. (${fmtDuree(t.duree)} × ${TAUX} CHF)`, `${t.mo.toFixed(2)} CHF`],
              ['Matériaux', `${t.mat.toFixed(2)} CHF`],
              ['HT', `${t.ht.toFixed(2)} CHF`],
              ['TVA 8.1%', `${t.tva.toFixed(2)} CHF`]
            ].map(([l, v]) => (
              <div key={l} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', marginBottom: '6px' }}>
                <span style={{ color: '#666' }}>{l}</span><span style={{ fontWeight: 500 }}>{v}</span>
              </div>
            ))}
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '15px', fontWeight: 700, paddingTop: '8px', borderTop: '2px solid #185FA5', color: '#185FA5' }}>
              <span>TOTAL TTC</span><span>{t.ttc.toFixed(2)} CHF</span>
            </div>
          </div>

          <div style={{ display: 'flex', gap: '10px' }}>
            <button onClick={() => setConfirm({ type: 'rapport', data: rapportDetail })} className="btn-outline" style={{ flex: 1, color: '#A32D2D', borderColor: '#f09595' }}>🗑️ Supprimer</button>
            {!rapportDetail.valide && (
              <button onClick={() => valider(rapportDetail.id)} className="btn-primary" style={{ flex: 1 }}>✓ Valider</button>
            )}
          </div>
        </div>
      </div>
    )
  }

  if (vue === 'sous_dossiers' && chantierActif) return (
    <div>
      <div className="top-bar">
        <div>
          <button onClick={() => { setVue('chantiers'); setChantierActif(null) }} style={{ background: 'none', border: 'none', color: '#185FA5', fontSize: '13px', cursor: 'pointer', padding: 0 }}>← Retour</button>
          <div style={{ fontWeight: 600, fontSize: '15px', marginTop: '4px' }}>{chantierActif.nom}</div>
          <div style={{ fontSize: '11px', color: '#888' }}>{getChantierClientLabel(chantierActif)} · {chantierActif.adresse || '—'}</div>
        </div>
        <div style={{ display: 'flex', gap: '6px' }}>
          <PageTopActions navigate={navigate} fallbackPath="/admin" onRefresh={refreshPage} refreshing={refreshingData} showBack={false} />
          <button onClick={() => { setRenommerItem({ type: 'chantier', data: chantierActif }); setNouveauNom(chantierActif.nom) }} style={{ background: 'none', border: '1px solid #ddd', borderRadius: '6px', padding: '4px 8px', fontSize: '12px', cursor: 'pointer' }}>✏️</button>
          <button onClick={() => setConfirm({ type: 'chantier', data: chantierActif })} style={{ background: 'none', border: '1px solid #f09595', borderRadius: '6px', padding: '4px 8px', fontSize: '12px', cursor: 'pointer', color: '#A32D2D' }}>🗑️</button>
        </div>
      </div>
      <div className="page-content">
        <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px' }}>
            <div>
              <div style={{ fontWeight: 600, fontSize: '14px' }}>Chantier</div>
              <div style={{ fontSize: '11px', color: '#888', marginTop: '4px' }}>Documents employé prévus en mode sans prix</div>
            </div>
            <span style={{ ...getChantierStatusBadgeStyle(chantierActif.statut), borderRadius: '6px', padding: '4px 8px', fontSize: '10px', fontWeight: 700, whiteSpace: 'nowrap' }}>
              {chantierActif.statut || CHANTIER_STATUT_A_CONFIRMER}
            </span>
          </div>
          {getNextChantierStatusAction(chantierActif.statut) && (
            <button
              className="btn-outline btn-sm"
              style={{ width: 'auto', alignSelf: 'flex-start' }}
              onClick={() => {
                const nextAction = getNextChantierStatusAction(chantierActif.statut)
                if (nextAction) mettreAJourStatutChantier(chantierActif, nextAction.nextStatus)
              }}
            >
              {getNextChantierStatusAction(chantierActif.statut)?.label}
            </button>
          )}
        </div>
        <div className="card">
          {false && !depannagesLoading && !depannagesError && depannages.length > 0 && (
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', padding: '4px 2px 0', flexWrap: 'wrap' }}>
              <div>
                <div style={{ fontSize: '11px', color: '#888', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Classement dossiers</div>
                <div style={{ fontSize: '14px', fontWeight: 700, color: '#185FA5' }}>RÃ©gie â†’ mois â†’ dÃ©pannages</div>
              </div>
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                <span className="badge badge-blue">{depannagesFiltres.length} dÃ©pannage{depannagesFiltres.length > 1 ? 's' : ''}</span>
                <span className="badge badge-amber">{depannagesGroupes.length} rÃ©gie{depannagesGroupes.length > 1 ? 's' : ''}</span>
              </div>
            </div>
          )}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
            <span style={{ fontWeight: 600, fontSize: '14px' }}>Sous-dossiers</span>
            <button className="btn-primary btn-sm" style={{ width: 'auto' }} onClick={() => setNouveauSd(true)}>+ Nouveau</button>
          </div>
          {nouveauSd && (
            <div style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
              <input placeholder="Nom du sous-dossier" value={nouveauSdNom} onChange={e => setNouveauSdNom(e.target.value)}
                style={{ flex: 1, padding: '8px', borderRadius: '6px', border: '1px solid #ddd', fontSize: '13px' }} />
              <button className="btn-primary btn-sm" style={{ width: 'auto' }} onClick={async () => {
                if (!nouveauSdNom.trim()) return
                const existe = sousDossiers.find(s => s.nom.toLowerCase() === nouveauSdNom.toLowerCase())
                if (existe) { alert(`"${nouveauSdNom}" existe déjà !`); return }
                try {
                  await supabaseSafe(supabase.from('sous_dossiers').insert({ chantier_id: chantierActif.id, nom: nouveauSdNom }))
                  setNouveauSdNom(''); setNouveauSd(false); chargerSousDossiers(chantierActif.id)
                } catch (error) {
                  alert('Erreur lors de la création du sous-dossier. Veuillez réessayer.')
                }
              }}>OK</button>
            </div>
          )}
          {sousDossiers.length === 0 && !nouveauSd && <div style={{ fontSize: '13px', color: '#888' }}>Aucun sous-dossier</div>}
          {sousDossiers.map(sd => {
            const rapportsCount = (sd.rapports || []).length
            const photosCount = (sd.rapports || []).reduce((sum, rapport) => sum + (rapport.rapport_photos || []).length, 0)
            return (
              <div key={sd.id} style={{ borderTop: '1px solid #eee', paddingTop: '12px', marginTop: '12px' }}>
                <div className="row-item" style={{ marginBottom: '8px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flex: 1 }}>
                    <div style={{ width: 34, height: 34, borderRadius: '8px', background: '#E6F1FB', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '16px' }}>📁</div>
                    <div style={{ fontWeight: 500, fontSize: '13px' }}>{sd.nom}</div>
                  </div>
                  <div style={{ display: 'flex', gap: '4px' }}>
                    <button onClick={() => { setRenommerItem({ type: 'sous_dossier', data: sd }); setNouveauNom(sd.nom) }} style={{ background: 'none', border: '1px solid #ddd', borderRadius: '6px', padding: '4px 6px', fontSize: '11px', cursor: 'pointer' }}>✏️</button>
                    <button onClick={() => setConfirm({ type: 'sous_dossier', data: sd })} style={{ background: 'none', border: '1px solid #f09595', borderRadius: '6px', padding: '4px 6px', fontSize: '11px', cursor: 'pointer', color: '#A32D2D' }}>🗑️</button>
                  </div>
                </div>
                <div style={{ display: 'grid', gap: '8px' }}>
                  <button type="button" className="row-item" style={{ background: '#fff', width: '100%', textAlign: 'left', cursor: 'pointer' }} onClick={() => { setSousDossierActif(sd); chargerRapports(sd.id); setVue('rapports') }}>
                    <div>
                      <div style={{ fontWeight: 500, fontSize: '12px' }}>Rapports</div>
                      <div style={{ fontSize: '11px', color: '#888' }}>{rapportsCount} rapport(s)</div>
                    </div>
                    <span style={{ color: '#185FA5' }}>›</span>
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
                      <div style={{ fontSize: '11px', color: '#888' }}>Visibilite employe: {chantierActif.documents_visibilite_employe === 'complet' ? 'complet' : 'sans prix'}</div>
                    </div>
                    <button type="button" className="btn-outline btn-sm" style={{ width: 'auto' }} onClick={() => basculerVisibiliteDocuments(chantierActif)}>Modifier</button>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )

  if (vue === 'rapports' && sousDossierActif) return (
    <div>
      <div className="top-bar">
        <div>
          <button onClick={() => { setVue('sous_dossiers'); setSousDossierActif(null) }} style={{ background: 'none', border: 'none', color: '#185FA5', fontSize: '13px', cursor: 'pointer', padding: 0 }}>← Retour</button>
          <div style={{ fontWeight: 600, fontSize: '15px', marginTop: '4px' }}>{sousDossierActif.nom}</div>
        </div>
        <PageTopActions navigate={navigate} fallbackPath="/admin" onRefresh={refreshPage} refreshing={refreshingData} showBack={false} />
      </div>
      <div className="page-content">
        <div className="card">
          {false && !depannagesLoading && !depannagesError && depannages.length > 0 && (
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', padding: '4px 2px 0', flexWrap: 'wrap' }}>
              <div>
                <div style={{ fontSize: '11px', color: '#888', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Classement dossiers</div>
                <div style={{ fontSize: '14px', fontWeight: 700, color: '#185FA5' }}>RÃ©gie â†’ mois â†’ dÃ©pannages</div>
              </div>
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                <span className="badge badge-blue">{depannagesFiltres.length} dÃ©pannage{depannagesFiltres.length > 1 ? 's' : ''}</span>
                <span className="badge badge-amber">{depannagesGroupes.length} rÃ©gie{depannagesGroupes.length > 1 ? 's' : ''}</span>
              </div>
            </div>
          )}
          {rapports.length === 0 && <div style={{ fontSize: '13px', color: '#888' }}>Aucun rapport</div>}
          {rapports.map(r => {
            const t = totaux(r)
            return (
              <div key={r.id} className="row-item" style={{ cursor: 'pointer' }} onClick={() => setRapportDetail(r)}>
                <div>
                  <div style={{ fontSize: '13px', fontWeight: 500 }}>{r.employe?.prenom} · {new Date(r.date_travail + 'T12:00:00').toLocaleDateString('fr-CH')}</div>
                  <div style={{ fontSize: '11px', color: '#888' }}>{fmtDuree(t.duree)} · {(r.rapport_materiaux || []).length} articles · {(r.rapport_photos || []).length} photo(s)</div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: '13px', fontWeight: 600 }}>{t.ttc.toFixed(0)} CHF</div>
                  {r.valide ? <span className="badge badge-green" style={{ fontSize: '10px' }}>✓</span> : <span className="badge badge-amber" style={{ fontSize: '10px' }}>En attente</span>}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )

  if (vue === 'chantiers') return (
    <div>
      <div className="top-bar">
        <div>
          <button onClick={() => setVue('accueil')} style={{ background: 'none', border: 'none', color: '#185FA5', fontSize: '13px', cursor: 'pointer', padding: 0 }}>← Retour</button>
          <div style={{ fontWeight: 600, fontSize: '15px', marginTop: '4px' }}>Chantiers</div>
        </div>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <PageTopActions navigate={navigate} fallbackPath="/admin" onRefresh={refreshPage} refreshing={refreshingData} showBack={false} />
          <button className="btn-primary btn-sm" style={{ width: 'auto' }} onClick={() => setAjoutChantier(true)}>+ Nouveau</button>
        </div>
      </div>
      <div className="page-content">
        {ajoutChantier && (
          <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <div style={{ fontWeight: 600, fontSize: '14px' }}>Nouveau chantier</div>
            <input placeholder="Régie / client" value={nouveauClientNom} onChange={e => setNouveauClientNom(e.target.value)}
              style={{ padding: '8px', borderRadius: '6px', border: '1px solid #ddd', fontSize: '13px' }} />
            <input placeholder="Nom *" value={nouveauNomChantier} onChange={e => setNouveauNomChantier(e.target.value)}
              style={{ padding: '8px', borderRadius: '6px', border: '1px solid #ddd', fontSize: '13px' }} />
            <input placeholder="Adresse" value={nouvelleAdresse} onChange={e => setNouvelleAdresse(e.target.value)}
              style={{ padding: '8px', borderRadius: '6px', border: '1px solid #ddd', fontSize: '13px' }} />
            <div style={{ display: 'flex', gap: '8px' }}>
              <button className="btn-outline" style={{ flex: 1 }} onClick={() => { setAjoutChantier(false); setNouveauClientNom(''); setNouveauNomChantier(''); setNouvelleAdresse('') }}>Annuler</button>
              <button className="btn-primary" style={{ flex: 1 }} onClick={async () => {
                if (!nouveauNomChantier.trim()) return
                const existe = chantiers.find(c => c.nom.toLowerCase() === nouveauNomChantier.toLowerCase())
                if (existe) { alert(`"${nouveauNomChantier}" existe déjà !`); return }
                try {
                  await supabaseSafe(supabase.from('chantiers').insert({
                    client_nom: nouveauClientNom.trim() || null,
                    nom: nouveauNomChantier,
                    adresse: nouvelleAdresse,
                    statut: CHANTIER_STATUT_A_CONFIRMER,
                    documents_visibilite_employe: 'sans_prix'
                  }))
                  setAjoutChantier(false); setNouveauClientNom(''); setNouveauNomChantier(''); setNouvelleAdresse(''); chargerTout()
                } catch (error) {
                  alert('Erreur lors de la création du chantier. Veuillez réessayer.')
                }
              }}>Créer</button>
            </div>
          </div>
        )}
        <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {chantiers.length === 0 && <div style={{ fontSize: '13px', color: '#888' }}>Aucun chantier</div>}
          {chantiersGroupes.map(group => (
            <div key={group.clientLabel} style={{ borderTop: '1px solid #eee', paddingTop: '12px' }}>
              <div style={{ fontSize: '12px', fontWeight: 700, color: '#444', marginBottom: '10px' }}>{group.clientLabel}</div>
              {group.items.map(c => {
                const badgeStyle = getChantierStatusBadgeStyle(c.statut)
                const nextAction = getNextChantierStatusAction(c.statut)
                return (
                  <div key={c.id} className="row-item">
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flex: 1, cursor: 'pointer' }} onClick={() => { setChantierActif(c); chargerSousDossiers(c.id); setVue('sous_dossiers') }}>
                      <div style={{ width: 34, height: 34, borderRadius: '8px', background: '#E6F1FB', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '16px' }}>🏗️</div>
                      <div>
                        <div style={{ fontWeight: 500, fontSize: '13px' }}>{c.nom}</div>
                        <div style={{ fontSize: '11px', color: '#888' }}>{c.adresse || '—'}</div>
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: '4px', alignItems: 'center', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                      <span style={{ ...badgeStyle, borderRadius: '6px', padding: '4px 8px', fontSize: '10px', fontWeight: 700, whiteSpace: 'nowrap' }}>
                        {c.statut || CHANTIER_STATUT_A_CONFIRMER}
                      </span>
                      {nextAction && (
                        <button className="btn-outline btn-sm" style={{ width: 'auto' }} onClick={() => mettreAJourStatutChantier(c, nextAction.nextStatus)}>
                          {nextAction.label}
                        </button>
                      )}
                      <button onClick={() => { setRenommerItem({ type: 'chantier', data: c }); setNouveauNom(c.nom) }} style={{ background: 'none', border: '1px solid #ddd', borderRadius: '6px', padding: '4px 6px', fontSize: '11px', cursor: 'pointer' }}>✏️</button>
                      <button onClick={() => setConfirm({ type: 'chantier', data: c })} style={{ background: 'none', border: '1px solid #f09595', borderRadius: '6px', padding: '4px 6px', fontSize: '11px', cursor: 'pointer', color: '#A32D2D' }}>🗑️</button>
                    </div>
                  </div>
                )
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  )

  if (vue === 'depannages') {
    const rechercheActive = search.trim()

    return (
    <div>
      <div className="top-bar">
        <div>
          <button onClick={() => setVue('accueil')} style={{ background: 'none', border: 'none', color: '#185FA5', fontSize: '13px', cursor: 'pointer', padding: 0 }}>← Retour</button>
          <div style={{ fontWeight: 600, fontSize: '15px', marginTop: '4px' }}>Dépannages</div>
        </div>
        <PageTopActions navigate={navigate} fallbackPath="/admin" onRefresh={refreshPage} refreshing={refreshingData} showBack={false} />
      </div>
      <div className="page-content">
        <input
          type="search"
          placeholder="Rechercher une régie, une adresse, une remarque ou un bon #..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid #ddd', fontSize: '13px' }}
        />
        <select
          value={regieFilter}
          disabled={!regieFilterAvailable}
          onChange={e => {
            const value = e.target.value
            setRegieFilter(value)
            chargerDepannages(search, value, dateFilter, regies, regieFilterAvailable)
          }}
          style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid #ddd', fontSize: '13px', background: 'white' }}
        >
          <option value="">{regieFilterAvailable ? 'Toutes les régies' : 'Filtre régie indisponible'}</option>
          {regies.map(r => (
            <option key={r.id} value={r.id}>{r.nom || 'Régie non définie'}</option>
          ))}
        </select>
        <input
          type="date"
          value={dateFilter}
          onChange={e => {
            const value = e.target.value
            setDateFilter(value)
            chargerDepannages(search, regieFilter, value)
          }}
          style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid #ddd', fontSize: '13px' }}
        />
        <button
          type="button"
          onClick={resetDepannagesFilters}
          style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid #ddd', background: 'white', fontSize: '13px', cursor: 'pointer' }}
        >
          Réinitialiser les filtres
        </button>
        <div className="card">
          {depannagesLoading && <div style={{ fontSize: '13px', color: '#888' }}>Chargement des dépannages...</div>}
          {!depannagesLoading && !depannagesError && depannagesGroupes.length > 0 && (
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', padding: '4px 2px 0', flexWrap: 'wrap' }}>
              <div>
                <div style={{ fontSize: '11px', color: '#888', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Classement dossiers</div>
                <div style={{ fontSize: '14px', fontWeight: 700, color: '#185FA5' }}>Régie → mois → dépannages</div>
              </div>
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                <span className="badge badge-blue">{depannagesFiltres.length} dépannage{depannagesFiltres.length > 1 ? 's' : ''}</span>
                <span className="badge badge-amber">{depannagesGroupes.length} régie{depannagesGroupes.length > 1 ? 's' : ''}</span>
              </div>
            </div>
          )}
          {!depannagesLoading && depannagesError && <div style={{ fontSize: '13px', color: '#A32D2D' }}>{depannagesError}</div>}
          {!depannagesLoading && !depannagesError && depannages.length === 0 && (
            <div style={{ padding: '28px 18px', borderRadius: '14px', background: '#F7F9FC', border: '1px dashed #D6DEE8', textAlign: 'center' }}>
              <div style={{ fontSize: '14px', fontWeight: 700, color: '#185FA5' }}>Aucun dépannage</div>
              <div style={{ fontSize: '12px', color: '#666', marginTop: '6px' }}>Les dossiers apparaîtront ici, classés par régie puis par mois.</div>
            </div>
          )}
          {!depannagesLoading && !depannagesError && depannages.length > 0 && depannagesFiltres.length === 0 && (
            <div style={{ padding: '28px 18px', borderRadius: '14px', background: '#F7F9FC', border: '1px dashed #D6DEE8', textAlign: 'center' }}>
              <div style={{ fontSize: '14px', fontWeight: 700, color: '#185FA5' }}>Aucun resultat</div>
              <div style={{ fontSize: '12px', color: '#666', marginTop: '6px' }}>
                {rechercheActive
                  ? `Aucun depannage ne correspond a "${search.trim()}".`
                  : 'Aucun depannage ne correspond aux filtres actuels.'}
              </div>
            </div>
          )}
          {false && !depannagesLoading && !depannagesError && depannages.length > 0 && depannagesFiltres.length === 0 && (
            <div style={{ padding: '28px 18px', borderRadius: '14px', background: '#F7F9FC', border: '1px dashed #D6DEE8', textAlign: 'center' }}>
              <div style={{ fontSize: '14px', fontWeight: 700, color: '#185FA5' }}>Aucun rÃ©sultat</div>
              <div style={{ fontSize: '12px', color: '#666', marginTop: '6px' }}>
                {rechercheActive
                  ? `Aucun dÃ©pannage ne correspond Ã  "${search.trim()}".`
                  : 'Aucun dÃ©pannage ne correspond aux filtres actuels.'}
              </div>
            </div>
          )}
          {!depannagesLoading && !depannagesError && depannagesGroupes.map(groupe => (
            <div
              key={groupe.nom}
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '12px',
                marginTop: '12px',
                padding: '14px',
                borderRadius: '18px',
                border: '1px solid #DCE6F2',
                background: 'linear-gradient(180deg, #F9FBFF 0%, #FFFFFF 100%)',
                boxShadow: '0 8px 24px rgba(24,95,165,0.05)'
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                <div>
                  <div style={{ fontSize: '11px', color: '#6D7B8A', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Regie</div>
                  <div style={{ fontSize: '16px', fontWeight: 800, color: '#185FA5' }}>{groupe.nom}</div>
                </div>
                <span className="badge badge-blue">{groupe.count} dossier{groupe.count > 1 ? 's' : ''}</span>
              </div>
              {groupe.moisOrdre.map(mois => (
                <div
                  key={`${groupe.nom}-${mois}`}
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '8px',
                    padding: '12px',
                    borderRadius: '14px',
                    background: '#FFFFFF',
                    border: '1px solid #E7EDF5'
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                    <div style={{ fontSize: '13px', fontWeight: 700, color: '#374151' }}>{mois}</div>
                    <div style={{ fontSize: '11px', color: '#7A8795' }}>{groupe.mois[mois].length} depannage{groupe.mois[mois].length > 1 ? 's' : ''}</div>
                  </div>
                  {groupe.mois[mois].map(d => {
                    const mat = (d.rapport_materiaux || []).reduce((s, m) => s + m.quantite * (m.prix_net || 0), 0)
                    const mo = (d._duree || 0) * TAUX
                    const ttc = (mat + mo) * 1.081
                    const dateLabel = d.date_travail ? new Date(d.date_travail + 'T12:00:00').toLocaleDateString('fr-CH') : 'Date non définie'
                    const statut = depannageStatut(d)
                    const responsable = depannageResponsableLabel(d)
                    const intervenantsCount = depannageIntervenantsCount(d)
                    return (
                      <div
                        key={d.id}
                        className="row-item"
                        role="button"
                        tabIndex={0}
                        onClick={() => navigate(`/admin/depannage/${d.id}`, {
                          state: {
                            fromAdminDepannages: true,
                            depannagesSearch: search,
                            depannagesRegieFilter: regieFilter,
                            depannagesDateFilter: dateFilter
                          }
                        })}
                        onKeyDown={e => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault()
                            navigate(`/admin/depannage/${d.id}`, {
                              state: {
                                fromAdminDepannages: true,
                                depannagesSearch: search,
                                depannagesRegieFilter: regieFilter,
                                depannagesDateFilter: dateFilter
                              }
                            })
                          }
                        }}
                        style={{
                          alignItems: 'flex-start',
                          cursor: 'pointer',
                          gap: '10px',
                          padding: '12px',
                          borderRadius: '14px',
                          border: '1px solid #EEF2F7',
                          background: '#FBFCFE'
                        }}
                      >
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '3px', minWidth: 0 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                            <span style={{ fontSize: '12px', fontWeight: 700, color: '#333' }}>{dateLabel}</span>
                            <span className={`badge ${depannageStatutBadgeClass(statut)}`}>{statut}</span>
                          </div>
                          <div style={{ fontSize: '13px', fontWeight: 600 }}>{depannageClientAdresse(d)}</div>
                          <div style={{ fontSize: '12px', color: '#555' }}>{depannageDescription(d)}</div>
                          <div style={{ fontSize: '11px', color: '#888' }}>
                            {d.employe?.prenom || 'Employé non défini'} · {fmtDuree(Number(d._duree) || 0)} · Bon #{d.id}
                          </div>
                          <div style={{ fontSize: '11px', color: '#555' }}>
                            Statut : {statut} · Resp. : {responsable} · Intervenants : {intervenantsCount}
                          </div>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
                          <div style={{ fontSize: '13px', fontWeight: 600 }}>{ttc.toFixed(0)} CHF</div>
                          <span style={{ color: '#185FA5', fontSize: '16px', lineHeight: 1 }}>›</span>
                        </div>
                      </div>
                    )
                  })}
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
  }

  if (vue === 'a_verifier') {
    return (
      <div>
        <div className="top-bar">
          <div>
            <button onClick={() => setVue('accueil')} style={{ background: 'none', border: 'none', color: '#185FA5', fontSize: '13px', cursor: 'pointer', padding: 0 }}>← Retour</button>
            <div style={{ fontWeight: 600, fontSize: '15px', marginTop: '4px' }}>À vérifier</div>
            <div style={{ fontSize: '11px', color: '#888' }}>Rapports et validations en attente</div>
          </div>
          <PageTopActions navigate={navigate} fallbackPath="/admin" onRefresh={refreshPage} refreshing={refreshingData} showBack={false} />
        </div>
        <div className="page-content">
          <div className="card">
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '12px', alignItems: 'center' }}>
              <span style={{ fontWeight: 600, fontSize: '14px' }}>Rapports à valider</span>
              <span className="badge badge-amber">{rapportsEnAttente.length}</span>
            </div>
            {rapportsEnAttente.length === 0 && (
              <div style={{ textAlign: 'center', color: '#888', fontSize: '13px', padding: '20px 0' }}>
                Aucun rapport en attente de validation.
              </div>
            )}
            {rapportsEnAttente.map(r => {
              const t = totaux(r)
              return (
                <div key={r.id} className="row-item" style={{ cursor: 'pointer' }} onClick={() => setRapportDetail(r)}>
                  <div>
                    <div style={{ fontWeight: 500, fontSize: '13px' }}>{r.sous_dossiers?.chantiers?.nom} › {r.sous_dossiers?.nom}</div>
                    <div style={{ fontSize: '11px', color: '#888' }}>{r.employe?.prenom} · {fmtDuree(t.duree)} · {new Date(r.date_travail + 'T12:00:00').toLocaleDateString('fr-CH')}</div>
                  </div>
                  <span style={{ color: '#185FA5' }}>›</span>
                </div>
              )
            })}
          </div>
        </div>
      </div>
    )
  }

  if (vue === 'calendrier') {
    const { year, month } = calMois
    const daysInMonth = new Date(year, month + 1, 0).getDate()
    const firstWeekday = (new Date(year, month, 1).getDay() + 6) % 7
    const rapsFiltrés = calEmployeFiltre === 'tous' ? calRapports : calRapports.filter(r => String(r.employe_id) === String(calEmployeFiltre))
    const depsFiltrés = calEmployeFiltre === 'tous' ? calDepannages : calDepannages.filter(d => String(d.employe_id) === String(calEmployeFiltre))
    const rapsJour = calJour ? rapsFiltrés.filter(r => r.date_travail === calJour) : []
    const depsJour = calJour ? depsFiltrés.filter(d => d.date_travail === calJour) : []

    return (
      <div>
        <div className="top-bar">
          <div>
            <button onClick={() => setVue('accueil')} style={{ background: 'none', border: 'none', color: '#185FA5', fontSize: '13px', cursor: 'pointer', padding: 0 }}>← Retour</button>
          <div style={{ fontWeight: 600, fontSize: '15px', marginTop: '4px' }}>Calendrier</div>
        </div>
        <PageTopActions navigate={navigate} fallbackPath="/admin" onRefresh={refreshPage} refreshing={refreshingData} showBack={false} />
      </div>
        <div className="page-content">
          <select value={calEmployeFiltre} onChange={e => { setCalEmployeFiltre(e.target.value); setCalJour(null) }}
            style={{ padding: '8px 10px', borderRadius: '8px', border: '1px solid #e2e2e2', fontSize: '13px', background: 'white' }}>
            <option value="tous">Tous les employés</option>
            {employes.map(e => <option key={e.id} value={e.id}>{e.prenom}</option>)}
          </select>
          <div className="card" style={{ padding: '12px 14px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
              <button onClick={() => changerMois(-1)} style={{ background: 'none', border: '1px solid #e2e2e2', borderRadius: '6px', padding: '4px 10px', cursor: 'pointer', fontSize: '16px', color: '#185FA5' }}>‹</button>
              <span style={{ fontWeight: 600, fontSize: '14px' }}>{MOIS_FR[month]} {year}</span>
              <button onClick={() => changerMois(1)} style={{ background: 'none', border: '1px solid #e2e2e2', borderRadius: '6px', padding: '4px 10px', cursor: 'pointer', fontSize: '16px', color: '#185FA5' }}>›</button>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '2px', marginBottom: '4px' }}>
              {JOURS_FR.map((j, i) => <div key={i} style={{ textAlign: 'center', fontSize: '11px', color: '#888', fontWeight: 600, padding: '2px 0' }}>{j}</div>)}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '2px' }}>
              {Array.from({ length: firstWeekday }).map((_, i) => <div key={`e-${i}`} />)}
              {Array.from({ length: daysInMonth }, (_, i) => i + 1).map(day => {
                const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
                const hasRap = rapsFiltrés.some(r => r.date_travail === dateStr)
                const hasDep = depsFiltrés.some(d => d.date_travail === dateStr)
                const isSelected = calJour === dateStr
                const dotColor = hasRap && hasDep ? '#27ae60' : hasRap ? '#185FA5' : hasDep ? '#d68910' : null
                return (
                  <div key={day} onClick={() => setCalJour(isSelected ? null : dateStr)}
                    style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '5px 2px', borderRadius: '6px', cursor: 'pointer', background: isSelected ? '#185FA5' : 'transparent', minHeight: '36px' }}>
                    <span style={{ fontSize: '13px', fontWeight: isSelected ? 700 : 400, color: isSelected ? 'white' : '#1a1a1a' }}>{day}</span>
                    {dotColor && <div style={{ width: 6, height: 6, borderRadius: '50%', background: isSelected ? 'white' : dotColor, marginTop: '2px' }} />}
                  </div>
                )
              })}
            </div>
          </div>
          <div style={{ display: 'flex', gap: '14px', justifyContent: 'center', flexWrap: 'wrap' }}>
            {[['#185FA5', 'Chantier'], ['#d68910', 'Dépannage'], ['#27ae60', 'Les deux']].map(([color, label]) => (
              <div key={label} style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                <div style={{ width: 8, height: 8, borderRadius: '50%', background: color }} />
                <span style={{ fontSize: '11px', color: '#666' }}>{label}</span>
              </div>
            ))}
          </div>
          {calJour && (rapsJour.length > 0 || depsJour.length > 0) && (
            <div className="card">
              <div style={{ fontWeight: 600, fontSize: '14px', marginBottom: '10px' }}>
                {new Date(calJour + 'T12:00:00').toLocaleDateString('fr-CH', { weekday: 'long', day: 'numeric', month: 'long' })}
              </div>
              {rapsJour.map(r => (
                <div key={r.id} style={{ padding: '8px 0', borderBottom: '1px solid #eee' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '2px' }}>
                    <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#185FA5', flexShrink: 0 }} />
                    <span style={{ fontSize: '13px', fontWeight: 500 }}>{r.employe?.prenom}</span>
                    <span className="badge badge-blue" style={{ fontSize: '10px' }}>Chantier</span>
                  </div>
                  <div style={{ fontSize: '12px', color: '#555', paddingLeft: '14px' }}>{r.sous_dossiers?.chantiers?.nom}{r.sous_dossiers?.nom ? ` › ${r.sous_dossiers.nom}` : ''}</div>
                </div>
              ))}
              {depsJour.map(d => (
                <div key={d.id} style={{ padding: '8px 0', borderBottom: '1px solid #eee' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '2px' }}>
                    <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#d68910', flexShrink: 0 }} />
                    <span style={{ fontSize: '13px', fontWeight: 500 }}>{d.employe?.prenom}</span>
                    <span className="badge badge-amber" style={{ fontSize: '10px' }}>Dépannage</span>
                  </div>
                  <div style={{ fontSize: '12px', color: '#555', paddingLeft: '14px' }}>{d.adresse}</div>
                  <div style={{ fontSize: '11px', color: '#888', paddingLeft: '14px' }}>{fmtDuree(Number(d._duree) || 0)}</div>
                </div>
              ))}
            </div>
          )}
          {calJour && rapsJour.length === 0 && depsJour.length === 0 && (
            <div style={{ textAlign: 'center', color: '#888', fontSize: '13px', padding: '16px 0' }}>Aucune activité ce jour</div>
          )}
        </div>
      </div>
    )
  }

  if (vue === 'vacances') return (
    <div>
      <div className="top-bar">
        <div>
          <button onClick={() => ouvrirVueAdmin('employes')} style={{ background: 'none', border: 'none', color: '#185FA5', fontSize: '13px', cursor: 'pointer', padding: 0 }}>← Retour employés</button>
          <div style={{ fontWeight: 600, fontSize: '15px', marginTop: '4px' }}>Vacances</div>
          <div style={{ fontSize: '11px', color: '#888' }}>Demandes, quotas et périodes spéciales</div>
        </div>
        <PageTopActions navigate={navigate} fallbackPath="/admin" onRefresh={refreshPage} refreshing={refreshingData} showBack={false} />
      </div>
      <div className="page-content">
        {vacancesError && <div style={{ background: '#FCEBEB', border: '1px solid #f09595', borderRadius: '8px', padding: '10px 14px', fontSize: '12px', color: '#A32D2D' }}>{vacancesError}</div>}
        {vacancesLoading && <div style={{ textAlign: 'center', color: '#888', fontSize: '13px', padding: '20px 0' }}>Chargement...</div>}

        <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          <div style={{ fontWeight: 600, fontSize: '14px' }}>Compteurs {new Date().getFullYear()}</div>
          {employes.length === 0 && <div style={{ fontSize: '13px', color: '#888' }}>Aucun employé</div>}
          {employes.map(emp => {
            const s = vacancesStats[emp.id] || { quota: emp.vacances_quota_annuel || 20, pris: 0, attente: 0 }
            const restant = Math.max(0, s.quota - s.pris)
            return (
              <div key={emp.id} style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: '8px', alignItems: 'center', padding: '8px 0', borderTop: '1px solid #eee' }}>
                <div>
                  <div style={{ fontSize: '13px', fontWeight: 600 }}>{emp.prenom}</div>
                  <div style={{ fontSize: '11px', color: '#888' }}>{s.pris} j. pris · {s.attente} j. en attente · quota {s.quota} j.</div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <input
                    type="number"
                    min="0"
                    defaultValue={s.quota}
                    onBlur={e => modifierQuotaVacances(emp.id, e.target.value)}
                    style={{ width: '58px', padding: '5px 6px', fontSize: '12px' }}
                    title="Quota annuel"
                  />
                  <span className="badge badge-blue">{restant} j. restants</span>
                </div>
              </div>
            )
          })}
        </div>

        <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          <div style={{ fontWeight: 600, fontSize: '14px' }}>Demandes</div>
          {vacancesAdmin.length === 0 && <div style={{ fontSize: '13px', color: '#888' }}>Aucune demande</div>}
          {vacancesAdmin.map(v => {
            const jours = Number(v.jours_ouvrables || countJoursOuvrables(v.date_debut, v.date_fin))
            return (
              <div key={v.id} style={{ padding: '10px 0', borderTop: '1px solid #eee', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: '10px' }}>
                  <div>
                    <div style={{ fontSize: '13px', fontWeight: 600 }}>{v.employe?.prenom || 'Employé'}</div>
                    <div style={{ fontSize: '11px', color: '#888' }}>
                      {new Date(v.date_debut + 'T12:00:00').toLocaleDateString('fr-CH')} → {new Date(v.date_fin + 'T12:00:00').toLocaleDateString('fr-CH')} · {jours} j.
                    </div>
                    {v.commentaire && <div style={{ fontSize: '11px', color: '#777', fontStyle: 'italic', marginTop: '2px' }}>{v.commentaire}</div>}
                  </div>
                  <span className={`badge ${v.statut === 'accepte' ? 'badge-green' : v.statut === 'refuse' ? 'badge-red' : 'badge-amber'}`}>{v.statut}</span>
                </div>
                {v.statut === 'en_attente' && (
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button className="btn-outline" style={{ flex: 1, color: '#A32D2D', borderColor: '#f09595' }} onClick={() => deciderVacances(v, 'refuse')}>Refuser</button>
                    <button className="btn-primary" style={{ flex: 1, background: '#3B6D11' }} onClick={() => deciderVacances(v, 'accepte')}>Accepter</button>
                  </div>
                )}
              </div>
            )
          })}
        </div>

        <form onSubmit={creerBlocageVacances} className="card" style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          <div style={{ fontWeight: 600, fontSize: '14px' }}>Ajouter une période admin</div>
          <div className="form-group">
            <label>Type</label>
            <select value={blocageForm.type} onChange={e => setBlocageForm(p => ({ ...p, type: e.target.value }))}>
              <option value="blocage">Blocage strict</option>
              <option value="fermeture_collective">Fermeture collective</option>
            </select>
          </div>
          <div className="grid2">
            <div className="form-group">
              <label>Début</label>
              <input type="date" value={blocageForm.date_debut} onChange={e => setBlocageForm(p => ({ ...p, date_debut: e.target.value }))} required />
            </div>
            <div className="form-group">
              <label>Fin</label>
              <input type="date" value={blocageForm.date_fin} min={blocageForm.date_debut} onChange={e => setBlocageForm(p => ({ ...p, date_fin: e.target.value }))} required />
            </div>
          </div>
          <div className="form-group">
            <label>Commentaire</label>
            <input value={blocageForm.motif} onChange={e => setBlocageForm(p => ({ ...p, motif: e.target.value }))} placeholder={blocageForm.type === 'blocage' ? 'Ex: chantier critique' : 'Ex: fermeture de Noël'} required />
          </div>
          <button className="btn-primary" type="submit">Enregistrer la période</button>
        </form>

        <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <div style={{ fontWeight: 600, fontSize: '14px' }}>Périodes admin</div>
          {blocagesVacances.length === 0 && <div style={{ fontSize: '13px', color: '#888' }}>Aucune période admin</div>}
          {blocagesVacances.map(b => (
            <div key={b.id} style={{ display: 'flex', justifyContent: 'space-between', gap: '8px', alignItems: 'center', paddingTop: '8px', borderTop: '1px solid #eee' }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                  <span className={`badge ${(b.type || 'blocage') === 'blocage' ? 'badge-red' : 'badge-green'}`}>
                    {(b.type || 'blocage') === 'blocage' ? 'Blocage' : 'Fermeture collective'}
                  </span>
                  <div style={{ fontSize: '13px', fontWeight: 500 }}>{b.motif}</div>
                </div>
                <div style={{ fontSize: '11px', color: '#888' }}>{new Date(b.date_debut + 'T12:00:00').toLocaleDateString('fr-CH')} → {new Date(b.date_fin + 'T12:00:00').toLocaleDateString('fr-CH')}</div>
              </div>
              <button className="btn-outline btn-sm" style={{ width: 'auto', color: '#A32D2D' }} onClick={() => supprimerBlocageVacances(b.id)}>Retirer</button>
            </div>
          ))}
        </div>
      </div>
    </div>
  )

  if (vue === 'employes') return (
    <div>
      <div className="top-bar">
        <div>
          <button onClick={() => setVue('accueil')} style={{ background: 'none', border: 'none', color: '#185FA5', fontSize: '13px', cursor: 'pointer', padding: 0 }}>← Retour</button>
          <div style={{ fontWeight: 600, fontSize: '15px', marginTop: '4px' }}>Employés</div>
          <div style={{ fontSize: '11px', color: '#888' }}>Fiches, heures et vacances</div>
        </div>
        <PageTopActions navigate={navigate} fallbackPath="/admin" onRefresh={refreshPage} refreshing={refreshingData} showBack={false} />
      </div>
      <div className="page-content">
        <div className="card" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px' }}>
          <div>
            <div style={{ fontWeight: 600, fontSize: '14px' }}>Vacances</div>
            <div style={{ fontSize: '12px', color: '#666', marginTop: '2px' }}>Demandes, quotas et périodes spéciales des employés</div>
          </div>
          <button className="btn-outline btn-sm" style={{ width: 'auto', flexShrink: 0 }} onClick={() => ouvrirVueAdmin('vacances')}>
            Ouvrir
          </button>
        </div>
        {empLoading && (
          <div style={{ textAlign: 'center', padding: '40px 0' }}>
            <div style={{ fontSize: '13px', color: '#888' }}>Chargement…</div>
          </div>
        )}
        {!empLoading && employes.length === 0 && (
          <div style={{ textAlign: 'center', color: '#888', fontSize: '13px', padding: '40px 0' }}>Aucun employé</div>
        )}
        {!empLoading && employes.map(emp => {
          const s = empStats[emp.id] || { heureMois: 0, heurePrev: 0, chantiersCount: 0 }
          return (
            <div key={emp.id} className="card" style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '14px' }}
              onClick={() => {
                const moisActuel = (() => { const d = new Date(); return { year: d.getFullYear(), month: d.getMonth() } })()
                setEmpDetail(emp)
                setEmpDetailMois(moisActuel)
                setFicheTab('heures')
                setEmpCharteData(null)
                chargerDetailEmploye(emp.id, moisActuel)
                setVue('employe_detail')
              }}>
              <div style={{ width: 44, height: 44, borderRadius: '50%', background: '#E6F1FB', color: '#185FA5', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: '14px', flexShrink: 0 }}>
                {emp.initiales || emp.prenom?.slice(0, 2).toUpperCase()}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 600, fontSize: '14px', marginBottom: '4px' }}>{emp.prenom}</div>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px' }}>
                  <span style={{ fontSize: '13px', fontWeight: 500, color: '#185FA5' }}>{fmtDuree(s.heureMois)} ce mois</span>
                  <span style={{ fontSize: '11px', color: '#999' }}>{fmtDuree(s.heurePrev)} mois passé</span>
                </div>
                <div style={{ fontSize: '11px', color: '#888', marginTop: '2px' }}>
                  {s.chantiersCount} chantier{s.chantiersCount !== 1 ? 's' : ''} ce mois
                </div>
              </div>
              <span style={{ color: '#185FA5', fontSize: '16px' }}>›</span>
            </div>
          )
        })}
      </div>
    </div>
  )

  // ─── Fiche employé (tâche 7) ──────────────────────────────────────────────
  if (vue === 'employe_detail' && empDetail) {
    const TABS = ['Heures', 'Feuille hebdo', 'Charte', 'Absences']

    const totalRapports = empDetailRapports.reduce((s, r) => s + (r._duree || 0), 0)
    const totalDeps = empDetailDepannages.reduce((s, d) => s + Number(d._duree || 0), 0)
    const totalGeneral = totalRapports + totalDeps

    const parChantier = {}
    for (const r of empDetailRapports) {
      const nom = r.sous_dossiers?.chantiers?.nom || 'Chantier inconnu'
      if (!parChantier[nom]) parChantier[nom] = []
      parChantier[nom].push(r)
    }

    return (
      <div>
        <div className="top-bar">
          <div>
            <button onClick={() => setVue('employes')} style={{ background: 'none', border: 'none', color: '#185FA5', fontSize: '13px', cursor: 'pointer', padding: 0 }}>← Retour</button>
            <div style={{ fontWeight: 600, fontSize: '15px', marginTop: '4px' }}>{empDetail.prenom}</div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <PageTopActions navigate={navigate} fallbackPath="/admin" onRefresh={refreshPage} refreshing={refreshingData} showBack={false} />
            <div style={{ width: 40, height: 40, borderRadius: '50%', background: '#E6F1FB', color: '#185FA5', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: '13px' }}>
              {empDetail.initiales || empDetail.prenom?.slice(0, 2).toUpperCase()}
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div style={{ background: 'white', borderBottom: '1px solid #e2e2e2', padding: '8px 14px', display: 'flex', gap: '6px', overflowX: 'auto' }}>
          {TABS.map(tab => (
            <button key={tab} onClick={() => {
              setFicheTab(tab)
              if (tab === 'Charte' && !empCharteData) chargerCharteEmploye(empDetail.id)
            }} style={{
              padding: '6px 14px', borderRadius: '20px', fontSize: '12px', fontWeight: 500,
              whiteSpace: 'nowrap', cursor: 'pointer', border: 'none',
              background: ficheTab === tab ? '#185FA5' : '#f0f0f0',
              color: ficheTab === tab ? 'white' : '#444'
            }}>{tab}</button>
          ))}
        </div>

        <div className="page-content">

          {/* ── Tab Heures ─────────────────────────────────────────────────── */}
          {ficheTab === 'Heures' && <>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'white', borderRadius: '10px', border: '1px solid #e2e2e2', padding: '10px 14px' }}>
              <button onClick={() => {
                const d = new Date(empDetailMois.year, empDetailMois.month - 1, 1)
                const m = { year: d.getFullYear(), month: d.getMonth() }
                setEmpDetailMois(m); chargerDetailEmploye(empDetail.id, m)
              }} style={{ background: 'none', border: '1px solid #e2e2e2', borderRadius: '6px', padding: '4px 10px', cursor: 'pointer', fontSize: '16px', color: '#185FA5' }}>‹</button>
              <span style={{ fontWeight: 600, fontSize: '14px' }}>{MOIS_FR[empDetailMois.month]} {empDetailMois.year}</span>
              <button onClick={() => {
                const d = new Date(empDetailMois.year, empDetailMois.month + 1, 1)
                const m = { year: d.getFullYear(), month: d.getMonth() }
                setEmpDetailMois(m); chargerDetailEmploye(empDetail.id, m)
              }} style={{ background: 'none', border: '1px solid #e2e2e2', borderRadius: '6px', padding: '4px 10px', cursor: 'pointer', fontSize: '16px', color: '#185FA5' }}>›</button>
            </div>

            {Object.keys(parChantier).length === 0 && empDetailDepannages.length === 0 && (
              <div style={{ textAlign: 'center', color: '#888', fontSize: '13px', padding: '40px 0' }}>Aucune activité ce mois</div>
            )}

            {Object.entries(parChantier).map(([nomChantier, raps]) => {
              const totalChantier = raps.reduce((s, r) => s + (r._duree || 0), 0)
              return (
                <div key={nomChantier} className="card">
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{ fontSize: '15px' }}>🏗️</span>
                      <span style={{ fontWeight: 600, fontSize: '13px' }}>{nomChantier}</span>
                    </div>
                    <span style={{ fontSize: '13px', fontWeight: 600, color: '#185FA5' }}>{fmtDuree(totalChantier)}</span>
                  </div>
                  {raps.map((r, i) => (
                    <div key={r.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0', borderTop: i === 0 ? '1px solid #eee' : '1px solid #f5f5f5' }}>
                      <div style={{ fontSize: '12px', color: '#555' }}>
                        {new Date(r.date_travail + 'T12:00:00').toLocaleDateString('fr-CH', { weekday: 'short', day: 'numeric', month: 'short' })}
                        {r.sous_dossiers?.nom && <span style={{ color: '#999', marginLeft: '6px' }}>· {r.sous_dossiers.nom}</span>}
                      </div>
                      <span style={{ fontSize: '12px', fontWeight: 500, color: '#333' }}>{fmtDuree(r._duree || 0)}</span>
                    </div>
                  ))}
                </div>
              )
            })}

            {empDetailDepannages.length > 0 && (
              <div className="card">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ fontSize: '15px' }}>⚡</span>
                    <span style={{ fontWeight: 600, fontSize: '13px' }}>Dépannages</span>
                  </div>
                  <span style={{ fontSize: '13px', fontWeight: 600, color: '#d68910' }}>{fmtDuree(totalDeps)}</span>
                </div>
                {empDetailDepannages.map((d, i) => (
                  <div key={d.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0', borderTop: i === 0 ? '1px solid #eee' : '1px solid #f5f5f5' }}>
                    <div style={{ fontSize: '12px', color: '#555' }}>
                      {new Date(d.date_travail + 'T12:00:00').toLocaleDateString('fr-CH', { weekday: 'short', day: 'numeric', month: 'short' })}
                      {d.adresse && <span style={{ color: '#999', marginLeft: '6px' }}>· {d.adresse}</span>}
                    </div>
                    <span style={{ fontSize: '12px', fontWeight: 500, color: '#333' }}>{fmtDuree(Number(d._duree) || 0)}</span>
                  </div>
                ))}
              </div>
            )}

            {totalGeneral > 0 && (
              <div style={{ background: '#E6F1FB', borderRadius: '10px', padding: '14px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontWeight: 600, fontSize: '14px', color: '#185FA5' }}>Total {MOIS_FR[empDetailMois.month]}</span>
                <span style={{ fontWeight: 700, fontSize: '18px', color: '#185FA5' }}>{fmtDuree(totalGeneral)}</span>
              </div>
            )}
          </>}

          {/* ── Tab Feuille hebdo (tâche 5) ─────────────────────────────── */}
          {ficheTab === 'Feuille hebdo' && (
            <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div style={{ fontWeight: 600, fontSize: '14px' }}>Feuille hebdomadaire PDF</div>
              <div className="grid2">
                <div className="form-group">
                  <label>Semaine (1–53)</label>
                  <input type="number" min="1" max="53" value={pdfSemaine}
                    onChange={e => setPdfSemaine(e.target.value)} placeholder="ex: 15" />
                </div>
                <div className="form-group">
                  <label>Année</label>
                  <input type="number" min="2024" max="2099" value={pdfAnnee}
                    onChange={e => setPdfAnnee(Number(e.target.value))} />
                </div>
              </div>
              <button className="btn-primary" disabled={!pdfSemaine || pdfLoading} onClick={genererFeuilleHebdo}>
                {pdfLoading ? 'Génération...' : '⬇ Télécharger PDF'}
              </button>
              <div style={{ fontSize: '11px', color: '#888' }}>
                Le PDF inclut chantiers, dépannages et heures supplémentaires de la semaine, détaillés par jour.
              </div>
            </div>
          )}

          {/* ── Tab Charte (tâche 6) ────────────────────────────────────── */}
          {ficheTab === 'Charte' && (
            empCharteLoading ? (
              <div style={{ textAlign: 'center', color: '#888', fontSize: '13px', padding: '30px 0' }}>Chargement…</div>
            ) : (
              <>
                <div className="card">
                  <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                    <div style={{ width: 48, height: 48, borderRadius: '50%', background: empCharteData?.charte ? '#EAF3DE' : '#FCEBEB', color: empCharteData?.charte ? '#3B6D11' : '#A32D2D', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '22px', flexShrink: 0 }}>
                      {empCharteData?.charte ? '✓' : '!'}
                    </div>
                    <div>
                      <div style={{ fontWeight: 600, fontSize: '14px' }}>
                        {empCharteData?.charte ? 'Charte signée' : 'Charte non signée'}
                      </div>
                      {empCharteData?.charte && (
                        <div style={{ fontSize: '12px', color: '#888', marginTop: '2px' }}>
                          Signée le {new Date(empCharteData.charte.acceptee_le).toLocaleDateString('fr-CH', { day: '2-digit', month: '2-digit', year: 'numeric' })}
                        </div>
                      )}
                      {!empCharteData?.charte && (
                        <div style={{ fontSize: '12px', color: '#888', marginTop: '2px' }}>En attente de signature</div>
                      )}
                    </div>
                  </div>
                </div>

                {empCharteData?.charte && empCharteData?.sig?.signature_base64 && (
                  <button className="btn-primary" onClick={genererPDFCharteAdmin}>
                    📄 Télécharger le PDF signé
                  </button>
                )}

                {empCharteData?.charte && (
                  <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    <div style={{ fontWeight: 600, fontSize: '13px', color: '#A32D2D' }}>Actions admin</div>
                    <div style={{ fontSize: '12px', color: '#888' }}>
                      La réinitialisation supprime la charte et la signature. L'employé devra re-signer lors de sa prochaine connexion.
                    </div>
                    <button
                      onClick={() => reinitialiserCharte(empDetail.id)}
                      style={{ background: 'white', color: '#A32D2D', border: '1px solid #f09595', borderRadius: '6px', padding: '10px', fontSize: '13px', fontWeight: 500, cursor: 'pointer' }}
                    >
                      🔄 Réinitialiser — remettre à "non signé"
                    </button>
                  </div>
                )}

                {!empCharteData?.charte && (
                  <div style={{ textAlign: 'center', color: '#888', fontSize: '13px', padding: '20px 0' }}>
                    Aucune action disponible tant que la charte n'est pas signée.
                  </div>
                )}
              </>
            )
          )}

          {/* ── Tab Absences ─────────────────────────────────────────────── */}
          {ficheTab === 'Absences' && (() => {
            const absTypeLabel = { maladie: 'Maladie', accident: 'Accident', autre: 'Autre' }
            const absStatutLabel = { en_attente: 'En attente', approuve: 'Approuvé', refuse: 'Refusé' }
            return (
              <div className="card">
                <div style={{ fontWeight: 600, fontSize: '14px', marginBottom: '12px' }}>Absences déclarées</div>
                {empAbsences.length === 0 && (
                  <div style={{ fontSize: '13px', color: '#888' }}>Aucune absence enregistrée</div>
                )}
                {empAbsences.map((a, i) => (
                  <div key={a.id || i} style={{ padding: '10px 0', borderBottom: i < empAbsences.length - 1 ? '1px solid #eee' : 'none' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                      <div>
                        <div style={{ fontSize: '13px', fontWeight: 500 }}>{absTypeLabel[a.type] || a.type || 'Absence'}</div>
                        <div style={{ fontSize: '11px', color: '#888', marginTop: '2px' }}>
                          {a.date_debut ? new Date(a.date_debut + 'T12:00:00').toLocaleDateString('fr-CH') : '—'}
                          {a.date_fin ? ` → ${new Date(a.date_fin + 'T12:00:00').toLocaleDateString('fr-CH')}` : ''}
                        </div>
                        {a.commentaire && <div style={{ fontSize: '11px', color: '#999', fontStyle: 'italic', marginTop: '2px' }}>{a.commentaire}</div>}
                      </div>
                      <span className={`badge ${a.statut === 'approuve' ? 'badge-green' : a.statut === 'refuse' ? 'badge-red' : 'badge-amber'}`}>
                        {absStatutLabel[a.statut] || a.statut}
                      </span>
                    </div>
                    {a.statut === 'en_attente' && (
                      <div style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
                        <button
                          className="btn-primary btn-sm"
                          style={{ flex: 1 }}
                          onClick={() => approuverAbsence(a.id)}
                        >
                          ✓ Approuver
                        </button>
                        <button
                          className="btn-outline btn-sm"
                          style={{ flex: 1, color: '#A32D2D', borderColor: '#f09595' }}
                          onClick={() => refuserAbsence(a.id)}
                        >
                          ✕ Refuser
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )
          })()}

        </div>
      </div>
    )
  }

  // ─── Accueil — 4 entrées (tâche 7) ───────────────────────────────────────
  return (
    <div>
      <div className="top-bar">
        <div>
          <div style={{ fontWeight: 600, fontSize: '15px' }}>Bonjour, {user?.prenom}</div>
          <div style={{ fontSize: '11px', color: '#888' }}>Tableau de bord admin</div>
        </div>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <PageTopActions navigate={navigate} fallbackPath="/admin" onRefresh={refreshPage} refreshing={refreshingData} showBack={false} />
          {corbeille.length > 0 && (
            <button onClick={() => setVueCorbeille(true)} style={{ background: 'none', border: '1px solid #ddd', borderRadius: '6px', padding: '4px 8px', fontSize: '12px', cursor: 'pointer' }}>
              🗑️ {corbeille.length}
            </button>
          )}
          <span className="badge badge-amber">Admin</span>
          <button className="avatar" style={{ background: '#FAEEDA', color: '#BA7517' }} onClick={deconnecter}>{user?.initiales}</button>
        </div>
      </div>
      <div className="page-content">
        {adminError && <div style={{ background: '#FCEBEB', border: '1px solid #f09595', borderRadius: '8px', padding: '10px 14px', fontSize: '12px', color: '#A32D2D' }}>{adminError}</div>}
        {rapportsEnAttente.length > 0 && (
          <div className="card">
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '12px' }}>
              <span style={{ fontWeight: 600, fontSize: '14px' }}>⏳ À valider</span>
              <span className="badge badge-amber">{rapportsEnAttente.length}</span>
            </div>
            {rapportsEnAttente.map(r => {
              const t = totaux(r)
              return (
                <div key={r.id} className="row-item" style={{ cursor: 'pointer' }} onClick={() => setRapportDetail(r)}>
                  <div>
                    <div style={{ fontWeight: 500, fontSize: '13px' }}>{r.sous_dossiers?.chantiers?.nom} › {r.sous_dossiers?.nom}</div>
                    <div style={{ fontSize: '11px', color: '#888' }}>{r.employe?.prenom} · {fmtDuree(t.duree)} · {new Date(r.date_travail + 'T12:00:00').toLocaleDateString('fr-CH')}</div>
                  </div>
                  <span style={{ color: '#185FA5' }}>›</span>
                </div>
              )
            })}
          </div>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
          <button onClick={() => setVue('chantiers')} style={{ background: '#E6F1FB', border: '1px solid #185FA5', borderRadius: '12px', padding: '20px 12px', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '28px' }}>🏗️</span>
            <span style={{ fontWeight: 600, fontSize: '14px', color: '#185FA5' }}>Chantiers</span>
            <span style={{ fontSize: '11px', color: '#666' }}>{chantiers.length} actifs</span>
          </button>
          <button onClick={() => setVue('depannages')} style={{ background: '#FEF3E2', border: '1px solid #f39c12', borderRadius: '12px', padding: '20px 12px', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '28px' }}>⚡</span>
            <span style={{ fontWeight: 600, fontSize: '14px', color: '#d68910' }}>Dépannages</span>
            <span style={{ fontSize: '11px', color: '#666' }}>{depannages.length} au total</span>
          </button>
          <button onClick={() => setVue('a_verifier')}
            style={{ background: '#E8F5F2', border: '1px solid #157A6E', borderRadius: '12px', padding: '20px 12px', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '28px' }}>✓</span>
            <span style={{ fontWeight: 600, fontSize: '14px', color: '#157A6E' }}>À vérifier</span>
            <span style={{ fontSize: '11px', color: '#666' }}>{rapportsEnAttente.length} validation(s)</span>
          </button>
          <button onClick={() => ouvrirVueAdmin('employes')}
            style={{ background: '#F3F4F6', border: '1px solid #9CA3AF', borderRadius: '12px', padding: '20px 12px', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '28px' }}>☰</span>
            <span style={{ fontWeight: 600, fontSize: '14px', color: '#4B5563' }}>Autres</span>
            <span style={{ fontSize: '11px', color: '#666' }}>Employés et vacances</span>
          </button>
          <button onClick={() => ouvrirVueAdmin('calendrier')}
            style={{ background: '#EAF3DE', border: '1px solid #3B6D11', borderRadius: '12px', padding: '20px 12px', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px', gridColumn: '1 / -1' }}>
            <span style={{ fontSize: '28px' }}>📅</span>
            <span style={{ fontWeight: 600, fontSize: '14px', color: '#3B6D11' }}>Calendrier du mois</span>
            <span style={{ fontSize: '11px', color: '#666' }}>Chantiers, dépannages, absences</span>
          </button>
        </div>
      </div>
    </div>
  )
}
