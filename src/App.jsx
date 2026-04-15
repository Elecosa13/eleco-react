import { useState, useEffect } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { loadCurrentProfile, getCachedProfile, signOut } from './lib/auth'
import { supabase } from './lib/supabase'
import Login from './pages/Login'
import Employe from './pages/Employe'
import Chantier from './pages/Chantier'
import Rapport from './pages/Rapport'
import Admin from './pages/Admin'
import Depannage from './pages/Depannage'
import Charte from './pages/Charte'

function PrivateRoute({ children, requiredRole }) {
  const [status, setStatus] = useState('loading')
  const [profile, setProfile] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    let mounted = true
    loadCurrentProfile().then(({ profile: loaded, error: profileError }) => {
      if (!mounted) return
      if (loaded) {
        setProfile(loaded)
        setStatus('ok')
      } else {
        setError(profileError)
        setStatus('denied')
      }
    })
    return () => { mounted = false }
  }, [])

  if (status === 'loading') return null
  if (status === 'denied' || !profile) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px', background: '#f5f5f5' }}>
        <div style={{ background: 'white', border: '1px solid #e2e2e2', borderRadius: '8px', padding: '20px', maxWidth: '360px', width: '100%', display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <div style={{ fontWeight: 700, fontSize: '16px' }}>Acces bloque</div>
          <div style={{ fontSize: '13px', color: '#555' }}>
            {error?.message || 'Aucun profil Eleco lie a cette session Supabase.'}
          </div>
          <button className="btn-primary" onClick={async () => { await signOut(); window.location.href = '/login' }}>
            Retour a la connexion
          </button>
        </div>
      </div>
    )
  }

  if (requiredRole && profile.role !== requiredRole) {
    return <Navigate to={profile.role === 'admin' ? '/admin' : '/employe'} replace />
  }

  return children
}

// Guard charte : vérifie si l'employé a signé la charte
function CharteGuard({ children }) {
  const [status, setStatus] = useState('loading')

  useEffect(() => {
    loadCurrentProfile().then(async ({ profile }) => {
      if (!profile) { setStatus('charte_requise'); return }
      const { data } = await supabase.from('chartes_acceptees')
        .select('id')
        .eq('employe_id', profile.id)
        .limit(1)
      setStatus(data && data.length > 0 ? 'ok' : 'charte_requise')
    })
  }, [])

  if (status === 'loading') return null
  if (status === 'charte_requise') return <Navigate to="/employe/charte" replace />
  return children
}

function NotFound() {
  const user = getCachedProfile()
  if (user?.role === 'admin') return <Navigate to="/admin" replace />
  if (user?.role === 'employe') return <Navigate to="/employe" replace />
  return <Navigate to="/login" replace />
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/login" replace />} />
      <Route path="/login" element={<Login />} />

      {/* Charte : route employé sans guard charte (sinon boucle infinie) */}
      <Route path="/employe/charte" element={
        <PrivateRoute requiredRole="employe"><Charte /></PrivateRoute>
      } />

      {/* Routes employé protégées par guard charte */}
      <Route path="/employe" element={
        <PrivateRoute requiredRole="employe"><CharteGuard><Employe /></CharteGuard></PrivateRoute>
      } />
      <Route path="/employe/chantier/:id" element={
        <PrivateRoute requiredRole="employe"><CharteGuard><Chantier /></CharteGuard></PrivateRoute>
      } />
      <Route path="/employe/rapport/:id" element={
        <PrivateRoute requiredRole="employe"><CharteGuard><Rapport /></CharteGuard></PrivateRoute>
      } />
      <Route path="/employe/depannage" element={
        <PrivateRoute requiredRole="employe"><CharteGuard><Depannage /></CharteGuard></PrivateRoute>
      } />

      {/* Routes admin */}
      <Route path="/admin" element={<PrivateRoute requiredRole="admin"><Admin /></PrivateRoute>} />

      {/* Toute URL inconnue → redirection intelligente */}
      <Route path="*" element={<NotFound />} />
    </Routes>
  )
}
