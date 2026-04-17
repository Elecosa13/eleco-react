import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY

function createSafeStorage() {
  const memoryStorage = new Map()
  const fallback = {
    getItem: key => memoryStorage.get(key) ?? null,
    setItem: (key, value) => {
      memoryStorage.set(key, value)
    },
    removeItem: key => {
      memoryStorage.delete(key)
    }
  }

  try {
    if (typeof window === 'undefined' || !window.localStorage) return fallback
    const testKey = '__eleco_supabase_storage_test__'
    window.localStorage.setItem(testKey, '1')
    window.localStorage.removeItem(testKey)
    return window.localStorage
  } catch (error) {
    console.warn('[supabase] localStorage indisponible, fallback memoire:', error)
    return fallback
  }
}

if (!supabaseUrl || !supabaseKey) {
  console.error('Configuration Supabase manquante: VITE_SUPABASE_URL et VITE_SUPABASE_ANON_KEY doivent être définies.')
  throw new Error('Configuration Supabase manquante')
}

export const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    storage: createSafeStorage()
  }
})
