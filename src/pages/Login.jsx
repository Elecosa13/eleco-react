import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'

export default function Login() {
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [mdp, setMdp] = useState('')
  const [erreur, setErreur] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleLogin(e) {
    e.preventDefault()
    setLoading(true)
    setErreur('')

    try {
      // Authentifier avec Supabase Auth
      const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password: mdp
      })

      if (authError) {
        setErreur('Email ou mot de passe incorrect.')
        setLoading(false)
        return
      }

      // Récupérer les données utilisateur depuis la table utilisateurs
      const { data: userData, error: userError } = await supabase
        .from('utilisateurs')
        .select('*')
        .eq('email', email.toLowerCase().trim())
        .eq('actif', true)
        .single()

      if (userError || !userData) {
        setErreur('Utilisateur non trouvé ou inactif.')
        setLoading(false)
        return
      }

      // Sauvegarder les données utilisateur
      localStorage.setItem('eleco_user', JSON.stringify({
        id: userData.id,
        prenom: userData.prenom,
        role: userData.role,
        initiales: userData.initiales,
        email: userData.email
      }))

      navigate(userData.role === 'admin' ? '/admin' : '/employe')
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
          <input type="email" placeholder="votre@email.com" value={email} onChange={e => setEmail(e.target.value)} autoCapitalize="none" required />
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
