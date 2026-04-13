import React, { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { jsPDF } from 'jspdf'
import { supabase } from '../lib/supabase'

const VERSION_CHARTE = 'v1.0'

const CLAUSES = [
  {
    titre: '1. Confidentialité',
    texte: "Aucune information relative aux clients, chantiers, prix ou données internes d'Eleco SA ne peut être divulguée à des tiers, que ce soit verbalement, par écrit ou via tout support numérique."
  },
  {
    titre: '2. Usage exclusif professionnel',
    texte: "L'application Eleco SA est réservée exclusivement à un usage professionnel dans le cadre de votre activité au sein de la société. Toute utilisation à des fins personnelles est interdite."
  },
  {
    titre: '3. Identifiants personnels et confidentiels',
    texte: "Vos identifiants de connexion (nom d'utilisateur et mot de passe) sont strictement personnels. Il est formellement interdit de les communiquer à quiconque, y compris à d'autres employés."
  },
  {
    titre: '4. Interdiction de capture et d\'export',
    texte: "Il est interdit de réaliser des captures d'écran, des impressions ou tout export de données vers l'extérieur de l'entreprise, sauf autorisation écrite explicite de la direction."
  },
  {
    titre: '5. Signalement des accès suspects',
    texte: "Tout accès inhabituel ou suspect à votre compte doit être immédiatement signalé à l'administration. En cas de perte ou de vol de vos identifiants, vous devez en informer la direction sans délai."
  },
  {
    titre: '6. Propriété des données',
    texte: "Toutes les données, documents, images et informations accessibles via cette application sont la propriété exclusive d'Eleco SA. Vous ne disposez d'aucun droit de propriété sur ces éléments."
  },
  {
    titre: '7. Durée de validité',
    texte: "La présente charte est valable pour toute la durée de votre contrat de travail au sein d'Eleco SA. Elle reste en vigueur même après résiliation du contrat pour les obligations de confidentialité."
  },
  {
    titre: '8. Sanctions',
    texte: "Toute violation des présentes règles pourra entraîner des mesures disciplinaires allant jusqu'au licenciement immédiat, conformément au Code des obligations suisse et au droit du travail applicable."
  }
]

export default function Charte() {
  const navigate = useNavigate()
  const user = JSON.parse(localStorage.getItem('eleco_user') || 'null')
  const scrollRef = useRef(null)
  const canvasRef = useRef(null)

  const [scrollDone, setScrollDone] = useState(false)
  const [etape, setEtape] = useState('lecture') // 'lecture' | 'signature'
  const [isDrawing, setIsDrawing] = useState(false)
  const [hasSig, setHasSig] = useState(false)
  const [envoi, setEnvoi] = useState(false)

  useEffect(() => {
    supabase.from('chartes_acceptees').select('id').eq('employe_id', user.id).limit(1)
      .then(({ data }) => {
        if (data && data.length > 0) navigate('/employe', { replace: true })
      })
  }, [])

  function handleScroll(e) {
    const el = e.target
    if (el.scrollHeight - el.scrollTop - el.clientHeight < 40) {
      setScrollDone(true)
    }
  }

  function getPos(e, canvas) {
    const rect = canvas.getBoundingClientRect()
    const scaleX = canvas.width / rect.width
    const scaleY = canvas.height / rect.height
    if (e.touches && e.touches.length > 0) {
      return {
        x: (e.touches[0].clientX - rect.left) * scaleX,
        y: (e.touches[0].clientY - rect.top) * scaleY
      }
    }
    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY
    }
  }

  function startDraw(e) {
    e.preventDefault()
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    const pos = getPos(e, canvas)
    ctx.beginPath()
    ctx.moveTo(pos.x, pos.y)
    setIsDrawing(true)
  }

  function draw(e) {
    e.preventDefault()
    if (!isDrawing) return
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    const pos = getPos(e, canvas)
    ctx.lineWidth = 2.5
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.strokeStyle = '#1a1a1a'
    ctx.lineTo(pos.x, pos.y)
    ctx.stroke()
    setHasSig(true)
  }

  function endDraw(e) {
    if (e) e.preventDefault()
    setIsDrawing(false)
  }

  function effacer() {
    const canvas = canvasRef.current
    if (!canvas) return
    canvas.getContext('2d').clearRect(0, 0, canvas.width, canvas.height)
    setHasSig(false)
  }

  async function soumettre() {
    if (!hasSig || envoi) return
    setEnvoi(true)

    const canvas = canvasRef.current
    const signatureBase64 = canvas.toDataURL('image/png')
    const maintenant = new Date().toISOString()
    const deviceInfo = navigator.userAgent.slice(0, 200)

    // 1. Sauvegarde signature
    await supabase.from('signatures').upsert({
      employe_id: user.id,
      signature_base64: signatureBase64,
      signee_le: maintenant,
      device_info: deviceInfo
    }, { onConflict: 'employe_id' })

    // 2. Sauvegarde acceptation charte
    await supabase.from('chartes_acceptees').insert({
      employe_id: user.id,
      version_charte: VERSION_CHARTE,
      acceptee_le: maintenant,
      device_info: deviceInfo
    })

    // 3. Génération PDF
    genererPDF(signatureBase64, maintenant)

    setEnvoi(false)
    navigate('/employe', { replace: true })
  }

  function genererPDF(signatureBase64, dateISO) {
    const doc = new jsPDF({ format: 'a4' })
    const dateStr = new Date(dateISO).toLocaleDateString('fr-CH', {
      day: '2-digit', month: '2-digit', year: 'numeric'
    })

    // En-tête
    doc.setFontSize(18)
    doc.setFont('helvetica', 'bold')
    doc.text('ELECO SA', 20, 22)
    doc.setFontSize(13)
    doc.setFont('helvetica', 'normal')
    doc.text('Charte d\'utilisation numérique — ' + VERSION_CHARTE, 20, 31)
    doc.setFontSize(10)
    doc.setTextColor(130)
    doc.text(`Signé le ${dateStr} par ${user?.prenom || ''}`, 20, 39)
    doc.setTextColor(0)
    doc.setDrawColor(180)
    doc.line(20, 44, 190, 44)

    // Clauses
    let y = 54
    doc.setFontSize(10)

    for (const clause of CLAUSES) {
      // Titre clause
      doc.setFont('helvetica', 'bold')
      const titreLines = doc.splitTextToSize(clause.titre, 170)
      if (y + (titreLines.length + 3) * 5.5 > 270) {
        doc.addPage()
        y = 20
      }
      doc.text(titreLines, 20, y)
      y += titreLines.length * 5.5 + 2

      // Texte clause
      doc.setFont('helvetica', 'normal')
      doc.setTextColor(60)
      const texteLines = doc.splitTextToSize(clause.texte, 165)
      if (y + texteLines.length * 5 + 8 > 270) {
        doc.addPage()
        y = 20
      }
      doc.text(texteLines, 25, y)
      doc.setTextColor(0)
      y += texteLines.length * 5 + 8
    }

    // Bloc signature
    if (y + 60 > 270) {
      doc.addPage()
      y = 20
    }
    y += 4
    doc.setDrawColor(200)
    doc.line(20, y, 190, y)
    y += 8
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(11)
    doc.text('Signature électronique', 20, y)
    y += 6
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(9)
    doc.setTextColor(120)
    doc.text(`Accepté et signé numériquement le ${dateStr}`, 20, y)
    y += 5
    doc.text(`Employé : ${user?.prenom || '—'} — Eleco SA`, 20, y)
    doc.setTextColor(0)
    y += 6
    doc.addImage(signatureBase64, 'PNG', 20, y, 80, 36)

    doc.save(`charte_eleco_${user?.prenom || 'employe'}_${dateStr.replace(/\//g, '-')}.pdf`)
  }

  // ─── ÉTAPE 1 : Lecture ─────────────────────────────────

  if (etape === 'lecture') return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
      <div className="top-bar">
        <div>
          <div style={{ fontWeight: 600, fontSize: '15px' }}>Charte d'utilisation</div>
          <div style={{ fontSize: '11px', color: '#888' }}>Lecture obligatoire avant de continuer</div>
        </div>
        <span className="badge badge-amber">Obligatoire</span>
      </div>

      <div className="page-content" style={{ flex: 1 }}>
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <div style={{ background: '#185FA5', padding: '12px 16px' }}>
            <div style={{ fontWeight: 600, fontSize: '14px', color: 'white' }}>Charte Numérique Employé — {VERSION_CHARTE}</div>
            <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.75)', marginTop: '2px' }}>Eleco SA — À lire attentivement</div>
          </div>

          <div
            ref={scrollRef}
            onScroll={handleScroll}
            style={{ height: '52vh', overflowY: 'scroll', padding: '16px 16px 8px' }}
          >
            <p style={{ fontSize: '13px', color: '#555', marginBottom: '16px', lineHeight: 1.6 }}>
              En tant qu'employé d'Eleco SA et utilisateur de l'application numérique, vous êtes tenu
              de respecter les règles suivantes. Veuillez lire chaque clause attentivement.
            </p>

            {CLAUSES.map((c, i) => (
              <div key={i} style={{ marginBottom: '14px', padding: '10px 12px', background: '#f9f9f9', borderRadius: '8px', borderLeft: '3px solid #185FA5' }}>
                <div style={{ fontWeight: 600, fontSize: '13px', marginBottom: '4px' }}>{c.titre}</div>
                <p style={{ fontSize: '13px', lineHeight: 1.6, margin: 0, color: '#444' }}>{c.texte}</p>
              </div>
            ))}

            <div style={{ height: '8px' }} />
          </div>
        </div>

        {!scrollDone && (
          <div style={{ textAlign: 'center', fontSize: '12px', color: '#888' }}>
            Faites défiler jusqu'au bas pour continuer ↓
          </div>
        )}

        <button
          className="btn-primary"
          disabled={!scrollDone}
          style={{ opacity: scrollDone ? 1 : 0.4 }}
          onClick={() => setEtape('signature')}
        >
          {scrollDone ? "J'ai lu et j'accepte" : "Lisez jusqu'au bas..."}
        </button>
      </div>
    </div>
  )

  // ─── ÉTAPE 2 : Signature ───────────────────────────────

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
      <div className="top-bar">
        <div>
          <button onClick={() => setEtape('lecture')} style={{ background: 'none', border: 'none', color: '#185FA5', fontSize: '13px', cursor: 'pointer', padding: 0 }}>← Relire</button>
          <div style={{ fontWeight: 600, fontSize: '15px', marginTop: '4px' }}>Votre signature</div>
        </div>
        <span className="badge badge-blue">Étape 2/2</span>
      </div>

      <div className="page-content">
        <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <div style={{ fontWeight: 600, fontSize: '14px' }}>Signez pour confirmer votre acceptation</div>
          <div style={{ fontSize: '13px', color: '#555' }}>
            Dessinez votre signature dans le cadre ci-dessous.
          </div>

          <div style={{ position: 'relative', border: '2px dashed #e2e2e2', borderRadius: '8px', background: '#fafafa', overflow: 'hidden' }}>
            <canvas
              ref={canvasRef}
              width={380}
              height={150}
              style={{ display: 'block', width: '100%', height: '150px', touchAction: 'none', cursor: 'crosshair' }}
              onMouseDown={startDraw}
              onMouseMove={draw}
              onMouseUp={endDraw}
              onMouseLeave={endDraw}
              onTouchStart={startDraw}
              onTouchMove={draw}
              onTouchEnd={endDraw}
            />
            {!hasSig && (
              <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none', color: '#c8c8c8', fontSize: '13px' }}>
                Signez ici...
              </div>
            )}
          </div>

          {hasSig && (
            <button type="button" onClick={effacer} className="btn-outline btn-sm" style={{ width: 'auto', alignSelf: 'flex-start' }}>
              Effacer et recommencer
            </button>
          )}
        </div>

        <div style={{ background: '#FAEEDA', border: '1px solid #f39c12', borderRadius: '8px', padding: '10px 14px', fontSize: '12px', color: '#BA7517', lineHeight: 1.5 }}>
          En cliquant sur "Signer et continuer", vous confirmez avoir lu et accepté intégralement
          la Charte Numérique Eleco SA version {VERSION_CHARTE}. Un PDF sera généré et téléchargé automatiquement.
        </div>

        <button
          className="btn-primary"
          disabled={!hasSig || envoi}
          onClick={soumettre}
        >
          {envoi ? 'Enregistrement...' : 'Signer et continuer'}
        </button>
      </div>
    </div>
  )
}
