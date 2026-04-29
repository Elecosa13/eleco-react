import { supabase } from '../lib/supabase'

export async function fetchLinkedTimeEntry({ type, referenceId, employeId = null }) {
  if (!type || !referenceId) return null

  let query = supabase
    .from('time_entries')
    .select('id, employe_id, date_travail, type, reference_id, duree, chantier_id')
    .eq('type', type)
    .eq('reference_id', referenceId)
    .limit(1)

  if (employeId) query = query.eq('employe_id', employeId)

  const { data, error } = await query.maybeSingle()
  if (error) throw error
  return data || null
}

export async function fetchTimeEntryDurationsMap({
  type,
  referenceIds,
  employeId = null,
  dateFrom = null,
  dateTo = null
}) {
  const ids = Array.from(referenceIds || []).filter(Boolean)
  if (!type || ids.length === 0) return {}

  let query = supabase
    .from('time_entries')
    .select('reference_id, duree')
    .eq('type', type)
    .in('reference_id', ids)

  if (employeId) query = query.eq('employe_id', employeId)
  if (dateFrom) query = query.gte('date_travail', dateFrom)
  if (dateTo) query = query.lte('date_travail', dateTo)

  const { data, error } = await query
  if (error) throw error

  const byReferenceId = {}
  for (const entry of data || []) {
    const key = String(entry.reference_id)
    byReferenceId[key] = (byReferenceId[key] || 0) + (Number(entry.duree) || 0)
  }

  return byReferenceId
}

export async function upsertLinkedTimeEntry({
  type,
  referenceId,
  dateTravail,
  duree,
  chantierId = null,
  employeId = null
}) {
  const { data, error } = await supabase.rpc('upsert_linked_time_entry', {
    p_type: type,
    p_reference_id: referenceId,
    p_date_travail: dateTravail,
    p_duree: Number(duree) || 0,
    p_chantier_id: chantierId,
    p_employe_id: employeId
  })

  if (error) throw error
  return data || null
}
