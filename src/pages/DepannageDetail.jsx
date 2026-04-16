import React, { useEffect, useState } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'

const STATUT_A_TRAITER = 'À traiter'
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

function FutureSlot({ label }) {
  return (
    <div style={{ border: '1px dashed #d7d7d7', borderRadius: '8px', padding: '10px 12px', color: '#888', fontSize: '12px', background: '#fafafa' }}>
      {label}
    </div>
  )
}

function statutBadgeClass(statut) {
  if (statut === STATUT_FACTURE_PRETE) return 'badge-green'
  if (statut === STATUT_INTERVENTION_FAITE || statut === STATUT_RAPPORT_RECU || statut === STATUT_FACTURE_A_PREPARER) return 'badge-blue'
  return 'badge-amber'
}

function buildForm(depannage) {
  return {
    regie_id: depannage?.regie_id || '',
    adresse: depannage?.adresse || '',
    remarques: depannage?.remarques || '',
    date_travail: depannage?.date_travail || ''
  }
}

export default function DepannageDetail() {
  const navigate = useNavigate()
  const location = useLocation()
  const { id } = useParams()
  const [depannage, setDepannage] = useState(null)
  const [regies, setRegies] = useState([])
  const [loading, setLoading] = useState(true)
  const [erreur, setErreur] = useState('')
  const [edition, setEdition] = useState(false)
  const [form, setForm] = useState(buildForm(null))
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')
  const [saveSuccess, setSaveSuccess] = useState('')
  const [regiesError, setRegiesError] = useState('')
  const [statutSaving, setStatutSaving] = useState(false)

  useEffect(() => {
    chargerDepannage()
    chargerRegies()
  }, [id])

  async function lireDepannage() {
    const { data, error } = await supabase
      .from('depannages')
      .select('*, employe:employe_id(prenom), regie:regies(nom)')
      .eq('id', id)
      .maybeSingle()

    if (error) throw error
    return data || null
  }

  async function chargerDepannage() {
    setLoading(true)
    setErreur('')

    try {
      const data = await lireDepannage()
      setDepannage(data || null)
      setForm(buildForm(data))
    } catch (error) {
      console.error('Erreur chargement detail depannage', error)
      setErreur("Impossible de charger ce dépannage. Réessaie dans un instant.")
      setDepannage(null)
    } finally {
      setLoading(false)
    }
  }

  async function chargerRegies() {
    setRegiesError('')

    try {
      const { data, error } = await supabase
        .from('regies')
        .select('id, nom')
        .eq('actif', true)
        .order('nom')

      if (error) throw error
      setRegies(data || [])
    } catch (error) {
      console.error('Erreur chargement regies depannage detail', error)
      setRegies([])
      setRegiesError("Impossible de charger la liste des régies. La régie actuelle reste affichée si elle est connue.")
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

  async function enregistrerDepannage(e) {
    e.preventDefault()
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
        adresse,
        remarques: form.remarques.trim(),
        date_travail: dateTravail
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

  function retourListe() {
    navigate('/admin', {
      state: {
        vue: 'depannages',
        depannagesSearch: location.state?.depannagesSearch || '',
        depannagesRegieFilter: location.state?.depannagesRegieFilter || '',
        depannagesDateFilter: location.state?.depannagesDateFilter || ''
      }
    })
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

  const detail = depannage ? {
    date: formatDate(depannage.date_travail),
    regie: firstValue(depannage.regie?.nom, depannage.regie_nom),
    client: firstValue(depannage.client, depannage.nom_client),
    adresse: firstValue(depannage.adresse),
    description: firstValue(depannage.objet, depannage.titre, depannage.description, depannage.remarques),
    statut: firstValue(depannage.statut, depannage.status, STATUT_A_TRAITER),
    intervenant: firstValue(fullName(depannage.employe), depannage.intervenant, depannage.intervenant_nom),
    duree: depannage.duree ? `${depannage.duree} h` : '',
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
          <button
            onClick={retourListe}
            style={{ background: 'none', border: 'none', color: '#185FA5', fontSize: '13px', cursor: 'pointer', padding: 0 }}
          >
            Retour liste
          </button>
          <div style={{ fontWeight: 600, fontSize: '15px', marginTop: '4px' }}>Détail dépannage</div>
          <div style={{ fontSize: '11px', color: '#888' }}>Bon #{id}</div>
        </div>
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

            {edition ? (
              <form onSubmit={enregistrerDepannage} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <div className="form-group">
                  <label>Régie</label>
                  <select value={form.regie_id} onChange={e => setForm(prev => ({ ...prev, regie_id: e.target.value }))}>
                    <option value="">Non assignée</option>
                    {depannage.regie_id && depannage.regie?.nom && !regies.some(r => String(r.id) === String(depannage.regie_id)) && (
                      <option value={depannage.regie_id}>{depannage.regie.nom}</option>
                    )}
                    {regies.map(regie => (
                      <option key={regie.id} value={regie.id}>{regie.nom}</option>
                    ))}
                  </select>
                </div>
                <div className="form-group">
                  <label>Adresse / titre</label>
                  <input value={form.adresse} onChange={e => setForm(prev => ({ ...prev, adresse: e.target.value }))} required />
                </div>
                <div className="form-group">
                  <label>Description</label>
                  <textarea rows={4} value={form.remarques} onChange={e => setForm(prev => ({ ...prev, remarques: e.target.value }))} style={{ resize: 'vertical' }} />
                </div>
                <div className="form-group">
                  <label>Date</label>
                  <input type="date" value={form.date_travail} onChange={e => setForm(prev => ({ ...prev, date_travail: e.target.value }))} required />
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
                  <InfoLine label="Client" value={detail.client} />
                  <InfoLine label="Adresse" value={detail.adresse} />
                  <InfoLine label="Description / objet" value={detail.description || 'Aucune description renseignée'} />
                </DetailSection>

                <DetailSection title="Suivi">
                  <InfoLine label="Statut" value={detail.statut} />
                  <InfoLine label="Intervenant" value={detail.intervenant} />
                  <InfoLine label="Durée" value={detail.duree} />
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
                  <FutureSlot label="Pièces jointes à venir" />
                  <FutureSlot label="Historique à venir" />
                  <FutureSlot label="PDF, envoi et classement à venir" />
                </DetailSection>

                <button type="button" className="btn-primary" onClick={ouvrirEdition}>Modifier</button>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
