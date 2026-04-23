import { supabase } from '../lib/supabase'

export const RAPPORT_PHOTOS_BUCKET = 'rapport-photos'

export async function uploadRapportPhotos({
  rapportId,
  depannageId = null,
  chantierId,
  sousDossierId = null,
  affaireId = null,
  files,
  userId
}) {
  const photoFiles = Array.from(files || []).filter(Boolean)
  if (!rapportId || !chantierId || (!sousDossierId && !affaireId) || photoFiles.length === 0) return []

  const uploadedObjects = []

  try {
    for (const file of photoFiles) {
      const storagePath = buildStoragePath({
        chantierId,
        sousDossierId,
        affaireId,
        rapportId,
        fileName: file.name
      })

      const { error: uploadError } = await supabase
        .storage
        .from(RAPPORT_PHOTOS_BUCKET)
        .upload(storagePath, file, {
          cacheControl: '3600',
          contentType: file.type || 'application/octet-stream',
          upsert: false
        })

      if (uploadError) throw uploadError

      uploadedObjects.push({
        rapport_id: rapportId,
        depannage_id: depannageId,
        chantier_id: chantierId,
        ...(affaireId ? { affaire_id: affaireId } : {}),
        ...(sousDossierId ? { sous_dossier_id: sousDossierId } : {}),
        storage_bucket: RAPPORT_PHOTOS_BUCKET,
        storage_path: storagePath,
        file_name: file.name || 'photo.jpg',
        mime_type: file.type || 'application/octet-stream',
        size_bytes: file.size || null,
        created_by: userId || null
      })
    }

    const { data, error } = await supabase
      .from('rapport_photos')
      .insert(uploadedObjects)
      .select('*')

    if (error) throw error

    return data || []
  } catch (error) {
    if (uploadedObjects.length > 0) {
      await supabase
        .storage
        .from(RAPPORT_PHOTOS_BUCKET)
        .remove(uploadedObjects.map(photo => photo.storage_path))
    }
    throw error
  }
}

export async function deleteRapportPhoto(photo) {
  if (!photo?.id || !photo?.storage_path) {
    throw new Error('invalid_rapport_photo')
  }

  const bucket = photo.storage_bucket || RAPPORT_PHOTOS_BUCKET

  const { error: storageError } = await supabase
    .storage
    .from(bucket)
    .remove([photo.storage_path])

  if (storageError) throw storageError

  const { error: deleteError } = await supabase
    .from('rapport_photos')
    .delete()
    .eq('id', photo.id)

  if (deleteError) throw deleteError
}

export async function withSignedPhotoUrls(photos, expiresIn = 3600) {
  const list = Array.from(photos || []).filter(photo => photo?.storage_path)
  if (list.length === 0) return []

  const bucket = list[0].storage_bucket || RAPPORT_PHOTOS_BUCKET
  const { data, error } = await supabase
    .storage
    .from(bucket)
    .createSignedUrls(list.map(photo => photo.storage_path), expiresIn)

  if (error) throw error

  return list.map((photo, index) => ({
    ...photo,
    signed_url: data?.[index]?.signedUrl || ''
  }))
}

export function buildPhotoPreviewItems(files) {
  return Array.from(files || []).map((file, index) => ({
    id: buildLocalPhotoId(file, index),
    file,
    previewUrl: typeof URL !== 'undefined' ? URL.createObjectURL(file) : '',
    label: file.name || `Photo ${index + 1}`
  }))
}

export function releasePhotoPreviews(items) {
  for (const item of items || []) {
    if (item?.previewUrl) URL.revokeObjectURL(item.previewUrl)
  }
}

function buildStoragePath({ chantierId, sousDossierId, affaireId, rapportId, fileName }) {
  const extension = getExtension(fileName)
  const safeFileName = slugify(fileName || 'photo')
  const uniquePart = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  const parentPath = sousDossierId
    ? ['sous-dossiers', sousDossierId]
    : ['affaires', affaireId]

  return [
    'chantiers',
    chantierId,
    ...parentPath,
    'rapports',
    rapportId,
    `${uniquePart}-${safeFileName}${extension}`
  ].join('/')
}

function slugify(value) {
  return String(value || 'photo')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || 'photo'
}

function getExtension(fileName) {
  const match = String(fileName || '').match(/(\.[a-z0-9]+)$/i)
  return match ? match[1].toLowerCase() : '.jpg'
}

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
