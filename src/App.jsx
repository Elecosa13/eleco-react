import { useState, useEffect } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { supabase } from './lib/supabase'
import { useAuth } from './lib/auth-context'
import Login from './pages/Login'
import Employe from './pages/Employe'
import Chantier from './pages/Chantier'
import Rapport from './pages/Rapport'
import Admin from './pages/Admin'
import Depannage from './pages/Depannage'
import DepannageDetail from './pages/DepannageDetail'
import Charte from './pages/Charte'

function PrivateRoute({ children, requiredRole }) {
  const { initializing, profile, role, error, signOut } = useAuth()

  if (initializing) return null
  if (!profile) {
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

  if (requiredRole && role !== requiredRole) {
    return <Navigate to={role === 'admin' ? '/admin' : '/employe'} replace />
  }

  return children
}

// Guard charte : vérifie si l'employé a signé la charte
function CharteGuard({ children }) {
  const { profile } = useAuth()
  const [status, setStatus] = useState('loading')

  useEffect(() => {
    if (!profile) { setStatus('charte_requise'); return }
    setStatus('loading')
    supabase.from('chartes_acceptees')
      .select('id')
      .eq('employe_id', profile.id)
      .limit(1)
      .then(({ data, error }) => {
        if (error) {
          console.error('Erreur vérification charte:', error)
          setStatus('error')
          return
        }
        setStatus(data && data.length > 0 ? 'ok' : 'charte_requise')
      })
  }, [profile])

  if (status === 'loading') return null
  if (status === 'charte_requise') return <Navigate to="/employe/charte" replace />
  if (status === 'error') {
    return (
      <>
        <div style={{ background: '#FAEEDA', borderBottom: '1px solid #f39c12', padding: '10px 14px', fontSize: '12px', color: '#BA7517' }}>
          Impossible de vérifier la charte pour le moment. Vous pouvez continuer, puis réessayer si une action est bloquée.
        </div>
        {children}
      </>
    )
  }
  return children
}

function RootRedirect() {
  const { initializing, role } = useAuth()
  if (initializing) return null
  if (role === 'admin') return <Navigate to="/admin" replace />
  if (role === 'employe') return <Navigate to="/employe" replace />
  return <Navigate to="/login" replace />
}

function NotFound() {
  const { initializing, role } = useAuth()
  if (initializing) return null
  if (role === 'admin') return <Navigate to="/admin" replace />
  if (role === 'employe') return <Navigate to="/employe" replace />
  return <Navigate to="/login" replace />
}

export default function App() {
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return
    navigator.serviceWorker.getRegistrations().then(registrations => {
      registrations.forEach(registration => {
        console.log('SW UPDATE CHECK')
        registration.update()
      })
    })
  }, [])

  return (
    <Routes>
      <Route path="/" element={<RootRedirect />} />
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
      <Route path="/admin/depannage/:id" element={<PrivateRoute requiredRole="admin"><DepannageDetail /></PrivateRoute>} />

      {/* Toute URL inconnue → redirection intelligente */}
      <Route path="*" element={<NotFound />} />
    </Routes>
  )
}
