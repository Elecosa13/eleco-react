import React from 'react'
import { diag } from '../lib/diagnostics'
import { safeLocation } from '../lib/safe-browser'

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props)
    this.state = { error: null, errorInfo: null }
  }

  static getDerivedStateFromError(error) {
    return { error }
  }

  componentDidCatch(error, errorInfo) {
    diag('boundary', `${this.props.scope || 'global'} crashed`, { error, errorInfo }, 'error')
    this.setState({ errorInfo })
  }

  render() {
    const { error, errorInfo } = this.state
    const scope = this.props.scope || 'global'
    const title = this.props.title || 'Erreur de chargement'

    if (!error) return this.props.children

    return (
      <div style={{ minHeight: '100vh', padding: '24px', background: '#f5f5f5', color: '#1f2933', fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' }}>
        <div style={{ maxWidth: '720px', margin: '0 auto', background: '#fff', border: '1px solid #e2e2e2', borderRadius: '8px', padding: '18px' }}>
          <h1 style={{ margin: '0 0 10px', fontSize: '20px' }}>{title}</h1>
          <p style={{ margin: '0 0 14px', fontSize: '14px', color: '#4b5563' }}>
            Cette zone n'a pas pu se charger correctement. Le reste de l'application reste protege.
          </p>
          <div style={{ marginBottom: '10px', fontSize: '12px', color: '#6b7280' }}>Zone: {scope}</div>
          <pre style={{ whiteSpace: 'pre-wrap', overflowX: 'auto', background: '#f7f7f7', border: '1px solid #ddd', borderRadius: '6px', padding: '12px', fontSize: '12px' }}>
            {error?.stack || error?.message || String(error)}
            {errorInfo?.componentStack || ''}
          </pre>
          <button type="button" className="btn-primary" onClick={() => safeLocation.reload()}>
            Recharger
          </button>
        </div>
      </div>
    )
  }
}
