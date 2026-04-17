import { createClient } from '@supabase/supabase-js'
import { safeLocalStorage } from './safe-browser'
import { diag } from './diagnostics'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY

// If env vars are missing, return a safe noop client so React can still mount.
// The auth flow will detect the missing session and surface an error via AuthProvider.
function createNoopClient() {
  diag('boot', 'Supabase non configure — VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY manquantes', null, 'error')
  const configError = new Error('Configuration Supabase manquante')

  // Proxy that allows arbitrary chaining and resolves to { data: null, error } when awaited.
  function makeQueryProxy() {
    const settled = Promise.resolve({ data: null, error: configError })
    return new Proxy(settled, {
      get(target, prop) {
        if (prop in target) return target[prop].bind(target)
        return () => makeQueryProxy()
      }
    })
  }

  return {
    auth: {
      getUser: () => Promise.resolve({ data: { user: null }, error: configError }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
      signOut: () => Promise.resolve({ error: null })
    },
    from: () => makeQueryProxy(),
    rpc: () => makeQueryProxy()
  }
}

export const supabase = (supabaseUrl && supabaseKey)
  ? createClient(supabaseUrl, supabaseKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        storage: safeLocalStorage.adapter
      }
    })
  : createNoopClient()
