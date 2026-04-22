import React, { useRef } from 'react'
import PhotoDropZone from './PhotoDropZone'

export default function PhotoInputPanel({
  onFilesSelected,
  disabled = false,
  dropTitle = 'Glisser-deposer des photos ici',
  dropHint = 'ou cliquer pour selectionner dans vos fichiers',
  dropNote = 'Ajout multiple sur ordinateur, sans changer le flux Camera ou Galerie.'
}) {
  const cameraInputRef = useRef(null)
  const galleryInputRef = useRef(null)

  function ouvrirCamera() {
    if (disabled) return
    cameraInputRef.current?.click()
  }

  function ouvrirGalerie() {
    if (disabled) return
    galleryInputRef.current?.click()
  }

  function transmettre(event) {
    onFilesSelected?.(event.target.files)
    event.target.value = ''
  }

  return (
    <>
      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
        <button
          type="button"
          className="btn-primary btn-sm"
          style={{ width: 'auto' }}
          onClick={ouvrirCamera}
          disabled={disabled}
        >
          Camera
        </button>
        <button
          type="button"
          className="btn-outline btn-sm"
          style={{ width: 'auto' }}
          onClick={ouvrirGalerie}
          disabled={disabled}
        >
          Galerie
        </button>
      </div>
      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={transmettre}
        disabled={disabled}
        style={{ display: 'none' }}
      />
      <input
        ref={galleryInputRef}
        type="file"
        accept="image/*"
        multiple
        onChange={transmettre}
        disabled={disabled}
        style={{ display: 'none' }}
      />
      <PhotoDropZone
        onFilesSelected={onFilesSelected}
        disabled={disabled}
        title={dropTitle}
        hint={dropHint}
        note={dropNote}
      />
    </>
  )
}
