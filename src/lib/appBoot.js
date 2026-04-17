import { registerSW } from 'virtual:pwa-register'
import { APP_VERSION } from '../generated/version'
import { diag } from './diagnostics'
import { addWindowListener, runSafeFeature, safeFetchJSON, safeLocation } from './safe-browser'

const VERSION_CHECK_INTERVAL_MS = 30000

function registerGlobalErrorLogging() {
  const cleanupError = addWindowListener('error', event => {
    diag('boot', 'window error', event?.error || event?.message, 'error')
  })

  const cleanupRejection = addWindowListener('unhandledrejection', event => {
    diag('boot', 'unhandled rejection', event?.reason, 'error')
  })

  return () => {
    cleanupError()
    cleanupRejection()
  }
}

function registerServiceWorker() {
  return runSafeFeature('boot', 'service worker registration', () => {
    let updateSW
    updateSW = registerSW({
      immediate: true,
      onNeedRefresh() {
        diag('pwa', 'new service worker available')
        updateSW?.(true)
      },
      onOfflineReady() {
        diag('pwa', 'offline ready')
      },
      onRegisterError(error) {
        diag('pwa', 'service worker register failed', error, 'error')
      }
    })
  })
}

async function checkVersion() {
  const data = await safeFetchJSON(`/version.json?t=${Date.now()}`, { cache: 'no-store' })
  if (!data?.version) return

  diag('boot', 'server version', data.version)
  if (data.version !== APP_VERSION) {
    diag('boot', 'version mismatch, reload requested', {
      build: APP_VERSION,
      server: data.version
    }, 'warn')
    safeLocation.reload()
  }
}

function startVersionChecks() {
  runSafeFeature('boot', 'version check', () => {
    checkVersion()
    setInterval(checkVersion, VERSION_CHECK_INTERVAL_MS)
  })
}

export function initializeAppBoot() {
  // Boot rule: secondary browser features must be isolated here, never in main.jsx.
  diag('boot', 'initialize', { version: APP_VERSION })
  registerGlobalErrorLogging()
  registerServiceWorker()
  startVersionChecks()
}
