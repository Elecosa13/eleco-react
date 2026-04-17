import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { registerSW } from 'virtual:pwa-register'
import App from './App'
import ErrorBoundary from './components/ErrorBoundary'
import { APP_VERSION } from './generated/version'
import { AuthProvider } from './context/AuthContext'
import './index.css'

console.log('[main] boot')
console.log('VERSION (build)', APP_VERSION)

window.addEventListener('error', event => {
  console.error('[main] window error:', event.error || event.message)
})

window.addEventListener('unhandledrejection', event => {
  console.error('[main] unhandled rejection:', event.reason)
})

// PWA update auto
try {
  let updateSW
  updateSW = registerSW({
    immediate: true,
    onNeedRefresh() {
      console.log('Nouvelle version disponible, refresh conseille')
      updateSW?.(true)
    },
    onOfflineReady() {
      console.log('App prete en offline')
    },
    onRegisterError(error) {
      console.error('[main] SW register failed:', error)
    }
  })
} catch (error) {
  console.error('[main] SW init failed:', error)
}

// Check version serveur
async function checkVersion() {
  try {
    console.log('[main] checkVersion')
    const response = await fetch(`/version.json?t=${Date.now()}`, { cache: 'no-store' })
    if (!response.ok) return

    const data = await response.json()
    console.log('VERSION (server)', data.version)

    if (data.version && data.version !== APP_VERSION) {
      console.log('UPDATE AVAILABLE -> reload')
      window.location.reload()
    }
  } catch (e) {
    console.error('Version check failed', e)
  }
}

setInterval(checkVersion, 30000)

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ErrorBoundary>
      <BrowserRouter>
        <AuthProvider>
          <App />
        </AuthProvider>
      </BrowserRouter>
    </ErrorBoundary>
  </React.StrictMode>
)
