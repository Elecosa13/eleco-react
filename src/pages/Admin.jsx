import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'

const TAUX = 115
const MOIS_FR = ['Janvier','Février','Mars','Avril','Mai','Juin','Juillet','Août','Septembre','Octobre','Novembre','Décembre']
const JOURS_FR = ['L','M','M','J','V','S','D']

function debutFin(year, month) {
  const debut = `${year}-${String(month + 1).padStart(2, '0')}-01`
  const fin = `${year}-${String(month + 1).padStart(2, '0')}-${String(new Date(year, month + 1, 0).getDate()).padStart(2, '0')}`
  return { debut, fin }
}

function calcDuree(debut, fin) {
  if (!debut || !fin) return 0
  const [hd, md] = debut.split(':').map(Number)
  const [hf, mf] = fin.split(':').map(Number)
  return (hf * 60 + mf - hd * 60 - md) / 60
}

export default function Admin() {
  const navigate = useNavigate()
  const user = JSON.parse(localStorage.getItem('eleco_user') || 'null')
  const [vue, setVue] = useState('accueil')
  const [rapportsEnAttente, setRapportsEnAttente] = useState([])
  const [chantiers, setChantiers] = useState([])
  const [depannages, setDepannages] = useState([])
  const [chantierActif, setChantierActif] = useState(null)
  const [sousDossiers, setSousDossiers] = useState([])
  const [sousDossierActif, setSousDossierActif] = useState(null)
  const [rapports, setRapports] = useState([])
  const [rapportDetail, setRapportDetail] = useState(null)
  const [catalogue, setCatalogue] = useState([])
  const [confirm, setConfirm] = useState(null)
  const [corbeille, setCorbeille] = useState([])
  const [vueCorbeille, setVueCorbeille] = useState(false)
  const [nouveauNomChantier, setNouveauNomChantier] = useState('')
  const [nouvelleAdresse, setNouvelleAdresse] = useState('')
  const [ajoutChantier, setAjoutChantier] = useState(false)
  const [renommerItem, setRenommerItem] = useState(null)
  const [nouveauNom, setNouveauNom] = useState('')
  const [nouveauSd, setNouveauSd] = useState(false)
  const [nouveauSdNom, setNouveauSdNom] = useState('')
  const [editMateriaux, setEditMateriaux] = useState(null)
  const [ajoutArticleVue, setAjoutArticleVue] = useState(false)
  const [rechercheArticle, setRechercheArticle] = useState('')
  const [catFiltre, setCatFiltre] = useState('Tous')
  const [categories, setCategories] = useState([])
  // Calendrier
  const [calMois, setCalMois] = useState(() => { const d = new Date(); return { year: d.getFullYear(), month: d.getMonth() } })
  const [calEmployeFiltre, setCalEmployeFiltre] = useState('tous')
  const [employes, setEmployes] = useState([])
  const [calRapports, setCalRapports] = useState([])
  const [calDepannages, setCalDepannages] = useState([])
  const [calJour, setCalJour] = useState(null)
  // Employés
  const [empStats, setEmpStats] = useState({})
  const [empLoading, setEmpLoading] = useState(false)
  const [empDetail, setEmpDetail] = useState(null)
  const [empDetailMois, setEmpDetailMois] = useState(() => { const d = new Date(); return { year: d.getFullYear(), month: d.getMonth() } })
  const [empDetailRapports, setEmpDetailRapports] = useState([])
  const [empDetailDepannages, setEmpDetailDepannages] = useState([])

  useEffect(() => { chargerTout() }, [])

  async function chargerTout() {
    const { data: rap } = await supabase.from('rapports')
      .select('*, employe:employe_id(prenom), sous_dossiers(nom, chantiers(nom)), rapport_materiaux(*)')
      .eq('valide', false).order('created_at', { ascending: false })
    if (rap) setRapportsEnAttente(rap)

    const { data: ch } = await supabase.from('chantiers').select('*').eq('actif', true).order('nom')
    if (ch) setChantiers(ch)

    const { data: dep } = await supabase.from('depannages')
      .select('*, employe:employe_id(prenom), rapport_materiaux(*)')
      .order('date_travail', { ascending: false })
    if (dep) setDepannages(dep)

    const { data: cat } = await supabase.from('catalogue').select('*').eq('actif', true).order('categorie').order('nom')
    if (cat) {
      setCatalogue(cat)
      setCategories(['Tous', ...Array.from(new Set(cat.map(a => a.categorie).filter(Boolean)))])
    }

    const { data: emp } = await supabase.from('utilisateurs').select('id, prenom, initiales').eq('role', 'employe').order('prenom')
    if (emp) setEmployes(emp)
  }

  async function chargerSousDossiers(chantierId) {
    const { data } = await supabase.from('sous_dossiers').select('*').eq('chantier_id', chantierId).order('created_at')
    if (data) setSousDossiers(data)
  }

  async function chargerRapports(sdId) {
    const { data } = await supabase.from('rapports')
      .select('*, employe:employe_id(prenom), rapport_materiaux(*)')
      .eq('sous_dossier_id', sdId).order('date_travail', { ascending: false })
    if (data) setRapports(data)
  }

  async function chargerCalendrier(mois) {
    const m = mois || calMois
    const { debut, fin } = debutFin(m.year, m.month)

    const { data: raps } = await supabase.from('rapports')
      .select('employe_id, heure_debut, heure_fin, employe:employe_id(id, prenom), sous_dossiers(nom, chantiers(nom))')
      .gte('date_travail', debut).lte('date_travail', fin)
    if (raps) setCalRapports(raps)

    const { data: deps } = await supabase.from('depannages')
      .select('*, employe:employe_id(id, prenom)')
      .gte('date_travail', debut).lte('date_travail', fin)
    if (deps) setCalDepannages(deps)
  }

  function changerMois(delta) {
    const d = new Date(calMois.year, calMois.month + delta, 1)
    const newMois = { year: d.getFullYear(), month: d.getMonth() }
    setCalMois(newMois)
    setCalJour(null)
    chargerCalendrier(newMois)
  }

  async function chargerStatsEmployes() {
    setEmpLoading(true)

    const { data: listeEmp } = await supabase
      .from('utilisateurs')
      .select('id, prenom, initiales')
      .eq('role', 'employe')
      .order('prenom')

    if (!listeEmp || listeEmp.length === 0) {
      setEmpLoading(false)
      return
    }
    setEmployes(listeEmp)

    const now = new Date()
    const { debut: debutMois, fin: finMois } = debutFin(now.getFullYear(), now.getMonth())
    const prevDate = new Date(now.getFullYear(), now.getMonth() - 1, 1)
    const { debut: debutPrev, fin: finPrev } = debutFin(prevDate.getFullYear(), prevDate.getMonth())

    // 2 requêtes Supabase parallèles — filtre de date côté DB
    const [{ data: rapsMois }, { data: rapsPrev }] = await Promise.all([
      supabase.from('rapports')
        .select('employe_id, heure_debut, heure_fin, sous_dossiers(chantier_id)')
        .gte('date_travail', debutMois)
        .lte('date_travail', finMois),
      supabase.from('rapports')
        .select('employe_id, heure_debut, heure_fin')
        .gte('date_travail', debutPrev)
        .lte('date_travail', finPrev)
    ])

    const stats = {}
    for (const emp of listeEmp) {
      const rapsEmpMois = (rapsMois || []).filter(r => String(r.employe_id) === String(emp.id))
      const rapsEmpPrev = (rapsPrev || []).filter(r => String(r.employe_id) === String(emp.id))
      stats[emp.id] = {
        heureMois: rapsEmpMois.reduce((s, r) => s + calcDuree(r.heure_debut, r.heure_fin), 0),
        heurePrev: rapsEmpPrev.reduce((s, r) => s + calcDuree(r.heure_debut, r.heure_fin), 0),
        chantiersCount: new Set(rapsEmpMois.map(r => r.sous_dossiers?.chantier_id).filter(Boolean)).size
      }
    }
    setEmpStats(stats)
    setEmpLoading(false)
  }

  async function chargerDetailEmploye(empId, mois) {
    const m = mois || empDetailMois
    const { debut, fin } = debutFin(m.year, m.month)

    const { data: raps } = await supabase.from('rapports')
      .select('*, sous_dossiers(nom, chantier_id, chantiers(nom))')
      .eq('employe_id', empId)
      .gte('date_travail', debut).lte('date_travail', fin)
      .order('date_travail')
    if (raps) setEmpDetailRapports(raps)

    const { data: deps } = await supabase.from('depannages')
      .select('*')
      .eq('employe_id', empId)
      .gte('date_travail', debut).lte('date_travail', fin)
      .order('date_travail')
    if (deps) setEmpDetailDepannages(deps)
  }

  async function deconnecter() { await supabase.auth.signOut(); localStorage.removeItem('eleco_user'); navigate('/login') }

  // CORBEILLE
  async function supprimerChantier(c) {
    const { data: sds } = await supabase.from('sous_dossiers').select('*').eq('chantier_id', c.id)
    setCorbeille(prev => [...prev, { type: 'chantier', label: c.nom, data: c, enfants: sds || [] }])
    await supabase.from('chantiers').update({ actif: false }).eq('id', c.id)
    chargerTout(); setConfirm(null); setVue('chantiers'); setChantierActif(null)
  }

  async function supprimerSousDossier(sd) {
    const { data: raps } = await supabase.from('rapports').select('*, rapport_materiaux(*)').eq('sous_dossier_id', sd.id)
    setCorbeille(prev => [...prev, { type: 'sous_dossier', label: sd.nom, data: sd, enfants: raps || [] }])
    await supabase.from('sous_dossiers').delete().eq('id', sd.id)
    chargerSousDossiers(chantierActif.id); setConfirm(null)
  }

  async function supprimerRapport(r) {
    setCorbeille(prev => [...prev, { type: 'rapport', label: `${r.employe?.prenom} · ${new Date(r.date_travail).toLocaleDateString('fr-CH')}`, data: r, enfants: [] }])
    await supabase.from('rapports').delete().eq('id', r.id)
    if (sousDossierActif) chargerRapports(sousDossierActif.id)
    setRapportDetail(null); setConfirm(null)
  }

  async function restaurerCorbeille(item) {
    if (item.type === 'chantier') {
      await supabase.from('chantiers').update({ actif: true }).eq('id', item.data.id)
    } else if (item.type === 'sous_dossier') {
      await supabase.from('sous_dossiers').insert({ chantier_id: item.data.chantier_id, nom: item.data.nom })
    } else if (item.type === 'rapport') {
      const { data: newR } = await supabase.from('rapports').insert({
        sous_dossier_id: item.data.sous_dossier_id, employe_id: item.data.employe_id,
        date_travail: item.data.date_travail, heure_debut: item.data.heure_debut,
        heure_fin: item.data.heure_fin, remarques: item.data.remarques, valide: item.data.valide
      }).select().single()
      if (newR && item.data.rapport_materiaux?.length > 0) {
        await supabase.from('rapport_materiaux').insert(
          item.data.rapport_materiaux.map(m => ({ rapport_id: newR.id, ref_article: m.ref_article, designation: m.designation, unite: m.unite, quantite: m.quantite, prix_net: m.prix_net }))
        )
      }
    }
    setCorbeille(prev => prev.filter(i => i !== item))
    chargerTout()
  }

  async function renommer() {
    if (!renommerItem || !nouveauNom.trim()) return
    if (renommerItem.type === 'chantier') {
      await supabase.from('chantiers').update({ nom: nouveauNom }).eq('id', renommerItem.data.id)
      chargerTout()
    } else if (renommerItem.type === 'sous_dossier') {
      await supabase.from('sous_dossiers').update({ nom: nouveauNom }).eq('id', renommerItem.data.id)
      chargerSousDossiers(chantierActif.id)
    }
    setRenommerItem(null); setNouveauNom('')
  }

  async function valider(rid) {
    await supabase.from('rapports').update({ valide: true }).eq('id', rid)
    chargerTout()
    if (sousDossierActif) chargerRapports(sousDossierActif.id)
    setRapportDetail(null)
  }

  async function sauvegarderMateriaux(rapportId, newMat) {
    await supabase.from('rapport_materiaux').delete().eq('rapport_id', rapportId)
    if (newMat.length > 0) {
      await supabase.from('rapport_materiaux').insert(
        newMat.map(m => ({
          rapport_id: rapportId,
          ref_article: m.ref_article || m.id,
          designation: m.designation || m.nom,
          unite: m.unite,
          quantite: m.quantite,
          prix_net: m.prix_net || m.pu || 0
        }))
      )
    }
    if (sousDossierActif) chargerRapports(sousDossierActif.id)
    chargerTout()
    setEditMateriaux(null)
    setAjoutArticleVue(false)
  }

  function totaux(r) {
    const mat = (r.rapport_materiaux || []).reduce((s, m) => s + m.quantite * (m.prix_net || 0), 0)
    const duree = calcDuree(r.heure_debut, r.heure_fin)
    const mo = duree * TAUX
    const ht = mat + mo
    return { duree, mat, mo, ht, tva: ht * 0.081, ttc: ht * 1.081 }
  }

  const articlesFiltres = (() => {
    let l = catalogue
    if (catFiltre !== 'Tous') l = l.filter(a => a.categorie === catFiltre)
    if (rechercheArticle) l = l.filter(a => a.nom.toLowerCase().includes(rechercheArticle.toLowerCase()) || (a.categorie || '').toLowerCase().includes(rechercheArticle.toLowerCase()))
    return l.slice(0, 100)
  })()

  // ===================== VUES =====================

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

  if (ajoutArticleVue && editMateriaux) return (
    <div>
      <div className="top-bar">
        <div>
          <button onClick={() => setAjoutArticleVue(false)} style={{ background: 'none', border: 'none', color: '#185FA5', fontSize: '13px', cursor: 'pointer', padding: 0 }}>← Retour</button>
          <div style={{ fontWeight: 600, fontSize: '15px', marginTop: '4px' }}>Ajouter article</div>
        </div>
      </div>
      <div className="page-content">
        <input type="search" placeholder="Rechercher..." value={rechercheArticle} onChange={e => setRechercheArticle(e.target.value)}
          style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid #ddd', fontSize: '13px', marginBottom: '8px' }} />
        <div style={{ display: 'flex', gap: '6px', overflowX: 'auto', paddingBottom: '4px', marginBottom: '8px' }}>
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
            const dejaDans = editMateriaux.mats.find(m => (m.ref_article || m.id) === a.id)
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
        </div>
        <button className="btn-primary" onClick={() => setAjoutArticleVue(false)}>✓ Confirmer</button>
      </div>
    </div>
  )

  if (editMateriaux) return (
    <div>
      <div className="top-bar">
        <div>
          <button onClick={() => setEditMateriaux(null)} style={{ background: 'none', border: 'none', color: '#185FA5', fontSize: '13px', cursor: 'pointer', padding: 0 }}>← Retour</button>
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
              <div style={{ fontSize: '11px', color: '#888' }}>{m.unite}</div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <button onClick={() => {
                const n = editMateriaux.mats.map((x, j) => j === i ? { ...x, quantite: Math.max(1, x.quantite - 1) } : x)
                setEditMateriaux(prev => ({ ...prev, mats: n }))
              }} style={{ width: 26, height: 26, borderRadius: '50%', border: '1px solid #ddd', background: 'white', cursor: 'pointer', fontSize: '14px' }}>−</button>
              <span style={{ fontWeight: 600, minWidth: '20px', textAlign: 'center' }}>{m.quantite}</span>
              <button onClick={() => {
                const n = editMateriaux.mats.map((x, j) => j === i ? { ...x, quantite: x.quantite + 1 } : x)
                setEditMateriaux(prev => ({ ...prev, mats: n }))
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
            <button onClick={() => setRapportDetail(null)} style={{ background: 'none', border: 'none', color: '#185FA5', fontSize: '13px', cursor: 'pointer', padding: 0 }}>← Retour</button>
            <div style={{ fontWeight: 600, fontSize: '15px', marginTop: '4px' }}>Rapport</div>
            <div style={{ fontSize: '11px', color: '#888' }}>{rapportDetail.employe?.prenom} · {new Date(rapportDetail.date_travail).toLocaleDateString('fr-CH')}</div>
          </div>
          {!rapportDetail.valide && <span className="badge badge-amber">À valider</span>}
        </div>
        <div className="page-content">
          <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
              <div><div style={{ fontSize: '11px', color: '#888' }}>Employé</div><div style={{ fontWeight: 500 }}>{rapportDetail.employe?.prenom}</div></div>
              <div><div style={{ fontSize: '11px', color: '#888' }}>Date</div><div style={{ fontWeight: 500 }}>{new Date(rapportDetail.date_travail).toLocaleDateString('fr-CH')}</div></div>
              <div><div style={{ fontSize: '11px', color: '#888' }}>Durée</div><div style={{ fontWeight: 500 }}>{t.duree}h</div></div>
              <div><div style={{ fontSize: '11px', color: '#888' }}>Horaires</div><div style={{ fontWeight: 500 }}>{rapportDetail.heure_debut} – {rapportDetail.heure_fin}</div></div>
            </div>
            {rapportDetail.remarques && <div style={{ padding: '8px', background: '#f9f9f9', borderRadius: '6px', fontSize: '13px' }}>💬 {rapportDetail.remarques}</div>}
          </div>
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
          <div className="card">
            <div style={{ fontWeight: 600, fontSize: '14px', marginBottom: '12px' }}>Estimation</div>
            {[['Matériaux', `${t.mat.toFixed(2)} CHF`], [`M.O. (${t.duree}h × ${TAUX})`, `${t.mo.toFixed(2)} CHF`], ['HT', `${t.ht.toFixed(2)} CHF`], ['TVA 8.1%', `${t.tva.toFixed(2)} CHF`]].map(([l, v]) => (
              <div key={l} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', marginBottom: '6px' }}>
                <span style={{ color: '#666' }}>{l}</span><span style={{ fontWeight: 500 }}>{v}</span>
              </div>
            ))}
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '15px', fontWeight: 700, paddingTop: '8px', borderTop: '2px solid #185FA5', color: '#185FA5' }}>
              <span>TOTAL TTC</span><span>{t.ttc.toFixed(2)} CHF</span>
            </div>
          </div>
          {!rapportDetail.valide && (
            <div style={{ display: 'flex', gap: '10px' }}>
              <button onClick={() => setConfirm({ type: 'rapport', data: rapportDetail })} className="btn-outline" style={{ flex: 1, color: '#A32D2D', borderColor: '#f09595' }}>🗑️ Supprimer</button>
              <button onClick={() => valider(rapportDetail.id)} className="btn-primary" style={{ flex: 1 }}>✓ Valider</button>
            </div>
          )}
          {rapportDetail.valide && (
            <button onClick={() => setConfirm({ type: 'rapport', data: rapportDetail })} className="btn-outline" style={{ color: '#A32D2D', borderColor: '#f09595' }}>🗑️ Supprimer</button>
          )}
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
          <div style={{ fontSize: '11px', color: '#888' }}>{chantierActif.adresse}</div>
        </div>
        <div style={{ display: 'flex', gap: '6px' }}>
          <button onClick={() => { setRenommerItem({ type: 'chantier', data: chantierActif }); setNouveauNom(chantierActif.nom) }} style={{ background: 'none', border: '1px solid #ddd', borderRadius: '6px', padding: '4px 8px', fontSize: '12px', cursor: 'pointer' }}>✏️</button>
          <button onClick={() => setConfirm({ type: 'chantier', data: chantierActif })} style={{ background: 'none', border: '1px solid #f09595', borderRadius: '6px', padding: '4px 8px', fontSize: '12px', cursor: 'pointer', color: '#A32D2D' }}>🗑️</button>
        </div>
      </div>
      <div className="page-content">
        <div className="card">
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
                if (existe) { alert(`"${nouveauSdNom}" existe déjà dans ce chantier !`); return }
                await supabase.from('sous_dossiers').insert({ chantier_id: chantierActif.id, nom: nouveauSdNom })
                setNouveauSdNom(''); setNouveauSd(false); chargerSousDossiers(chantierActif.id)
              }}>OK</button>
            </div>
          )}
          {sousDossiers.length === 0 && !nouveauSd && <div style={{ fontSize: '13px', color: '#888' }}>Aucun sous-dossier</div>}
          {sousDossiers.map(sd => (
            <div key={sd.id} className="row-item">
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flex: 1, cursor: 'pointer' }} onClick={() => { setSousDossierActif(sd); chargerRapports(sd.id); setVue('rapports') }}>
                <div style={{ width: 34, height: 34, borderRadius: '8px', background: '#E6F1FB', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '16px' }}>📁</div>
                <div style={{ fontWeight: 500, fontSize: '13px' }}>{sd.nom}</div>
              </div>
              <div style={{ display: 'flex', gap: '4px' }}>
                <button onClick={() => { setRenommerItem({ type: 'sous_dossier', data: sd }); setNouveauNom(sd.nom) }} style={{ background: 'none', border: '1px solid #ddd', borderRadius: '6px', padding: '4px 6px', fontSize: '11px', cursor: 'pointer' }}>✏️</button>
                <button onClick={() => setConfirm({ type: 'sous_dossier', data: sd })} style={{ background: 'none', border: '1px solid #f09595', borderRadius: '6px', padding: '4px 6px', fontSize: '11px', cursor: 'pointer', color: '#A32D2D' }}>🗑️</button>
              </div>
            </div>
          ))}
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
      </div>
      <div className="page-content">
        <div className="card">
          {rapports.length === 0 && <div style={{ fontSize: '13px', color: '#888' }}>Aucun rapport</div>}
          {rapports.map(r => {
            const t = totaux(r)
            return (
              <div key={r.id} className="row-item" style={{ cursor: 'pointer' }} onClick={() => setRapportDetail(r)}>
                <div>
                  <div style={{ fontSize: '13px', fontWeight: 500 }}>{r.employe?.prenom} · {new Date(r.date_travail).toLocaleDateString('fr-CH')}</div>
                  <div style={{ fontSize: '11px', color: '#888' }}>{t.duree}h · {(r.rapport_materiaux || []).length} articles</div>
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
        <button className="btn-primary btn-sm" style={{ width: 'auto' }} onClick={() => setAjoutChantier(true)}>+ Nouveau</button>
      </div>
      <div className="page-content">
        {ajoutChantier && (
          <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <div style={{ fontWeight: 600, fontSize: '14px' }}>Nouveau chantier</div>
            <input placeholder="Nom *" value={nouveauNomChantier} onChange={e => setNouveauNomChantier(e.target.value)}
              style={{ padding: '8px', borderRadius: '6px', border: '1px solid #ddd', fontSize: '13px' }} />
            <input placeholder="Adresse" value={nouvelleAdresse} onChange={e => setNouvelleAdresse(e.target.value)}
              style={{ padding: '8px', borderRadius: '6px', border: '1px solid #ddd', fontSize: '13px' }} />
            <div style={{ display: 'flex', gap: '8px' }}>
              <button className="btn-outline" style={{ flex: 1 }} onClick={() => { setAjoutChantier(false); setNouveauNomChantier(''); setNouvelleAdresse('') }}>Annuler</button>
              <button className="btn-primary" style={{ flex: 1 }} onClick={async () => {
                if (!nouveauNomChantier.trim()) return
                const existe = chantiers.find(c => c.nom.toLowerCase() === nouveauNomChantier.toLowerCase())
                if (existe) { alert(`"${nouveauNomChantier}" existe déjà !`); return }
                await supabase.from('chantiers').insert({ nom: nouveauNomChantier, adresse: nouvelleAdresse })
                setAjoutChantier(false); setNouveauNomChantier(''); setNouvelleAdresse(''); chargerTout()
              }}>Créer</button>
            </div>
          </div>
        )}
        <div className="card">
          {chantiers.length === 0 && <div style={{ fontSize: '13px', color: '#888' }}>Aucun chantier</div>}
          {chantiers.map(c => (
            <div key={c.id} className="row-item">
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flex: 1, cursor: 'pointer' }} onClick={() => { setChantierActif(c); chargerSousDossiers(c.id); setVue('sous_dossiers') }}>
                <div style={{ width: 34, height: 34, borderRadius: '8px', background: '#E6F1FB', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '16px' }}>🏗️</div>
                <div>
                  <div style={{ fontWeight: 500, fontSize: '13px' }}>{c.nom}</div>
                  <div style={{ fontSize: '11px', color: '#888' }}>{c.adresse || '—'}</div>
                </div>
              </div>
              <div style={{ display: 'flex', gap: '4px' }}>
                <button onClick={() => { setRenommerItem({ type: 'chantier', data: c }); setNouveauNom(c.nom) }} style={{ background: 'none', border: '1px solid #ddd', borderRadius: '6px', padding: '4px 6px', fontSize: '11px', cursor: 'pointer' }}>✏️</button>
                <button onClick={() => setConfirm({ type: 'chantier', data: c })} style={{ background: 'none', border: '1px solid #f09595', borderRadius: '6px', padding: '4px 6px', fontSize: '11px', cursor: 'pointer', color: '#A32D2D' }}>🗑️</button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )

  if (vue === 'depannages') return (
    <div>
      <div className="top-bar">
        <div>
          <button onClick={() => setVue('accueil')} style={{ background: 'none', border: 'none', color: '#185FA5', fontSize: '13px', cursor: 'pointer', padding: 0 }}>← Retour</button>
          <div style={{ fontWeight: 600, fontSize: '15px', marginTop: '4px' }}>Dépannages</div>
        </div>
      </div>
      <div className="page-content">
        <div className="card">
          {depannages.length === 0 && <div style={{ fontSize: '13px', color: '#888' }}>Aucun dépannage</div>}
          {depannages.map(d => {
            const mat = (d.rapport_materiaux || []).reduce((s, m) => s + m.quantite * (m.prix_net || 0), 0)
            const mo = (d.duree || 1) * TAUX
            const ttc = (mat + mo) * 1.081
            return (
              <div key={d.id} className="row-item" style={{ cursor: 'pointer' }}>
                <div>
                  <div style={{ fontSize: '13px', fontWeight: 500 }}>{d.adresse}</div>
                  <div style={{ fontSize: '11px', color: '#888' }}>{d.employe?.prenom} · {d.duree}h · {new Date(d.date_travail).toLocaleDateString('fr-CH')}</div>
                </div>
                <div style={{ fontSize: '13px', fontWeight: 600 }}>{ttc.toFixed(0)} CHF</div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )

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
        </div>
        <div className="page-content">
          <select value={calEmployeFiltre} onChange={e => { setCalEmployeFiltre(e.target.value); setCalJour(null) }}
            style={{ padding: '8px 10px', borderRadius: '8px', border: '1px solid #e2e2e2', fontSize: '13px', background: 'white', color: '#1a1a1a' }}>
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
              {Array.from({ length: firstWeekday }).map((_, i) => <div key={`empty-${i}`} />)}
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
                  <div style={{ fontSize: '11px', color: '#888', paddingLeft: '14px' }}>{calcDuree(r.heure_debut, r.heure_fin)}h</div>
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
                  <div style={{ fontSize: '11px', color: '#888', paddingLeft: '14px' }}>{d.duree || 1}h</div>
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

  if (vue === 'employes') return (
    <div>
      <div className="top-bar">
        <div>
          <button onClick={() => setVue('accueil')} style={{ background: 'none', border: 'none', color: '#185FA5', fontSize: '13px', cursor: 'pointer', padding: 0 }}>← Retour</button>
          <div style={{ fontWeight: 600, fontSize: '15px', marginTop: '4px' }}>Employés</div>
        </div>
      </div>
      <div className="page-content">
        {empLoading && (
          <div style={{ textAlign: 'center', padding: '40px 0' }}>
            <div style={{ fontSize: '13px', color: '#888' }}>Chargement…</div>
            <div style={{ marginTop: '12px', display: 'flex', justifyContent: 'center', gap: '6px' }}>
              {[0, 1, 2].map(i => (
                <div key={i} style={{
                  width: 8, height: 8, borderRadius: '50%', background: '#185FA5',
                  animation: `pulse 1.2s ease-in-out ${i * 0.2}s infinite`,
                  opacity: 0.6
                }} />
              ))}
            </div>
            <style>{`@keyframes pulse { 0%,80%,100%{transform:scale(0.6);opacity:0.4} 40%{transform:scale(1);opacity:1} }`}</style>
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
                chargerDetailEmploye(emp.id, moisActuel)
                setVue('employe_detail')
              }}>
              <div style={{ width: 44, height: 44, borderRadius: '50%', background: '#E6F1FB', color: '#185FA5', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: '14px', flexShrink: 0 }}>
                {emp.initiales || emp.prenom?.slice(0, 2).toUpperCase()}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 600, fontSize: '14px', marginBottom: '4px' }}>{emp.prenom}</div>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px' }}>
                  <span style={{ fontSize: '13px', fontWeight: 500, color: '#185FA5' }}>{s.heureMois}h ce mois</span>
                  <span style={{ fontSize: '11px', color: '#999' }}>{s.heurePrev}h mois passé</span>
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

  if (vue === 'employe_detail' && empDetail) {
    const totalRapports = empDetailRapports.reduce((s, r) => s + calcDuree(r.heure_debut, r.heure_fin), 0)
    const totalDeps = empDetailDepannages.reduce((s, d) => s + (d.duree || 1), 0)
    const totalGeneral = totalRapports + totalDeps

    const parChantier = {}
    for (const r of empDetailRapports) {
      const nomChantier = r.sous_dossiers?.chantiers?.nom || 'Chantier inconnu'
      if (!parChantier[nomChantier]) parChantier[nomChantier] = []
      parChantier[nomChantier].push(r)
    }

    return (
      <div>
        <div className="top-bar">
          <div>
            <button onClick={() => setVue('employes')} style={{ background: 'none', border: 'none', color: '#185FA5', fontSize: '13px', cursor: 'pointer', padding: 0 }}>← Retour</button>
            <div style={{ fontWeight: 600, fontSize: '15px', marginTop: '4px' }}>{empDetail.prenom}</div>
            <div style={{ fontSize: '11px', color: '#888' }}>{totalGeneral}h · {MOIS_FR[empDetailMois.month]} {empDetailMois.year}</div>
          </div>
          <div style={{ width: 40, height: 40, borderRadius: '50%', background: '#E6F1FB', color: '#185FA5', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: '13px' }}>
            {empDetail.initiales || empDetail.prenom?.slice(0, 2).toUpperCase()}
          </div>
        </div>
        <div className="page-content">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'white', borderRadius: '10px', border: '1px solid #e2e2e2', padding: '10px 14px' }}>
            <button onClick={() => {
              const d = new Date(empDetailMois.year, empDetailMois.month - 1, 1)
              const m = { year: d.getFullYear(), month: d.getMonth() }
              setEmpDetailMois(m)
              chargerDetailEmploye(empDetail.id, m)
            }} style={{ background: 'none', border: '1px solid #e2e2e2', borderRadius: '6px', padding: '4px 10px', cursor: 'pointer', fontSize: '16px', color: '#185FA5' }}>‹</button>
            <span style={{ fontWeight: 600, fontSize: '14px' }}>{MOIS_FR[empDetailMois.month]} {empDetailMois.year}</span>
            <button onClick={() => {
              const d = new Date(empDetailMois.year, empDetailMois.month + 1, 1)
              const m = { year: d.getFullYear(), month: d.getMonth() }
              setEmpDetailMois(m)
              chargerDetailEmploye(empDetail.id, m)
            }} style={{ background: 'none', border: '1px solid #e2e2e2', borderRadius: '6px', padding: '4px 10px', cursor: 'pointer', fontSize: '16px', color: '#185FA5' }}>›</button>
          </div>

          {Object.keys(parChantier).length === 0 && empDetailDepannages.length === 0 && (
            <div style={{ textAlign: 'center', color: '#888', fontSize: '13px', padding: '40px 0' }}>Aucune activité ce mois</div>
          )}

          {Object.entries(parChantier).map(([nomChantier, raps]) => {
            const totalChantier = raps.reduce((s, r) => s + calcDuree(r.heure_debut, r.heure_fin), 0)
            return (
              <div key={nomChantier} className="card">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ fontSize: '15px' }}>🏗️</span>
                    <span style={{ fontWeight: 600, fontSize: '13px' }}>{nomChantier}</span>
                  </div>
                  <span style={{ fontSize: '13px', fontWeight: 600, color: '#185FA5' }}>{totalChantier}h</span>
                </div>
                {raps.map((r, i) => (
                  <div key={r.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0', borderTop: i === 0 ? '1px solid #eee' : '1px solid #f5f5f5' }}>
                    <div style={{ fontSize: '12px', color: '#555' }}>
                      {new Date(r.date_travail + 'T12:00:00').toLocaleDateString('fr-CH', { weekday: 'short', day: 'numeric', month: 'short' })}
                      {r.sous_dossiers?.nom && <span style={{ color: '#999', marginLeft: '6px' }}>· {r.sous_dossiers.nom}</span>}
                    </div>
                    <span style={{ fontSize: '12px', fontWeight: 500, color: '#333' }}>{calcDuree(r.heure_debut, r.heure_fin)}h</span>
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
                <span style={{ fontSize: '13px', fontWeight: 600, color: '#d68910' }}>{totalDeps}h</span>
              </div>
              {empDetailDepannages.map((d, i) => (
                <div key={d.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0', borderTop: i === 0 ? '1px solid #eee' : '1px solid #f5f5f5' }}>
                  <div style={{ fontSize: '12px', color: '#555' }}>
                    {new Date(d.date_travail + 'T12:00:00').toLocaleDateString('fr-CH', { weekday: 'short', day: 'numeric', month: 'short' })}
                    {d.adresse && <span style={{ color: '#999', marginLeft: '6px' }}>· {d.adresse}</span>}
                  </div>
                  <span style={{ fontSize: '12px', fontWeight: 500, color: '#333' }}>{d.duree || 1}h</span>
                </div>
              ))}
            </div>
          )}

          {totalGeneral > 0 && (
            <div style={{ background: '#E6F1FB', borderRadius: '10px', padding: '14px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontWeight: 600, fontSize: '14px', color: '#185FA5' }}>Total {MOIS_FR[empDetailMois.month]}</span>
              <span style={{ fontWeight: 700, fontSize: '18px', color: '#185FA5' }}>{totalGeneral}h</span>
            </div>
          )}
        </div>
      </div>
    )
  }

  // ===================== ACCUEIL =====================
  return (
    <div>
      <div className="top-bar">
        <div>
          <div style={{ fontWeight: 600, fontSize: '15px' }}>Bonjour, {user?.prenom}</div>
          <div style={{ fontSize: '11px', color: '#888' }}>Tableau de bord admin</div>
        </div>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
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
                    <div style={{ fontSize: '11px', color: '#888' }}>{r.employe?.prenom} · {t.duree}h · {new Date(r.date_travail).toLocaleDateString('fr-CH')}</div>
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
          <button onClick={() => { setVue('calendrier'); chargerCalendrier() }}
            style={{ background: '#EAF3DE', border: '1px solid #3B6D11', borderRadius: '12px', padding: '20px 12px', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '28px' }}>📅</span>
            <span style={{ fontWeight: 600, fontSize: '14px', color: '#3B6D11' }}>Calendrier</span>
          </button>
          <button onClick={() => { setVue('employes'); chargerStatsEmployes() }}
            style={{ background: '#F3EEFB', border: '1px solid #7D3C98', borderRadius: '12px', padding: '20px 12px', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '28px' }}>👷</span>
            <span style={{ fontWeight: 600, fontSize: '14px', color: '#7D3C98' }}>Employés</span>
            <span style={{ fontSize: '11px', color: '#666' }}>{employes.length} actifs</span>
          </button>
        </div>
      </div>
    </div>
  )
}
