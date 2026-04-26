import { useState, useEffect } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { supabase } from './lib/supabase'
import { useAuth } from './lib/auth-context'
import ErrorBoundary from './components/ErrorBoundary'
import PwaUpdatePrompt from './components/PwaUpdatePrompt'
import { diag } from './lib/diagnostics'
import { safeLocation, withTimeout } from './lib/safe-browser'
import Login from './pages/Login'
import Employe from './pages/Employe'
import Chantier from './pages/Chantier'
import Rapport from './pages/Rapport'
import Admin from './pages/Admin'
import Depannage from './pages/Depannage'
import DepannageDetail from './pages/DepannageDetail'
import Charte from './pages/Charte'
import Devis from './pages/Devis'
import SaisieHeures from './pages/SaisieHeures'

function GuardFallback({ title = 'Chargement', message = 'Verification en cours...', action }) {
  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px', background: '#f5f5f5' }}>
      <div style={{ background: 'white', border: '1px solid #e2e2e2', borderRadius: '8px', padding: '20px', maxWidth: '380px', width: '100%', display: 'flex', flexDirection: 'column', gap: '12px' }}>
        <div style={{ fontWeight: 700, fontSize: '16px' }}>{title}</div>
        <div style={{ fontSize: '13px', color: '#555' }}>{message}</div>
        {action}
      </div>
    </div>
  )
}

function RouteBoundary({ scope, children }) {
  return (
    <ErrorBoundary scope={scope} title="Erreur dans cette page">
      {children}
    </ErrorBoundary>
  )
}

function guardedPage(scope, element) {
  return <RouteBoundary scope={scope}>{element}</RouteBoundary>
}

function PrivateRoute({ children, requiredRole }) {
  const { initializing, profile, role, error, signOut } = useAuth()

  diag('route', 'PrivateRoute render', {
    requiredRole,
    initializing,
    hasProfile: Boolean(profile),
    role,
    error: error?.code || error?.message || null
  })

  if (initializing) {
    return <GuardFallback title="Session en cours" message="Verification de votre acces..." />
  }

  if (!profile) {
    return (
      <GuardFallback
        title="Acces bloque"
        message={error?.message || 'Aucun profil Eleco lie a cette session Supabase.'}
        action={(
          <button className="btn-primary" onClick={async () => {
            await signOut().catch(signOutError => {
              diag('route', 'signOut from PrivateRoute failed', signOutError, 'warn')
            })
            safeLocation.assign('/login')
          }}>
            Retour a la connexion
          </button>
        )}
      />
    )
  }

  if (requiredRole && role !== requiredRole) {
    if (role !== 'admin' && role !== 'employe') {
      return <GuardFallback title="Role invalide" message="Votre profil ne contient pas de role applicatif valide." />
    }
    return <Navigate to={role === 'admin' ? '/admin' : '/employe'} replace />
  }

  return <RouteBoundary scope={`private:${requiredRole || 'any'}`}>{children}</RouteBoundary>
}

// Guard rule: no route guard may return a silent blank screen or throw on missing data.
function CharteGuard({ children }) {
  const { profile } = useAuth()
  const [status, setStatus] = useState('loading')

  useEffect(() => {
    diag('route', 'CharteGuard check start', { profileId: profile?.id || null })
    if (!profile?.id) { setStatus('charte_requise'); return }
    setStatus('loading')
    withTimeout(
      supabase.from('chartes_acceptees').select('id').eq('employe_id', profile.id).limit(1),
      8000,
      () => new Error('CharteGuard: timeout reseau')
    )
      .then(({ data, error }) => {
        if (error) {
          diag('route', 'CharteGuard check error', error, 'warn')
          setStatus('error')
          return
        }
        diag('route', 'CharteGuard check result', { accepted: Boolean(data && data.length > 0) })
        setStatus(data && data.length > 0 ? 'ok' : 'charte_requise')
      })
      .catch(error => {
        diag('route', 'CharteGuard check failed', error, 'error')
        setStatus('error')
      })
  }, [profile])

  diag('route', 'CharteGuard render', { status })

  if (status === 'loading') return <GuardFallback title="Charte" message="Verification de la charte..." />
  if (status === 'charte_requise') return <Navigate to="/employe/charte" replace />
  if (status === 'error') {
    return (
      <>
        <div style={{ background: '#FAEEDA', borderBottom: '1px solid #f39c12', padding: '10px 14px', fontSize: '12px', color: '#BA7517' }}>
          Impossible de verifier la charte pour le moment. Vous pouvez continuer, puis reessayer si une action est bloquee.
        </div>
        <RouteBoundary scope="charte-guard-fallback">{children}</RouteBoundary>
      </>
    )
  }
  return <RouteBoundary scope="charte-guard">{children}</RouteBoundary>
}

function RootRedirect() {
  const { initializing, role } = useAuth()
  if (initializing) return <GuardFallback title="Session en cours" message="Redirection apres verification..." />
  if (role === 'admin') return <Navigate to="/admin" replace />
  if (role === 'employe') return <Navigate to="/employe" replace />
  return <Navigate to="/login" replace />
}

function NotFound() {
  const { initializing, role } = useAuth()
  if (initializing) return <GuardFallback title="Session en cours" message="Recherche de votre espace..." />
  if (role === 'admin') return <Navigate to="/admin" replace />
  if (role === 'employe') return <Navigate to="/employe" replace />
  return <Navigate to="/login" replace />
}

export default function App() {
  diag('route', 'App render')

  return (
    <ErrorBoundary scope="routes" title="Erreur de navigation">
      <PwaUpdatePrompt />
      <Routes>
        <Route path="/" element={guardedPage('route:root', <RootRedirect />)} />
        <Route path="/login" element={guardedPage('route:login', <Login />)} />

        <Route path="/employe/charte" element={guardedPage(
          'route:employe-charte',
          <PrivateRoute requiredRole="employe"><Charte /></PrivateRoute>
        )} />

        <Route path="/employe" element={guardedPage(
          'route:employe',
          <PrivateRoute requiredRole="employe"><CharteGuard><Employe /></CharteGuard></PrivateRoute>
        )} />
        <Route path="/employe/chantier/:id" element={guardedPage(
          'route:employe-chantier',
          <PrivateRoute requiredRole="employe"><CharteGuard><Chantier /></CharteGuard></PrivateRoute>
        )} />
        <Route path="/employe/rapport/:id" element={guardedPage(
          'route:employe-rapport',
          <PrivateRoute requiredRole="employe"><CharteGuard><Rapport /></CharteGuard></PrivateRoute>
        )} />
        <Route path="/employe/depannage" element={guardedPage(
          'route:employe-depannage',
          <PrivateRoute requiredRole="employe"><CharteGuard><Depannage /></CharteGuard></PrivateRoute>
        )} />
        <Route path="/employe/heures" element={guardedPage(
          'route:employe/heures',
          <PrivateRoute requiredRole="employe"><CharteGuard><SaisieHeures /></CharteGuard></PrivateRoute>
        )} />
        <Route path="/employe/devis" element={guardedPage(
          'route:employe-devis',
          <PrivateRoute requiredRole="employe"><CharteGuard><Devis /></CharteGuard></PrivateRoute>
        )} />

        <Route path="/admin" element={guardedPage(
          'route:admin',
          <PrivateRoute requiredRole="admin"><Admin /></PrivateRoute>
        )} />
        <Route path="/admin/a-verifier" element={guardedPage(
          'route:admin-a-verifier',
          <PrivateRoute requiredRole="admin"><Admin /></PrivateRoute>
        )} />
        <Route path="/admin/employes" element={guardedPage(
          'route:admin-employes',
          <PrivateRoute requiredRole="admin"><Admin /></PrivateRoute>
        )} />
        <Route path="/admin/calendrier" element={guardedPage(
          'route:admin-calendrier',
          <PrivateRoute requiredRole="admin"><Admin /></PrivateRoute>
        )} />
        <Route path="/admin/depannage/:id" element={guardedPage(
          'route:admin-depannage-detail',
          <PrivateRoute requiredRole="admin"><DepannageDetail /></PrivateRoute>
        )} />

        <Route path="*" element={guardedPage('route:not-found', <NotFound />)} />
      </Routes>
    </ErrorBoundary>
  )
}
