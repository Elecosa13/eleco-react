import React, { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import PageTopActions from '../components/PageTopActions'
import PhotoInputPanel from '../components/PhotoInputPanel'
import { useDraftPhotos } from '../lib/photo-drafts'
import { supabase } from '../lib/supabase'
import { supabaseSafe } from '../lib/supabaseSafe'
import { useAuth } from '../lib/auth-context'
import { safeLocalStorage } from '../lib/safe-browser'
import { usePageRefresh } from '../lib/refresh'
import { upsertLinkedTimeEntry } from '../services/timeEntries.service'
import { uploadRapportPhotos } from '../services/rapportPhotos.service'
import { isChantierVisibleToEmployees } from '../services/chantiers.service'

const FAVORIS_KEY = 'eleco_favoris'
const CREDIT_JOUR = 8

function loadFavoris() {
  return safeLocalStorage.getJSON(FAVORIS_KEY, [])
}

function saveFavoris(favoris) {
  safeLocalStorage.setJSON(FAVORIS_KEY, favoris)
}

export default function Rapport() {
  const navigate = useNavigate()
  const { id } = useParams()
  const { profile: user } = useAuth()
  const [sd, setSd] = useState(null)
  const [date, setDate] = useState(new Date().toISOString().split('T')[0])
  const [duree, setDuree] = useState(8)
  const [remarques, setRemarques] = useState('')
  const [materiaux, setMateriaux] = useState([])
  const [catalogue, setCatalogue] = useState([])
  const [categories, setCategories] = useState([])
  const [catalogueVue, setCatalogueVue] = useState(false)
  const [recherche, setRecherche] = useState('')
  const [catFiltre, setCatFiltre] = useState('Favoris')
  const [favoris, setFavoris] = useState(loadFavoris)
  const [articleManuel, setArticleManuel] = useState({ nom: '', unite: 'pce', qte: 1, pu: '0' })
  const [envoi, setEnvoi] = useState(false)
  const [succes, setSucces] = useState(false)
  const [loading, setLoading] = useState(true)
  const [creditUtilise, setCreditUtilise] = useState(0)
  const [rapportExistant, setRapportExistant] = useState(null)
  const { photos, addFiles, removePhoto, clearPhotos } = useDraftPhotos(`rapport-draft:${user?.id || 'anon'}:${id || 'unknown'}`)
  const refreshPage = usePageRefresh(() => charger(), [id, user?.id])

  useEffect(() => {
    charger()
  }, [id])

  useEffect(() => {
    verifierRapportExistant(date)
  }, [date, id, user?.id])

  async function charger() {
    setLoading(true)
    await Promise.all([
      supabase
        .from('sous_dossiers')
        .select('*, chantiers(id, nom, statut)')
        .eq('id', id)
        .single()
        .then(({ data }) => {
          if (data && data.chantiers && !isChantierVisibleToEmployees(data.chantiers)) {
            navigate('/employe')
            return
          }
          if (data) setSd(data)
        }),
      supabase
        .from('catalogue')
        .select('*')
        .eq('actif', true)
        .order('categorie')
        .order('nom')
        .then(({ data }) => {
          if (data && data.length > 0) {
            setCatalogue(data)
            setCategories(['Favoris', ...Array.from(new Set(data.map(article => article.categorie).filter(Boolean)))])
          }
        }),
      chargerCredit(date)
    ])
    setLoading(false)
  }

  async function verifierRapportExistant(dateTravail) {
    if (!id || !user?.id || !dateTravail) {
      setRapportExistant(null)
      return
    }

    const { data, error } = await supabase
      .from('rapports')
      .select('id, valide')
      .eq('sous_dossier_id', id)
      .eq('employe_id', user.id)
      .eq('date_travail', dateTravail)
      .is('deleted_at', null)
      .maybeSingle()

    if (error) {
      console.error('Erreur verification rapport chantier existant', error)
      return
    }

    setRapportExistant(data || null)
  }

  async function chargerCredit(dateTravail) {
    const { data } = await supabase
      .from('time_entries')
      .select('duree')
      .eq('employe_id', user.id)
      .eq('date_travail', dateTravail)
    if (data) setCreditUtilise(data.reduce((sum, entry) => sum + Number(entry.duree), 0))
  }

  function toggleFavori(favId) {
    const next = favoris.includes(favId) ? favoris.filter(id => id !== favId) : [...favoris, favId]
    setFavoris(next)
    saveFavoris(next)
  }

  const articlesFiltres = (() => {
    let liste = catalogue
    if (catFiltre === 'Favoris') liste = catalogue.filter(article => favoris.includes(article.id))
    else if (catFiltre) liste = catalogue.filter(article => article.categorie === catFiltre)
    if (recherche) liste = liste.filter(article => article.nom.toLowerCase().includes(recherche.toLowerCase()))
    return liste.slice(0, 80)
  })()

  function ajouter(article) {
    const existant = materiaux.find(item => item.id === article.id)
    if (existant) {
      setMateriaux(materiaux.map(item => item.id === article.id ? { ...item, qte: item.qte + 1 } : item))
      return
    }

    setMateriaux([
      ...materiaux,
      { id: article.id, catalogueId: article.id, nom: article.nom, unite: article.unite, qte: 1, pu: article.prix_net }
    ])
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
        unite: articleManuel.unite.trim() || 'pce',
        qte: Math.max(1, Number(articleManuel.qte) || 1),
        pu: Math.max(0, Number(articleManuel.pu) || 0)
      }
    ])
    setArticleManuel({ nom: '', unite: 'pce', qte: 1, pu: '0' })
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
      console.error('Erreur preparation photos rapport', error)
      alert("Impossible d'ajouter cette photo pour l'instant.")
    }
  }

  function retirerPhoto(photoId) {
    removePhoto(photoId)
  }

  async function envoyer(event) {
    event.preventDefault()
    if (!user || !sd) return
    if (rapportExistant?.id) return
    setEnvoi(true)

    try {
      const rapport = await supabaseSafe(
        supabase
          .from('rapports')
          .insert({
            sous_dossier_id: id,
            employe_id: user.id,
            date_travail: date,
            heure_debut: '07:30',
            heure_fin: '17:00',
            remarques
          })
          .select()
          .single()
      )

      if (rapport) {
        await upsertLinkedTimeEntry({
          employeId: user.id,
          type: 'chantier',
          referenceId: rapport.id,
          dateTravail: date,
          duree,
          chantierId: sd.chantier_id
        })

        if (materiaux.length > 0) {
          await supabaseSafe(
            supabase.from('rapport_materiaux').insert(
              materiaux.map(item => ({
                rapport_id: rapport.id,
                ref_article: item.catalogueId || null,
                designation: item.nom,
                unite: item.unite,
                quantite: item.qte,
                prix_net: item.pu
              }))
            )
          )
        }

        if (photos.length > 0) {
          await uploadRapportPhotos({
            rapportId: rapport.id,
            chantierId: sd.chantier_id,
            sousDossierId: id,
            files: photos.map(photo => photo.file),
            userId: user.id
          })
        }
      }

      clearPhotos()
      setSucces(true)
      setTimeout(() => navigate(`/employe/chantier/${sd.chantier_id}`), 2000)
    } catch (error) {
      if (error?.code === '23505' || String(error?.message || '').includes('duplicate_chantier_rapport')) {
        await verifierRapportExistant(date)
        alert("Un rapport existe deja pour cette date dans ce sous-dossier.")
      } else {
        alert("Erreur lors de l'envoi du rapport. Veuillez réessayer.")
      }
    } finally {
      setEnvoi(false)
    }
  }

  const DUREES = [1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5, 5.5, 6, 6.5, 7, 7.5, 8]
  const creditRestant = CREDIT_JOUR - creditUtilise
  const depasse = creditUtilise + duree > CREDIT_JOUR

  if (succes) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '16px' }}>
        <div style={{ fontSize: '48px' }}>✓</div>
        <div style={{ fontWeight: 600, fontSize: '16px' }}>Rapport envoyé.</div>
      </div>
    )
  }

  if (catalogueVue) {
    return (
      <div>
        <div className="top-bar">
          <div>
            <div style={{ fontWeight: 600, fontSize: '15px', marginTop: '4px' }}>Catalogue</div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            {materiaux.length > 0 && <span className="badge badge-blue">{materiaux.reduce((sum, item) => sum + item.qte, 0)}</span>}
            <PageTopActions navigate={navigate} fallbackPath={sd ? `/employe/chantier/${sd.chantier_id}` : '/employe'} />
          </div>
        </div>
        <div className="page-content">
          <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <div style={{ fontWeight: 600, fontSize: '13px', color: '#185FA5' }}>Article manuel</div>
            <div className="form-group">
              <label>Désignation *</label>
              <input value={articleManuel.nom} onChange={event => setArticleManuel(current => ({ ...current, nom: event.target.value }))} placeholder="Ex: disjoncteur spécifique" />
            </div>
            <div className="grid2">
              <div className="form-group">
                <label>Unité</label>
                <input value={articleManuel.unite} onChange={event => setArticleManuel(current => ({ ...current, unite: event.target.value }))} />
              </div>
              <div className="form-group">
                <label>Quantité</label>
                <input type="number" min="1" value={articleManuel.qte} onChange={event => setArticleManuel(current => ({ ...current, qte: event.target.value }))} />
              </div>
            </div>
            <div className="form-group">
              <label>Prix net (CHF)</label>
              <input type="number" min="0" step="0.01" value={articleManuel.pu} onChange={event => setArticleManuel(current => ({ ...current, pu: event.target.value }))} />
            </div>
            <button type="button" className="btn-primary" disabled={!articleManuel.nom.trim()} onClick={ajouterManuel}>+ Ajouter l'article manuel</button>
          </div>
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
          {!loading && catalogue.length === 0 && (
            <div style={{ textAlign: 'center', color: '#888', fontSize: '13px', padding: '20px' }}>Catalogue vide</div>
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
      <div className="top-bar">
        <div>
          <div style={{ fontWeight: 600, fontSize: '15px', marginTop: '4px' }}>Nouveau rapport</div>
          {sd && <div style={{ fontSize: '11px', color: '#888' }}>{sd.chantiers?.nom} ? {sd.nom}</div>}
        </div>
        <PageTopActions navigate={navigate} fallbackPath={sd ? `/employe/chantier/${sd.chantier_id}` : '/employe'} onRefresh={refreshPage} refreshing={loading} />
      </div>
      <form onSubmit={envoyer}>
        <div className="page-content">
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

          {rapportExistant?.id && (
            <div style={{
              background: rapportExistant.valide ? '#FAEEDA' : '#FCEBEB',
              border: `1px solid ${rapportExistant.valide ? '#efd19c' : '#f09595'}`,
              borderRadius: '8px',
              padding: '10px 14px',
              fontSize: '12px',
              color: rapportExistant.valide ? '#8A5A10' : '#A32D2D'
            }}>
              {rapportExistant.valide
                ? "Un rapport valide existe deja pour cette date. Les heures sont verrouillees."
                : "Un rapport existe deja pour cette date. La recreation est bloquee pour eviter un double comptage."}
            </div>
          )}

          <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div style={{ fontWeight: 600, fontSize: '14px' }}>Heures travaillées</div>
            <div className="form-group">
              <label>Date</label>
              <input type="date" value={date} onChange={event => { setDate(event.target.value); chargerCredit(event.target.value) }} required />
            </div>
            <div className="form-group">
              <label>Durée sur ce chantier</label>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginTop: '4px' }}>
                {DUREES.map(valeur => (
                  <button
                    key={valeur}
                    type="button"
                    onClick={() => setDuree(valeur)}
                    style={{
                      padding: '8px 14px',
                      borderRadius: '20px',
                      fontSize: '13px',
                      fontWeight: 500,
                      cursor: 'pointer',
                      border: duree === valeur ? 'none' : '1px solid #ddd',
                      background: duree === valeur ? '#185FA5' : 'white',
                      color: duree === valeur ? 'white' : '#333'
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
              <button type="button" className="btn-primary btn-sm" style={{ width: 'auto' }} onClick={() => setCatalogueVue(true)}>+ Ajouter</button>
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
            <div style={{ fontSize: '11px', color: '#888' }}>Les photos restent visibles ici jusqu'a l'envoi du rapport ou leur suppression manuelle.</div>
            <PhotoInputPanel
              onFilesSelected={ajouterPhotosDepuisListe}
              dropTitle="Glisser-deposer des photos ici"
              dropHint="ou cliquer pour selectionner dans vos fichiers"
              dropNote="Ajout multiple sur ordinateur, sans changer le flux Camera ou Galerie."
            />
            {photos.length === 0 && <div style={{ fontSize: '13px', color: '#888' }}>Aucune photo</div>}
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
            <textarea placeholder="Observations..." value={remarques} onChange={event => setRemarques(event.target.value)} rows={3} />
          </div>

          <button type="submit" className="btn-primary" disabled={envoi || Boolean(rapportExistant?.id)}>{envoi ? 'Envoi...' : '✓ Envoyer le rapport'}</button>
        </div>
      </form>
    </div>
  )
}
