import React from 'react'

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props)
    this.state = { error: null, errorInfo: null }
  }

  static getDerivedStateFromError(error) {
    return { error }
  }

  componentDidCatch(error, errorInfo) {
    console.error('[ErrorBoundary] React crash:', error, errorInfo)
    this.setState({ errorInfo })
  }

  render() {
    const { error, errorInfo } = this.state

    if (!error) return this.props.children

    return (
      <div style={{ minHeight: '100vh', padding: '24px', background: '#f5f5f5', color: '#1f2933', fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' }}>
        <div style={{ maxWidth: '720px', margin: '0 auto', background: '#fff', border: '1px solid #e2e2e2', borderRadius: '8px', padding: '18px' }}>
          <h1 style={{ margin: '0 0 10px', fontSize: '20px' }}>Erreur de chargement</h1>
          <p style={{ margin: '0 0 14px', fontSize: '14px', color: '#4b5563' }}>
            L'application n'a pas pu demarrer correctement. Rechargez la page, puis contactez l'administrateur si le probleme persiste.
          </p>
          <pre style={{ whiteSpace: 'pre-wrap', overflowX: 'auto', background: '#f7f7f7', border: '1px solid #ddd', borderRadius: '6px', padding: '12px', fontSize: '12px' }}>
            {error?.stack || error?.message || String(error)}
            {errorInfo?.componentStack || ''}
          </pre>
          <button type="button" className="btn-primary" onClick={() => window.location.reload()}>
            Recharger
          </button>
        </div>
      </div>
    )
  }
}
