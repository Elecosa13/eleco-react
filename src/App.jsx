import React, { useState, useEffect } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { supabase } from './lib/supabase'
import Login from './pages/Login'
import Employe from './pages/Employe'
import Chantier from './pages/Chantier'
import Rapport from './pages/Rapport'
import Admin from './pages/Admin'
import Depannage from './pages/Depannage'

function PrivateRoute({ children, requiredRole }) {
  const [status, setStatus] = useState('loading')
  const user = JSON.parse(localStorage.getItem('eleco_user') || 'null')

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session && user) {
        setStatus('ok')
      } else {
        if (!session) localStorage.removeItem('eleco_user')
        setStatus('denied')
      }
    })
  }, [])

  if (status === 'loading') return null

  // Pas connecté → login
  if (status === 'denied' || !user) return <Navigate to="/login" replace />

  // Mauvais rôle → redirige vers SA propre app
  if (requiredRole && user.role !== requiredRole) {
    return <Navigate to={user.role === 'admin' ? '/admin' : '/employe'} replace />
  }

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

      {/* Routes employé */}
      <Route path="/employe" element={<PrivateRoute requiredRole="employe"><Employe /></PrivateRoute>} />
      <Route path="/employe/chantier/:id" element={<PrivateRoute requiredRole="employe"><Chantier /></PrivateRoute>} />
      <Route path="/employe/rapport/:id" element={<PrivateRoute requiredRole="employe"><Rapport /></PrivateRoute>} />
      <Route path="/employe/depannage" element={<PrivateRoute requiredRole="employe"><Depannage /></PrivateRoute>} />

      {/* Routes admin */}
      <Route path="/admin" element={<PrivateRoute requiredRole="admin"><Admin /></PrivateRoute>} />

      {/* Toute URL inconnue → redirection intelligente */}
      <Route path="*" element={<NotFound />} />
    </Routes>
  )
}