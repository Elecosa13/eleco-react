import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { registerSW } from 'virtual:pwa-register'
import App from './App'
import { APP_VERSION } from './generated/version'
import { AuthProvider } from './context/AuthContext'
import './index.css'

console.log('VERSION (build)', APP_VERSION)

// PWA update auto
registerSW({
  onNeedRefresh() {
    console.log('Nouvelle version disponible, refresh conseillé')
  },
  onOfflineReady() {
    console.log('App prête en offline')
  }
})

// Check version serveur
async function checkVersion() {
  try {
    const response = await fetch(`/version.json?t=${Date.now()}`, { cache: 'no-store' })
    if (!response.ok) return

    const data = await response.json()
    console.log('VERSION (server)', data.version)

    if (data.version && data.version !== APP_VERSION) {
      console.log('UPDATE AVAILABLE → reload')
      window.location.reload()
    }
  } catch (e) {
    console.error('Version check failed', e)
  }
}

setInterval(checkVersion, 30000)

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <App />
      </AuthProvider>
    </BrowserRouter>
  </React.StrictMode>
)
