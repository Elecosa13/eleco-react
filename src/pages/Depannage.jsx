import React, { useEffect, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import PageHeader from '../components/PageHeader'
import PageTopActions from '../components/PageTopActions'
import PhotoInputPanel from '../components/PhotoInputPanel'
import { useDraftPhotos } from '../lib/photo-drafts'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth-context'
import { safeLocalStorage } from '../lib/safe-browser'
import { usePageRefresh } from '../lib/refresh'
import { fetchLinkedTimeEntry, upsertLinkedTimeEntry } from '../services/timeEntries.service'
import {
  ensureDepannageSousDossier,
  STATUT_INTERVENTION_FAITE,
  STATUT_RAPPORT_RECU
} from '../services/depannages.service'
import {
  uploadRapportPhotos,
  withSignedPhotoUrls
} from '../services/rapportPhotos.service'

const DUREES = [1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5, 5.5, 6, 6.5, 7, 7.5, 8]
const FAVORIS_KEY = 'eleco_favoris'
const CREDIT_JOUR = 8

function loadFavoris() {
  return safeLocalStorage.getJSON(FAVORIS_KEY, [])
}

function saveFavoris(favoris) {
  safeLocalStorage.setJSON(FAVORIS_KEY, favoris)
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
  const [regies, setRegies] = useState([])
  const [regieId, setRegieId] = useState('')
  const [regieNonAssigneeId, setRegieNonAssigneeId] = useState('')
  const [chantiers, setChantiers] = useState([])
  const [chantierId, setChantierId] = useState('')
  const [employes, setEmployes] = useState([])
  const [employeId, setEmployeId] = useState('')
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
        supabase.from('regies').select('id, nom, nom_normalise').eq('actif', true).order('nom'),
        supabase.from('catalogue').select('*').eq('actif', true).order('categorie').order('nom'),
        supabase.from('chantiers').select('id, nom, adresse').eq('actif', true).order('nom'),
        isAdminMode
          ? supabase.from('utilisateurs').select('id, prenom, initiales').eq('role', 'employe').order('prenom')
          : Promise.resolve({ data: [], error: null })
      ])

      if (regiesResult.error) throw regiesResult.error
      if (catalogueResult.error) throw catalogueResult.error
      if (chantiersResult.error) throw chantiersResult.error
      if (employesResult.error) throw employesResult.error

      const listeRegies = regiesResult.data || []
      const nonAssignee = listeRegies.find(regie => regie.nom_normalise === 'non assignee')
      setRegies(listeRegies)
      setRegieNonAssigneeId(nonAssignee?.id || '')
      setRegieId(current => current || initialRegieId || nonAssignee?.id || listeRegies[0]?.id || '')

      const listeCatalogue = catalogueResult.data || []
      setCatalogue(listeCatalogue)
      setCategories(['Favoris', ...Array.from(new Set(listeCatalogue.map(article => article.categorie).filter(Boolean)))])
      setChantiers(chantiersResult.data || [])
      setEmployes(employesResult.data || [])

      if (depannageId) {
        await chargerDepannageExistant()
      }

      await chargerCredit(date)
    } catch (error) {
      console.error('Erreur chargement depannage', error)
      setErreur('Impossible de charger les données. Réessaie dans un instant.')
    } finally {
      setLoading(false)
    }
  }

  async function chargerDepannageExistant() {
    const { data: depannage, error: depannageError } = await supabase
      .from('depannages')
      .select(`
        *,
        chantier:chantiers(id, nom)
      `)
      .eq('id', depannageId)
      .maybeSingle()

    if (depannageError) throw depannageError
    if (!depannage) throw new Error('depannage_introuvable')

    setAdresse(depannage.adresse || '')
    setNumeroBon(depannage.numero_bon || '')
    setDuree(1)
    setRemarques(depannage.remarques || '')
    setDate(depannage.date_travail || new Date().toISOString().split('T')[0])
    setRegieId(depannage.regie_id || regieNonAssigneeId || '')
    setChantierId(depannage.chantier_id || '')
    if (isAdminMode) setEmployeId(depannage.employe_id || '')

    try {
      const timeEntry = await fetchLinkedTimeEntry({
        type: 'depannage',
        referenceId: depannageId,
        employeId: isAdminMode ? depannage.employe_id : user?.id
      })
      if (timeEntry?.duree !== undefined && timeEntry?.duree !== null) {
        setDuree(Number(timeEntry.duree) || 1)
      }
    } catch (error) {
      console.error('Erreur chargement time_entry depannage', error)
    }

    try {
      const { data: rapport, error: rapportError } = await supabase
        .from('rapports')
        .select('id, sous_dossier_id, date_travail, remarques, valide, rapport_materiaux(*), rapport_photos(*)')
        .eq('depannage_id', depannageId)
        .maybeSingle()

      if (rapportError) throw rapportError

      if (rapport) {
        setRapportExistantId(rapport.id)
        setRapportValide(Boolean(rapport.valide))
        setDate(rapport.date_travail || depannage.date_travail || '')
        setRemarques(rapport.remarques || depannage.remarques || '')
        setMateriaux((rapport.rapport_materiaux || []).map(mapRapportMateriauToUi))

        try {
          setPhotosExistantes(await withSignedPhotoUrls(rapport.rapport_photos || []))
        } catch (error) {
          console.error('Erreur chargement photos rapport depannage', error)
          setPhotosExistantes([])
          setRapportErreur("Le rapport existant est charge sans ses photos pour l'instant.")
        }
        return
      }

      setRapportValide(false)

      const { data: legacyMateriaux, error: legacyMateriauxError } = await supabase
        .from('rapport_materiaux')
        .select('*')
        .eq('rapport_id', depannageId)

      if (legacyMateriauxError) throw legacyMateriauxError
      setMateriaux((legacyMateriaux || []).map(mapRapportMateriauToUi))
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
      .from('time_entries')
      .select('duree')
      .eq('employe_id', targetEmployeId)
      .eq('date_travail', nextDate)

    if (error) throw error
    if (data) setCreditUtilise(data.reduce((sum, entry) => sum + Number(entry.duree), 0))
  }

  function toggleFavori(favId) {
    const next = favoris.includes(favId) ? favoris.filter(id => id !== favId) : [...favoris, favId]
    setFavoris(next)
    saveFavoris(next)
  }

  function ajouter(article) {
    const existant = materiaux.find(item => item.id === article.id)
    if (existant) {
      setMateriaux(materiaux.map(item => item.id === article.id ? { ...item, qte: item.qte + 1 } : item))
      return
    }

    setMateriaux([
      ...materiaux,
      {
        id: article.id,
        catalogueId: article.id,
        nom: article.nom,
        unite: article.unite,
        qte: 1,
        pu: article.prix_net
      }
    ])
  }

  function modQte(materiauId, delta) {
    setMateriaux(
      materiaux
        .map(item => item.id === materiauId ? { ...item, qte: Math.max(0, item.qte + delta) } : item)
        .filter(item => item.qte > 0)
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
    if (!chantierId) {
      setErreur('Sélectionne le chantier lié au dépannage pour classer le rapport dans le bon dossier admin.')
      return
    }
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
        employe_id: employeFinalId,
        chantier_id: chantierId,
        regie_id: regieIdFinal,
        date_travail: date,
        adresse: adresse.trim(),
        remarques: remarques.trim(),
        statut: STATUT_INTERVENTION_FAITE,
        ...(isAdminMode ? { numero_bon: numeroBon.trim() || null } : {})
      }

      if (depannageSauveId) {
        const { data: depannageUpdated, error: depannageUpdateError } = await supabase
          .from('depannages')
          .update(depannagePayload)
          .eq('id', depannageSauveId)
          .select('id')
          .maybeSingle()

        if (depannageUpdateError) throw depannageUpdateError
        if (!depannageUpdated?.id) throw new Error('depannage_update_empty')
      } else {
        const { data: depannageInserted, error: depannageInsertError } = await supabase
          .from('depannages')
          .insert(depannagePayload)
          .select('id')
          .single()

        if (depannageInsertError) throw depannageInsertError
        if (!depannageInserted?.id) throw new Error('depannage_insert_empty')
        depannageSauveId = depannageInserted.id
      }

      const sousDossierId = await ensureDepannageSousDossier(chantierId)

      const rapportPayload = {
        sous_dossier_id: sousDossierId,
        employe_id: employeFinalId,
        date_travail: date,
        heure_debut: '07:30',
        heure_fin: '17:00',
        remarques: remarques.trim(),
        depannage_id: depannageSauveId
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
      await sauvegarderMateriaux(rapportSauveId)

      if (photos.length > 0) {
        await uploadRapportPhotos({
          rapportId: rapportSauveId,
          depannageId: depannageSauveId,
          chantierId,
          sousDossierId,
          files: photos.map(item => item.file),
          userId: user.id
        })
      }

      const { error: statutError } = await supabase
        .from('depannages')
        .update({
          chantier_id: chantierId,
          statut: STATUT_RAPPORT_RECU,
          rapport_envoye_le: new Date().toISOString()
        })
        .eq('id', depannageSauveId)

      if (statutError) throw statutError

      clearPhotos()
      setSucces(true)
      setTimeout(() => {
        if (isAdminMode) {
          navigate('/admin', { state: { vue: 'depannages' } })
        } else {
          navigate('/employe')
        }
      }, 2000)
    } catch (error) {
      console.error('Erreur enregistrement dépannage', error)
      if (String(error?.message || '').includes('locked_validated_report')) {
        setRapportValide(true)
        setErreur("Ce rapport est deja valide. Les heures et la recreation sont verrouillees cote employe.")
        return
      }
      if (depannageSauveId || rapportSauveId) {
        setSoumissionVerrouillee(true)
        setErreur("Le rapport a probablement été enregistré partiellement. Retourne à l'accueil et laisse l'administration contrôler le dossier avant une nouvelle tentative.")
        return
      }
      setErreur("Impossible d'enregistrer le dépannage. Vérifie les informations et réessaie.")
    } finally {
      setEnvoi(false)
    }
  }

  async function sauvegarderTimeEntry(depannageSauveId, employeFinalId) {
    await upsertLinkedTimeEntry({
      employeId: employeFinalId,
      type: 'depannage',
      referenceId: depannageSauveId,
      dateTravail: date,
      duree,
      chantierId
    })
  }

  async function sauvegarderMateriaux(rapportId) {
    const { error: deleteError } = await supabase
      .from('rapport_materiaux')
      .delete()
      .eq('rapport_id', rapportId)

    if (deleteError) throw deleteError
    if (materiaux.length === 0) return

    const { error: insertError } = await supabase
      .from('rapport_materiaux')
      .insert(materiaux.map(item => ({
        rapport_id: rapportId,
        ref_article: item.catalogueId || item.id || null,
        designation: item.nom,
        unite: item.unite,
        quantite: item.qte,
        prix_net: item.pu
      })))

    if (insertError) throw insertError
  }

  const creditRestant = CREDIT_JOUR - creditUtilise
  const depasse = creditUtilise + duree > CREDIT_JOUR
  const rapportEmployeVerrouille = soumissionVerrouillee || rapportValide

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
          onBack={() => setCatalogueVue(false)}
          rightSlot={materiaux.length > 0 ? <span className="badge badge-blue">{materiaux.reduce((sum, item) => sum + item.qte, 0)}</span> : null}
        />
        <div className="page-content">
          {erreur && (
            <div style={{ background: '#FCEBEB', border: '1px solid #f09595', borderRadius: '8px', padding: '10px 14px', fontSize: '12px', color: '#A32D2D' }}>
              {erreur}
            </div>
          )}
          <input type="search" placeholder="Rechercher..." value={recherche} onChange={event => setRecherche(event.target.value)} />
          <div style={{ display: 'flex', gap: '6px', overflowX: 'auto', paddingBottom: '4px' }}>
            {categories.map(categorie => (
              <button
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
              const qte = materiaux.find(item => item.id === article.id)?.qte || 0
              return (
                <div key={article.id} style={{ display: 'flex', alignItems: 'center', padding: '10px 14px', gap: '8px', borderBottom: index < articlesFiltres.length - 1 ? '1px solid #eee' : 'none' }}>
                  <button onClick={() => toggleFavori(article.id)} style={{ background: 'none', border: 'none', fontSize: '16px', cursor: 'pointer', opacity: favoris.includes(article.id) ? 1 : 0.25, padding: 0, flexShrink: 0 }}>⭐</button>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: '13px', fontWeight: 500 }}>{article.nom}</div>
                    <div style={{ fontSize: '11px', color: '#888' }}>{article.categorie} · {article.unite}</div>
                  </div>
                  {qte === 0 ? (
                    <button onClick={() => ajouter(article)} style={{ width: 28, height: 28, borderRadius: '50%', border: '1px solid #185FA5', background: '#E6F1FB', color: '#185FA5', fontSize: '18px', cursor: 'pointer', flexShrink: 0 }}>+</button>
                  ) : (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
                      <button onClick={() => modQte(article.id, -1)} style={{ width: 26, height: 26, borderRadius: '50%', border: '1px solid #ddd', background: 'white', cursor: 'pointer', fontSize: '14px' }}>−</button>
                      <span style={{ fontSize: '13px', fontWeight: 600, minWidth: '20px', textAlign: 'center' }}>{qte}</span>
                      <button onClick={() => modQte(article.id, 1)} style={{ width: 26, height: 26, borderRadius: '50%', border: '1px solid #185FA5', background: '#185FA5', color: 'white', cursor: 'pointer', fontSize: '14px' }}>+</button>
                    </div>
                  )}
                </div>
              )
            })}
            {!loading && articlesFiltres.length === 0 && <div style={{ padding: '20px', textAlign: 'center', color: '#888', fontSize: '13px' }}>Aucun article</div>}
          </div>
          <button className="btn-primary" onClick={() => setCatalogueVue(false)}>✓ Confirmer ({materiaux.reduce((sum, item) => sum + item.qte, 0)} articles)</button>
        </div>
      </div>
    )
  }

  return (
    <div>
      <PageHeader
        title={depannageId ? 'Rapport dépannage' : 'Nouveau dépannage'}
        onBack={() => navigate(isAdminMode ? '/admin' : '/employe')}
        rightSlot={<PageTopActions navigate={navigate} fallbackPath={isAdminMode ? '/admin' : '/employe'} onRefresh={refreshPage} refreshing={loading} showBack={false} />}
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
            <button type="button" className="btn-primary" onClick={() => navigate(isAdminMode ? '/admin' : '/employe')}>
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
              <label>Chantier lié *</label>
              <select value={chantierId} onChange={event => setChantierId(event.target.value)} required>
                <option value="">Sélectionner un chantier...</option>
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
              <button type="button" className="btn-primary btn-sm" disabled={rapportEmployeVerrouille} style={{ width: 'auto' }} onClick={() => setCatalogueVue(true)}>+ Ajouter</button>
            </div>
            {materiaux.length === 0 && <div style={{ fontSize: '13px', color: '#888' }}>Aucun article</div>}
            {materiaux.map(item => (
              <div key={item.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingBottom: '8px', borderBottom: '1px solid #eee' }}>
                <div><div style={{ fontSize: '13px', fontWeight: 500 }}>{item.nom}</div><div style={{ fontSize: '11px', color: '#888' }}>{item.unite}</div></div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <button type="button" onClick={() => modQte(item.id, -1)} style={{ width: 26, height: 26, borderRadius: '50%', border: '1px solid #ddd', background: 'white', cursor: 'pointer', fontSize: '14px' }}>−</button>
                  <span style={{ fontWeight: 600, minWidth: '20px', textAlign: 'center', fontSize: '13px' }}>{item.qte}</span>
                  <button type="button" onClick={() => modQte(item.id, 1)} style={{ width: 26, height: 26, borderRadius: '50%', border: '1px solid #185FA5', background: '#185FA5', color: 'white', cursor: 'pointer', fontSize: '14px' }}>+</button>
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
    id: item.ref_article || item.id,
    catalogueId: item.ref_article || null,
    nom: item.designation,
    unite: item.unite,
    qte: Number(item.quantite) || 1,
    pu: Number(item.prix_net) || 0
  }
}
