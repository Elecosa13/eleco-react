import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth-context'

function authErrorMessage(error) {
  if (!error) return 'Connexion impossible.'

  const causeMessage = error.cause?.message ? ` (${error.cause.message})` : ''

  if (error.code === 'NO_AUTH_SESSION') {
    return 'Connexion refusee : session Supabase absente apres authentification.'
  }

  if (error.code === 'NO_LINKED_PROFILE') {
    return 'Connexion refusee : aucun profil Eleco n est lie a ce compte Supabase.'
  }

  if (error.code === 'PROFILE_LINK_FAILED') {
    return `Connexion refusee : le profil Eleco existe peut-etre, mais il n a pas pu etre lie a ce compte Supabase.${causeMessage}`
  }

  if (error.code === 'PROFILE_NOT_FOUND') {
    return 'Connexion refusee : profil applicatif introuvable ou inactif.'
  }

  if (error.code === 'PROFILE_LOAD_FAILED' || error.code === 'PROFILE_RELOAD_FAILED') {
    return `Connexion refusee : profil applicatif indisponible.${causeMessage}`
  }

  if (error.code === 'AUTH_BOOT_TIMEOUT') {
    return 'Connexion refusee : initialisation auth trop longue. Reessayez dans quelques secondes.'
  }

  return error.message || 'Connexion refusee : probleme session/auth interne.'
}

function authErrorDetails(error) {
  if (!error) return null
  return {
    message: error.message || null,
    code: error.code || null,
    status: error.status || null,
    name: error.name || null
  }
}

function isInvalidCredentialsError(error) {
  const message = (error?.message || '').toLowerCase()
  return error?.code === 'invalid_credentials' || message.includes('invalid login credentials')
}

function signInErrorMessage(error) {
  const message = (error?.message || '').toLowerCase()

  if (isInvalidCredentialsError(error)) {
    return 'Email ou mot de passe incorrect.'
  }

  if (error?.code === 'email_not_confirmed' || message.includes('email not confirmed')) {
    return 'Compte Supabase non confirme. Verifiez la confirmation email dans Supabase Auth.'
  }

  if (error?.code === 'MISSING_SUPABASE_CONFIG' || message.includes('configuration supabase')) {
    return 'Configuration Supabase manquante ou invalide.'
  }

  if (message.includes('invalid api key') || message.includes('jwt') || error?.status === 401 || error?.status === 403) {
    return `Supabase refuse la cle d acces: ${error.message}`
  }

  if (message.includes('failed to fetch') || message.includes('network') || error?.status >= 500) {
    return `Supabase indisponible: ${error.message}`
  }

  return error?.message ? `Erreur Supabase Auth: ${error.message}` : 'Erreur Supabase Auth inconnue.'
}

export default function Login() {
  const navigate = useNavigate()
  const { initializing, role, revalidate } = useAuth()
  const [email, setEmail] = useState('')
  const [mdp, setMdp] = useState('')
  const [erreur, setErreur] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (initializing) return
    if (role === 'admin') navigate('/admin', { replace: true })
    if (role === 'employe') navigate('/employe', { replace: true })
  }, [initializing, role, navigate])

  async function handleLogin(e) {
    e.preventDefault()
    if (loading) return

    const loginEmail = email.trim()

    setLoading(true)
    setErreur('')

    try {
      const authResponse = await supabase.auth.signInWithPassword({
        email: loginEmail,
        password: mdp
      })
      const { data: authData, error: authError } = authResponse

      console.info('[auth] Reponse signInWithPassword:', {
        email: loginEmail,
        hasSession: Boolean(authData?.session),
        hasUser: Boolean(authData?.user),
        userId: authData?.user?.id || null,
        error: authErrorDetails(authError),
        responseKeys: Object.keys(authResponse || {})
      })

      if (authError) {
        console.error('[auth] Echec signInWithPassword:', {
          message: authError.message,
          code: authError.code,
          status: authError.status,
          response: authResponse
        })
        setErreur(signInErrorMessage(authError))
        setLoading(false)
        return
      }

      const { user, profile, error: profileError } = await revalidate()
      if (profileError || !profile) {
        await supabase.auth.signOut()
        console.error('[auth] Profil refuse apres signIn reussi:', {
          message: profileError?.message || null,
          code: profileError?.code || null,
          cause: authErrorDetails(profileError?.cause),
          hasUser: Boolean(user),
          hasProfile: Boolean(profile)
        })
        setErreur(authErrorMessage(profileError))
        setLoading(false)
        return
      }

      console.info('[auth] Login valide:', {
        supabase_user_id: user.id,
        utilisateur_id: profile.id,
        role: profile.role
      })

      navigate(profile.role === 'admin' ? '/admin' : '/employe', { replace: true })
    } catch (err) {
      setErreur('Une erreur est survenue lors de la connexion.')
      console.error('Erreur de login:', err)
    }

    setLoading(false)
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '32px 20px', background: '#f5f5f5' }}>
      <img src="/logo.png" alt="Eleco SA" style={{ width: '100px', marginBottom: '10px' }} />
      <div style={{ fontSize: '18px', fontWeight: 600, marginBottom: '2px' }}>Eleco SA</div>
      <div style={{ fontSize: '13px', color: '#888', marginBottom: '24px' }}>Électricité générale</div>
      <form onSubmit={handleLogin} style={{ background: 'white', borderRadius: '12px', border: '1px solid #e2e2e2', padding: '24px', width: '100%', maxWidth: '310px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
        <div style={{ fontSize: '15px', fontWeight: 600, textAlign: 'center' }}>Connexion</div>
        <div className="form-group">
          <label>Email</label>
          <input type="email" placeholder="prenom@eleco.ch" value={email} onChange={e => setEmail(e.target.value)} autoCapitalize="none" required />
        </div>
        <div className="form-group">
          <label>Mot de passe</label>
          <input type="password" placeholder="••••••••" value={mdp} onChange={e => setMdp(e.target.value)} required />
        </div>
        {erreur && <div style={{ background: '#FCEBEB', border: '1px solid #f09595', borderRadius: '6px', padding: '9px 12px', fontSize: '12px', color: '#A32D2D' }}>{erreur}</div>}
        <button type="submit" className="btn-primary" disabled={loading}>{loading ? 'Connexion...' : 'Se connecter'}</button>
      </form>
    </div>
  )
}
