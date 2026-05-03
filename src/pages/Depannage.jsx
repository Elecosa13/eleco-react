import React, { useEffect, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import PageHeader from '../components/PageHeader'
import PageTopActions, { navigateBackWithFallback } from '../components/PageTopActions'
import PhotoInputPanel from '../components/PhotoInputPanel'
import { useDraftPhotos } from '../lib/photo-drafts'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth-context'
import { safeLocalStorage } from '../lib/safe-browser'
import { usePageRefresh } from '../lib/refresh'

const DUREES = [1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5, 5.5, 6, 6.5, 7, 7.5, 8]
const FAVORIS_KEY = 'eleco_favoris'
const CREDIT_JOUR = 8

function loadFavoris() {
  return safeLocalStorage.getJSON(FAVORIS_KEY, [])
}

function saveFavoris(favoris) {
  safeLocalStorage.setJSON(FAVORIS_KEY, favoris)
}

function buildRegiesFromRegiesClients(regiesClients) {
  return (regiesClients || [])
    .filter(regie => regie.client_id)
    .map(regie => ({
      id: regie.client_id,
      nom: regie.clients?.nom || `Client ${regie.client_id}`,
      nom_normalise: String(regie.clients?.nom || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    }))
}

function mapDossierToChantierOption(dossier) {
  return {
    id: dossier.id,
    nom: dossier.numero_affaire || dossier.description || 'Dossier',
    adresse: dossier.adresse_chantier || ''
  }
}

export default function Depannage({ mode = 'employe' }) {
  const location = useLocation()
  const navigate = useNavigate()
  const { profile: user } = useAuth()
  const isAdminMode = mode === 'admin'
  const depannageId = new URLSearchParams(location.search).get('depannageId')
  const initialDate = location.state?.date || new Date().toISOString().split('T')[0]
  const initialRegieId = location.state?.regieId || ''

  const [adresse, setAdresse] = useState('')
  const [numeroBon, setNumeroBon] = useState('')
  const [duree, setDuree] = useState(1)
  const [remarques, setRemarques] = useState('')
  const [date, setDate] = useState(initialDate)
  const [creditUtilise, setCreditUtilise] = useState(0)
  const [envoi, setEnvoi] = useState(false)
  const [soumissionVerrouillee, setSoumissionVerrouillee] = useState(false)
  const [succes, setSucces] = useState(false)
  const [materiaux, setMateriaux] = useState([])
  const [catalogue, setCatalogue] = useState([])
  const [categories, setCategories] = useState([])
  const [catalogueVue, setCatalogueVue] = useState(false)
  const [recherche, setRecherche] = useState('')
  const [catFiltre, setCatFiltre] = useState('Favoris')
  const [favoris, setFavoris] = useState(loadFavoris)
  const [articleManuel, setArticleManuel] = useState({ nom: '', unite: 'pce', qte: 1 })
  const [regies, setRegies] = useState([])
  const [regieId, setRegieId] = useState('')
  const [regieNonAssigneeId, setRegieNonAssigneeId] = useState('')
  const [chantiers, setChantiers] = useState([])
  const [chantierId, setChantierId] = useState('')
  const [employes, setEmployes] = useState([])
  const [employeId, setEmployeId] = useState('')
  const [depannageResponsableId, setDepannageResponsableId] = useState('')
  const [rapportExistantId, setRapportExistantId] = useState('')
  const [rapportValide, setRapportValide] = useState(false)
  const [photosExistantes, setPhotosExistantes] = useState([])
  const [erreur, setErreur] = useState('')
  const [rapportErreur, setRapportErreur] = useState('')
  const [loading, setLoading] = useState(true)
  const { photos, addFiles, removePhoto, clearPhotos } = useDraftPhotos(`depannage-draft:${isAdminMode ? 'admin' : user?.id || 'anon'}:${depannageId || 'new'}`)
  const refreshPage = usePageRefresh(() => charger(), [depannageId, user?.id, isAdminMode])

  useEffect(() => {
    charger()
  }, [depannageId])

  useEffect(() => {
    chargerCredit(date).catch(error => {
      console.error('Erreur chargement credit depannage', error)
      setErreur('Impossible de charger les données. Réessaie dans un instant.')
    })
  }, [date, user?.id, employeId, isAdminMode])

  async function charger() {
    setLoading(true)
    setErreur('')
    setRapportErreur('')

    try {
      const [regiesResult, catalogueResult, chantiersResult, employesResult] = await Promise.all([
        supabase.from('regies_clients').select('id, client_id, clients(id, nom)').order('created_at'),
        supabase.from('catalogue_employe').select('id, categorie, nom, unite').order('categorie').order('nom'),
        supabase.from('dossiers').select('id, numero_affaire, description, adresse_chantier, statut').order('created_at'),
        isAdminMode
          ? supabase.from('utilisateurs').select('id, prenom, initiales').eq('role', 'employe').order('prenom')
          : Promise.resolve({ data: [], error: null })
      ])

      if (regiesResult.error) throw Object.assign(regiesResult.error, {
        queryName: 'charger.regies depuis depannages',
        queryTable: 'regies_clients',
        querySelect: 'id, client_id'
      })
      if (catalogueResult.error) throw Object.assign(catalogueResult.error, {
        queryName: 'charger.catalogue',
        queryTable: 'catalogue_employe',
        querySelect: 'id, categorie, nom, unite'
      })
      if (chantiersResult.error) throw Object.assign(chantiersResult.error, {
        queryName: 'charger.chantiers',
        queryTable: 'dossiers',
        querySelect: 'id, numero_affaire, description, adresse_chantier, statut'
      })
      if (employesResult.error) throw Object.assign(employesResult.error, {
        queryName: 'charger.employes',
        queryTable: 'utilisateurs',
        querySelect: 'id, prenom, initiales'
      })

      const listeRegies = buildRegiesFromRegiesClients(regiesResult.data || [])
      const nonAssignee = listeRegies.find(regie => regie.nom_normalise === 'non assignee')
      setRegies(listeRegies)
      setRegieNonAssigneeId(nonAssignee?.id || '')
      setRegieId(current => current || initialRegieId || nonAssignee?.id || listeRegies[0]?.id || '')

      const listeCatalogue = catalogueResult.data || []
      setCatalogue(listeCatalogue)
      setCategories(['Favoris', ...Array.from(new Set(listeCatalogue.map(article => article.categorie).filter(Boolean)))])
      setChantiers((chantiersResult.data || []).map(mapDossierToChantierOption))
      setEmployes(employesResult.data || [])

      if (depannageId) {
        await chargerDepannageExistant()
      }

      await chargerCredit(date)
    } catch (error) {
      console.error('Erreur chargement depannage Supabase', {
        queryName: error?.queryName,
        table: error?.queryTable,
        select: error?.querySelect,
        message: error?.message,
        details: error?.details,
        hint: error?.hint,
        code: error?.code,
        error
      })
      setErreur('Impossible de charger les données. Réessaie dans un instant.')
    } finally {
      setLoading(false)
    }
  }

  async function chargerDepannageExistant() {
    const { data: depannage, error: depannageError } = await supabase
      .from('dossiers')
      .select('*')
      .eq('id', depannageId)
      .eq('type', 'depannage')
      .maybeSingle()

    if (depannageError) throw depannageError
    if (!depannage) throw new Error('depannage_introuvable')

    setAdresse(depannage.adresse_chantier || '')
    setNumeroBon(depannage.numero_affaire || '')
    setDuree(1)
    setRemarques(depannage.description || '')
    setRegieId(depannage.client_id || regieNonAssigneeId || '')
    setChantierId(depannage.id || '')
    setDepannageResponsableId(depannage.created_by || '')

    try {
      const rapportEmployeId = isAdminMode ? employeId : user?.id
      let rapport = null

      if (rapportEmployeId) {
        const { data, error: rapportError } = await supabase
          .from('rapports')
          .select('id, dossier_id, date_intervention, heures, heures_deplacement, materiaux_notes, notes, statut')
          .eq('dossier_id', depannageId)
          .eq('employe_id', rapportEmployeId)
          .maybeSingle()

        if (rapportError) throw rapportError
        rapport = data || null
      }

      const { data: commonMateriaux, error: commonMateriauxError } = await supabase
        .from('lignes_facturables')
        .select('id, dossier_id, rapport_id, type, description, quantite, prix_unitaire')
        .eq('dossier_id', depannageId)
        .eq('type', 'materiel')

      if (commonMateriauxError) throw commonMateriauxError
      setMateriaux((commonMateriaux || []).map(mapRapportMateriauToUi))

      if (!rapport) {
        setRapportExistantId('')
        setRapportValide(false)
        setPhotosExistantes([])
        return
      }

      setRapportExistantId(rapport.id)
      setRapportValide(rapport.statut === 'valide')
      setDuree(Number(rapport.heures || 0) || 1)
      setDate(rapport.date_intervention || '')
      setRemarques(rapport.notes || depannage.description || '')
      // TODO: table manquante rapport_photos
      setPhotosExistantes([])
    } catch (error) {
      console.error('Erreur chargement rapport depannage existant', error)
      setRapportExistantId('')
      setRapportValide(false)
      setMateriaux([])
      setPhotosExistantes([])
      setRapportErreur("Le rapport existant n'a pas pu etre charge pour l'instant.")
    }
  }

  async function chargerCredit(nextDate = date) {
    const targetEmployeId = isAdminMode ? employeId : user?.id
    if (!targetEmployeId) {
      setCreditUtilise(0)
      return
    }
    const { data, error } = await supabase
      .from('rapports')
      .select('heures, heures_deplacement')
      .eq('employe_id', targetEmployeId)
      .eq('date_intervention', nextDate)

    if (error) throw error
    if (data) setCreditUtilise(data.reduce((sum, entry) => sum + Number(entry.heures || 0) + Number(entry.heures_deplacement || 0), 0))
  }

  function toggleFavori(favId) {
    const next = favoris.includes(favId) ? favoris.filter(id => id !== favId) : [...favoris, favId]
    setFavoris(next)
    saveFavoris(next)
  }

  function ajouter(article) {
    setMateriaux(current => {
      const existant = current.find(item => String(item.id) === String(article.id))
      if (existant) {
        return current.map(item => String(item.id) === String(article.id) ? { ...item, qte: item.qte + 1 } : item)
      }

      return [
        ...current,
        {
          id: article.id,
          catalogueId: article.id,
          nom: article.nom,
          unite: normalizeUnite(article.unite, article.nom),
          qte: 1
        }
      ]
    })
  }

  function ajouterManuel() {
    if (!articleManuel.nom.trim()) return
    setMateriaux([
      ...materiaux,
      {
        id: `manuel-${Date.now()}`,
        catalogueId: null,
        manuel: true,
        nom: articleManuel.nom.trim(),
        unite: normalizeUnite(articleManuel.unite, articleManuel.nom),
        qte: Math.max(0, Number(articleManuel.qte) || 0)
      }
    ])
    setArticleManuel({ nom: '', unite: 'pce', qte: 1 })
  }

  function modQte(materiauId, delta) {
    setMateriaux(
      current => current.map(item => String(item.id) === String(materiauId) ? { ...item, qte: Math.max(0, item.qte + delta) } : item)
    )
  }

  function setQte(materiauId, value) {
    const nextQte = Math.max(0, Number(value) || 0)
    setMateriaux(current => current.map(item => String(item.id) === String(materiauId) ? { ...item, qte: nextQte } : item))
  }

  function supprimerMateriau(materiauId) {
    setMateriaux(materiaux.filter(item => item.id !== materiauId))
  }

  function renderQuantiteControl(item, disabled = false) {
    if (isUniteMetre(item)) {
      return (
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
          <input
            type="number"
            inputMode="numeric"
            min="0"
            step="1"
            value={item.qte}
            disabled={disabled}
            onChange={event => setQte(item.id, event.target.value)}
            style={{ width: '74px', minHeight: '34px', padding: '6px 8px', border: '1px solid #ddd', borderRadius: '8px', background: 'white', fontSize: '15px', fontWeight: 700, textAlign: 'center' }}
          />
          <span style={{ fontSize: '13px', fontWeight: 700 }}>m</span>
        </div>
      )
    }

    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
        <button type="button" disabled={disabled} onClick={() => modQte(item.id, -10)} style={qteButtonStyle(disabled)}>&lt;&lt;</button>
        <button type="button" disabled={disabled} onClick={() => modQte(item.id, -1)} style={qteButtonStyle(disabled)}>&lt;</button>
        <span style={{ fontWeight: 700, minWidth: '24px', textAlign: 'center', fontSize: '13px' }}>{item.qte}</span>
        <button type="button" disabled={disabled} onClick={() => modQte(item.id, 1)} style={qteButtonStyle(disabled)}>&gt;</button>
        <button type="button" disabled={disabled} onClick={() => modQte(item.id, 10)} style={qteButtonStyle(disabled)}>&gt;&gt;</button>
      </div>
    )
  }

  async function ajouterPhotosDepuisListe(fileList) {
    try {
      await addFiles(fileList)
    } catch (error) {
      console.error('Erreur preparation photos depannage', error)
      setRapportErreur("Impossible d'ajouter cette photo pour l'instant.")
    }
  }

  function retirerPhoto(photoId) {
    removePhoto(photoId)
  }

  const articlesFiltres = (() => {
    let liste = catalogue
    if (catFiltre === 'Favoris') liste = catalogue.filter(article => favoris.includes(article.id))
    else if (catFiltre) liste = catalogue.filter(article => article.categorie === catFiltre)
    if (recherche) liste = liste.filter(article => article.nom.toLowerCase().includes(recherche.toLowerCase()))
    return liste.slice(0, 80)
  })()

  async function envoyer(event) {
    event.preventDefault()
    if (envoi || soumissionVerrouillee) return
    if (rapportValide) {
      setErreur("Ce rapport est deja valide. Les heures et la recreation sont verrouillees cote employe.")
      return
    }
    if (!adresse.trim()) return
    if (isAdminMode && !employeId) {
      setErreur("SÃ©lectionne l'employÃ© pour qui crÃ©er le rapport.")
      return
    }
    if (!user?.id) {
      setErreur("Impossible d'identifier l'utilisateur connecté.")
      return
    }

    setEnvoi(true)
    setErreur('')
    let depannageSauveId = depannageId || null
    let rapportSauveId = rapportExistantId || null
    const employeFinalId = isAdminMode ? employeId : user.id

    try {
      const regieIdFinal = regieId || regieNonAssigneeId || null
      const depannagePayload = {
        client_id: regieIdFinal,
        type: 'depannage',
        adresse_chantier: adresse.trim(),
        description: remarques.trim(),
        statut: 'À traiter',
        ...(isAdminMode ? { numero_affaire: numeroBon.trim() || null } : {})
      }

      if (!depannageSauveId) {
        depannagePayload.created_by = user.id
      }

      if (depannageSauveId) {
        const { data: depannageUpdated, error: depannageUpdateError } = await supabase
          .from('dossiers')
          .update(depannagePayload)
          .eq('id', depannageSauveId)
          .select('id')
          .maybeSingle()

        if (depannageUpdateError) throw depannageUpdateError
        if (!depannageUpdated?.id) throw new Error('depannage_update_empty')
      } else {
        console.log('[depannage-insert] payload:', JSON.stringify(depannagePayload), '| user.id:', user?.id)
        const { data: depannageInserted, error: depannageInsertError } = await supabase
          .from('dossiers')
          .insert(depannagePayload)
          .select('id')
          .single()

        if (depannageInsertError) throw depannageInsertError
        if (!depannageInserted?.id) throw new Error('depannage_insert_empty')
        depannageSauveId = depannageInserted.id
      }

      // TODO: table manquante depannage_intervenants

      const rapportPayload = {
        dossier_id: depannageSauveId,
        employe_id: employeFinalId,
        date_intervention: date,
        heures: Number(duree) || 1,
        heures_deplacement: 0,
        materiaux_notes: materiaux.map(item => `${item.qte} ${item.unite} ${item.nom}`).join('\n') || null,
        notes: remarques.trim(),
        statut: 'envoye',
        modifie_par_admin: isAdminMode
      }

      if (rapportSauveId) {
        const { data: rapportUpdated, error: rapportUpdateError } = await supabase
          .from('rapports')
          .update(rapportPayload)
          .eq('id', rapportSauveId)
          .select('id')
          .maybeSingle()

        if (rapportUpdateError) throw rapportUpdateError
        if (!rapportUpdated?.id) throw new Error('rapport_update_empty')
      } else {
        const { data: rapportInserted, error: rapportInsertError } = await supabase
          .from('rapports')
          .insert(rapportPayload)
          .select('id')
          .single()

        if (rapportInsertError) throw rapportInsertError
        if (!rapportInserted?.id) throw new Error('rapport_insert_empty')
        rapportSauveId = rapportInserted.id
      }

      await sauvegarderTimeEntry(depannageSauveId, employeFinalId)
      if (peutModifierMateriaux) {
        await sauvegarderMateriaux(depannageSauveId)
      }

      if (photos.length > 0) {
        // TODO: table manquante rapport_photos
      }

      const { error: statutError } = await supabase
        .from('dossiers')
        .update({
          // TODO: colonne manquante chantier_id
          statut: 'Rapport reçu',
          // TODO: colonne manquante rapport_envoye_le
        })
        .eq('id', depannageSauveId)

      if (statutError) throw statutError

      clearPhotos()
      setSucces(true)
      setTimeout(() => {
        if (isAdminMode) {
          navigate('/admin', { state: { vue: 'depannages' } })
        } else {
          const navState = initialRegieId ? {
            restoreDepannages: true,
            regieId: initialRegieId,
            moisSel: location.state?.moisSel || date.substring(0, 7)
          } : undefined
          navigate('/employe', { state: navState })
        }
      }, 2000)
    } catch (error) {
      console.error('Erreur enregistrement dépannage', error)
      if (String(error?.message || '').includes('locked_validated_report')) {
        setRapportValide(true)
        setErreur("Ce rapport est deja valide. Les heures et la recreation sont verrouillees cote employe.")
        return
      }
      if (String(error?.message || '').includes('depannage_employe_id_locked')) {
        setErreur("Ce dépannage est déjà assigné à un autre employé. Le rapport n’a pas été enregistré.")
        return
      }
      if (depannageSauveId || rapportSauveId) {
        setSoumissionVerrouillee(true)
        setErreur("Le rapport a probablement été enregistré partiellement. Retourne à l'accueil et laisse l'administration contrôler le dossier avant une nouvelle tentative.")
        return
      }
      setErreur(`[DIAG] ${error?.message || String(error)} | code:${error?.code ?? '?'} | details:${error?.details ?? '-'}`)
    } finally {
      setEnvoi(false)
    }
  }

  async function sauvegarderTimeEntry(depannageSauveId, employeFinalId) {
    // time_entries -> rapports dans le schema V1; les heures sont sauvegardees dans rapportPayload.
  }

  async function sauvegarderMateriaux(depannageSauveId) {
    const { error: deleteError } = await supabase
      .from('lignes_facturables')
      .delete()
      .eq('dossier_id', depannageSauveId)
      .eq('type', 'materiel')

    if (deleteError) throw deleteError
    if (materiaux.length === 0) return

    const { error: insertError } = await supabase
      .from('lignes_facturables')
      .insert(materiaux.map(item => ({
        dossier_id: depannageSauveId,
        type: 'materiel',
        description: `${item.nom}${item.unite ? ` (${item.unite})` : ''}`,
        quantite: Math.max(0, Number(item.qte) || 0),
        prix_unitaire: 0,
        montant_ht: 0,
        statut: 'brouillon'
      })))

    if (insertError) throw insertError
  }

  const creditRestant = CREDIT_JOUR - creditUtilise
  const depasse = creditUtilise + duree > CREDIT_JOUR
  const rapportEmployeVerrouille = soumissionVerrouillee || rapportValide || (!isAdminMode && Boolean(rapportExistantId))
  const peutModifierMateriaux = isAdminMode || !depannageId || !depannageResponsableId || String(depannageResponsableId) === String(user?.id)
  const retourFallback = isAdminMode ? '/admin' : '/employe'

  function retourPagePrecedente() {
    const target = location.state?.from || retourFallback
    if (!isAdminMode && location.state?.regieId) {
      navigate(target, {
        state: {
          restoreDepannages: true,
          regieId: location.state.regieId,
          moisSel: location.state.moisSel || null
        }
      })
    } else {
      navigate(target)
    }
  }

  const depannageHeaderRight = (extra = null) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
      <PageTopActions navigate={navigate} fallbackPath={isAdminMode ? '/admin' : '/employe'} onRefresh={refreshPage} refreshing={loading} showBack={false} />
      <button className="avatar" style={isAdminMode ? { background: '#FAEEDA', color: '#BA7517' } : undefined}>{user?.initiales}</button>
      {extra}
    </div>
  )

  if (succes) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '16px' }}>
        <div style={{ fontSize: '48px' }}>✓</div>
        <div style={{ fontWeight: 600, fontSize: '16px' }}>{isAdminMode ? 'Rapport dépannage créé.' : 'Rapport dépannage envoyé.'}</div>
      </div>
    )
  }

  if (catalogueVue) {
    return (
      <div>
        <PageHeader
          title="Catalogue"
          subtitle={isAdminMode ? 'Tableau de bord admin' : 'Espace employé'}
          onBack={() => setCatalogueVue(false)}
          rightSlot={depannageHeaderRight(materiaux.length > 0 ? <span className="badge badge-blue">{materiaux.reduce((sum, item) => sum + item.qte, 0)}</span> : null)}
        />
        <div className="page-content">
          {erreur && (
            <div style={{ background: '#FCEBEB', border: '1px solid #f09595', borderRadius: '8px', padding: '10px 14px', fontSize: '12px', color: '#A32D2D' }}>
              {erreur}
            </div>
          )}
          <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <div style={{ fontWeight: 600, fontSize: '13px', color: '#185FA5' }}>Article manuel</div>
            <div className="form-group">
              <label>Designation *</label>
              <input value={articleManuel.nom} onChange={event => setArticleManuel(current => ({ ...current, nom: event.target.value }))} placeholder="Ex: materiel specifique" />
            </div>
            <div className="grid2">
              <div className="form-group">
                <label>Unite</label>
                <select value={articleManuel.unite} onChange={event => setArticleManuel(current => ({ ...current, unite: event.target.value }))}>
                  <option value="pce">pce</option>
                  <option value="m">m</option>
                </select>
              </div>
              <div className="form-group">
                <label>Quantite</label>
                <input type="number" min="0" value={articleManuel.qte} onChange={event => setArticleManuel(current => ({ ...current, qte: event.target.value }))} />
              </div>
            </div>
            <button type="button" className="btn-primary" disabled={!articleManuel.nom.trim()} onClick={ajouterManuel}>+ Ajouter l'article manuel</button>
          </div>
          <input type="search" placeholder="Rechercher..." value={recherche} onChange={event => setRecherche(event.target.value)} />
          <div style={{ display: 'flex', gap: '6px', overflowX: 'auto', paddingBottom: '4px' }}>
            {categories.map(categorie => (
              <button
                type="button"
                key={categorie}
                onClick={() => setCatFiltre(categorie)}
                style={{
                  padding: '5px 12px',
                  borderRadius: '20px',
                  fontSize: '12px',
                  fontWeight: 500,
                  cursor: 'pointer',
                  border: catFiltre === categorie ? 'none' : '1px solid #ddd',
                  background: catFiltre === categorie ? '#185FA5' : 'white',
                  color: catFiltre === categorie ? 'white' : '#333',
                  whiteSpace: 'nowrap'
                }}
              >
                {categorie === 'Favoris' ? `⭐ Favoris (${favoris.length})` : categorie}
              </button>
            ))}
          </div>
          {loading && <div style={{ textAlign: 'center', padding: '30px', color: '#888' }}>Chargement...</div>}
          {!loading && catFiltre === 'Favoris' && favoris.length === 0 && (
            <div style={{ textAlign: 'center', color: '#888', fontSize: '13px', padding: '20px' }}>Appuie sur ⭐ pour ajouter des favoris</div>
          )}
          <div className="card" style={{ padding: 0 }}>
            {articlesFiltres.map((article, index) => {
              const qte = materiaux.find(item => String(item.id) === String(article.id))?.qte || 0
              return (
                <div key={article.id} style={{ display: 'flex', alignItems: 'center', padding: '10px 14px', gap: '8px', borderBottom: index < articlesFiltres.length - 1 ? '1px solid #eee' : 'none' }}>
                  <button type="button" onClick={() => toggleFavori(article.id)} style={{ background: 'none', border: 'none', fontSize: '16px', cursor: 'pointer', opacity: favoris.includes(article.id) ? 1 : 0.25, padding: 0, flexShrink: 0 }}>⭐</button>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: '13px', fontWeight: 500 }}>{article.nom}</div>
                    <div style={{ fontSize: '11px', color: '#888' }}>{article.categorie} · {normalizeUnite(article.unite, article.nom)}</div>
                  </div>
                  {qte === 0 ? (
                    <button type="button" onClick={() => ajouter(article)} style={{ width: 28, height: 28, borderRadius: '50%', border: '1px solid #185FA5', background: '#E6F1FB', color: '#185FA5', fontSize: '18px', cursor: 'pointer', flexShrink: 0 }}>+</button>
                  ) : (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
                      <button type="button" onClick={() => modQte(article.id, -1)} style={{ width: 26, height: 26, borderRadius: '50%', border: '1px solid #ddd', background: 'white', cursor: 'pointer', fontSize: '14px' }}>−</button>
                      <span style={{ fontSize: '13px', fontWeight: 600, minWidth: '20px', textAlign: 'center' }}>{qte}</span>
                      <button type="button" onClick={() => modQte(article.id, 1)} style={{ width: 26, height: 26, borderRadius: '50%', border: '1px solid #185FA5', background: '#185FA5', color: 'white', cursor: 'pointer', fontSize: '14px' }}>+</button>
                    </div>
                  )}
                </div>
              )
            })}
            {!loading && articlesFiltres.length === 0 && <div style={{ padding: '20px', textAlign: 'center', color: '#888', fontSize: '13px' }}>Aucun article</div>}
          </div>
          <button type="button" className="btn-primary" onClick={() => setCatalogueVue(false)}>✓ Confirmer ({materiaux.reduce((sum, item) => sum + item.qte, 0)} articles)</button>
        </div>
      </div>
    )
  }

  return (
    <div>
      <PageHeader
        title={depannageId ? 'Rapport dépannage' : 'Nouveau dépannage'}
        subtitle={isAdminMode ? 'Tableau de bord admin' : 'Espace employé'}
        onBack={retourPagePrecedente}
        rightSlot={depannageHeaderRight()}
      />

      <form onSubmit={envoyer}>
        <div className="page-content">
          {erreur && (
            <div style={{ background: '#FCEBEB', border: '1px solid #f09595', borderRadius: '8px', padding: '10px 14px', fontSize: '12px', color: '#A32D2D' }}>
              {erreur}
            </div>
          )}
          {rapportErreur && (
            <div style={{ background: '#FAEEDA', border: '1px solid #efd19c', borderRadius: '8px', padding: '10px 14px', fontSize: '12px', color: '#8A5A10' }}>
              {rapportErreur}
            </div>
          )}
          {rapportValide && (
            <div style={{ background: '#FAEEDA', border: '1px solid #efd19c', borderRadius: '8px', padding: '10px 14px', fontSize: '12px', color: '#8A5A10' }}>
              Ce rapport est deja valide. Les heures et la recreation sont verrouillees cote employe.
            </div>
          )}
          {soumissionVerrouillee && (
            <button type="button" className="btn-primary" onClick={retourPagePrecedente}>
              Retour à l'accueil
            </button>
          )}
          <div style={{
            background: depasse ? '#FCEBEB' : '#E6F1FB',
            border: `1px solid ${depasse ? '#f09595' : '#185FA5'}`,
            borderRadius: '8px',
            padding: '10px 14px',
            fontSize: '12px',
            color: depasse ? '#A32D2D' : '#185FA5',
            fontWeight: 500
          }}>
            {depasse ? `Dépassement — crédit restant : ${creditRestant.toFixed(1)}h` : `Crédit restant aujourd'hui : ${creditRestant.toFixed(1)}h`}
          </div>

          <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div style={{ fontWeight: 600, fontSize: '14px' }}>Informations</div>
            {isAdminMode && (
              <div className="form-group">
                <label>Employé *</label>
                <select value={employeId} onChange={event => setEmployeId(event.target.value)} required>
                  <option value="">Sélectionner un employé...</option>
                  {employes.map(employe => (
                    <option key={employe.id} value={employe.id}>{employe.prenom || employe.initiales || 'Employé'}</option>
                  ))}
                </select>
              </div>
            )}
            <div className="form-group">
              <label>Chantier lié</label>
              <select value={chantierId} onChange={event => setChantierId(event.target.value)}>
                <option value="">Aucun chantier lié</option>
                {chantiers.map(chantier => (
                  <option key={chantier.id} value={chantier.id}>{chantier.nom}</option>
                ))}
              </select>
            </div>
            <div className="form-group">
              <label>Régie</label>
              <select value={regieId} onChange={event => setRegieId(event.target.value)}>
                {regies.length === 0 && <option value="">Non assignée</option>}
                {regies.map(regie => (
                  <option key={regie.id} value={regie.id}>{regie.nom || 'Non assignée'}</option>
                ))}
              </select>
            </div>
            <div className="form-group">
              <label>Date</label>
              <input type="date" value={date} onChange={async event => {
                const nextDate = event.target.value
                setDate(nextDate)
                try {
                  await chargerCredit(nextDate)
                } catch (error) {
                  console.error('Erreur chargement credit depannage', error)
                  setErreur('Impossible de charger les données. Réessaie dans un instant.')
                }
              }} required disabled={rapportEmployeVerrouille} />
            </div>
            <div className="form-group">
              <label>Adresse *</label>
              <input value={adresse} onChange={event => setAdresse(event.target.value)} placeholder="Rue, NPA Ville" required />
            </div>
            {isAdminMode && (
              <div className="form-group">
                <label>N° de bon</label>
                <input value={numeroBon} onChange={event => setNumeroBon(event.target.value)} placeholder="Numéro de bon" />
              </div>
            )}
            <div className="form-group">
              <label>Durée (minimum 1h)</label>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginTop: '4px' }}>
                {DUREES.map(valeur => (
                  <button
                    key={valeur}
                    type="button"
                    disabled={rapportEmployeVerrouille}
                    onClick={() => setDuree(valeur)}
                    style={{
                      padding: '8px 14px',
                      borderRadius: '20px',
                      fontSize: '13px',
                      fontWeight: 500,
                      cursor: rapportEmployeVerrouille ? 'default' : 'pointer',
                      border: duree === valeur ? 'none' : '1px solid #ddd',
                      background: duree === valeur ? '#185FA5' : 'white',
                      color: duree === valeur ? 'white' : '#333',
                      opacity: rapportEmployeVerrouille ? 0.6 : 1
                    }}
                  >
                    {valeur % 1 === 0 ? `${valeur}h` : `${Math.floor(valeur)}h30`}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontWeight: 600, fontSize: '14px' }}>Matériaux</span>
              <button type="button" className="btn-primary btn-sm" disabled={rapportEmployeVerrouille || !peutModifierMateriaux} style={{ width: 'auto' }} onClick={() => setCatalogueVue(true)}>+ Ajouter</button>
            </div>
            {!peutModifierMateriaux && <div style={{ fontSize: '12px', color: '#888' }}>Liste commune au depannage. Seul le responsable ou l'admin la modifie.</div>}
            {materiaux.length === 0 && <div style={{ fontSize: '13px', color: '#888' }}>Aucun article</div>}
            {materiaux.map(item => (
              <div key={item.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingBottom: '8px', borderBottom: '1px solid #eee' }}>
                <div><div style={{ fontSize: '13px', fontWeight: 500 }}>{item.nom}</div><div style={{ fontSize: '11px', color: '#888' }}>{item.unite}</div></div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  {renderQuantiteControl(item, rapportEmployeVerrouille || !peutModifierMateriaux)}
                  <button
                    type="button"
                    disabled={rapportEmployeVerrouille || !peutModifierMateriaux}
                    onClick={() => supprimerMateriau(item.id)}
                    style={{ border: '1px solid #f09595', background: 'white', color: '#A32D2D', borderRadius: '6px', padding: '5px 7px', fontSize: '11px', cursor: rapportEmployeVerrouille || !peutModifierMateriaux ? 'default' : 'pointer', opacity: rapportEmployeVerrouille || !peutModifierMateriaux ? 0.5 : 1 }}
                  >
                    Retirer
                  </button>
                </div>
              </div>
            ))}
          </div>

          <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
              <span style={{ fontWeight: 600, fontSize: '14px' }}>Photos terrain</span>
            </div>
            <div style={{ fontSize: '11px', color: '#888' }}>Les photos ajoutees restent en attente ici tant que le rapport n'est pas envoye.</div>
            <PhotoInputPanel
              onFilesSelected={ajouterPhotosDepuisListe}
              disabled={rapportEmployeVerrouille}
              dropTitle="Glisser-deposer des photos ici"
              dropHint="ou cliquer pour selectionner dans vos fichiers"
              dropNote="Ajout multiple sur ordinateur, sans changer le flux Camera ou Galerie."
            />
            {photosExistantes.length === 0 && photos.length === 0 && (
              <div style={{ fontSize: '13px', color: '#888' }}>Aucune photo</div>
            )}
            {photosExistantes.length > 0 && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '8px' }}>
                {photosExistantes.map(photo => (
                  <a key={photo.id} href={photo.signed_url} target="_blank" rel="noreferrer" style={{ color: 'inherit', textDecoration: 'none' }}>
                    <div style={{ border: '1px solid #e6e6e6', borderRadius: '8px', overflow: 'hidden', background: '#fafafa' }}>
                      {photo.signed_url && <img src={photo.signed_url} alt={photo.file_name} style={{ width: '100%', height: '120px', objectFit: 'cover', display: 'block' }} />}
                      <div style={{ padding: '8px', fontSize: '11px', color: '#555', wordBreak: 'break-word' }}>{photo.file_name}</div>
                    </div>
                  </a>
                ))}
              </div>
            )}
            {photos.length > 0 && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '8px' }}>
                {photos.map(photo => (
                  <div key={photo.id} style={{ border: '1px solid #e6e6e6', borderRadius: '8px', overflow: 'hidden', background: '#fafafa' }}>
                    {photo.previewUrl && <img src={photo.previewUrl} alt={photo.label} style={{ width: '100%', height: '120px', objectFit: 'cover', display: 'block' }} />}
                    <div style={{ padding: '8px', display: 'flex', justifyContent: 'space-between', gap: '8px', alignItems: 'center' }}>
                      <div style={{ fontSize: '11px', color: '#555', wordBreak: 'break-word' }}>{photo.label}</div>
                      <button type="button" onClick={() => retirerPhoto(photo.id)} style={{ border: '1px solid #f09595', background: 'white', color: '#A32D2D', borderRadius: '6px', padding: '4px 6px', fontSize: '11px', flexShrink: 0 }}>Retirer</button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <div style={{ fontWeight: 600, fontSize: '14px' }}>Remarques</div>
            <textarea placeholder="Observations, client, travaux effectués..." value={remarques} onChange={event => setRemarques(event.target.value)} rows={4} disabled={rapportEmployeVerrouille} />
          </div>

          <button type="submit" className="btn-primary" disabled={envoi || rapportEmployeVerrouille}>
            {envoi ? 'Envoi...' : (isAdminMode ? '⚡ Créer le dépannage + rapport' : '⚡ Envoyer le rapport dépannage')}
          </button>
        </div>
      </form>
    </div>
  )
}

function mapRapportMateriauToUi(item) {
  return {
    id: item.id,
    catalogueId: null,
    nom: item.description,
    unite: normalizeUnite('', item.description),
    qte: Math.max(0, Number(item.quantite) || 0)
  }
}

function normalizeUnite(unite, nom = '') {
  const raw = String(unite || '').trim().toLowerCase()
  if (raw === 'm' || raw === 'ml') return 'm'

  const label = String(nom || '').toLowerCase()
  if (label.includes('cable') || label.includes('câble') || label.includes('fil ')) return 'm'

  return 'pce'
}

function isUniteMetre(item) {
  return normalizeUnite(item?.unite, item?.nom) === 'm'
}

function qteButtonStyle(disabled) {
  return {
    minWidth: '34px',
    height: '32px',
    borderRadius: '8px',
    border: '1px solid #d9e8f6',
    background: 'white',
    color: '#185FA5',
    cursor: disabled ? 'default' : 'pointer',
    fontSize: '12px',
    fontWeight: 800,
    opacity: disabled ? 0.5 : 1
  }
}
