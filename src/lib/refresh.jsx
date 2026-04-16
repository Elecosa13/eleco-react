import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'

const RefreshContext = createContext({
  refreshing: false,
  pullDistance: 0,
  refresh: async () => {}
})

export function usePageRefresh(refreshFn, deps = []) {
  const ctx = useContext(RefreshContext)
  const fnRef = useRef(refreshFn)

  useEffect(() => {
    fnRef.current = refreshFn
  }, [refreshFn, ...deps])

  useEffect(() => {
    ctx.setRefreshHandler?.(() => fnRef.current?.())
    return () => ctx.setRefreshHandler?.(null)
  }, [ctx])

  return ctx.refresh
}

export function RefreshProvider({ children }) {
  const refreshHandlerRef = useRef(null)
  const startYRef = useRef(0)
  const pullingRef = useRef(false)
  const [pullDistance, setPullDistance] = useState(0)
  const [refreshing, setRefreshing] = useState(false)

  const setRefreshHandler = useCallback(handler => {
    refreshHandlerRef.current = handler
  }, [])

  const refresh = useCallback(async () => {
    if (refreshing || !refreshHandlerRef.current) return
    setRefreshing(true)
    try {
      await refreshHandlerRef.current()
    } finally {
      setRefreshing(false)
      setPullDistance(0)
    }
  }, [refreshing])

  useEffect(() => {
    function canPull(target) {
      if (window.scrollY > 0) return false
      if (target?.closest?.('input, textarea, select, button')) return false
      return true
    }

    function onTouchStart(e) {
      if (refreshing || !canPull(e.target)) return
      startYRef.current = e.touches[0].clientY
      pullingRef.current = true
    }

    function onTouchMove(e) {
      if (!pullingRef.current || refreshing) return
      const distance = e.touches[0].clientY - startYRef.current
      if (distance <= 0 || window.scrollY > 0) {
        setPullDistance(0)
        return
      }
      const eased = Math.min(96, distance * 0.45)
      setPullDistance(eased)
      if (distance > 12) e.preventDefault()
    }

    function onTouchEnd() {
      if (!pullingRef.current) return
      pullingRef.current = false
      if (pullDistance >= 58) {
        refresh()
      } else {
        setPullDistance(0)
      }
    }

    window.addEventListener('touchstart', onTouchStart, { passive: true })
    window.addEventListener('touchmove', onTouchMove, { passive: false })
    window.addEventListener('touchend', onTouchEnd)
    window.addEventListener('touchcancel', onTouchEnd)
    return () => {
      window.removeEventListener('touchstart', onTouchStart)
      window.removeEventListener('touchmove', onTouchMove)
      window.removeEventListener('touchend', onTouchEnd)
      window.removeEventListener('touchcancel', onTouchEnd)
    }
  }, [pullDistance, refresh, refreshing])

  useEffect(() => {
    let lastRun = 0
    const refreshIfActive = () => {
      if (document.visibilityState === 'hidden') return
      const now = Date.now()
      if (now - lastRun < 1500) return
      lastRun = now
      refresh()
    }

    document.addEventListener('visibilitychange', refreshIfActive)
    window.addEventListener('focus', refreshIfActive)
    window.addEventListener('pageshow', refreshIfActive)
    return () => {
      document.removeEventListener('visibilitychange', refreshIfActive)
      window.removeEventListener('focus', refreshIfActive)
      window.removeEventListener('pageshow', refreshIfActive)
    }
  }, [refresh])

  const shown = refreshing || pullDistance > 0
  const progress = refreshing ? 1 : Math.min(1, pullDistance / 58)
  const value = useMemo(() => ({ refreshing, pullDistance, refresh, setRefreshHandler }), [refreshing, pullDistance, refresh, setRefreshHandler])

  return (
    <RefreshContext.Provider value={value}>
      <div
        className={`pull-refresh ${shown ? 'pull-refresh--visible' : ''}`}
        style={{ transform: `translate(-50%, ${shown ? Math.max(0, pullDistance - 44) : -60}px)` }}
      >
        <span className={`pull-refresh__spinner ${refreshing ? 'pull-refresh__spinner--active' : ''}`} style={{ opacity: 0.35 + progress * 0.65 }} />
        <span>{refreshing ? 'Mise a jour...' : 'Relacher pour actualiser'}</span>
      </div>
      {children}
    </RefreshContext.Provider>
  )
}
