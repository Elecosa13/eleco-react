import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { AuthProfileError, cacheProfile, loadCurrentProfile, signOut as authSignOut } from './auth'
import { supabase } from './supabase'
import { diag } from './diagnostics'
import { addDocumentListener, addWindowListener, getVisibilityState, withTimeout } from './safe-browser'

const AuthContext = createContext(null)
const AUTH_BOOT_TIMEOUT_MS = 8000

// Auth boot checklist:
// - every auth restore path must finish with ready or failed, never infinite initializing.
// - Supabase restore/profile loading must be timeout protected.
// - listener failures must show a controlled fallback and keep routing recoverable.
function createAuthTimeoutError() {
  return new AuthProfileError('Initialisation auth trop longue. Retournez a la connexion si le probleme persiste.', 'AUTH_BOOT_TIMEOUT')
}

function AuthLoadingFallback() {
  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px', background: '#f5f5f5' }}>
      <div style={{ background: '#fff', border: '1px solid #e2e2e2', borderRadius: '8px', padding: '18px', maxWidth: '360px', width: '100%', textAlign: 'center' }}>
        <div style={{ fontWeight: 700, fontSize: '16px', marginBottom: '8px' }}>Chargement securise</div>
        <div style={{ color: '#555', fontSize: '13px' }}>Initialisation de la session...</div>
      </div>
    </div>
  )
}

export function AuthProvider({ children }) {
  diag('auth', 'provider render')
  const [state, setState] = useState({
    initializing: true,
    bootStatus: 'booting',
    user: null,
    profile: null,
    role: null,
    error: null
  })

  const applyProfile = useCallback((user, profile, error = null, initializing = false, bootStatus = 'ready') => {
    diag('auth', 'applyProfile', {
      initializing,
      bootStatus,
      hasUser: Boolean(user),
      hasProfile: Boolean(profile),
      role: profile?.role || null,
      error: error?.code || error?.message || null
    })
    setState({
      initializing,
      bootStatus,
      user,
      profile,
      role: profile?.role || null,
      error
    })
  }, [])

  const revalidate = useCallback(async () => {
    diag('auth', 'revalidate')
    try {
      const { user, profile, error } = await withTimeout(
        loadCurrentProfile(),
        AUTH_BOOT_TIMEOUT_MS,
        createAuthTimeoutError
      )
      applyProfile(user, profile, error, false)
      return { user, profile, error }
    } catch (error) {
      diag('auth', 'revalidate failed', error, 'error')
      applyProfile(null, null, error, false, 'failed')
      return { user: null, profile: null, error }
    }
  }, [applyProfile])

  const signOut = useCallback(async () => {
    await authSignOut()
    applyProfile(null, null, null, false)
  }, [applyProfile])

  useEffect(() => {
    let mounted = true

    diag('auth', 'initial load')

    withTimeout(loadCurrentProfile(), AUTH_BOOT_TIMEOUT_MS, createAuthTimeoutError)
      .then(({ user, profile, error }) => {
        if (!mounted) return
        applyProfile(user, profile, error, false)
      })
      .catch(error => {
        diag('auth', 'initial load failed', error, 'error')
        if (!mounted) return
        applyProfile(null, null, error, false, 'failed')
      })

    let listener = null
    try {
      const { data } = supabase.auth.onAuthStateChange((event, session) => {
        diag('auth', 'auth event', { event, hasSession: Boolean(session) })
        if (event === 'SIGNED_OUT' || !session?.user) {
          cacheProfile(null)
          applyProfile(null, null, null, false)
          return
        }
        setTimeout(() => {
          withTimeout(loadCurrentProfile(), AUTH_BOOT_TIMEOUT_MS, createAuthTimeoutError)
            .then(({ user, profile, error }) => {
              if (!mounted) return
              applyProfile(user, profile, error, false)
            })
            .catch(error => {
              diag('auth', 'auth event load failed', error, 'error')
              if (!mounted) return
              applyProfile(null, null, error, false, 'failed')
            })
        }, 0)
      })
      listener = data
    } catch (error) {
      diag('auth', 'auth listener failed', error, 'error')
      applyProfile(null, null, error, false, 'failed')
    }

    return () => {
      mounted = false
      listener?.subscription?.unsubscribe()
    }
  }, [applyProfile])

  // On iOS, setTimeout is throttled when the app is suspended in background.
  // If the app resumes and the auth boot timer never fired, force a failed state
  // so the user sees a recoverable fallback instead of an infinite loading screen.
  useEffect(() => {
    return addWindowListener('pageshow', () => {
      setState(prev => {
        if (prev.bootStatus !== 'booting') return prev
        diag('auth', 'pageshow while still booting — forcing timeout', null, 'warn')
        return {
          ...prev,
          initializing: false,
          bootStatus: 'failed',
          error: createAuthTimeoutError()
        }
      })
    })
  }, [])

  useEffect(() => {
    let lastRun = 0
    const refreshIfActive = () => {
      diag('auth', 'refreshIfActive')
      if (getVisibilityState() === 'hidden') return
      const now = Date.now()
      if (now - lastRun < 1500) return
      lastRun = now
      revalidate()
    }

    const cleanupVisibility = addDocumentListener('visibilitychange', refreshIfActive)
    const cleanupPageShow = addWindowListener('pageshow', refreshIfActive)
    return () => {
      cleanupVisibility()
      cleanupPageShow()
    }
  }, [revalidate])

  const value = useMemo(() => ({
    ...state,
    revalidate,
    signOut
  }), [state, revalidate, signOut])

  return (
    <AuthContext.Provider value={value}>
      {state.bootStatus === 'booting' ? <AuthLoadingFallback /> : children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const value = useContext(AuthContext)
  if (!value) throw new Error('useAuth must be used inside AuthProvider')
  return value
}
