import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { safeSessionStorage } from './safe-browser'

function buildLocalPhotoId(file, index) {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }

  return [
    file?.name || 'photo',
    index,
    file?.size || 0,
    Date.now(),
    Math.random().toString(36).slice(2, 8)
  ].join('-')
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result || ''))
    reader.onerror = () => reject(reader.error || new Error('photo_read_failed'))
    reader.readAsDataURL(file)
  })
}

function serializePhoto(photo) {
  return {
    id: photo.id,
    label: photo.label,
    fileName: photo.file?.name || photo.label || 'photo.jpg',
    mimeType: photo.file?.type || photo.mimeType || 'image/jpeg',
    lastModified: photo.file?.lastModified || photo.lastModified || Date.now(),
    size: photo.file?.size || photo.size || null,
    dataUrl: photo.dataUrl || photo.previewUrl || ''
  }
}

function dataUrlToFile(dataUrl, fileName, mimeType, lastModified) {
  const parts = String(dataUrl || '').split(',')
  if (parts.length < 2) return null

  const binary = atob(parts[1])
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index)
  }

  return new File([bytes], fileName || 'photo.jpg', {
    type: mimeType || 'image/jpeg',
    lastModified: lastModified || Date.now()
  })
}

async function buildDraftPhotoItem(file, index) {
  const dataUrl = await readFileAsDataUrl(file)
  return {
    id: buildLocalPhotoId(file, index),
    file,
    previewUrl: dataUrl,
    dataUrl,
    label: file.name || `Photo ${index + 1}`,
    mimeType: file.type || 'image/jpeg',
    size: file.size || null,
    lastModified: file.lastModified || Date.now()
  }
}

function restoreDraftPhotos(rawPhotos) {
  return Array.from(rawPhotos || [])
    .filter(photo => photo?.dataUrl)
    .map((photo, index) => {
      const file = dataUrlToFile(
        photo.dataUrl,
        photo.fileName || photo.label || `photo-${index + 1}.jpg`,
        photo.mimeType,
        photo.lastModified
      )

      if (!file) return null

      return {
        id: photo.id || buildLocalPhotoId(file, index),
        file,
        previewUrl: photo.dataUrl,
        dataUrl: photo.dataUrl,
        label: photo.label || file.name || `Photo ${index + 1}`,
        mimeType: photo.mimeType || file.type || 'image/jpeg',
        size: photo.size || file.size || null,
        lastModified: photo.lastModified || file.lastModified || Date.now()
      }
    })
    .filter(Boolean)
}

export function useDraftPhotos(storageKey) {
  const [photos, setPhotos] = useState([])
  const hydratedRef = useRef(false)
  const stableKey = useMemo(() => storageKey || '', [storageKey])

  useEffect(() => {
    hydratedRef.current = false
    if (!stableKey) {
      setPhotos([])
      hydratedRef.current = true
      return
    }

    const storedPhotos = safeSessionStorage.getJSON(stableKey, [])
    setPhotos(restoreDraftPhotos(storedPhotos))
    hydratedRef.current = true
  }, [stableKey])

  useEffect(() => {
    if (!hydratedRef.current || !stableKey) return

    if (photos.length === 0) {
      safeSessionStorage.removeItem(stableKey)
      return
    }

    safeSessionStorage.setJSON(stableKey, photos.map(serializePhoto))
  }, [photos, stableKey])

  const addFiles = useCallback(async fileList => {
    const files = Array.from(fileList || []).filter(file => file && (!file.type || file.type.startsWith('image/')))
    if (files.length === 0) return []

    const newItems = await Promise.all(files.map((file, index) => buildDraftPhotoItem(file, index)))
    setPhotos(current => [...current, ...newItems])
    return newItems
  }, [])

  const removePhoto = useCallback(photoId => {
    setPhotos(current => current.filter(photo => photo.id !== photoId))
  }, [])

  const clearPhotos = useCallback(() => {
    setPhotos([])
    if (stableKey) safeSessionStorage.removeItem(stableKey)
  }, [stableKey])

  return {
    photos,
    setPhotos,
    addFiles,
    removePhoto,
    clearPhotos
  }
}
