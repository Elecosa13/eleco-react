import { useState, useEffect } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { supabase } from './lib/supabase'
import Login from './pages/Login'
import Employe from './pages/Employe'
import Chantier from './pages/Chantier'
import Rapport from './pages/Rapport'
import Admin from './pages/Admin'
import Depannage from './pages/Depannage'
import SaisieHeures from './pages/SaisieHeures'
import Charte from './pages/Charte'

function PrivateRoute({ children, requiredRole }) {
  const [status, setStatus] = useState('loading')
  const user = JSON.parse(localStorage.getItem('eleco_user') || 'null')

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (session && user) {
        setStatus('ok')
      } else {
        if (!session) localStorage.removeItem('eleco_user')
        setStatus('denied')
      }
    })
  }, [])

  if (status === 'loading') return null
  if (status === 'denied' || !user) return <Navigate to="/login" replace />

  // Mauvais rôle → redirige vers SA propre app
  if (requiredRole && user.role !== requiredRole) {
    return <Navigate to={user.role === 'admin' ? '/admin' : '/employe'} replace />
  }

  return children
}

// Guard charte : vérifie si l'employé a signé la charte
// Utilisé sur toutes les routes employé sauf /employe/charte elle-même
function CharteGuard({ children }) {
  const [status, setStatus] = useState('loading')
  const user = JSON.parse(localStorage.getItem('eleco_user') || 'null')

  useEffect(() => {
    if (!user) { setStatus('ok'); return }
    supabase.from('chartes_acceptees')
      .select('id')
      .eq('employe_id', user.id)
      .limit(1)
      .then(({ data }) => {
        setStatus(data && data.length > 0 ? 'ok' : 'charte_requise')
      })
  }, [])

  if (status === 'loading') return null
  if (status === 'charte_requise') return <Navigate to="/employe/charte" replace />
  return children
}

function NotFound() {
  const user = JSON.parse(localStorage.getItem('eleco_user') || 'null')
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
      <Route path="/employe/heures" element={
        <PrivateRoute requiredRole="employe"><CharteGuard><SaisieHeures /></CharteGuard></PrivateRoute>
      } />

      {/* Routes admin */}
      <Route path="/admin" element={<PrivateRoute requiredRole="admin"><Admin /></PrivateRoute>} />

      {/* Toute URL inconnue → redirection intelligente */}
      <Route path="*" element={<NotFound />} />
    </Routes>
  )
}
