import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { APP_VERSION } from '../generated/version'

const VersionContext = createContext(null)

async function fetchServerVersion() {
  const res = await fetch(`/version.json?t=${Date.now()}`, { cache: 'no-store' })
  if (!res.ok) throw new Error(`Version check failed: ${res.status}`)
  const data = await res.json()
  return data.version
}

export function VersionProvider({ children }) {
  const currentVersionRef = useRef(APP_VERSION)
  const [serverVersion, setServerVersion] = useState(APP_VERSION)
  const [updateAvailable, setUpdateAvailable] = useState(false)

  const checkVersion = useCallback(async () => {
    try {
      const nextVersion = await fetchServerVersion()
      console.log('VERSION', nextVersion)
      setServerVersion(nextVersion)
      if (nextVersion && nextVersion !== currentVersionRef.current) {
        console.log('UPDATE AVAILABLE')
        setUpdateAvailable(true)
      }
      return nextVersion
    } catch (error) {
      console.error('[version] Check failed:', error)
      return null
    }
  }, [])

  useEffect(() => {
    checkVersion()
  }, [checkVersion])

  useEffect(() => {
    let lastRun = 0
    const checkIfActive = () => {
      if (document.visibilityState === 'hidden') return
      const now = Date.now()
      if (now - lastRun < 1500) return
      lastRun = now
      checkVersion()
    }

    document.addEventListener('visibilitychange', checkIfActive)
    window.addEventListener('focus', checkIfActive)
    window.addEventListener('pageshow', checkIfActive)
    return () => {
      document.removeEventListener('visibilitychange', checkIfActive)
      window.removeEventListener('focus', checkIfActive)
      window.removeEventListener('pageshow', checkIfActive)
    }
  }, [checkVersion])

  const value = useMemo(() => ({
    version: currentVersionRef.current,
    serverVersion,
    updateAvailable,
    checkVersion
  }), [serverVersion, updateAvailable, checkVersion])

  return <VersionContext.Provider value={value}>{children}</VersionContext.Provider>
}

export function useVersion() {
  const value = useContext(VersionContext)
  if (!value) throw new Error('useVersion must be used inside VersionProvider')
  return value
}
