import React from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import Login from './pages/Login'
import Employe from './pages/Employe'
import Chantier from './pages/Chantier'
import Rapport from './pages/Rapport'
import Admin from './pages/Admin'
import Depannage from './pages/Depannage'

function PrivateRoute({ children, role }) {
  const user = JSON.parse(localStorage.getItem('eleco_user') || 'null')
  if (!user) return <Navigate to="/" />
  if (role && user.role !== role) return <Navigate to="/" />
  return children
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Login />} />
      <Route path="/employe" element={<PrivateRoute role="employe"><Employe /></PrivateRoute>} />
      <Route path="/employe/chantier/:id" element={<PrivateRoute role="employe"><Chantier /></PrivateRoute>} />
      <Route path="/employe/rapport/:id" element={<PrivateRoute role="employe"><Rapport /></PrivateRoute>} />
      <Route path="/employe/depannage" element={<PrivateRoute role="employe"><Depannage /></PrivateRoute>} />
      <Route path="/admin" element={<PrivateRoute role="admin"><Admin /></PrivateRoute>} />
    </Routes>
  )
}
