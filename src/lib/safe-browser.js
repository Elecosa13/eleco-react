import { diag } from './diagnostics'

// Browser safety checklist:
// - do not call localStorage/sessionStorage/window/document/navigator directly in features.
// - add new fragile browser APIs here first, with fallback + diagnostic log.
// - secondary browser features must return a safe value instead of throwing during boot.
function memoryStorageAdapter(label) {
  const store = new Map()
  return {
    getItem: key => store.get(key) ?? null,
    setItem: (key, value) => {
      store.set(key, String(value))
    },
    removeItem: key => {
      store.delete(key)
    }
  }
}

function resolveStorage(kind) {
  try {
    const storage = globalThis?.[kind]
    if (!storage) throw new Error(`${kind} unavailable`)
    const testKey = `__eleco_${kind}_test__`
    storage.setItem(testKey, '1')
    storage.removeItem(testKey)
    return storage
  } catch (error) {
    diag('storage', `${kind} unavailable, using memory fallback`, error, 'warn')
    return memoryStorageAdapter(kind)
  }
}

function createSafeStorage(kind) {
  const storage = resolveStorage(kind)

  return {
    getItem(key, fallback = null) {
      try {
        const value = storage.getItem(key)
        return value ?? fallback
      } catch (error) {
        diag('storage', `${kind}.getItem failed`, { key, error }, 'warn')
        return fallback
      }
    },
    setItem(key, value) {
      try {
        storage.setItem(key, String(value))
        return true
      } catch (error) {
        diag('storage', `${kind}.setItem failed`, { key, error }, 'warn')
        return false
      }
    },
    removeItem(key) {
      try {
        storage.removeItem(key)
        return true
      } catch (error) {
        diag('storage', `${kind}.removeItem failed`, { key, error }, 'warn')
        return false
      }
    },
    getJSON(key, fallback = null) {
      try {
        const raw = this.getItem(key, null)
        return raw ? JSON.parse(raw) : fallback
      } catch (error) {
        diag('storage', `${kind}.getJSON failed`, { key, error }, 'warn')
        this.removeItem(key)
        return fallback
      }
    },
    setJSON(key, value) {
      try {
        return this.setItem(key, JSON.stringify(value))
      } catch (error) {
        diag('storage', `${kind}.setJSON failed`, { key, error }, 'warn')
        return false
      }
    },
    adapter: storage
  }
}

export const safeLocalStorage = createSafeStorage('localStorage')
export const safeSessionStorage = createSafeStorage('sessionStorage')

export function getSafeWindow() {
  try {
    return typeof window === 'undefined' ? null : window
  } catch {
    return null
  }
}

export function getSafeDocument() {
  try {
    return typeof document === 'undefined' ? null : document
  } catch {
    return null
  }
}

export function getSafeNavigator() {
  try {
    return typeof navigator === 'undefined' ? null : navigator
  } catch {
    return null
  }
}

export function getRootElement(rootId = 'root') {
  const doc = getSafeDocument()
  return doc?.getElementById(rootId) || null
}

export function addWindowListener(eventName, handler, options) {
  const win = getSafeWindow()
  if (!win?.addEventListener) return () => {}

  try {
    win.addEventListener(eventName, handler, options)
    return () => {
      try {
        win.removeEventListener(eventName, handler, options)
      } catch (error) {
        diag('browser', `remove window listener failed: ${eventName}`, error, 'warn')
      }
    }
  } catch (error) {
    diag('browser', `add window listener failed: ${eventName}`, error, 'warn')
    return () => {}
  }
}

export function addDocumentListener(eventName, handler, options) {
  const doc = getSafeDocument()
  if (!doc?.addEventListener) return () => {}

  try {
    doc.addEventListener(eventName, handler, options)
    return () => {
      try {
        doc.removeEventListener(eventName, handler, options)
      } catch (error) {
        diag('browser', `remove document listener failed: ${eventName}`, error, 'warn')
      }
    }
  } catch (error) {
    diag('browser', `add document listener failed: ${eventName}`, error, 'warn')
    return () => {}
  }
}

export function getVisibilityState(fallback = 'visible') {
  return getSafeDocument()?.visibilityState || fallback
}

export function getScrollY(fallback = 0) {
  try {
    return getSafeWindow()?.scrollY ?? fallback
  } catch (error) {
    diag('browser', 'scrollY read failed', error, 'warn')
    return fallback
  }
}

export function safeMatchMedia(query, fallback = { matches: false }) {
  try {
    const win = getSafeWindow()
    return win?.matchMedia ? win.matchMedia(query) : fallback
  } catch (error) {
    diag('browser', 'matchMedia failed', { query, error }, 'warn')
    return fallback
  }
}

export const safeLocation = {
  reload() {
    try {
      getSafeWindow()?.location?.reload()
    } catch (error) {
      diag('browser', 'location.reload failed', error, 'warn')
    }
  },
  assign(url) {
    try {
      getSafeWindow()?.location?.assign(url)
    } catch (error) {
      diag('browser', 'location.assign failed', { url, error }, 'warn')
    }
  },
  replace(url) {
    try {
      getSafeWindow()?.location?.replace(url)
    } catch (error) {
      diag('browser', 'location.replace failed', { url, error }, 'warn')
    }
  }
}

export const safeHistory = {
  back() {
    try {
      getSafeWindow()?.history?.back()
    } catch (error) {
      diag('browser', 'history.back failed', error, 'warn')
    }
  },
  pushState(state, title, url) {
    try {
      getSafeWindow()?.history?.pushState(state, title, url)
      return true
    } catch (error) {
      diag('browser', 'history.pushState failed', { url, error }, 'warn')
      return false
    }
  },
  replaceState(state, title, url) {
    try {
      getSafeWindow()?.history?.replaceState(state, title, url)
      return true
    } catch (error) {
      diag('browser', 'history.replaceState failed', { url, error }, 'warn')
      return false
    }
  }
}

export function getUserAgent(fallback = 'unknown') {
  try {
    return getSafeNavigator()?.userAgent || fallback
  } catch (error) {
    diag('browser', 'navigator.userAgent failed', error, 'warn')
    return fallback
  }
}

export function supportsWebAuthn() {
  try {
    const nav = getSafeNavigator()
    return Boolean(nav?.credentials && globalThis?.PublicKeyCredential)
  } catch (error) {
    diag('browser', 'WebAuthn support check failed', error, 'warn')
    return false
  }
}

export function safeConfirm(message, fallback = false) {
  try {
    const win = getSafeWindow()
    return win?.confirm ? win.confirm(message) : fallback
  } catch (error) {
    diag('browser', 'window.confirm failed', error, 'warn')
    return fallback
  }
}

export async function safeFetchJSON(url, options = {}) {
  try {
    const res = await fetch(url, options)
    if (!res.ok) throw new Error(`Fetch failed: ${res.status}`)
    return await res.json()
  } catch (error) {
    diag('browser', 'fetch JSON failed', { url, error }, 'warn')
    return null
  }
}

export function runSafeFeature(layer, featureName, fn, fallback = null) {
  try {
    diag(layer, `${featureName} start`)
    const result = fn()
    diag(layer, `${featureName} ok`)
    return result
  } catch (error) {
    diag(layer, `${featureName} failed`, error, 'error')
    return fallback
  }
}

export async function runSafeFeatureAsync(layer, featureName, fn, fallback = null) {
  try {
    diag(layer, `${featureName} start`)
    const result = await fn()
    diag(layer, `${featureName} ok`)
    return result
  } catch (error) {
    diag(layer, `${featureName} failed`, error, 'error')
    return fallback
  }
}

export async function withTimeout(promise, timeoutMs, createTimeoutError) {
  let timerId
  const timeoutPromise = new Promise((_, reject) => {
    timerId = setTimeout(() => {
      reject(createTimeoutError())
    }, timeoutMs)
  })

  try {
    return await Promise.race([promise, timeoutPromise])
  } finally {
    clearTimeout(timerId)
  }
}
