import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import PageTopActions from '../components/PageTopActions'
import { supabase } from '../lib/supabase'
import { usePageRefresh } from '../lib/refresh'

const SEEDS = [
  'ABA', 'ALTUN', 'Bonbonnière', 'DS', 'Eyka',
  'Zimmerman', 'Jonathan / sani Projet', 'Wandrille'
]

export default function Chantier() {
  const navigate = useNavigate()

  const [niveau, setNiveau] = useState(1)
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [selectedIntermediaire, setSelectedIntermediaire] = useState(null)
  const [selectedChantier, setSelectedChantier] = useState(null)
  const [selectedAffaire, setSelectedAffaire] = useState(null)

  const [showForm, setShowForm] = useState(false)
  const [nomAjout, setNomAjout] = useState('')
  const [adresseAjout, setAdresseAjout] = useState('')
  const [numeroAjout, setNumeroAjout] = useState('')
  const [saving, setSaving] = useState(false)
  const [erreur, setErreur] = useState(null)

  const refreshPage = usePageRefresh(() => charger(), [])

  useEffect(() => { charger() }, [niveau, selectedIntermediaire?.id, selectedChantier?.id])

  async function charger() {
    setLoading(true)
    setErreur(null)
    try {
      if (niveau === 1) {
        const { data, error } = await supabase
          .from('intermediaires')
          .select('id, nom')
          .eq('actif', true)
          .order('nom')
        if (error) throw error
        if (!data || data.length === 0) {
          await seederIntermediaires()
          const { data: seeded } = await supabase
            .from('intermediaires').select('id, nom').eq('actif', true).order('nom')
          setItems(seeded || [])
        } else {
          setItems(data)
        }
      } else if (niveau === 2) {
        const { data, error } = await supabase
          .from('chantiers')
          .select('id, nom, adresse, statut')
          .eq('intermediaire_id', selectedIntermediaire.id)
          .eq('actif', true)
          .order('nom')
        if (error) throw error
        setItems(data || [])
      } else if (niveau === 3) {
        const { data, error } = await supabase
          .from('affaires')
          .select('id, numero, nom, statut')
          .eq('chantier_id', selectedChantier.id)
          .eq('actif', true)
          .order('created_at')
        if (error) throw error
        setItems(data || [])
      }
    } catch (e) {
      setErreur(e.message)
    } finally {
      setLoading(false)
    }
  }

  async function seederIntermediaires() {
    for (const nom of SEEDS) {
      await supabase.from('intermediaires').insert({ nom, type: 'intermediaire', actif: true })
    }
  }

  async function ajouterItem() {
    setSaving(true)
    setErreur(null)
    try {
      if (niveau === 1) {
        if (!nomAjout.trim()) { setErreur('Nom requis'); return }
        const { error } = await supabase.from('intermediaires').insert({ nom: nomAjout.trim(), type: 'intermediaire' })
        if (error) throw error
      } else if (niveau === 2) {
        if (!nomAjout.trim()) { setErreur('Nom requis'); return }
        const { error } = await supabase.from('chantiers').insert({
          nom: nomAjout.trim(),
          adresse: adresseAjout.trim() || null,
          intermediaire_id: selectedIntermediaire.id
        })
        if (error) throw error
      } else if (niveau === 3) {
        if (!numeroAjout.trim()) { setErreur('Numéro requis'); return }
        const { error } = await supabase.from('affaires').insert({
          chantier_id: selectedChantier.id,
          numero: numeroAjout.trim(),
          nom: nomAjout.trim() || null
        })
        if (error) throw error
      }
      fermerForm()
      await charger()
    } catch (e) {
      setErreur(e.message)
    } finally {
      setSaving(false)
    }
  }

  function fermerForm() {
    setShowForm(false)
    setNomAjout('')
    setAdresseAjout('')
    setNumeroAjout('')
    setErreur(null)
  }

  function allerVers(n, item) {
    if (n === 2) setSelectedIntermediaire(item)
    if (n === 3) setSelectedChantier(item)
    if (n === 4) setSelectedAffaire(item)
    setItems([])
    fermerForm()
    setNiveau(n)
  }

  function retour() {
    fermerForm()
    if (niveau === 2) { setSelectedIntermediaire(null); setNiveau(1) }
    else if (niveau === 3) { setSelectedChantier(null); setNiveau(2) }
    else if (niveau === 4) { setSelectedAffaire(null); setNiveau(3) }
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
    return null
  }

  function titreListe() {
    if (niveau === 1) return 'Intermédiaires'
    if (niveau === 2) return 'Chantiers'
    if (niveau === 3) return 'Affaires'
    return 'Documents'
  }

  return (
    <div>
      <div className="top-bar">
        <div>
          <div style={{ fontWeight: 600, fontSize: '15px', marginTop: '4px' }}>{titreTop()}</div>
          {sousTitreTop() && (
            <div style={{ fontSize: '11px', color: '#888' }}>{sousTitreTop()}</div>
          )}
        </div>
        <PageTopActions navigate={navigate} fallbackPath="/employe" onRefresh={refreshPage} />
      </div>

      <div className="page-content">

        {niveau < 4 && (
          <div className="card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                {niveau > 1 && (
                  <button
                    type="button"
                    onClick={retour}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#185FA5', fontSize: '13px', padding: 0 }}
                  >
                    ← Retour
                  </button>
                )}
                <span style={{ fontWeight: 600, fontSize: '14px' }}>{titreListe()}</span>
                {!loading && <span style={{ fontSize: '11px', color: '#888' }}>{items.length}</span>}
              </div>
              <button
                type="button"
                onClick={() => { setShowForm(f => !f); setErreur(null) }}
                style={{
                  background: '#185FA5', color: '#fff', border: 'none', borderRadius: '6px',
                  width: '28px', height: '28px', fontSize: '18px', cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', lineHeight: 1, flexShrink: 0
                }}
              >
                +
              </button>
            </div>

            {showForm && (
              <div style={{ background: '#F5F8FC', borderRadius: '8px', padding: '12px', marginBottom: '12px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {niveau === 3 && (
                  <input
                    placeholder="Numéro d'affaire *"
                    value={numeroAjout}
                    onChange={e => setNumeroAjout(e.target.value)}
                    style={{ padding: '8px 10px', borderRadius: '6px', border: '1px solid #ddd', fontSize: '13px' }}
                  />
                )}
                <input
                  placeholder={niveau === 3 ? 'Nom (optionnel)' : 'Nom *'}
                  value={nomAjout}
                  onChange={e => setNomAjout(e.target.value)}
                  style={{ padding: '8px 10px', borderRadius: '6px', border: '1px solid #ddd', fontSize: '13px' }}
                />
                {niveau === 2 && (
                  <input
                    placeholder="Adresse (optionnelle)"
                    value={adresseAjout}
                    onChange={e => setAdresseAjout(e.target.value)}
                    style={{ padding: '8px 10px', borderRadius: '6px', border: '1px solid #ddd', fontSize: '13px' }}
                  />
                )}
                {erreur && <div style={{ fontSize: '12px', color: '#c0392b' }}>{erreur}</div>}
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button
                    type="button"
                    onClick={ajouterItem}
                    disabled={saving}
                    style={{ flex: 1, background: '#185FA5', color: '#fff', border: 'none', borderRadius: '6px', padding: '8px', fontSize: '13px', cursor: 'pointer', fontWeight: 600 }}
                  >
                    {saving ? 'Enregistrement...' : 'Ajouter'}
                  </button>
                  <button
                    type="button"
                    onClick={fermerForm}
                    style={{ flex: 1, background: '#eee', color: '#333', border: 'none', borderRadius: '6px', padding: '8px', fontSize: '13px', cursor: 'pointer' }}
                  >
                    Annuler
                  </button>
                </div>
              </div>
            )}

            {loading && <div style={{ fontSize: '13px', color: '#888' }}>Chargement...</div>}

            {!loading && !erreur && items.length === 0 && (
              <div style={{ fontSize: '13px', color: '#888' }}>Aucun élément</div>
            )}

            {erreur && !showForm && (
              <div style={{ fontSize: '12px', color: '#c0392b' }}>{erreur}</div>
            )}

            {!loading && items.map(item => (
              <button
                key={item.id}
                type="button"
                className="row-item"
                style={{ cursor: 'pointer', width: '100%', textAlign: 'left', background: '#fff' }}
                onClick={() => allerVers(niveau + 1, item)}
              >
                <div>
                  <div style={{ fontWeight: 500, fontSize: '13px' }}>
                    {niveau === 3
                      ? `${item.numero}${item.nom ? ' · ' + item.nom : ''}`
                      : item.nom}
                  </div>
                  {niveau === 2 && item.adresse && (
                    <div style={{ fontSize: '11px', color: '#888' }}>{item.adresse}</div>
                  )}
                  {niveau === 3 && item.statut && (
                    <div style={{ fontSize: '11px', color: '#888' }}>{item.statut}</div>
                  )}
                </div>
                <span style={{ color: '#185FA5' }}>{'>'}</span>
              </button>
            ))}
          </div>
        )}

        {niveau === 4 && (
          <div className="card">
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px' }}>
              <button
                type="button"
                onClick={retour}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#185FA5', fontSize: '13px', padding: 0 }}
              >
                ← Retour
              </button>
              <span style={{ fontWeight: 600, fontSize: '14px' }}>Documents</span>
            </div>
            <button
              type="button"
              className="btn-primary"
              onClick={() => navigate(`/employe/rapport/${selectedAffaire.id}`)}
            >
              Nouveau rapport
            </button>
          </div>
        )}

      </div>
    </div>
  )
}
