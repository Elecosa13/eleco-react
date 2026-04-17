import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App'
import ErrorBoundary from './components/ErrorBoundary'
import { AuthProvider } from './context/AuthContext'
import { diag } from './lib/diagnostics'
import { getRootElement, runSafeFeatureAsync } from './lib/safe-browser'
import './index.css'

diag('boot', 'main render start')

// Boot checklist:
// - keep main.jsx render-only; move browser APIs, listeners, PWA and storage to safe helpers.
// - never add feature code here; secondary features must fail closed without blocking React.
// - root lookup must stay guarded so a boot failure is logged instead of throwing silently.
const rootElement = getRootElement()

if (!rootElement) {
  diag('boot', 'root element missing', null, 'error')
} else {
  ReactDOM.createRoot(rootElement).render(
    <React.StrictMode>
      <ErrorBoundary scope="boot">
        <BrowserRouter>
          <ErrorBoundary scope="auth" title="Erreur de session">
            <AuthProvider>
              <ErrorBoundary scope="app-layout" title="Erreur de l'application">
                <App />
              </ErrorBoundary>
            </AuthProvider>
          </ErrorBoundary>
        </BrowserRouter>
      </ErrorBoundary>
    </React.StrictMode>
  )

  runSafeFeatureAsync('boot', 'deferred app boot', async () => {
    const { initializeAppBoot } = await import('./lib/appBoot')
    initializeAppBoot()
  })
}
