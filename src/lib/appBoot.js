import { registerSW } from 'virtual:pwa-register'
import { diag } from './diagnostics'
import { addWindowListener, runSafeFeature } from './safe-browser'

// Holds the vite-plugin-pwa update trigger; called only on explicit user action.
let _updateSW = null

export function triggerSWUpdate() {
  if (_updateSW) _updateSW(true)
}

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
    _updateSW = registerSW({
      immediate: true,
      onNeedRefresh() {
        diag('pwa', 'new service worker available')
        // Signal PwaUpdatePrompt via event — never auto-reload.
        runSafeFeature('pwa', 'sw update event dispatch', () => {
          window.dispatchEvent(new CustomEvent('eleco-sw-update'))
        })
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

export function initializeAppBoot() {
  // Boot rule: secondary browser features must be isolated here, never in main.jsx.
  diag('boot', 'initialize')
  registerGlobalErrorLogging()
  registerServiceWorker()
}
