import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { APP_VERSION } from '../generated/version'
import { diag } from './diagnostics'
import { addDocumentListener, addWindowListener, getVisibilityState, safeFetchJSON } from './safe-browser'

const VersionContext = createContext(null)

async function fetchServerVersion() {
  const data = await safeFetchJSON(`/version.json?t=${Date.now()}`, { cache: 'no-store' })
  return data?.version || null
}

export function VersionProvider({ children }) {
  const currentVersionRef = useRef(APP_VERSION)
  const [serverVersion, setServerVersion] = useState(APP_VERSION)
  const [updateAvailable, setUpdateAvailable] = useState(false)

  const checkVersion = useCallback(async () => {
    try {
      const nextVersion = await fetchServerVersion()
      diag('boot', 'version check result', nextVersion)
      setServerVersion(nextVersion)
      if (nextVersion && nextVersion !== currentVersionRef.current) {
        diag('boot', 'update available', { nextVersion })
        setUpdateAvailable(true)
      }
      return nextVersion
    } catch (error) {
      diag('boot', 'version check failed', error, 'warn')
      return null
    }
  }, [])

  useEffect(() => {
    checkVersion()
  }, [checkVersion])

  useEffect(() => {
    let lastRun = 0
    const checkIfActive = () => {
      if (getVisibilityState() === 'hidden') return
      const now = Date.now()
      if (now - lastRun < 1500) return
      lastRun = now
      checkVersion()
    }

    const cleanupVisibility = addDocumentListener('visibilitychange', checkIfActive)
    const cleanupFocus = addWindowListener('focus', checkIfActive)
    const cleanupPageShow = addWindowListener('pageshow', checkIfActive)
    return () => {
      cleanupVisibility()
      cleanupFocus()
      cleanupPageShow()
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
