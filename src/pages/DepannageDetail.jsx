import React, { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import PageTopActions from '../components/PageTopActions'
import PhotoInputPanel from '../components/PhotoInputPanel'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth-context'
import { safeConfirm } from '../lib/safe-browser'
import { usePageRefresh } from '../lib/refresh'
import { deleteRapportPhoto, uploadRapportPhotos, withSignedPhotoUrls } from '../services/rapportPhotos.service'
import { fetchLinkedTimeEntry } from '../services/timeEntries.service'

const STATUT_A_TRAITER = 'À traiter'
const STATUT_PRIS = 'Pris'
const STATUT_PLANIFIE = 'Planifié'
const STATUT_INTERVENTION_FAITE = 'Intervention faite'
const STATUT_RAPPORT_RECU = 'Rapport reçu'
const STATUT_FACTURE_A_PREPARER = 'Facture à préparer'
const STATUT_FACTURE_PRETE = 'Facture prête'

function LoadingSpinner() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', color: '#185FA5', fontSize: '13px', fontWeight: 600 }}>
      <span className="pull-refresh__spinner pull-refresh__spinner--active" />
      Chargement...
    </div>
  )
}

function formatDate(value) {
  if (!value) return ''
  const date = new Date(`${value}T12:00:00`)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleDateString('fr-CH')
}

function formatDateTime(value) {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleString('fr-CH')
}

function cleanValue(value) {
  if (value === null || value === undefined) return ''
  return String(value).trim()
}

function firstValue(...values) {
  for (const value of values) {
    const cleaned = cleanValue(value)
    if (cleaned) return cleaned
  }
  return ''
}

function fullName(person) {
  if (!person) return ''
  return firstValue(
    [person.prenom, person.nom].filter(Boolean).join(' '),
    person.prenom,
    person.nom,
    person.initiales
  )
}

function InfoLine({ label, value }) {
  if (!cleanValue(value)) return null
  return (
    <div>
      <div style={{ fontSize: '11px', color: '#888', marginBottom: '3px' }}>{label}</div>
      <div style={{ fontSize: '14px', fontWeight: 500, whiteSpace: 'pre-wrap' }}>{value}</div>
    </div>
  )
}

function DetailSection({ title, children }) {
  const items = React.Children.toArray(children).filter(Boolean)
  if (items.length === 0) return null

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
      <div style={{ fontSize: '13px', fontWeight: 700, color: '#185FA5' }}>{title}</div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '12px' }}>
        {items}
      </div>
    </div>
  )
}

function statutBadgeClass(statut) {
  if (statut === STATUT_FACTURE_PRETE) return 'badge-green'
  if ([STATUT_PLANIFIE, STATUT_INTERVENTION_FAITE, STATUT_RAPPORT_RECU, STATUT_FACTURE_A_PREPARER].includes(statut)) return 'badge-blue'
  return 'badge-amber'
}

function buildForm(depannage) {
  return {
    regie_id: depannage?.regie_id || '',
    chantier_id: depannage?.chantier_id || '',
    adresse: depannage?.adresse || '',
    remarques: depannage?.remarques || '',
    date_travail: depannage?.date_travail || '',
    date_planifiee: depannage?.date_planifiee || '',
    heure_planifiee: String(depannage?.heure_planifiee || '').slice(0, 5)
  }
}

export default function DepannageDetail() {
  const navigate = useNavigate()
  const { id } = useParams()
  const { profile: user } = useAuth()
  const [depannage, setDepannage] = useState(null)
  const [rapportLie, setRapportLie] = useState(null)
  const [regies, setRegies] = useState([])
  const [chantiers, setChantiers] = useState([])
  const [loading, setLoading] = useState(true)
  const [erreur, setErreur] = useState('')
  const [rapportLieErreur, setRapportLieErreur] = useState('')
  const [edition, setEdition] = useState(false)
  const [form, setForm] = useState(buildForm(null))
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')
  const [saveSuccess, setSaveSuccess] = useState('')
  const [regiesError, setRegiesError] = useState('')
  const [statutSaving, setStatutSaving] = useState(false)
  const [photoSaving, setPhotoSaving] = useState(false)
  const refreshPage = usePageRefresh(async () => {
    await Promise.all([chargerDepannage(), chargerReferentiels()])
  }, [id])

  useEffect(() => {
    chargerDepannage()
    chargerReferentiels()
  }, [id])

  async function lireDepannage() {
    const { data, error } = await supabase
      .from('depannages')
      .select('*, employe:employe_id(prenom, nom, initiales), regie:regies(nom), chantier:chantiers(id, nom, adresse)')
      .eq('id', id)
      .maybeSingle()

    if (error) throw error
    return hydraterDepannageDuree(data || null)
  }

  async function hydraterDepannageDuree(data) {
    if (!data?.id) return data || null

    try {
      const timeEntry = await fetchLinkedTimeEntry({
        type: 'depannage',
        referenceId: data.id
      })

      return {
        ...data,
        _duree: Number(timeEntry?.duree) || 0
      }
    } catch (error) {
      console.error('Erreur chargement time_entry detail depannage', error)
      return {
        ...data,
        _duree: 0
      }
    }
  }

  async function chargerDepannage() {
    setLoading(true)
    setErreur('')
    setRapportLieErreur('')

    try {
      const data = await lireDepannage()
      setDepannage(data || null)
      setForm(buildForm(data))
      if (!data) {
        setRapportLie(null)
        return
      }

      try {
        setRapportLie(await chargerRapportLie())
      } catch (error) {
        console.error('Erreur chargement rapport lie depannage', error)
        setRapportLie(null)
        setRapportLieErreur("Le rapport lie n'a pas pu etre charge pour l'instant.")
      }
    } catch (error) {
      console.error('Erreur chargement detail depannage', error)
      setErreur("Impossible de charger ce dépannage. Réessaie dans un instant.")
      setDepannage(null)
      setRapportLie(null)
    } finally {
      setLoading(false)
    }
  }

  async function chargerRapportLie() {
    const { data, error } = await supabase
      .from('rapports')
      .select('*, employe:employe_id(prenom), sous_dossiers(id, nom, chantier_id, chantiers(id, nom, adresse)), rapport_materiaux(*), rapport_photos(*)')
      .eq('depannage_id', id)
      .maybeSingle()

    if (error) throw error
    if (!data) return null

    try {
      const photos = await withSignedPhotoUrls(data.rapport_photos || [])
      return { ...data, rapport_photos: photos }
    } catch (error) {
      console.error('Erreur chargement photos rapport lie depannage', error)
      setRapportLieErreur("Le rapport lie est charge sans ses photos pour l'instant.")
      return { ...data, rapport_photos: [] }
    }
  }

  async function rechargerRapportLie() {
    try {
      setRapportLie(await chargerRapportLie())
      setRapportLieErreur('')
    } catch (error) {
      console.error('Erreur rechargement rapport lie depannage', error)
      setRapportLie(null)
      setRapportLieErreur("Le rapport lie n'a pas pu etre recharge pour l'instant.")
    }
  }

  async function chargerReferentiels() {
    setRegiesError('')

    try {
      const [{ data: regiesData, error: regiesQueryError }, { data: chantiersData, error: chantiersError }] = await Promise.all([
        supabase.from('regies').select('id, nom').eq('actif', true).order('nom'),
        supabase.from('chantiers').select('id, nom').eq('actif', true).order('nom')
      ])

      if (regiesQueryError) throw regiesQueryError
      if (chantiersError) throw chantiersError

      setRegies(regiesData || [])
      setChantiers(chantiersData || [])
    } catch (error) {
      console.error('Erreur chargement referentiels depannage detail', error)
      setRegies([])
      setChantiers([])
      setRegiesError("Impossible de charger les listes de référence. Les données existantes restent consultables.")
    }
  }

  function ouvrirEdition() {
    setForm(buildForm(depannage))
    setSaveError('')
    setSaveSuccess('')
    setEdition(true)
  }

  function annulerEdition() {
    setForm(buildForm(depannage))
    setSaveError('')
    setEdition(false)
  }

  async function enregistrerDepannage(event) {
    event.preventDefault()
    setSaveError('')
    setSaveSuccess('')

    const adresse = form.adresse.trim()
    const dateTravail = form.date_travail

    if (!adresse || !dateTravail) {
      setSaveError("L'adresse et la date sont obligatoires.")
      return
    }

    setSaving(true)

    try {
      const payload = {
        regie_id: form.regie_id || null,
        chantier_id: form.chantier_id || null,
        adresse,
        remarques: form.remarques.trim(),
        date_travail: dateTravail,
        date_planifiee: form.date_planifiee || null,
        heure_planifiee: form.heure_planifiee || null
      }

      const { data: updated, error: updateError } = await supabase
        .from('depannages')
        .update(payload)
        .eq('id', id)
        .select('id')
        .maybeSingle()

      if (updateError) throw updateError
      if (!updated) throw new Error('depannage_update_empty')

      const data = await lireDepannage()
      if (!data) throw new Error('depannage_update_refetch_empty')

      setDepannage(data)
      setForm(buildForm(data))
      setEdition(false)
      setSaveSuccess('Dépannage mis à jour.')
    } catch (error) {
      console.error('Erreur sauvegarde depannage', error)
      setSaveError("Impossible d'enregistrer les modifications. Vérifie les champs et réessaie.")
    } finally {
      setSaving(false)
    }
  }



  function prochainStatutAdmin(statut) {
    if (statut === STATUT_INTERVENTION_FAITE) {
      return { statut: STATUT_RAPPORT_RECU, label: 'Forcer réception rapport' }
    }
    if (statut === STATUT_RAPPORT_RECU) {
      return { statut: STATUT_FACTURE_A_PREPARER, label: 'Passer en facture à préparer' }
    }
    if (statut === STATUT_FACTURE_A_PREPARER) {
      return { statut: STATUT_FACTURE_PRETE, label: 'Passer en facture prête' }
    }
    return null
  }

  async function avancerStatutAdmin(nextStatut) {
    setSaveError('')
    setSaveSuccess('')
    setStatutSaving(true)

    try {
      const { data: updated, error } = await supabase
        .from('depannages')
        .update({ statut: nextStatut })
        .eq('id', id)
        .select('id')
        .maybeSingle()

      if (error) throw error
      if (!updated) throw new Error('depannage_statut_update_empty')

      const data = await lireDepannage()
      if (!data) throw new Error('depannage_statut_refetch_empty')

      setDepannage(data)
      setForm(buildForm(data))
      setSaveSuccess(`Statut mis à jour : ${nextStatut}.`)
    } catch (error) {
      console.error('Erreur mise a jour statut depannage', error)
      setSaveError("Impossible de mettre à jour le statut. Réessaie dans un instant.")
    } finally {
      setStatutSaving(false)
    }
  }

  async function traiterAjoutPhotosAdmin(fileList) {
    const files = Array.from(fileList || []).filter(Boolean)
    if (!rapportLie || files.length === 0 || photoSaving) return

    const sousDossierId = rapportLie.sous_dossiers?.id || rapportLie.sous_dossier_id || null
    const chantierId = rapportLie.sous_dossiers?.chantier_id || rapportLie.sous_dossiers?.chantiers?.id || depannage?.chantier?.id || depannage?.chantier_id || null

    if (!sousDossierId || !chantierId) {
      setRapportLieErreur("Impossible d'ajouter des photos sans dossier chantier rattache au rapport.")
      return
    }

    setPhotoSaving(true)
    setRapportLieErreur('')

    try {
      await uploadRapportPhotos({
        rapportId: rapportLie.id,
        depannageId: rapportLie.depannage_id || depannage?.id || id,
        chantierId,
        sousDossierId,
        files,
        userId: user?.id || null
      })
      await rechargerRapportLie()
      setSaveSuccess('Photos ajoutees au rapport.')
    } catch (error) {
      console.error('Erreur ajout photos admin depannage', error)
      setRapportLieErreur("Impossible d'ajouter les photos pour l'instant.")
    } finally {
      setPhotoSaving(false)
    }
  }

  async function supprimerPhotoAdmin(photo) {
    if (!photo?.id || photoSaving) return
    const confirmed = await safeConfirm('Supprimer cette photo du rapport ?')
    if (!confirmed) return

    setPhotoSaving(true)
    setRapportLieErreur('')

    try {
      await deleteRapportPhoto(photo)
      await rechargerRapportLie()
      setSaveSuccess('Photo supprimee du rapport.')
    } catch (error) {
      console.error('Erreur suppression photo admin depannage', error)
      setRapportLieErreur("Impossible de supprimer cette photo pour l'instant.")
    } finally {
      setPhotoSaving(false)
    }
  }

  const detail = depannage ? {
    date: formatDate(depannage.date_travail),
    datePlanifiee: formatDate(depannage.date_planifiee),
    heurePlanifiee: String(depannage.heure_planifiee || '').slice(0, 5),
    regie: firstValue(depannage.regie?.nom, depannage.regie_nom),
    chantier: firstValue(depannage.chantier?.nom),
    client: firstValue(depannage.client, depannage.nom_client),
    adresse: firstValue(depannage.adresse),
    description: firstValue(depannage.objet, depannage.titre, depannage.description, depannage.remarques),
    statut: firstValue(depannage.statut, depannage.status, STATUT_A_TRAITER),
    intervenant: firstValue(fullName(depannage.employe), depannage.intervenant, depannage.intervenant_nom),
    duree: `${Number(depannage._duree) || 0} h`,
    contact: firstValue(depannage.contact, depannage.telephone, depannage.email),
    reference: firstValue(depannage.numero_bon, depannage.reference, depannage.ref),
    creeLe: formatDateTime(depannage.created_at),
    modifieLe: formatDateTime(depannage.updated_at)
  } : null

  const actionStatutAdmin = detail ? prochainStatutAdmin(detail.statut) : null

  return (
    <div>
      <div className="top-bar">
        <div>
          <div style={{ fontWeight: 600, fontSize: '15px', marginTop: '4px' }}>D??tail d??pannage</div>
          <div style={{ fontSize: '11px', color: '#888' }}>Bon #{id}</div>
        </div>
        <PageTopActions navigate={navigate} fallbackPath="/admin" onRefresh={refreshPage} refreshing={loading} />
      </div>

      <div className="page-content">
        {loading && (
          <div className="card">
            <LoadingSpinner />
          </div>
        )}

        {!loading && erreur && (
          <div className="card" style={{ color: '#A32D2D', fontSize: '13px' }}>
            {erreur}
          </div>
        )}

        {!loading && !erreur && !depannage && (
          <div className="card" style={{ fontSize: '13px', color: '#888' }}>
            Aucun dépannage trouvé pour ce bon.
          </div>
        )}

        {!loading && !erreur && depannage && detail && (
          <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            {saveSuccess && <div style={{ color: '#3B6D11', fontSize: '13px' }}>{saveSuccess}</div>}
            {saveError && <div style={{ color: '#A32D2D', fontSize: '13px' }}>{saveError}</div>}
            {regiesError && <div style={{ color: '#A32D2D', background: '#FCEBEB', border: '1px solid #f4c7c7', borderRadius: '8px', padding: '8px 10px', fontSize: '12px' }}>{regiesError}</div>}
            {rapportLieErreur && <div style={{ color: '#8A5A10', background: '#FAEEDA', border: '1px solid #efd19c', borderRadius: '8px', padding: '8px 10px', fontSize: '12px' }}>{rapportLieErreur}</div>}

            {edition ? (
              <form onSubmit={enregistrerDepannage} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <div className="form-group">
                  <label>Régie</label>
                  <select value={form.regie_id} onChange={event => setForm(previous => ({ ...previous, regie_id: event.target.value }))}>
                    <option value="">Non assignée</option>
                    {depannage.regie_id && depannage.regie?.nom && !regies.some(regie => String(regie.id) === String(depannage.regie_id)) && (
                      <option value={depannage.regie_id}>{depannage.regie.nom}</option>
                    )}
                    {regies.map(regie => (
                      <option key={regie.id} value={regie.id}>{regie.nom}</option>
                    ))}
                  </select>
                </div>
                <div className="form-group">
                  <label>Chantier</label>
                  <select value={form.chantier_id} onChange={event => setForm(previous => ({ ...previous, chantier_id: event.target.value }))}>
                    <option value="">Aucun</option>
                    {chantiers.map(chantier => (
                      <option key={chantier.id} value={chantier.id}>{chantier.nom}</option>
                    ))}
                  </select>
                </div>
                <div className="form-group">
                  <label>Adresse / titre</label>
                  <input value={form.adresse} onChange={event => setForm(previous => ({ ...previous, adresse: event.target.value }))} required />
                </div>
                <div className="form-group">
                  <label>Description</label>
                  <textarea rows={4} value={form.remarques} onChange={event => setForm(previous => ({ ...previous, remarques: event.target.value }))} style={{ resize: 'vertical' }} />
                </div>
                <div className="grid2">
                  <div className="form-group">
                    <label>Date</label>
                    <input type="date" value={form.date_travail} onChange={event => setForm(previous => ({ ...previous, date_travail: event.target.value }))} required />
                  </div>
                  <div className="form-group">
                    <label>Date planifiée</label>
                    <input type="date" value={form.date_planifiee} onChange={event => setForm(previous => ({ ...previous, date_planifiee: event.target.value }))} />
                  </div>
                </div>
                <div className="form-group">
                  <label>Heure planifiée</label>
                  <input type="time" value={form.heure_planifiee} onChange={event => setForm(previous => ({ ...previous, heure_planifiee: event.target.value }))} />
                </div>
                <div style={{ display: 'flex', gap: '10px' }}>
                  <button type="button" className="btn-outline" onClick={annulerEdition} disabled={saving} style={{ flex: 1 }}>Annuler</button>
                  <button type="submit" className="btn-primary" disabled={saving} style={{ flex: 1 }}>
                    {saving ? 'Enregistrement...' : 'Enregistrer'}
                  </button>
                </div>
              </form>
            ) : (
              <>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '10px' }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: '13px', color: '#888' }}>{detail.date || 'Date non définie'}</div>
                    <div style={{ fontSize: '16px', fontWeight: 700, marginTop: '3px' }}>{detail.client || detail.adresse || 'Dépannage sans client'}</div>
                    {detail.regie && <div style={{ fontSize: '12px', color: '#555', marginTop: '3px' }}>{detail.regie}</div>}
                  </div>
                  {detail.statut && <span className={`badge ${statutBadgeClass(detail.statut)}`} style={{ flexShrink: 0 }}>{detail.statut}</span>}
                </div>

                <DetailSection title="Informations">
                  <InfoLine label="Date" value={detail.date} />
                  <InfoLine label="Régie" value={detail.regie || 'Régie non définie'} />
                  <InfoLine label="Chantier lié" value={detail.chantier} />
                  <InfoLine label="Client" value={detail.client} />
                  <InfoLine label="Adresse" value={detail.adresse} />
                  <InfoLine label="Description / objet" value={detail.description || 'Aucune description renseignée'} />
                </DetailSection>

                <DetailSection title="Planification">
                  <InfoLine label="Statut terrain" value={detail.statut} />
                  <InfoLine label="Date planifiée" value={detail.datePlanifiee} />
                  <InfoLine label="Heure planifiée" value={detail.heurePlanifiee} />
                  <InfoLine label="Intervenant" value={detail.intervenant} />
                  <InfoLine label="Durée" value={detail.duree} />
                </DetailSection>

                <DetailSection title="Suivi">
                  <InfoLine label="Contact" value={detail.contact} />
                  <InfoLine label="Référence" value={detail.reference} />
                  <InfoLine label="Créé le" value={detail.creeLe} />
                  <InfoLine label="Modifié le" value={detail.modifieLe} />
                </DetailSection>

                <DetailSection title="Traitement admin">
                  <InfoLine label="Statut courant" value={detail.statut} />
                  {actionStatutAdmin && (
                    <button
                      type="button"
                      className="btn-primary"
                      disabled={statutSaving}
                      onClick={() => avancerStatutAdmin(actionStatutAdmin.statut)}
                    >
                      {statutSaving ? 'Mise à jour...' : actionStatutAdmin.label}
                    </button>
                  )}
                  {!actionStatutAdmin && (
                    <div style={{ fontSize: '12px', color: '#888' }}>
                      Aucune action admin disponible pour ce statut.
                    </div>
                  )}
                </DetailSection>

                <DetailSection title="Dossier">
                  <InfoLine label="Rapport lié" value={rapportLie ? `Rapport #${rapportLie.id}` : 'Aucun rapport lié'} />
                  <InfoLine label="Sous-dossier" value={rapportLie?.sous_dossiers?.nom} />
                  <InfoLine label="Chantier dossier" value={rapportLie?.sous_dossiers?.chantiers?.nom || detail.chantier} />
                  {!rapportLie && (
                    <div style={{ fontSize: '12px', color: '#888' }}>
                      Le rapport n'a pas encore été classé dans un dossier chantier.
                    </div>
                  )}
                </DetailSection>

                {rapportLie && (
                  <DetailSection title="Rapport terrain">
                    <InfoLine label="Date rapport" value={formatDate(rapportLie.date_travail)} />
                    <InfoLine label="Remarques rapport" value={rapportLie.remarques} />
                    <InfoLine label="Photos" value={`${(rapportLie.rapport_photos || []).length} photo(s)`} />
                  </DetailSection>
                )}

                {rapportLie && (
                  <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    <div style={{ fontWeight: 600, fontSize: '14px' }}>Matériaux du rapport</div>
                    {(rapportLie.rapport_materiaux || []).length === 0 && <div style={{ fontSize: '13px', color: '#888' }}>Aucun matériau</div>}
                    {(rapportLie.rapport_materiaux || []).map(materiau => (
                      <div key={materiau.id} style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', paddingBottom: '8px', borderBottom: '1px solid #eee' }}>
                        <div>
                          <div style={{ fontSize: '13px', fontWeight: 500 }}>{materiau.designation}</div>
                          <div style={{ fontSize: '11px', color: '#888' }}>{materiau.quantite} × {materiau.unite}</div>
                        </div>
                        <div style={{ fontSize: '13px', fontWeight: 600 }}>{(Number(materiau.quantite || 0) * Number(materiau.prix_net || 0)).toFixed(2)} CHF</div>
                      </div>
                    ))}
                  </div>
                )}

                {rapportLie && (
                  <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                      <div style={{ fontWeight: 600, fontSize: '14px' }}>Photos du rapport</div>
                    </div>
                    <PhotoInputPanel
                      onFilesSelected={traiterAjoutPhotosAdmin}
                      disabled={photoSaving}
                      dropTitle="Glisser-deposer des photos ici"
                      dropHint="ou cliquer pour selectionner plusieurs fichiers"
                      dropNote={photoSaving ? 'Ajout en cours...' : 'Camera, galerie et depot utilisent maintenant le meme flux.'}
                    />
                    {(rapportLie.rapport_photos || []).length === 0 && <div style={{ fontSize: '13px', color: '#888' }}>Aucune photo</div>}
                    {(rapportLie.rapport_photos || []).length > 0 && (
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '8px' }}>
                        {(rapportLie.rapport_photos || []).map(photo => (
                          <div key={photo.id} style={{ border: '1px solid #e6e6e6', borderRadius: '8px', overflow: 'hidden', background: '#fafafa' }}>
                            <a href={photo.signed_url || '#'} target="_blank" rel="noreferrer" style={{ textDecoration: 'none', color: 'inherit', display: 'block' }}>
                              {photo.signed_url && <img src={photo.signed_url} alt={photo.file_name} style={{ width: '100%', height: '120px', objectFit: 'cover', display: 'block' }} />}
                            </a>
                            <div style={{ padding: '8px', display: 'flex', justifyContent: 'space-between', gap: '8px', alignItems: 'center' }}>
                              <div style={{ fontSize: '11px', color: '#555', wordBreak: 'break-word' }}>{photo.file_name}</div>
                              <button
                                type="button"
                                onClick={() => supprimerPhotoAdmin(photo)}
                                disabled={photoSaving}
                                style={{ border: '1px solid #f09595', background: 'white', color: '#A32D2D', borderRadius: '6px', padding: '4px 6px', fontSize: '11px', flexShrink: 0, cursor: photoSaving ? 'default' : 'pointer' }}
                              >
                                Supprimer
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                <button type="button" className="btn-primary" onClick={ouvrirEdition}>Modifier</button>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
