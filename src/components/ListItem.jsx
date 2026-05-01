import React from 'react'

export default function ListItem({
  label,
  title,
  subtitle,
  badge,
  showRename = false,
  showDelete = false,
  deleteDisabled = false,
  onClick,
  onRename,
  onDelete,
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 4px', border: 'none', borderBottom: '1px solid #E7EDF5', background: 'transparent', width: '100%', textAlign: 'left', cursor: 'pointer' }}>
      <div style={{ minWidth: 0, flex: 1 }} onClick={onClick}>
        {label && (
          <div style={{ fontSize: '11px', color: '#6D7B8A', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{label}</div>
        )}
        <div style={{ fontWeight: 700, fontSize: '14px', color: '#185FA5', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{title}</div>
        {subtitle && (
          <div style={{ fontSize: '11px', color: '#888' }}>{subtitle}</div>
        )}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
        {badge && (
          <span style={{ background: '#EEF2F7', color: '#475569', fontSize: '11px', padding: '3px 10px', borderRadius: '999px' }}>{badge}</span>
        )}
        {showRename && (
          <button onClick={e => { e.stopPropagation(); onRename && onRename() }} style={{ width: 30, height: 30, border: '1px solid #D8E3EF', borderRadius: '6px', background: '#fff', padding: 0, fontSize: '12px', cursor: 'pointer' }}>R</button>
        )}
        {showDelete && (
          <button onClick={e => { e.stopPropagation(); onDelete && onDelete() }} disabled={deleteDisabled} style={{ width: 30, height: 30, border: '1px solid #f09595', borderRadius: '6px', background: '#fff', color: '#A32D2D', padding: 0, fontSize: '12px', cursor: deleteDisabled ? 'not-allowed' : 'pointer', opacity: deleteDisabled ? 0.45 : 1 }}>x</button>
        )}
      </div>
    </div>
  )
}
