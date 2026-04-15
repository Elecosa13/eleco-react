import { supabase } from './supabase'

const USER_CACHE_KEY = 'eleco_user'

export function cacheProfile(profile) {
  if (!profile) {
    localStorage.removeItem(USER_CACHE_KEY)
    return null
  }

  const cached = {
    id: profile.id,
    auth_user_id: profile.auth_user_id,
    prenom: profile.prenom,
    role: profile.role,
    initiales: profile.initiales,
    email: profile.email
  }
  localStorage.setItem(USER_CACHE_KEY, JSON.stringify(cached))
  return cached
}

export function getCachedProfile() {
  return JSON.parse(localStorage.getItem(USER_CACHE_KEY) || 'null')
}

export async function loadCurrentProfile() {
  const { data: { user }, error: userError } = await supabase.auth.getUser()
  if (userError || !user) {
    cacheProfile(null)
    return { user: null, profile: null, error: userError || new Error('Session Supabase absente') }
  }

  let { data: profile, error } = await supabase
    .from('utilisateurs')
    .select('id, auth_user_id, prenom, role, initiales, email, actif')
    .eq('auth_user_id', user.id)
    .eq('actif', true)
    .maybeSingle()

  if (!profile && user.email) {
    await supabase.rpc('link_current_user_profile')

    const fallback = await supabase
      .from('utilisateurs')
      .select('id, auth_user_id, prenom, role, initiales, email, actif')
      .eq('email', user.email.toLowerCase())
      .eq('actif', true)
      .maybeSingle()

    profile = fallback.data
    error = fallback.error

    if (profile && !profile.auth_user_id) profile = { ...profile, auth_user_id: user.id }
  }

  if (error || !profile) {
    cacheProfile(null)
    return { user, profile: null, error: error || new Error('Profil applicatif introuvable ou inactif') }
  }

  return { user, profile: cacheProfile(profile), error: null }
}

export async function signOut() {
  await supabase.auth.signOut()
  cacheProfile(null)
}
