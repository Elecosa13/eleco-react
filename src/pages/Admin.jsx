import React, { useEffect, useMemo, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import PageHeader from '../components/PageHeader'
import PageTopActions from '../components/PageTopActions'
import ListItem from '../components/ListItem'
import PhotoInputPanel from '../components/PhotoInputPanel'
import { supabase } from '../lib/supabase'
import { supabaseSafe } from '../lib/supabaseSafe'
import { useAuth } from '../lib/auth-context'
import { usePageRefresh } from '../lib/refresh'
import { safeConfirm } from '../lib/safe-browser'
import {
  CHANTIER_STATUT_A_CONFIRMER,
  chantierBelongsToIntermediaire,
  getChantierClientLabel,
  getChantierStatusBadgeStyle,
  getChantierStatusLabel,
  getNextChantierStatusAction,
  groupChantiersByClient,
  isStandaloneIntermediaireRecord
} from '../services/chantiers.service'

const TAUX = 115
const MOIS_FR = ['Janvier','Février','Mars','Avril','Mai','Juin','Juillet','Août','Septembre','Octobre','Novembre','Décembre']
const JOURS_FR = ['L','M','M','J','V','S','D']
const JOURS_LONG = ['Lundi','Mardi','Mercredi','Jeudi','Vendredi','Samedi','Dimanche']
const STATUT_INTERVENTION_FAITE = 'Intervention faite'
const STATUT_RAPPORT_RECU = 'Rapport reçu'
const STATUT_FACTURE_A_PREPARER = 'Facture à préparer'
const STATUT_FACTURE_PRETE = 'Facture prête'
const ADMIN_VUES_OUVERTES = ['chantiers', 'depannages', 'catalogue', 'calendrier', 'vacances', 'employes']

function getAdminVueInitiale(location) {
  if (ADMIN_VUES_OUVERTES.includes(location.state?.vue)) return location.state.vue
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
  // TODO: table manquante rapport_photos
  return list.map(rapport => ({ ...rapport, rapport_photos: [] }))
}

function mapLigneFacturableToMateriau(ligne) {
  return {
    id: ligne.id,
    rapport_id: ligne.rapport_id,
    dossier_id: ligne.dossier_id,
    designation: ligne.description,
    description: ligne.description,
    quantite: Number(ligne.quantite || 0),
    prix_net: Number(ligne.prix_unitaire || 0),
    prix_unitaire: Number(ligne.prix_unitaire || 0),
    montant_ht: Number(ligne.montant_ht || 0)
  }
}

async function hydraterRapportsMateriaux(rapports) {
  const list = Array.from(rapports || [])
  const ids = list.map(rapport => rapport.id).filter(Boolean)
  if (ids.length === 0) return list.map(rapport => ({ ...rapport, rapport_materiaux: [] }))

  const { data, error } = await supabase
    .from('lignes_facturables')
    .select('id, dossier_id, rapport_id, type, description, quantite, prix_unitaire, montant_ht, statut')
    .in('rapport_id', ids)

  if (error) {
    console.error('Erreur chargement lignes_facturables rapports', error)
    return list.map(rapport => ({ ...rapport, rapport_materiaux: [] }))
  }

  const byRapport = {}
  for (const ligne of data || []) {
    if (ligne.type !== 'materiel') continue
    const key = String(ligne.rapport_id)
    if (!byRapport[key]) byRapport[key] = []
    byRapport[key].push(mapLigneFacturableToMateriau(ligne))
  }

  return list.map(rapport => ({
    ...rapport,
    rapport_materiaux: byRapport[String(rapport.id)] || []
  }))
}

async function hydraterRapportsDurees(rapports, employeId = null, dateFrom = null, dateTo = null) {
  const list = Array.from(rapports || [])
  if (list.length === 0) return list

  return list.map(rapport => ({
    ...rapport,
    date_travail: rapport.date_intervention,
    remarques: rapport.notes,
    valide: rapport.statut === 'valide',
    _duree: Number(rapport.heures || 0) + Number(rapport.heures_deplacement || 0)
  }))
}

async function hydraterDepannagesDurees(depannages, employeId = null, dateFrom = null, dateTo = null) {
  const list = Array.from(depannages || [])
  if (list.length === 0) return list

  return list.map(depannage => ({
    ...depannage,
    date_travail: depannage.created_at?.slice(0, 10),
    adresse: depannage.adresse_chantier,
    _duree: 0
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

function isMissingChantierColumnError(error, column) {
  const message = String(error?.message || '')
  return (
    error?.code === '42703' ||
    error?.code === 'PGRST204' ||
    message.includes(`chantiers.${column}`) ||
    message.includes(`'${column}' column`) ||
    message.includes(`column chantiers.${column} does not exist`)
  )
}

function chantierSchemaErrorMessage(error) {
  if (isMissingChantierColumnError(error, 'statut')) {
    return "La colonne dossiers.statut est absente dans la base Supabase."
  }
  return error?.message || 'Erreur Supabase inconnue.'
}

function logAdminDashboardQueryError(name, error) {
  if (!error) return
  console.error(`[Admin dashboard] ${name}`, {
    message: error.message || null,
    details: error.details || null,
    hint: error.hint || null,
    code: error.code || null
  })
}

function isAdminDashboardFallbackError(error) {
  return ['PGRST200', 'PGRST205', '42703'].includes(error?.code)
}

async function adminDashboardQuery(name, queryPromise, fallback = []) {
  const { data, error } = await queryPromise
  if (error) {
    logAdminDashboardQueryError(name, error)
    if (isAdminDashboardFallbackError(error)) return fallback
    throw error
  }
  return data
}

function normaliserEmploye(row) {
  const prenom = String(row?.prenom || row?.nom || '').trim()
  return {
    ...row,
    prenom,
    initiales: row?.initiales || prenom.slice(0, 2).toUpperCase()
  }
}

function normaliserRoleUtilisateur(role) {
  return String(role || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
}

function normaliserNomUtilisateur(row) {
  return String(row?.prenom || row?.nom || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
}

function isEmployeAdmin(row) {
  const role = normaliserRoleUtilisateur(row?.role)
  if (['employe', 'employee', 'ouvrier'].includes(role)) return true
  if (['admin', 'administrateur'].includes(role)) return false

  return isEmployeEleco(row)
}

function isEmployeEleco(row) {
  return ['paulo', 'bruno', 'ivo', 'noylan'].includes(normaliserNomUtilisateur(row))
}

function isMissingUtilisateurColumnError(error, column) {
  const message = String(error?.message || '')
  return (
    error?.code === '42703' ||
    error?.code === 'PGRST204' ||
    message.includes(`utilisateurs.${column}`) ||
    message.includes(`'${column}' column`) ||
    message.includes(`column utilisateurs.${column} does not exist`)
  )
}

async function chargerEmployesAdmin() {
  const utilisateursQueries = [
    {
      name: 'utilisateurs_prenom_role_quota',
      run: () => supabase.from('utilisateurs').select('id, prenom, role, initiales, vacances_quota_annuel').order('prenom')
    },
    {
      name: 'utilisateurs_nom_role_quota',
      run: () => supabase.from('utilisateurs').select('id, nom, role, initiales, vacances_quota_annuel').order('nom')
    },
    {
      name: 'utilisateurs_prenom_role',
      run: () => supabase.from('utilisateurs').select('id, prenom, role, initiales').order('prenom')
    },
    {
      name: 'utilisateurs_nom_role',
      run: () => supabase.from('utilisateurs').select('id, nom, role, initiales').order('nom')
    }
  ]

  for (const query of utilisateursQueries) {
    const { data, error } = await query.run()
    if (error) {
      if (
        isMissingUtilisateurColumnError(error, 'prenom') ||
        isMissingUtilisateurColumnError(error, 'nom') ||
        isMissingUtilisateurColumnError(error, 'role') ||
        isMissingUtilisateurColumnError(error, 'vacances_quota_annuel')
      ) {
        logAdminDashboardQueryError(query.name, error)
        continue
      }
      throw error
    }

    const employes = (data || []).filter(isEmployeAdmin).map(normaliserEmploye)
    if (employes.length > 0) return employes
  }

  const { data: profils, error: profilsError } = await supabase
    .from('profils_publics')
    .select('id, prenom, initiales')
    .order('prenom')

  if (profilsError) throw profilsError

  return (profils || [])
    .filter(isEmployeEleco)
    .map(normaliserEmploye)
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
  const [chantierSchema, setChantierSchema] = useState({
    statut: true,
    clientNom: true,
    documentsVisibiliteEmploye: true
  })
  const [depannages, setDepannages] = useState([])
  const [depannagesLoading, setDepannagesLoading] = useState(false)
  const [depannagesError, setDepannagesError] = useState('')
  const [depannagesOnglet, setDepannagesOnglet] = useState('en_cours')
  const [adminError, setAdminError] = useState('')
  const [search, setSearch] = useState(adminNavigationState.depannagesSearch || '')
  const [regies, setRegies] = useState([])
  const [ajoutRegie, setAjoutRegie] = useState(false)
  const [selectedRegieNom, setSelectedRegieNom] = useState(null)
  const [selectedAnnee, setSelectedAnnee] = useState(null)
  const [selectedMois, setSelectedMois] = useState(null)
  const [ajoutDepannage, setAjoutDepannage] = useState(false)
  const [nouveauDepannageDate, setNouveauDepannageDate] = useState('')
  const [nouveauDepannageBon, setNouveauDepannageBon] = useState('')
  const [nouveauDepannageAdresse, setNouveauDepannageAdresse] = useState('')
  const [ajoutDepannageErreur, setAjoutDepannageErreur] = useState('')
  const [ajoutDepannageSaving, setAjoutDepannageSaving] = useState(false)
  const [ajoutRegieErreur, setAjoutRegieErreur] = useState('')
  const [ajoutRegieSaving, setAjoutRegieSaving] = useState(false)
  const [nouvelleRegieNom, setNouvelleRegieNom] = useState('')
  const [intermediaires, setIntermediaires] = useState([])
  const [intermediaireChantiersActif, setIntermediaireChantiersActif] = useState(null)
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
  const [rapportsV1, setRapportsV1] = useState([])
  const [rapportsV1Loading, setRapportsV1Loading] = useState(false)
  const [corbeille, setCorbeille] = useState([])
  const [vueCorbeille, setVueCorbeille] = useState(false)
  const [confirm, setConfirm] = useState(null)
  const [renommerItem, setRenommerItem] = useState(null)
  const [nouveauNom, setNouveauNom] = useState('')
  const [nouveauNomChantier, setNouveauNomChantier] = useState('')
  const [nouveauClientNom, setNouveauClientNom] = useState('')
  const [nouvelIntermediaireId, setNouvelIntermediaireId] = useState('')
  const [nouvelIntermediaireNom, setNouvelIntermediaireNom] = useState('')
  const [nouvelleAdresse, setNouvelleAdresse] = useState('')
  const [ajoutChantier, setAjoutChantier] = useState(false)
  const [ajoutIntermediaire, setAjoutIntermediaire] = useState(false)
  const [creationChantierErreur, setCreationChantierErreur] = useState('')
  // TODO: remplacer par colonne `protege boolean default false` sur la table chantiers
  // Le cadenas localStorage n'est pas fiable (par poste, pas en DB)
  const [nouveauSd, setNouveauSd] = useState(false)
  const [nouveauSdNom, setNouveauSdNom] = useState('')

  // Matériaux
  const [editMateriaux, setEditMateriaux] = useState(null)
  const [ajoutArticleVue, setAjoutArticleVue] = useState(false)
  const [rechercheArticle, setRechercheArticle] = useState('')
  const [catFiltre, setCatFiltre] = useState('Tous')
  const [articleManuel, setArticleManuel] = useState({ designation: '', unite: '', prix: '0', quantite: 1 })

  // Catalogue admin (vue gestion)
  const [catalogueAdmin, setCatalogueAdmin] = useState([])
  const [catalogueAdminLoading, setCatalogueAdminLoading] = useState(false)
  const [catalogueAdminError, setCatalogueAdminError] = useState('')
  const [catalogueAdminSearch, setCatalogueAdminSearch] = useState('')
  const [catalogueAdminCatFiltre, setCatalogueAdminCatFiltre] = useState('Tous')
  const [catalogueAdminEdit, setCatalogueAdminEdit] = useState(null)
  const [catalogueAdminAjout, setCatalogueAdminAjout] = useState(false)
  const [catalogueAdminNouvel, setCatalogueAdminNouvel] = useState({ nom: '', unite: '', prix_net: '', categorie: '' })
  const [catalogueAdminSaving, setCatalogueAdminSaving] = useState(false)

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
    if (vue === 'catalogue') chargerCatalogueAdmin()
  }, [vue])

  const refreshPage = usePageRefresh(async () => {
    setRefreshingData(true)
    try {
      if (vue === 'calendrier') return await chargerCalendrier(calMois)
      if (vue === 'vacances') return await chargerVacancesAdmin()
      if (vue === 'employes') return await chargerStatsEmployes()
      if (vue === 'catalogue') return await chargerCatalogueAdmin()
      if (vue === 'employe_detail' && empDetail) return await chargerDetailEmploye(empDetail.id, empDetailMois)
      if (rapportDetail?.id) return await rechargerRapportDetail(rapportDetail.id)
      if (vue === 'sous_dossiers' && chantierActif) return await chargerSousDossiers(chantierActif.id)
      if (vue === 'rapports' && sousDossierActif) return await chargerRapports(sousDossierActif.id)
      if (vue === 'rapports_v1') return await chargerRapportsV1()
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

    let query = supabase.from('dossiers')
      .select('id, numero_affaire, type, client_id, statut, description, adresse_chantier, created_by, created_at, clients(id, nom)')
      .eq('type', 'depannage')

    if (regieValue) {
      query = query.eq('client_id', regieValue)
    }

    if (dateValue) {
      query = query.gte('created_at', `${dateValue}T00:00:00`).lte('created_at', `${dateValue}T23:59:59`)
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
        ? {}
        : {}
      if (ids.length > 0) {
        const [{ data: mats, error: matsError }, { data: linkedRapports, error: linkedRapportsError }] = await Promise.all([
          supabase
            .from('lignes_facturables')
            .select('*')
            .in('dossier_id', ids),
          supabase
            .from('rapports')
            .select('id, dossier_id, heures, heures_deplacement')
            .in('dossier_id', ids)
        ])
        if (requestId !== depannagesRequestRef.current) return

        if (linkedRapportsError) {
          console.error('Erreur chargement rapports lies depannages', linkedRapportsError)
        } else {
          for (const rapport of linkedRapports || []) {
            linkedRapportsByDepannage[String(rapport.dossier_id)] = rapport
          }
        }

        const rapportIds = (linkedRapports || []).map(rapport => rapport.id).filter(Boolean)
        let linkedMateriaux = []

        if (rapportIds.length > 0) {
          const { data: matsLinked, error: matsLinkedError } = await supabase
            .from('lignes_facturables')
            .select('*')
            .in('rapport_id', rapportIds)
          if (requestId !== depannagesRequestRef.current) return

          if (matsLinkedError) {
            console.error('Erreur chargement materiaux rapports depannages', matsLinkedError)
          } else {
            linkedMateriaux = (matsLinked || []).map(mapLigneFacturableToMateriau)
          }
        }

        for (const rapport of linkedRapports || []) {
          materiauxByDepannage[String(rapport.dossier_id)] = linkedMateriaux.filter(mat => String(mat.rapport_id) === String(rapport.id))
        }

        if (!matsError) {
          for (const mat of mats || []) {
            const key = String(mat.dossier_id)
            if (materiauxByDepannage[key]?.length) continue
            if (!materiauxByDepannage[key]) materiauxByDepannage[key] = []
            materiauxByDepannage[key].push(mapLigneFacturableToMateriau(mat))
          }
        } else {
          console.error('Erreur chargement materiaux depannages', matsError)
        }
      }

      setDepannages((data || []).map(depannage => ({
        ...depannage,
        date_travail: depannage.created_at?.slice(0, 10),
        adresse: depannage.adresse_chantier,
        employe: null,
        _duree: Number(linkedRapportsByDepannage[String(depannage.id)]?.heures || 0) + Number(linkedRapportsByDepannage[String(depannage.id)]?.heures_deplacement || 0),
        regie: depannage.clients || (depannage.client_id ? regiesById[String(depannage.client_id)] || null : null),
        rapport_lie: linkedRapportsByDepannage[String(depannage.id)] || null,
        rapport_materiaux: materiauxByDepannage[String(depannage.id)] || []
      })))
    } catch (error) {
      if (requestId !== depannagesRequestRef.current) return
      logAdminDashboardQueryError('depannages', error)
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
      const chantierColumns = await verifierColonnesChantiers()
      setChantierSchema(chantierColumns)

      const rap = await adminDashboardQuery('rapports_attente', supabase.from('rapports')
        .select('id, dossier_id, employe_id, date_intervention, heures, heures_deplacement, materiaux_notes, notes, statut, created_at, employe:employe_id(prenom)')
        .neq('statut', 'valide').order('date_intervention', { ascending: false }))

      if (rap && rap.length > 0) {
        const rapportsHydrates = await hydraterRapportsMateriaux(await hydraterRapportsPhotos(rap))
        setRapportsEnAttente(await hydraterRapportsDurees(rapportsHydrates))
      } else {
        setRapportsEnAttente(rap || [])
      }

      // Recharge la corbeille rapports depuis la DB (survive au rechargement de page)
      const rapsSupprimes = await adminDashboardQuery('rapports_corbeille', supabase.from('rapports')
        .select('id, dossier_id, employe_id, date_intervention, heures, heures_deplacement, materiaux_notes, notes, statut, created_at, employe:employe_id(prenom)')
        .eq('statut', 'archive').order('date_intervention', { ascending: false }))
      if (rapsSupprimes && rapsSupprimes.length > 0) {
        const rapsSupprimesHydrates = await hydraterRapportsDurees(rapsSupprimes)
        setCorbeille(prev => {
          const existingIds = new Set(prev.filter(i => i.type === 'rapport').map(i => i.data.id))
          const newItems = rapsSupprimesHydrates
            .filter(r => !existingIds.has(r.id))
            .map(r => ({ type: 'rapport', label: `${r.employe?.prenom} · ${new Date(r.date_travail).toLocaleDateString('fr-CH')}`, data: r, enfants: [] }))
          return [...prev.filter(i => i.type !== 'rapport'), ...newItems]
        })
      } else {
        setCorbeille(prev => prev.filter(i => i.type !== 'rapport'))
      }

      const ch = await adminDashboardQuery('chantiers',
        supabase.from('dossiers').select('*').order('created_at')
      )

      let intermediairesListe = []
      try {
        intermediairesListe = await adminDashboardQuery('intermediaires',
          supabase.from('clients').select('id, nom, actif').eq('actif', true).eq('type', 'intermediaire').order('nom')
        ) || []
      } catch {
        intermediairesListe = []
      }

      setIntermediaires(intermediairesListe || [])

      const intermediairesById = new Map(
        intermediairesListe.map(item => [String(item.id), item])
      )

      const chantiersHydrates = (ch || []).map(chantier => ({
        ...chantier,
        nom: chantier.numero_affaire || chantier.description || 'Dossier',
        adresse: chantier.adresse_chantier || '',
        intermediaire_id: chantier.client_id,
        intermediaire: chantier?.client_id != null
          ? (intermediairesById.get(String(chantier.client_id)) || null)
          : null
      })).filter(chantier => chantier.type !== 'depannage')

      setChantiers(chantiersHydrates)

      let regs = null
      try {
        regs = await adminDashboardQuery('regies',
          supabase.from('clients').select('id, nom, actif, type').eq('actif', true).eq('type', 'regie').order('nom')
        )
        regs = (regs || []).map(regie => ({ ...regie, client_id: regie.id, nom: regie.nom || `Client ${regie.id}` }))
        setRegies(regs || [])
      } catch { setRegies([]) }

      let regieFiltreOk = regieFilterAvailable
      const { error: regieColumnError } = await supabase.from('dossiers').select('client_id').limit(1)
      logAdminDashboardQueryError('depannages_regie_id_probe', regieColumnError)
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
        cat = await adminDashboardQuery('catalogue', supabase.from('catalogue').select('*').eq('actif', true).order('categorie').order('nom')) || []
      } catch { cat = [] }
      setCatalogue(cat)
      setCategories(['Tous', ...Array.from(new Set(cat.map(a => a.categorie).filter(Boolean)))])

      try {
        setEmployes(await chargerEmployesAdmin())
      } catch { setEmployes([]) }
    } catch (error) {
      console.error('Erreur chargement admin', error)
      setAdminError("Impossible de charger le tableau de bord admin. Réessaie dans un instant.")
    }
  }

  async function verifierColonneChantier(column) {
    const { error } = await supabase.from('dossiers').select(column).limit(1)
    if (!error) return true
    if (isMissingChantierColumnError(error, column)) return false
    console.error(`Erreur verification colonne chantiers.${column}`, error)
    return true
  }

  async function verifierColonnesChantiers() {
    const statut = await verifierColonneChantier('statut')
    // TODO: colonne manquante client_nom
    const clientNom = false
    // TODO: colonne manquante documents_visibilite_employe
    const documentsVisibiliteEmploye = false

    return { statut, clientNom, documentsVisibiliteEmploye }
  }

  async function chargerVacancesAdmin() {
    setVacancesLoading(true)
    setVacancesError('')
    try {
      // TODO: table manquante vacances
      // TODO: table manquante vacances_blocages
      const listeEmp = await chargerEmployesAdmin()

      setVacancesAdmin([])
      setBlocagesVacances([])
      setEmployes(listeEmp || [])
      setVacancesStats({})
    } catch (error) {
      console.error('Erreur chargement vacances admin', error)
      setVacancesError("Impossible de charger les vacances. Réessaie dans un instant.")
    } finally {
      setVacancesLoading(false)
    }
  }

  async function deciderVacances(demande, statut) {
    try {
      // TODO: table manquante vacances
      chargerVacancesAdmin()
    } catch (error) {
      alert('Erreur lors de la mise à jour de la demande. Veuillez réessayer.')
    }
  }

  async function creerBlocageVacances(e) {
    e.preventDefault()
    if (!blocageForm.date_debut || !blocageForm.date_fin || !blocageForm.motif.trim() || blocageForm.date_fin < blocageForm.date_debut) return
    try {
      // TODO: table manquante vacances_blocages
      setBlocageForm({ date_debut: '', date_fin: '', type: 'blocage', motif: '' })
      chargerVacancesAdmin()
    } catch (error) {
      alert('Erreur lors de la création du blocage. Veuillez réessayer.')
    }
  }

  async function supprimerBlocageVacances(id) {
    try {
      // TODO: table manquante vacances_blocages
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
    let data = []

    try {
      const { data: affairesData, error } = await supabase
        .from('dossiers')
        .select('*')
        .eq('id', chantierId)

      if (!error && affairesData && affairesData.length > 0) {
        data = affairesData.map(a => ({
          ...a,
          nom: a.numero_affaire || a.description || 'Dossier',
          isAffaire: true
        }))
      } else {
        throw new Error('fallback')
      }
    } catch {
      const { data: sousDossiersData } = await supabase
        .from('dossiers')
        .select('*')
        .eq('id', chantierId)

      data = (sousDossiersData || []).map(sd => ({
        ...sd,
        nom: sd.numero_affaire || sd.description || 'Dossier',
        isAffaire: false
      }))
    }

    setSousDossiers(data || [])
  }

  async function chargerRapports(sdId) {
    const { data } = await supabase.from('rapports')
      .select('id, dossier_id, employe_id, date_intervention, heures, heures_deplacement, materiaux_notes, notes, statut, created_at, employe:employe_id(prenom)')
      .eq('dossier_id', sdId).neq('statut', 'archive').order('date_intervention', { ascending: false })
    if (!data) { setRapports([]); return }
    const rapportsHydrates = await hydraterRapportsMateriaux(await hydraterRapportsPhotos(data))
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
      .select('date_intervention, employe_id, employe:employe_id(id, prenom), dossier_id')
      .gte('date_intervention', debut).lte('date_intervention', fin).neq('statut', 'archive')
    if (raps) setCalRapports(raps)
    const { data: deps } = await supabase.from('dossiers')
      .select('*')
      .eq('type', 'depannage')
      .gte('created_at', `${debut}T00:00:00`).lte('created_at', `${fin}T23:59:59`)
    if (deps) setCalDepannages(await hydraterDepannagesDurees(deps, null, debut, fin))
  }

  function changerMois(delta) {
    const d = new Date(calMois.year, calMois.month + delta, 1)
    const newMois = { year: d.getFullYear(), month: d.getMonth() }
    setCalMois(newMois); setCalJour(null); chargerCalendrier(newMois)
  }

  async function chargerRapportsV1() {
    setRapportsV1Loading(true)
    try {
      const data = await supabaseSafe(
        supabase.from('rapports')
          .select('id, dossier_id, employe_id, date_intervention, heures, heures_deplacement, materiaux_notes, notes, statut, created_at, employe:employe_id(prenom)')
          .neq('statut', 'archive')
          .order('date_intervention', { ascending: false })
      )
      setRapportsV1(await hydraterRapportsDurees(await hydraterRapportsMateriaux(await hydraterRapportsPhotos(data || []))))
    } catch (error) {
      console.error('Erreur chargement rapports V1', error)
      setRapportsV1([])
    } finally {
      setRapportsV1Loading(false)
    }
  }

  function ouvrirVueAdmin(prochaineVue) {
    setVue(prochaineVue)
    if (prochaineVue === 'calendrier') chargerCalendrier(calMois)
    if (prochaineVue === 'vacances') chargerVacancesAdmin()
    if (prochaineVue === 'employes') chargerStatsEmployes()
    if (prochaineVue === 'rapports_v1') chargerRapportsV1()
  }

  async function chargerStatsEmployes() {
    setEmpLoading(true)
    let listeEmp = []
    try {
      listeEmp = await chargerEmployesAdmin()
      setEmployes(listeEmp)
    } catch (error) {
      console.error('Erreur chargement employes admin', error)
      setEmployes([])
      setEmpLoading(false)
      return
    }
    if (listeEmp.length === 0) { setEmpLoading(false); return }

    const now = new Date()
    const { debut: debutMois, fin: finMois } = debutFin(now.getFullYear(), now.getMonth())
    const prevDate = new Date(now.getFullYear(), now.getMonth() - 1, 1)
    const { debut: debutPrev, fin: finPrev } = debutFin(prevDate.getFullYear(), prevDate.getMonth())

    const [{ data: entMois }, { data: entPrev }, { data: delRapsMois }, { data: delRapsPrev }] = await Promise.all([
      supabase.from('rapports').select('employe_id, heures, heures_deplacement, dossier_id')
        .gte('date_intervention', debutMois).lte('date_intervention', finMois),
      supabase.from('rapports').select('employe_id, heures, heures_deplacement, dossier_id')
        .gte('date_intervention', debutPrev).lte('date_intervention', finPrev),
      supabase.from('rapports').select('id').eq('statut', 'archive')
        .gte('date_intervention', debutMois).lte('date_intervention', finMois),
      supabase.from('rapports').select('id').eq('statut', 'archive')
        .gte('date_intervention', debutPrev).lte('date_intervention', finPrev)
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
        heureMois: moisEmp.reduce((s, e) => s + Number(e.heures || 0) + Number(e.heures_deplacement || 0), 0),
        heurePrev: prevEmp.reduce((s, e) => s + Number(e.heures || 0) + Number(e.heures_deplacement || 0), 0),
        chantiersCount: new Set(moisEmp.filter(e => e.dossier_id).map(e => e.dossier_id)).size
      }
    }
    setEmpStats(stats)
    setEmpLoading(false)
  }

  async function chargerDetailEmploye(empId, mois) {
    const m = mois || empDetailMois
    const { debut, fin } = debutFin(m.year, m.month)

    const { data: raps } = await supabase.from('rapports')
      .select('id, dossier_id, employe_id, date_intervention, heures, heures_deplacement, notes, statut')
      .eq('employe_id', empId).gte('date_intervention', debut).lte('date_intervention', fin).neq('statut', 'archive').order('date_intervention')

    if (raps && raps.length > 0) {
      setEmpDetailRapports(await hydraterRapportsDurees(raps, empId, debut, fin))
    } else {
      setEmpDetailRapports(raps || [])
    }

    const { data: deps } = await supabase.from('dossiers')
      .select('*')
      .eq('type', 'depannage')
      .gte('created_at', `${debut}T00:00:00`).lte('created_at', `${fin}T23:59:59`).order('created_at')
    if (deps) setEmpDetailDepannages(await hydraterDepannagesDurees(deps, empId, debut, fin))

    // TODO: table manquante absences
    setEmpAbsences([])
  }

  async function approuverAbsence(id) {
    try {
      // TODO: table manquante absences
      if (empDetail) chargerDetailEmploye(empDetail.id, empDetailMois)
    } catch (error) {
      alert("Erreur lors de l'approbation de l'absence.")
    }
  }

  async function refuserAbsence(id) {
    try {
      // TODO: table manquante absences
      if (empDetail) chargerDetailEmploye(empDetail.id, empDetailMois)
    } catch (error) {
      alert("Erreur lors du refus de l'absence.")
    }
  }

  async function chargerCharteEmploye(empId) {
    setEmpCharteLoading(true)
    // TODO: table manquante chartes_acceptees
    // TODO: table manquante signatures
    setEmpCharteData({ charte: null, sig: null })
    setEmpCharteLoading(false)
  }

  // ──────────────────────────────────────────────────────────────────────────
  // CATALOGUE ADMIN
  // ──────────────────────────────────────────────────────────────────────────

  async function chargerCatalogueAdmin() {
    setCatalogueAdminLoading(true)
    setCatalogueAdminError('')
    try {
      const { data, error } = await supabase.from('catalogue').select('*').order('categorie').order('nom')
      if (error) throw error
      setCatalogueAdmin(data || [])
    } catch (e) {
      setCatalogueAdminError(e?.message || 'Erreur chargement catalogue')
    } finally {
      setCatalogueAdminLoading(false)
    }
  }

  async function sauvegarderArticleCatalogue(id, changes) {
    setCatalogueAdminEdit(null)
    setCatalogueAdminError('')
    try {
      const { error } = await supabase.from('catalogue').update(changes).eq('id', id)
      if (error) throw error
      setCatalogueAdmin(prev => prev.map(a => a.id === id ? { ...a, ...changes } : a))
    } catch (e) {
      setCatalogueAdminError(e?.message || 'Erreur sauvegarde')
    }
  }

  async function ajouterArticleCatalogue() {
    if (!catalogueAdminNouvel.nom?.trim()) return
    setCatalogueAdminSaving(true)
    setCatalogueAdminError('')
    try {
      const { data, error } = await supabase.from('catalogue').insert({
        nom: catalogueAdminNouvel.nom.trim(),
        categorie: catalogueAdminNouvel.categorie?.trim() || null,
        unite: catalogueAdminNouvel.unite?.trim() || null,
        prix_net: catalogueAdminNouvel.prix_net ? parseFloat(catalogueAdminNouvel.prix_net) : null,
        actif: true
      }).select().single()
      if (error) throw error
      setCatalogueAdmin(prev =>
        [...prev, data].sort((a, b) =>
          (a.categorie || '').localeCompare(b.categorie || '', 'fr') ||
          (a.nom || '').localeCompare(b.nom || '', 'fr')
        )
      )
      setCatalogueAdminAjout(false)
      setCatalogueAdminNouvel({ nom: '', unite: '', prix_net: '', categorie: '' })
    } catch (e) {
      setCatalogueAdminError(e?.message || 'Erreur ajout article')
    } finally {
      setCatalogueAdminSaving(false)
    }
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
        .select('id, dossier_id, employe_id, date_intervention, heures, heures_deplacement, notes, statut')
        .eq('employe_id', empId).gte('date_intervention', lundiStr).lte('date_intervention', dimancheStr)
        .neq('statut', 'archive').order('date_intervention'),
      supabase.from('dossiers')
        .select('id, created_at, adresse_chantier')
        .eq('type', 'depannage').gte('created_at', `${lundiStr}T00:00:00`).lte('created_at', `${dimancheStr}T23:59:59`)
        .order('created_at'),
      Promise.resolve({ data: [] })
    ])

    // Merge des durées rapports via time_entries
    const rapsAvecDuree = await hydraterRapportsDurees(raps || [], empId, lundiStr, dimancheStr)
    const depsAvecDuree = await hydraterDepannagesDurees(deps || [], empId, lundiStr, dimancheStr)

    // TODO: table manquante signatures
    const sigData = null

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
          const nomChantier = r.sous_dossiers?.chantiers?.nom || r.affaires?.chantiers?.nom || '—'
          const nomSd = r.sous_dossiers?.nom || r.affaires?.nom || ''
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
      // TODO: table manquante chartes_acceptees
      // TODO: table manquante signatures
      setEmpCharteData({ charte: null, sig: null })
    } catch (error) {
      alert('Erreur lors de la réinitialisation de la charte. Veuillez réessayer.')
    }
  }

  // ──────────────────────────────────────────────────────────────────────────
  // ACTIONS CRUD
  // ──────────────────────────────────────────────────────────────────────────

  async function deconnecter() { await signOut(); navigate('/login') }

  const adminInitiales = user?.initiales || user?.prenom?.slice(0, 2)?.toUpperCase() || user?.email?.slice(0, 2)?.toUpperCase() || ''
  const adminUserMark = user?.email?.toLowerCase() === 'carlos@eleco.ch'
    ? '∞'
    : adminInitiales

  const adminHeaderPlusStyle = {
    width: '40px',
    height: '40px',
    minWidth: '40px',
    padding: 0,
    borderRadius: '10px',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '24px',
    fontWeight: 700,
    lineHeight: 1,
    flexShrink: 0
  }

  const adminHeaderRight = (extra = null) => (
    <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
      {extra}
      <PageTopActions navigate={navigate} fallbackPath="/admin" onRefresh={refreshPage} refreshing={refreshingData} showBack={false} />
      <button className="avatar" style={{ background: '#FAEEDA', color: '#BA7517' }} onClick={deconnecter}>{adminUserMark}</button>
    </div>
  )

  async function supprimerChantier(c) {
    const [{ data: sds }, { data: affaires }] = await Promise.all([
      supabase.from('dossiers').select('*').eq('id', c.id),
      supabase.from('dossiers').select('*').eq('id', c.id)
    ])
    const enfants = [
      ...((sds || []).map(item => ({ ...item, isAffaire: false }))),
      ...((affaires || []).map(item => ({ ...item, isAffaire: true })))
    ]
    try {
      await supabaseSafe(supabase.from('dossiers').update({ statut: 'archive' }).eq('id', c.id))
      setCorbeille(prev => [...prev, { type: 'chantier', label: c.nom, data: c, enfants }])
      chargerTout(); setConfirm(null); setVue('chantiers'); setChantierActif(null)
    } catch (error) {
      alert('Erreur lors de la suppression du chantier. Veuillez réessayer.')
    }
  }

  async function supprimerIntermediaire(intermediaire) {
    if (!intermediaire?.id) return
    const count = chantiers.filter(chantier => chantierBelongsToIntermediaire(chantier, intermediaire)).length
    if (count > 0) {
      alert(`Impossible de supprimer cet intermédiaire : ${count} chantier${count > 1 ? 's' : ''} actif${count > 1 ? 's' : ''} y est rattaché.`)
      setConfirm(null)
      return
    }

    try {
      await supabaseSafe(supabase.from('clients').update({ actif: false }).eq('id', intermediaire.id))
      setIntermediaires(prev => prev.filter(item => String(item.id) !== String(intermediaire.id)))
      if (intermediaireChantiersActif?.id === intermediaire.id) setIntermediaireChantiersActif(null)
      setConfirm(null)
    } catch (error) {
      alert("Erreur lors de la suppression de l'intermédiaire. Veuillez réessayer.")
    }
  }

  async function archiverIntermediaire(intermediaire) {
    if (!intermediaire?.id) return
    try {
      await supabase.from('clients').update({ actif: false }).eq('id', intermediaire.id)
      setIntermediaires(prev => prev.filter(item => String(item.id) !== String(intermediaire.id)))
    } catch (error) {
      alert("Erreur lors de l'archivage de l'intermédiaire.")
    }
  }

  async function supprimerSousDossier(sd) {
    const { data: raps } = await supabase.from('rapports').select('*').eq('dossier_id', sd.id)
    if ((raps || []).length > 0) {
      alert('Suppression bloquee: ce sous-dossier contient deja des rapports.')
      setConfirm(null)
      return
    }
    try {
      await supabaseSafe(supabase.from('dossiers').update({ statut: 'archive' }).eq('id', sd.id))
      setCorbeille(prev => [...prev, { type: 'sous_dossier', label: sd.nom, data: sd, enfants: raps || [] }])
      chargerSousDossiers(chantierActif.id); setConfirm(null)
    } catch (error) {
      alert('Erreur lors de la suppression du sous-dossier. Veuillez réessayer.')
    }
  }

  async function supprimerRapport(r) {
    try {
      await supabaseSafe(supabase.from('rapports').update({ statut: 'archive' }).eq('id', r.id))
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
      await supabaseSafe(supabase.from('dossiers').update({ statut: 'actif' }).eq('id', item.data.id))
    } else if (item.type === 'sous_dossier') {
      await supabaseSafe(supabase.from('dossiers').insert({ client_id: item.data.client_id || null, description: item.data.nom || null }))
    } else if (item.type === 'rapport') {
      await supabaseSafe(supabase.from('rapports').update({ statut: 'brouillon' }).eq('id', item.data.id))
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
        await supabaseSafe(supabase.from('dossiers').update({ description: nouveauNom }).eq('id', renommerItem.data.id))
        chargerTout()
      } else if (renommerItem.type === 'intermediaire') {
        const updated = await supabaseSafe(
          supabase.from('clients').update({ nom: nouveauNom.trim() }).eq('id', renommerItem.data.id).select().single()
        )
        setIntermediaires(prev => prev.map(item => item.id === updated.id ? updated : item))
        if (intermediaireChantiersActif?.id === updated.id) setIntermediaireChantiersActif(updated)
      } else if (renommerItem.type === 'sous_dossier') {
        await supabaseSafe(supabase.from('dossiers').update({ description: nouveauNom }).eq('id', renommerItem.data.id))
        chargerSousDossiers(chantierActif.id)
      }
      setRenommerItem(null); setNouveauNom('')
    } catch (error) {
      alert('Erreur lors du renommage. Veuillez réessayer.')
    }
  }

  function resetNouveauChantierForm() {
    setAjoutChantier(false)
    setAjoutIntermediaire(false)
    setCreationChantierErreur('')
    setNouveauClientNom('')
    setNouvelIntermediaireId('')
    setNouvelIntermediaireNom('')
    setNouveauNomChantier('')
    setNouvelleAdresse('')
  }

  async function creerIntermediaireAdmin({ closeForm = true } = {}) {
    const nom = nouvelIntermediaireNom.trim()
    if (!nom) return
    const payload = { nom, type: 'intermediaire', actif: true }

    try {
      const { data, error } = await supabase
        .from('clients')
        .insert(payload)
        .select()
        .single()

      if (error) throw error

      setIntermediaires(prev => [...prev, data])
      setNouvelIntermediaireId(String(data.id))
      setNouvelIntermediaireNom('')
      setAjoutIntermediaire(false)
      if (closeForm) setAjoutChantier(false)
    } catch (err) {
      console.error('Erreur création intermédiaire Supabase', {
        table: 'intermediaires',
        payload,
        message: err?.message,
        details: err?.details,
        hint: err?.hint,
        code: err?.code,
        error: err
      })
      alert("Erreur lors de la creation de l’intermediaire : " + (err?.message || "Erreur inconnue"))
    }
  }

  async function creerChantierAdmin() {
    setCreationChantierErreur('')

    const nom = nouveauNomChantier.trim()
    if (!nom) {
      setCreationChantierErreur('Renseigne le nom du chantier.')
      return
    }

    const intermediaireId = intermediaireChantiersActif?.id
      ? String(intermediaireChantiersActif.id)
      : nouvelIntermediaireId

    if (!intermediaireId) {
      setCreationChantierErreur("Selectionne un intermediaire.")
      return
    }

    const existe = chantiers.find(c =>
      String(c.numero_affaire || '').trim().toLowerCase() === nom.toLowerCase() &&
      String(c.client_id || '') === String(intermediaireId)
    )
    if (existe) {
      setCreationChantierErreur(`"${nom}" existe deja pour cet intermediaire.`)
      return
    }

    try {
      const payload = {
        type: 'chantier',
        numero_affaire: nom,
        description: nom,
        adresse_chantier: nouvelleAdresse.trim() || null,
        client_id: intermediaireId,
        statut: 'en_cours'
      }

      const created = await supabaseSafe(
        supabase.from('dossiers').insert(payload).select('*').single()
      )

      setChantiers(prev => [...prev, {
        id: created.id,
        numero_affaire: created.numero_affaire,
        type: 'chantier',
        client_id: created.client_id,
        statut: 'en_cours',
        adresse_chantier: created.adresse_chantier,
      }])
      resetNouveauChantierForm()
      await rechargerChantiersSeulement()
    } catch (error) {
      console.error('Erreur creation chantier', error)
      setCreationChantierErreur(`Impossible de creer le chantier. ${chantierSchemaErrorMessage(error)}`)
    }
  }

  async function rechargerChantiersSeulement() {
    try {
      const ch = await supabaseSafe(
        supabase.from('dossiers').select('*').order('created_at')
      )
      const intermediairesById = new Map(intermediaires.map(item => [String(item.id), item]))
      const hydrates = (ch || []).map(c => ({
        ...c,
        nom: c.numero_affaire || c.description || 'Dossier',
        adresse: c.adresse_chantier || '',
        intermediaire_id: c.client_id,
        intermediaire: c.client_id != null
          ? (intermediairesById.get(String(c.client_id)) || null)
          : null
      })).filter(c => c.type !== 'depannage')
      setChantiers(hydrates)
    } catch {}
  }


  async function valider(rid) {
    try {
      await supabaseSafe(supabase.from('rapports').update({ statut: 'valide' }).eq('id', rid))
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
        await supabaseSafe(supabase.from('lignes_facturables').upsert(
          newMat.map(m => ({
            ...(m.id ? { id: m.id } : {}),
            dossier_id: rapportDetail?.dossier_id || null,
            rapport_id: rapportId,
            type: 'materiel',
            description: m.description || m.designation || m.nom,
            quantite: m.quantite,
            prix_unitaire: m.prix_unitaire || m.prix_net || m.pu || 0,
            montant_ht: Number(m.quantite || 0) * Number(m.prix_unitaire || m.prix_net || m.pu || 0),
            statut: 'brouillon'
          }))
        ))
      }

      if (idsSupprimes.length > 0) {
        await supabaseSafe(supabase.from('lignes_facturables').delete().in('id', idsSupprimes))
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
        date_intervention: editRapportDate,
        notes: editRapportRemarques
      }).eq('id', rapportDetail.id))
      setRapportDetail(prev => ({
        ...prev,
        date_intervention: editRapportDate,
        date_travail: editRapportDate,
        notes: editRapportRemarques,
        remarques: editRapportRemarques
      }))
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
        .select('id, dossier_id, employe_id, date_intervention, heures, heures_deplacement, materiaux_notes, notes, statut, created_at, employe:employe_id(prenom)')
        .eq('id', rapportId)
        .single()
    )

    if (!updatedR) {
      setRapportDetail(null)
      return null
    }

    const [rapportHydrate] = await hydraterRapportsDurees(await hydraterRapportsMateriaux(await hydraterRapportsPhotos([updatedR])))
    setRapportDetail(rapportHydrate || null)
    if (sousDossierActif?.id) await chargerRapports(sousDossierActif.id)
    return rapportHydrate || null
  }

  async function ajouterPhotosRapportAdmin(fileList) {
    const files = Array.from(fileList || []).filter(Boolean)
    if (!rapportDetail?.id || files.length === 0 || adminPhotoSaving) return

    setAdminPhotoSaving(true)
    try {
      // TODO: table manquante rapport_photos
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
      // TODO: table manquante rapport_photos
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

    try {
      // TODO: colonne manquante documents_visibilite_employe
      alert("La visibilite des documents n'est pas disponible dans le schema Supabase V1.")
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
    return depannage.created_by ? String(depannage.created_by).slice(0, 2).toUpperCase() : 'Aucun'
  }

  function depannageIntervenantsCount(depannage) {
    // TODO: table manquante depannage_intervenants
    return (depannage.depannage_intervenants || []).length
  }

  async function mettreAJourStatutChantier(chantier, nextStatus) {
    if (!chantier?.id || !nextStatus) return

    if (!chantierSchema.statut) {
      alert("Impossible de mettre a jour le statut : la colonne chantiers.statut est absente dans la base Supabase. La migration des statuts chantier doit etre appliquee.")
      return
    }

    try {
      const updated = await supabaseSafe(
        supabase
          .from('dossiers')
          .update({ statut: nextStatus })
          .eq('id', chantier.id)
          .select()
          .single()
      )

      if (!updated) throw new Error('chantier_status_update_empty')

      setChantiers(prev => prev.map(item => item.id === updated.id ? updated : item))
      if (chantierActif?.id === updated.id) setChantierActif(updated)
      await chargerTout()
    } catch (error) {
      console.error('Erreur mise a jour statut chantier', {
        chantierId: chantier.id,
        nextStatus,
        error
      })
      alert(`Impossible de mettre a jour le statut du chantier. ${chantierSchemaErrorMessage(error)}`)
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

  const intermediairesChantiers = useMemo(
    () => [...intermediaires].sort((a, b) => String(a.nom || '').localeCompare(String(b.nom || ''), 'fr', { sensitivity: 'base' })),
    [intermediaires]
  )
  const chantiersIntermediaireActif = useMemo(
    () => intermediaireChantiersActif
      ? chantiers.filter(chantier => chantierBelongsToIntermediaire(chantier, intermediaireChantiersActif))
      : [],
    [chantiers, intermediaireChantiersActif]
  )
  const chantiersGroupesAffiches = useMemo(
    () => groupChantiersByClient(chantiersIntermediaireActif),
    [chantiersIntermediaireActif]
  )

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
    const inclureRegiesVides = !normalizeDepannageSearchValue(search) && !dateFilter

    if (inclureRegiesVides) {
      const regiesSources = regieFilter
        ? regies.filter(regie => String(regie.id) === String(regieFilter))
        : regies

      for (const regie of regiesSources) {
        const nom = regie?.nom || 'RÃ©gie non dÃ©finie'
        if (!groupes[nom]) groupes[nom] = { nom, count: 0, mois: {}, moisTimestamps: {} }
      }
    }

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

  const ONGLET_STATUTS = {
    en_cours: ['À faire', 'En cours', 'Planifié', 'Pris', 'À traiter'],
    a_traiter: ['Intervention faite', 'Rapport reçu', 'Facture à préparer'],
    archives: ['Facture prête', 'payé', 'clôturé', 'annulé']
  }

  const depannagesFiltresOnglet = useMemo(() => {
    const statuts = ONGLET_STATUTS[depannagesOnglet] || []
    return depannagesFiltres.filter(d => statuts.includes(depannageStatut(d)))
  }, [depannagesFiltres, depannagesOnglet])

  const depannagesGroupes = useMemo(() => grouperDepannages(depannagesFiltresOnglet), [depannagesFiltresOnglet, regies, regieFilter, search, dateFilter])

  // ──────────────────────────────────────────────────────────────────────────
  // VUES
  // ──────────────────────────────────────────────────────────────────────────

  if (vueCorbeille) return (
    <div>
      <PageHeader
        title="Corbeille"
        subtitle="Tableau de bord admin"
        onBack={() => setVueCorbeille(false)}
        rightSlot={adminHeaderRight()}
      />
      <div className="page-content">
        {corbeille.length === 0 && <div style={{ textAlign: 'center', color: '#888', fontSize: '13px', padding: '40px 0' }}>Corbeille vide</div>}
        {corbeille.map((item, i) => (
          <div key={i} className="card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <div style={{ fontSize: '12px', color: '#888', textTransform: 'uppercase' }}>{item.type}</div>
              <div style={{ fontWeight: 500, fontSize: '13px' }}>{item.label}</div>
              {item.type === 'chantier' && (item.enfants || []).length > 0 && (
                <div style={{ fontSize: '11px', color: '#888', marginTop: '4px' }}>
                  {(item.enfants || []).length} élément(s) lié(s)
                  {item.enfants.some(enfant => enfant.isAffaire) && ` · ${(item.enfants || []).filter(enfant => enfant.isAffaire).length} affaire(s)`}
                  {item.enfants.some(enfant => !enfant.isAffaire) && ` · ${(item.enfants || []).filter(enfant => !enfant.isAffaire).length} sous-dossier(s)`}
                </div>
              )}
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
          else if (confirm.type === 'intermediaire') supprimerIntermediaire(confirm.data)
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
      <PageHeader
        title="Ajouter article"
        subtitle="Tableau de bord admin"
        onBack={() => setAjoutArticleVue(false)}
        rightSlot={adminHeaderRight()}
      />
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
      <PageHeader
        title="Modifier matériaux"
        subtitle="Tableau de bord admin"
        onBack={() => { setEditMateriaux(null); setArticleManuel({ designation: '', unite: '', prix: '0', quantite: 1 }) }}
        rightSlot={adminHeaderRight(
          <button className="btn-primary btn-sm" style={{ width: 'auto' }} onClick={() => { setRechercheArticle(''); setCatFiltre('Tous'); setAjoutArticleVue(true) }}>+ Ajouter</button>
        )}
      />
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
        <PageHeader
          title="Rapport"
          subtitle={`${rapportDetail.employe?.prenom || ''} · ${new Date(rapportDetail.date_travail + 'T12:00:00').toLocaleDateString('fr-CH')}`}
          onBack={() => { setRapportDetail(null); setEditRapportMode(false) }}
          rightSlot={adminHeaderRight(
            <>
              {!editRapportMode && (
                <button onClick={() => { setEditRapportMode(true); setEditRapportDate(rapportDetail.date_travail); setEditRapportRemarques(rapportDetail.remarques || '') }}
                  style={{ background: 'none', border: '1px solid #ddd', borderRadius: '6px', padding: '4px 8px', fontSize: '12px', cursor: 'pointer' }}>✏️</button>
              )}
              {!rapportDetail.valide && <span className="badge badge-amber">À valider</span>}
              {rapportDetail.valide && <span className="badge badge-green">✓ Validé</span>}
            </>
          )}
        />
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

  const utiliseAffaires = sousDossiers.some(item => item.isAffaire)

  if (vue === 'sous_dossiers' && chantierActif) return (
    <div>
      <PageHeader
        title={chantierActif.nom}
        subtitle={`${getChantierClientLabel(chantierActif)} · ${chantierActif.adresse || '—'}`}
        onBack={() => { setVue('chantiers'); setChantierActif(null) }}
        rightSlot={adminHeaderRight(
          <>
            <button onClick={() => { setRenommerItem({ type: 'chantier', data: chantierActif }); setNouveauNom(chantierActif.nom) }} style={{ background: 'none', border: '1px solid #ddd', borderRadius: '6px', padding: '4px 8px', fontSize: '12px', cursor: 'pointer' }}>✏️</button>
            <button onClick={() => setConfirm({ type: 'chantier', data: chantierActif })} style={{ background: 'none', border: '1px solid #f09595', borderRadius: '6px', padding: '4px 8px', fontSize: '12px', cursor: 'pointer', color: '#A32D2D' }}>🗑️</button>
          </>
        )}
      />
      <div className="page-content">
        <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px' }}>
            <div>
              <div style={{ fontWeight: 600, fontSize: '14px' }}>Chantier</div>
              <div style={{ fontSize: '11px', color: '#888', marginTop: '4px' }}>Documents employé prévus en mode sans prix</div>
            </div>
            <span style={{ ...getChantierStatusBadgeStyle(chantierActif.statut || CHANTIER_STATUT_A_CONFIRMER), borderRadius: '6px', padding: '4px 8px', fontSize: '10px', fontWeight: 700, whiteSpace: 'nowrap' }}>
              {getChantierStatusLabel(chantierActif.statut || CHANTIER_STATUT_A_CONFIRMER)}
            </span>
          </div>
          {chantierSchema.statut && getNextChantierStatusAction(chantierActif.statut || CHANTIER_STATUT_A_CONFIRMER) && (
            <button
              className="btn-outline btn-sm"
              style={{ width: 'auto', alignSelf: 'flex-start' }}
              onClick={() => {
                const nextAction = getNextChantierStatusAction(chantierActif.statut || CHANTIER_STATUT_A_CONFIRMER)
                if (nextAction) mettreAJourStatutChantier(chantierActif, nextAction.nextStatus)
              }}
            >
              {getNextChantierStatusAction(chantierActif.statut || CHANTIER_STATUT_A_CONFIRMER)?.label}
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
            <span style={{ fontWeight: 600, fontSize: '14px' }}>{utiliseAffaires ? 'Affaires' : 'Sous-dossiers'}</span>
            {!utiliseAffaires && (
              <button className="btn-primary btn-sm" style={{ width: 'auto' }} onClick={() => setNouveauSd(true)}>+ Nouveau</button>
            )}
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
                  await supabaseSafe(supabase.from('dossiers').insert({ client_id: chantierActif.client_id || null, description: nouveauSdNom }))
                  setNouveauSdNom(''); setNouveauSd(false); chargerSousDossiers(chantierActif.id)
                } catch (error) {
                  alert('Erreur lors de la création du sous-dossier. Veuillez réessayer.')
                }
              }}>OK</button>
            </div>
          )}
          {sousDossiers.length === 0 && !nouveauSd && <div style={{ fontSize: '13px', color: '#888' }}>{utiliseAffaires ? 'Aucune affaire' : 'Aucun sous-dossier'}</div>}
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
                  {!sd.isAffaire && (
                    <div style={{ display: 'flex', gap: '4px' }}>
                      <button onClick={() => { setRenommerItem({ type: 'sous_dossier', data: sd }); setNouveauNom(sd.nom) }} style={{ background: 'none', border: '1px solid #ddd', borderRadius: '6px', padding: '4px 6px', fontSize: '11px', cursor: 'pointer' }}>✏️</button>
                      <button onClick={() => setConfirm({ type: 'sous_dossier', data: sd })} style={{ background: 'none', border: '1px solid #f09595', borderRadius: '6px', padding: '4px 6px', fontSize: '11px', cursor: 'pointer', color: '#A32D2D' }}>🗑️</button>
                    </div>
                  )}
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
                      <div style={{ fontSize: '11px', color: '#888' }}>Visibilite employe: indisponible schema V1</div>
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
      <PageHeader
        title={sousDossierActif.nom}
        subtitle={sousDossierActif.isAffaire ? 'Affaire' : 'Sous-dossier'}
        onBack={() => { setVue('sous_dossiers'); setSousDossierActif(null) }}
        rightSlot={adminHeaderRight()}
      />
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
      <PageHeader
        title={intermediaireChantiersActif?.nom || 'Chantiers'}
        subtitle={intermediaireChantiersActif ? 'Intermédiaire' : 'Tableau de bord admin'}
        onBack={() => {
          if (intermediaireChantiersActif) {
            setIntermediaireChantiersActif(null)
            setAjoutChantier(false)
          } else {
            setVue('accueil')
          }
        }}
        rightSlot={adminHeaderRight(
          <button className="btn-primary btn-sm" style={adminHeaderPlusStyle} onClick={() => {
            if (intermediaireChantiersActif?.id) {
              setNouvelIntermediaireId(String(intermediaireChantiersActif.id))
              setAjoutIntermediaire(false)
            } else {
              setNouvelIntermediaireId('')
              setAjoutIntermediaire(true)
            }
            setCreationChantierErreur('')
            setAjoutChantier(true)
          }}>+</button>
        )}
      />
      <div className="page-content">
        <div style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: '8px', padding: '10px 12px', fontSize: '12px', color: '#475569' }}>
          Les chantiers en statut 'A confirmer' ne sont pas visibles par les employés.
        </div>
        {!chantierSchema.statut && (
          <div style={{ background: '#FFF7ED', border: '1px solid #FDBA74', borderRadius: '8px', padding: '10px 12px', fontSize: '12px', color: '#9A3412' }}>
            Statuts chantier indisponibles : la colonne chantiers.statut est absente dans la base Supabase.
          </div>
        )}
        {ajoutChantier && ajoutIntermediaire && !intermediaireChantiersActif && (
          <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <div style={{ fontWeight: 600, fontSize: '14px' }}>Nouvel intermédiaire</div>
            <input
              placeholder="Nom de l’intermédiaire *"
              value={nouvelIntermediaireNom}
              onChange={e => setNouvelIntermediaireNom(e.target.value)}
              style={{ padding: '8px', borderRadius: '6px', border: '1px solid #ddd', fontSize: '13px' }}
            />
            <div style={{ display: 'flex', gap: '8px' }}>
              <button type="button" className="btn-outline" style={{ flex: 1 }} onClick={resetNouveauChantierForm}>Annuler</button>
              <button type="button" className="btn-primary" style={{ flex: 1 }} onClick={() => creerIntermediaireAdmin()}>Créer</button>
            </div>
          </div>
        )}
        {ajoutChantier && (!ajoutIntermediaire || intermediaireChantiersActif) && (
          <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <div style={{ fontWeight: 600, fontSize: '14px' }}>Nouveau chantier</div>
            {intermediaireChantiersActif ? (
              <div style={{ padding: '9px 10px', borderRadius: '8px', border: '1px solid #D8E3EF', background: '#F8FAFC', fontSize: '13px', color: '#334155' }}>
                Intermédiaire : <strong>{intermediaireChantiersActif.nom}</strong>
              </div>
            ) : (
            <select value={nouvelIntermediaireId} onChange={e => setNouvelIntermediaireId(e.target.value)}
              style={{ padding: '8px', borderRadius: '6px', border: '1px solid #ddd', fontSize: '13px', background: '#fff' }}>
              <option value="">Sélectionner un intermédiaire *</option>
              {intermediaires.map(item => (
                <option key={item.id} value={item.id}>{item.nom}</option>
              ))}
            </select>
            )}
            {!intermediaireChantiersActif && <button
              type="button"
              onClick={() => setAjoutIntermediaire(prev => !prev)}
              style={{
                background: 'none',
                border: 'none',
                color: '#185FA5',
                fontSize: '12px',
                cursor: 'pointer',
                padding: 0,
                textAlign: 'left'
              }}
            >
              + Ajouter un intermédiaire
            </button>}
            {!intermediaireChantiersActif && ajoutIntermediaire && (
              <div style={{ display: 'flex', gap: '6px', marginTop: '6px' }}>
                <input
                  placeholder="Nom de l’intermédiaire"
                  value={nouvelIntermediaireNom}
                  onChange={e => setNouvelIntermediaireNom(e.target.value)}
                  style={{ flex: 1, padding: '6px', borderRadius: '6px', border: '1px solid #ddd', fontSize: '12px' }}
                />
                <button
                  type="button"
                  className="btn-outline btn-sm"
                  onClick={() => creerIntermediaireAdmin({ closeForm: false })}
                >
                  OK
                </button>
              </div>
            )}
            <input placeholder="Nom *" value={nouveauNomChantier} onChange={e => setNouveauNomChantier(e.target.value)}
              style={{ padding: '8px', borderRadius: '6px', border: '1px solid #ddd', fontSize: '13px' }} />
            <input placeholder="Adresse" value={nouvelleAdresse} onChange={e => setNouvelleAdresse(e.target.value)}
              style={{ padding: '8px', borderRadius: '6px', border: '1px solid #ddd', fontSize: '13px' }} />
            {creationChantierErreur && (
              <div style={{ background: '#FFF1F2', border: '1px solid #FDA4AF', borderRadius: '8px', padding: '8px 10px', color: '#BE123C', fontSize: '12px' }}>
                {creationChantierErreur}
              </div>
            )}
            <div style={{ display: 'flex', gap: '8px' }}>
              <button className="btn-outline" style={{ flex: 1 }} onClick={resetNouveauChantierForm}>Annuler</button>
              <button className="btn-primary" style={{ flex: 1 }} onClick={creerChantierAdmin}>Créer</button>
            </div>
          </div>
        )}
        <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '10px', borderColor: '#D8E3EF', boxShadow: '0 6px 18px rgba(24, 95, 165, 0.06)' }}>
          {!intermediaireChantiersActif && intermediairesChantiers.length === 0 && <div style={{ fontSize: '13px', color: '#888' }}>Aucun intermédiaire</div>}
          {!intermediaireChantiersActif && intermediairesChantiers.map(intermediaire => {
            const count = chantiers.filter(chantier => chantierBelongsToIntermediaire(chantier, intermediaire)).length
            return (
              <ListItem
                key={intermediaire.id}
                title={intermediaire.nom}
                subtitle={`${count} chantier${count > 1 ? 's' : ''}`}
                showRename={true}
                showArchive={true}
                deleteDisabled={count > 0}
                onClick={() => setIntermediaireChantiersActif(intermediaire)}
                onRename={() => { setRenommerItem({ type: 'intermediaire', data: intermediaire }); setNouveauNom(intermediaire.nom) }}
                onArchive={() => archiverIntermediaire(intermediaire)}
              />
            )
          })}
          {intermediaireChantiersActif && chantiersIntermediaireActif.length === 0 && <div style={{ fontSize: '13px', color: '#888' }}>Aucun chantier pour cet intermÃ©diaire</div>}
          {intermediaireChantiersActif && chantiersGroupesAffiches.map(group => (
            <div key={group.clientLabel} style={{ borderTop: '1px solid #eee', paddingTop: '12px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', marginBottom: '10px' }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: '11px', fontWeight: 700, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                    Intermédiaire
                  </div>
                  <div
                    title={group.clientLabel}
                    style={{
                      fontSize: '13px',
                      fontWeight: 700,
                      color: '#1F2937',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap'
                    }}
                  >
                    {group.clientLabel}
                  </div>
                </div>
                <div
                  style={{
                    flexShrink: 0,
                    fontSize: '11px',
                    color: '#475569',
                    background: '#F8FAFC',
                    border: '1px solid #E2E8F0',
                    borderRadius: '999px',
                    padding: '4px 8px'
                  }}
                >
                  {group.items.length} chantier{group.items.length > 1 ? 's' : ''}
                </div>
              </div>

              {group.items.map(c => {
                const chantierStatut = c.statut || CHANTIER_STATUT_A_CONFIRMER
                const badgeStyle = getChantierStatusBadgeStyle(chantierStatut)
                const nextAction = chantierSchema.statut ? getNextChantierStatusAction(chantierStatut) : null
                return (
                  <div key={c.id} className="row-item" style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto', alignItems: 'center', gap: '10px', minHeight: '58px', borderBottomColor: '#E7EDF5' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '34px minmax(0, 1fr)', alignItems: 'center', gap: '10px', minWidth: 0, cursor: 'pointer' }} onClick={() => { setChantierActif(c); chargerSousDossiers(c.id); setVue('sous_dossiers') }}>
                      <div style={{ width: 34, height: 34, borderRadius: '8px', background: '#E6F1FB', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '16px' }}>🏗️</div>
                      <div style={{ minWidth: 0 }}>
                        <div title={c.nom} style={{ fontWeight: 700, fontSize: '13px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.nom}</div>
                        <div title={c.adresse || ''} style={{ fontSize: '12px', color: '#64748B', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginTop: '2px' }}>{c.adresse || 'Adresse non renseignee'}</div>
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: '6px', alignItems: 'center', justifyContent: 'end' }}>
                      <span title={getChantierStatusLabel(chantierStatut)} style={{ ...badgeStyle, borderRadius: '999px', padding: '4px 8px', fontSize: '10px', fontWeight: 700, whiteSpace: 'nowrap', lineHeight: '16px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
                        {getChantierStatusLabel(chantierStatut)}
                      </span>
                      {nextAction ? (
                        <button title={nextAction.label} className="btn-outline btn-sm" style={{ width: '30px', height: '30px', padding: 0, fontSize: '14px', borderColor: '#BFD7EF', color: '#185FA5' }} onClick={() => mettreAJourStatutChantier(c, nextAction.nextStatus)}>
                          Go
                        </button>
                      ) : (
                        null
                      )}
                      <button title="Renommer" onClick={() => { setRenommerItem({ type: 'chantier', data: c }); setNouveauNom(c.nom) }} style={{ width: '30px', height: '30px', background: '#fff', border: '1px solid #D8E3EF', borderRadius: '6px', padding: 0, fontSize: '12px', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>R</button>
                      {/* TODO: cadenas — nécessite colonne `protege boolean default false` sur chantiers en DB */}
                      <button
                        title="Protection non disponible — colonne DB manquante"
                        disabled
                        style={{ width: '30px', height: '30px', background: '#f5f5f5', border: '1px solid #D8E3EF', borderRadius: '6px', padding: 0, fontSize: '14px', cursor: 'not-allowed', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', opacity: 0.4 }}
                      >
                        🔓
                      </button>
                      <button
                        title="Supprimer"
                        onClick={() => setConfirm({ type: 'chantier', data: c })}
                        style={{ width: '30px', height: '30px', background: '#fff', border: '1px solid #f09595', borderRadius: '6px', padding: 0, fontSize: '14px', cursor: 'pointer', color: '#A32D2D', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}
                      >
                        x
                      </button>
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
    const getAnneesGroupe = (groupe) => {
      const set = new Set()
      for (const label of groupe.moisOrdre) {
        const y = label.split(' ').pop()
        if (/^\d{4}$/.test(y || '')) set.add(y)
      }
      return Array.from(set).sort((a, b) => Number(b) - Number(a))
    }

    const selectedGroupe = selectedRegieNom
      ? depannagesGroupes.find(g => g.nom === selectedRegieNom) || null
      : null

    const selectedGroupeEff = selectedGroupe || (selectedRegieNom
      ? { nom: selectedRegieNom, moisOrdre: [], mois: {}, count: 0 }
      : null)

    const formAjoutRegie = ajoutRegie && (
      <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
        <div style={{ fontWeight: 600, fontSize: '14px' }}>Nouvelle régie</div>
        <input
          placeholder="Nom de la régie *"
          value={nouvelleRegieNom}
          onChange={e => setNouvelleRegieNom(e.target.value)}
          style={{ padding: '8px', borderRadius: '6px', border: '1px solid #ddd', fontSize: '13px' }}
        />
        {ajoutRegieErreur && <div style={{ color: '#A32D2D', fontSize: '12px' }}>{ajoutRegieErreur}</div>}
        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            className="btn-primary btn-sm"
            style={{ width: 'auto' }}
            disabled={ajoutRegieSaving}
            onClick={async () => {
              const nom = nouvelleRegieNom.trim()
              if (!nom) { setAjoutRegieErreur('Nom requis.'); return }
              setAjoutRegieSaving(true)
              setAjoutRegieErreur('')
              try {
                const { data: client, error: clientError } = await supabase
                  .from('clients')
                  .insert({ nom, type: 'regie', actif: true })
                  .select('id, nom')
                  .single()
                if (clientError) throw clientError

                const { data, error } = await supabase
                  .from('regies_clients')
                  .insert({ client_id: client.id })
                  .select('id, client_id, notes')
                  .single()
                if (error) throw error

                setRegies(prev => [...prev, { ...client, client_id: client.id, actif: true, type: 'regie', nom: client.nom }].sort((a, b) => (a.nom || '').localeCompare(b.nom || '')))
                setNouvelleRegieNom('')
                setAjoutRegie(false)
              } catch (err) {
                console.error('Erreur création régie', err)
                setAjoutRegieErreur(err.message || 'Erreur inconnue — vérifiez la console.')
              } finally {
                setAjoutRegieSaving(false)
              }
            }}
          >{ajoutRegieSaving ? 'Création...' : 'Créer'}</button>
          <button
            type="button"
            style={{ padding: '6px 14px', borderRadius: '8px', border: '1px solid #ddd', background: 'white', fontSize: '13px', cursor: 'pointer' }}
            onClick={() => { setAjoutRegie(false); setNouvelleRegieNom(''); setAjoutRegieErreur('') }}
          >Annuler</button>
        </div>
      </div>
    )

    const formAjoutDepannage = ajoutDepannage && (
      <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
        <div style={{ fontWeight: 600, fontSize: '14px' }}>Nouveau dépannage — {selectedMois}</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          <label style={{ fontSize: '12px', color: '#555', fontWeight: 500 }}>Date</label>
          <input
            type="date"
            value={nouveauDepannageDate}
            onChange={e => setNouveauDepannageDate(e.target.value)}
            style={{ padding: '8px', borderRadius: '6px', border: '1px solid #ddd', fontSize: '13px' }}
          />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          <label style={{ fontSize: '12px', color: '#555', fontWeight: 500 }}>Adresse</label>
          <input
            placeholder="Adresse du dépannage"
            value={nouveauDepannageAdresse}
            onChange={e => setNouveauDepannageAdresse(e.target.value)}
            style={{ padding: '8px', borderRadius: '6px', border: '1px solid #ddd', fontSize: '13px' }}
          />
        </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          <label style={{ fontSize: '12px', color: '#555', fontWeight: 500 }}>N° de bon</label>
          <input
            placeholder="Numéro de bon (optionnel)"
            value={nouveauDepannageBon}
            onChange={e => setNouveauDepannageBon(e.target.value)}
            style={{ padding: '8px', borderRadius: '6px', border: '1px solid #ddd', fontSize: '13px' }}
          />
        </div>
        {ajoutDepannageErreur && <div style={{ color: '#A32D2D', fontSize: '12px' }}>{ajoutDepannageErreur}</div>}
        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            className="btn-primary btn-sm"
            style={{ width: 'auto' }}
            disabled={ajoutDepannageSaving}
            onClick={async () => {
              if (!nouveauDepannageDate) { setAjoutDepannageErreur('Date requise.'); return }
              if (!nouveauDepannageAdresse.trim()) { setAjoutDepannageErreur('Adresse requise.'); return }
              setAjoutDepannageSaving(true)
              setAjoutDepannageErreur('')
              try {
                const regieObj = regies.find(r => r.nom === selectedRegieNom)
                const { error } = await supabase.from('dossiers').insert({
                  type: 'depannage',
                  client_id: regieObj?.client_id || null,
                  numero_affaire: nouveauDepannageBon.trim() || null,
                  adresse_chantier: nouveauDepannageAdresse.trim(),
                  statut: 'A traiter',
                  description: nouveauDepannageDate,
                  created_by: user?.id || null
                })
                if (error) throw error
                setAjoutDepannage(false)
                setNouveauDepannageBon('')
                setNouveauDepannageAdresse('')
                await chargerDepannages()
              } catch (err) {
                console.error('Erreur création dépannage', err)
                setAjoutDepannageErreur(err.message || 'Erreur lors de la création.')
              } finally {
                setAjoutDepannageSaving(false)
              }
            }}
          >{ajoutDepannageSaving ? 'Création...' : 'Créer'}</button>
          <button
            type="button"
            style={{ padding: '6px 14px', borderRadius: '8px', border: '1px solid #ddd', background: 'white', fontSize: '13px', cursor: 'pointer' }}
            onClick={() => { setAjoutDepannage(false); setNouveauDepannageBon(''); setNouveauDepannageAdresse(''); setAjoutDepannageErreur('') }}
          >Annuler</button>
        </div>
      </div>
    )

    const renderDepannageRow = (d) => {
      const mat = (d.rapport_materiaux || []).reduce((s, m) => s + m.quantite * (m.prix_net || 0), 0)
      const mo = (d._duree || 0) * TAUX
      const ttc = (mat + mo) * 1.081
      const dateLabel = d.date_travail ? new Date(d.date_travail + 'T12:00:00').toLocaleDateString('fr-CH') : 'Date non définie'
      const statut = depannageStatut(d)
      return (
        <div
          key={d.id}
          className="row-item"
          role="button"
          tabIndex={0}
          onClick={() => navigate(`/admin/depannage/${d.id}`, { state: { fromAdminDepannages: true } })}
          onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); navigate(`/admin/depannage/${d.id}`, { state: { fromAdminDepannages: true } }) } }}
          style={{ alignItems: 'flex-start', cursor: 'pointer', gap: '10px', padding: '12px', borderRadius: '14px', border: '1px solid #EEF2F7', background: '#FBFCFE' }}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: '3px', minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
              <span style={{ fontSize: '12px', fontWeight: 700, color: '#333' }}>{dateLabel}</span>
              <span className={`badge ${depannageStatutBadgeClass(statut)}`}>{statut}</span>
            </div>
            <div style={{ fontSize: '13px', fontWeight: 600 }}>{depannageClientAdresse(d)}</div>
            <div style={{ fontSize: '12px', color: '#555' }}>{depannageDescription(d)}</div>
            <div style={{ fontSize: '11px', color: '#888' }}>{d.employe?.prenom || 'Employé non défini'} · Bon #{d.id}</div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
            <div style={{ fontSize: '13px', fontWeight: 600 }}>{ttc.toFixed(0)} CHF</div>
            <span style={{ color: '#185FA5', fontSize: '16px', lineHeight: 1 }}>›</span>
          </div>
        </div>
      )
    }

    const TopBar = ({ onBack, backLabel, title, action }) => (
      <div className="top-bar" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <button
          onClick={onBack}
          style={{ background: 'none', border: 'none', color: '#185FA5', fontSize: '13px', cursor: 'pointer', padding: '4px 0', flexShrink: 0, whiteSpace: 'nowrap' }}
        >← {backLabel}</button>
        <div style={{ flex: 1, textAlign: 'center', fontWeight: 600, fontSize: '15px', color: '#1a202c' }}>{title}</div>
        {adminHeaderRight(action || null)}
      </div>
    )

    // Level 4: mois → dépannages + formulaire création
    if (selectedGroupeEff && selectedAnnee && selectedMois) {
      const deps = (selectedGroupeEff.mois[selectedMois] || [])
      return (
        <div>
          <TopBar
            onBack={() => { setSelectedMois(null); setAjoutDepannage(false); setNouveauDepannageBon(''); setAjoutDepannageErreur('') }}
            backLabel={selectedAnnee}
            title={selectedMois}
            action={
              <button className="btn-primary btn-sm" style={adminHeaderPlusStyle} onClick={() => {
                const regieObj = regies.find(r => r.nom === selectedRegieNom)
                navigate('/admin/depannage/nouveau', {
                  state: {
                    vue: 'depannages',
                    date: new Date().toISOString().slice(0, 10),
                    regieId: regieObj?.id || ''
                  }
                })
              }}>+</button>
            }
          />
          <div className="page-content">
            {formAjoutDepannage}
            {depannagesLoading && <div className="card" style={{ fontSize: '13px', color: '#888' }}>Chargement...</div>}
            {!depannagesLoading && deps.length === 0 && !ajoutDepannage && (
              <div className="card" style={{ textAlign: 'center', color: '#888', fontSize: '13px', padding: '28px' }}>Aucun dépannage ce mois.</div>
            )}
            {!depannagesLoading && deps.map(d => renderDepannageRow(d))}
          </div>
        </div>
      )
    }

    // Level 3: année → mois
    if (selectedGroupeEff && selectedAnnee) {
      const MOIS_NOMS = ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre']
      const nowDate = new Date()
      const nowYear = nowDate.getFullYear()
      const nowMonth = nowDate.getMonth()
      const moisDuGroupe = selectedGroupeEff.moisOrdre.filter(m => m.endsWith(selectedAnnee))
      let moisAfficher
      if (moisDuGroupe.length > 0) {
        moisAfficher = moisDuGroupe
      } else {
        const yr = Number(selectedAnnee)
        const maxM = yr < nowYear ? 11 : (yr === nowYear ? nowMonth : -1)
        moisAfficher = maxM >= 0
          ? MOIS_NOMS.slice(0, maxM + 1).map(m => `${m} ${selectedAnnee}`).reverse()
          : []
      }
      return (
        <div>
          <TopBar
            onBack={() => { setSelectedAnnee(null); setSelectedMois(null); setAjoutDepannage(false) }}
            backLabel={selectedRegieNom}
            title={selectedAnnee}
          />
          <div className="page-content">
            {depannagesLoading && <div className="card" style={{ fontSize: '13px', color: '#888' }}>Chargement...</div>}
            {!depannagesLoading && moisAfficher.length === 0 && (
              <div className="card" style={{ textAlign: 'center', color: '#888', fontSize: '13px', padding: '28px' }}>Aucun mois disponible pour {selectedAnnee}.</div>
            )}
            {!depannagesLoading && moisAfficher.length > 0 && (
              <div className="card">
                {moisAfficher.map((mois, idx) => {
                  const deps = selectedGroupeEff.mois[mois] || []
                  return (
                    <div
                      key={mois}
                      className="row-item"
                      role="button"
                      tabIndex={0}
                      onClick={() => setSelectedMois(mois)}
                      onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setSelectedMois(mois) } }}
                      style={{ cursor: 'pointer', borderBottom: idx < moisAfficher.length - 1 ? '1px solid #eee' : 'none', padding: '12px 4px' }}
                    >
                      <div style={{ fontWeight: 600, fontSize: '14px', color: '#185FA5' }}>{mois}</div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span className="badge badge-blue">{deps.length} dépannage{deps.length !== 1 ? 's' : ''}</span>
                        <span style={{ color: '#185FA5', fontSize: '16px', lineHeight: 1 }}>›</span>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      )
    }

    // Level 2: régie → années
    if (selectedGroupeEff) {
      const annees = getAnneesGroupe(selectedGroupeEff)
      const anneesAffichees = annees.length > 0 ? annees : [String(new Date().getFullYear())]
      return (
        <div>
          <TopBar
            onBack={() => { setSelectedRegieNom(null); setSelectedAnnee(null); setSelectedMois(null); setAjoutDepannage(false) }}
            backLabel="Régies"
            title={selectedRegieNom}
          />
          <div className="page-content">
            <div className="card">
              {depannagesLoading && <div style={{ fontSize: '13px', color: '#888' }}>Chargement...</div>}
              {!depannagesLoading && anneesAffichees.map((annee, idx) => {
                const moisDuGroupe = selectedGroupeEff.moisOrdre.filter(m => m.endsWith(annee))
                const count = moisDuGroupe.reduce((s, m) => s + selectedGroupeEff.mois[m].length, 0)
                return (
                  <div
                    key={annee}
                    className="row-item"
                    role="button"
                    tabIndex={0}
                    onClick={() => setSelectedAnnee(annee)}
                    onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setSelectedAnnee(annee) } }}
                    style={{ cursor: 'pointer', borderBottom: idx < anneesAffichees.length - 1 ? '1px solid #eee' : 'none', padding: '12px 4px' }}
                  >
                    <div style={{ fontWeight: 700, fontSize: '15px', color: '#185FA5' }}>{annee}</div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span className="badge badge-blue">{count} dépannage{count !== 1 ? 's' : ''}</span>
                      <span style={{ color: '#185FA5', fontSize: '16px', lineHeight: 1 }}>›</span>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      )
    }

    // Level 1: liste de toutes les régies
    return (
      <div>
        <TopBar
          onBack={() => setVue('accueil')}
          backLabel="Retour"
          title="Régies"
          action={
            <button className="btn-primary btn-sm" style={adminHeaderPlusStyle} onClick={() => setAjoutRegie(true)}>+</button>
          }
        />
        <div className="page-content">
          {formAjoutRegie}
          <div className="card">
            {depannagesLoading && <div style={{ fontSize: '13px', color: '#888' }}>Chargement des dépannages...</div>}
            {depannagesError && <div style={{ fontSize: '13px', color: '#A32D2D' }}>{depannagesError}</div>}
            {!depannagesLoading && !depannagesError && regies.length === 0 && (
              <div style={{ padding: '28px 18px', textAlign: 'center' }}>
                <div style={{ fontSize: '14px', fontWeight: 700, color: '#185FA5' }}>Aucune régie</div>
                <div style={{ fontSize: '12px', color: '#666', marginTop: '6px' }}>Créez une régie avec le bouton +.</div>
              </div>
            )}
            {!depannagesLoading && !depannagesError && regies.map((regie, idx) => {
              const groupe = depannagesGroupes.find(g => g.nom === regie.nom)
              const count = groupe ? groupe.count : 0
              return (
                <div
                  key={regie.id}
                  className="row-item"
                  role="button"
                  tabIndex={0}
                  onClick={() => { setSelectedRegieNom(regie.nom); setSelectedAnnee(null); setSelectedMois(null) }}
                  onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setSelectedRegieNom(regie.nom); setSelectedAnnee(null); setSelectedMois(null) } }}
                  style={{ cursor: 'pointer', borderBottom: idx < regies.length - 1 ? '1px solid #eee' : 'none', padding: '12px 4px' }}
                >
                  <div>
                    <div style={{ fontSize: '16px', fontWeight: 800, color: '#185FA5' }}>{regie.nom}</div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span className="badge badge-blue">{count} dossier{count !== 1 ? 's' : ''}</span>
                    <span style={{ color: '#185FA5', fontSize: '16px', lineHeight: 1 }}>›</span>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>
    )
  }

  if (vue === 'catalogue') {
    const catsAdmin = ['Tous', ...Array.from(new Set(catalogueAdmin.map(a => a.categorie).filter(Boolean))).sort((a, b) => a.localeCompare(b, 'fr'))]
    const filteredAdmin = catalogueAdmin.filter(a => {
      const matchSearch = !catalogueAdminSearch || (a.nom || '').toLowerCase().includes(catalogueAdminSearch.toLowerCase())
      const matchCat = catalogueAdminCatFiltre === 'Tous' || a.categorie === catalogueAdminCatFiltre
      return matchSearch && matchCat
    })
    return (
      <div>
        <PageHeader
          title="Catalogue"
          subtitle={`${catalogueAdmin.length} articles`}
          onBack={() => setVue('accueil')}
          rightSlot={adminHeaderRight()}
        />
        <div className="page-content">
          {catalogueAdminError && (
            <div style={{ background: '#FCEBEB', border: '1px solid #f09595', borderRadius: '8px', padding: '10px 14px', fontSize: '12px', color: '#A32D2D', marginBottom: '12px' }}>{catalogueAdminError}</div>
          )}
          {catalogueAdminAjout && (
            <div style={{ background: '#E6F1FB', border: '1px solid #185FA5', borderRadius: '10px', padding: '14px', marginBottom: '14px' }}>
              <div style={{ fontWeight: 600, fontSize: '13px', color: '#185FA5', marginBottom: '10px' }}>Nouvel article</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '8px' }}>
                <input placeholder="Désignation" value={catalogueAdminNouvel.nom} onChange={e => setCatalogueAdminNouvel(n => ({ ...n, nom: e.target.value }))} style={{ border: '1px solid #c5daee', borderRadius: '6px', padding: '7px 10px', fontSize: '13px', gridColumn: '1 / -1' }} />
                <input placeholder="Catégorie" value={catalogueAdminNouvel.categorie} onChange={e => setCatalogueAdminNouvel(n => ({ ...n, categorie: e.target.value }))} style={{ border: '1px solid #c5daee', borderRadius: '6px', padding: '7px 10px', fontSize: '13px' }} />
                <input placeholder="Unité (p, m, h…)" value={catalogueAdminNouvel.unite} onChange={e => setCatalogueAdminNouvel(n => ({ ...n, unite: e.target.value }))} style={{ border: '1px solid #c5daee', borderRadius: '6px', padding: '7px 10px', fontSize: '13px' }} />
                <input type="number" placeholder="Prix net CHF" value={catalogueAdminNouvel.prix_net} onChange={e => setCatalogueAdminNouvel(n => ({ ...n, prix_net: e.target.value }))} style={{ border: '1px solid #c5daee', borderRadius: '6px', padding: '7px 10px', fontSize: '13px' }} />
              </div>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button onClick={ajouterArticleCatalogue} disabled={catalogueAdminSaving || !catalogueAdminNouvel.nom.trim()} style={{ background: '#185FA5', color: '#fff', border: 'none', borderRadius: '6px', padding: '7px 14px', fontSize: '13px', cursor: 'pointer', fontWeight: 500 }}>+ Ajouter</button>
                <button onClick={() => { setCatalogueAdminAjout(false); setCatalogueAdminNouvel({ nom: '', unite: '', prix_net: '', categorie: '' }) }} style={{ background: '#fff', border: '1px solid #c5daee', borderRadius: '6px', padding: '7px 14px', fontSize: '13px', cursor: 'pointer' }}>Annuler</button>
              </div>
            </div>
          )}
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '10px', flexWrap: 'wrap' }}>
            <input
              placeholder="Rechercher…"
              value={catalogueAdminSearch}
              onChange={e => setCatalogueAdminSearch(e.target.value)}
              style={{ flex: '1 1 160px', border: '1px solid #D8E3EF', borderRadius: '6px', padding: '7px 10px', fontSize: '13px' }}
            />
            {!catalogueAdminAjout && (
              <button onClick={() => setCatalogueAdminAjout(true)} style={{ background: '#185FA5', color: '#fff', border: 'none', borderRadius: '6px', padding: '7px 12px', fontSize: '13px', cursor: 'pointer', whiteSpace: 'nowrap' }}>+ Ajouter</button>
            )}
          </div>
          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '12px' }}>
            {catsAdmin.map(cat => (
              <button key={cat} onClick={() => setCatalogueAdminCatFiltre(cat)} style={{ background: catalogueAdminCatFiltre === cat ? '#185FA5' : '#D8E3EF', color: catalogueAdminCatFiltre === cat ? '#fff' : '#185FA5', border: 'none', borderRadius: '20px', padding: '4px 10px', fontSize: '12px', cursor: 'pointer', fontWeight: catalogueAdminCatFiltre === cat ? 600 : 400 }}>{cat}</button>
            ))}
          </div>
          {catalogueAdminLoading && <div style={{ textAlign: 'center', color: '#888', padding: '20px', fontSize: '13px' }}>Chargement…</div>}
          {!catalogueAdminLoading && (
            <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
              {filteredAdmin.length === 0 && (
                <div style={{ textAlign: 'center', color: '#888', fontSize: '13px', padding: '20px' }}>Aucun article trouvé.</div>
              )}
              {filteredAdmin.map((a, i) => (
                <div key={a.id} style={{ display: 'grid', gridTemplateColumns: '1fr auto auto auto', gap: '8px', alignItems: 'center', padding: '10px 14px', borderBottom: i < filteredAdmin.length - 1 ? '1px solid #F0F4F8' : 'none', opacity: a.actif ? 1 : 0.55 }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: '11px', color: '#185FA5', fontWeight: 500, marginBottom: '2px' }}>{a.categorie}</div>
                    <div style={{ fontSize: '13px', fontWeight: 500, color: '#1a1a2e', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{a.nom}</div>
                    <div style={{ fontSize: '11px', color: '#888' }}>{a.unite}</div>
                  </div>
                  {catalogueAdminEdit === a.id ? (
                    <input
                      type="number"
                      defaultValue={a.prix_net ?? ''}
                      autoFocus
                      onBlur={e => sauvegarderArticleCatalogue(a.id, { prix_net: e.target.value !== '' ? parseFloat(e.target.value) : null })}
                      onKeyDown={e => { if (e.key === 'Enter') e.target.blur(); if (e.key === 'Escape') setCatalogueAdminEdit(null) }}
                      style={{ width: '72px', border: '1px solid #185FA5', borderRadius: '6px', padding: '4px 8px', fontSize: '13px', textAlign: 'right' }}
                    />
                  ) : (
                    <button onClick={() => setCatalogueAdminEdit(a.id)} style={{ background: '#F3F4F6', border: '1px solid #e5e7eb', borderRadius: '6px', padding: '4px 8px', fontSize: '13px', cursor: 'pointer', minWidth: '60px', textAlign: 'right' }}>
                      {a.prix_net != null ? Number(a.prix_net).toFixed(2) : '—'}
                    </button>
                  )}
                  <div style={{ fontSize: '11px', color: '#888' }}>CHF</div>
                  <button
                    onClick={() => sauvegarderArticleCatalogue(a.id, { actif: !a.actif })}
                    style={{ background: a.actif ? '#E7F6EA' : '#F3F4F6', color: a.actif ? '#247A35' : '#9CA3AF', border: `1px solid ${a.actif ? '#B9DFC1' : '#e5e7eb'}`, borderRadius: '6px', padding: '4px 8px', fontSize: '11px', cursor: 'pointer', whiteSpace: 'nowrap' }}
                  >
                    {a.actif ? 'Actif' : 'Inactif'}
                  </button>
                </div>
              ))}
            </div>
          )}
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
        <PageHeader
          title="Calendrier"
          subtitle="Tableau de bord admin"
          onBack={() => setVue('accueil')}
          rightSlot={adminHeaderRight()}
        />
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
                  <div style={{ fontSize: '12px', color: '#555', paddingLeft: '14px' }}>{r.sous_dossiers?.chantiers?.nom || r.affaires?.chantiers?.nom || '—'}{(r.sous_dossiers?.nom || r.affaires?.nom) ? ` › ${r.sous_dossiers?.nom || r.affaires?.nom}` : ''}</div>
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
      <PageHeader
        title="Vacances"
        subtitle="Demandes, quotas et périodes spéciales"
        onBack={() => ouvrirVueAdmin('employes')}
        rightSlot={adminHeaderRight()}
      />
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
      <PageHeader
        title="Employés"
        subtitle="Fiches, heures et vacances"
        onBack={() => setVue('accueil')}
        rightSlot={adminHeaderRight()}
      />
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
      const nom = r.sous_dossiers?.chantiers?.nom || r.affaires?.chantiers?.nom || 'Chantier inconnu'
      if (!parChantier[nom]) parChantier[nom] = []
      parChantier[nom].push(r)
    }

    return (
      <div>
        <PageHeader
          title={empDetail.prenom}
          subtitle="Fiche employé"
          onBack={() => setVue('employes')}
          rightSlot={adminHeaderRight()}
        />

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
                        {(r.sous_dossiers?.nom || r.affaires?.nom) && <span style={{ color: '#999', marginLeft: '6px' }}>· {r.sous_dossiers?.nom || r.affaires?.nom}</span>}
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

  if (vue === 'rapports_v1') return (
    <div>
      <PageHeader
        title="Rapports V1"
        subtitle="Rapports terrain (hors chantier)"
        onBack={() => setVue('accueil')}
        rightSlot={adminHeaderRight()}
      />
      <div className="page-content">
        {rapportsV1Loading && (
          <div style={{ textAlign: 'center', color: '#888', fontSize: '13px', padding: '20px 0' }}>Chargement...</div>
        )}
        {!rapportsV1Loading && rapportsV1.length === 0 && (
          <div className="card" style={{ textAlign: 'center', color: '#888', fontSize: '13px' }}>
            Aucun rapport V1 pour l'instant.
          </div>
        )}
        {!rapportsV1Loading && rapportsV1.map(r => {
          const heures = r.heure_debut && r.heure_fin ? `${r.heure_debut.slice(0, 5)} – ${r.heure_fin.slice(0, 5)}` : null
          return (
            <div key={r.id} className="card" style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ fontWeight: 600, fontSize: '13px' }}>
                  {new Date(r.date_travail + 'T12:00:00').toLocaleDateString('fr-CH', { weekday: 'short', day: '2-digit', month: '2-digit', year: 'numeric' })}
                </div>
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                  {heures && <span style={{ fontSize: '11px', color: '#555' }}>{heures}</span>}
                  <span style={{ fontSize: '11px', fontWeight: 600, padding: '2px 8px', borderRadius: '10px', background: r.valide ? '#EAF3DE' : '#FAEEDA', color: r.valide ? '#3B6D11' : '#BA7517' }}>
                    {r.valide ? 'Validé' : 'En attente'}
                  </span>
                </div>
              </div>
              <div style={{ fontSize: '12px', color: '#666', fontWeight: 500 }}>{r.employe?.prenom || '—'}</div>
              {r.remarques && (
                <div style={{ fontSize: '12px', color: '#444', whiteSpace: 'pre-wrap', background: '#F8F8F8', borderRadius: '6px', padding: '8px 10px' }}>
                  {r.remarques}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )

  // ─── Accueil — 4 entrées (tâche 7) ───────────────────────────────────────
  return (
    <div>
      <PageHeader
        title={`Bonjour, ${user?.prenom || ''}`}
        subtitle="Tableau de bord admin"
        rightSlot={adminHeaderRight(corbeille.length > 0 && (
          <button onClick={() => setVueCorbeille(true)} style={{ background: 'none', border: '1px solid #ddd', borderRadius: '6px', padding: '4px 8px', fontSize: '12px', cursor: 'pointer' }}>
            🗑️ {corbeille.length}
          </button>
        ))}
      />
      <div className="page-content">
        {adminError && <div style={{ background: '#FCEBEB', border: '1px solid #f09595', borderRadius: '8px', padding: '10px 14px', fontSize: '12px', color: '#A32D2D' }}>{adminError}</div>}
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
          <button onClick={() => setVue('catalogue')}
            style={{ background: '#E6F1FB', border: '1px solid #185FA5', borderRadius: '12px', padding: '20px 12px', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '28px' }}>📋</span>
            <span style={{ fontWeight: 600, fontSize: '14px', color: '#185FA5' }}>Catalogue</span>
            <span style={{ fontSize: '11px', color: '#666' }}>{catalogue.length} actifs</span>
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
