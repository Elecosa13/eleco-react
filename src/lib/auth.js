import { supabase } from './supabase'
import { diag } from './diagnostics'
import { safeLocalStorage } from './safe-browser'

const USER_CACHE_KEY = 'eleco_user'
const PROFILE_FIELDS_V1 = 'id, nom, role, email, actif'

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
      prenom: profile.prenom || profile.nom || '',
      initiales: profile.initiales || ''
    }
    : null

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

  let { data: profile, error } = await loadProfileById()

  if (!profile && !error) {
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
    cacheProfile(null)
    return {
      user,
      profile: null,
      error: new AuthProfileError('Profil applicatif introuvable ou inactif.', 'PROFILE_NOT_FOUND')
    }
  }

  profile = normalizeProfile(profile)

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
