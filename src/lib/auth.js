import { supabase } from './supabase'
import { diag } from './diagnostics'
import { safeLocalStorage } from './safe-browser'

const USER_CACHE_KEY = 'eleco_user'
const PROFILE_FIELDS_V1 = 'id, nom, role, email, actif'
const PROFILE_FIELDS_WITH_AUTH_LINK = 'id, auth_user_id, prenom, role, initiales, email, actif'

export class AuthProfileError extends Error {
  constructor(message, code, cause) {
    super(message)
    this.name = 'AuthProfileError'
    this.code = code
    this.cause = cause
  }
}

export function cacheProfile(profile) {
  if (!profile) {
    safeLocalStorage.removeItem(USER_CACHE_KEY)
    return null
  }

  const cached = {
    id: profile.id,
    auth_user_id: profile.auth_user_id,
    prenom: profile.prenom || profile.nom || '',
    role: profile.role,
    initiales: profile.initiales || '',
    email: profile.email
  }
  safeLocalStorage.setJSON(USER_CACHE_KEY, cached)
  return cached
}

export function getCachedProfile() {
  return safeLocalStorage.getJSON(USER_CACHE_KEY, null)
}

export async function loadCurrentProfile() {
  diag('auth', 'loadCurrentProfile start')
  const { data: { user }, error: userError } = await supabase.auth.getUser()
  if (userError || !user) {
    cacheProfile(null)
    diag('auth', 'no Supabase user', userError, 'warn')
    return {
      user: null,
      profile: null,
      error: new AuthProfileError('Session Supabase absente.', 'NO_AUTH_SESSION', userError)
    }
  }

  diag('auth', 'Supabase user loaded', { userId: user.id })

  const normalizeProfile = profile => profile
    ? {
      ...profile,
      auth_user_id: profile.auth_user_id || user.id,
      prenom: profile.prenom || profile.nom || '',
      initiales: profile.initiales || ''
    }
    : null

  const loadProfileByAuthUserId = () => supabase
    .from('utilisateurs')
    .select(PROFILE_FIELDS_WITH_AUTH_LINK)
    .eq('auth_user_id', user.id)
    .eq('actif', true)
    .maybeSingle()

  const loadProfileById = () => supabase
    .from('utilisateurs')
    .select(PROFILE_FIELDS_V1)
    .eq('id', user.id)
    .eq('actif', true)
    .maybeSingle()

  const loadProfileByEmail = () => supabase
    .from('utilisateurs')
    .select(PROFILE_FIELDS_V1)
    .eq('email', user.email?.toLowerCase() || '')
    .eq('actif', true)
    .maybeSingle()

  let { data: profile, error } = await loadProfileByAuthUserId()

  if (error && error.code === 'PGRST204') {
    const byId = await loadProfileById()
    profile = byId.data
    error = byId.error
  }

  if (!profile && !error) {
    const byId = await loadProfileById()
    profile = byId.data
    error = byId.error
  }

  if (!profile && !error && user.email) {
    const byEmail = await loadProfileByEmail()
    profile = byEmail.data
    error = byEmail.error
  }

  if (error) {
    cacheProfile(null)
    return {
      user,
      profile: null,
      error: new AuthProfileError('Impossible de charger le profil applicatif.', 'PROFILE_LOAD_FAILED', error)
    }
  }

  if (!profile) {
    const { error: linkError } = await supabase.rpc('link_current_user_profile')

    if (linkError && linkError.code !== 'PGRST202') {
      cacheProfile(null)
      return {
        user,
        profile: null,
        error: new AuthProfileError('Aucun profil actif ne peut etre lie a ce compte Supabase.', 'PROFILE_LINK_FAILED', linkError)
      }
    }

    const linked = await loadProfileByAuthUserId()
    profile = linked.data
    error = linked.error
  }

  if (error) {
    cacheProfile(null)
    return {
      user,
      profile: null,
      error: new AuthProfileError('Impossible de recharger le profil lie.', 'PROFILE_RELOAD_FAILED', error)
    }
  }

  if (!profile && user.email) {
    const { data: unlinkedProfile } = await supabase
      .from('utilisateurs')
      .select(PROFILE_FIELDS_V1)
      .eq('email', user.email.toLowerCase())
      .eq('actif', true)
      .maybeSingle()

    if (unlinkedProfile) {
      profile = unlinkedProfile
    }
  }

  if (!profile) {
    cacheProfile(null)
    return {
      user,
      profile: null,
      error: new AuthProfileError('Profil applicatif introuvable ou inactif.', 'PROFILE_NOT_FOUND')
    }
  }

  profile = normalizeProfile(profile)

  if (profile.auth_user_id !== user.id) {
    cacheProfile(null)
    return {
      user,
      profile: null,
      error: new AuthProfileError('Profil Eleco lie a un autre compte Supabase. Acces bloque.', 'PROFILE_MISMATCH')
    }
  }

  diag('auth', 'profile loaded', {
    utilisateur_id: profile.id,
    role: profile.role
  })

  return { user, profile: cacheProfile(profile), error: null }
}

export async function signOut() {
  diag('auth', 'signOut')
  await supabase.auth.signOut()
  cacheProfile(null)
}
