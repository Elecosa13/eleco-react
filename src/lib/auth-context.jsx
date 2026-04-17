import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { cacheProfile, loadCurrentProfile, signOut as authSignOut } from './auth'
import { supabase } from './supabase'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  console.log('[auth-context] render')
  const [state, setState] = useState({
    initializing: true,
    user: null,
    profile: null,
    role: null,
    error: null
  })

  const applyProfile = useCallback((user, profile, error = null, initializing = false) => {
    console.log('[auth-context] applyProfile', {
      initializing,
      hasUser: Boolean(user),
      hasProfile: Boolean(profile),
      role: profile?.role || null,
      error: error?.code || error?.message || null
    })
    console.log('SESSION', user)
    console.log('PROFILE', profile)
    console.log('ROLE', profile?.role || null)
    setState({
      initializing,
      user,
      profile,
      role: profile?.role || null,
      error
    })
  }, [])

  const revalidate = useCallback(async () => {
    console.log('[auth-context] revalidate')
    try {
      const { user, profile, error } = await loadCurrentProfile()
      applyProfile(user, profile, error, false)
      return { user, profile, error }
    } catch (error) {
      console.error('[auth-context] revalidate failed:', error)
      applyProfile(null, null, error, false)
      return { user: null, profile: null, error }
    }
  }, [applyProfile])

  const signOut = useCallback(async () => {
    await authSignOut()
    applyProfile(null, null, null, false)
  }, [applyProfile])

  useEffect(() => {
    let mounted = true

    console.log('[auth-context] initial load')

    loadCurrentProfile()
      .then(({ user, profile, error }) => {
        if (!mounted) return
        applyProfile(user, profile, error, false)
      })
      .catch(error => {
        console.error('[auth-context] initial load failed:', error)
        if (!mounted) return
        applyProfile(null, null, error, false)
      })

    const { data: listener } = supabase.auth.onAuthStateChange((event, session) => {
      console.log('[auth-context] auth event', event)
      console.log('SESSION', session)
      if (event === 'SIGNED_OUT' || !session?.user) {
        cacheProfile(null)
        applyProfile(null, null, null, false)
        return
      }
      setTimeout(() => {
        loadCurrentProfile()
          .then(({ user, profile, error }) => {
            if (!mounted) return
            applyProfile(user, profile, error, false)
          })
          .catch(error => {
            console.error('[auth-context] auth event load failed:', error)
            if (!mounted) return
            applyProfile(null, null, error, false)
          })
      }, 0)
    })

    return () => {
      mounted = false
      listener?.subscription?.unsubscribe()
    }
  }, [applyProfile])

  useEffect(() => {
    let lastRun = 0
    const refreshIfActive = () => {
      console.log('[auth-context] refreshIfActive')
      if (document.visibilityState === 'hidden') return
      const now = Date.now()
      if (now - lastRun < 1500) return
      lastRun = now
      revalidate()
    }

    document.addEventListener('visibilitychange', refreshIfActive)
    window.addEventListener('focus', refreshIfActive)
    window.addEventListener('pageshow', refreshIfActive)
    return () => {
      document.removeEventListener('visibilitychange', refreshIfActive)
      window.removeEventListener('focus', refreshIfActive)
      window.removeEventListener('pageshow', refreshIfActive)
    }
  }, [revalidate])

  const value = useMemo(() => ({
    ...state,
    revalidate,
    signOut
  }), [state, revalidate, signOut])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const value = useContext(AuthContext)
  if (!value) throw new Error('useAuth must be used inside AuthProvider')
  return value
}
