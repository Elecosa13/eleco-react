import React from 'react'

const sideStyle = {
  position: 'absolute',
  top: '50%',
  transform: 'translateY(-50%)',
  display: 'flex',
  alignItems: 'center',
  gap: '8px',
  minWidth: '40px',
  minHeight: '40px'
}

const backButtonStyle = {
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

export default function PageHeader({ title, subtitle, onBack, rightSlot }) {
  return (
    <div
      className="top-bar"
      style={{
        position: 'sticky',
        minHeight: '66px',
        padding: '10px 104px',
        justifyContent: 'center',
        boxSizing: 'border-box'
      }}
    >
      <div style={{ ...sideStyle, left: '16px', justifyContent: 'flex-start' }}>
        {onBack && (
          <button type="button" aria-label="Retour" title="Retour" onClick={onBack} style={backButtonStyle}>
            <span aria-hidden="true">&larr;</span>
          </button>
        )}
      </div>

      <div style={{ textAlign: 'center', minWidth: 0, maxWidth: '100%' }}>
        <div
          title={title}
          style={{
            fontWeight: 600,
            fontSize: '15px',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap'
          }}
        >
          {title}
        </div>
        {subtitle && (
          <div
            title={subtitle}
            style={{
              fontSize: '11px',
              color: '#888',
              marginTop: '2px',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap'
            }}
          >
            {subtitle}
          </div>
        )}
      </div>

      <div style={{ ...sideStyle, right: '16px', justifyContent: 'flex-end' }}>
        {rightSlot}
      </div>
    </div>
  )
}
