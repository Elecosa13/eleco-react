import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App'
import { APP_VERSION } from './generated/version'
import './index.css'

console.log('VERSION', APP_VERSION)

async function checkVersion() {
  try {
    const response = await fetch(`/version.json?t=${Date.now()}`, { cache: 'no-store' })
    if (!response.ok) return
    const data = await response.json()
    console.log('VERSION', data.version)
    if (data.version && data.version !== APP_VERSION) {
      console.log('UPDATE AVAILABLE')
      window.location.reload()
    }
  } catch (error) {
    console.error('[version] check failed', error)
  }
}

checkVersion()
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') checkVersion()
})
window.addEventListener('focus', checkVersion)
window.addEventListener('pageshow', checkVersion)

ReactDOM.createRoot(document.getElementById('root')).render(
  <BrowserRouter>
    <App />
  </BrowserRouter>
)
