import React from 'react'
import { getSafeWindow } from '../lib/safe-browser'

const iconButtonStyle = {
  width: '40px',
  height: '40px',
  borderRadius: '10px',
  border: '1px solid #d9e8f6',
  background: '#fff',
  color: '#185FA5',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  fontSize: '20px',
  lineHeight: 1,
  cursor: 'pointer',
  flexShrink: 0
}

export function navigateBackWithFallback(navigate, fallbackPath) {
  const win = getSafeWindow()
  if ((win?.history?.length || 0) > 1) {
    navigate(-1)
    return
  }

  navigate(fallbackPath, { replace: true })
}

export default function PageTopActions({
  navigate,
  fallbackPath,
  onRefresh,
  refreshing = false,
  showBack = true
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginLeft: '12px' }}>
      {showBack && (
        <button
          type="button"
          aria-label="Retour"
          title="Retour"
          onClick={() => navigateBackWithFallback(navigate, fallbackPath)}
          style={iconButtonStyle}
        >
          <span aria-hidden="true">&larr;</span>
        </button>
      )}
      {onRefresh && (
        <button
          type="button"
          aria-label="Rafraichir"
          title="Rafraichir"
          onClick={() => onRefresh()}
          disabled={refreshing}
          style={{ ...iconButtonStyle, opacity: refreshing ? 0.7 : 1, cursor: refreshing ? 'default' : 'pointer' }}
        >
          <span
            aria-hidden="true"
            className={refreshing ? 'pull-refresh__spinner pull-refresh__spinner--active' : ''}
            style={refreshing ? undefined : { transform: 'translateY(-1px)' }}
          >
            {refreshing ? '' : '↻'}
          </span>
        </button>
      )}
    </div>
  )
}
