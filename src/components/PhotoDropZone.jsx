import React, { useId, useRef, useState } from 'react'

export default function PhotoDropZone({
  onFilesSelected,
  disabled = false,
  multiple = true,
  title = 'Glisser-deposer des photos ici',
  hint = 'ou cliquer pour selectionner',
  note = 'Formats images uniquement'
}) {
  const inputId = useId()
  const inputRef = useRef(null)
  const [isDragOver, setIsDragOver] = useState(false)

  function ouvrirSelecteur() {
    if (disabled) return
    inputRef.current?.click()
  }

  function transmettreFiles(fileList) {
    if (disabled) return
    const files = Array.from(fileList || []).filter(file => file && (!file.type || file.type.startsWith('image/')))
    if (files.length === 0) return
    onFilesSelected?.(files)
  }

  function onInputChange(event) {
    transmettreFiles(event.target.files)
    event.target.value = ''
  }

  function onDragOver(event) {
    if (disabled) return
    event.preventDefault()
    setIsDragOver(true)
  }

  function onDragLeave(event) {
    if (disabled) return
    event.preventDefault()
    setIsDragOver(false)
  }

  function onDrop(event) {
    if (disabled) return
    event.preventDefault()
    setIsDragOver(false)
    transmettreFiles(event.dataTransfer?.files)
  }

  function onKeyDown(event) {
    if (disabled) return
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      ouvrirSelecteur()
    }
  }

  return (
    <>
      <input
        id={inputId}
        ref={inputRef}
        type="file"
        accept="image/*"
        multiple={multiple}
        onChange={onInputChange}
        disabled={disabled}
        style={{ display: 'none' }}
      />
      <div
        role="button"
        tabIndex={disabled ? -1 : 0}
        aria-disabled={disabled}
        aria-labelledby={`${inputId}-title`}
        aria-describedby={`${inputId}-hint`}
        onClick={ouvrirSelecteur}
        onKeyDown={onKeyDown}
        onDragOver={onDragOver}
        onDragEnter={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
        style={{
          border: `1px dashed ${isDragOver ? '#185FA5' : '#c6d4e3'}`,
          background: isDragOver ? '#E6F1FB' : '#f8fbfe',
          borderRadius: '10px',
          padding: '18px 14px',
          textAlign: 'center',
          cursor: disabled ? 'default' : 'pointer',
          opacity: disabled ? 0.7 : 1,
          transition: 'background 0.15s, border-color 0.15s'
        }}
      >
        <div id={`${inputId}-title`} style={{ fontSize: '13px', fontWeight: 600, color: '#185FA5' }}>
          {title}
        </div>
        <div id={`${inputId}-hint`} style={{ fontSize: '12px', color: '#5f6f81', marginTop: '4px' }}>
          {hint}
        </div>
        <div style={{ fontSize: '11px', color: '#888', marginTop: '8px' }}>
          {note}
        </div>
      </div>
    </>
  )
}
