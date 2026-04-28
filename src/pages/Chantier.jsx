import React, { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import PageHeader from '../components/PageHeader'
import PageTopActions from '../components/PageTopActions'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth-context'
import { usePageRefresh } from '../lib/refresh'
import {
  isChantierVisibleToEmployees,
  isStandaloneIntermediaireRecord
} from '../services/chantiers.service'

export default function Chantier() {
  const navigate = useNavigate()
  const { id: chantierIdParam } = useParams()
  const { profile: user } = useAuth()

  const [niveau, setNiveau] = useState(1)
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [selectedIntermediaire, setSelectedIntermediaire] = useState(null)
  const [selectedChantier, setSelectedChantier] = useState(null)
  const [selectedAffaire, setSelectedAffaire] = useState(null)
  const [erreur, setErreur] = useState(null)
  const [ajoutChantier, setAjoutChantier] = useState(false)
  const [nouveauNomChantier, setNouveauNomChantier] = useState('')
  const [nouvelleAdresse, setNouvelleAdresse] = useState('')
  const [creationErreur, setCreationErreur] = useState('')
  const [creationLoading, setCreationLoading] = useState(false)

  const refreshPage = usePageRefresh(() => charger(), [niveau, selectedIntermediaire?.id, selectedChantier?.id])

  useEffect(() => {
    if (chantierIdParam) ouvrirChantierDepuisUrl(chantierIdParam)
    else charger(1, null, null)
  }, [chantierIdParam])

  async function ouvrirChantierDepuisUrl(chantierId) {
    setLoading(true)
    setErreur(null)
    try {
      const { data, error } = await supabase
        .from('chantiers')
        .select('id, nom, adresse, statut, intermediaire_id, intermediaires(id, nom)')
        .eq('id', chantierId)
        .eq('actif', true)
        .maybeSingle()
      if (error) throw error
      if (!data || !isChantierVisibleToEmployees(data) || isStandaloneIntermediaireRecord(data)) {
        setErreur('Chantier indisponible')
        setNiveau(1)
        await charger(1, null, null)
        return
      }

      const intermediaire = data.intermediaires || null
      setSelectedIntermediaire(intermediaire)
      setSelectedChantier(data)
      setNiveau(3)
      await charger(3, intermediaire, data)
    } catch (e) {
      setErreur(e.message)
      setNiveau(1)
      await charger(1, null, null)
    } finally {
      setLoading(false)
    }
  }

  async function charger(niveauCible = niveau, intermediaire = selectedIntermediaire, chantier = selectedChantier) {
    setLoading(true)
    setErreur(null)
    try {
      if (niveauCible === 1) {
        const { data, error } = await supabase
          .from('intermediaires')
          .select('id, nom')
          .eq('actif', true)
          .order('nom')
        if (error) throw error
        setItems(data || [])
      } else if (niveauCible === 2 && intermediaire?.id) {
        const { data, error } = await supabase
          .from('chantiers')
          .select('id, nom, adresse, statut')
          .eq('intermediaire_id', intermediaire.id)
          .eq('actif', true)
          .order('nom')
        if (error) throw error
        setItems((data || [])
          .filter(item => isChantierVisibleToEmployees(item))
          .filter(item => !isStandaloneIntermediaireRecord(item, [intermediaire]))
        )
      } else if (niveauCible === 3 && chantier?.id) {
        const { data, error } = await supabase
          .from('affaires')
          .select('id, numero, nom, statut')
          .eq('chantier_id', chantier.id)
          .eq('actif', true)
          .order('created_at')
        if (error) throw error
        setItems(data || [])
      } else {
        setItems([])
      }
    } catch (e) {
      setErreur(e.message)
    } finally {
      setLoading(false)
    }
  }

  async function allerVers(n, item) {
    if (loading) return

    const intermediaire = n === 2 ? item : selectedIntermediaire
    const chantier = n === 3 ? item : selectedChantier

    if (n === 2) setSelectedIntermediaire(intermediaire)
    if (n === 3) setSelectedChantier(chantier)
    if (n === 4) setSelectedAffaire(item)

    setNiveau(n)
    if (n < 4) await charger(n, intermediaire, chantier)
  }

  async function retour() {
    setErreur(null)
    if (niveau === 1) {
      navigate('/employe', { replace: true })
    } else if (niveau === 2) {
      setSelectedIntermediaire(null)
      setNiveau(1)
      await charger(1, null, null)
    } else if (niveau === 3) {
      setSelectedChantier(null)
      setNiveau(2)
      await charger(2, selectedIntermediaire, null)
    } else if (niveau === 4) {
      setSelectedAffaire(null)
      setNiveau(3)
      await charger(3, selectedIntermediaire, selectedChantier)
    }
  }

  async function creerChantier() {
    const nom = nouveauNomChantier.trim()
    if (!nom) { setCreationErreur('Renseigne le nom du chantier.'); return }
    setCreationLoading(true)
    setCreationErreur('')
    try {
      const { data, error } = await supabase
        .from('chantiers')
        .insert({
          nom,
          adresse: nouvelleAdresse.trim() || null,
          intermediaire_id: selectedIntermediaire.id,
          actif: true,
          statut: 'A confirmer'
        })
        .select('id, nom, adresse, statut')
        .single()
      if (error) throw error
      setAjoutChantier(false)
      setNouveauNomChantier('')
      setNouvelleAdresse('')
      await allerVers(3, data)
    } catch (e) {
      setCreationErreur(e.message || 'Erreur lors de la création.')
    } finally {
      setCreationLoading(false)
    }
  }

  function titreTop() {
    if (niveau === 1) return 'Intermédiaires'
    if (niveau === 2) return selectedIntermediaire?.nom || 'Chantiers'
    if (niveau === 3) return selectedChantier?.nom || 'Affaires'
    return selectedAffaire
      ? `${selectedAffaire.numero || ''}${selectedAffaire.nom ? ' · ' + selectedAffaire.nom : ''}`
      : 'Documents'
  }

  function sousTitreTop() {
    if (niveau === 2) return 'Intermédiaire'
    if (niveau === 3) return selectedIntermediaire?.nom
    if (niveau === 4) return `${selectedChantier?.nom} · Affaire`
    return 'Espace employé'
  }

  function titreListe() {
    if (niveau === 1) return 'Intermédiaires'
    if (niveau === 2) return 'Chantiers'
    if (niveau === 3) return 'Affaires'
    return 'Documents'
  }

  const headerRight = (
    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
      <PageTopActions navigate={navigate} fallbackPath="/employe" onRefresh={refreshPage} refreshing={loading} showBack={false} />
      <button className="avatar">{user?.initiales}</button>
    </div>
  )

  return (
    <div>
      <PageHeader
        title={titreTop()}
        subtitle={sousTitreTop()}
        onBack={retour}
        rightSlot={headerRight}
      />

      <div className="page-content">
        {niveau < 4 && (
          <div className="card" style={{ borderColor: '#D8E3EF', boxShadow: '0 6px 18px rgba(24, 95, 165, 0.06)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <span style={{ fontWeight: 600, fontSize: '14px' }}>{titreListe()}</span>
                {!loading && <span style={{ fontSize: '11px', color: '#888' }}>{items.length}</span>}
              </div>
              {niveau === 2 && !ajoutChantier && (
                <button
                  type="button"
                  onClick={() => { setAjoutChantier(true); setCreationErreur('') }}
                  style={{ padding: '4px 10px', borderRadius: '6px', border: '1px solid #185FA5', background: '#fff', color: '#185FA5', fontSize: '12px', cursor: 'pointer', fontWeight: 600 }}
                >
                  + Nouveau
                </button>
              )}
            </div>
            {ajoutChantier && niveau === 2 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '12px', padding: '10px', background: '#F8FAFC', borderRadius: '8px', border: '1px solid #D8E3EF' }}>
                <input
                  placeholder="Nom *"
                  value={nouveauNomChantier}
                  onChange={e => setNouveauNomChantier(e.target.value)}
                  style={{ padding: '8px', borderRadius: '6px', border: '1px solid #ddd', fontSize: '13px' }}
                />
                <input
                  placeholder="Adresse"
                  value={nouvelleAdresse}
                  onChange={e => setNouvelleAdresse(e.target.value)}
                  style={{ padding: '8px', borderRadius: '6px', border: '1px solid #ddd', fontSize: '13px' }}
                />
                {creationErreur && <div style={{ fontSize: '12px', color: '#c0392b' }}>{creationErreur}</div>}
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button
                    type="button"
                    className="btn-outline"
                    style={{ flex: 1 }}
                    onClick={() => { setAjoutChantier(false); setNouveauNomChantier(''); setNouvelleAdresse(''); setCreationErreur('') }}
                  >
                    Annuler
                  </button>
                  <button
                    type="button"
                    className="btn-primary"
                    style={{ flex: 1 }}
                    onClick={creerChantier}
                    disabled={creationLoading}
                  >
                    {creationLoading ? '...' : 'Créer'}
                  </button>
                </div>
              </div>
            )}

            {loading && <div style={{ fontSize: '13px', color: '#888' }}>Chargement...</div>}

            {!loading && !erreur && items.length === 0 && (
              <div style={{ fontSize: '13px', color: '#888' }}>Aucun élément</div>
            )}

            {erreur && (
              <div style={{ fontSize: '12px', color: '#c0392b' }}>{erreur}</div>
            )}

            {!loading && items.map(item => (
              <button
                key={item.id}
                type="button"
                className="row-item"
                style={{ cursor: 'pointer', width: '100%', textAlign: 'left', background: '#fff', borderBottomColor: '#E7EDF5' }}
                onClick={() => allerVers(niveau + 1, item)}
              >
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 500, fontSize: '13px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {niveau === 3
                      ? `${item.numero}${item.nom ? ' · ' + item.nom : ''}`
                      : item.nom}
                  </div>
                  {niveau === 2 && item.adresse && (
                    <div style={{ fontSize: '11px', color: '#888', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.adresse}</div>
                  )}
                  {niveau === 3 && item.statut && (
                    <div style={{ fontSize: '11px', color: '#888' }}>{item.statut}</div>
                  )}
                </div>
                <span style={{ color: '#185FA5', fontSize: '18px', lineHeight: 1 }}>›</span>
              </button>
            ))}
          </div>
        )}

        {niveau === 4 && (
          <div className="card" style={{ borderColor: '#D8E3EF', boxShadow: '0 6px 18px rgba(24, 95, 165, 0.06)' }}>
            <div style={{ fontWeight: 600, fontSize: '14px', marginBottom: '12px' }}>Documents</div>
            <button
              type="button"
              className="btn-primary"
              disabled={!selectedAffaire?.id}
              onClick={() => navigate(`/employe/rapport/${selectedAffaire.id}`)}
            >
              + Nouveau rapport
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
